# TenMatch — Deployment Guide

How to deploy and run the project after `git pull`.

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** (install: `npm install -g pnpm`)
- **Docker Desktop** (for PostgreSQL, Redis, MinIO, NapCat)
- A **QQ account** for the bot (separate from your personal account)
- A **QQ email** with SMTP enabled (for sending verification codes)

---

## Step 1: Install Dependencies

```bash
git clone <repo-url>
cd date-system
pnpm install
```

---

## Step 2: Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

| Variable                    | Description                                               | Example                   |
| --------------------------- | --------------------------------------------------------- | ------------------------- |
| `BOT_QQ_NUMBER`             | Bot's QQ number                                           | `3450526668`              |
| `BOT_TARGET_GROUP_ID`       | Target QQ group number                                    | `922673885`               |
| `BOT_WEBHOOK_TOKEN`         | Token for NapCat webhook HMAC signature                   | `your-random-token`       |
| `NAPCAT_ACCESS_TOKEN`       | Token for calling NapCat HTTP API                         | `your-random-token`       |
| `JWT_SECRET`                | Secret for JWT authentication                             | `random-32-byte-string`   |
| `MAINTENANCE_MODE`          | Redirect normal traffic to the maintenance page           | `false`                   |
| `MAINTENANCE_BYPASS_TOKENS` | Comma-separated developer bypass tokens, server-side only | `dev-token-1,dev-token-2` |
| `SMTP_USER`                 | QQ email address for sending codes                        | `your-email@qq.com`       |
| `SMTP_PASS`                 | QQ SMTP authorization code (not your password)            | `abcdefghijklmnop`        |
| `SMTP_FROM`                 | Sender email address                                      | `your-email@qq.com`       |

> **How to get QQ SMTP authorization code:**
> QQ Mail → Settings (设置) → Account (账户) → POP3/SMTP service → Enable → Generate authorization code.

---

## Step 3: Start Docker Services

```bash
docker compose up -d
```

This starts 4 containers:

| Service    | Port        | Purpose                                  |
| ---------- | ----------- | ---------------------------------------- |
| `postgres` | 5432        | Database                                 |
| `redis`    | 6379        | Cache, rate limiting, verification codes |
| `minio`    | 9000 / 9001 | Photo storage (S3-compatible)            |
| `napcat`   | 3001 / 6099 | QQ Bot (OneBot v11)                      |

Verify all containers are running:

```bash
docker compose ps
```

---

## Step 4: Login to NapCat

1. Open **http://localhost:6099** in your browser
2. Use below command to get **your-webui-token**

```bash
docker logs date-napcat 2>&1 | Select-String "WebUi Token"
```

3. Scan the QR code with the **bot's QQ account** on your phone
4. Wait for "Login successful" status

---

## Step 5: Configure NapCat Network Adapters

In the NapCat WebUI (http://localhost:6099), go to **网络配置** and add **2 adapters**:

### Adapter 1: HTTP Server

| Setting | Value                                              |
| ------- | -------------------------------------------------- |
| 启用    | ✅ ON                                              |
| 名称    | `http-api`                                         |
| Host    | `0.0.0.0`                                          |
| Port    | `3001`                                             |
| Token   | Same value as `NAPCAT_ACCESS_TOKEN` in your `.env` |

> ⚠️ Host **must** be `0.0.0.0` (not `127.0.0.1`) since NapCat runs inside Docker.

### Adapter 2: HTTP Client (Webhook)

| Setting      | Value                                                     |
| ------------ | --------------------------------------------------------- |
| 启用         | ✅ ON                                                     |
| 名称         | `webhook-to-app`                                          |
| URL          | `http://host.docker.internal:3000/api/bot/napcat/webhook` |
| 上报自身消息 | ❌ OFF                                                    |
| Token        | Same value as `BOT_WEBHOOK_TOKEN` in your `.env`          |

Click **保存** after each adapter.

---

## Step 6: Initialize the Database

```bash
npx prisma migrate dev
```

This creates all database tables. If prompted for a migration name, enter something like `init`.

---

## Step 7: Start the Dev Server

```bash
pnpm dev
```

The app will be available at **http://localhost:3000**.

---

## Step 8: Verify the Bot

1. Add the bot QQ account to the target QQ group
2. Send `/signup` in the group
3. You should see:
   - Bot replies with a verification code message (@ mentioning you)
   - A verification code email arrives in your QQ mailbox
4. Check the terminal for `POST /api/bot/napcat/webhook 200` logs

---

## Troubleshooting

### Bot doesn't respond to `/signup`

1. Check NapCat WebUI → 猫猫日志 for errors
2. Verify NapCat network adapters are configured and enabled
3. Make sure `BOT_TARGET_GROUP_ID` in `.env` matches the group number
4. Check that the bot account is a member of the group

### Webhook returns 401

- The `BOT_WEBHOOK_TOKEN` in `.env` must match the Token in NapCat's HTTP Client adapter
- The token is used for HMAC-SHA1 signature verification

### Email not received

1. Test SMTP directly: `npx tsx scripts/test-email.ts`
2. Verify `SMTP_USER` and `SMTP_PASS` are correct
3. Make sure QQ Mail SMTP service is enabled

### Docker connection issues

- If NapCat can't reach your app: make sure the webhook URL uses `host.docker.internal`
- If your app can't reach NapCat: verify `NAPCAT_HTTP_BASE_URL=http://127.0.0.1:3001`

---

## Switching to Resend (Production)

When you have a custom domain:

1. Update `.env`:
   ```env
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_xxxxxxxxxxxx
   RESEND_FROM=noreply@yourdomain.com
   ```
2. Restart the dev server

The QQ SMTP config can remain in `.env` as a fallback — just change `EMAIL_PROVIDER` to switch.
