# 自然语言查询验证手册

本文提供一组可以直接粘贴到 **Databend Semantic Query Lab** 的测试问题，用于分别验证：

1. 内置认证查询（Certified Query）；
2. 确定性本地路由；
3. LLM 动态生成 Cube Query；
4. LLM 选择带参数的认证 SQL；
5. 不受支持问题的安全拒绝。

## 运行前检查

启动 Demo 后先检查：

```bash
curl http://localhost:4100/api/health
```

至少应看到：

```json
{
  "ok": true,
  "checks": {
    "api": { "ok": true },
    "cube": { "ok": true },
    "databend": { "ok": true }
  }
}
```

页面地址：

```text
http://localhost:4100
```

为了观察路由结果，重点查看页面中的：

```text
Query ID
Route
Planner / Query Understanding
Cube Query
Generated Databend SQL
```

## 三类问题如何区分

| 类别                |           是否需要 LLM | 预期 Query ID                | 预期 Planner / Strategy                    |
| ------------------- | ---------------------: | ---------------------------- | ------------------------------------------ |
| 内置认证查询        |                     否 | `S1`–`S7`、`Q1`、`Q6`、`Q21` | `certified-exact-match` 或 `deterministic` |
| 确定性规则匹配      |                     否 | 已有认证 Query ID            | `deterministic`                            |
| LLM 动态 Cube Query |                     是 | `DYNAMIC`                    | `llm` + `dynamic`                          |
| LLM 选择认证查询    | 是，但精确匹配不能命中 | 已有认证 Query ID            | `llm` + `certified`                        |
| 安全拒绝            |                   可选 | 无                           | `supported: false`                         |

> **说明：** 系统总是先做认证查询的精确匹配。即使 `AI_ENABLED=true`，与内置问题或示例完全相同的问题也不会调用 LLM。要验证动态 Cube Query，应使用本文“LLM 动态 Cube Query”中的组合型新问题。

## 一、内置认证 Semantic Query

以下问题来自 `semantic/verified-queries.yaml`，不需要配置 LLM。建议将页面模式设为 `Auto` 或 `Semantic`。

### S1：订单总数

直接输入：

```text
订单总数是多少？
```

也可以验证同义表达：

```text
一共有多少订单
统计订单数量
```

预期：

```text
Query ID: S1
Route: semantic
Cube Query: measures = [Orders.count]
```

### S2：按状态统计订单金额

```text
按订单状态统计订单金额。
```

其他内置表达：

```text
各状态订单金额是多少
订单金额按状态分组
```

预期 Cube Query 包含：

```json
{
  "measures": ["Orders.count", "Orders.totalPrice"],
  "dimensions": ["Orders.status"]
}
```

### S3：月度订单金额趋势

```text
每月订单金额趋势是什么？
```

其他内置表达：

```text
按月统计订单金额
订单金额月度变化
```

预期：

```text
Query ID: S3
Time Dimension: Orders.orderDate
Granularity: month
Measure: Orders.totalPrice
```

### S4：年度发货商品数量

```text
按年统计发货商品数量。
```

其他内置表达：

```text
每年发货多少商品
发货数量年度趋势
```

预期：

```text
Query ID: S4
Measure: LineItem.totalQuantity
Time Dimension: LineItem.shipDate / year
```

### S5：延迟收货分组

```text
统计延迟收货的明细数量。
```

其他内置表达：

```text
有多少延迟收货明细
延迟交付明细数量
```

预期：

```text
Query ID: S5
Measure: LineItem.count
Segment: LineItem.delayedReceipt
```

### S6：运输方式效率

```text
分析运输方式及效率。
```

其他内置表达：

```text
各运输方式的运输效率
比较不同运输方式的延迟率
哪种运输方式效率最高
```

预期 Cube Query 包含：

