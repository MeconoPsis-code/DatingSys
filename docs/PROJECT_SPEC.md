# TenMatch 系统项目文档

版本：v0.2  
日期：2026-06-11  
面向对象：产品经理、程序员、设计师、测试、Vibe Coding 工具  
项目阶段：需求重构与 MVP 技术方案

---

## 1. 项目概述

本项目是一个面向指定 QQ 群成员的资料匹配 Web 系统。系统通过 QQ 群内机器人 NapCat 进行用户准入识别，通过 QQ 邮箱邀请码完成 Web 端注册，并自动绑定用户的 QQ 号、QQ 昵称、QQ 头像、群名片等信息。

用户注册并完成资料提交后，可以根据自己的基础资料、期待条件、用户等级和匹配人群选择进行资料匹配。

系统不再使用旧版的「普通匹配池 / 评分匹配池」双池结构，改为用户等级体系：

1. 基础用户：无需上传照片，可以提交基础资料参与匹配。
2. 进阶用户：需要上传本人真实照片，经评分流程完成并发布分数后成为进阶用户。
3. 优选用户：进阶用户评分发布后，最终分数达到 7 分及以上，系统自动认定为优选用户。

系统核心功能包括：

- NapCat QQ 群内注册指令识别。
- QQ 邮箱邀请码注册。
- QQ 号、QQ 昵称、QQ 头像、群名片自动绑定。
- 群名片格式检测与自动修正。
- 用户基础资料填写、修改、删除。
- 用户期待条件填写。
- 用户等级：基础、进阶、优选。
- 进阶照片上传与排队编号。
- 评分组按提交顺序评分。
- 评分组异常标记。
- 超管审核、修正并发布最终分数。
- 基础信息匹配展示。
- QQ 号与照片敏感信息互相解锁申请。
- 举报、处罚、封禁、注销冷静期。
- 邮件通知与站内通知。
- 管理后台、评分后台、超管后台。
- 审计日志与风控配置。

---

## 2. 产品原则

### 2.1 核心原则

- 只有指定 QQ 群成员可以使用系统。
- 注册入口必须从目标 QQ 群内触发。
- 系统使用 NapCat Bot 识别用户 QQ 信息。
- 系统固定向 QQ号@qq.com 发送邀请码。
- 用户必须使用 QQ 邮箱邀请码完成注册。
- 用户注册后自动绑定 QQ 号、QQ 昵称、QQ 头像、群名片。
- 用户群名片必须符合系统规定格式。
- 群名片格式为：年龄 + 省份 + 昵称。
- 用户必须完成资料提交后才能参与匹配。
- 用户提交资料前必须确认已满 18 岁。
- 用户提交资料前必须同意资料可见性条款。
- 基础信息可在匹配结果中展示。
- QQ 号和照片属于敏感信息，默认不允许查看。
- QQ 号和照片必须通过敏感信息互相解锁申请后才能双方互相查看。
- 照片只用于进阶用户评分。
- 照片不在普通匹配卡片中公开展示。
- 评分组只负责评分与异常标记，不能直接驳回照片。
- 照片驳回必须由超管确认。
- 评分完成后不会自动出分，必须由超管确认发布。
- 超管可以修正最终分数，但必须填写原因并写入审计日志。
- 最终分数发布后，用户才能查看自己的评分结果。
- 分数达到 7 分及以上自动成为优选用户。
- 用户正式提交资料后进入 7 天资料修改冷静期。
- 用户注销账号后进入 30 天重新注册冷静期。
- 所有管理操作必须写入审计日志。

### 2.2 V1 不做的内容

- 不做 QQ OAuth 登录。
- 不接入 QQ 互联 OAuth。
- 不做普通匹配池 / 评分匹配池双池隔离结构。
- 不做复杂社交聊天系统。
- 不做站内动态、广场、评论区。
- 不公开展示用户上传照片。
- 不允许未满 18 岁用户使用。
- 不允许评分组成员直接修改最终分。
- 不允许评分组成员直接驳回照片。
- 不做黑箱 AI 推荐算法。
- 不做用户自定义颜值分上下限筛选。
- 不允许用户绕过群内 Bot 指令直接注册。

---

## 3. 角色与权限

### 3.1 未注册用户

未注册用户可以：

- 查看登录 / 注册入口说明。
- 按照指引回到目标 QQ 群内发送注册指令。

未注册用户不能：

- 直接在 Web 端申请注册。
- 填写资料。
- 查看匹配结果。
- 查看用户信息。

### 3.2 普通用户

普通用户包括基础用户、进阶用户、优选用户。

普通用户可以：

- 在 QQ 群内触发注册指令。
- 使用 QQ 邮箱邀请码完成注册。
- 可通过指令重制密码
- 查看自己的绑定信息。
- 填写基础资料。
- 填写期待条件。 
- 设置异地意向。
- 设置匹配人群范围。
- 修改资料，但正式提交后受 7 天冷静期限制。
- 删除 / 注销账号。
- 查看匹配结果。
- 发起敏感信息互相解锁申请。
- 审批别人向自己发起的敏感信息互相解锁申请。
- 举报其他用户。
- 查看自己的处罚、冻结、封禁状态。
- 查看站内通知。

普通用户不能：

- 查看未授权用户的 QQ 号。
- 查看未授权用户的照片。
- 查看评分组成员身份。
- 修改评分结果。
- 进入评分后台。
- 进入管理后台。

### 3.3 基础用户

基础用户可以：

- 提交基础资料。
- 参与基础资料匹配。
- 查看其他匹配对象的基础信息。
- 发起敏感信息互相解锁申请。
- 在个人资料中选择「去进阶」，上传照片申请成为进阶用户。

基础用户不能：

- 直接查看他人 QQ 号。
- 直接查看他人照片。
- 查看进阶 / 优选用户的评分，除非双方敏感信息已互相解锁。
- 进入评分流程。

### 3.4 进阶用户

进阶用户条件：

- 已上传合格照片。
- 已完成评分。
- 超管已发布最终分数。
- 最终分数低于 7 分。

进阶用户可以：

- 查看自己的最终评分。
- 选择匹配进阶用户。
- 可额外选择匹配基础用户。
- 与进阶 / 优选用户在匹配后展示评分信息。
- 发起敏感信息互相解锁申请。

进阶用户不能：

- 未经授权查看他人 QQ 号。
- 未经授权查看他人照片。
- 修改评分结果。

### 3.5 优选用户

优选用户条件：

- 进阶评分最终发布分数达到 7 分及以上。

优选用户可以：

- 查看自己的最终评分。
- 选择匹配优选用户。
- 可额外选择匹配进阶用户。
- 可额外选择匹配基础用户。
- 发起敏感信息互相解锁申请。

优选用户不能：

- 未经授权查看他人 QQ 号。
- 未经授权查看他人照片。
- 修改评分结果。

### 3.6 评分组

评分组成员可以：

- 进入评分后台。
- 按提交顺序查看当前应评分任务。
- 查看待评分照片。
- 对照片进行分项评分。
- 标记照片异常。
- 查看自己的待评分任务数量。
- 查看自己的评分超时记录。

评分组成员不能：

- 看到被评分用户的昵称、QQ 号、年龄、地址、属性、期待条件等信息。
- 看到被评分用户的系统身份。
- 看到其他评分员的评分。
- 修改已提交评分。
- 直接驳回照片。
- 直接让用户降级。
- 查看普通用户完整资料。
- 处理举报、封禁、权限等管理动作。

### 3.7 普通管理

普通管理可以：

- 查看用户列表。
- 查看用户认证状态。
- 查看用户等级。
- 查看举报工单。
- 处理举报。
- 对用户警告、冻结、封禁。
- 查看基础审计日志。
- 查看通知发送状态。
- 查看评分任务积压状态，但默认不查看照片和评分明细。

普通管理不能：

- 修改系统核心配置。
- 管理超管账号。
- 修改最终评分。
- 发布最终评分。
- 查看评分组匿名评分明细，除非超管授权。
- 删除审计日志。

### 3.8 超管

超管可以：

