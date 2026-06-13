# Date 系统 QQBot / NapCat 机器人分支项目文档

版本：v0.2  
日期：2026-06-13  
推荐分支：`feature/qqbot-napcat`  
模块名称：Bot Gateway / QQ 群服互通模块  
面向对象：后端工程师、Bot 工程师、运维、测试、Vibe Coding 工具

---

## 1. 分支目标

本分支用于实现 Date 匹配系统与目标 QQ 群之间的机器人互通能力。

机器人模块负责：

1. 接收目标 QQ 群内用户指令。
2. 处理注册指令。
3. 处理重置密码指令。
4. 对用户操作结果进行 `@回复`。
5. 检测新成员进群并引导使用系统。
6. 检测成员退群并同步 Web 系统。
7. 将退群用户自动移出匹配库并进入管理审核。
8. 检查群名片格式。
9. 根据 Web 系统资料修改 QQ 群名片。
10. 从 QQ 同步用户头像到 Web 系统。
11. 记录 Bot 事件日志、主动操作日志和审计日志。
12. 为后续退群冻结、周期复核、多群支持预留能力。

本分支不负责：

- 邮件 SMTP 底层发送实现。
- 用户资料填写页面。
- 匹配算法。
- 评分系统。
- 管理后台完整 UI。
- 举报业务处理。
- 密码重置页面本身。

---

## 2. 总体设计原则

### 2.1 Bot 只做入口和回执

Bot 不直接完成复杂业务判断。

Bot 负责：

```text
接收 QQ 群事件
识别指令
提取 QQ 信息
调用 Web 系统接口
等待 Web 系统返回结果
@用户 回复执行结果
写入 Bot 日志
```

Web 系统负责：

```text
注册状态判断
邀请码生成
邮件发送触发
重置密码邮件触发
账号状态判断
限流判断
群成员资格状态处理
匹配库移除
管理审核创建
```

### 2.2 业务结果必须来自 Web 系统

Bot 不允许在 Web 系统未确认成功前提前回复“操作已完成”。

正确流程：

```text
用户发送指令
        ↓
Bot 收到指令
        ↓
Bot 调用 Web 系统
        ↓
Web 系统完成业务操作
        ↓
Web 系统返回 success / failed / code
        ↓
Bot 根据返回结果 @用户回复
```

### 2.3 Bot 必须抽象接口

业务代码不能强绑定 NapCat。

必须定义统一接口：

```ts
interface QQBotClient {
  getGroupMemberInfo(groupId: string, qqNumber: string): Promise<GroupMemberInfo>;
  getStrangerInfo(qqNumber: string): Promise<QQUserInfo>;
  setGroupCard(groupId: string, qqNumber: string, card: string): Promise<void>;
  sendGroupMessage(groupId: string, message: BotMessage): Promise<void>;
  sendPrivateMessage(qqNumber: string, message: BotMessage): Promise<void>;
}
```

NapCat 只是其中一个实现：

```ts
class NapCatQQBotClient implements QQBotClient {}
```

后续如更换其他 OneBot 实现，只替换适配层。

---

## 3. 推荐技术方案

### 3.1 推荐 Bot 框架

V1 推荐：

```text
NapCat + OneBot v11 协议
```

接入方式优先级：

1. 反向 WebSocket。
2. HTTP Webhook。
3. 主动 HTTP API。

推荐模式：

```text
NapCat 事件上报：WebSocket 或 HTTP Webhook
Web 后端调用 Bot：HTTP API
```

### 3.2 推荐分支结构

```text
feature/qqbot-napcat
```

### 3.3 推荐目录结构

```text
src/server/bot/
  ├─ bot.gateway.ts
  ├─ bot.config.ts
  ├─ bot.types.ts
  ├─ bot-event-normalizer.ts
  ├─ bot-command-result.ts
  ├─ register-command.handler.ts
  ├─ password-reset-command.handler.ts
  ├─ group-member-joined.handler.ts
  ├─ group-member-left.handler.ts
  ├─ group-card.service.ts
  ├─ avatar-sync.service.ts
  ├─ bot-audit.service.ts
  ├─ clients/
  │   ├─ qqbot-client.interface.ts
  │   └─ napcat.client.ts
  └─ tests/
      ├─ register-command.test.ts
      ├─ password-reset-command.test.ts
      ├─ group-card.service.test.ts
      ├─ group-member-left.test.ts
      └─ napcat.client.test.ts
```

如果使用 Next.js Route Handlers：

```text
src/app/api/bot/napcat/webhook/route.ts
src/app/api/bot/group-member-joined/route.ts
src/app/api/bot/group-member-left/route.ts
src/app/api/internal/bot/register-command/route.ts
src/app/api/internal/bot/password-reset-command/route.ts
src/app/api/internal/bot/group-card/check/route.ts
src/app/api/internal/bot/group-card/update/route.ts
```

---

## 4. 核心业务流程

### 4.1 注册流程

用户在目标 QQ 群内发送：

```text
/signup
```

流程：

