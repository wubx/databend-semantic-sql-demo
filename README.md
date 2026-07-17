# Databend Semantic Query Lab

一个面向 **Databend** 的 AI 驱动、可治理、可观测语义查询实验平台。语义 Query 到 Databend SQL 的编译使用 Cube Open Source Compiler；自然语言规划、认证资产、治理、安全和可观测由本项目实现。

它将业务问题转换为受治理的 Cube Query 或认证 TPC-H SQL，在执行前完成成员、参数和 SQL 安全校验，然后查询 Databend 并展示真实结果。同时提供可视化语义层、模块化 YAML 维护以及从 Databend 表生成模型草稿的能力。

## 为什么使用 Databend 执行 AI / Semantic Query

自然语言和语义层降低了查询门槛，也会让更多用户提出临时、长尾和跨实体问题。由语义模型编译出的 SQL 可能包含多表 `JOIN`、大范围扫描、`GROUP BY`、聚合、排序、时间计算和复杂过滤；它未必能依赖 OLTP 数据库中常见的逐行 B-tree 索引命中，所需的 CPU、内存、I/O 和并行计算资源也可能明显高于固定报表或点查询。

这类工作负载更适合交给 Databend 这样的云原生分析引擎：

- 面向列式扫描与分析型 SQL，可通过列裁剪和数据裁剪减少无关数据读取；
- 支持分布式并行执行，适合大表扫描、多表关联和高基数聚合；
- 存储与计算解耦，可针对 AI 问数带来的波动和突发负载独立扩展计算资源；
- 让语义层和 LLM 专注于“理解并生成受治理的查询”，由 Databend 承担实际的重计算。

这并不意味着生成的 SQL 可以不做优化。生产环境仍应结合 `EXPLAIN`、查询日志和真实负载，持续优化表设计、数据聚簇、过滤条件、查询并发和计算资源；高频且稳定的问题应优先沉淀为 `Certified Query`、认证 SQL，或在 Cube Server 模式中使用缓存和 Pre-aggregations。

因此，本项目的核心分工是：

```text
LLM 负责理解自然语言
Demo 负责语义约束、治理、安全与可观测
Cube Compiler 负责将 Semantic Query 编译为 Databend SQL
Databend 负责承载复杂 SQL 的分析计算与真实执行
```

## 平台结构

```text
用户 / BI / AI Agent
         │
         ▼
Databend Semantic Query Lab
         │
 ┌───────┼────────┐
 │       │        │
Certified Dynamic  Free SQL
 Query    Cube     Policy
 │       │        │
 └───────┼────────┘
         ▼
    Cube Compiler
         ▼
     SQL Safety
         ▼
      Databend
```

其中：

- `Certified Query` 为高频、已验证问题提供稳定查询计划；
- `Dynamic Cube` 由 LLM 从公开语义成员构造受约束的 Cube Query，包括聚合和 `ungrouped` 明细查询；
- `Free SQL Policy` 控制用户提交的自由 SQL 是否允许进入执行链路；
- `Cube Compiler` 将语义 Query 编译为 Databend SQL；
- `SQL Safety` 对最终 SQL 执行确定性的只读、单语句和 Schema 边界校验；
- `Databend` 负责真实数据存储与 SQL 执行。

```text
业务问题
   │
   ├─ 精确匹配认证查询
   ├─ LLM 生成受约束的 Cube Query（可选）
   └─ 确定性规则路由兜底
   │
   ├─ Semantic 路径：Cube 编译器 → Databend SQL
   └─ TPC-H 路径：认证 SQL Template
   │
   └─ SQL 安全校验 → EXPLAIN / 执行 → Databend → 结果与可观测日志
```

## 主要功能

### AI 语义查询工作台

- 使用自然语言查询订单、销售额、发货、供应商和区域等 TPC-H 业务数据
- 优先匹配认证查询，也可以动态组合受校验的 Cube Query
- 展示查询理解、Cube Query、生成的 Databend SQL、参数和执行结果
- 支持 SQL 校验、`EXPLAIN` 和真实查询执行
- LLM 不可用时自动回退到确定性路由
- 默认记录规划和执行阶段的 JSONL 可观测日志