- 管理全部用户。
- 管理角色与权限。
- 管理评分组成员。
- 查看评分任务。
- 查看评分明细。
- 确认照片驳回。
- 修正最终分数。
- 发布最终分数。
- 配置评分时限。
- 配置评分超时通知规则。
- 配置邮件通知模板。
- 配置站内通知模板。
- 管理系统配置。
- 查看完整审计日志。
- 处理严重违规。
- 查看已注销用户历史资料快照，用于判断违规与风控。

---

## 4. 用户准入与注册认证

### 4.1 注册方式

V1 使用：

text NapCat QQ 群内指令 + QQ 邮箱邀请码注册 

不使用：

text QQ OAuth QQ 互联 OAuth 第三方聚合登录 用户自填任意邮箱注册 

### 4.2 注册流程

1. 用户进入目标 QQ 群。
2. 用户在目标 QQ 群内发送注册指令。
3. NapCat Bot 获取用户 QQ 号、QQ 昵称、QQ 头像、群名片。
4. 系统检查用户是否在目标群内。
5. 系统检查用户群名片是否符合格式。
6. 如果群名片不符合格式，Bot 尝试根据系统留存信息强制修改。
7. 系统生成一次性邀请码。
8. 系统固定向 QQ号@qq.com 发送邀请码。
9. 用户打开 Web 注册页面。
10. 用户填写 QQ 邮箱、邀请码、密码。
11. 系统校验邀请码。
12. 注册成功后，系统自动绑定 QQ 信息。
13. 用户进入资料填写流程。

### 4.3 群内注册指令

建议指令：

text /注册 

或：

text #注册 

V1 只支持在目标 QQ 群内发送注册指令，不支持私聊机器人注册。

### 4.4 QQ 邮箱规则

邮箱固定为：

text QQ号@qq.com 

例如：

text 123456@qq.com 

系统不允许用户自定义邮箱。

原因：

- 降低冒用风险。
- 保证注册身份与 QQ 号强绑定。
- 便于注销冷静期识别。
- 便于后续处罚、风控和通知。

### 4.5 邀请码规则

邀请码要求：

- 一次性使用。
- 默认 15 分钟有效。
- 只能绑定一个 QQ 号。
- 只能发送到该 QQ 号对应的 QQ 邮箱。
- 使用后立即失效。
- 过期后不能使用。
- 生成、发送、使用、过期、作废都要记录审计日志。

邀请码建议：

text 6 位数字或 6 位字母数字混合 

数据库不保存明文邀请码，只保存 hash。

### 4.6 群名片格式

群名片格式：

text 年龄 + 省份 + 昵称 

推荐展示格式：

text 20｜云南｜Harry 

字段要求：

- 年龄必须为数字。
- 年龄必须 >= 18。
- 省份必须来自标准省份数据。
- 昵称不能为空。
- 总长度不能超过 QQ 群名片限制。

### 4.7 群名片自动修正规则

如果用户群名片不符合格式：

1. Bot 读取系统中留存的年龄、省份、昵称。
2. Bot 拼接标准群名片。
3. Bot 尝试修改用户群名片。
4. 修改成功后记录审计日志。
5. 修改失败时记录失败原因，并通知管理员。

群名片状态：

ts type GroupNicknameStatus =   | "valid"   | "invalid"   | "auto_fixed"   | "fix_failed"; 

审计动作：

text BOT_CHECK_GROUP_NICKNAME BOT_UPDATE_GROUP_NICKNAME BOT_UPDATE_GROUP_NICKNAME_FAILED 

### 4.8 认证状态

用户认证状态：

ts type RegistrationStatus =   | "pending_email_code"   | "registered"   | "profile_required"   | "active"   | "frozen"   | "banned"   | "deleted"; 

---

## 5. 用户资料字段

### 5.1 基础资料

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| 出生年月日 | date | 是 | 用于计算年龄 |
| 年龄 | computed | 是 | 根据出生年月日自动计算 |
| 身高 | integer | 是 | 单位 cm，范围 0-300 |
| 体重 | integer | 是 | 单位 kg，范围 0-200 |
| 所在省份 | enum | 是 | 标准省份数据 |
| 所在城市 | enum | 是 | 标准城市数据 |
| 属性 | enum | 是 | 1、0、偏1、偏0、side、其他 |
| 昵称 | string | 是 | 用于展示和群名片 |
| 自我介绍 | text | 否 | 限制长度 |
| 异地意向 | enum | 是 | 同城优先、可异地、看情况 |
| 资料同意条款 | boolean | 是 | 必须勾选才能提交 |

QQ 号、QQ 昵称、QQ 头像、QQ 邮箱由系统自动绑定，不允许用户自行修改。

### 5.2 期待条件

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| 期待年龄下限 | integer | 是 | 最低 18 |
| 期待年龄上限 | integer | 是 | 最高 100 |
| 期待身高下限 | integer | 是 | 最低 0，单位 cm |
| 期待身高上限 | integer | 是 | 最高 300，单位 cm |
| 期待体重下限 | integer | 是 | 最低 0，单位 kg |
| 期待体重上限 | integer | 是 | 最高 200，单位 kg |
| 期待所在地 | province/city/scope | 是 | 可选择城市、全省、不限 |
| 期待属性 | enum[] | 是 | 可多选 |

所在地筛选仍然作为硬筛选：

text 同城 同省 不限 

异地意向只作为展示信息，不作为硬筛选。

异地意向选项：

text 同城优先 可异地 看情况 

### 5.3 用户等级字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| 用户等级 | enum | 是 | basic、advanced、premium |
| 是否申请进阶 | boolean | 否 | 基础用户上传照片后为 true |
| 最终评分 | decimal | 条件必填 | 超管发布后生成 |
| 分数发布状态 | enum | 条件必填 | 未评分、评分中、待审核、已发布、已驳回 |
| 匹配人群范围 | enum[] | 是 | basic、advanced、premium |

用户等级：

ts type UserLevel = "basic" | "advanced" | "premium"; 

匹配范围：

ts type MatchTargetLevel = "basic" | "advanced" | "premium"; 

### 5.4 匹配范围规则

基础用户：

text 只能匹配 basic 

进阶用户：

text 必须可匹配 advanced 可额外选择 basic 

优选用户：

text 必须可匹配 premium 可额外选择 advanced 可额外选择 basic 

评分发布后，进阶 / 优选用户必须先选择匹配人群范围，才能继续查看匹配结果或进行其他匹配相关操作。

### 5.5 字段校验

基础校验：

- 用户年龄必须 >= 18。
- 期待年龄下限必须 >= 18。
- 期待年龄上限必须 <= 100。
- 下限不能大于上限。
- 身高范围必须在 0-300。
- 体重范围必须在 0-200。
- 所在地必须来自标准省市数据。
- 属性必须来自枚举。
- 期待属性至少选择一项。
- 异地意向必须选择。
- 上传图片必须限制类型、大小、尺寸和安全扫描。

---

## 6. 资料可见性规则

### 6.1 基础信息

匹配结果中默认可见基础信息。

基础信息包括：

- QQ 头像。
- QQ 昵称。
- 年龄。
- 身高。
- 体重。
- 所在省市。
- 属性。
- 异地意向。
- 自我介绍。
- 期待条件摘要。
- 用户等级。
- 评分信息，但仅限进阶 / 优选之间规则允许时展示。

### 6.2 敏感信息

敏感信息包括：

text QQ 号 照片 

敏感信息默认不可见。

任何用户都不能默认查看他人的 QQ 号和照片。

### 6.3 敏感信息互相解锁申请

用户 A 可以向用户 B 发起敏感信息互相解锁申请。

B 同意后：

text A 可以查看 B 的 QQ 号和照片； B 也可以查看 A 的 QQ 号和照片。 

也就是说，授权不是单向可见，而是双方互相可见。

B 拒绝后：

text A 在冷却期内不能再次向 B 发起申请。 

默认冷却期：

text 7 天 

### 6.4 照片可见性

照片规则：

- 照片只用于进阶评分。
- 照片不在公开匹配卡片中展示。
- 照片不在排行榜中展示。
- 照片不对未授权用户展示。
- 照片在双方敏感信息互相解锁后才可互相查看。
- 管理后台默认不公开浏览照片，只有超管或授权管理可访问。
- 评分组只能在评分后台看到待评分照片，不得看到用户身份资料。

