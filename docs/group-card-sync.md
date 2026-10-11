# 群名片与网站昵称同步

同步规则保持不变：年龄、地区以网站当前生效资料为准，昵称允许网站和 QQ 两端修改。一个用户只有一个网站昵称；该用户在所有有效工作空间 QQ 群中的名片都传播同一昵称。

## 数据规则与冲突裁决

群名片目标格式为 `年龄-省级地区-昵称`。网站昵称仍存放在 `AuthIdentity.nickname`，统一服务在同一事务中更新该用户的全部身份记录。没有网站资料时先同步昵称；资料生效后重新生成完整名片。年龄按上海日期计算，生日在启动补偿或每天上海时间 00:05 后重新生成目标。

QQ 名片能识别普通及全角横线、竖线、斜杠等分隔符。只去掉一层年龄/地区前缀，因此昵称本身像 `24-北京-小明` 时仍能保留。昵称为空、超过现有 30 字符校验，或名片像完整格式但分隔规则无法确定时，不清空或截断网站昵称；保留网站昵称并纠正 QQ 名片。

每个用户先读取所有有效群的新鲜名片，再做一次裁决。不同群的 QQ 时间和通知到达顺序不能证明修改先后；无法可靠排序时，按以下顺序选择 QQ 当前昵称：

1. 用户注册来源工作空间的有效 QQ 群。
2. official 工作空间的有效 QQ 群。
3. 最早加入的有效工作空间；加入时间相同则按工作空间 ID 排序。

已经裁决但还没成功写回的旧群名片会保存基线，下一轮不会再次把网站改回落败昵称。真实的新 QQ 修改仍可成为输入。通知里的时间只辅助同群事件选择、旧事件核实和自身回声识别，不直接决定多群胜者。

尚未初始化的历史用户首次按上述 QQ 当前值优先规则建立基线。已初始化用户新加入另一群时，先沿用其现有全局昵称，避免新群历史名片重命名网站；若有新鲜通知并且当前读回值吻合，则允许加入后的真实 QQ 改名。

## 持久化与运行机制

Prisma 新增的四类记录如下。生产数据库变更通过正式迁移部署。

| 记录 | 职责 |
| --- | --- |
| `UserNicknameSync` | 用户昵称/名片版本、资料指纹、初始化状态、后台待办时间及租约 |
| `GroupCardSyncState` | 每用户每群的期望值、观测值、已裁决基线、确认版本、重试状态与失败原因 |
| `GroupCardSyncInbox` | 先持久提交 QQ 改名通知，再处理；数据库唯一键去重 |
| `GroupCardWriteAttempt` | 调用 QQ 前保存目标和版本；超时或重启后读回核实；自身旧回声识别 |

网站保存数据和生成 outbox 在同一数据库事务中完成。后台由现有单实例 Next.js instrumentation 启动，不依赖尚未部署的 BullMQ worker。每 5 秒检查待办，最多同时处理 4 个不同用户；同用户所有群通过 120 秒租约串行，租约每 15 秒续约。协调器最多同时启动 2 个 NapCat 方法调用，每秒最多启动 2 次。

写入前重新查询 QQ 当前值；若它在本轮裁决后发生变化，放弃旧写入并安排新一轮核实。调用修改接口后立即、延迟 2 秒和再延迟 5 秒读回，匹配目标且版本、租约仍有效才确认成功。超时之后实际已生效也能读回确认。新网站修改不会清除旧执行者的租约；旧版本结果不能把新版本标记成功。

协调器与盘点命令的查询显式传入 `no_cache: true`，并关闭客户端隐式 HTTP 重试，使限速统计对应真实请求。每次修改接口只发出一次请求；超时或 HTTP 错误后先读回核实，由持久任务决定是否重发。群成员退出、工作空间暂停或有新入站名片尚未裁决时，旧读回同样不能确认当前群已同步。

瞬态失败按约 5 秒、30 秒、2 分钟、10 分钟、30 分钟退避并加少量随机变化。明确权限不足或成员不可访问会暂停该群，待权限/成员状态处理后人工重试。QQ 登录健康最多每 30 秒检查一次；离线时保留待办，恢复在线立即补跑。群列表每 10 分钟对账，失败约 1 分钟后再试；空成员列表不作为全群撤销或名片基线。名片对账不会改变入群/退群认证。

