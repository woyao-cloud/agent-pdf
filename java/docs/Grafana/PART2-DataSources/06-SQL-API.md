# 第6章 关系型数据库与 API 集成（MySQL / PostgreSQL / JSON API）

## 6.1 场景故事：业务方需要"实时订单大盘"

周三早上 10 点，某电商公司的运营总监急匆匆地找到 SRE 小王：

"王工，老板下午 3 点要看业务汇报，我需要一个**实时订单大盘**——能看到今天的订单量、收入、热门商品。能不能帮我在 Grafana 里做一个？"

小王想了一下："没问题，我直接在 Grafana 里连 MySQL 业务库就行。"

运营总监担心："直接连业务库会不会把数据库搞挂了？"

"放心，我只做只读查询，而且加了时间范围限制，不会全表扫描。"

**2 小时后**，一个包含以下面板的实时订单大盘做好了：

- 今日订单量趋势（折线图）
- 实时收入统计（Stat 面板）
- Top 10 热门商品（柱状图）
- 同环比对比（表格）

运营总监看了直呼："太好了！以后不用每天让开发导数据了！"

---

## 6.2 核心原理：SQL 宏替换机制

### 比喻：SQL 宏 = "填空作文模板"

想象你有一篇作文模板：

```
今天是 ______，天气 ______。
我去了 ______，看到了 ______。
```

填空前：`"今天是 %s，天气 %s。我去了 %s，看到了 %s。"`
填完后：`"今天是 星期一，天气 晴。我去了 公园，看到了 花。"`

Grafana 的 SQL 宏就是同样的道理——你在 SQL 中写占位符（宏），Grafana 自动填入实际值。

### 宏展开过程详解

```sql
-- 你在面板中写的 SQL：
SELECT
  $__timeGroup(created_at, '1h'),    -- 宏：时间聚合
  count(id) AS order_count
FROM orders
WHERE $__timeFilter(created_at)      -- 宏：时间范围过滤
GROUP BY 1
ORDER BY 1

-- ↓ Grafana 后台展开后的 SQL（假设选择的时间范围是 2024-01-01 ~ 2024-01-02）：

SELECT
  UNIX_TIMESTAMP(created_at) DIV 3600 * 3600,  -- 展开为按小时聚合
  count(id) AS order_count
FROM orders
WHERE created_at BETWEEN '2024-01-01 00:00:00' AND '2024-01-02 23:59:59'  -- 展开为时间范围
GROUP BY 1
ORDER BY 1
```

### 核心宏列表及展开示例

| 宏 | 在面板中写的 | Grafana 展开为（MySQL） | 用途 |
|----|-------------|----------------------|------|
| `$__timeFilter(ts)` | `WHERE $__timeFilter(created_at)` | `WHERE created_at BETWEEN '2024-01-01' AND '2024-01-02'` | 自动按面板时间范围过滤 |
| `$__timeGroup(ts, 1h)` | `$__timeGroup(created_at, '1h')` | `UNIX_TIMESTAMP(created_at) DIV 3600 * 3600` | 按时间窗口聚合 |
| `$__timeGroupAlias(ts, 1h)` | `$__timeGroupAlias(created_at, '1h')` | `UNIX_TIMESTAMP(created_at) DIV 3600 * 3600 AS "time"` | 同上，但带别名 |
| `$__unixEpochFilter(ts)` | `WHERE $__unixEpochFilter(ts)` | `WHERE ts >= 1704067200 AND ts <= 1704153600` | Unix 时间戳过滤 |
| `$__var(name)` | `WHERE status = '$__var(status)'` | `WHERE status = 'pending'` | 模板变量替换 |
| `$__interval` | `GROUP BY $__interval` | 自动计算 | 动态采样粒度 |

### 不同数据库的宏差异

```sql
-- MySQL 版
$__timeGroup(created_at, '1h')
-- 展开为：UNIX_TIMESTAMP(created_at) DIV 3600 * 3600

-- PostgreSQL 版
$__timeGroup(created_at, '1h')
-- 展开为：date_trunc('hour', created_at) AT TIME ZONE 'UTC'

-- 差异原因：MySQL 用 UNIX_TIMESTAMP + 整除，PG 用 date_trunc
-- 但效果是一样的：按小时做时间窗口聚合
```