### 6.5 提交前确认条款

用户提交资料前必须勾选：

text 我确认我已年满 18 岁，并同意在系统判定为匹配展示或我授权敏感信息互相解锁后，对方可以在规则允许范围内查看我提交的资料。QQ 号和照片默认不公开，只有在双方互相同意解锁后才可互相查看。 

未勾选时不能提交。

---

## 7. 匹配系统

### 7.1 匹配基础

系统取消旧版普通池 / 评分池，采用用户等级和匹配人群范围控制匹配。

用户等级：

text basic advanced premium 

匹配时必须同时满足：

- 双方账号状态正常。
- 双方资料状态正常。
- 双方都已正式提交资料。
- 双方年龄、身高、体重、地区、属性符合期待条件。
- 双方用户等级符合对方选择的匹配人群范围。
- 若用户为进阶 / 优选，必须已发布分数。
- 若用户分数发布后尚未选择匹配人群范围，则不能进入匹配。

### 7.2 匹配类型

匹配类型仍分为：

text 双向匹配 单项匹配 

双向匹配：

text 用户 A 满足用户 B 的期待条件，同时用户 B 也满足用户 A 的期待条件。 

单项匹配：

text 只有一个方向满足期待条件。 

### 7.3 双向匹配展示

双向匹配对象：

- 可以展示基础信息。
- 不默认展示 QQ 号。
- 不默认展示照片。
- 双方可以发起敏感信息互相解锁申请。
- 解锁后双方互相可见 QQ 号和照片。

### 7.4 单项匹配展示

单项匹配对象：

- 展示基础信息或脱敏摘要。
- 不默认展示 QQ 号。
- 不默认展示照片。
- 可以发起敏感信息互相解锁申请。
- 对方同意后双方互相可见 QQ 号和照片。

### 7.5 地区匹配规则

所在地硬筛选支持：

text 同城 同省 不限 

判断逻辑：

- 期待为同城：候选人的城市必须相同。
- 期待为同省：候选人的省份必须相同。
- 期待为不限：不限制地区。

异地意向只作为展示字段，不影响算法过滤。

异地意向：

text 同城优先 可异地 看情况 

### 7.6 属性匹配规则

属性枚举：

text 1 0 偏1 偏0 side 其他 

V1 采用显式选择，不做系统默认兼容推断。

例如：

text 用户期待属性选择 0 和 偏0，则只有这两类候选人满足。 如果用户愿意接受 其他，必须手动勾选 其他。 

### 7.7 用户等级匹配规则

基础用户：

text 只能匹配 basic 用户。 

进阶用户：

text 可以匹配 advanced 用户； 可选择额外匹配 basic 用户。 

优选用户：

text 可以匹配 premium 用户； 可选择额外匹配 advanced 用户； 可选择额外匹配 basic 用户。 

### 7.8 评分可见规则

- 基础用户默认不能查看进阶 / 优选用户的评分。
- 进阶用户之间匹配后可以看到对方评分。
- 优选用户之间匹配后可以看到对方评分。
- 进阶和优选互相匹配后可以看到对方评分。
- 基础用户如需查看评分，应通过敏感信息互相解锁申请或后续单独评分查看申请机制实现。
- V1 建议将评分视为敏感扩展信息，跟随双方互相解锁规则控制。

### 7.9 匹配排序

V1 采用规则排序，不做复杂机器学习。

排序建议：

1. 双向匹配优先于单项匹配。
2. 用户等级符合度优先。
3. 同城优先。
4. 同省优先。
5. 年龄更接近期望范围中心的优先。
6. 身高更接近期望范围中心的优先。
7. 体重更接近期望范围中心的优先。
8. 资料完整度高的优先。
9. 最近活跃用户优先。

### 7.10 匹配状态

匹配关系状态：

ts type MatchStatus =   | "candidate"   | "mutual_match"   | "one_way_match"   | "sensitive_unlock_requested"   | "sensitive_unlock_approved"   | "sensitive_unlock_rejected"   | "hidden"   | "blocked"; 

---

## 8. 评分系统

### 8.1 评分申请流程

1. 基础用户在个人资料页点击「去进阶」。
2. 用户上传本人真实照片。
3. 系统校验图片格式、大小、尺寸。
4. 系统创建评分任务。
5. 系统为该任务生成排队编号。
6. 用户进入等待评分状态。
7. 评分组按提交顺序评分。
8. 每位评分员只能看到当前最早未评分任务。
9. 评分员完成分项评分。
10. 评分员可以标记照片异常。
11. 所有评分员完成评分后，系统计算平均分。
12. 系统进入超管待审核状态。
13. 超管查看系统计算分数。
14. 超管可以修正最终分数。
15. 超管确认发布。
16. 用户收到分数发布通知。
17. 若最终分数 >= 7，系统自动设为优选用户。
18. 用户必须选择匹配人群范围后，才能继续进行匹配相关操作。

### 8.2 评分编号

用户提交照片后获得评分编号。

编号格式建议：

text ADV-000001 ADV-000002 ADV-000003 

用户可在提交页面看到：

text 我的编号：ADV-000035 当前评分到：ADV-000027 前方等待：8 人 

### 8.3 评分状态

评分状态：

ts type RatingStatus =   | "not_submitted"   | "pending"   | "scoring"   | "scoring_completed"   | "pending_super_admin_review"   | "published"   | "photo_rejected"   | "resubmit_allowed"   | "withdrawn"; 

用户在 pending、scoring、scoring_completed、pending_super_admin_review 状态时，前端显示：

text 评分中，请耐心等待 

### 8.4 照片异常与驳回

评分员可以标记照片异常，但不能直接驳回。

异常类型：

- 非本人。
- 多人同框。
- 过度 P 图。
- 照片模糊。
- 遮挡五官。
- 非正脸。
- 非真实照片。
- 内容违规。
- 不符合上传要求。
- 其他。

流程：

1. 评分员标记照片异常。
2. 系统记录异常标记。
3. 超管在评分审核后台查看异常。
4. 超管确认是否驳回。
5. 超管确认驳回后，用户回到基础用户状态。
6. 用户可继续作为基础用户使用。
7. 用户也可重新上传照片，再次申请进阶。

### 8.5 分项评分规则

每个评分员对 5 个单项进行 0-10 分打分。

使用滑动进度条。

单项：

| 类型 | 项目 | 输入范围 | 权重 |
| --- | --- | --- | --- |
| 硬件分 | 轮廓与骨相 | 0-10 | 硬件部分 |
| 硬件分 | 皮肤状态 | 0-10 | 硬件部分 |
| 硬件分 | 五官和谐度 | 0-10 | 硬件部分 |
| 软件分 | 发型与造型 | 0-10 | 20% |
| 主观分 | 气质与眼缘 | 0-10 | 20% |

硬件分总权重为 60%。

### 8.6 评分细则

#### 8.6.1 硬件分，满分 6 分

硬件分看天生的、不易改变的基础条件。

##### 轮廓与骨相

- 10 分：下颌线清晰，脸型周正，骨相感强，例如高鼻梁、眉骨立体。
- 5 分：轮廓略模糊，脸型略有瑕疵，但不算明显硬伤。
- 0 分：有明显骨骼问题，例如严重下巴后缩、歪脸等。

##### 皮肤状态

- 10 分：干净、光滑、无明显痘印痘坑、毛孔细腻。
- 5 分：有些许瑕疵，但整体干净，不明显影响观感。
- 0 分：痘痘、痘印、坑洼、油光等问题严重，明显影响观感。

##### 五官和谐度

- 10 分：五官排布舒服，没有明显突兀或短板，组合顺眼。
- 5 分：某个五官略有短板，整体普通。
- 0 分：五官存在明显硬伤，或组合非常不协调。

#### 8.6.2 软件分，满分 2 分

##### 发型与造型

- 10 分：发型适合脸型，明显打理过，穿着得体，有品味，扬长避短。
- 5 分：干净整洁，但略普通，没有明显亮点也没有明显错误。
- 0 分：邋遢、油腻、造型灾难，明显拉低颜值。

#### 8.6.3 主观分，满分 2 分

##### 气质与眼缘