`off` 不启动名片协调器的 QQ 访问。默认 `observe` 记录观测，不应用 QQ 改名、不写 QQ、不消费改名 inbox、不更新已裁决基线；网站用户主动保存仍保存网站数据与待办。`active` 才执行双向裁决和写回。可设置 `GROUP_CARD_SYNC_USER_IDS` 为逗号分隔的用户 ID，在 active 阶段仅处理选中的用户；多个群仍作为一个用户的完整批次。

OneBot 没有版本条件写入或 compare-and-set，QQ 查询与修改之间仍存在短暂竞争窗口。租约、写前核实、版本 fencing、持久写入证据和后续对账保证可检测、补偿和收敛，不能把普通修改接口当成跨系统原子提交。

## 历史差异盘点与修复命令

在已加载正式运行环境变量的应用目录运行。命令默认只读取数据库和 QQ，不生成任务，不修改网站、QQ 或同步状态；QQ 查询串行，最多每秒启动 2 次。所有报告均为 JSON。

```bash
pnpm repair:group-card-sync --help
pnpm repair:group-card-sync --limit 100 --output /tmp/group-card-dry-run.json
pnpm repair:group-card-sync --workspace WORKSPACE_ID --limit 100
pnpm repair:group-card-sync --user USER_ID
pnpm repair:group-card-sync --after LAST_USER_ID --limit 100
```

`--workspace` 只筛选用户，仍读取该用户所有有效群。批量按用户 ID 升序；`hasMore=true` 时用 `nextCursor` 作为下一批的 `--after`。`--limit` 允许 1–1000，默认 100；`--user`、`--workspace`、`--after` 可以组合筛选。

报告包括网站昵称、当前网站期望名片、每群实际名片、拟采用昵称/来源群、拟写名片、现有裁决/确认基线、读取错误及分页游标。`differs` 比较实际名片与网站当前期望值；`requiresQqWrite` 比较实际值与本次拟采用目标。`previewComplete=false` 表示有群查询失败，成功读取的群仍可按协调器规则成为输入。

确认具体差异报告及本次代码/迁移后，执行例子如下：

```bash
GROUP_CARD_SYNC_MODE=active GROUP_CARD_SYNC_USER_IDS=USER_ID \
  pnpm repair:group-card-sync --user USER_ID --apply --initialize \
  --output /tmp/group-card-apply.json
```

`--apply` 要求环境模式为 active；选中用户不在非空灰度名单内时，整个批次在生成任务前拒绝。`--initialize` 只用于 apply 的首次基线过程，不清除已有用户的初始化状态或任何已裁决基线；协调器首次成功裁决时初始化。已有初始化用户仍按正常修复规则执行。

apply 首先写入可恢复的最新任务，再由协调器重新查询 QQ 和检查数据库版本。旧报告不会作为写入输入。报告中的 `execution` 给出真实最终昵称和同步状态；租约被其他执行者占用时显示 `queued_worker_busy`，QQ 离线时显示 `queued_qq_offline`，均不冒充已同步成功。`confirmed=true` 才表示所有参与群当前目标均已读回确认。数据查询/处理错误以非零退出码返回；错误后已有持久任务仍会由后台继续处理。

## 部署、灰度和回滚

参照 [生产部署指南](../deploy/README.md) 在维护窗口部署本次隔离发布包和正式迁移。该发布包基于现有生产版本，只增加昵称同步运行时代码；工作空间数据库基础保留原增量迁移及校验和，附带未启用的额外表不会开放收费、CDK、门户、匹配或工作空间权限功能。

1. 检查两项新增迁移、生产迁移基线，并备份数据库。`20261011000000_group_card_sync` 依赖 `20261002000000_platform_v2` 中的工作空间模型；必须按顺序应用。数据库基础迁移同时增加若干未使用的平台表，并给已有记录回填官方工作空间关联，部署前应核对这些 SQL 和实际数据。生产仅使用 `prisma migrate deploy`，不得使用 migrate dev、reset、db push 或 seed。
2. 在与生产一致的环境执行生成、迁移、校验和构建：

   ```bash
   pnpm exec prisma generate
   pnpm exec prisma migrate deploy
   pnpm lint
   pnpm test
   pnpm build
   ```

