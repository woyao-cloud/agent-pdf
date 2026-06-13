# 第7章 变量（Variables）与动态交互设计

## 7.1 使用场景

变量是 Grafana 实现动态 Dashboard 的核心机制。通过变量，一个 Dashboard 可以适配不同的环境、服务、时间范围。

> **生活比喻：变量 = Dashboard 的"遥控器"**
>
> 想象你家客厅的电视遥控器，按一个键切换频道，按另一个键调节音量。变量就是 Dashboard 的遥控器——你不需要换一台电视（创建新的 Dashboard），只需按一下按钮（切换变量值），整个界面就切换到另一组数据。变量让一个 Dashboard 变成"万能仪表盘"。

### 场景故事：一份 Dashboard 适配三个环境

> **背景**：某电商平台有开发（dev）、测试（staging）、生产（production）三个环境。运维团队过去为每个环境创建了独立的 Dashboard，每次配置变更都要修改三份 JSON，苦不堪言。
>
> **痛点**：
> - 三个 Dashboard 的布局完全一样，只是数据源和查询条件不同
> - 修改一个面板，要在三个 Dashboard 上重复操作
> - 新成员入职要熟悉三套 Dashboard
>
> **解决方案**：用一个变量 `$environment` 控制所有查询。变量值选择 `dev`，所有面板自动切换到开发环境的数据源和命名空间；选择 `production`，瞬间切换到生产环境。从此只维护一个 Dashboard。

**场景 1：环境切换**
```
选择环境: [Production ▼]  → 所有面板自动切换为生产环境数据
```

**场景 2：链式过滤**
```
选择集群: [prod-us ▼]  →  选择命名空间: [default ▼]  →  选择 Pod: [web-1 ▼]
```

**场景 3：动态时间粒度**
```
$__interval 自动根据时间范围调整采样粒度
查看 1 小时数据 → 15s 粒度
查看 30 天数据 → 1h 粒度
```

**场景 4：多服务对比**
```
选择服务: [All ▼]  →  图表同时展示所有服务的数据
```

## 7.2 变量类型与实现原理

### 变量类型

| 类型 | 用途 | 示例 |
|------|------|------|
| **Query** | 从数据源动态查询可选值 | `label_values(up, job)` |
| **Custom** | 手动定义固定选项 | `prod,staging,dev` |
| **Interval** | 时间间隔选项 | `1m,10m,30m,1h` |
| **Data source** | 切换 Dashboard 的数据源 | `Prometheus, Loki, MySQL` |
| **Textbox** | 用户自由输入 | 搜索关键词 |
| **Constant** | 固定值 | `api-server` |
| **Ad hoc filters** | 动态添加 Label 过滤条件 | 自动生成 `key=value` 过滤 |

### 实现原理：变量替换

Grafana 在查询发送前，将所有 `$variable` 替换为实际值。这就像 HTML 模板引擎的变量替换——先写模板，运行时填入具体值。

```
替换前: rate(http_requests_total{job="$job"}[5m])
替换后: rate(http_requests_total{job="api-server"}[5m])
```

特殊变量在替换时执行特定逻辑：

| 变量 | 替换逻辑 | 示例 |
|------|---------|------|
| `$__from` / `$__to` | 时间范围的 Unix 毫秒时间戳 | `1700000000000` |
| `$__interval` | 自动计算的最佳采样间隔 | `15s` |
| `$__rate_interval` | 推荐用于 rate() 的间隔 | `1m` |

### 变量值选项

```
Multi-value: 允许选择多个值 → job=~"api|web"
Include All: 添加"All"选项 → job=~".*"
```

> **Multi-value 的"陷阱"**：当你选中多个值时，Grafana 会用正则 `job=~"a|b|c"` 来匹配。如果某个标签值本身包含正则特殊字符（如 `|`、`.`），会导致匹配结果异常。建议确保标签值只包含字母、数字和连字符。

## 7.3 链式变量（Chaining）

链式变量是"级联下拉框"的实现方式：第二个变量的查询引用第一个变量的值，选择第一个变量后自动刷新第二个变量。

> **比喻：多米诺骨牌**
>
> 链式变量就像多米诺骨牌——推倒第一张（选择 cluster），后续的 namespace 和 Pod 变量自动级联刷新。每个变量的可选值范围随着前一个变量的选择而逐步缩小，最终精确定位到目标资源。

### 手把手：创建链式变量（从打开浏览器开始）

假设你要创建一个监控 Dashboard，通过"集群 → 命名空间 → Pod"三级级联来精确定位目标 Pod。

**Step 1：创建 Dashboard 并进入变量设置**

1. 打开 Grafana（浏览器输入 `http://localhost:3000`）
2. 点击左侧菜单 **"+"** → **"Dashboard"**
3. 点击顶部齿轮图标 **"Dashboard Settings"**
4. 点击左侧 **"Variables"** → 点击 **"Add variable"**