---

## 6.3 手把手：从创建 MySQL 数据源到完成业务大盘

### 步骤 1：创建 MySQL 数据源

1. 打开浏览器，访问 Grafana（http://localhost:3000）
2. 左侧菜单 → **Configuration（齿轮图标）** → **Data Sources**
3. 点击 **Add data source**
4. 搜索 "MySQL"，点击 **MySQL**
5. 填写以下信息：

```
Host: mysql:3306             # MySQL 地址和端口
Database: myapp              # 数据库名
User: grafana                # 数据库用户名
Password: ********           # 数据库密码
```

6. 展开 **MySQL Options**：
   - **Max open connections**: 5（限制最大连接数，防止业务库被拖垮）
   - **Max idle connections**: 2
   - **Connection max lifetime**: 14400（4小时，避免连接超时断开）

7. 点击 **Save & Test**

**预期结果**：
- ✅ `Database Connection OK` —— 连接成功
- ❌ `Error 1045: Access denied for user` —— 用户名或密码错误
- ❌ `Error 2003: Can't connect to MySQL server` —— 地址不对或 MySQL 没启动

**YAML 配置方式：**

```yaml
# provisioning/datasources/mysql.yml
apiVersion: 1

datasources:
  - name: MySQL
    type: mysql
    url: mysql:3306
    database: myapp
    user: grafana
    
    jsonData:
      maxOpenConns: 5          # 最大连接数：5 就够了
                               # 太大 → 业务库连接池耗尽
                               # 太小 → 查询排队变慢
      maxIdleConns: 2          # 最大空闲连接数
      connMaxLifetime: 14400   # 连接最大存活时间（秒）
                               # 14400 = 4 小时
                               # 防止防火墙断开长期空闲连接
    
    secureJsonData:
      password: ${MYSQL_PASSWORD}
      # ↑ 密码不写在 YAML 中，通过环境变量注入
      #   在 Grafana 的 docker-compose 中配置：
      #   environment:
      #     MYSQL_PASSWORD: "your_password"
```

### 步骤 2：创建 Dashboard 和第一个面板

1. 左侧菜单 → **+** → **Dashboard**
2. 点击 **Add visualization**
3. 在数据源下拉框中选择 **MySQL**
4. 在 **Query** 编辑器中输入以下 SQL：

```sql
SELECT
  $__timeGroupAlias(created_at, '1h'),
  count(id) AS order_count,
  sum(total_amount) AS revenue
FROM orders
WHERE $__timeFilter(created_at)
GROUP BY 1
ORDER BY 1
```

5. 右侧面板配置：
   - **Title**: "今日订单量趋势"
   - **Type**: Time Series
   - **Unit**: 左轴 = 订单数（short），右轴 = 收入（USD）

6. 点击右上角 **Apply**，然后点击 **Save dashboard**
7. 输入 Dashboard 名称："实时订单大盘"

### 步骤 3：添加更多面板

**面板 2：实时业务状态**

```sql
SELECT
  (SELECT count(*) FROM orders WHERE status = 'pending') AS pending_orders,
  (SELECT count(*) FROM orders WHERE status = 'processing') AS processing_orders,
  (SELECT count(*) FROM orders WHERE created_at > NOW() - INTERVAL 1 HOUR) AS orders_last_hour,
  (SELECT sum(total_amount) FROM orders WHERE created_at > CURDATE()) AS today_revenue
```

- **Type**: Stat（每个子查询一行）
- 这个 SQL 没有 WHERE 条件，因为它查的是"此时此刻"的状态，不需要时间范围

**面板 3：Top 10 热门商品**

```sql
SELECT
  product_name,
  count(*) AS order_count,
  sum(quantity) AS total_sold
FROM order_items
WHERE $__timeFilter(created_at)
GROUP BY product_name
ORDER BY order_count DESC
LIMIT 10
```

- **Type**: Bar Gauge
- **Orientation**: Horizontal（横向柱状图更易读）

**面板 4：同环比对比**

