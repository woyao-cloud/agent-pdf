# 第9章 注解（Annotations）与事件标记

## 9.1 原理与使用场景

### 什么是 Annotation？

Annotation 是 Grafana 在图表时间轴上叠加的垂直线标记，用于标注特定时间点发生的事件。

```
CPU Usage (%)
 100 ║        │
  80 ║  ╱╲    │    ╱╲
  60 ║ ╱  ╲   │   ╱  ╲
  40 ║╱    ╲  │  ╱    ╲
  20 ║      ╲ │ ╱      ╲
   0 ║═══════╲│╱══════════════
     └───────┬┴───────────────
             │
        发布 v2.1.0        ← Annotation（垂直线 + 文本标签）
```

> **比喻：Annotation = 图表上的"便利贴"**
>
> 想象你在看一张心电图，医生在某个时间点贴了一张黄色便利贴："患者在此时间服用了药物"。你一眼就能看出服药前后心率的变化。Annotation 就是 Grafana 图表上的"便利贴"——在时间轴上标记一个事件，让你能直观看到事件发生前后的数据变化。
>
> 如果没有 Annotation，你只能对着 CPU 图表猜测："这波飙升是不是因为刚才发布了新版本？嗯……好像是……也可能不是……" 有了 Annotation，答案一目了然："看，蓝色竖线标记的地方就是发版时间，之后 CPU 立刻飙升。"

### 使用场景

**场景 1：版本发布标记**
- 每次部署新版本时自动打点
- 快速判断性能变化是否由发布引起

**场景 2：告警事件叠加**
- Alertmanager 触发告警时自动生成 Annotation
- 在图表上看到"告警触发 → 自动恢复"的全过程

**场景 3：扩缩容事件**
- HPA 触发 Pod 扩容时记录
- 分析扩容对响应时间的影响

**场景 4：基础设施变更**
- 数据库迁移、配置变更等操作记录

### 故事：每次发版后性能就抖动——Annotation 帮我找到了元凶

> **背景**：某 SaaS 公司的 SRE 团队每周五下午发布新版本。最近几周，他们发现每次发版后 15-30 分钟，API 响应时间就会出现一个明显的"尖刺"。团队怀疑是新版本的代码问题，但回滚后问题依然存在，这让所有人都困惑不已。
>
> **初步排查**：
> - SRE 团队：肯定是新版本代码有 bug！
> - 开发团队：不可能！我们代码没动数据库相关的东西。
> - 争论持续了两周，谁也无法说服谁。
>
> **引入 Annotation**：
> 他们在 Grafana 中配置了发布事件 Annotation，从 CI/CD 系统的日志中自动标记每次发版的时间点。然后在同一个 Dashboard 上叠加了 API 延迟、CPU 使用率和数据库连接数的图表。
>
> **发现真相**：
> 在 Annotation 的帮助下，他们发现了一个惊人的规律：
> ```
> 每次发版后：
>   ┌─ 第 0 分钟：发布完成（Annotation 竖线出现）
>   ├─ 第 5 分钟：数据库连接数开始飙升
>   ├─ 第 10 分钟：CPU 使用率上升 20%
>   └─ 第 15 分钟：API 响应时间出现尖刺
> ```
>
> **根因**：不是新版本代码的问题！是 CI/CD 流水线中的数据库迁移脚本——每次发版都会执行 `ALTER TABLE` 语句，导致数据库表被锁定，大量请求排队等待。队列堆积导致连接数暴增，CPU 忙于处理排队请求，最终 API 响应时间飙升。
>
> **解决**：将数据库迁移改为异步执行，发版后延迟 5 分钟再执行迁移。Annotation 帮助他们找到了真正的"凶手"——不是代码，是数据库迁移策略。

## 9.2 Annotation 查询配置

### 内置 Annotation 查询

Grafana 支持从数据源查询 Annotation，在 Dashboard Settings → Annotations 中配置：

```yaml
# Dashboard JSON 中的 Annotation 配置
{
  "annotations": {
    "list": [
      {
        "name": "Deployments",
        "datasource": "Prometheus",
        "enable": true,
        "expr": "timestamp(changes(version{job=\"api\"}[1m]) > 0)",  # PromQL
        "iconColor": "blue",
        "titleFormat": "Deploy {{ $labels.version }}",
        "textFormat": "Service {{ $labels.service }} deployed"
      },
      {
        "name": "Alert Events",
        "datasource": "Loki",
        "enable": true,
        "expr": "{job=\"alertmanager\"} |= \"alert\"",  # LogQL
        "iconColor": "red",
        "titleFormat": "{{ $labels.alertname }}",
        "textFormat": "{{ $labels.severity }}: {{ $labels.instance }}"
      }
    ]
  }
}
```