### 可视化语义层

- 浏览实体、度量、维度、时间维度、分组和实体关系
- 查看业务名称、描述、同义词、枚举、隐私属性和认证查询引用
- 搜索和筛选已发布的语义成员
- 查看实时组装的完整 Runtime Manifest

### Semantic Model 管理

语义模型采用模块化 YAML 维护：

```text
semantic/model.yaml                 # 模型入口和 includes
semantic/entities/*.yaml            # 实体、度量、维度和分组
semantic/relationships.yaml         # 实体关系
semantic/verified-queries.yaml      # 认证查询
semantic/policy.yaml                # AI 与查询治理声明
```

页面支持：

- 在线查看、编辑、校验和发布模块化 YAML
- 发布前组装完整 Manifest 并执行引用校验和 Cube 编译
- 发布时自动备份旧文件并热重载 Embedded Compiler，无需重启服务
- 安全删除实体；存在 Relationship 或认证查询引用时拒绝删除
- 从 Databend Catalog 选择数据库和表，自动生成可审阅的实体草稿
- 可选使用 LLM 补充业务名称、描述、定义和同义词
- LLM 只能增强业务元数据，不能修改表来源、SQL 表达式、类型、聚合方式、主键和访问权限

### 已包含的认证查询

- `S1`：订单总数
- `S2`：按订单状态统计订单金额
- `S3`：每月订单金额趋势
- `S4`：按年统计发货商品数量
- `S5`：延迟收货明细数量
- `S6`：运输方式与效率分析
- `S7`：按区域统计订单金额
- `Q1`：TPC-H Pricing Summary Report
- `Q6`：TPC-H Forecasting Revenue Change
- `Q21`：TPC-H Suppliers Who Kept Orders Waiting

## 运行架构

项目支持两种 Semantic Gateway。

### Embedded 模式（推荐用于本地 Demo）

```text
Browser → Demo Server :4100 → Embedded Cube Compiler → Databend
```

Cube Schema Compiler 和 `DatabendQuery` SQL Dialect 直接运行在 Demo 的 Node.js 进程中，不需要另外启动 Cube Server。

保留的能力：

- Cube YAML 编译
- Measures、Dimensions、Segments、Filters、Joins、Order、Limit 和 `ungrouped` 明细查询
- Databend SQL 生成及参数绑定
- Cube 成员别名映射

不包含 Cube Server 的以下运行时能力：

- Query Orchestrator 和缓存
- Pre-aggregations
- Cube Security Context 和 Access Policy Enforcement
- Cube `/meta`、`/sql`、`/load`、SQL API 和 Playground

生产环境如需缓存、预聚合和运行时访问策略，建议使用 `cube-server` 模式。

### Cube Server 模式

```text
Browser → Demo Server :4100 → Cube Server :4000 → Databend
```

通过 Cube HTTP API 完成语义查询，适合需要完整 Cube Runtime 能力的环境。

## 环境要求