- 10 分：非常有吸引力，照片能传递独特气质，例如阳光、痞帅、儒雅、野性等。
- 5 分：不讨厌，但没有特别感觉。
- 0 分：完全不是个人类型，甚至让人反感或觉得油腻。

### 8.7 单个评分员总分计算

ts hardwareScore =   ((contourScore + skinScore + facialHarmonyScore) / 3) * 0.6;  stylingScoreWeighted = stylingScore * 0.2;  vibeScoreWeighted = vibeScore * 0.2;  singleScorerTotal =   hardwareScore + stylingScoreWeighted + vibeScoreWeighted; 

总分范围：

text 0 - 10 

### 8.8 多评分员聚合规则

系统对所有评分员的单个评分员总分取平均值。

ts systemAverageScore =   sum(singleScorerTotal) / scorerCount; 

系统平均分保留一位小数。

不再使用去掉最高分和最低分的规则。

### 8.9 超管发布分数

评分完成后，分数不会自动发布。

必须进入：

text pending_super_admin_review 

超管可以：

- 查看系统平均分。
- 查看各评分员分项评分。
- 查看异常标记。
- 修改最终得分。
- 填写修改原因。
- 发布最终得分。
- 驳回照片。
- 要求重评。

必须记录：

- 系统平均分。
- 超管修改前分数。
- 超管修改后分数。
- 修改原因。
- 操作超管。
- 操作时间。
- IP。
- User-Agent。

### 8.10 优选用户规则

最终发布分数：

text >= 7.0 

自动成为优选用户。

最终发布分数：

text < 7.0 

成为进阶用户。

分数发布后，系统通知用户：

- 分数已发布。
- 是否进入优选。
- 需要先选择匹配人群范围。

### 8.11 评分顺序

评分顺序固定为提交顺序。

评分员后台只显示当前最早未评分任务。

评分员不能跳过前面的任务。

评分后台展示：

- 当前任务编号。
- 照片。
- 分项评分控件。
- 异常标记入口。
- 提交按钮。

### 8.12 评分超时

评分时限由系统配置。

配置项包括：

- 评分任务时限 X 小时。
- 超时提醒时间。
- 超时记录是否启用。
- 超时 X 次后通知超管。
- 是否邮件抄送超管。
- 是否暂停评分员权限。

超时记录应包括：

- 评分员 ID。
- 任务 ID。
- 任务编号。
- 分配时间。
- 截止时间。
- 实际完成时间。
- 超时时长。
- 是否已通知超管。

---

## 9. 页面与功能模块

### 9.1 用户端页面

#### 9.1.1 注册引导页

功能：

- 说明系统仅限目标 QQ 群成员使用。
- 指引用户回到 QQ 群内发送注册指令。
- 展示注册指令。
- 展示 QQ 邮箱邀请码说明。

#### 9.1.2 邮箱邀请码注册页

功能：

- 输入 QQ 邮箱。
- 输入邀请码。
- 输入密码。
- 确认密码。
- 提交注册。

校验：

- 邮箱必须为 QQ号@qq.com。
- 邀请码必须有效。
- 邀请码必须和 QQ 号匹配。
- 邀请码只能使用一次。

#### 9.1.3 资料编辑页

功能：

- 填写基础资料。
- 填写期待条件。
- 选择异地意向。
- 选择匹配人群范围。
- 勾选资料可见性同意条款。
- 保存草稿。
- 正式提交资料。

交互要求：

- 出生年月日使用滚动选择。
- 身高使用滚动选择。
- 体重使用滚动选择。
- 年龄范围使用滚动选择。
- 身高范围、体重范围使用前后两个选择控件。
- 所在地使用省市选择器。
- 属性和期待属性使用明确选项。

#### 9.1.4 我的资料页

功能：

- 查看自己的资料。
- 修改资料。
- 查看资料修改冷静期。
- 查看用户等级。
- 查看评分状态。
- 查看最终分数。
- 选择「去进阶」上传照片。
- 选择匹配人群范围。
- 删除 / 注销账号。

#### 9.1.5 去进阶页面

功能：

- 上传本人真实照片。
- 查看照片上传要求。
- 提交进阶申请。
- 获得评分编号。
- 查看当前排队进度。
- 查看评分状态。

#### 9.1.6 匹配结果页

顶部入口：

- 双向匹配。
- 单项匹配。
- 敏感信息申请。
- 已解锁对象。

若用户评分已发布但未选择匹配人群范围，显示：

text 请先选择匹配人群范围后继续使用 

若用户正在评分中，显示：

text 评分中，请耐心等待 

#### 9.1.7 敏感信息申请页

功能：

- 发起敏感信息互相解锁申请。
- 查看申请状态。
- 审批别人向自己发起的申请。
- 同意后双方互相可见 QQ 号和照片。
- 拒绝后进入冷却期。

申请状态：

ts type SensitiveUnlockStatus =   | "pending"   | "approved"   | "rejected"   | "expired"   | "cancelled"; 

#### 9.1.8 举报页

功能：

- 对用户发起举报。
- 选择举报类型。
- 填写举报说明。
- 上传证据截图。
- 查看处理状态。

举报类型：

- 资料虚假。
- 冒用照片。
- 非本人信息。
- 骚扰。
- 诈骗或引流。
- 恶意举报。
- 违规照片。
- 其他。

### 9.2 评分后台页面

#### 9.2.1 评分首页

展示：

- 当前待评分任务。
- 当前任务编号。
- 剩余评分时间。
- 今日已完成数量。
- 总待完成数量。
- 超时记录。

#### 9.2.2 当前评分任务页

功能：

- 查看照片。
- 使用 5 个进度条评分。
- 提交评分。
- 标记照片异常。

评分项：

- 轮廓与骨相。
- 皮肤状态。
- 五官和谐度。
- 发型与造型。
- 气质与眼缘。

### 9.3 管理后台页面

#### 9.3.1 管理首页

展示：

- 用户总数。
- 今日新增注册。
- 已提交资料用户数。
- 基础用户数。
- 进阶用户数。
- 优选用户数。
- 待评分数量。
- 待超管审核评分数量。
- 举报待处理数量。
- 今日匹配数量。

#### 9.3.2 用户管理

功能：

- 搜索用户。
- 按 QQ 号、昵称、状态、用户等级筛选。
- 查看用户基础资料。
- 查看认证状态。
- 查看举报记录。
- 警告、冻结、封禁、解封。
- 查看注销冷静期状态。

#### 9.3.3 注册与邀请码管理

功能：

- 查看 Bot 注册请求。
- 查看邀请码发送记录。
- 作废邀请码。
- 查看邀请码使用状态。
- 查看 QQ 邮箱发送状态。

#### 9.3.4 群名片管理

功能：

- 查看群名片状态。
- 查看自动修正记录。
- 查看修正失败记录。
- 手动触发重新检查。

#### 9.3.5 举报管理

功能：

- 查看举报列表。
- 查看举报详情。
- 标记处理中。
- 判定成立或不成立。
- 对被举报用户执行警告、冻结、封禁。
- 对恶意举报者处理。
- 通知举报结果。

#### 9.3.6 评分管理

超管可用：

- 查看评分队列。
- 查看任务编号。
- 查看评分状态。
- 查看评分明细。
- 查看异常标记。
- 确认照片驳回。
- 修改最终分。
- 发布最终分。
- 要求重评。

#### 9.3.7 评分员超时管理

功能：

- 查看评分员超时记录。
- 查看超时次数。
- 查看任务积压。
- 手动提醒评分员。
- 暂停评分员权限。
- 恢复评分员权限。

#### 9.3.8 系统配置

超管可配置：

- 评分任务时限。
- 超时几次通知超管。
- 是否邮件抄送超管。
- 邮件模板。
- 站内通知模板。
- 邀请码有效期。
- 资料修改冷静期。
- 注销重新注册冷静期。
- 敏感信息申请冷却期。

#### 9.3.9 审计日志

记录：

