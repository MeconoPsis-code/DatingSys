Date / TenMatch 系统 Email SMTP 邮件推送分支项目文档

版本：v0.1
日期：2026-06-13
模块名称：Email Service / SMTP 邮件推送模块
面向对象：后端工程师、Bot 工程师、运维、测试、Vibe Coding 工具

⸻

1. 分支目标

本分支用于完善 Date / TenMatch 系统的邮件推送能力，并确保与当前 Web 系统、QQBot / NapCat 机器人分支完全适配。

当前项目已经具备基础邮件能力：

* 项目已安装 nodemailer。
* .env.example 已存在 SMTP 配置。
* src/lib/email.ts 已有 sendVerificationCode(qqNumber, code)。
* /api/auth/bot-signup 已调用 sendVerificationCode 发送注册验证码。
* /api/auth/forgot-passcode 已调用 sendVerificationCode 发送重置密码验证码。
* 项目已引入 Redis 和 BullMQ，可用于后续邮件队列。

但当前实现仍然偏简单，存在以下不足：

1. 邮件发送逻辑直接写在 src/lib/email.ts 中。
2. 没有统一 EmailService。
3. 没有邮件模板系统。
4. 没有 EmailLog 数据表。
5. 没有失败重试机制。
6. 没有邮件发送状态给 Bot 使用的统一返回结构。
7. 注册验证码、重置密码验证码使用同一个简单模板，无法区分业务场景。
8. 验证码 TTL 与产品规格需要统一为可配置。
9. 管理后台无法查看邮件发送记录。
10. Bot 指令执行结果无法精确知道邮件是否真的发送成功。

本分支目标是将当前邮件模块升级为：

EmailService + EmailTemplate + EmailLog + 可选 BullMQ 队列 + Bot 兼容返回

⸻

2. 与当前项目的适配原则

2.1 不推翻当前实现

当前项目已经有：

src/lib/email.ts
src/lib/verification.ts
src/app/api/auth/bot-signup/route.ts
src/app/api/auth/forgot-passcode/route.ts
src/app/api/auth/verify-code/route.ts
src/app/api/auth/reset-passcode/route.ts
src/lib/queue.ts

本分支不应重写整个认证系统，而应在现有基础上升级。

2.2 保持现有接口可用

以下接口必须继续可用：

POST /api/auth/bot-signup
POST /api/auth/forgot-passcode
POST /api/auth/verify-code
POST /api/auth/reset-passcode

其中：

* /api/auth/bot-signup 是 Bot 注册指令当前对接入口。
* /api/auth/forgot-passcode 是忘记密码 / 重置密码邮件入口。
* /api/auth/verify-code 是用户输入邮件验证码后的验证入口。
* /api/auth/reset-passcode 是用户通过验证后重置密码入口。

2.3 Bot 分支必须能拿到明确邮件结果

Bot 处理 /signup 和 /reset password 时，必须等待 Web 系统返回结果后再 @用户 回复。

因此邮件模块必须能让业务接口返回明确状态：

type EmailSendResult =
  | "sent"
  | "queued"
  | "failed"
  | "rate_limited"
  | "still_valid";

Bot 不应该只收到“请求已受理”，而应该知道：

* 邮件已发送。
* 邮件已进入队列。
* 邮件发送失败。
* 用户已有未过期验证码。
* 用户被限流。

2.4 邮件模块不得耦合 Bot

Email 模块不应直接调用 Bot。

正确依赖方向：

Bot 指令
  ↓
Web Auth API
  ↓
Verification Service
  ↓
Email Service
  ↓
SMTP / EmailLog / Queue

错误依赖方向：

Email Service 直接调用 Bot 回复用户

⸻

3. 当前代码现状说明

3.1 当前 SMTP 配置

.env.example 已有：

SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your-email@qq.com
SMTP_PASS=your-app-specific-password
SMTP_FROM=Date System <your-email@qq.com>

本分支应继续沿用这些变量，并新增必要配置。

3.2 当前邮件发送函数

当前存在：

sendVerificationCode(qqNumber: string, code: string)

当前行为：

* 自动拼接收件人：${qqNumber}@qq.com
* 使用 Nodemailer 发送邮件。
* 主题为 Date System 验证码。
* 同时发送 text 和 html。
* 没有写入数据库日志。
* 没有失败重试。
* 没有模板 key。
* 没有区分注册验证码和重置密码验证码。

3.3 当前验证码逻辑

当前 src/lib/verification.ts 使用 Redis 保存验证码。

当前行为：

* 生成 6 位验证码。
* 存储 key：auth:verify:${qqNumber}
* 当前 TTL 为 10 分钟。
* 当前频率限制为 60 秒。
* 验证成功后写入 auth:verified:${qqNumber}，有效 15 分钟。
* 验证码验证成功后删除验证码。