```text
用户在目标 QQ 群发送 /signup
        ↓
NapCat 收到群消息事件
        ↓
Bot Gateway 接收事件
        ↓
校验是否来自目标 QQ 群
        ↓
校验消息内容是否为注册指令
        ↓
提取发送者 QQ 号
        ↓
获取 QQ 昵称、QQ 头像、群名片
        ↓
同步 QQ 头像到 Web 系统
        ↓
检查群名片格式
        ↓
调用 Web 系统注册指令接口
        ↓
Web 系统判断用户注册状态
        ↓
Web 系统生成一次性邮箱邀请码
        ↓
Web 系统触发邮件发送到 QQ号@qq.com
        ↓
Web 系统返回执行结果
        ↓
Bot 在群内 @用户 回复结果
```

### 4.2 重置密码流程

用户在目标 QQ 群内发送：

```text
/reset password
```

流程：

```text
用户发送 /reset password
        ↓
Bot 接收群消息
        ↓
校验目标群
        ↓
提取 QQ 号
        ↓
调用 Web 系统重置密码指令接口
        ↓
Web 系统判断账号是否存在
        ↓
Web 系统判断账号状态
        ↓
Web 系统触发重置密码邮件
        ↓
Web 系统返回执行结果
        ↓
Bot 在群内 @用户 回复结果
```

### 4.3 新成员进群引导流程

```text
用户进入目标 QQ 群
        ↓
Bot 收到进群事件
        ↓
Bot 校验目标群
        ↓
Bot 发送系统使用指引
        ↓
记录 BotEventLog 和 AuditLog
```

注意：

- 不强制注册。
- 不自动创建账号。
- 不自动发送邀请码。
- 只提示如何使用系统。

### 4.4 用户退群流程

```text
用户退出目标 QQ 群
        ↓
Bot 收到退群事件
        ↓
Bot 同步 Web 系统
        ↓
Web 系统查找绑定用户
        ↓
用户状态进入 left_pending_review
        ↓
用户自动移出匹配库
        ↓
管理后台生成审核项
        ↓
管理员核实
        ↓
管理员确认恢复 / 确认离群 / 清除全部记录
```

---

## 5. 指令设计

### 5.1 V1 支持指令

```text
/signup
/reset password
```

### 5.2 暂不支持

```text
私聊注册
私聊重置密码
群外注册
Web 端直接申请邀请码
```

### 5.3 指令处理范围

只处理：

```text
目标 QQ 群内的群消息
```

忽略：

```text
非目标群消息
私聊消息
普通聊天消息
非支持指令
```

---

## 6. Bot 指令执行回执机制

### 6.1 基本原则

机器人在处理关键指令时，必须在系统完成对应业务操作后，对用户进行 `@回复`。

关键指令：

```text
/signup
/reset password
```

机器人回复必须基于 Web 系统返回的真实处理结果。

### 6.2 注册成功回执

用户发送：

```text
/signup
```

Web 系统执行成功后，Bot 在群内回复：

```text
@用户 注册申请已受理，邀请码已发送至你的 QQ 邮箱：QQ号@qq.com。
请在 15 分钟内前往邮箱查看，并在 Web 注册页面完成注册。
```

### 6.3 已注册回执

```text
@用户 你已经完成注册，无需重复申请邀请码。
如无法登录，请使用 /reset password。
```

### 6.4 邀请码仍有效回执

```text
@用户 你的邀请码仍在有效期内，请前往 QQ 邮箱查看。
如长时间未收到，请稍后重试或联系管理员。
```

### 6.5 注册失败回执

```text
@用户 注册申请处理失败，请稍后重试。
如果多次失败，请联系管理员处理。
```

### 6.6 重置密码成功回执

用户发送：

```text
/reset password
```

Web 系统执行成功后，Bot 在群内回复：

```text
@用户 密码重置邮件已发送至你的 QQ 邮箱：QQ号@qq.com。
请在有效期内打开邮件完成密码重置。
```

### 6.7 未注册重置密码回执

```text
@用户 系统未找到与你 QQ 号绑定的账号。
如需使用系统，请先发送 /signup 完成注册。
```

### 6.8 账号被封禁回执

```text
@用户 你的账号当前无法使用密码重置功能，请联系管理员处理。
```

### 6.9 重置邮件仍有效回执

```text
@用户 你的密码重置邮件仍在有效期内，请前往 QQ 邮箱查看。
如长时间未收到，请稍后重试或联系管理员。
```

### 6.10 重置密码失败回执

```text
@用户 密码重置请求处理失败，请稍后重试。
如果多次失败，请联系管理员处理。
```

### 6.11 系统异常回执

```text
@用户 系统暂时无法处理你的请求，请稍后重试。
如果多次失败，请联系管理员。
```

### 6.12 回复安全要求

回复中不得包含：

- 明文邀请码。
- 明文密码。
- 密码重置链接。
- `access token`。
- `internal secret`。
- 系统内部错误堆栈。
- 敏感用户资料。

允许展示：

- QQ 邮箱地址。
- 操作是否成功。
- 下一步操作说明。
- 联系管理员提示。

---

## 7. 群名片规则

### 7.1 群名片主控方向

群名片不以用户在 QQ 群内自由修改为准。

系统规则：

```text
群名片跟随 Web 系统资料
```

也就是：