- Bot 注册指令。
- 邀请码生成、发送、使用、作废。
- 注册成功。
- 群名片检查和修改。
- 用户资料提交。
- 用户资料修改。
- 用户注销。
- 评分任务创建。
- 评分提交。
- 照片异常标记。
- 照片驳回。
- 超管修改分数。
- 超管发布分数。
- 敏感信息申请。
- 敏感信息申请审批。
- 举报处理。
- 警告、冻结、封禁、解封。
- 权限变更。
- 系统配置修改。

---

## 10. 通知系统

### 10.1 通知方式

系统使用：

text 邮件通知 + 站内通知 

### 10.2 用户通知

用户需要收到：

- 注册邀请码。
- 注册成功。
- 资料提交成功。
- 资料修改冷静期提醒。
- 进阶申请提交成功。
- 照片进入评分队列。
- 照片被驳回。
- 分数已发布。
- 成为优选用户。
- 需要选择匹配人群范围。
- 收到敏感信息互相解锁申请。
- 申请被同意。
- 申请被拒绝。
- 举报处理结果。
- 账号被冻结。
- 账号被封禁。
- 注销成功。
- 重新注册冷静期提醒。

### 10.3 评分员通知

评分员需要收到：

- 有新的评分任务。
- 当前评分任务即将超时。
- 当前评分任务已超时。
- 超时次数提醒。
- 评分权限被暂停。
- 评分权限恢复。

### 10.4 管理员通知

管理员需要收到：

- 有新举报。
- 举报超过处理时限。
- 用户申诉。
- Bot 群名片修改失败。
- 邮件发送失败。
- 用户异常注册行为。

### 10.5 超管通知

超管需要收到：

- 有待审核分数。
- 有照片异常标记。
- 有照片待驳回确认。
- 评分员任务超时。
- 评分员超时达到配置阈值。
- 评分任务严重积压。
- 举报长期未处理。
- 系统配置被修改。
- 管理员执行高风险操作。

### 10.6 邮件日志

邮件发送必须记录：

- 收件人。
- 邮件类型。
- 邮件模板。
- 发送状态。
- 失败原因。
- 发送时间。
- 重试次数。

---

## 11. 技术栈建议

### 11.1 推荐技术栈

MVP 推荐：

- 前端框架：Next.js 15 + React + TypeScript。
- UI：Tailwind CSS + shadcn/ui，或 Ant Design。
- 后端：Next.js Route Handlers / Server Actions。
- 数据库：PostgreSQL。
- ORM：Prisma。
- 缓存与任务：Redis + BullMQ。
- Bot：NapCat。
- 邮件：SMTP、Resend、SendGrid、阿里云邮件推送或腾讯云 SES。
- 对象存储：S3 兼容存储、阿里云 OSS、腾讯云 COS 或 MinIO。
- 表单校验：Zod。
- 权限控制：RBAC。
- 文件安全：图片类型校验、大小限制、私有桶、签名 URL。
- 部署：Docker Compose 起步。
- 日志：Pino 或 Winston。
- 错误监控：Sentry，可后续接入。

### 11.2 为什么推荐 Next.js 全栈

适合本项目的原因：

- 页面多，但业务逻辑适中。
- 需要快速迭代产品规则。
- 管理后台、评分后台、用户端都可统一开发。
- TypeScript 可统一前后端类型。
- Vibe Coding 生成表单和后台 CRUD 效率高。
- 可以先做单体应用，后续再拆服务。

### 11.3 可替代方案

如果团队偏后端工程化：

- 前端：Vue 3 + Vite + Element Plus。
- 后端：NestJS。
- 数据库：PostgreSQL。
- ORM：Prisma 或 TypeORM。

如果团队偏 Java：

- 前端：React / Vue。
- 后端：Spring Boot。
- 数据库：PostgreSQL 或 MySQL。
- ORM：MyBatis Plus。

MVP 不建议一开始做微服务。

---

## 12. 系统架构

### 12.1 架构图

mermaid flowchart TD   QQGroup["目标 QQ 群"] --> Bot["NapCat Bot"]   Bot --> Web["Next.js Web 应用"]   User["用户浏览器"] --> Web   Web --> DB["PostgreSQL"]   Web --> Redis["Redis"]   Web --> Queue["BullMQ 后台任务"]   Web --> Storage["私有对象存储"]   Web --> Mail["邮件服务"]   Admin["管理后台"] --> Web   Scorer["评分后台"] --> Web   SuperAdmin["超管后台"] --> Web   Queue --> DB   Queue --> Mail   Queue --> Storage 

### 12.2 核心模块

- BotGateway：NapCat 指令、群成员识别、群名片管理。
- Auth：邮箱邀请码注册、Session。
- User：用户主账号。
- Profile：用户资料。
- Preference：期待条件。
- MatchScope：匹配人群范围。
- Matching：匹配计算。
- Rating：照片上传、评分任务、分数计算。
- RatingReview：超管审核、修正、发布。
- SensitiveUnlock：敏感信息互相解锁申请。
- Reports：举报、处理、处罚。
- Notification：邮件与站内通知。
- Admin：后台管理。
- RBAC：角色权限。
- Audit：审计日志。
- Storage：私有照片存储和访问控制。

---

## 13. 数据模型建议

### 13.1 User

用户主表。

字段：

- id
- created_at
- updated_at
- status：active、frozen、banned、deleted
- role：user、scorer、admin、super_admin
- user_level：basic、advanced、premium
- email
- password_hash
- last_login_at
- deleted_at
- re_register_locked_until

### 13.2 BotIdentity

Bot 绑定身份表。

字段：

- id
- user_id
- qq_number
- qq_nickname
- qq_avatar_url
- group_id
- group_nickname
- group_nickname_status
- registered_from_group_id
- created_at
- updated_at

唯一索引：

- qq_number
- group_id + qq_number

### 13.3 EmailVerification

邮箱邀请码表。

字段：

- id
- qq_number
- email
- code_hash
- status：unused、used、expired、revoked
- expires_at
- used_at
- created_at
- metadata

### 13.4 Profile

用户资料表。

字段：

- id
- user_id
- birth_date
- height_cm
- weight_kg
- province_code
- city_code
- attribute
- display_nickname
- self_intro
- distance_intention：same_city_preferred、long_distance_ok、depends
- consent_profile_visibility
- status：draft、active、hidden、cleared、frozen
- last_submitted_at
- edit_locked_until
- created_at
- updated_at

### 13.5 Preference

期待条件表。

字段：

- id
- user_id
- age_min
- age_max
- height_min_cm
- height_max_cm
- weight_min_kg
- weight_max_kg
- location_scope：city、province、any
- expected_province_code
- expected_city_code
- expected_attributes
- created_at
- updated_at

### 13.6 MatchScope

匹配范围表。

字段：

- id
- user_id
- target_levels
- last_updated_at
- locked_until
- created_at
- updated_at

target_levels 示例：

json ["basic", "advanced", "premium"] 

### 13.7 RatingProfile

评分资料表。

字段：

- id
- user_id
- photo_object_key
- photo_status
- rating_status
- queue_number
- queue_display_code
- system_average_score
- final_score
- final_score_published_at
- published_by
- is_premium
- created_at
- updated_at

### 13.8 RatingTask

评分任务表。

字段：

- id
- rated_user_id
- photo_object_key
- status
- queue_number
- queue_display_code
- scorer_snapshot
- created_at
- scoring_started_at
- scoring_completed_at
- review_started_at
- published_at

### 13.9 RatingScore

单个评分记录。

字段：

- id
- rating_task_id
- scorer_user_id
- contour_score
- skin_score
- facial_harmony_score
- styling_score
- vibe_score
- single_scorer_total
- created_at

唯一索引：

- rating_task_id + scorer_user_id

### 13.10 RatingAbnormalFlag

照片异常标记表。

字段：

- id
- rating_task_id
- scorer_user_id
- type
- description
- created_at

### 13.11 RatingReview

超管评分审核表。

字段：

- id
- rating_task_id
- system_average_score
- final_score_before_admin_edit
- final_score_after_admin_edit
- edit_reason
- review_status：pending、published、rejected、rescore_required
- reviewed_by
- reviewed_at
- created_at

### 13.12 SensitiveUnlockRequest

敏感信息互相解锁申请表。

字段：

- id
- requester_id
- target_user_id
- status：pending、approved、rejected、expired、cancelled
- message
- created_at
- responded_at
- expires_at
- cooldown_until