```json
{
  "measures": [
    "LineItem.count",
    "LineItem.totalQuantity",
    "LineItem.delayedCount",
    "LineItem.averageTransitDays",
    "LineItem.averageDelayDays"
  ],
  "dimensions": ["LineItem.shipMode"]
}
```

### S7：区域订单金额

```text
按区域统计订单金额。
```

其他内置表达：

```text
各区域订单金额是多少
区域销售额排名
```

预期：

```text
Query ID: S7
Measures: Orders.count, Orders.totalPrice
Dimension: Region.name
Join Chain: Orders → Customer → Nation → Region
```

## 二、内置认证 TPC-H SQL

以下问题使用经过认证的 SQL Template，而不是动态生成 SQL。建议使用 `Auto` 或 `TPC-H` 模式。

### Q1：定价汇总报表

```text
执行 TPC-H Q1 定价汇总报表。
```

其他内置表达：

```text
执行 TPC-H Q1
运行 Q1 定价汇总报表
TPC-H Q1
```

预期：

```text
Query ID: Q1
Route: tpch
SQL Source: certified template
```

### Q6：带参数的收入预测

```text
执行 Q6，折扣在 5% 到 7% 之间，数量小于 24。
```

验证参数提取：

```text
执行 Q6，查询 1995-01-01 到 1996-01-01，折扣在 4% 到 6% 之间，数量小于 20。
```

预期参数：

```json
{
  "startDate": "1995-01-01",
  "endDate": "1996-01-01",
  "discountMin": 0.04,
  "discountMax": 0.06,
  "quantity": 20
}
```

### Q21：等待订单供应商

```text
查询沙特阿拉伯导致已完成订单等待的供应商。
```

其他内置表达：

```text
执行 TPC-H Q21
查询沙特阿拉伯等待订单的供应商
运行 Q21
```

预期：

```text
Query ID: Q21
Route: tpch
Nation Parameter: SAUDI ARABIA
```

## 三、确定性本地路由

以下问题不与认证示例完全相同，但能被本地规则匹配。将：

```env
AI_ENABLED=false
```

重启服务，然后使用 `Auto` 模式。

### 订单数量规则

```text
请告诉我当前订单总数有多少
```

预期：

```text
Query ID: S1
Planner: deterministic
```

### 状态与金额规则

```text
我想看各状态对应的销售额
```

预期：

```text
Query ID: S2
Planner: deterministic
```

### 月度趋势规则

```text
请展示订单金额的月度变化情况
```

预期：

```text
Query ID: S3
Planner: deterministic
```

### Q6 参数规则

```text
做收入预测，时间从 1994-01-01 到 1995-01-01，折扣 3% 到 5%，数量少于 18
```

预期：

```text
Query ID: Q6
Planner: deterministic
discountMin: 0.03
discountMax: 0.05
quantity: 18
```

## 四、LLM 动态 Cube Query

先配置并重启：

```env
AI_ENABLED=true
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace-with-your-api-key
AI_MODEL=gpt-4.1-mini
```

使用页面的 `Auto` 或 `Semantic` 模式。以下问题刻意避开现有认证问题的精确表达，要求 LLM 从公开语义成员组合新的 Cube Query。

> LLM 的具体 `order`、`limit` 或附加成员可能略有差异。验收重点是 `Query ID = DYNAMIC`、成员合法、语义正确，以及 SQL 可以通过安全校验。若出现 `fallback`，说明 LLM 调用失败或输出没有通过本地校验，并非动态路径成功。

### 动态单实体查询

#### 按订单优先级统计

```text
按订单优先级统计订单数量，并按数量从高到低排序。
```

期望核心 Cube Query：

```json
{
  "measures": ["Orders.count"],
  "dimensions": ["Orders.priority"],
  "order": { "Orders.count": "desc" }
}
```

#### 按客户市场细分统计客户

```text
按客户市场细分统计客户数量，返回数量最多的前 10 个细分。
```

期望核心成员：

```text
Customer.count
Customer.marketSegment
limit: 10
```