```text
用户在 Web 系统修改昵称、年龄、省份
        ↓
Web 系统生成标准群名片
        ↓
Bot 调用 API 修改 QQ 群名片
```

### 7.2 群名片格式

标准格式：

```text
年龄｜省份｜昵称
```

示例：

```text
20｜云南｜Harry
```

### 7.3 字段规则

年龄：

- 必须为数字。
- 必须 >= 18。
- 建议最大 100。

省份：

- 必须来自标准省份列表。

昵称：

- 不能为空。
- 不得包含敏感词。
- 不得包含联系方式。
- 不得包含广告或引流信息。
- 不得超过 QQ 群名片长度限制。

### 7.4 群名片检查结果

```ts
type GroupCardCheckResult =
  | "valid"
  | "invalid_format"
  | "invalid_age"
  | "underage"
  | "invalid_province"
  | "invalid_nickname"
  | "contains_sensitive_words";
```

### 7.5 群名片同步状态

```ts
type GroupCardSyncStatus =
  | "synced"
  | "pending_sync"
  | "sync_failed"
  | "user_modified_invalid"
  | "auto_fixed";
```

### 7.6 用户自行改乱群名片

如果系统检测到用户自行在 QQ 群中修改了不合规群名片：

1. 不立即封禁。
2. Bot 按 Web 系统资料重新生成群名片。
3. Bot 尝试自动修正。
4. 修正成功写入日志。
5. 修正失败通知管理员。
6. 多次恶意修改可记录违规。

---

## 8. 头像同步规则

### 8.1 头像主控方向

头像以 QQ 头像为唯一可信来源。

同步方向：

```text
QQ 头像 → Bot → Web 系统
```

### 8.2 Web 端头像规则

Web 系统不开放用户自定义头像上传。

个人信息页头像使用：

```text
BotIdentity.qqAvatarUrl
```

### 8.3 同步时机

Bot 应在以下场景同步 QQ 头像：

- 用户发送 `/signup`。
- 用户发送 `/reset password`。
- 用户触发资料复核。
- 系统周期复核。
- 管理员手动同步。
- 用户在群内发送消息时可选同步。

### 8.4 数据字段

```ts
BotIdentity {
  qqAvatarUrl
  qqAvatarSyncedAt
}
```

---

## 9. 新成员进群引导

### 9.1 触发条件

Bot 监听目标 QQ 群的新成员进群事件。

### 9.2 引导原则

- 只做温和引导。
- 不强制注册。
- 不自动创建账号。
- 不自动发送邀请码。
- 不影响用户正常群聊。

### 9.3 推荐文案

```text
欢迎加入本群。

如需使用 Date 匹配系统，请在群内发送 /signup。
系统会向你的 QQ 邮箱发送邀请码，用于完成 Web 端注册。

本系统为自愿使用，不强制注册。
```

### 9.4 记录事件

必须记录：

```text
BOT_GROUP_MEMBER_JOINED
BOT_REGISTER_GUIDE_SENT
```

---

## 10. 退群检测与管理审核

### 10.1 触发条件

Bot 监听目标 QQ 群成员退出事件。

退群类型：

```ts
type LeaveType = "leave" | "kick" | "unknown";
```

### 10.2 Web 系统处理

当检测到已绑定用户退出目标群后，Web 系统必须：

1. 将用户群成员状态标记为 `left_pending_review`。
2. 将用户资料状态标记为 `membership_review_required`。
3. 自动将该用户移出匹配库。
4. 禁止该用户继续出现在匹配结果中。
5. 禁止该用户继续查看新的匹配结果。
6. 禁止该用户继续发起敏感信息互相解锁申请。
7. 在管理后台创建「群成员异常审核」记录。
8. 审核原因显示：`Bot 检测到用户已退出目标 QQ 群`。
9. 通知管理员。
10. 写入审计日志。

### 10.3 群成员状态

```ts
type GroupMembershipStatus =
  | "active"
  | "left_pending_review"
  | "left_confirmed"
  | "restored"
  | "removed";
```

### 10.4 状态说明

| 状态 | 说明 |
|---|---|
| `active` | 正常群成员 |
| `left_pending_review` | Bot 检测到退群，等待管理员核实 |
| `left_confirmed` | 管理员确认用户已离群 |
| `restored` | 管理员核实后确认用户仍在群内或已重新进群 |
| `removed` | 管理员已清除该用户全部系统记录 |

### 10.5 用户端提示

当用户状态为 `left_pending_review` 时，用户端显示：

```text
系统检测到你的群成员状态异常，当前资料已暂停参与匹配。请联系管理员核实。
```

匹配页显示：

```text
你的群成员状态正在审核中，暂时无法查看匹配结果。
```

### 10.6 管理审核页

管理后台新增页面：

```text
群成员异常审核
```

展示字段：

- 用户 ID。
- QQ 号。
- QQ 昵称。
- QQ 头像。
- 当前群名片。
- 系统昵称。
- 用户等级。
- 资料状态。
- 匹配状态。
- Bot 检测退群时间。
- 目标群号。
- 退群类型。
- 审核原因。
- Bot 原始事件摘要。
- 最近一次群成员复核结果。
- 管理员处理状态。

审核原因：