- Node.js 20 或更高版本
- npm
- 可访问的 Databend
- 已加载 TPC-H SF100 数据的 `tpch_100` 数据库
- 一个只读 Databend 用户
- Embedded 模式当前需要一份兼容且已经构建完成的 Cube 源码；推荐使用 [`wubx/cube`](https://github.com/wubx/cube) 的 `feat/databend-driver` 分支
- LLM 是可选项；未配置 LLM 时认证查询和确定性路由仍可运行

## 快速开始：Embedded 模式

### 1. 准备已构建的 Cube（Embedded 模式当前必需）

当前 Embedded Gateway 直接加载 Cube Schema Compiler 和尚未发布到 npm 的 Databend SQL Dialect，因此需要一份包含 Databend Driver 且已经构建完成的 Cube 仓库。推荐使用：

```text
Repository: https://github.com/wubx/cube
Branch:     feat/databend-driver
```

如果本机已经有这份仓库，并且以下目录存在，可以跳过 clone、依赖安装和构建，直接在下一步配置 `CUBE_REPOSITORY_PATH`：

```text
packages/cubejs-schema-compiler/dist
packages/cubejs-databend-driver/dist
```

首次准备时执行：

```bash
git clone --branch feat/databend-driver https://github.com/wubx/cube.git
cd cube
yarn install
yarn build
```

`CUBE_REPOSITORY_PATH` 必须设置为该 Cube 仓库的绝对路径，而不是某个 `packages/` 子目录。

> 这不是每次启动都要执行的步骤。只有首次准备、切换 Cube 版本、清理构建产物或修改 Schema Compiler / Databend Driver 后才需要重新构建。当前 Embedded 模式使用 Cube 内部编译器 API，因此 Demo 与 Cube 分支需要保持兼容。后续将 Schema Compiler 和 Databend Dialect 改为项目依赖后，可以移除此要求。

### 2. 安装 Demo 依赖

```bash
git clone https://github.com/wubx/databend-semantic-query-lab.git
cd databend-semantic-query-lab
npm install
```

### 3. 创建配置

```bash
cp .env.example .env
```

编辑 `.env`，最小配置如下：

```env
SEMANTIC_GATEWAY=embedded
CUBE_REPOSITORY_PATH=/absolute/path/to/cube
DATABEND_DSN=databend://readonly_user:password@databend-host:8000/tpch_100?sslmode=disable

PORT=4100
AI_ENABLED=false
MODELER_PUBLISH_ENABLED=false
```

注意：

- 使用只读 Databend 账户
- 如果用户名或密码中含有 `@`、`:`、`/`、`#` 等字符，需要进行 URL 编码
- Databend Cloud 请根据实际连接信息配置主机、端口和 TLS 参数
- `.env` 已被 Git 忽略，不要把真实密码或 API Key 写入 `.env.example`

### 4. 启动服务

```bash
npm start
```

开发时可以使用自动重启模式：

```bash
npm run dev
```

打开：

```text
http://localhost:4100
```

### 5. 检查运行状态

```bash
curl http://localhost:4100/api/health
```

正常响应应满足：

```json
{
  "ok": true,
  "checks": {
    "api": { "ok": true },
    "cube": { "ok": true },
    "databend": { "ok": true }
  },
  "semanticGateway": "embedded"
}
```

如果 `cube.ok` 为 `false`，优先检查 `CUBE_REPOSITORY_PATH` 是否指向 [`wubx/cube`](https://github.com/wubx/cube) 的 `feat/databend-driver` 分支，以及该仓库是否存在所需的 `dist` 构建产物；如果 `databend.ok` 为 `false`，检查 DSN、网络、TLS、用户权限和 `tpch_100` 数据库。

## 使用 Cube Server 模式

是的，当前 Cube Server 也应使用 [`wubx/cube`](https://github.com/wubx/cube) 的 `feat/databend-driver` 分支。该分支包含：

- `@cubejs-backend/databend-driver`；
- `dbType: databend` 的 Server Core 注册；
- Databend SQL Dialect；
- Cube Server 连接 Databend 所需的 Driver 依赖配置。

上游 Cube 或普通已发布版本在尚未包含这些改动时，不能直接作为本 Demo 的 Databend Cube Server。

准备 Cube Server 源码：

```bash
git clone --branch feat/databend-driver https://github.com/wubx/cube.git
cd cube
yarn install
yarn build
```

然后按照该分支的 Cube Server 配置启动一个能够连接 Databend 且已加载对应 Cube Model 的服务。Demo 侧修改 `.env`：

```env
SEMANTIC_GATEWAY=cube-server
CUBE_API_URL=http://localhost:4000/cubejs-api/v1
CUBE_API_SECRET=replace-with-a-local-secret

DATABEND_DSN=databend://readonly_user:password@databend-host:8000/tpch_100?sslmode=disable
```

再启动 Demo：

```bash
npm start
```

Cube Server 模式下，`CUBE_REPOSITORY_PATH` 不由 Demo 进程使用，但运行在 `:4000` 的独立 Cube Server 当前仍应从上述 `feat/databend-driver` 分支构建和启动。详细能力边界见 [`docs/embedded-cube-compiler.md`](./docs/embedded-cube-compiler.md)。

## 启用 LLM

项目支持 OpenAI-compatible Chat Completions API。LLM 仅用于：

- 在认证查询之后进行受约束的动态 Cube Query 规划
- 根据真实查询结果生成简短摘要
- 为生成的 Semantic Model 草稿补充业务元数据

配置：

```env
AI_ENABLED=true
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace-with-your-api-key
AI_MODEL=gpt-4.1-mini
AI_REQUEST_TIMEOUT_MS=30000

MODELER_AI_TIMEOUT_MS=90000
MODELER_AI_MAX_TOKENS=1800
```

如果访问外部模型需要代理：

```env
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
NO_PROXY=127.0.0.1,localhost,databend-host
```

LLM 返回结果仍需经过本地成员、成员类型、Filter Operator、枚举值、时间粒度和 Limit 校验。LLM 不直接生成或执行 SQL。

## 启用模型发布

默认只允许生成和校验草稿，不允许写入语义源文件：

```env
MODELER_PUBLISH_ENABLED=false
```

需要在本地维护模型时，显式开启：

```env
MODELER_PUBLISH_ENABLED=true
```

开启后，可以在“语义层”页面中：

1. 从 Databend 表生成模型草稿；
2. 人工检查并直接修改 YAML；
3. 校验完整 Manifest 和 Cube 编译结果；
4. 发布到 `semantic/entities/`；
5. 编辑现有模块化 YAML；
6. 删除无引用的实体。

发布或删除前，旧文件会保存到：

```text
semantic/backups/
```

模块化 YAML 发布成功后会热重载 Embedded Compiler，通常不需要重启服务。以下情况仍需重启：

- 修改 `.env` 或其他进程级环境变量；
- 修改服务端 JavaScript 代码且未使用 `npm run dev`；
- 切换 `SEMANTIC_GATEWAY`；
- 更换或重新构建 `CUBE_REPOSITORY_PATH` 指向的 Cube 编译器代码。

需要维护认证 SQL 时，单独开启：

```env
CERTIFIED_SQL_PUBLISH_ENABLED=true
```

开启后，“语义层 → 认证 SQL”支持新建、修改、参数 Schema 校验、SQL Safety、`EXPLAIN`、发布和删除。Q1、Q6、Q21 的元数据与 SQL Template 位于：

```text
semantic/certified-sql/queries.yaml
semantic/certified-sql/templates/*.sql
```

发布和删除会自动备份到 `semantic/certified-sql/backups/`，Catalog 按请求实时读取，发布后无需重启。共享演示环境建议保持该开关为 `false`。

## 构建和校验语义模型

将模块化语义源确定性组装为运行时产物：

```bash
npm run build:semantic
```

产物写入未纳入 Git 的 `generated/`：

```text
generated/semantic-manifest.yaml
# 以及 Cube Model、LLM Member Catalog 和认证查询 Catalog
```

运行单元测试：

```bash
npm test
```

连接真实 Databend，编译并执行 `S1`–`S7`：

```bash
npm run verify:runtime
```

验证运行时 Cube Metadata：

```bash
npm run validate:meta
```

输出认证查询报告：

```bash
npm run report:queries
```

## 局域网访问

服务默认监听：

```env
HOST=0.0.0.0
PORT=4100
```

因此同一局域网中的其他设备可以通过运行 Demo 的机器 IP 访问。例如服务器地址为 `192.168.1.5`：

```text
http://192.168.1.5:4100
```

在 macOS 上可查询当前 Wi-Fi 地址：

```bash
ipconfig getifaddr en0
```

Linux 常用命令：

```bash
hostname -I
```

如果局域网设备无法连接，请检查：

- 两台设备是否位于同一局域网或可路由网段；
- 系统防火墙是否允许 Node.js 或 TCP `4100` 端口；
- 路由器是否启用了 AP / Client Isolation；
- 公司网络或 VPN 是否阻断设备间访问；
- 页面应使用服务端机器的局域网 IP，不能在其他设备上访问 `localhost:4100`。

只允许本机访问时设置：

```env
HOST=127.0.0.1
```

修改 `HOST` 或 `PORT` 后需要重启服务。

> **安全警告：** 当前 Demo 没有登录、用户隔离、TLS、CSRF 防护和接口级授权。开放到局域网后，局域网用户可以调用查询、`EXPLAIN` 和执行接口；如果 `MODELER_PUBLISH_ENABLED=true`，还可以修改或删除语义模型。建议使用只读 Databend 账户，并在共享演示时保持 `MODELER_PUBLISH_ENABLED=false`、限制主机防火墙来源。不要直接暴露到公网。需要多人长期使用时，应在前面增加带认证和 HTTPS 的反向代理，并使用 Cube Server 承担运行时访问治理。

## 页面使用

启动后可在本机访问 `http://localhost:4100`；启用默认局域网监听时，也可通过 `http://<服务器局域网IP>:4100` 访问。

### 查询页面

1. 输入业务问题或选择示例；
2. 选择 `Auto`、`Semantic` 或 `TPC-H` 模式；
3. 生成查询计划；
4. 查看 Cube Query 和 Databend SQL；
5. 执行校验、`EXPLAIN` 或真实查询；
6. 查看结果、耗时和请求信息。

### 语义层页面

- **语义模型**：按实体和成员浏览业务语义层
- **关系图**：查看实体间 Join 关系
- **认证查询**：查看已验证的问题和 Cube Query
- **认证 SQL**：管理 Q1、Q6、Q21 等受控 SQL Template，支持参数 Schema、校验、`EXPLAIN` 和发布
- **原始 YAML**：查看、编辑、校验和发布模块化语义源
- **生成模型**：选择 Databend 数据库和表，生成规则草稿或 LLM 增强草稿

## 常用配置

| 环境变量                        | 默认值                             | 说明                                      |
| ------------------------------- | ---------------------------------- | ----------------------------------------- |
| `HOST`                          | `0.0.0.0`                          | 监听地址；默认允许局域网访问              |
| `PORT`                          | `4100`                             | Demo HTTP 端口                            |
| `SEMANTIC_GATEWAY`              | `embedded`                         | `embedded` 或 `cube-server`               |
| `CUBE_REPOSITORY_PATH`          | 无                                 | Embedded 模式下已构建 Cube 仓库的绝对路径 |
| `CUBE_API_URL`                  | 无                                 | Cube Server API 地址                      |
| `CUBE_API_SECRET`               | 无                                 | Cube Server API Secret                    |
| `DATABEND_DSN`                  | 无                                 | Databend 连接字符串，建议使用只读用户     |
| `RESULT_ROW_LIMIT`              | `500`                              | 单次返回的最大行数                        |
| `AI_ENABLED`                    | `false`                            | 是否启用 LLM 规划、摘要和模型增强         |
| `AI_BASE_URL`                   | OpenAI API                         | OpenAI-compatible API 地址                |
| `AI_MODEL`                      | `gpt-4.1-mini`                     | 模型名称                                  |
| `MODELER_PUBLISH_ENABLED`       | `false`                            | 是否允许写入、替换和删除语义源文件        |
| `CERTIFIED_SQL_PUBLISH_ENABLED` | `false`                            | 是否允许新增、修改和删除认证 SQL          |
| `MODEL_GENERATOR_MAX_TABLES`    | `20`                               | 单次最多生成的表数量                      |
| `QUERY_LOG_ENABLED`             | `true`                             | 是否记录查询可观测日志                    |
| `QUERY_LOG_PATH`                | `logs/query-observability.jsonl`   | 查询日志文件                              |
| `LLM_LOG_ENABLED`               | `true`                             | 是否记录 LLM 请求和 RAW 响应              |
| `LLM_LOG_PATH`                  | `logs/llm-observability.jsonl`     | LLM 交互日志文件                          |
| `MODELER_LOG_PATH`              | `logs/modeler-observability.jsonl` | 模型生成日志文件                          |

完整示例见 [`.env.example`](./.env.example)。

## 项目结构

```text
.
├── public/                         # 无框架 Web UI
├── semantic/
│   ├── model.yaml                 # 模型入口
│   ├── entities/                  # 模块化实体模型
│   ├── certified-sql/            # 认证 SQL Catalog、模板和备份
│   ├── relationships.yaml         # 关系定义
│   ├── verified-queries.yaml      # 认证查询
│   ├── policy.yaml                # AI / 查询 Policy 声明
│   └── backups/                   # 发布和删除前的自动备份
├── src/
│   ├── server.js                  # Express API 和静态站点
│   ├── planner.js                 # 查询规划与路由
│   ├── semantic-gateway/          # Embedded / Cube Server Gateway
│   ├── semantic-assembler.js      # 模块化 Manifest 组装
│   ├── semantic-source-editor.js  # YAML 校验、发布和删除
│   ├── model-generator.js         # Databend Catalog → 实体草稿
│   ├── model-enricher.js          # 受约束的 LLM 元数据增强
│   ├── compiler.js                # Cube Model 与 Catalog 编译
│   └── sql-safety.js              # 只读 SQL 安全校验
├── test/                           # Node.js 单元和回归测试
├── docs/                           # 设计和运行文档
└── generated/                      # 构建产物，不提交 Git
```

## 安全边界

这是一个 Demo，但仍建议遵守以下规则：

- 始终使用只读 Databend 账户；
- 不要在 Git 中提交 `.env`、DSN、Token 或 API Key；
- SQL Safety 只允许单条只读查询，并限制访问 `tpch_100`；
- LLM 不直接生成 SQL，只能选择认证查询或构造受校验的 Cube Query；
- 所有模型发布必须显式设置 `MODELER_PUBLISH_ENABLED=true`；
- 模型发布前会执行完整 Manifest 校验和 Cube 编译；
- Embedded 模式不包含 Cube Server 的 Security Context 和访问策略；生产治理场景应使用 Cube Server。

> `semantic/policy.yaml` 当前会进入 Manifest 和 LLM 上下文，但其中部分字段仍属于声明性治理元数据，不等同于完整的运行时 Policy Engine。最终安全边界以服务端成员校验、SQL Safety、只读数据库账号和 Cube Runtime 配置为准。

## 可观测性

默认日志：

```text
logs/query-observability.jsonl
logs/llm-observability.jsonl
logs/modeler-observability.jsonl
```

查询日志记录问题、路由结果、Cube Query、最终 SQL、阶段耗时、降级原因、Policy 决策和执行结果；LLM 日志记录发送给模型的完整请求、Provider RAW 响应、解析结果、Token Usage、耗时和超时错误（不记录 API Key 或 Authorization Header）；模型日志记录 Catalog 读取、规则生成、LLM 增强、回退原因和总耗时。

详细格式见：

- [`docs/query-observability-log.md`](./docs/query-observability-log.md)
- [`docs/validation-and-regression.md`](./docs/validation-and-regression.md)

## 进一步阅读

- [自然语言查询验证手册](./docs/natural-language-query-examples.md)
- [Embedded Cube Compiler 模式](./docs/embedded-cube-compiler.md)
- [Semantic Manifest 维护设计](./docs/semantic-manifest-maintenance.md)
- [验证和回归测试](./docs/validation-and-regression.md)
- [查询可观测日志](./docs/query-observability-log.md)
- [Snowflake Semantic View 字段参考](./docs/snowflake-semantic-view-reference.md)
- [Snowflake 与 Cube 语义层设计对比](./docs/snowflake-vs-cube-combined-semantic-layer.md)
- [项目计划与验收条件](./PLAN.md)

## License

Apache-2.0