> **代码旁白：`timestamp()` 函数的关键作用**
>
> `timestamp(changes(version[1m]) > 0)` 这个 PromQL 看起来复杂，拆解一下就很简单：
>
> 1. `version{job="api"}` — 查询 api 服务的 version 指标（每次发版时这个指标的值会变）
> 2. `changes(...[1m])` — 检测过去 1 分钟内指标值是否发生了变化
> 3. `> 0` — 过滤出"发生了变化"的时间点
> 4. `timestamp(...)` — 返回这些时间点的 Unix 时间戳（Annotation 需要时间戳来定位竖线的位置）
>
> 最终效果：每当 `version` 指标的值发生变化（即发版），就在图表上画一条蓝色竖线。

### Prometheus 作为 Annotation 数据源

```promql
# 检测版本变化（发布事件）
timestamp(changes(version[5m]) > 0)

# 检测 Pod 重启
timestamp(increase(kube_pod_container_status_restarts_total[5m]) > 0)

# 检测告警触发
timestamp(ALERTS{alertstate="firing"})
```

> **代码旁白：为什么用 `changes()` 而不是直接查版本号？**
>
> 你可能想问：为什么不直接查 `version` 指标的值？因为 Annotation 需要的是"事件发生的时间点"，而不是"当前的版本号"。`changes()` 函数的作用是"检测变化"，只有变化发生的那一刻才返回一个值，其他时间返回 0 或 null。这样 Grafana 只在变化发生时画竖线，而不是在每个数据点都画线。

### Loki 作为 Annotation 数据源

```logql
# 从日志中提取发布事件
{job="ci-cd"} |= "deploy" | json

# 从日志中提取告警
{job="alertmanager"} |= "alert"
```

### SQL 作为 Annotation 数据源

```sql
-- 从部署记录表查询发布事件
SELECT
  deployed_at AS time,
  version AS title,
  CONCAT('Service: ', service_name, ' | Status: ', status) AS text
FROM deployments
WHERE $__timeFilter(deployed_at)
```

> **代码旁白：SQL Annotation 的字段约定**
>
> 当用 SQL 作为 Annotation 数据源时，Grafana 期望查询结果包含特定的列名：
> - **`time`**（必需）：事件的时间戳
> - **`title`**（可选）：Annotation 的标题，显示在竖线顶部
> - **`text`**（可选）：Annotation 的详细文本，鼠标悬停时显示
> - **`tags`**（可选）：标签，用于分组和过滤
>
> 如果查询结果中没有 `time` 列，Grafana 会报错。可以用 `AS time` 别名来重命名。

## 9.3 实战：发布事件自动标记

### 手把手：配置 Annotation 查询（从打开浏览器开始）

假设你已经在应用中暴露了 `app_version_info` 指标，现在要在 Grafana 中配置 Annotation，每次发版时自动标记。

**Step 1：进入 Dashboard 的 Annotation 设置**

1. 打开 Grafana（浏览器输入 `http://localhost:3000`）
2. 打开你要添加 Annotation 的 Dashboard
3. 点击顶部齿轮图标 **"Dashboard Settings"**
4. 点击左侧 **"Annotations"**（在 Variables 下方）

**Step 2：添加新的 Annotation 查询**

1. 点击 **"Add Annotation Query"** 按钮
2. **Name**: 输入 `版本发布`（这是 Annotation 在设置列表中的名称）
3. **Data source**: 选择 `Prometheus`
4. **Enabled**: 保持勾选（如果取消勾选，Annotation 不会显示在图表上）

**Step 3：配置查询表达式**

1. **Query**: 输入以下 PromQL：
   ```promql
   timestamp(changes(app_version_info[5m]) > 0)
   ```
   - 这个查询的作用：检测 `app_version_info` 指标在过去 5 分钟内是否发生了变化
   - 每次发版时，应用的 `version` 标签变化，这个查询就会返回一个时间戳

2. **Title**: 输入 `Deploy {{ $labels.version }}`
   - `{{ $labels.version }}` 会被替换为实际的版本号
   - 效果：鼠标悬停在竖线上时显示 "Deploy v2.1.0"

3. **Text**: 输入 `Commit: {{ $labels.commit }} | Build: {{ $labels.build_time }}`
   - 显示更多的版本信息