3. 先以默认 `GROUP_CARD_SYNC_MODE=observe` 部署。检查数据库表、QQ 登录健康及差异报告；确认年龄/地区来自网站，未把通知时间误当多群顺序。不要在这个阶段提前设置所有用户的 `initializedAt`。
检查数据库表时还应将 `Workspace.slug=official` 的 `qqGroupId` 与当前 `BOT_TARGET_GROUP_ID` 对照，并通过 `get_login_info`、刷新成员查询核实机器人账号及群权限。历史迁移可能根据旧记录推断出已停用群号；启用 active 前在受控数据库事务中校正绑定，不修改已应用迁移的文件或校验和。

4. 选取少量用户，设置 active 和 `GROUP_CARD_SYNC_USER_IDS`。先 dry-run 审查，然后 apply；首次历史基线可带 `--initialize`。逐用户查看各群读回、失败原因、版本和界面显示。
5. 分批扩大名单；确认未知冲突来源优先规则符合预期后再清空名单，开启全部用户。分页报告用于审查，每批执行仍重新读当前值。
6. 监控管理员“群名片同步”页面 `/group-card-sync`：仅在 active 且 QQ 健康时提示超过 10 分钟的待办积压；对账长时间没有成功、权限暂停和读回不一致需查明原因。QQ 离线不能用容器 healthy 代替在线证明。

回滚写回时设置 `GROUP_CARD_SYNC_MODE=off` 并按现有单实例部署流程重启应用单元；保留所有 inbox、outbox、版本和未确定写入证据，恢复后继续补偿。不需要为这项功能重启 NapCat 或删除同步表。若回退到迁移前代码，新增表仍保留，避免丢失未完成任务。

## 验证标准

隔离测试应覆盖网站保存后调用失败与重启恢复、回调重复/丢失/迟到、自身回声、未知多群冲突、失败传播防反复回滚、加入新群、空/异常名片、生日日期、写前 QQ 改名、版本和租约失效、离线恢复、权限暂停、observe/off、灰度名单及命令默认只读。

数据库事务和租约需用独立 PostgreSQL 测试库验证，不能仅凭 mock 判断持久性。NapCat 使用可控假客户端；避免发送真实注册 `/signup` 测试。上线验收使用已授权的小批用户改名，并逐群读回、检查签名回调和同步记录；接口 200 或仅网站名称变化不等于同步成功。

### 可重复的隔离验证

`pnpm test` 包含格式、上海生日边界、事件去重、协调器和接口回归测试。未设置 `GROUP_CARD_TEST_DATABASE_URL` 时，PostgreSQL 场景会明确跳过；需要单独执行以下命令验证真实事务：

```powershell
$env:GROUP_CARD_TEST_DATABASE_URL = 'postgresql://TEST_USER:TEST_PASSWORD@127.0.0.1:5432/group_card_sync_test_local'
pnpm test:group-card:postgres
Remove-Item Env:GROUP_CARD_TEST_DATABASE_URL
```

使用独立本机 PostgreSQL 实例和具备创建测试库权限的测试账号。测试只允许回环地址及 `group_card_sync_test*` 库名，拒绝已存在的数据库，也不会回退读取应用的 `DATABASE_URL`。套件自己创建数据库、应用真实增量迁移，在结束时断开连接并删除本次创建的测试库。不要预先创建该数据库。

页面验证命令如下：

```bash
node scripts/qa-group-card-ui.cjs
node scripts/qa-group-card-ui.cjs --dates-only
```

页面验证使用真实页面源码及本机 Chrome/Edge 或 Playwright 浏览器，所有业务 API 均为模拟接口。它会保留临时目录中的 JSON 结果和截图，并关闭测试服务器与浏览器；没有生产账号或真实 QQ 写入。若系统没有 Playwright，可通过 `CODEX_WORKSPACE_NODE_MODULES` 指向已配置的运行时包目录。日期专用场景在美国浏览器时区和可控时钟下验证上海午夜的年龄判断及出生日期展示。