唯一策略：

- 同一 requester 对同一 target 同时只能有一个 pending 请求。
- rejected 后进入冷却期。

### 13.13 SensitiveUnlockRelation

敏感信息已解锁关系表。

字段：

- id
- user_a_id
- user_b_id
- approved_request_id
- created_at

要求：

- user_a_id 与 user_b_id 排序后存储，避免重复。
- 解锁关系为双方互相可见。

### 13.14 Report

举报表。

字段：

- id
- reporter_id
- target_user_id
- type
- description
- evidence_object_keys
- status：pending、reviewing、accepted、rejected
- handled_by
- handled_at
- resolution
- created_at

### 13.15 Penalty

处罚记录表。

字段：

- id
- user_id
- type：warning、profile_frozen、account_banned
- reason
- created_by
- created_at
- expires_at
- revoked_at

### 13.16 Notification

站内通知表。

字段：

- id
- user_id
- type
- title
- content
- read_at
- created_at

### 13.17 EmailLog

邮件日志表。

字段：

- id
- to_email
- template_key
- subject
- status：pending、sent、failed
- error_message
- sent_at
- created_at

### 13.18 ScorerTimeoutLog

评分员超时记录表。

字段：

- id
- scorer_user_id
- rating_task_id
- assigned_at
- deadline_at
- completed_at
- timeout_hours
- notified_admin
- created_at

### 13.19 SystemConfig

系统配置表。

字段：

- id
- key
- value
- updated_by
- updated_at

配置项示例：

- email_code_expire_minutes
- profile_edit_cooldown_days
- account_delete_cooldown_days
- sensitive_unlock_reject_cooldown_days
- rating_deadline_hours
- scorer_timeout_notify_threshold
- scorer_timeout_cc_super_admin
- scorer_auto_suspend_threshold

### 13.20 AuditLog

审计日志表。

字段：

- id
- actor_user_id
- action
- target_type
- target_id
- metadata
- ip
- user_agent
- created_at

---

## 14. API 设计建议

### 14.1 Bot

- POST /api/bot/register-command
- POST /api/bot/group-nickname/check
- POST /api/bot/group-nickname/update
- POST /api/bot/member-left

### 14.2 Auth

- POST /api/auth/email-code/register
- POST /api/auth/email-code/verify
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

### 14.3 Profile

- GET /api/profile/me
- PUT /api/profile/me/draft
- POST /api/profile/me/submit
- DELETE /api/profile/me
- GET /api/profile/edit-lock-status

### 14.4 Match Scope

- GET /api/match-scope/me
- PUT /api/match-scope/me

### 14.5 Rating

- POST /api/rating/photo
- POST /api/rating/photo/resubmit
- GET /api/rating/status
- GET /api/rating/queue/status

### 14.6 Scorer

- GET /api/scorer/current-task
- POST /api/scorer/tasks/:id/score
- POST /api/scorer/tasks/:id/flag-abnormal
- GET /api/scorer/timeout-logs

### 14.7 Admin Rating

- GET /api/admin/rating/tasks
- GET /api/admin/rating/tasks/:id
- POST /api/admin/rating/tasks/:id/review
- POST /api/admin/rating/tasks/:id/publish
- POST /api/admin/rating/tasks/:id/reject-photo
- POST /api/admin/rating/tasks/:id/rescore

### 14.8 Matching

- GET /api/matches/mutual
- GET /api/matches/one-way
- GET /api/matches/:userId

### 14.9 Sensitive Unlock

- POST /api/sensitive-unlock-requests
- GET /api/sensitive-unlock-requests/incoming
- GET /api/sensitive-unlock-requests/outgoing
- POST /api/sensitive-unlock-requests/:id/approve
- POST /api/sensitive-unlock-requests/:id/reject
- GET /api/sensitive-unlock-relations

### 14.10 Reports

- POST /api/reports
- GET /api/reports/me
- GET /api/admin/reports
- POST /api/admin/reports/:id/resolve

### 14.11 Admin Users

- GET /api/admin/users
- GET /api/admin/users/:id
- POST /api/admin/users/:id/warn
- POST /api/admin/users/:id/freeze
- POST /api/admin/users/:id/ban
- POST /api/admin/users/:id/unban

### 14.12 Notifications

- GET /api/notifications
- POST /api/notifications/:id/read
- GET /api/admin/email-logs

### 14.13 System Config

- GET /api/admin/system-config
- PUT /api/admin/system-config

---

## 15. 匹配算法伪代码

### 15.1 判断 A 是否接受 B

ts function accepts(a: UserWithProfile, b: UserWithProfile): boolean {   if (a.id === b.id) return false;    if (!isUserActive(a) || !isUserActive(b)) return false;   if (!isProfileActive(a) || !isProfileActive(b)) return false;    if (!a.matchScope.targetLevels.includes(b.userLevel)) return false;    if (requiresPublishedScore(b) && !isRatingPublished(b)) return false;   if (requiresMatchScopeSelection(a) && !hasSelectedMatchScope(a)) return false;    const bAge = calculateAge(b.profile.birthDate);    if (bAge < a.preference.ageMin || bAge > a.preference.ageMax) return false;   if (b.profile.heightCm < a.preference.heightMinCm) return false;   if (b.profile.heightCm > a.preference.heightMaxCm) return false;   if (b.profile.weightKg < a.preference.weightMinKg) return false;   if (b.profile.weightKg > a.preference.weightMaxKg) return false;   if (!matchesLocation(a.preference, b.profile)) return false;   if (!a.preference.expectedAttributes.includes(b.profile.attribute)) return false;    return true; } 

### 15.2 匹配类型

ts function getMatchType(a: UserWithProfile, b: UserWithProfile) {   const aAcceptsB = accepts(a, b);   const bAcceptsA = accepts(b, a);    if (aAcceptsB && bAcceptsA) return "mutual";   if (aAcceptsB || bAcceptsA) return "one_way";   return "none"; } 

### 15.3 单个评分员总分

ts function calculateSingleScorerTotal(input: {   contourScore: number;   skinScore: number;   facialHarmonyScore: number;   stylingScore: number;   vibeScore: number; }) {   const hardwareScore =     ((input.contourScore + input.skinScore + input.facialHarmonyScore) / 3) * 0.6;    const stylingScoreWeighted = input.stylingScore * 0.2;   const vibeScoreWeighted = input.vibeScore * 0.2;    return roundToOneDecimal(     hardwareScore + stylingScoreWeighted + vibeScoreWeighted   ); } 

### 15.4 系统平均分

ts function calculateSystemAverageScore(scores: number[]): number {   if (scores.length === 0) {     throw new Error("没有评分记录");   }    const sum = scores.reduce((total, score) => total + score, 0);   return roundToOneDecimal(sum / scores.length); } 

### 15.5 超管发布分数

ts function publishFinalScore(params: {   taskId: string;   systemAverageScore: number;   finalScore: number;   reason?: string;   adminUserId: string; }) {   if (params.finalScore < 0 || params.finalScore > 10) {     throw new Error("最终分数必须在 0 到 10 之间");   }    if (params.finalScore !== params.systemAverageScore && !params.reason) {     throw new Error("修改最终分数必须填写原因");   }    const userLevel = params.finalScore >= 7 ? "premium" : "advanced";    return {     status: "published",     finalScore: params.finalScore,     userLevel,   }; } 

---

## 16. 状态流

### 16.1 注册状态流

mermaid stateDiagram-v2   [*] --> GroupCommandSent   GroupCommandSent --> EmailCodeSent   EmailCodeSent --> Registered   Registered --> ProfileRequired   ProfileRequired --> Active   Active --> Frozen   Active --> Banned   Active --> Deleted 

### 16.2 评分状态流

mermaid stateDiagram-v2   [*] --> NotSubmitted   NotSubmitted --> Pending   Pending --> Scoring   Scoring --> ScoringCompleted   ScoringCompleted --> PendingSuperAdminReview   PendingSuperAdminReview --> Published   PendingSuperAdminReview --> PhotoRejected   PendingSuperAdminReview --> RescoreRequired   PhotoRejected --> ResubmitAllowed   ResubmitAllowed --> Pending 