**Step 4：配置外观**

1. **Icon color**: 选择蓝色（发布事件一般用蓝色）
2. 点击 **"Apply"** 保存

**Step 5：验证 Annotation 效果**

1. 回到 Dashboard，选择一个包含发版时间的时间范围
2. 观察图表：在发版的时间点上应该出现蓝色竖线
3. 鼠标悬停在竖线上，应该看到你配置的标题和文本
4. 如果看不到 Annotation：
   - 检查右上角时间范围是否包含了发版时间
   - 在 Explore 中手动执行 `timestamp(changes(app_version_info[5m]) > 0)` 确认是否有返回结果

> **预期结果**：每次发布新版本，图表上出现蓝色竖线，悬停竖线显示 "Deploy v2.1.0"。结合 CPU/延迟图表，一眼看出发布对性能的影响。

### Prometheus 端：暴露版本指标

在应用中暴露一个 Gauge 指标，值不变但标签变化：

```go
// Go 示例：在应用中暴露版本指标
var (
    appVersion = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "app_version_info",
            Help: "Application version info",
        },
        []string{"version", "commit", "build_time"},
    )
)

func init() {
    appVersion.WithLabelValues("v2.1.0", "abc123", "2024-01-01").Set(1)
    prometheus.MustRegister(appVersion)
}
```

### Grafana 侧：Annotation 查询

```promql
# 检测 app_version_info 的 version 标签变化
timestamp(changes(app_version_info[5m]) > 0)
```

### 效果

```
Dashboard 中：
- 每次发布新版本，图表上出现蓝色竖线
- 悬停竖线显示 "Deploy v2.1.0"
- 结合 CPU/延迟图表，一眼看出发布对性能的影响
```

## 9.4 实战：GitHub Actions 集成

通过 Grafana HTTP API 直接创建 Annotation：

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to production
        run: |
          # 部署脚本
          ./deploy.sh
      
      - name: Create Grafana Annotation
        run: |
          curl -X POST "https://grafana.example.com/api/annotations" \
            -H "Authorization: Bearer ${{ secrets.GRAFANA_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "dashboardUid": "'"$DASHBOARD_UID"'",
              "panelId": 1,
              "time": '"$(date +%s)000"'",
              "timeEnd": 0,
              "tags": ["deploy", "production"],
              "text": "Deploy v'"$VERSION"' (commit: '"$COMMIT"')"
            }'