#### 按商品品牌统计商品

```text
按商品品牌统计商品数量，按商品数量降序，最多返回 20 行。
```

期望核心成员：

```text
Part.count
Part.brand
limit: 20
```

#### 按商品制造商汇总零售价格候选值

```text
按制造商汇总商品的零售价格候选值，并同时显示商品数量。
```

期望核心成员：

```text
Part.totalRetailprice
Part.count
Part.mfgr
```

该模型明确声明零售价格合计是待确认草稿指标，不应将结果解释为销售收入。

### 动态时间查询

#### 季度订单金额趋势

```text
按季度展示订单金额趋势，并按季度升序排列。
```

期望核心 Cube Query：

```json
{
  "measures": ["Orders.totalPrice"],
  "timeDimensions": [
    {
      "dimension": "Orders.orderDate",
      "granularity": "quarter"
    }
  ]
}
```

这是很好的动态验证问题，因为认证查询 `S3` 只定义了 `month`，这里要求 LLM 组合 `quarter`。

#### 每月折扣后收入

```text
按月展示折扣后收入趋势，使用发货日期并按时间升序。
```

期望核心成员：

```text
LineItem.discountedRevenue
LineItem.shipDate / month
```

### 动态 Filter 和 Segment

#### 仅查看已完成订单

```text
统计已完成订单的订单数量和订单金额。
```

期望使用：

```text
Segment: Orders.fulfilled
Measures: Orders.count, Orders.totalPrice
```

#### 状态过滤

```text
只看订单状态为 F 的订单，统计订单数量和订单金额。
```

期望核心 Filter：

```json
{
  "member": "Orders.status",
  "operator": "equals",
  "values": ["F"]
}
```

#### 延迟明细按运输方式分析

```text
只统计延迟收货的订单明细，按运输方式展示明细数量和平均延迟天数。
```

期望核心成员：

```text
Segment: LineItem.delayedReceipt
Dimension: LineItem.shipMode
Measures: LineItem.count, LineItem.averageDelayDays
```

### 动态 Join 查询

#### 按客户市场细分统计订单金额

```text
按客户市场细分统计订单数量和订单金额，按订单金额降序。
```

期望核心成员：

```text
Orders.count
Orders.totalPrice
Customer.marketSegment
Join: Orders → Customer
```

#### 按国家统计订单金额

```text
按客户所属国家统计订单数量和订单金额，返回订单金额最高的前 15 个国家。
```

期望核心成员：

```text
Orders.count
Orders.totalPrice
Nation.name
Join Chain: Orders → Customer → Nation
limit: 15
```

#### 按商品品牌统计折扣后收入

```text
按商品品牌统计折扣后收入和发货商品数量，按收入降序返回前 20 个品牌。
```

期望核心成员：

```text
LineItem.discountedRevenue
LineItem.totalQuantity
Part.brand
Join: LineItem → Part
limit: 20
```

#### 按供应商国家统计供应商余额

```text
按供应商所属国家统计供应商数量和供应商账户余额总计。
```

期望核心成员：

```text
Supplier.count
Supplier.totalAccountBalance
Nation.name
Join: Supplier → Nation
```

## 五、让 LLM 选择认证查询

要验证 `llm + certified`，问题需要满足两个条件：

1. 不能与 `question` 或 `examples` 完全相同，否则会在 LLM 前被精确匹配；
2. 语义应明显对应某个认证查询，而不是要求新成员组合。

建议问题：

```text
请给我一张不同订单状态下订单笔数与金额的对比表，金额高的排前面。
```

可能选择：

```text
Query ID: S2
Planner: llm
Strategy: certified
```

```text
我想比较各种配送方式的明细量、发货量、延误数量、平均运输时间和平均延误时间。
```

可能选择：

```text
Query ID: S6
Planner: llm
Strategy: certified
```

```text
请运行标准的供应商等待订单分析，关注沙特阿拉伯的供应商。
```

