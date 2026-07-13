# Date System-即将更名为TenMatch

面向 QQ 群成员的资料匹配 Web 系统。

> 生产环境或事故恢复请只使用
> [`deploy/README.md`](deploy/README.md)。下方命令仅适用于可随时删除的本地开发数据；
> 禁止在生产库运行 `migrate dev`、`migrate reset` 或 `db seed`。

完整产品与技术规格见：

- [项目核心架构](docs/PROJECT_SPEC.md)
- [Email联动](docs/email-smtp.md)
- [Qbot联动](docs/qqbot-napcat.md)

---

## 开发环境搭建指南

### 前置要求

- [Node.js](https://nodejs.org/) 24.x
- [pnpm](https://pnpm.io/) 11.7.0
- [Docker](https://www.docker.com/) + Docker Compose

### 1. 克隆项目

```bash
git clone <repo-url>
cd date-system
```

### 2. 安装依赖

```bash
pnpm install --frozen-lockfile
```

### 3. 配置环境变量

```bash
cp .env.example .env.local
cp deploy/infra.env.example deploy/infra.env
```

分别填写两个文件中的本地开发值，并保证 PostgreSQL、Redis、MinIO 的用户名和密码一致。
这两个实际环境文件均已被 Git 忽略，不能提交。

### 4. 启动基础设施

```bash
docker compose --env-file deploy/infra.env up -d postgres redis minio
```

这将启动以下服务：

| 服务          | 端口                       | 说明                        |
| ------------- | -------------------------- | --------------------------- |
| PostgreSQL 16 | 5432                       | 数据库                      |
| Redis 7       | 6379                       | 缓存/队列                   |
| MinIO         | 9000 (API) / 9001 (控制台) | S3 兼容对象存储（照片上传） |

### 5. 初始化数据库

**创建或更新本地开发数据库：**

```bash
pnpm exec prisma migrate dev
```

**可选：重新填充本地测试数据：**

```bash
pnpm exec prisma db seed
```

> ⚠️ `db seed` 会先 **清空所有表**。它只适用于可随时删除的本地开发库。

### 6. 启动开发服务器

```bash
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)

---

## 测试账号

Seed 创建的所有账号密码均为：**`password1`**

| QQ 号   | 角色        | 昵称       | 说明                   |
| ------- | ----------- | ---------- | ---------------------- |
| `00001` | SUPER_ADMIN | 超级管理员 | 最高权限，管理所有功能 |
| `00002` | ADMIN       | 管理员小明 | 管理用户、邀请码、举报 |
| `00003` | SCORER      | 评分官1号  | 照片评分权限           |
| `00004` | SCORER      | 评分官2号  | 照片评分权限           |
| `10001` | USER        | 用户小红   | 已有资料（普通用户）   |
| `10002` | USER        | 用户小蓝   | 已有资料（普通用户）   |
| `10003` | USER        | 用户小绿   | 已有资料（普通用户）   |
| `10004` | USER        | 用户小紫   | 已有资料（普通用户）   |
| `10005` | USER        | 用户小橙   | 已有资料（普通用户）   |

### 邀请码

| 邀请码        | 状态      | 用途             |
| ------------- | --------- | ---------------- |
| `WELCOME2024` | ✅ 可用   | 新用户注册时使用 |
| `TESTCODE01`  | ✅ 可用   | 新用户注册时使用 |
| `USEDCODE01`  | ❌ 已使用 | —                |
| `EXPIRED01`   | ❌ 已过期 | —                |

---

## 常用命令

```bash
# 开发
pnpm dev                        # 启动开发服务器
pnpm build                      # 生产构建
pnpm lint                       # 代码检查

# 数据库
pnpm exec prisma migrate dev    # 仅本地开发迁移
pnpm exec prisma db seed        # 仅本地清空并填充测试数据
pnpm exec prisma studio         # 打开数据库可视化管理界面

# Docker
docker compose --env-file deploy/infra.env up -d postgres redis minio
docker compose --env-file deploy/infra.env down

# 生产部署、数据恢复和 systemd 操作只参考 deploy/README.md
```

---

## 技术栈

- Next.js 16 + React 19 + TypeScript
- PostgreSQL + Prisma ORM
- Redis + BullMQ
- MinIO (S3 兼容对象存储)
- Vanilla CSS (dark mode)

## V1 核心范围

- QQ OAuth 登录
- 管理员邀请码认证群成员身份
- 用户资料填写、修改、清空
- 照片上传 + 匿名评分系统
- 单池匹配：有照片/无照片用户匹配偏好
- 双向匹配与单向匹配分离
- 单向匹配资料查看申请
- 评分组匿名评分（0-10 分，0.5 步长）
- 评分池 7.0 分线规则
- 举报、警告、冻结、封禁
- 管理后台与审计日志