```text
Bot 检测到用户已退出目标 QQ 群，系统已自动将其移出匹配库，等待管理员核实。
```

### 10.7 管理员处理动作

管理员及以上权限可以处理。

允许操作：

#### 10.7.1 确认仍在群内 / 恢复

适用：

- Bot 误报。
- 用户短暂退出后重新进群。
- 管理员核实用户仍在目标群内。

结果：

- 状态改为 `active` 或 `restored`。
- 用户资料重新进入匹配库。
- 用户恢复查看匹配结果权限。
- 写入审计日志。

#### 10.7.2 确认已离群

适用：

- 管理员核实用户确实退出目标群。

结果：

- 状态改为 `left_confirmed`。
- 用户继续保持移出匹配库。
- 用户不能继续使用匹配功能。
- 管理员可进一步选择是否清除全部记录。

#### 10.7.3 清除全部系统记录

适用：

- 管理员确认用户已经离开目标群。
- 用户不再具有系统使用资格。
- 管理员决定清除该用户账号和资料。

权限：

```text
管理员及以上
```

必须二次确认。

确认文案：

```text
确认清除该用户在系统数据库中的全部记录
```

结果：

- 删除或匿名化该用户账号。
- 删除用户资料。
- 删除期待条件。
- 删除匹配范围。
- 删除评分资料。
- 删除照片对象。
- 删除敏感信息解锁关系。
- 删除未处理申请。
- 删除站内通知。
- 保留必要审计日志、举报记录和违规处理记录，或按系统合规策略匿名化保留。

推荐策略：

```text
业务数据删除 + 风控审计匿名化保留
```

---

## 11. 标准化事件结构

### 11.1 群消息事件

```ts
interface BotGroupMessageEvent {
  eventId: string;
  platform: "napcat" | "onebot" | "other";
  groupId: string;
  qqNumber: string;
  messageText: string;
  rawMessage: unknown;
  timestamp: number;
}
```

### 11.2 新成员进群事件

```ts
interface BotGroupMemberJoinedEvent {
  eventId: string;
  platform: "napcat" | "onebot" | "other";
  groupId: string;
  qqNumber: string;
  operatorId?: string;
  timestamp: number;
  rawEvent: unknown;
}
```

### 11.3 成员退群事件

```ts
interface BotGroupMemberLeftEvent {
  eventId: string;
  platform: "napcat" | "onebot" | "other";
  groupId: string;
  qqNumber: string;
  operatorId?: string;
  leaveType: "leave" | "kick" | "unknown";
  timestamp: number;
  rawEvent: unknown;
}
```

### 11.4 群成员信息

```ts
interface GroupMemberInfo {
  groupId: string;
  qqNumber: string;
  nickname: string;
  card: string;
  avatarUrl?: string;
  role?: "owner" | "admin" | "member";
  joinTime?: number;
  lastSentTime?: number;
}
```

### 11.5 QQ 用户信息

```ts
interface QQUserInfo {
  qqNumber: string;
  nickname: string;
  avatarUrl?: string;
  sex?: string;
  age?: number;
}
```

---

## 12. Web 系统返回结果结构

Bot 调用 Web 系统后，Web 系统返回统一结构：

```ts
interface BotCommandResult {
  success: boolean;
  code:
    | "REGISTER_CODE_SENT"
    | "ALREADY_REGISTERED"
    | "EMAIL_CODE_STILL_VALID"
    | "RESET_PASSWORD_EMAIL_SENT"
    | "RESET_PASSWORD_EMAIL_STILL_VALID"
    | "ACCOUNT_NOT_FOUND"
    | "ACCOUNT_BANNED"
    | "ACCOUNT_DELETED"
    | "RATE_LIMITED"
    | "INVALID_GROUP"
    | "GROUP_CARD_INVALID"
    | "SYSTEM_ERROR";
  message: string;
  qqNumber: string;
  email?: string;
  shouldMentionUser: boolean;
}
```

示例：

```json
{
  "success": true,
  "code": "REGISTER_CODE_SENT",
  "message": "邀请码已发送至 QQ 邮箱",
  "qqNumber": "123456789",
  "email": "123456789@qq.com",
  "shouldMentionUser": true
}
```

---

## 13. 数据模型

### 13.1 BotIdentity

```prisma
model BotIdentity {
  id                    String   @id @default(cuid())
  userId                String?
  qqNumber              String
  qqEmail               String
  qqNickname            String?
  qqAvatarUrl           String?
  qqAvatarSyncedAt      DateTime?
  groupId               String
  groupCard             String?
  groupCardStatus       String?
  groupCardSyncStatus   String?
  groupCardSyncedAt     DateTime?
  registeredFromGroupId String
  lastCommandAt         DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([qqNumber])
  @@index([groupId])
}
```

### 13.2 GroupMembership

```prisma
model GroupMembership {
  id              String   @id @default(cuid())
  userId          String?
  qqNumber        String
  groupId         String
  status          String
  joinedAt        DateTime?
  leftDetectedAt  DateTime?
  leftConfirmedAt DateTime?
  restoredAt      DateTime?
  removedAt       DateTime?
  reviewReason    String?
  reviewedBy      String?
  reviewRemark    String?
  rawEvent         Json?
  createdAt       DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([userId])
  @@index([qqNumber])
  @@index([groupId])
  @@index([status])
}
```