本分支建议：

* 保留 Redis 验证逻辑。
* 将 TTL 改为读取环境变量。
* 明确注册验证码和重置密码验证码可共用验证逻辑，但邮件模板必须区分。
* 后续如需要，可增加 purpose 字段区分验证码用途。

⸻

4. 分支范围

4.1 本分支负责

本分支负责实现：

1. SMTP 配置读取与校验。
2. Nodemailer Transporter 封装。
3. 统一 EmailService。
4. 邮件模板系统。
5. 注册验证码邮件模板。
6. 重置密码验证码邮件模板。
7. Bot 注册结果邮件发送适配。
8. Bot 重置密码邮件发送适配。
9. 邮件发送日志 EmailLog。
10. 邮件发送失败记录。
11. 邮件发送失败重试机制。
12. 邮件发送结果统一返回。
13. 可选 BullMQ 邮件队列。
14. 管理后台邮件日志接口。
15. 开发环境 SMTP 测试接口。
16. 测试用例。

4.2 本分支不负责

本分支不负责：

* NapCat 事件接收。
* Bot @用户 回复。
* 用户资料填写。
* 匹配算法。
* 评分系统。
* 密码重置页面 UI。
* 管理后台完整页面 UI。
* 第三方邮件平台采购。
* 域名 SPF / DKIM / DMARC 配置。

⸻

5. 推荐目录结构

建议新增或调整：

src/server/email/
  ├─ email.service.ts
  ├─ email.types.ts
  ├─ email.templates.ts
  ├─ email.renderer.ts
  ├─ email.config.ts
  ├─ smtp.client.ts
  ├─ email-log.service.ts
  ├─ email-queue.ts
  └─ templates/
      ├─ register-code.ts
      ├─ reset-passcode-code.ts
      ├─ rating-published.ts
      ├─ photo-rejected.ts
      ├─ premium-granted.ts
      ├─ sensitive-unlock-request.ts
      ├─ scorer-task-assigned.ts
      ├─ scorer-timeout.ts
      └─ admin-report-created.ts

保留兼容入口：

src/lib/email.ts

src/lib/email.ts 不再直接写 Nodemailer 业务逻辑，而是作为兼容层调用新的 EmailService。

示例：

// src/lib/email.ts
import { emailService } from "@/server/email/email.service";
export async function sendVerificationCode(
  qqNumber: string,
  code: string
): Promise<void> {
  await emailService.sendRegisterCode({
    qqNumber,
    code,
  });
}

⸻

6. 环境变量

6.1 保留现有变量

SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your-email@qq.com
SMTP_PASS=your-app-specific-password
SMTP_FROM=Date System <your-email@qq.com>

6.2 新增变量

# ─── Email Behavior ───────────────────────────────────
EMAIL_PROVIDER=smtp
EMAIL_ENABLED=true
EMAIL_SEND_MODE=direct
EMAIL_CODE_EXPIRE_MINUTES=15
EMAIL_RESET_EXPIRE_MINUTES=15
EMAIL_FROM_NAME=TenMatch
EMAIL_REPLY_TO=
# direct = 接口内直接发送
# queue = 写入队列，由 worker 发送
EMAIL_QUEUE_NAME=email-send
# ─── Email Retry ──────────────────────────────────────
EMAIL_MAX_RETRY=3
EMAIL_RETRY_DELAY_SECONDS=60
# ─── Email Test / Dev ─────────────────────────────────
EMAIL_DEV_REDIRECT_TO=
EMAIL_ALLOW_TEST_ENDPOINT=true

6.3 变量说明

变量	说明
EMAIL_PROVIDER	V1 固定为 smtp
EMAIL_ENABLED	是否启用真实邮件发送
EMAIL_SEND_MODE	direct 或 queue
EMAIL_CODE_EXPIRE_MINUTES	注册验证码有效期
EMAIL_RESET_EXPIRE_MINUTES	重置密码验证码有效期
EMAIL_FROM_NAME	发件人展示名
EMAIL_QUEUE_NAME	BullMQ 队列名称
EMAIL_MAX_RETRY	最大重试次数
EMAIL_RETRY_DELAY_SECONDS	重试间隔
EMAIL_DEV_REDIRECT_TO	开发环境邮件重定向
EMAIL_ALLOW_TEST_ENDPOINT	是否开启测试接口

⸻

7. 邮件发送模式

7.1 V1 推荐先使用 direct 模式

由于当前接口 /api/auth/bot-signup 和 /api/auth/forgot-passcode 需要立刻告诉 Bot 发送结果，V1 推荐先使用：

EMAIL_SEND_MODE=direct

direct 模式：

业务接口调用 EmailService
        ↓