```

> **代码旁白：API Annotation 的关键参数**
>
> - **`dashboardUid`**：目标 Dashboard 的唯一标识符。可以在 Dashboard URL 中找到（如 `/d/abc123/my-dashboard` 中的 `abc123`）。
> - **`panelId`**：目标面板的 ID。设置为 0 表示在所有面板上都显示这条 Annotation。设置为具体面板 ID 则只在该面板上显示。
> - **`time`**：事件时间戳，必须是**毫秒级** Unix 时间戳。`$(date +%s)000` 的作用是将秒级时间戳乘以 1000 转为毫秒级。
> - **`timeEnd`**：事件结束时间。如果设置为 0，表示这是一个"瞬时事件"（画竖线）。如果设置一个未来的时间戳，会画一个矩形区域（表示事件持续的时间段）。
> - **`tags`**：标签数组。可以用标签来过滤 Annotation——在 Dashboard 上方的 Annotation 设置中可以按标签筛选。

## 9.5 潜在风险与优化

### 风险 1：Annotation 查询性能

**问题**：如果 Annotation 查询的返回结果过多（数千条），Dashboard 加载会变慢。

> **真实案例**：某团队在 Dashboard 中配置了一个从 Loki 查询错误日志的 Annotation：`{job="api"} |= "error"`。这个查询每 15 秒触发一次，返回过去 24 小时内所有包含 "error" 的日志行——大约 10 万行。Dashboard 加载时间从 3 秒飙升到 45 秒，每次刷新都要下载 10 万行 Annotation 数据。
>
> **教训**：Annotation 查询应该返回"事件"，而不是"数据"。发版事件一天最多几次，告警事件一天几十次，这没问题。但错误日志一天可能几十万次——这不适合作为 Annotation。

**优化：**
1. 限制 Annotation 查询的时间范围
2. 使用 `limit` 参数限制返回数量
3. 避免在 Annotation 查询中使用昂贵的聚合操作

### 风险 2：Annotation 过多导致图表杂乱

**问题**：太多的垂直线条让图表难以阅读。

**优化：**
1. 用不同颜色区分事件类型（蓝色=发布，红色=告警，绿色=扩容）
2. 设置 `iconColor` 和 `textColor` 提高可读性
3. 对不重要的 Annotation 设为隐藏（`enable: false`）

> **可视化建议**：
> - **发布事件**：蓝色，细线（不遮挡数据）
> - **告警事件**：红色，粗线（需要引起注意）
> - **扩缩容事件**：绿色，虚线（表示"柔性"变化）
> - **配置变更**：橙色，中等粗细
>
> 如果同一天有 20 次以上的 Annotation，考虑用"区域标注"替代"垂直线标注"——在 Dashboard 顶部显示一个时间轴条，而不是在图表上画垂直线。

### 风险 3：API Annotation 鉴权

**问题**：创建 Annotation 的 API Key 泄露可能导致恶意标记。

**解决：**
1. 使用只写权限的 API Key
2. 限制 API Key 的 IP 白名单
3. 使用 Grafana Service Account 替代 API Key

### 风险 4：Annotation 时间戳精度不一致

**问题**：Prometheus 查询返回秒级时间戳，但 Grafana 期望毫秒级时间戳。

**解决**：在 PromQL 中乘以 1000，或在 Grafana 的 Annotation 设置中确认时间戳格式。

> **快速检查**：如果 Annotation 竖线的位置明显偏离你期望的时间点（比如晚了 3 秒），很可能是时间戳精度问题。在 Explore 中执行 Annotation 查询，检查返回的时间戳是秒级还是毫秒级。

## 9.6 典型问题处理

### 问题 1：Annotation 不显示

**排查：**
1. 在 Explore 中测试 Annotation 查询语句
2. 检查 Dashboard 的 Annotation 配置是否启用
3. 确认 Annotation 数据源连接正常

> **诊断步骤**：
> 1. 打开 Explore 页面
> 2. 选择与 Annotation 相同的数据源
> 3. 直接执行 Annotation 的查询语句（如 `timestamp(changes(version[5m]) > 0)`）
> 4. 如果有结果返回，说明查询本身没问题——问题在 Dashboard 配置
> 5. 如果没有结果，说明查询需要调整（如时间范围太小、指标名写错）

### 问题 2：Annotation 时间不准确

**原因**：Annotation 的时间戳与图表的时间轴精度不匹配。

**解决**：确保 Annotation 查询返回的时间戳是毫秒级 Unix 时间戳。

> **常见误区**：PromQL 的 `timestamp()` 函数返回的是秒级时间戳（如 `1700000000`），但 Grafana 内部使用毫级时间戳（如 `1700000000000`）。如果你的 Annotation 位置不对，试试在 PromQL 中乘以 1000：`timestamp(...) * 1000`。

### 问题 3：API 创建的 Annotation 不出现

**排查：**
1. 确认 `dashboardUid` 和 `panelId` 正确
2. 确认 `time` 参数在 Dashboard 当前时间范围内
3. 检查 API Key 是否有 Annotation 写入权限

> **调试技巧**：用 curl 直接查询刚创建的 Annotation：
> ```bash
> curl -H "Authorization: Bearer YOUR_KEY" \
>   "https://grafana.example.com/api/annotations?dashboardUid=abc123&limit=1"
> ```
> 如果能查到说明 Annotation 已创建成功，问题出在前端显示。查不到则说明创建失败或参数有误。

### 问题 4：同一个事件重复出现多条 Annotation

**原因**：PromQL 查询的 `changes()` 在连续多个时间窗口都检测到变化，导致多条 Annotation。

**解决**：增加时间窗口长度，或在查询中增加去重逻辑。例如将 `[1m]` 改为 `[5m]`，降低检测灵敏度。

## 9.7 开发者必须掌握的技能

- **Annotation 查询语法**：PromQL / LogQL / SQL 三种方式
- **API 创建 Annotation**：HTTP POST `/api/annotations`
- **Dashboard JSON 中的 Annotation 配置**：`annotations.list` 结构
- **CI/CD 集成**：在部署流水线中自动创建 Annotation

## 本章小结

- Annotation 在图表上叠加垂直线标记事件
- 支持 Prometheus、Loki、SQL 三种查询方式
- 常见用途：版本发布、告警事件、扩缩容标记
- 通过 Grafana HTTP API 可从 CI/CD 流水线创建 Annotation
- 避免 Annotation 过多导致图表杂乱和加载缓慢