### 13.3 EmailVerification

```prisma
model EmailVerification {
  id          String   @id @default(cuid())
  qqNumber    String
  email       String
  codeHash    String
  status      String
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime @default(now())
  metadata    Json?

  @@index([qqNumber])
  @@index([email])
  @@index([status])
}
```

### 13.4 PasswordResetToken

```prisma
model PasswordResetToken {
  id          String   @id @default(cuid())
  userId      String
  qqNumber    String
  email       String
  tokenHash   String
  status      String
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime @default(now())
  metadata    Json?

  @@index([userId])
  @@index([qqNumber])
  @@index([email])
  @@index([status])
}
```

### 13.5 BotEventLog

```prisma
model BotEventLog {
  id           String   @id @default(cuid())
  eventId      String?
  platform     String
  eventType    String
  groupId      String?
  qqNumber     String?
  messageText  String?
  rawPayload   Json
  handled      Boolean  @default(false)
  errorMessage String?
  createdAt    DateTime @default(now())

  @@index([eventId])
  @@index([groupId])
  @@index([qqNumber])
}
```

### 13.6 BotActionLog

```prisma
model BotActionLog {
  id           String   @id @default(cuid())
  action       String
  groupId      String?
  qqNumber     String?
  status       String
  request      Json?
  response     Json?
  errorMessage String?
  createdAt    DateTime @default(now())

  @@index([action])
  @@index([groupId])
  @@index([qqNumber])
}
```

### 13.7 AdminReview

```prisma
model AdminReview {
  id          String   @id @default(cuid())
  type        String
  userId      String?
  status      String
  reason      String
  metadata    Json?
  handledBy   String?
  handledAt   DateTime?
  resolution  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([type])
  @@index([userId])
  @@index([status])
}
```

### 13.8 AuditLog

Bot 相关动作必须写入现有 `AuditLog`。

Bot 审计动作：

```text
BOT_REGISTER_COMMAND_RECEIVED
BOT_REGISTER_COMMAND_RESULT_RETURNED
BOT_PASSWORD_RESET_COMMAND_RECEIVED
BOT_PASSWORD_RESET_RESULT_RETURNED
BOT_COMMAND_REPLY_SENT
BOT_COMMAND_REPLY_FAILED
BOT_GROUP_MEMBER_JOINED
BOT_REGISTER_GUIDE_SENT
BOT_MEMBER_LEFT_DETECTED
BOT_MEMBER_LEFT_PENDING_REVIEW
BOT_MEMBER_LEFT_UNBOUND_USER
BOT_GROUP_CARD_CHECKED
BOT_GROUP_CARD_UPDATE_ATTEMPTED
BOT_GROUP_CARD_UPDATE_SUCCESS
BOT_GROUP_CARD_UPDATE_FAILED
BOT_AVATAR_SYNCED
BOT_ERROR
```

---

## 14. API 设计

### 14.1 NapCat Webhook

```http
POST /api/bot/napcat/webhook
```

用途：

- 接收 NapCat / OneBot 事件。
- 标准化事件。
- 分发到对应 handler。

要求：

- 校验 Bot Token。
- 记录原始 payload。
- 防重复处理。

### 14.2 NapCat WebSocket

```http
GET /api/bot/napcat/ws
```

用途：

- 接收 NapCat 反向 WebSocket 连接。
- 监听群消息、进群、退群等事件。
- 分发到对应 handler。

### 14.3 注册指令内部接口

```http
POST /api/internal/bot/register-command
```

请求：

```json
{
  "groupId": "987654321",
  "qqNumber": "123456789",
  "qqEmail": "123456789@qq.com",
  "qqNickname": "Harry",
  "qqAvatarUrl": "https://...",
  "groupCard": "20｜云南｜Harry",
  "command": "/signup"
}
```

响应：

```json
{
  "success": true,
  "code": "REGISTER_CODE_SENT",
  "message": "邀请码已发送至 QQ 邮箱",
  "qqNumber": "123456789",
  "email": "123456789@qq.com",
  "shouldMentionUser": true
}
```

### 14.4 重置密码指令内部接口

```http
POST /api/internal/bot/password-reset-command
```

请求：

```json
{
  "groupId": "987654321",
  "qqNumber": "123456789",
  "qqEmail": "123456789@qq.com",
  "command": "/reset password"
}
```

响应：

```json
{
  "success": true,
  "code": "RESET_PASSWORD_EMAIL_SENT",
  "message": "密码重置邮件已发送至 QQ 邮箱",
  "qqNumber": "123456789",
  "email": "123456789@qq.com",
  "shouldMentionUser": true
}
```

### 14.5 群名片检查接口

```http
POST /api/internal/bot/group-card/check
```

请求：

```json
{
  "groupCard": "20｜云南｜Harry"
}
```

响应：

```json
{
  "valid": true,
  "age": 20,
  "province": "云南",
  "nickname": "Harry",
  "reason": null
}
```

### 14.6 群名片修改接口

```http
POST /api/internal/bot/group-card/update
```

请求：

