# TenMatch production deployment artifacts

These files rebuild the application edge and process manager from trusted
source. They intentionally run **one** Next.js instance on
`127.0.0.1:3000`; `src/instrumentation.ts` starts an in-process scheduler, so
PM2 cluster mode, multiple systemd instances, and `next start` replicas are not
safe without first moving that scheduler to a distributed job runner.

## Fixed paths and accounts

| Purpose                | Path/account                                    |
| ---------------------- | ----------------------------------------------- |
| Application account    | `tenmatch` (system user, no interactive login)  |
| Application checkout   | `/srv/tenmatch/app`                             |
| Infrastructure secrets | `/etc/tenmatch/infra.env` (`root:root`, `0600`) |
| Application secrets    | `/etc/tenmatch/app.env` (`root:root`, `0600`)   |
| systemd unit           | `/etc/systemd/system/tenmatch.service`          |
| Nginx site             | `/etc/nginx/sites-available/10match.date`       |
| Nginx proxy snippet    | `/etc/nginx/snippets/tenmatch-proxy.conf`       |
| ACME webroot           | `/var/www/certbot`                              |

Render `deploy/infra.env.example` and `deploy/app.env.example` separately on a
trusted machine. Replace every placeholder, generate every secret independently,
and never copy an environment file from the compromised host. Do not leave
`${...}` expressions in either installed file: Docker Compose and systemd do not
expand one variable from another in these files.

The split is a security boundary. Docker Compose receives `infra.env`, which
contains PostgreSQL, Redis, MinIO root, and NapCat initialization credentials.
The Next.js process receives only `app.env`, which contains runtime connection
URLs and a bucket-scoped MinIO account. Never merge the files or put real values
in the repository.

## 0. Reset and isolate the instance

Treat the old root filesystem and every secret that was present on it as
compromised. Reinstall the system disk from Alibaba's official Ubuntu image;
do not restore an operating-system snapshot, old Docker volume, `/etc`, home
directory, executable, package cache, SSH host key, TLS private key, or `.env`
file from the old host. Restore only the reviewed PostgreSQL data-only archive
and MinIO business objects described below.

Before the first boot, configure the Alibaba firewall to allow TCP/22 only from
the administrator's current public IP. Keep TCP/80 and TCP/443 disabled and
deny every other inbound port. Use a newly generated SSH key, fully update the
OS, and install Git, Node.js 24, pnpm 11, Docker Engine/Compose, Nginx, Certbot,
and `mc` from their trusted upstream repositories. After key login works in a
second terminal, disable SSH password authentication and direct root login.

Rotate, rather than copy, every credential that the old host could read:
Alibaba/API credentials, SSH keys, database and Redis passwords, MinIO root and
application keys, JWT/image-proxy secrets, NapCat/bot tokens, SMTP or Resend
credentials, maintenance bypass tokens, and the TLS certificate. Changing the
JWT secret invalidates old sessions. Because password hashes and user data may
have been exposed, record the incident and plan a user passcode reset and
notification appropriate to the data involved.

## 1. Create the service account and directories

Run on the clean Ubuntu host from an administrative account:

```bash
sudo useradd --system --create-home --home-dir /srv/tenmatch \
  --shell /usr/sbin/nologin tenmatch
sudo install -d -o tenmatch -g tenmatch -m 0750 /srv/tenmatch/app
sudo install -d -o root -g root -m 0700 /etc/tenmatch
sudo install -d -o www-data -g www-data -m 0755 \
  /var/www/certbot/.well-known/acme-challenge
```

Copy or clone only the trusted repository into `/srv/tenmatch/app`, verify the
expected Git commit, and make `tenmatch:tenmatch` its owner. Do not transfer old
`.env*`, `.next`, `node_modules`, process-manager files, or server-side Git
credentials.

Install both rendered files for root-only access. systemd reads `app.env`
before dropping privileges to `tenmatch`:

```bash
sudo install -o root -g root -m 0600 /path/to/filled-infra.env \
  /etc/tenmatch/infra.env
sudo install -o root -g root -m 0600 /path/to/filled-app.env \
  /etc/tenmatch/app.env
sudo grep -nE 'REPLACE|change-me|(^|=)(minioadmin|date_dev_password)($|[[:space:]])' \
  /etc/tenmatch/infra.env /etc/tenmatch/app.env
```

The final `grep` must print nothing. Do not use the same value for unrelated
secrets. `DATABASE_URL` and `REDIS_URL` must repeat the corresponding URL-safe
hex passwords from `infra.env`; all other application secrets must be distinct.
The systemd unit additionally validates `app.env` before every start and forces
`NODE_ENV=production`, `HOSTNAME=127.0.0.1`, and `PORT=3000`.