### 16.3 敏感信息解锁状态流

mermaid stateDiagram-v2   [*] --> Pending   Pending --> Approved   Pending --> Rejected   Pending --> Expired   Pending --> Cancelled 

---

## 17. 安全与隐私

### 17.1 账号安全

- 使用安全 Session。
- Cookie 设置 HttpOnly、Secure、SameSite。
- 密码必须 hash 存储。
- 后台操作必须校验 RBAC 权限。
- 管理员高风险操作建议二次确认。
- 注册邀请码必须 hash 存储。
- 邀请码必须限频。
- 登录必须限频。

### 17.2 Bot 安全

- Bot 接口必须校验签名或内网访问。
- Bot 上报数据必须记录来源群。
- 只接受目标群内注册指令。
- Bot 操作群名片必须记录审计日志。
- Bot 修改失败要通知管理员。

### 17.3 文件安全

- 照片存储在私有桶。
- 不使用公开 URL。
- 评分后台通过短期签名 URL 访问图片。
- 限制图片格式，例如 jpg、png、webp。
- 限制图片大小。
- 上传后生成安全文件名，不使用原文件名。
- 可接入图片内容安全扫描。

### 17.4 数据隐私

敏感信息包括：

- QQ 号。
- QQ 邮箱。
- 照片。
- 体重。
- 所在地。
- 评分记录。
- 举报记录。

隐私要求：

- 后台按最小权限展示。
- 审计日志记录管理端查看敏感资料的行为。
- 用户注销后普通业务不可见旧资料。
- 超管可查看历史资料快照用于违规判断。
- 被封禁用户资料默认不再对外展示。

### 17.5 风控

建议增加：

- 注册指令频率限制。
- 邀请码发送频率限制。
- 邀请码提交频率限制。
- 登录频率限制。
- 资料提交频率限制。
- 敏感信息申请频率限制。
- 举报频率限制。
- 图片上传频率限制。
- 管理员危险操作二次确认。
- 注销后 30 天重新注册限制。

### 17.6 合规提示

本系统涉及成年人社交、真实照片、QQ 号、地理位置、评分、举报等敏感内容。上线前应根据实际运营地区、服务器所在地、用户范围和数据处理方式进行合规评估，并准备：

- 用户协议。
- 隐私政策。
- 删除机制。
- 申诉机制。
- 举报处理机制。
- 数据导出和删除说明。
- 未成年人禁止使用提示。

---

## 18. 前端体验要求

### 18.1 设计风格

建议风格：

- 清爽。
- 克制。
- 偏工具型。
- 不过度娱乐化。
- 匹配结果以信息扫描效率为主。
- 管理后台以表格、筛选、状态标签为主。
- 评分后台以照片和评分控件为核心。

### 18.2 移动端优先

用户大概率从 QQ 群和手机浏览器进入，因此用户端需要移动端优先。

要求：

- 表单控件适合手机输入。
- 出生年月日、身高、体重使用滚动选择。
- 匹配卡片在手机上可快速浏览。
- 评分上传流程适配手机。
- 管理后台可以桌面优先。

### 18.3 关键文案

注册引导：

text 请先在目标 QQ 群内发送 #注册，系统会向你的 QQ 邮箱发送邀请码。 

评分中：

text 评分中，请耐心等待 

评分发布后：

text 你的评分已发布，请先选择匹配人群范围后继续使用。 

照片被驳回：

text 你的进阶照片未通过审核，已回到基础用户状态。你可以继续作为基础用户使用，也可以重新上传照片申请进阶。 

敏感信息申请：

text 对方同意后，你们双方将互相可见 QQ 号和照片。 

资料冷静期：

text 资料正式提交后 7 天内不能再次修改。 

注销冷静期：

text 账号注销后 30 天内不能重新注册。 

资料可见性同意：

text 我确认我已年满 18 岁，并同意在系统判定为匹配展示或我授权敏感信息互相解锁后，对方可以在规则允许范围内查看我提交的资料。QQ 号和照片默认不公开，只有在双方互相同意解锁后才可互相查看。 

---

## 19. 后台任务

建议异步任务：

- 邀请码过期处理。
- 邮件发送。
- 邮件失败重试。
- 站内通知创建。
- 群名片定期复核。
- 评分任务超时检测。
- 评分员超时统计。
- 超时通知超管。
- 评分任务完成检测。
- 系统平均分计算。
- 评分队列进度刷新。
- 图片安全扫描。
- 资料修改冷静期解除。
- 注销重新注册冷静期检测。
- 敏感信息申请过期处理。
- 举报超时提醒。
- 审计日志归档。

MVP 至少实现：

- 邀请码过期。
- 邮件发送。
- 评分超时检测。
- 评分完成检测。
- 站内通知。
- 资料修改冷静期。
- 注销冷静期。

---

## 20. 测试清单

### 20.1 注册认证

- 非目标群用户不能注册。
- 私聊 Bot 不能注册。
- 群内发送注册指令后生成邀请码。
- 邀请码发送到 QQ号@qq.com。
- 邀请码只能使用一次。
- 邀请码过期后不能使用。
- QQ 邮箱与邀请码绑定不一致时不能注册。
- 注册成功后自动绑定 QQ 号、昵称、头像、群名片。

### 20.2 群名片

- 群名片格式正确时通过。
- 群名片格式错误时触发自动修正。
- 自动修正成功记录审计日志。
- 自动修正失败通知管理员。
- 未满 18 岁不能通过资料提交。

### 20.3 资料

- 未满 18 岁不能提交。
- 范围下限大于上限时报错。
- 未勾选资料可见性条款不能提交。
- 草稿可以反复修改。
- 正式提交后进入 7 天冷静期。
- 冷静期内不能修改资料和匹配范围。
- 注销账号后 30 天内不能重新注册。

### 20.4 匹配

- 基础用户只能选择匹配基础用户。
- 进阶用户可选择匹配进阶和基础。
- 优选用户可选择匹配优选、进阶和基础。
- 未选择匹配人群范围不能查看匹配。
- 双向匹配正确展示。
- 单项匹配正确展示。
- QQ 号和照片默认不可见。
- 敏感信息申请同意后双方互相可见。
- 敏感信息申请拒绝后进入冷却期。

### 20.5 评分

- 基础用户上传照片后进入评分队列。
- 用户提交后获得编号。
- 评分员只能看到当前最早未评分任务。
- 评分员不能跳过任务。
- 评分员看不到用户身份信息。
- 评分员可以标记异常但不能直接驳回。
- 所有评分员完成后进入超管审核。
- 系统正确计算平均分。
- 超管可以修改最终分。
- 超管修改最终分必须填写原因。
- 超管发布后用户才能看到分数。
- 分数 >= 7 自动成为优选用户。
- 照片被驳回后用户回到基础用户状态。
- 被驳回后用户可以重新上传。

### 20.6 通知

- 注册邀请码邮件正常发送。
- 分数发布后发送邮件和站内通知。
- 照片驳回后发送邮件和站内通知。
- 成为优选后发送邮件和站内通知。
- 收到敏感信息申请时通知用户。
- 评分员有新任务时通知评分员。
- 评分员超时时通知评分员。
- 超时达到阈值后通知超管。
- 新举报通知管理员。

### 20.7 管理

- 普通管理不能修改超管。
- 普通管理不能发布评分。
- 评分组不能进入普通管理后台。
- 超管修改分数写入审计日志。
- 超管发布分数写入审计日志。
- 警告、冻结、封禁写入审计日志。
- 举报处理后状态正确更新。
- 系统配置修改写入审计日志。

---

## 21. MVP 迭代计划

### 21.1 Milestone 1：基础项目与注册

- 初始化项目。
- 数据库初始化。
- 用户表。
- BotIdentity。
- EmailVerification。
- NapCat 注册指令接口。
- 邮箱邀请码发送。
- Web 注册页。
- 基础 Session。
- 基础 RBAC。

### 21.2 Milestone 2：资料系统

- 用户资料表单。
- 期待条件表单。
- 异地意向。
- 匹配范围选择。
- 资料校验。
- 资料正式提交。
- 7 天冷静期。
- 资料可见性同意。