```json
{
  "groupId": "987654321",
  "qqNumber": "123456789",
  "targetCard": "20｜云南｜Harry"
}
```

响应：

```json
{
  "success": true
}
```

### 14.7 头像同步接口

```http
POST /api/internal/bot/avatar-sync
```

请求：

```json
{
  "qqNumber": "123456789",
  "qqAvatarUrl": "https://..."
}
```

响应：

```json
{
  "success": true
}
```

### 14.8 进群事件接口

```http
POST /api/bot/group-member-joined
```

请求：

```json
{
  "groupId": "987654321",
  "qqNumber": "123456789",
  "timestamp": 1780000000,
  "rawEvent": {}
}
```

### 14.9 退群事件接口

```http
POST /api/bot/group-member-left
```

请求：

```json
{
  "groupId": "987654321",
  "qqNumber": "123456789",
  "leaveType": "leave",
  "timestamp": 1780000000,
  "rawEvent": {}
}
```

响应：

```json
{
  "success": true,
  "reviewCreated": true,
  "matchPoolRemoved": true
}
```

### 14.10 管理审核接口

```http
GET /api/admin/group-membership-reviews
POST /api/admin/group-membership-reviews/:id/restore
POST /api/admin/group-membership-reviews/:id/confirm-left
POST /api/admin/group-membership-reviews/:id/purge-user
```

清除用户请求：

```json
{
  "confirmText": "确认清除该用户在系统数据库中的全部记录",
  "remark": "管理员已核实用户离开目标 QQ 群"
}
```

---

## 15. 环境变量

```env
# Bot 基础配置
BOT_PROVIDER=napcat
BOT_TARGET_GROUP_ID=123456789
BOT_WEBHOOK_TOKEN=change-me
BOT_INTERNAL_SECRET=change-me

# NapCat HTTP API
NAPCAT_HTTP_BASE_URL=http://127.0.0.1:3001
NAPCAT_ACCESS_TOKEN=change-me

# NapCat WebSocket
NAPCAT_WS_URL=ws://127.0.0.1:3001/ws
NAPCAT_WS_TOKEN=change-me

# 指令配置
REGISTER_COMMAND=/signup
PASSWORD_RESET_COMMAND=/reset password

# 注册配置
EMAIL_CODE_EXPIRE_MINUTES=15
QQ_EMAIL_DOMAIN=qq.com

# 群名片配置
GROUP_CARD_SEPARATOR=｜
GROUP_CARD_AUTO_FIX=true
GROUP_CARD_MIN_AGE=18
GROUP_CARD_MAX_AGE=100

# 限流配置
BOT_REGISTER_RATE_LIMIT_MINUTES=5
BOT_REGISTER_MAX_PER_HOUR=3
BOT_REGISTER_MAX_PER_DAY=5
BOT_PASSWORD_RESET_RATE_LIMIT_MINUTES=10
BOT_PASSWORD_RESET_MAX_PER_DAY=5
```

---

## 16. 安全要求

### 16.1 Webhook 安全

Webhook 必须校验：

- Header Token。
- 请求来源。
- 时间戳。
- `eventId` 去重。
- 重放攻击。

建议 Header：

```http
X-Bot-Token: xxxxxx
```

### 16.2 内部接口安全

内部接口必须校验：

```http
X-Internal-Secret: xxxxxx
```

禁止公开调用：

- 注册指令内部接口。
- 重置密码指令内部接口。
- 群名片修改接口。
- 头像同步接口。
- Bot 主动发消息接口。

### 16.3 限流规则

注册指令推荐：

```text
同一 QQ 号 5 分钟内只能触发 1 次邀请码发送。
同一 QQ 号 1 小时内最多触发 3 次。
同一 QQ 号 24 小时内最多触发 5 次。
```

重置密码推荐：

```text
同一 QQ 号 10 分钟内只能触发 1 次重置密码邮件。
同一 QQ 号 24 小时内最多触发 5 次。
```

### 16.4 日志安全

日志不能明文输出：

- 邀请码。
- 密码重置 token。
- 密码。
- `access token`。
- `internal secret`。

可以记录：

- QQ 号。
- QQ 邮箱。
- 群号。
- 操作状态。
- 错误原因。

---

## 17. 异常处理

### 17.1 重复注册

如果 QQ 号已注册：

- 不再发送邀请码。
- Bot `@用户` 回复已注册。
- 记录 BotActionLog 和 AuditLog。

### 17.2 邀请码仍有效

如果 QQ 号已有未过期邀请码：

- 不重复生成。
- Bot `@用户` 提示查看邮箱。
- V1 不重复发送，避免刷邮件。

### 17.3 重置密码邮件仍有效

如果用户已有未过期重置密码邮件：

- 不重复生成。
- Bot `@用户` 提示查看邮箱。
- 记录日志。

### 17.4 获取群成员失败

处理：

- 重试 1 次。
- 仍失败则回复系统繁忙。
- 记录 BotActionLog。
- 通知管理员。

### 17.5 群名片修改失败

处理：

- 记录失败原因。
- 通知管理员。
- 用户端资料保存可成功，但群名片状态标记为 `sync_failed`。
- 后台可手动重试。