## 2. Start only recovery-safe infrastructure

Validate Compose interpolation, then start PostgreSQL, Redis, and MinIO. Do not
start NapCat during data recovery. The template keeps
`INFRA_RESTART_POLICY=no`, so a bad restore or unexpected reboot cannot
automatically bring partially recovered services back up:

```bash
cd /srv/tenmatch/app
sudo docker compose --env-file /etc/tenmatch/infra.env config --quiet
sudo docker compose --env-file /etc/tenmatch/infra.env \
  up -d postgres redis minio
sudo docker compose --env-file /etc/tenmatch/infra.env ps
sudo docker inspect --format '{{.Name}} restart={{.HostConfig.RestartPolicy.Name}}' \
  date-postgres date-redis date-minio
```

All three restart policies must report `no` during recovery. Wait for their
health checks before running migrations or restoring data. Keep their ports out
of the Alibaba firewall; Compose binds them to `127.0.0.1` only.

## 3. Install, migrate, build, and install the unit

Node.js and pnpm must come from a trusted package repository. The unit expects
Node at `/usr/bin/node`; verify that path before enabling it. Build as the
unprivileged account while loading the production environment because
`NEXT_PUBLIC_*` values are embedded at build time. `systemd-run` reads the
environment file as data rather than sourcing secrets as shell code:

```bash
command -v node
command -v pnpm
sudo systemd-run --wait --pipe --collect --unit=tenmatch-build \
  --uid=tenmatch --gid=tenmatch \
  --working-directory=/srv/tenmatch/app \
  --property=EnvironmentFile=/etc/tenmatch/app.env \
  --setenv=NODE_ENV=production \
  /usr/bin/bash -c '
  pnpm install --frozen-lockfile
  pnpm exec prisma generate
  pnpm exec prisma migrate deploy
  pnpm lint
  pnpm test
  pnpm build
'
sudo install -d -o tenmatch -g tenmatch -m 0700 \
  /srv/tenmatch/app/.next/cache
sudo install -o root -g root -m 0644 \
  /srv/tenmatch/app/deploy/systemd/tenmatch.service \
  /etc/systemd/system/tenmatch.service
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/tenmatch.service
```

Do not run `prisma migrate dev`, `prisma migrate reset`, or the seed command in
production. This is a recovery hold point: leave `tenmatch.service` stopped,
restore and validate the PostgreSQL data-only dump and MinIO objects, and only
then enable the application.

### Restore the PostgreSQL data-only archive

This incident's validated archive is `date-system-data-valid.dump`, length
18,636,632 bytes, SHA-256
`2120f110362c8671835d4de7243ac2d1958c0fba595d4f29b683aa67b0d92435`.
Verify those values again on the trusted PC before transferring it. On the new
host, create `/home/admin/recovery` as `admin` with mode `0700`, copy the archive
there with `scp -o ForwardAgent=no`, then verify it again:

```bash
cd /home/admin/recovery
test "$(stat -c %s date-system-data-valid.dump)" = 18636632
test "$(sha256sum date-system-data-valid.dump | cut -d ' ' -f 1)" = \
  2120f110362c8671835d4de7243ac2d1958c0fba595d4f29b683aa67b0d92435
sudo docker cp date-system-data-valid.dump \
  date-postgres:/tmp/date-system-data-valid.dump
sudo docker exec date-postgres pg_restore -l \
  /tmp/date-system-data-valid.dump | less
```

The target must be the fresh schema created by `prisma migrate deploy`; no
business table may already contain rows. Restore in one transaction, with
constraints active and any error treated as fatal. Do not add
`--disable-triggers` merely to force a failing archive into the database:

```bash
sudo docker exec date-postgres pg_restore \
  -U date_admin -d date_system \
  --data-only --no-owner --no-privileges \
  --exit-on-error --single-transaction \
  /tmp/date-system-data-valid.dump
sudo docker exec date-postgres \
  psql -U date_admin -d date_system -v ON_ERROR_STOP=1 \
  -c 'ANALYZE;'
sudo docker exec date-postgres \
  psql -U date_admin -d date_system -v ON_ERROR_STOP=1 -c \
  "SELECT 'users' AS table_name, count(*) FROM users
   UNION ALL SELECT 'profiles', count(*) FROM profiles
   UNION ALL SELECT 'profile_photos', count(*) FROM profile_photos
   UNION ALL SELECT 'reports', count(*) FROM reports
   UNION ALL SELECT 'announcements', count(*) FROM announcements
   UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;"
```

Save the resulting counts in the incident record and inspect representative
accounts, roles, announcements, audit entries, and photo object keys. Treat all
restored text and image content as untrusted user input; do not restore SQL,
extensions, functions, system accounts, or executable files from the old host.