**Step 2：创建第一个变量——集群（cluster）**

1. **Name**: 输入 `cluster`
2. **Type**: 选择 `Query`
3. **Label**: 输入 `选择集群`（这是用户界面上显示的标签名）
4. **Data source**: 选择 `Prometheus`
5. **Query**: 输入 `label_values(up, cluster)`
   - 这行查询的意思是："从 up 指标中，找出所有 cluster 标签的唯一值"
   - 如果 Prometheus 中采集了 prod-us、prod-eu、staging 三个集群的数据，下拉框就会显示这三个选项
6. **Refresh**: 选择 `On Dashboard Load`
   - 只在 Dashboard 加载时查询一次，减少不必要的请求
7. 点击 **"Show options"** → 勾选 **"Include All option"** → **Custom all value** 留空（使用默认 `.*`）
8. 点击 **"Add"** 保存

**Step 3：创建第二个变量——命名空间（namespace）**

1. 再次点击 **"Add variable"**
2. **Name**: 输入 `namespace`
3. **Type**: 选择 `Query`
4. **Label**: 输入 `选择命名空间`
5. **Data source**: 选择 `Prometheus`
6. **Query**: 输入 `label_values(up{cluster="$cluster"}, namespace)`
   - **关键点**：`$cluster` 引用了上一个变量的值。如果你选择了 `prod-us`，实际执行的查询是 `label_values(up{cluster="prod-us"}, namespace)`——只返回 prod-us 集群下的命名空间
7. **Refresh**: 选择 `On Time Range Change`
   - 时间范围变化时也会刷新，因为不同时间段的命名空间可能不同
8. 勾选 **"Include All option"**
9. 点击 **"Add"** 保存

**Step 4：创建第三个变量——Pod（pod）**

1. 再次点击 **"Add variable"**
2. **Name**: 输入 `pod`
3. **Type**: 选择 `Query`
4. **Label**: 输入 `选择 Pod`
5. **Query**: 输入 `label_values(up{cluster="$cluster", namespace="$namespace"}, instance)`
   - 这里同时引用了 cluster 和 namespace 两个变量
   - 如果选择了 `cluster=prod-us`、`namespace=default`，实际执行 `label_values(up{cluster="prod-us", namespace="default"}, instance)`
6. 点击 **"Add"** 保存

**Step 5：在面板中使用变量**

1. 返回 Dashboard，点击 **"Add panel"** → **"Add a new panel"**
2. 在查询编辑器中输入：
   ```promql
   rate(http_requests_total{cluster="$cluster", namespace="$namespace", instance="$pod"}[5m])
   ```
3. 右上角选择时间范围为 **"Last 1 hour"**
4. 点击 **"Apply"** 保存面板

**Step 6：验证链式效果**

1. 回到 Dashboard，你会看到三个下拉框
2. 先选择 **cluster = prod-us**
   - 观察 namespace 下拉框：它会自动刷新，只显示 prod-us 集群下的命名空间
   - pod 下拉框也会自动刷新（显示 prod-us 集群下所有 Pod）
3. 再选择 **namespace = default**
   - 观察 pod 下拉框：它会再次刷新，只显示 default 命名空间下的 Pod
4. 选择一个 Pod，面板图表立即切换为对应 Pod 的请求速率数据

> **预期结果**：当你依次选择 `prod-us → default → web-1`，图表只显示 prod-us 集群中 default 命名空间下 web-1 这个 Pod 的请求速率。这就是链式变量的"逐层精确定位"效果。

### 链式变量工作流程

```
选择 cluster=prod-us
  → 自动刷新 namespace 变量（只显示 prod-us 的 namespace）
    → 选择 namespace=default
      → 自动刷新 instance 变量（只显示 default 的 Pod）
        → 面板查询使用 {cluster="prod-us", namespace="default", instance="$instance"}
```

### Dashboard JSON 中的变量定义

```json
{
  "templating": {
    "list": [
      {
        "name": "cluster",
        "type": "query",
        "query": "label_values(up, cluster)",
        "refresh": 1,
        "includeAll": true
      },
      {
        "name": "namespace",
        "type": "query",
        "query": "label_values(up{cluster=\"$cluster\"}, namespace)",
        "refresh": 2,
        "includeAll": true
      },
      {
        "name": "pod",
        "type": "query",
        "query": "label_values(up{cluster=\"$cluster\", namespace=\"$namespace\"}, instance)",
        "refresh": 2
      }
    ]
  }
}
```

> **JSON 中的 `refresh` 值说明**：
> - `refresh: 0` — 从不刷新（变量值固定，除非手动清空缓存）
> - `refresh: 1` — 仅 Dashboard 加载时刷新（适合变化不频繁的变量，如 cluster）
> - `refresh: 2` — 时间范围变化时也刷新（适合随时间变化的变量，如 namespace、pod）
> - `refresh: 3` — 每次 Dashboard 加载和仪表板刷新间隔（适合实时变化的变量）

