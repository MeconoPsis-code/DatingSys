# Date System

面向 QQ 群成员的资料匹配 Web 系统。

完整产品与技术规格见：

- [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md)

## 推荐 V1 技术栈

- Next.js 15
- React
- TypeScript
- PostgreSQL
- Prisma
- Redis + BullMQ
- Tailwind CSS + shadcn/ui，或 Ant Design
- OAuth2 QQ 登录或聚合 OAuth 登录
- S3 兼容对象存储

## V1 核心范围

- QQ OAuth 登录。
- 管理员邀请码认证群成员身份。
- 用户资料填写、修改、清空。
- 普通匹配池与评分匹配池隔离。
- 双向匹配与单项匹配分离。
- 单项匹配资料查看申请。
- 评分组匿名评分。
- 评分池 7 分线规则。
- 举报、警告、冻结、封禁。
- 管理后台与审计日志。