Before enabling the application, use the MinIO root account only from the local
host or an SSH tunnel to create the bucket-scoped application identity. The
policy is committed at `deploy/minio-app-policy.json`:

```bash
read -r -p 'New MinIO root user: ' MINIO_ADMIN_USER
read -r -s -p 'New MinIO root password: ' MINIO_ADMIN_PASSWORD
printf '\n'
read -r -p 'Bucket-scoped app access key: ' APP_ACCESS_KEY
read -r -s -p 'Bucket-scoped app secret key: ' APP_SECRET_KEY
printf '\n'
mc alias set recovery-root http://127.0.0.1:9000 \
  "$MINIO_ADMIN_USER" "$MINIO_ADMIN_PASSWORD"
mc mb --ignore-existing recovery-root/date-photos
mc admin user add recovery-root "$APP_ACCESS_KEY" "$APP_SECRET_KEY"
mc admin policy create recovery-root tenmatch-app \
  /srv/tenmatch/app/deploy/minio-app-policy.json
mc admin policy attach recovery-root tenmatch-app --user "$APP_ACCESS_KEY"
mc admin user info recovery-root "$APP_ACCESS_KEY"
mc alias remove recovery-root
unset MINIO_ADMIN_USER MINIO_ADMIN_PASSWORD APP_ACCESS_KEY APP_SECRET_KEY
```

`APP_ACCESS_KEY` and `APP_SECRET_KEY` must match `MINIO_ACCESS_KEY` and
`MINIO_SECRET_KEY` in `app.env`. They must not match the root credentials in
`infra.env`. The commands remove the root alias and shell variables after this
step so the administrator secret is not left in `mc` configuration or history.

Restore the reviewed local object directory through an SSH tunnel using the
bucket-scoped application identity, not the MinIO root identity. Keep this
PowerShell tunnel open in one window:

```powershell
ssh -T -N -o ForwardAgent=no -o ExitOnForwardFailure=yes `
  -L 19000:127.0.0.1:9000 aliyun-ubuntu
```

In another PowerShell window, set `$Mc`, `$PhotoDir`, `$AppAccessKey`, and
`$AppSecretKey` to the trusted local tool/path and new scoped credentials, then
mirror without `--remove` and compare both object count and byte total:

```powershell
& $Mc alias set recovery-app http://127.0.0.1:19000 `
  $AppAccessKey $AppSecretKey
& $Mc mirror --overwrite --retry --summary `
  $PhotoDir recovery-app/date-photos
if ($LASTEXITCODE -ne 0) { throw "MinIO restore failed" }

$LocalFiles = @(Get-ChildItem -LiteralPath $PhotoDir -Recurse -File)
$RemoteObjects = @(
  & $Mc ls --recursive --json recovery-app/date-photos |
    ForEach-Object { $_ | ConvertFrom-Json } |
    Where-Object { $_.status -eq "success" -and $_.type -eq "file" }
)
$LocalBytes = ($LocalFiles | Measure-Object Length -Sum).Sum
$RemoteBytes = ($RemoteObjects | Measure-Object size -Sum).Sum
if ($LocalFiles.Count -ne $RemoteObjects.Count -or
    $LocalBytes -ne $RemoteBytes) {
  throw "MinIO restore count or size mismatch"
}
& $Mc alias remove recovery-app
```

Run an antivirus scan over the local object backup before this upload and
manually open a sample of each expected image type. Do not upload old MinIO
configuration, IAM metadata, binaries, plugins, or container volumes.

After the PostgreSQL data-only dump and MinIO objects have been restored and
verified, change `INFRA_RESTART_POLICY` to `unless-stopped` in the trusted
rendered infrastructure file, reinstall it at `/etc/tenmatch/infra.env`, and
apply the new policy:

```bash
cd /srv/tenmatch/app
sudo docker compose --env-file /etc/tenmatch/infra.env \
  up -d postgres redis minio
sudo docker inspect --format '{{.Name}} restart={{.HostConfig.RestartPolicy.Name}}' \
  date-postgres date-redis date-minio
sudo systemd-run --wait --pipe --collect --unit=tenmatch-env-check \
  --property=EnvironmentFile=/etc/tenmatch/app.env \
  --setenv=NODE_ENV=production \
  /usr/bin/node /srv/tenmatch/app/deploy/validate-app-env.mjs
sudo systemctl enable --now tenmatch.service
```

Do not change `NAPCAT_RESTART_POLICY` or start its opt-in `bot` profile until
the site and restored data have passed acceptance checks.

Check the single instance and its local-only listener:

```bash
systemctl status tenmatch.service --no-pager
systemctl show tenmatch.service -p MainPID -p MemoryCurrent -p TasksCurrent
pgrep -a -f 'next/dist/bin/next start'
sudo ss -lntp | grep ':3000'
curl --fail --show-error http://127.0.0.1:3000/api/health
journalctl -u tenmatch.service -n 100 --no-pager
```

There must be one matching Next process, and port 3000 must be bound only to
`127.0.0.1`.

### MinIO residual-risk boundary

The Compose file pins the final official MinIO Community container instead of
using `latest`. That upstream is now source-only/archived, and the final open
source release remains affected by security issues that MinIO patched only in
AIStor, including
[GHSA-hv4r-mvr4-25vw](https://github.com/minio/minio/security/advisories/GHSA-hv4r-mvr4-25vw).
Building the October 2025 community source does not fix the later 2026 issues.

For this deployment, the risk is contained rather than misrepresented as
patched: ports 9000/9001 are loopback-only, Alibaba must not expose them, the
application uses a new bucket-scoped identity, the root identity is absent from
the app process, the container is memory/CPU/PID limited, and off-host object
backups remain authoritative. Do not enable OIDC, STS/service accounts,
replication, Snowball extraction, or S3 Select. Replacing this archived server
with a maintained S3-compatible backend is a separate migration that must be
integration-tested before production; do not perform an untested in-place
substitution during incident recovery.

## 4. Stage Nginx and obtain a new certificate

Install the shared proxy snippet and the HTTP-only site first:

```bash
sudo install -o root -g root -m 0644 \
  /srv/tenmatch/app/deploy/nginx/snippets/tenmatch-proxy.conf \
  /etc/nginx/snippets/tenmatch-proxy.conf
sudo install -o root -g root -m 0644 \
  /srv/tenmatch/app/deploy/nginx/10match.date.http.conf \
  /etc/nginx/sites-available/10match.date
sudo ln -sfn /etc/nginx/sites-available/10match.date \
  /etc/nginx/sites-enabled/10match.date
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

At this point open TCP/80 in the Alibaba firewall and obtain a **new**
certificate. Do not restore the old host's TLS private key:

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d 10match.date -m YOUR_EMAIL --agree-tos --no-eff-email
```

After `/etc/letsencrypt/live/10match.date/` exists, switch atomically to the TLS
site, test it, and only then open TCP/443:

```bash
sudo install -o root -g root -m 0644 \
  /srv/tenmatch/app/deploy/nginx/10match.date.https.conf \
  /etc/nginx/sites-available/10match.date
sudo nginx -t
sudo systemctl reload nginx
curl --fail --show-error --resolve 10match.date:443:127.0.0.1 \
  https://10match.date/maintenance -o /dev/null
curl --fail --show-error --resolve 10match.date:443:127.0.0.1 \
  https://10match.date/api/health -o /dev/null
sudo certbot renew --dry-run
```

The loopback TLS health request is allowed because Nginx sees `127.0.0.1`. From
a separate workstation, confirm that the same endpoint is not public:

```bash
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  https://10match.date/api/health
```

The status from the separate workstation must be `403`. Use the direct loopback
request from section 3 for application monitoring. Once TLS behavior is stable,
increase HSTS from the initial one-day value to a longer period.

## 5. Deployment and rollback discipline

For each subsequent release:

1. Verify the intended Git commit and dependency lockfile on a trusted machine.
2. Back up PostgreSQL and MinIO off-host.
3. Put the application in maintenance mode and build before restarting.
4. Run `prisma migrate deploy`; never downgrade a database blindly.
5. Restart exactly this unit with `sudo systemctl restart tenmatch.service`.
6. Verify the loopback health endpoint, one process, listeners, and logs.

NapCat remains opt-in and must be the last service enabled. After the website
has passed acceptance checks, set `NAPCAT_RESTART_POLICY=unless-stopped` in
`infra.env`, configure a fresh login and tokens, and start only its profile:

```bash
sudo docker compose --env-file /etc/tenmatch/infra.env \
  --profile bot up -d napcat
sudo docker compose --env-file /etc/tenmatch/infra.env \
  --profile bot ps
```

Ports 3001 and 6099 must remain bound to `127.0.0.1`; access the WebUI only
through an SSH tunnel.

The unit is rate-limited to five failed starts in ten minutes. If it enters a
failed state, inspect `journalctl` and fix the cause before using
`sudo systemctl reset-failed tenmatch.service`; do not work around the guard by
adding another process manager.

If a CDN or load balancer is introduced later, do not simply change
`X-Forwarded-For` to `$proxy_add_x_forwarded_for`. First configure Nginx
`real_ip` with the provider's authenticated proxy ranges; otherwise client IPs
in audit logs become forgeable.