```sql
-- 今日 vs 昨日 vs 上周同期
SELECT
  'today' AS period,
  count(*) AS orders,
  sum(total_amount) AS revenue
FROM orders WHERE DATE(created_at) = CURDATE()

UNION ALL

SELECT
  'yesterday' AS period,
  count(*),
  sum(total_amount)
FROM orders WHERE DATE(created_at) = CURDATE() - INTERVAL 1 DAY

UNION ALL

SELECT
  'last_week' AS period,
  count(*),
  sum(total_amount)
FROM orders WHERE DATE(created_at) = CURDATE() - INTERVAL 7 DAY
```

- **Type**: Table
- 效果：一目了然看到今天的业务变化

---

## 6.4 代码旁白：SQL 宏的展开过程详解

### 场景：用户在面板中写的 SQL

```sql
SELECT
  $__timeGroup(created_at, '1h') AS time,
  count(id) AS order_count
FROM orders
WHERE $__timeFilter(created_at)
GROUP BY 1
ORDER BY 1
```

### 步骤 1：Grafana 解析宏

Grafana 的 SQL 数据源插件会扫描 SQL 文本，识别出 `$__timeGroup(...)` 和 `$__timeFilter(...)` 两个宏。

### 步骤 2：获取面板上下文

Grafana 从面板配置中获取：

```
时间范围：2024-01-01 00:00:00 到 2024-01-02 23:59:59
时间格式：用户选择的时区
数据库类型：MySQL（决定了宏的展开语法）
```

### 步骤 3：宏展开

```sql
-- 展开 $__timeGroup(created_at, '1h')
-- MySQL 语法：UNIX_TIMESTAMP(ts) DIV 间隔秒数 * 间隔秒数
-- 1h = 3600 秒
-- 结果：created_at 的时间戳向下取整到小时
UNIX_TIMESTAMP(created_at) DIV 3600 * 3600 AS time,

-- 展开 $__timeFilter(created_at)
-- MySQL 语法：ts BETWEEN 开始时间 AND 结束时间
-- 开始/结束时间来自面板的时间选择器
WHERE created_at BETWEEN '2024-01-01 00:00:00' AND '2024-01-02 23:59:59'
```

### 步骤 4：发送查询

Grafana 将展开后的完整 SQL 发送到 MySQL：

```sql
SELECT
  UNIX_TIMESTAMP(created_at) DIV 3600 * 3600 AS time,
  count(id) AS order_count
FROM orders
WHERE created_at BETWEEN '2024-01-01 00:00:00' AND '2024-01-02 23:59:59'
GROUP BY 1
ORDER BY 1
```

### 步骤 5：处理结果

MySQL 返回结果后，Grafana 将每一行转换为 Data Frame：

```
time                    | order_count
2024-01-01 00:00:00     | 1234
2024-01-01 01:00:00     | 5678
2024-01-01 02:00:00     | 9012
...                     | ...
```

### 步骤 6：渲染图表

Data Frame 被传递给面板渲染器（uPlot / ECharts），最终呈现为折线图。

---

## 6.5 实战：Infinity 插件集成 REST API

### 场景：监控 GitHub 仓库状态

```yaml
# provisioning/datasources/infinity.yml
datasources:
  - name: Infinity
    type: yesoreyeram-infinity-datasource
    access: proxy
    url: https://api.github.com
    jsonData:
      auth_method: "none"
      httpMethod: "GET"
```

### 面板 1：GitHub 仓库统计

```yaml
# Infinity 查询配置
type: json
url: https://api.github.com/repos/grafana/grafana
method: GET
parser: backend
columns:
  - selector: stargazers_count
    name: stars
    type: number
  - selector: forks_count
    name: forks
    type: number
  - selector: open_issues_count
    name: open_issues
    type: number
```

### 面板 2：CI/CD 构建状态

```yaml
# Infinity 查询配置（Jenkins CI）
type: json
url: https://jenkins.example.com/api/json
method: GET
headers:
  Authorization: Bearer ${JENKINS_TOKEN}
columns:
  - selector: jobs[*].name
    name: job_name
    type: string
  - selector: jobs[*].color
    name: status
    type: string
```

---

## 6.6 风险与最佳实践

### 风险 1：SQL 查询超时

**问题**：没有加时间范围限制的查询会全表扫描。