EmailService 调用 SMTP
        ↓
SMTP 返回成功 / 失败
        ↓
写入 EmailLog
        ↓
接口返回明确结果给 Bot

优点：

* Bot 可以立刻知道邮件是否发送成功。
* 逻辑简单。
* 适合 MVP。

缺点：

* SMTP 慢时接口响应变慢。
* 高峰期压力较大。

7.2 queue 模式作为 V1.1 或可选能力

queue 模式：

业务接口调用 EmailService
        ↓
EmailService 写入 EmailLog + BullMQ
        ↓
接口返回 queued
        ↓
Worker 异步发送
        ↓
更新 EmailLog

优点：

* 接口响应快。
* 支持失败重试。
* 更适合大量通知。

缺点：

* Bot 只能回复“邮件已进入发送队列”，不能保证已经发送成功。
* 需要 worker 常驻运行。

7.3 Bot 适配规则

如果 EMAIL_SEND_MODE=direct：

Bot 收到：

{
  "success": true,
  "code": "REGISTER_CODE_SENT"
}

Bot 回复：

@用户 注册申请已受理，邀请码已发送至你的 QQ 邮箱：QQ号@qq.com。

如果 EMAIL_SEND_MODE=queue：

Bot 收到：

{
  "success": true,
  "code": "REGISTER_CODE_QUEUED"
}

Bot 回复：

@用户 注册申请已受理，邀请码邮件正在发送中，请稍后查看你的 QQ 邮箱：QQ号@qq.com。

如果邮件失败：

{
  "success": false,
  "code": "EMAIL_SEND_FAILED"
}

Bot 回复：

@用户 注册申请处理失败，邮件暂时无法发送，请稍后重试或联系管理员。

⸻

8. 邮件类型

8.1 V1 必须支持

type EmailTemplateKey =
  | "REGISTER_CODE"
  | "RESET_PASSCODE_CODE";

8.2 V1.1 建议支持

type EmailTemplateKey =
  | "REGISTER_CODE"
  | "RESET_PASSCODE_CODE"
  | "RATING_PUBLISHED"
  | "PHOTO_REJECTED"
  | "PREMIUM_GRANTED"
  | "SENSITIVE_UNLOCK_REQUEST"
  | "SENSITIVE_UNLOCK_APPROVED"
  | "SENSITIVE_UNLOCK_REJECTED"
  | "SCORER_TASK_ASSIGNED"
  | "SCORER_TIMEOUT"
  | "ADMIN_REPORT_CREATED"
  | "GROUP_MEMBER_LEFT_REVIEW_REQUIRED";

⸻

9. 邮件模板设计

9.1 模板统一结构

interface EmailTemplate<TData = unknown> {
  key: EmailTemplateKey;
  subject: (data: TData) => string;
  text: (data: TData) => string;
  html: (data: TData) => string;
}

9.2 注册验证码模板

模板 key：

REGISTER_CODE

参数：

interface RegisterCodeEmailData {
  qqNumber: string;
  code: string;
  expireMinutes: number;
  appName: string;
}

主题：

TenMatch 注册验证码

正文：

你正在注册 TenMatch 系统。
你的验证码是：{code}
验证码将在 {expireMinutes} 分钟后失效。
请勿将验证码告诉他人。
如果不是你本人操作，请忽略本邮件。

HTML：

<h2>TenMatch 注册验证码</h2>
<p>你正在注册 TenMatch 系统。</p>
<p>你的验证码是：</p>
<p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">{code}</p>
<p>验证码将在 {expireMinutes} 分钟后失效。</p>
<p>请勿将验证码告诉他人。</p>
<p>如果不是你本人操作，请忽略本邮件。</p>

9.3 重置密码验证码模板

模板 key：

RESET_PASSCODE_CODE

参数：

interface ResetPasscodeEmailData {
  qqNumber: string;
  code: string;
  expireMinutes: number;
  appName: string;
}

主题：

TenMatch 密码重置验证码

正文：

你正在重置 TenMatch 系统登录密码。
你的验证码是：{code}
验证码将在 {expireMinutes} 分钟后失效。
如果不是你本人操作，请立即忽略本邮件，并联系管理员检查账号安全。

HTML：

<h2>TenMatch 密码重置验证码</h2>
<p>你正在重置 TenMatch 系统登录密码。</p>
<p>你的验证码是：</p>
<p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">{code}</p>
<p>验证码将在 {expireMinutes} 分钟后失效。</p>
<p>如果不是你本人操作，请忽略本邮件，并联系管理员检查账号安全。</p>

9.4 模板安全要求

模板中不得包含：

* 明文密码。
* 密码重置 token。
* 内部接口地址。
* Bot secret。
* JWT。
* 管理后台私密链接。
* 用户敏感资料。