### 17.6 邮件发送失败

Bot 不直接处理 SMTP。

如果 Web 系统返回邮件失败：

- Bot `@用户` 提示稍后重试或联系管理员。
- Web 系统记录 EmailLog。
- 通知管理员或超管。

### 17.7 Bot 回复失败

处理：

- 写入 BotActionLog。
- 写入 AuditLog。
- 通知管理员。
- 不无限重试，避免刷屏。

---

## 18. 权限要求

| 操作 | 最低权限 |
|---|---|
| 查看 BotEventLog | 管理员 |
| 查看 BotActionLog | 管理员 |
| 查看群成员异常审核 | 管理员 |
| 确认用户仍在群内 | 管理员 |
| 确认用户已离群 | 管理员 |
| 清除全部系统记录 | 管理员及以上 |
| 查看清除后的审计记录 | 超管 |
| 修改 Bot 配置 | 超管 |
| 修改清除策略 | 超管 |

清除全部系统记录必须二次确认，并写入完整审计日志。

---

## 19. 前端与后台影响

### 19.1 用户端影响

当用户处于 `left_pending_review`：

```text
系统检测到你的群成员状态异常，当前资料已暂停参与匹配。请联系管理员核实。
```

匹配页：

```text
你的群成员状态正在审核中，暂时无法查看匹配结果。
```

### 19.2 管理后台新增页面

新增：

```text
群成员异常审核
Bot 事件日志
Bot 操作日志
群名片同步状态
```

### 19.3 审核页展示

字段：

- 用户 ID。
- QQ 号。
- QQ 昵称。
- QQ 头像。
- 当前群名片。
- 系统昵称。
- 用户等级。
- 资料状态。
- 匹配状态。
- Bot 检测退群时间。
- 目标群号。
- 退群类型。
- 审核原因。
- Bot 原始事件摘要。
- 最近一次群成员复核结果。
- 管理员处理状态。

---

## 20. 测试清单

### 20.1 注册指令

- 目标群发送 `/signup` 可以触发。
- 非目标群发送 `/signup` 被忽略。
- 私聊发送 `/signup` 被忽略。
- 普通聊天消息不触发注册。
- 重复发送注册指令触发频率限制。
- 已注册用户再次发送时提示已注册。
- 注册成功后 Bot `@用户` 回复。
- 注册失败后 Bot `@用户` 回复。
- 回复内容不包含明文邀请码。

### 20.2 重置密码指令

- 已注册用户发送 `/reset password` 可以触发。
- 未注册用户发送 `/reset password` 返回未注册。
- 被封禁用户发送 `/reset password` 返回无法使用。
- 重置成功后 Bot `@用户` 回复。
- 重置失败后 Bot `@用户` 回复。
- 回复内容不包含重置链接和 token。
- 重复发送触发限流。

### 20.3 QQ 信息

- 可以正确获取 QQ 号。
- 可以正确获取 QQ 昵称。
- 可以正确获取 QQ 头像。
- 可以正确获取群名片。
- 获取失败时有错误日志。
- 头像可同步到 Web 系统。

### 20.4 群名片

- `20｜云南｜Harry` 判断为合法。
- `17｜云南｜Harry` 判断为未满 18。
- `20｜火星｜Harry` 判断为省份非法。
- `20云南Harry` 判断为格式错误。
- Web 修改昵称后可触发 Bot 修改群名片。
- 群名片修改成功写入日志。
- 群名片修改失败进入 `sync_failed`。
- 用户自行改乱群名片后可被 Bot 修正。

### 20.5 进群引导

- 新用户进群后 Bot 发送系统使用指引。
- 进群引导不自动注册。
- 进群引导不自动发送邀请码。
- 非目标群进群事件被忽略。
- 进群引导写入 BotEventLog 和 AuditLog。

### 20.6 退群检测

- 用户退群后系统收到 Bot 事件。
- 已注册用户退群后进入 `left_pending_review`。
- 用户自动移出匹配库。
- 用户不再出现在他人匹配结果。
- 用户无法查看新的匹配结果。
- 管理后台生成审核项。
- 审核原因显示正确。
- 管理员收到通知。
- 未绑定 QQ 号退群只记录事件，不生成审核项。
- 重复退群事件不会重复创建多个待审核项。

### 20.7 管理审核

- 管理员可以确认用户仍在群内并恢复匹配。
- 管理员可以确认用户已离群。
- 管理员可以清除用户全部业务记录。
- 清除操作需要二次确认。
- 清除操作写入审计日志。
- 清除后用户不能登录原账号。
- 清除后用户不再出现在匹配库。
- 审计与违规记录按策略保留或匿名化。

### 20.8 安全

- Webhook Token 错误时拒绝请求。
- Internal Secret 错误时拒绝请求。
- 重复 `eventId` 不重复处理。
- 高频注册请求被限流。
- 高频重置密码请求被限流。
- 日志不输出邀请码明文。
- 日志不输出重置 token。

---

## 21. 验收标准

本分支完成后应满足：

