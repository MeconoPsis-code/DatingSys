# TenMatch deployment guide

The production deployment source of truth is
[`deploy/README.md`](../deploy/README.md). It contains the incident-recovery
sequence, split secret files, loopback-only infrastructure, data restore hold
points, the single-instance systemd unit, and staged Nginx/TLS configuration.

Do not use a development command on restored production data. In production,
the only permitted Prisma migration command is:

```bash
pnpm exec prisma migrate deploy
```

Never run `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, or
`prisma db seed` against the production database.

## Local development only

Requirements are Node.js 24, pnpm 11.7.0, Docker Engine, and Docker Compose.

1. Copy `.env.example` to the ignored `.env.local` and fill development-only
   values.
2. Copy `deploy/infra.env.example` to the ignored `deploy/infra.env`, replace
   every placeholder, and make the PostgreSQL/Redis/MinIO values agree with
   `.env.local`.
3. Start only the local infrastructure you need:

```bash
docker compose --env-file deploy/infra.env up -d postgres redis minio
pnpm install --frozen-lockfile
pnpm exec prisma migrate dev
pnpm dev
```

NapCat is opt-in even in development:

```bash
docker compose --env-file deploy/infra.env --profile bot up -d napcat
```

Commands that remove volumes destroy local data. Check the active Docker
context and backup target volumes before using them. Production credentials,
database dumps, MinIO objects, and files copied from the compromised server must
never be placed in this repository.