验证码可以出现在邮件中，但不得写入普通日志。

⸻

10. EmailService 设计

10.1 核心接口

interface SendEmailInput<TData = unknown> {
  to: string;
  templateKey: EmailTemplateKey;
  data: TData;
  purpose:
    | "register_code"
    | "reset_passcode"
    | "rating_notice"
    | "security_notice"
    | "admin_notice";
  relatedUserId?: string;
  relatedQqNumber?: string;
  metadata?: Record<string, unknown>;
}
interface SendEmailResult {
  success: boolean;
  status: "sent" | "queued" | "failed" | "disabled";
  code:
    | "EMAIL_SENT"
    | "EMAIL_QUEUED"
    | "EMAIL_DISABLED"
    | "EMAIL_SEND_FAILED"
    | "EMAIL_TEMPLATE_NOT_FOUND";
  emailLogId?: string;
  message: string;
}

10.2 Service 方法

interface EmailService {
  sendEmail<TData>(input: SendEmailInput<TData>): Promise<SendEmailResult>;
  sendRegisterCode(input: {
    qqNumber: string;
    code: string;
    relatedUserId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SendEmailResult>;
  sendResetPasscodeCode(input: {
    qqNumber: string;
    code: string;
    relatedUserId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SendEmailResult>;
  sendAdminNotice(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SendEmailResult>;
}

10.3 QQ 邮箱生成规则

function buildQqEmail(qqNumber: string): string {
  return `${qqNumber}@${process.env.QQ_EMAIL_DOMAIN || "qq.com"}`;
}

注意：

* 用户不能自定义注册邮箱。
* 注册验证码和重置密码验证码都发送到 QQ号@qq.com。
* Bot 和 EmailService 必须使用同一套邮箱生成规则。

⸻

11. SMTP Client 设计

11.1 Transporter 配置

import nodemailer from "nodemailer";
export function createSmtpTransporter() {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.qq.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

11.2 启动时校验

建议新增：

export async function verifySmtpConnection(): Promise<void> {
  const transporter = createSmtpTransporter();
  await transporter.verify();
}

可用于：

* 健康检查。
* 管理后台测试。
* 开发调试。

11.3 SMTP 配置错误处理

如果缺少：

SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM

在 EMAIL_ENABLED=true 时必须报错。

如果 EMAIL_ENABLED=false：

* 不真实发送。
* 写入 EmailLog。
* 返回 EMAIL_DISABLED。
* 开发环境可在控制台输出邮件内容，但不能输出验证码到生产日志。

⸻

12. 数据模型

12.1 新增 EmailLog

model EmailLog {
  id              String   @id @default(cuid())
  toEmail         String
  fromEmail       String?
  templateKey     String
  purpose         String
  subject         String
  status          String
  provider        String   @default("smtp")
  relatedUserId   String?
  relatedQqNumber String?
  messageId       String?
  errorCode       String?
  errorMessage    String?
  retryCount      Int      @default(0)
  maxRetry        Int      @default(3)
  nextRetryAt     DateTime?
  sentAt          DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  metadata        Json?
  @@index([toEmail])
  @@index([templateKey])
  @@index([purpose])
  @@index([status])
  @@index([relatedUserId])
  @@index([relatedQqNumber])
  @@index([createdAt])
  @@map("email_logs")
}

12.2 EmailLog 状态

type EmailLogStatus =
  | "pending"
  | "queued"
  | "sent"
  | "failed"
  | "retrying"
  | "disabled";

12.3 是否需要 EmailTemplate 表

V1 不强制建表，推荐先用代码模板。

V1.1 可增加：

model EmailTemplate {
  id          String   @id @default(cuid())
  key         String   @unique
  name        String
  subject     String
  textBody    String
  htmlBody    String?
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

V1 建议：

邮件模板先写在 TypeScript 文件里。
管理后台模板编辑放到 V1.1。

⸻

13. 与验证码逻辑的适配

13.1 当前 Redis Key

当前项目使用：

auth:verify:{qqNumber}
auth:rate:{qqNumber}
auth:verified:{qqNumber}

本分支可以继续使用。

13.2 建议改造

将 TTL 从硬编码改为环境变量：

const CODE_TTL = Number(process.env.EMAIL_CODE_EXPIRE_MINUTES || 15) * 60;
const RATE_LIMIT_TTL = Number(process.env.BOT_REGISTER_RATE_LIMIT_MINUTES || 5) * 60;
const VERIFIED_TTL = 15 * 60;

13.3 注册与重置密码是否共用验证码

V1 可以共用当前验证码逻辑，但邮件模板必须区分。

也就是说：

* /api/auth/bot-signup 使用 REGISTER_CODE 模板。
* /api/auth/forgot-passcode 使用 RESET_PASSCODE_CODE 模板。
* /api/auth/verify-code 仍验证 auth:verify:{qqNumber}。
* /api/auth/reset-passcode 仍消费 auth:verified:{qqNumber}。

13.4 后续可升级

V1.1 可以将 Redis Key 改为带 purpose：

auth:verify:register:{qqNumber}
auth:verify:reset:{qqNumber}
auth:rate:register:{qqNumber}
auth:rate:reset:{qqNumber}

但 V1 为了最小改动，可以暂不升级。

⸻

14. 与 Bot 分支的适配

14.1 Bot 注册指令调用链

用户在 QQ 群发送 /signup
        ↓
Bot Gateway
        ↓
POST /api/auth/bot-signup
        ↓
generateAndStoreCode(qqNumber)
        ↓
emailService.sendRegisterCode({ qqNumber, code })
        ↓
SMTP 发送 / EmailLog 记录
        ↓
API 返回标准结果
        ↓
Bot @用户 回复

14.2 Bot 重置密码指令调用链

用户在 QQ 群发送 /reset password
        ↓
Bot Gateway
        ↓
POST /api/auth/forgot-passcode
        ↓
generateAndStoreCode(qqNumber)
        ↓
emailService.sendResetPasscodeCode({ qqNumber, code })
        ↓
SMTP 发送 / EmailLog 记录
        ↓
API 返回标准结果
        ↓
Bot @用户 回复

14.3 /api/auth/bot-signup 返回结构改造

当前接口返回：

{
  "data": {
    "status": "code_sent",
    "message": "验证码已发送至QQ邮箱"
  }
}

建议改为兼容 Bot 的结构：

{
  "data": {
    "success": true,
    "code": "REGISTER_CODE_SENT",
    "status": "code_sent",
    "message": "验证码已发送至QQ邮箱",
    "qqNumber": "123456789",
    "email": "123456789@qq.com",
    "emailStatus": "sent",
    "emailLogId": "clx...",
    "shouldMentionUser": true
  }
}

如果已注册：

{
  "data": {
    "success": true,
    "code": "ALREADY_REGISTERED",
    "status": "already_registered",
    "message": "该QQ号已注册，请直接登录",
    "qqNumber": "123456789",
    "email": "123456789@qq.com",
    "shouldMentionUser": true
  }
}

如果邮件失败：

{
  "error": {
    "code": "EMAIL_SEND_FAILED",
    "message": "验证码发送失败，请稍后重试"
  },
  "data": {
    "success": false,
    "qqNumber": "123456789",
    "email": "123456789@qq.com",
    "emailStatus": "failed",
    "shouldMentionUser": true
  }
}

14.4 /api/auth/forgot-passcode 返回结构改造

当前接口为防止账号枚举，会对不存在用户也返回成功。

对 Web 页面可以保留这个行为。

但对 Bot 内部调用，Bot 本身已在群内识别 QQ 号，且需要准确回复用户，所以建议增加内部模式：

方案 A：继续使用现有接口，但增加 Header：

X-Bot-Secret: <BOT_INTERNAL_SECRET>

当 Header 存在且正确时，返回真实状态：

{
  "data": {
    "success": false,
    "code": "ACCOUNT_NOT_FOUND",
    "message": "系统未找到与你 QQ 号绑定的账号",
    "qqNumber": "123456789",
    "email": "123456789@qq.com",
    "shouldMentionUser": true
  }
}

方案 B：新增 Bot 专用接口：

POST /api/internal/bot/password-reset-command

推荐 V1 使用方案 B，避免影响普通 Web 忘记密码接口的防枚举安全逻辑。

⸻

15. API 设计

15.1 邮件测试接口

仅开发环境或超管可用：

POST /api/admin/email/test

请求：

{
  "to": "123456@qq.com",
  "templateKey": "REGISTER_CODE"
}

响应：

{
  "data": {
    "success": true,
    "status": "sent",
    "emailLogId": "clx..."
  }
}

要求：

* 仅 NODE_ENV=development 或超管可调用。
* 生产环境必须鉴权。
* 不能向任意邮箱开放滥发。
* 写入 EmailLog。

15.2 邮件日志列表

GET /api/admin/email-logs

查询参数：

status
templateKey
purpose
toEmail
relatedQqNumber
page
pageSize

15.3 邮件日志详情

GET /api/admin/email-logs/:id

15.4 重试邮件

POST /api/admin/email-logs/:id/retry

权限：

ADMIN 或 SUPER_ADMIN

限制：

* 只能重试 failed 状态。
* 不能超过 maxRetry。
* 重试必须写入 AuditLog。
* 重试后更新 retryCount。

⸻

16. Queue 适配

16.1 修改 queue.ts

当前 src/lib/queue.ts 已有：

RATING_COMPLETION
MEMBERSHIP_EXPIRY
AUDIT_ARCHIVE

本分支新增：

EMAIL_SEND: "email-send"

示例：

export const QUEUE_NAMES = {
  RATING_COMPLETION: "rating-completion",
  MEMBERSHIP_EXPIRY: "membership-expiry",
  AUDIT_ARCHIVE: "audit-archive",
  EMAIL_SEND: "email-send",
} as const;
export const emailQueue = createQueue(QUEUE_NAMES.EMAIL_SEND);

16.2 Email Queue Job

interface EmailSendJob {
  emailLogId: string;
}

Worker 逻辑：

读取 EmailLog
        ↓
确认 status 为 queued / retrying
        ↓
渲染模板
        ↓
调用 SMTP
        ↓
成功：status = sent
        ↓
失败：retryCount + 1
        ↓
未超过最大重试：重新入队
        ↓
超过最大重试：status = failed

16.3 V1 策略

V1 必须实现 direct 模式。

queue 模式可以实现但不强制启用。

配置：

EMAIL_SEND_MODE=direct

⸻

17. 错误码

17.1 EmailService 错误码

type EmailErrorCode =
  | "EMAIL_CONFIG_MISSING"
  | "EMAIL_TEMPLATE_NOT_FOUND"
  | "EMAIL_RENDER_FAILED"
  | "EMAIL_SEND_FAILED"
  | "EMAIL_DISABLED"
  | "EMAIL_RATE_LIMITED";

17.2 Auth API 对 Bot 返回错误码

注册：

REGISTER_CODE_SENT
REGISTER_CODE_QUEUED
ALREADY_REGISTERED
EMAIL_CODE_STILL_VALID
RATE_LIMITED
EMAIL_SEND_FAILED
SYSTEM_ERROR

重置密码：

RESET_PASSWORD_EMAIL_SENT
RESET_PASSWORD_EMAIL_QUEUED
RESET_PASSWORD_EMAIL_STILL_VALID
ACCOUNT_NOT_FOUND
ACCOUNT_BANNED
ACCOUNT_DELETED
RATE_LIMITED
EMAIL_SEND_FAILED
SYSTEM_ERROR

⸻

18. 安全要求

18.1 邮件内容安全

邮件不得包含：

* 明文密码。
* 密码重置 token。
* JWT。
* Bot secret。
* 管理后台私密链接。
* 内部错误堆栈。
* 用户完整敏感资料。
* 他人 QQ 号。
* 他人照片链接。

18.2 日志安全

EmailLog 可以记录：

* 收件邮箱。
* 模板 key。
* 发送状态。
* 失败原因。
* messageId。
* relatedQqNumber。

EmailLog 不得记录：

* 验证码明文。
* 重置 token 明文。
* SMTP_PASS。
* 邮件全文中的敏感数据。

如需记录 metadata，应避免包含验证码：

{
  "source": "bot_signup",
  "groupId": "123456789"
}

不要记录：

{
  "code": "123456"
}

18.3 SMTP 凭据安全

* SMTP_PASS 只能放环境变量。
* 不得提交到 Git。
* 生产环境使用独立邮箱授权码。
* QQ 邮箱 SMTP 必须使用授权码，不使用登录密码。
* 生产环境建议启用邮件发送量监控。

18.4 防滥发

必须限制：

* 同一 QQ 号注册验证码频率。
* 同一 QQ 号重置密码频率。
* 同一收件邮箱发送频率。
* 同一 IP 调用频率。
* Bot 内部接口必须校验 BOT_INTERNAL_SECRET。

⸻

19. 审计日志

以下动作必须写入 AuditLog：

EMAIL_SEND_REQUESTED
EMAIL_SEND_SUCCESS
EMAIL_SEND_FAILED
EMAIL_RETRY_REQUESTED
REGISTER_CODE_EMAIL_SENT
RESET_PASSCODE_EMAIL_SENT
BOT_REGISTER_EMAIL_RESULT_RETURNED
BOT_PASSWORD_RESET_EMAIL_RESULT_RETURNED

审计 metadata 示例：

{
  "qqNumber": "123456789",
  "email": "123456789@qq.com",
  "templateKey": "REGISTER_CODE",
  "emailLogId": "clx...",
  "source": "bot_signup"
}

不得写入验证码明文。

⸻

20. 与站内通知的关系

本分支只实现 Email SMTP。

但为了后续适配通知中心，建议定义统一通知入口：

interface NotificationDispatchInput {
  userId?: string;
  qqNumber?: string;
  channels: Array<"email" | "in_app">;
  templateKey: string;
  data: Record<string, unknown>;
}

V1 可以只实现 email channel。

V1.1 再实现站内通知：

Notification 表
站内通知列表
已读状态

⸻

21. 测试清单

21.1 SMTP 配置

* SMTP_HOST 缺失时返回配置错误。
* SMTP_PORT=465 时 secure=true。
* SMTP_PORT=587 时 secure=false。
* SMTP_USER 缺失时不能真实发送。
* SMTP_PASS 缺失时不能真实发送。
* SMTP_FROM 缺失时使用 SMTP_USER。
* EMAIL_ENABLED=false 时不真实发送但写入日志。

21.2 注册验证码邮件

* /api/auth/bot-signup 可以触发注册验证码邮件。
* 邮件发送到 QQ号@qq.com。
* 邮件主题正确。
* 邮件正文包含验证码。
* 邮件正文包含有效期。
* EmailLog 写入成功。
* 发送成功后接口返回 REGISTER_CODE_SENT。
* 发送失败后接口返回 EMAIL_SEND_FAILED。
* 已注册用户不发送邮件。
* 未过期验证码不重复发送邮件。

21.3 重置密码邮件

* /api/auth/forgot-passcode 可以触发重置密码验证码邮件。
* Bot 内部重置密码接口可以返回真实账号状态。
* 未注册 QQ 号在 Bot 内部接口返回 ACCOUNT_NOT_FOUND。
* Web 公开忘记密码接口仍避免账号枚举。
* 邮件模板使用 RESET_PASSCODE_CODE。
* EmailLog 写入成功。
* 发送成功后返回 RESET_PASSWORD_EMAIL_SENT。
* 发送失败后返回 EMAIL_SEND_FAILED。

21.4 EmailLog

* 发送前创建 EmailLog。
* 发送成功更新为 sent。
* 发送失败更新为 failed。
* 记录 messageId。
* 记录 errorMessage。
* 不记录验证码明文。
* 管理后台可以按状态查询。
* 管理后台可以按 QQ 号查询。

21.5 Bot 适配

* Bot 调用注册接口后能拿到 code。
* Bot 调用注册接口后能拿到 emailStatus。
* Bot 调用注册接口后能拿到 emailLogId。
* Bot 可以根据 REGISTER_CODE_SENT 回复成功。
* Bot 可以根据 EMAIL_SEND_FAILED 回复失败。
* Bot 调用重置密码接口后能区分未注册、被封禁、邮件失败。
* Bot 回复不得包含验证码。

21.6 Queue

如果启用 queue 模式：

* 邮件任务进入 BullMQ。
* Worker 能读取任务。
* 成功后 EmailLog 更新为 sent。
* 失败后重试。
* 超过最大重试后状态为 failed。
* Bot 在 queue 模式下收到 REGISTER_CODE_QUEUED 或 RESET_PASSWORD_EMAIL_QUEUED。

21.7 安全

* 日志不输出验证码。
* 日志不输出 SMTP_PASS。
* 内部接口必须校验 Bot Secret。
* 高频请求被限流。
* 测试接口生产环境不可公开调用。

⸻

22. 验收标准

本分支完成后应满足：

1. 当前 src/lib/email.ts 被改造为兼容层，不再直接承载全部邮件业务逻辑。
2. 新增统一 EmailService。
3. 新增 SMTP Client 封装。
4. 新增邮件模板系统。
5. 注册验证码邮件使用 REGISTER_CODE 模板。
6. 重置密码验证码邮件使用 RESET_PASSCODE_CODE 模板。
7. 新增 EmailLog 数据表。
8. 每次邮件发送都有日志。
9. 邮件发送成功、失败都有明确状态。
10. /api/auth/bot-signup 能返回 Bot 可理解的注册邮件结果。
11. /api/auth/forgot-passcode 或新增 Bot 内部重置密码接口能返回 Bot 可理解的重置邮件结果。
12. Bot 可以根据返回结果正确 @用户。
13. 邮件发送失败时 Bot 能提示用户联系管理员。
14. 验证码有效期使用环境变量配置。
15. SMTP 配置读取 .env.local。
16. 开发环境可测试 SMTP 连通性。
17. 生产日志不泄露验证码、token、SMTP 密码。
18. 可选支持 BullMQ 邮件队列。
19. 与 feature/qqbot-napcat 分支对接无冲突。
20. 现有 Web 注册 / 验证码 / 重置密码流程不被破坏。

⸻

23. 推荐开发顺序

1. 新建 feature/email-smtp 分支。
2. 新建 src/server/email/ 目录。
3. 新建 email.types.ts。
4. 新建 email.config.ts。
5. 新建 smtp.client.ts。
6. 新建 email.templates.ts。
7. 新建 email.renderer.ts。
8. 新建 email-log.service.ts。
9. 新建 email.service.ts。
10. 修改 src/lib/email.ts 为兼容层。
11. 修改 src/lib/verification.ts，让 TTL 读取环境变量。
12. 新增 Prisma EmailLog 模型。
13. 执行 Prisma migration。
14. 修改 /api/auth/bot-signup 返回结构。
15. 修改 /api/auth/forgot-passcode 或新增 /api/internal/bot/password-reset-command。
16. 增加邮件测试接口。
17. 增加邮件日志查询接口。
18. 可选新增 EMAIL_SEND 队列。
19. 增加单元测试。
20. 与 Bot 分支联调 /signup。
21. 与 Bot 分支联调 /reset password。
22. 更新 .env.example。
23. 更新 README 或 docs。

⸻

24. 给工程师 / Claude Code 的开发指令

请在当前 DatingSys / TenMatch 项目中新建 feature/email-smtp 分支，重构并完善 SMTP 邮件推送模块。
当前项目已有 nodemailer、Redis、BullMQ、src/lib/email.ts、src/lib/verification.ts、/api/auth/bot-signup、/api/auth/forgot-passcode 等基础实现。不要推翻现有系统，请在现有基础上升级。
核心要求：
1. 新增 src/server/email/ 目录。
2. 实现 EmailService，统一封装所有邮件发送。
3. 实现 SMTP Client，继续使用 nodemailer。
4. SMTP 配置读取现有 .env.example 中的 SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS、SMTP_FROM。
5. 新增 EMAIL_ENABLED、EMAIL_SEND_MODE、EMAIL_CODE_EXPIRE_MINUTES、EMAIL_RESET_EXPIRE_MINUTES、EMAIL_MAX_RETRY 等配置。
6. 新增邮件模板系统，至少实现 REGISTER_CODE 和 RESET_PASSCODE_CODE。
7. 注册验证码邮件和重置密码验证码邮件必须使用不同模板。
8. 保留 src/lib/email.ts，但将其改为兼容层，内部调用新的 EmailService。
9. 新增 EmailLog Prisma 模型，记录收件人、模板、用途、状态、失败原因、messageId、重试次数、relatedQqNumber 等。
10. 每次邮件发送必须写入 EmailLog。
11. 邮件发送成功更新 EmailLog 为 sent。
12. 邮件发送失败更新 EmailLog 为 failed，并记录错误原因。
13. 不允许在日志或 EmailLog metadata 中保存验证码明文、重置 token、SMTP_PASS。
14. 修改 src/lib/verification.ts，将验证码 TTL 从硬编码改为读取 EMAIL_CODE_EXPIRE_MINUTES。
15. 修改 /api/auth/bot-signup，使其返回 Bot 可理解的结构，包括 success、code、message、qqNumber、email、emailStatus、emailLogId、shouldMentionUser。
16. 修改 /api/auth/forgot-passcode 或新增 /api/internal/bot/password-reset-command，使 Bot 重置密码指令可以拿到明确状态：RESET_PASSWORD_EMAIL_SENT、ACCOUNT_NOT_FOUND、ACCOUNT_BANNED、EMAIL_SEND_FAILED 等。
17. Web 公开忘记密码接口仍需避免账号枚举；Bot 内部接口可返回真实状态，但必须校验 BOT_INTERNAL_SECRET。
18. 可选实现 BullMQ email-send 队列，但 V1 必须支持 direct 模式。
19. 新增 /api/admin/email/test 测试接口，仅开发环境或超管可用。
20. 新增 /api/admin/email-logs 查询接口。
21. 更新 .env.example。
22. 增加测试，覆盖注册邮件、重置密码邮件、EmailLog、SMTP 配置错误、Bot 返回结构、限流、安全日志等。
23. 确保本分支与 feature/qqbot-napcat 分支完全适配，Bot 可以根据 Web 返回结果进行 @用户 回复。

⸻

25. V1 固定决策

* 邮件发送库使用 nodemailer。
* SMTP 默认使用 .env.example 已配置的 QQ 邮箱 SMTP。
* 注册邮件发送到 QQ号@qq.com。
* 重置密码邮件发送到 QQ号@qq.com。
* 用户不能自定义注册邮箱。
* V1 先使用 EMAIL_SEND_MODE=direct。
* 必须新增 EmailLog。
* 必须区分注册验证码模板和重置密码验证码模板。
* Bot 必须等待邮件模块返回结果后再 @用户。
* Web 公开忘记密码接口继续避免账号枚举。
* Bot 内部重置密码接口可以返回真实状态，但必须校验 BOT_INTERNAL_SECRET。
* 邮件日志不得保存验证码明文。
* SMTP 密码只允许存在环境变量中。
* 队列模式作为可选增强，不阻塞 V1。