1. 用户在目标 QQ 群发送 `/signup` 后，系统可以识别用户 QQ 号。
2. 系统可以获取用户 QQ 昵称、QQ 头像、群名片。
3. 系统可以触发注册邀请码邮件发送。
4. Bot 可以在 Web 系统确认后 `@用户` 回复注册结果。
5. 用户在目标 QQ 群发送 `/reset password` 后，系统可以触发重置密码邮件。
6. Bot 可以在 Web 系统确认后 `@用户` 回复重置结果。
7. 非目标群和私聊不会触发注册或重置密码。
8. 新成员进群后 Bot 可以发送系统使用引导。
9. 用户退群后 Web 系统可以将其移出匹配库。
10. 退群用户会进入管理审核页。
11. 管理员可以恢复、确认离群、清除用户记录。
12. 用户头像以 QQ 头像为准，由 Bot 同步到 Web。
13. 群名片以 Web 系统资料为准，由 Bot 修改 QQ 群名片。
14. 所有关键动作有 BotEventLog、BotActionLog 和 AuditLog。
15. Bot 适配层不强绑定 NapCat，后续可替换其他 OneBot 实现。

---

## 22. 给工程师 / Claude Code 的开发指令

```text
请在当前项目中新建 feature/qqbot-napcat 分支，实现 Date 系统 QQBot / NapCat 群服互通模块。

核心要求：

1. 新增 Bot Gateway 模块，用于接收 NapCat / OneBot 上报事件。
2. 支持群消息事件、新成员进群事件、成员退群事件。
3. 只处理目标 QQ 群内的 /signup 和 /reset password 指令。
4. 私聊消息、非目标群消息、普通群聊消息全部忽略。
5. 从事件中提取 QQ 号、群号、消息内容。
6. 调用 NapCat Client 获取发送者 QQ 昵称、QQ 头像、群名片。
7. 用户头像以 QQ 头像为准，由 Bot 同步到 Web 系统。
8. 群名片以 Web 系统资料为准，格式为 年龄｜省份｜昵称。
9. 当 Web 系统资料变化时，调用 Bot API 修改用户群名片。
10. 检测用户自行改乱群名片时，Bot 应按 Web 系统资料重新修正。
11. 注册指令调用 Web 系统注册接口，由 Web 系统生成邀请码并触发邮件发送。
12. 重置密码指令调用 Web 系统重置密码接口，由 Web 系统触发重置密码邮件。
13. Bot 必须等待 Web 系统返回结果后，再在 QQ 群内 @用户 回复成功或失败信息。
14. 回复内容不得包含明文邀请码、重置 token、密码、内部错误堆栈等敏感信息。
15. 新成员进群后发送系统使用引导，但不强制注册，不自动发邀请码。
16. 用户退群后同步 Web 系统，Web 系统将用户状态设为 left_pending_review，自动移出匹配库，并创建管理审核项。
17. 管理员可在审核页确认恢复、确认离群或清除用户全部业务记录。
18. 所有 Bot 原始事件写入 BotEventLog。
19. 所有 Bot 主动操作写入 BotActionLog。
20. 所有关键动作写入 AuditLog。
21. 抽象 QQBotClient 接口，不要让业务逻辑强绑定 NapCat。
22. 增加限流、安全校验、eventId 去重。
23. 提供单元测试，覆盖注册、重置密码、进群引导、退群审核、群名片同步、头像同步、限流、安全校验等场景。
```

---

## 23. 推荐开发顺序

1. 新建 `feature/qqbot-napcat` 分支。
2. 新建 Bot 模块目录。
3. 定义 `QQBotClient` 接口。
4. 实现 `NapCatQQBotClient`。
5. 实现 Webhook / WebSocket 事件接收。
6. 实现事件标准化。
7. 实现目标群校验。
8. 实现 `/signup` 指令识别。
9. 实现 `/reset password` 指令识别。
10. 实现 Web 系统指令接口调用。
11. 实现 Bot `@用户` 回执。
12. 实现 QQ 头像同步。
13. 实现群名片检查与同步。
14. 实现新成员进群引导。
15. 实现退群检测。
16. 实现退群移出匹配库。
17. 实现管理审核项创建。
18. 实现 BotEventLog、BotActionLog、AuditLog。
19. 增加限流和安全校验。
20. 增加测试。
21. 与 SMTP 邮件模块联调。
22. 与 Web 注册页和重置密码页联调。

---

## 24. V1 固定决策

- Bot 框架优先使用 NapCat。
- 机器人协议采用 OneBot v11 兼容思路。
- 只支持一个目标 QQ 群。
- 只支持群内指令，不支持私聊指令。
- 注册指令为 `/signup`。
- 重置密码指令为 `/reset password`。
- 邮箱固定为 `QQ号@qq.com`。
- 头像以 QQ 头像为准，由 Bot 同步到 Web。
- 群名片以 Web 系统资料为准，由 Bot 修改 QQ 群名片。
- 群名片格式为 `年龄｜省份｜昵称`。
- 新成员进群只引导，不强制注册。
- 退群后不自动删除账号，先移出匹配库并进入管理审核。
- 清除全部记录必须由管理员及以上权限人工确认。
- 注册和重置密码必须等 Web 系统返回结果后再 `@用户` 回复。
- Bot 回复不得包含明文邀请码、密码重置链接或敏感 token。
