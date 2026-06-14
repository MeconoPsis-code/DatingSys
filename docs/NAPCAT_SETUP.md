# NapCat QQ Bot — Integration Guide

This guide explains how to connect the NapCat QQ bot with the TenMatch web application, from start to finish.

---

## Architecture Overview

```
┌──────────────┐     HTTP POST (webhook)     ┌──────────────────────┐
│              │ ──────────────────────────▶  │                      │
│   NapCat     │   (events: messages, join)   │   Next.js App        │
│   (Docker)   │                              │   (localhost:3000)   │
│              │  ◀──────────────────────────  │                      │
│  port 3001   │     HTTP POST (API calls)    │                      │
│  port 6099   │   (send_group_msg, etc.)     │                      │
└──────────────┘                              └──────────────────────┘
```

**Two communication channels:**

| Direction | Protocol | Purpose |
|-----------|----------|---------|
| NapCat → App | HTTP POST (Webhook) | Push QQ events (messages, member joins/leaves) to your app |
| App → NapCat | HTTP POST (OneBot API) | Send messages, query member info, set group cards |

---

## Prerequisites

- **Docker Desktop** installed and running
- A **dedicated QQ account** for the bot (separate from your personal account)
- The QQ bot account logged into the **QQ mobile app** on your phone (for QR code scanning)

---

## Step 1: Configure Environment Variables

### 1.1 Generate Tokens

You need **two separate tokens** for security:

| Token | Purpose | Used By |
|-------|---------|---------|
| `NAPCAT_ACCESS_TOKEN` | Authenticates your app when calling NapCat API | App → NapCat |
| `BOT_WEBHOOK_TOKEN` | Verifies webhook requests via HMAC-SHA1 signature | NapCat → App |

Generate random tokens (or use any strong random string):

```powershell
# PowerShell: Generate random tokens
[Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

### 1.2 Set Environment Variables

Add the following to your `.env` file:

```env
# ─── QQ Bot ───────────────────────────────────────────
BOT_INTERNAL_SECRET=change-me-in-production    # Internal API auth
BOT_PROVIDER=napcat                            # Bot provider (don't change)
BOT_TARGET_GROUP_ID=922673885                  # Your QQ group number
BOT_WEBHOOK_TOKEN=your-random-webhook-token    # HMAC signature secret
BOT_QQ_NUMBER=3450526668                       # Bot's QQ number

# ─── NapCat HTTP API ──────────────────────────────────
NAPCAT_HTTP_BASE_URL=http://127.0.0.1:3001     # NapCat API endpoint
NAPCAT_ACCESS_TOKEN=your-random-api-token      # Auth for API calls
```

> **How to find your QQ group number:**
> Right-click the group in QQ → Group Info (群资料) → The number shown at the top.

---

## Step 2: Start Docker Services

```bash
docker compose up -d
```

Verify the NapCat container is running:

```bash
docker compose ps
```

You should see `date-napcat` with status `Up` and ports `3001` and `6099` mapped.

---

## Step 3: Log In to NapCat WebUI

1. Open **http://localhost:6099** in your browser
2. You'll see the NapCat WebUI login page
3. Set an admin password for the WebUI (first time only)
4. The system will display a **QR code**
5. Open the **QQ mobile app** on your phone, logged into the **bot account**
6. Scan the QR code to authorize the bot
7. Wait for "Login successful" confirmation

> [!TIP]
> If the QR code expires, click "Refresh" to get a new one. You must scan within ~60 seconds.

> [!WARNING]
> Use a **dedicated bot account**, not your personal QQ account. The bot will send messages on behalf of this account.

---

## Step 4: Configure NapCat Network Adapters

In the NapCat WebUI, navigate to **网络配置** (Network Config). You need to add **two adapters**:

### Adapter 1: HTTP Server (App → NapCat)

This allows your Next.js app to call NapCat's API (send messages, query users, etc.).

Click **添加** and configure:

| Setting | Value | Notes |
|---------|-------|-------|
| **启用** | ✅ ON | Enable the adapter |
| **开启Debug** | ✅ ON | Helpful during development |
| **名称** | `http-api` | Display name |
| **Host** | `0.0.0.0` | ⚠️ Must be `0.0.0.0`, NOT `127.0.0.1` — NapCat runs in Docker |
| **Port** | `3001` | Matches docker-compose port mapping |
| **启用CORS** | ✅ ON | Allow cross-origin requests |
| **Token** | Same as `NAPCAT_ACCESS_TOKEN` in `.env` | Auth for incoming API calls |

Click **保存** (Save).

> [!IMPORTANT]
> **Host must be `0.0.0.0`**. Since NapCat runs inside a Docker container, binding to `127.0.0.1` would only allow connections from inside the container. Your app runs on the host machine and connects via Docker's port mapping, so `0.0.0.0` is required.

### Adapter 2: HTTP Client / Webhook (NapCat → App)

This makes NapCat push QQ events (messages, member joins) to your app's webhook endpoint.

Click **添加** and configure:

| Setting | Value | Notes |
|---------|-------|-------|
| **启用** | ✅ ON | Enable the adapter |
| **开启Debug** | ✅ ON | Helpful during development |
| **名称** | `webhook-to-app` | Display name |
| **URL** | `http://host.docker.internal:3000/api/bot/napcat/webhook` | Your app's webhook endpoint |
| **上报自身消息** | ❌ OFF | Don't echo the bot's own messages back |
| **消息格式** | `Array` | Either works, our code handles both |
| **Token** | Same as `BOT_WEBHOOK_TOKEN` in `.env` | Used for HMAC-SHA1 signature |