## 7.4 Ad Hoc Filters（临时过滤器）

Ad Hoc Filters 允许用户在 Dashboard 界面上动态添加 Label 过滤条件，无需修改面板查询。

> **比喻：调料台**
>
> 面板查询是"基础菜谱"——决定了核心内容。Ad Hoc Filters 是"调料台"——用户根据口味自由添加。菜谱不需要为每种口味组合单独写一个版本，调料台让食客自己调配。

```
面板查询: rate(http_requests_total[5m])
用户添加 Ad Hoc Filter: method=GET
实际执行: rate(http_requests_total{method="GET"}[5m])
用户再添加: status=200
实际执行: rate(http_requests_total{method="GET", status="200"}[5m])
```

**配置方式：**
```json
{
  "name": "ad_hoc_filter",
  "type": "ad hoc filters",
  "datasource": "Prometheus"
}
```

> **Ad Hoc Filters 的局限性**：
> 1. 并非所有数据源都支持（Prometheus、Loki、SQL 支持，但某些非标数据源不支持）
> 2. 无法控制用户能过滤哪些标签——如果暴露了敏感标签（如 `password`、`token`），用户也能看到
> 3. 多个面板可能共用同一个 Ad Hoc Filter，导致某个面板意外被过滤

## 7.5 全局变量

Grafana 提供一组内置全局变量，在所有 Dashboard 中可用：

| 变量 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `$__from` | Unix ms | 时间范围起点 | `1700000000000` |
| `$__to` | Unix ms | 时间范围终点 | `1700086400000` |
| `$__interval` | duration | 自动计算的采样间隔 | `15s` |
| `$__interval_ms` | number | 间隔的毫秒数 | `15000` |
| `$__rate_interval` | duration | rate() 推荐间隔 | `1m` |
| `$dashboard` | string | 当前 Dashboard UID | `abc123` |
| `$org` | string | 当前组织名 | `myorg` |
| `$user` | string | 当前用户名 | `admin` |

> **`$__interval` 的计算逻辑**：
>
> Grafana 根据时间范围和图表宽度自动计算间隔。公式大致为：
> ```
> $__interval = (时间范围毫秒数) / (图表像素宽度 × 1.5)
> ```
> 例如：查看 1 小时数据（3600000ms），图表宽度 1200px：
> ```
> $__interval = 3600000 / (1200 × 1.5) ≈ 2000ms = 2s
> ```
> 但 Grafana 会向上取整到"友好"值（1s、5s、10s、15s、30s、1m...），所以实际得到 15s。

### 在 PromQL 中使用全局变量

```promql
# 使用 $__interval 控制采样粒度
rate(http_requests_total[$__interval])

# 使用 $__rate_interval（推荐）
rate(http_requests_total[$__rate_interval])
```

> **为什么推荐 `$__rate_interval` 而非 `$__interval`？**
>
> `$__interval` 仅考虑时间和宽度。`$__rate_interval` 额外考虑了 Prometheus 的 `scrape_interval`（采集间隔）和 `rate()` 函数的要求。如果 `scrape_interval=15s`，`$__rate_interval` 至少返回 `1m`（4 个采样点），确保 `rate()` 计算有足够的数据点，避免出现 `rate()` 结果大幅波动。

### 在 SQL 中使用全局变量

```sql
SELECT
  $__timeGroupAlias(created_at, $__interval),
  count(*)
FROM orders
WHERE
  $__timeFilter(created_at)
  AND status IN ($status)
GROUP BY 1
```

> **SQL 变量替换示例**：
> - `$__timeFilter(created_at)` → `created_at BETWEEN 1700000000000 AND 1700086400000`
> - `$__timeGroupAlias(created_at, $__interval)` → `DATE_TRUNC('hour', created_at) AS time`
> - 不同数据库的 `$__timeGroup` 实现不同：PostgreSQL 用 `date_trunc`，MySQL 用 `DATE_FORMAT`，SQLite 用 `strftime`

## 7.6 潜在风险与优化

### 风险 1：变量查询过多导致 Dashboard 加载慢

**问题**：每个变量加载时都要执行查询。5 个 Query 变量 = 5 次 Prometheus 查询。

> **真实案例**：某团队在 Dashboard 中配置了 8 个 Query 变量，全部设置 `refresh: 2`（每次时间变化刷新）。Dashboard 加载时间从 2 秒飙升到 30 秒。经排查，每次时间范围变化都会触发 8 次 Prometheus 查询，其中 3 个变量的查询涉及 `count()` 聚合，在千万级指标量的 Prometheus 上执行耗时 3-5 秒。
>
> **解决**：将不常用的 4 个变量改为 `refresh: 1`（仅加载时刷新），将 2 个聚合查询改为 Custom 类型（手动维护选项列表）。Dashboard 加载时间降到 5 秒以内。