可能选择：

```text
Query ID: Q21
Planner: llm
Strategy: certified
```

LLM 也可能对前两个问题选择语义等价的 `DYNAMIC`。如果必须稳定验证 Certified 路径，应直接使用第一、二节中的精确内置问题。

## 六、`allow_free_sql` 与自由 SQL 测试

`semantic/policy.yaml` 中的配置：

```yaml
ai_policy:
  allow_free_sql: true
```

控制的是：**是否允许 `/api/query/execute-sql` 执行不是由 Cube Compiler 生成、也不是来自认证 SQL Template 的用户自带 SQL**。

它不控制自然语言同义词匹配，也不会让 LLM 直接生成 SQL。自然语言规划仍然优先走：

```text
认证查询精确匹配
→ LLM 选择认证查询
→ LLM 动态生成受约束的 Cube Query
→ Cube Compiler 生成 SQL
```

### 三种 SQL 来源

查询日志中的 `sqlOrigin` 用于区分：

| `sqlOrigin`      | 含义                                   | 是否使用 `allow_free_sql` |
| ---------------- | -------------------------------------- | ------------------------- |
| `cube-generated` | Cube Query 经 Cube Compiler 生成的 SQL | 否                        |
| `certified-sql`  | 认证 SQL Template 生成的 SQL           | 否                        |
| `free-sql`       | 用户直接提交、无法验证来源的 SQL       | 是                        |

因此，即使设置：

```yaml
allow_free_sql: false
```

正常的 Semantic 查询和认证 SQL 仍然可以执行；只有 `free-sql` 会被拒绝。

### 验证允许自由 SQL

默认示例配置为：

```yaml
ai_policy:
  allow_free_sql: true
```

可以直接调用执行接口测试：

```bash
curl -X POST http://127.0.0.1:4100/api/query/execute-sql \
  -H 'Content-Type: application/json' \
  -d '{
    "question": "查看订单表前十条记录",
    "sql": "SELECT * FROM tpch_100.orders LIMIT 10"
  }'
```

预期请求被 SQL Safety 校验后执行，返回计划中包含：

```json
{
  "plan": {
    "route": "free-sql",
    "queryId": "FREE_SQL",
    "planner": "user-supplied-sql",
    "sqlOrigin": "free-sql",
    "policy": {
      "allowFreeSql": true,
      "usedAllowFreeSql": true,
      "decision": "allowed"
    }
  }
}
```

### 验证关闭自由 SQL

将配置改为：

```yaml
ai_policy:
  allow_free_sql: false
```

重启服务后再次提交同一请求，预期返回：

```text
HTTP 403
当前 Semantic Policy 禁止执行自由 SQL
```

响应中的策略证据为：

```json
{
  "policy": {
    "allowFreeSql": false,
    "usedAllowFreeSql": true,
    "decision": "denied"
  }
}
```

### `allow_free_sql=true` 不代表任意 SQL 都能运行

自由 SQL 仍然必须通过 `src/sql-safety.js` 的安全检查：

- 只允许单条 `SELECT` 或 `WITH ... SELECT`；
- 禁止 `INSERT`、`UPDATE`、`DELETE`、DDL 和管理命令；
- 禁止多语句 SQL；
- 数据表必须显式使用允许的 schema；
- 当前允许访问 `tpch_100` 和 `information_schema`。

例如以下请求即使开启 `allow_free_sql` 也会被拒绝：

```sql
DELETE FROM tpch_100.orders;
SELECT * FROM other_schema.orders;
SELECT 1; SELECT 2;
```

### 在页面查看策略决策

打开顶部导航中的“查询日志”，然后选择：

```text
SQL 来源 → 自由 SQL
```

可以查看每次自由 SQL 的：

```text
原始问题
最终 SQL
执行状态和耗时
allow_free_sql · allowed
allow_free_sql · denied
```

也可以通过 API 查询：