Click **保存** (Save).

> [!IMPORTANT]
> **URL uses `host.docker.internal`**, not `localhost`. This is Docker's special hostname that resolves to the host machine's IP, allowing the NapCat container to reach your Next.js dev server running on the host.

### Verify Configuration

After saving both adapters, the network config page should show:

- **1 HTTP服务器** (HTTP Server) — `http-api`
- **1 HTTP客户端** (HTTP Client) — `webhook-to-app`

---

## Step 5: Add Bot to QQ Group

1. Open QQ on your phone (bot account) or desktop
2. Join or create the target QQ group (the one matching `BOT_TARGET_GROUP_ID`)
3. Ensure the bot account is a **member** of the group

---

## Step 6: Initialize Database

If this is a fresh setup, run the database migration:

```bash
npx prisma migrate dev
```

Optionally seed test data:

```bash
npx prisma db seed
```

---

## Step 7: Start the Dev Server

```bash
pnpm dev
```

The app will be available at **http://localhost:3000**.

---

## Step 8: Test the Bot

1. Open the QQ group (from your **personal account**, not the bot)
2. Send `/signup` in the group chat
3. **Expected behavior:**
   - The bot replies with a message mentioning you
   - "注册申请已受理，验证码已发送至你的 QQ 邮箱"
   - A verification code email arrives at `{yourQQ}@qq.com`
4. **Check your terminal** — you should see:
   ```
   POST /api/bot/napcat/webhook 200
   INFO: Bot config loaded
   INFO: Fetched group member info
   INFO: Avatar synced
   ```

---

## Signup Flow

After the bot responds, complete registration:

1. Open **http://localhost:3000/signup**
2. Enter the **6-character verification code** from your QQ email
3. Set a password
4. Registration complete — your QQ portrait and nickname are automatically synced

---

## Troubleshooting

### Bot doesn't respond to `/signup`

| Check | How |
|-------|-----|
| NapCat is running | `docker compose ps` → `date-napcat` status is `Up` |
| Bot is logged in | Open http://localhost:6099 → check login status |
| Adapters are enabled | WebUI → 网络配置 → both adapters show "已启用" |
| Group ID matches | `BOT_TARGET_GROUP_ID` in `.env` = your QQ group number |
| Bot is in the group | Verify in QQ that the bot account is a group member |

### Webhook returns 401 (Unauthorized)

The `BOT_WEBHOOK_TOKEN` in your `.env` must **exactly match** the Token in NapCat's HTTP Client adapter.

Authentication uses HMAC-SHA1 signature verification:
- NapCat signs the request body with the token → sends `X-Signature: sha1=...`
- Your app verifies the signature against `BOT_WEBHOOK_TOKEN`

**Fix:** Ensure both values are identical. After changing, restart both NapCat (via WebUI) and your dev server.

### NapCat shows "ECONNREFUSED"

```
Error: connect ECONNREFUSED 192.168.65.254:3000
```

This means NapCat can't reach your app. Causes:
- Your dev server (`pnpm dev`) is not running
- The webhook URL is wrong — must use `host.docker.internal`, not `localhost`
- Windows firewall is blocking port 3000

### Email not received

1. Test SMTP directly:
   ```bash
   npx tsx scripts/test-email.ts
   ```
2. Verify `.env` has correct SMTP settings:
   ```env
   EMAIL_PROVIDER=smtp
   SMTP_USER=your-email@qq.com
   SMTP_PASS=your-smtp-authorization-code  # NOT your QQ password
   ```
3. Make sure QQ Mail SMTP service is enabled:
   QQ Mail → Settings → Account → POP3/SMTP → Enable → Generate authorization code

### Chinese characters show as garbled text in terminal

This is a Windows terminal encoding issue. The actual messages sent to QQ are correct. To fix the display:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001
```

---

## Token Security Reference

| Token | Stored In | Used By | Purpose |
|-------|-----------|---------|---------|
| `NAPCAT_ACCESS_TOKEN` | `.env` + NapCat HTTP Server adapter | App → NapCat API calls | `Authorization: Bearer <token>` header |
| `BOT_WEBHOOK_TOKEN` | `.env` + NapCat HTTP Client adapter | NapCat → App webhook | HMAC-SHA1 signature in `X-Signature` header |
| `BOT_INTERNAL_SECRET` | `.env` only | Internal API routes | `x-internal-secret` header for admin APIs |

---

## Network Ports Reference

| Port | Service | Purpose |
|------|---------|---------|
| 3000 | Next.js | Web application |
| 3001 | NapCat | OneBot v11 HTTP API |
| 5432 | PostgreSQL | Database |
| 6099 | NapCat WebUI | QR code login & config |
| 6379 | Redis | Cache & rate limiting |
| 9000 | MinIO | S3 storage API |
| 9001 | MinIO | Web console |