```sql
-- ❌ 危险：没有 WHERE 条件，全表扫描
SELECT count(*) FROM orders

-- ✅ 安全：加了时间范围限制
SELECT count(*) FROM orders WHERE $__timeFilter(created_at)
```

**优化**：
1. 确保查询包含 `$__timeFilter`
2. 为查询字段创建索引：

```sql
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_status_created ON orders(status, created_at);
```

3. 在 Dashboard 中限制最大时间范围（不让用户选"过去一年"）

### 风险 2：数据库连接耗尽

**问题**：Dashboard 自动刷新时，多个面板同时发起查询。

```yaml
# 限制连接数
jsonData:
  maxOpenConns: 5       # 最多 5 个并发查询
  maxIdleConns: 2       # 保持 2 个空闲连接
  connMaxLifetime: 14400
```

**为什么是 5？**
- 如果 Dashboard 有 10 个面板，同时刷新 → 10 个查询
- 但 Grafana 会复用连接，5 个连接足够处理
- 太多连接会耗尽业务库的连接池（通常只有 100-200 个连接）

### 风险 3：SQL 注入

**问题**：模板变量直接拼接到 SQL 中。

```sql
-- ❌ 危险：如果 $status 被设置为 "'; DROP TABLE orders; --"
SELECT * FROM orders WHERE status = '$status'

-- ✅ 安全：Grafana 的 SQL 宏会自动做参数化处理
SELECT * FROM orders WHERE status = '$__var(status)'
```

**最佳实践**：
- 使用 `$__var(name)` 而不是直接拼变量
- 如果是 Custom 类型的模板变量，限制可选项
- 不要让模板变量支持自由输入

### 风险 4：API 频率限制

**问题**：Grafana 自动刷新导致外部 API 被限流。

```yaml
# 在 grafana.ini 中启用缓存
[dataproxy]
caching = true
cache_ttl = 300  # 缓存 5 分钟
```

---

## 6.7 典型问题处理

### 问题 1：面板显示 "db error: unknown column"

**原因**：SQL 中的列名不存在或拼写错误。

**解决**：
1. 在 MySQL 客户端中手动执行相同的 SQL：
```bash
mysql -u grafana -p myapp -e "SELECT ..."
```
2. 检查表结构：
```bash
mysql -u grafana -p myapp -e "DESCRIBE orders"
```

### 问题 2：Infinity 插件返回 "Invalid JSON"

**原因**：API 返回的不是合法 JSON。

**解决**：
1. 用 curl 测试 API：
```bash
curl https://api.example.com/status
```
2. 确认返回的是 JSON 格式（而不是 HTML 错误页面）
3. 检查 API 鉴权是否正确

### 问题 3：时间轴显示异常

**原因**：`$__timeGroup` 的时间戳精度与面板设置的时间范围不匹配。

**解决**：
- 如果面板时间范围是"最近 1 小时"，用 `$__timeGroup(ts, '1m')`（每分钟聚合）
- 如果面板时间范围是"最近 7 天"，用 `$__timeGroup(ts, '1h')`（每小时聚合）
- 如果面板时间范围是"最近 30 天"，用 `$__timeGroup(ts, '1d')`（每天聚合）

---

## 6.8 开发者必须掌握的技能

| 技能 | 掌握程度 |
|------|---------|
| SQL 宏系统（timeFilter/timeGroup）| 必须熟练 |
| 索引优化 | 必须理解 |
| 连接池配置 | 必须理解 |
| Infinity 插件 | 常用 |
| JSON 路径选择器 | 常用 |

---

## 本章小结

- **SQL 宏 = 填空模板**，Grafana 自动填入时间范围、时间聚合等值
- **$__timeFilter** 确保查询不会全表扫描（性能安全网）
- **$__timeGroup** 按时间窗口聚合数据，自动匹配时间范围
- **MySQL/PostgreSQL 数据源**适合业务数据监控（订单量、收入等）
- **Infinity 插件**可以接入任意 REST API
- **连接池限制**防止 Grafana 耗尽业务数据库连接
- **索引优化**是 SQL 数据源性能的关键

> **核心心法**：SQL 数据源最强大也最危险——你能查到任何数据，但一个不带 WHERE 条件的查询就能把业务库拖垮。始终记住：**加时间范围、限连接数、建索引**。