**优化：**
1. 使用 `refresh: 1`（仅加载时刷新）而不是 `refresh: 2`（每次时间变化刷新）
2. 对不常用的变量设置 `includeAll: true` + 默认选中 All
3. 使用 Custom 类型替代 Query 类型（当取值固定时）

### 风险 2：链式变量过深

**问题**：4 层以上的链式变量导致每次切换都要等待多层查询。

**优化：**
1. 链式深度不超过 3 层
2. 最上层的变量使用 `refresh: 1`
3. 考虑用 Ad Hoc Filters 替代深层链式

### 风险 3：Multi-value 变量导致的基数爆炸

**问题**：Multi-value 变量选中 10 个值，相当于查询条件变为 `job=~"a|b|c|..."`，Prometheus 扫描量倍增。

> **真实案例**：某监控面板的 `instance` 变量是 Multi-value，用户一次性选中了 200 个实例。PromQL 查询变为 `{instance=~"ip-10-0-1-1|ip-10-0-1-2|...200个..."}`。这个正则表达式导致 Prometheus 的查询计划器无法利用倒排索引，转为全表扫描，查询耗时从 200ms 暴增到 15s，最终导致 Prometheus OOM。
>
> **教训**：Multi-value 变量一次选中的值不要超过 20-30 个。对于大量实例的场景，使用 `topk()` 在查询层面先做截断。

**优化：**
1. 限制 Multi-value 最多可选数量
2. 使用 `regex` 过滤器限制变量取值范围
3. 默认不选中 All（让用户主动选择）

### 风险 4：变量名冲突

**问题**：自定义变量名与全局变量名或数据源关键字冲突。

> **案例**：某个团队定义了一个名为 `__interval` 的 Custom 变量，覆盖了 Grafana 的内置全局变量 `$__interval`。所有使用 `$__interval` 的面板查询突然失效，因为 Grafana 用 Custom 变量的固定值替换了自动计算的采样间隔。
>
> **规则**：自定义变量名不要以 `__` 开头（这是 Grafana 保留前缀），不要使用 SQL 关键字（如 `from`、`to`、`interval`）。

## 7.7 典型问题处理

### 问题 1：变量下拉框为空

**排查：**
1. 在 Explore 页面手动执行变量查询
2. 检查变量查询语法是否正确
3. 确认数据源连接正常
4. 检查时间范围内是否有数据

> **快速诊断技巧**：在变量查询前加上 `label_values(` 前缀时，先在 Explore 中执行完整的 PromQL：`label_values(up, job)`。如果返回空结果，说明当前时间范围内没有数据——尝试扩大时间范围。

### 问题 2：变量变更后面板不刷新

**原因**：面板查询没有引用该变量。

**解决**：确保面板的查询中包含了 `$variable_name`。

### 问题 3：Ad Hoc Filters 不生效

**原因**：数据源类型不支持 Ad Hoc Filters（仅 Prometheus、Loki、SQL 等支持）。

**解决**：确认数据源类型支持 Ad Hoc Filters。

### 问题 4：链式变量刷新太慢

**问题**：选择第一个变量后，后续变量需要 5-10 秒才刷新。

**排查**：
1. 检查每个变量的查询耗时：在 Explore 中分别执行每个变量的查询
2. 找到最慢的查询，考虑优化 PromQL 或在数据库侧创建索引
3. 如果最慢的查询是 `label_values(up{...}, instance)`，考虑用 `query_result()` 替代

> **`query_result()` 技巧**：对于慢查询变量，可以用 `query_result(count by (instance) (up{...}))` 替代 `label_values(...)`。前者在 Prometheus 侧做聚合后再返回，数据量更小。

## 7.8 开发者必须掌握的技能

- **5 种变量类型**：Query / Custom / Interval / Textbox / Ad Hoc Filters
- **链式变量设计**：理解变量的依赖关系和刷新时机
- **全局变量使用**：`$__interval`、`$__rate_interval` 的正确用法
- **正则表达式**：变量值的过滤和匹配
- **Dashboard JSON 中的变量定义**：`templating.list` 结构

## 本章小结

- 变量是 Grafana 动态 Dashboard 的核心机制，实现"一个 Dashboard 适配所有环境"
- Query 变量从数据源动态获取可选值，Custom 变量定义固定选项
- 链式变量实现级联过滤，但深度不宜超过 3 层
- 全局变量 `$__interval` 自动调整采样粒度
- Ad Hoc Filters 让用户动态添加 Label 过滤条件
- 变量查询过多是 Dashboard 加载慢的常见原因
- 实践：[变量实验](../labs/ch07-variables/README.md)