### 21.3 Milestone 3：基础匹配

- 用户等级规则。
- 匹配范围规则。
- 双向匹配计算。
- 单项匹配计算。
- 匹配结果页面。
- 敏感信息互相解锁申请。

### 21.4 Milestone 4：进阶评分

- 照片上传。
- 评分编号。
- 评分队列。
- 评分后台。
- 分项评分。
- 异常标记。
- 系统平均分计算。

### 21.5 Milestone 5：超管审核与发布

- 超管评分审核页。
- 修改最终分。
- 发布最终分。
- 照片驳回。
- 自动升级优选用户。
- 分数发布通知。
- 评分超时配置。

### 21.6 Milestone 6：管理与风控

- 用户管理。
- 举报管理。
- 处罚管理。
- 审计日志。
- 通知中心。
- 邮件日志。
- 注销冷静期。
- 群名片管理。

### 21.7 Milestone 7：优化

- 匹配快照。
- 批量管理。
- 通知模板可视化配置。
- 数据看板。
- QQ Bot 私聊通知。
- 群成员退群自动冻结。
- 评分员绩效统计。

---

## 22. Vibe Coding 提示词建议

### 22.1 初始化项目提示词

text 请创建一个 Next.js 15 + TypeScript + Tailwind CSS + Prisma + PostgreSQL 的全栈项目。 项目是一个 QQ 群成员专用的资料匹配系统。 系统不使用 QQ OAuth，而使用 NapCat QQ 群内注册指令 + QQ 邮箱邀请码注册。 请先实现用户模型、BotIdentity、EmailVerification、Profile、Preference、MatchScope、基础 RBAC 和 Session。 用户端移动优先，后台使用清爽管理系统布局。 

### 22.2 注册系统提示词

text 请实现注册系统。 用户必须先在目标 QQ 群内向 NapCat Bot 发送 #注册。 Bot 上报 QQ 号、QQ 昵称、QQ 头像、群号和群名片。 系统生成一次性邀请码，并固定发送到 QQ号@qq.com。 用户在 Web 注册页输入 QQ 邮箱、邀请码和密码完成注册。 注册成功后自动绑定 QQ 信息。 不允许用户使用自定义邮箱。 

### 22.3 资料表单提示词

text 请实现用户资料编辑页。 字段包括出生年月日、身高、体重、省市、属性、昵称、自我介绍、异地意向、期待年龄范围、期待身高范围、期待体重范围、期待所在地、期待属性、匹配人群范围。 提交前必须勾选资料可见性同意条款。 未满 18 岁不能提交。 范围下限不能大于上限。 草稿可以随时修改，正式提交后进入 7 天资料修改冷静期。 

### 22.4 匹配算法提示词

text 请实现匹配算法。 系统使用用户等级 basic、advanced、premium，不使用普通池和评分池。 基础用户只能匹配 basic。 进阶用户可以匹配 advanced，并可额外选择 basic。 优选用户可以匹配 premium，并可额外选择 advanced 和 basic。 双向匹配定义为双方都满足对方期待条件。 单项匹配定义为只有一个方向满足。 QQ 号和照片默认不可见，必须通过敏感信息互相解锁申请后双方互相可见。 

### 22.5 评分后台提示词

text 请实现评分组后台。 评分组成员只能看到当前最早未评分任务，不能跳过任务。 评分组成员只能看到照片，不能看到用户昵称、QQ 号、年龄、地区、属性或任何资料。 评分项包括轮廓与骨相、皮肤状态、五官和谐度、发型与造型、气质与眼缘，每项 0-10 分，使用滑动条。 系统按权重计算单个评分员总分，再对所有评分员总分取平均。 评分组可以标记照片异常，但不能直接驳回。 

### 22.6 超管评分审核提示词

text 请实现超管评分审核后台。 所有评分员完成评分后，任务进入超管审核状态。 超管可以查看系统平均分、评分明细和照片异常标记。 超管可以修改最终分数，但必须填写修改原因。 超管确认发布后用户才能看到最终分数。 最终分数 >= 7 自动成为优选用户，否则成为进阶用户。 所有修改和发布动作必须写入审计日志。 

### 22.7 通知系统提示词

text 请实现邮件通知和站内通知系统。 通知场景包括注册邀请码、注册成功、资料提交成功、照片被驳回、分数已发布、成为优选用户、收到敏感信息申请、申请被同意或拒绝、新评分任务、评分任务超时、新举报、举报处理结果。 邮件发送需要记录 EmailLog，站内通知需要记录 Notification。 

---

## 23. 开发约定

### 23.1 命名建议

- 用户：User
- Bot 身份：BotIdentity
- 邮箱验证码：EmailVerification
- 资料：Profile
- 期待条件：Preference
- 匹配范围：MatchScope
- 评分资料：RatingProfile
- 评分任务：RatingTask
- 评分记录：RatingScore
- 异常标记：RatingAbnormalFlag
- 评分审核：RatingReview
- 敏感信息申请：SensitiveUnlockRequest
- 敏感信息解锁关系：SensitiveUnlockRelation
- 举报：Report
- 处罚：Penalty
- 通知：Notification
- 邮件日志：EmailLog
- 评分员超时日志：ScorerTimeoutLog
- 系统配置：SystemConfig
- 审计日志：AuditLog

### 23.2 权限判断

任何接口都必须先判断：

1. 是否登录。
2. 用户状态是否正常。
3. 是否完成注册。
4. 是否完成资料提交。
5. 当前角色是否有权限访问该资源。
6. 对目标资源是否有可见性权限。
7. 是否处于冷静期限制。
8. 是否触发风控限制。

### 23.3 错误返回

统一错误格式：

json {   "error": {     "code": "PROFILE_EDIT_LOCKED",     "message": "资料已正式提交，7 天冷静期内不能再次修改"   } } 

常见错误码：

text NOT_IN_TARGET_GROUP EMAIL_CODE_EXPIRED EMAIL_CODE_INVALID EMAIL_NOT_MATCH_QQ PROFILE_NOT_SUBMITTED PROFILE_EDIT_LOCKED MATCH_SCOPE_REQUIRED RATING_NOT_PUBLISHED SENSITIVE_INFO_LOCKED REQUEST_COOLDOWN ACCOUNT_RECREATE_LOCKED PERMISSION_DENIED 

### 23.4 审计日志

任何改变用户状态、资料状态、评分状态、权限状态、敏感信息可见性、系统配置的操作都必须记录审计日志。

---

## 24. 关键未决问题

以下问题可以在开发中继续确认：

1. 注册指令最终使用 #注册 还是 /注册。
2. QQ 邮件服务使用 SMTP 还是第三方邮件服务。
3. 群名片分隔符使用 ｜、- 还是空格。
4. 照片上传大小限制具体是多少。
5. 评分组人数是否固定不少于 3 人。
6. 评分员超时后是否自动暂停权限。
7. 基础用户查看评分是否纳入敏感信息解锁，还是后续单独做评分查看申请。
8. 注销后历史资料快照保留多久。
9. 是否需要退群自动冻结功能进入 V1。
10. 是否需要排行榜进入 V1.1。

---

## 25. 推荐 V1 决策

为了尽快上线，建议 V1 固定如下决策：

- 只支持一个目标 QQ 群。
- 注册指令只支持群内发送。
- 邮箱固定为 QQ号@qq.com。
- 邀请码有效期 15 分钟。
- 群名片格式为 年龄｜省份｜昵称。
- 用户等级为基础、进阶、优选。
- 取消普通池 / 评分池。
- 基础用户只能匹配基础用户。
- 进阶用户可匹配进阶，可额外选择基础。
- 优选用户可匹配优选，可额外选择进阶和基础。
- QQ 号和照片必须通过双方互相解锁后才可见。
- 评分组只标记异常，不直接驳回。
- 超管确认照片驳回。
- 评分采用 5 个单项 0-10 滑动条。
- 系统对评分员总分取平均。
- 超管可以修改最终分数。
- 超管发布后才出分。
- 最终分数 >= 7 自动成为优选。
- 资料正式提交后 7 天冷静期。
- 注销后 30 天不能重新注册。
- 通知使用邮件 + 站内通知。
- MVP 不做排行榜。