```bash
curl 'http://127.0.0.1:4100/api/query-observability?sqlOrigin=free-sql&limit=100'
```

## 七、安全拒绝测试

这些问题用于证明系统不会编造不存在的指标或越过查询边界。

### 未建模指标

```text
计算每个客户的净利润率和未来三个月预测收入。
```

预期：

```text
supported: false
```

原因：模型没有净利润、成本口径或预测指标。

### 未建模业务域

```text
统计员工工资并按部门排名。
```

预期拒绝，因为模型中没有员工、工资或部门实体。

### 写操作

```text
删除所有订单数据。
```

预期拒绝。LLM 不允许生成 SQL，SQL Safety 也禁止 `DELETE`、`UPDATE`、`INSERT`、DDL 和多语句 SQL。

### 不应误用候选指标

```text
按商品品牌统计真实销售收入和净利润。
```

预期拒绝或只在明确解释口径后使用已建模的交易收入指标，不应把 `Part.totalRetailprice` 解释成真实销售收入或净利润。

## 八、推荐验收集

如果只想快速验证三条核心路径，使用以下问题。

### 1. 内置认证查询

```text
按区域统计订单金额。
```

预期：

```text
S7 / semantic / certified-exact-match
```

### 2. 动态 Cube Query

```text
按客户市场细分统计订单数量和订单金额，按订单金额降序。
```

预期：

```text
DYNAMIC / semantic / llm / dynamic
```

### 3. 参数化认证 SQL

```text
执行 Q6，查询 1995-01-01 到 1996-01-01，折扣在 4% 到 6% 之间，数量小于 20。
```

预期：

```text
Q6 / tpch / certified SQL template
```

### 4. 安全拒绝

```text
按部门统计员工工资和净利润。
```

预期：

```text
supported: false
```

## 九、常见问题

### 为什么开启 LLM 后仍然没有调用 LLM？

系统优先执行认证查询精确匹配。输入与内置问题或示例完全一致时，会显示：

```text
method: certified-exact-match
llmUsed: false
```

这是预期行为。

### 为什么显示了 LLM fallback？

常见原因：

- API Key、Base URL、代理或网络错误；
- LLM 请求超时；
- Provider 没有返回合法 JSON；
- 返回了未知成员；
- Measure、Dimension、Segment 使用位置错误；
- Filter Operator、枚举值、时间粒度或 Limit 不合法。

Fallback 表示系统已转用确定性本地路由，不表示动态 Cube Query 验证成功。

### 如何确认 SQL 不是 LLM 直接生成的？

动态路径的响应应先包含受校验的：

```json
{
  "queryId": "DYNAMIC",
  "cubeQuery": {}
}
```

然后由 Cube Compiler 生成 SQL。LLM 输出协议中没有可执行 `sql` 字段。

### `allow_free_sql=true` 会影响自然语言规划吗？

不会。例如：

```text
按订单状态统计订单金额
按订单状态统计订单总额
```

两种表达最终可能都选择 `S2`，原因是认证问题精确匹配、确定性规则或 LLM 同义语义理解，而不是 `allow_free_sql`。

判断本次请求是否真正使用该配置，应查看查询日志：

```json
{
  "sqlOrigin": "free-sql",
  "policy": {
    "usedAllowFreeSql": true,
    "decision": "allowed"
  }
}
```

Cube 生成的 SQL 通常记录为：

```json
{
  "sqlOrigin": "cube-generated",
  "policy": {
    "usedAllowFreeSql": false,
    "decision": "not-applicable"
  }
}
```

### `AI_ENABLED=false` 可以验证什么？

可以验证：

```text
S1–S7
Q1 / Q6 / Q21
确定性规则路由
Cube 编译
SQL Safety
EXPLAIN
Databend 执行
语义层浏览和 YAML 管理
```

不能验证动态 LLM Cube Query、LLM 结果摘要和 LLM 模型元数据增强。
