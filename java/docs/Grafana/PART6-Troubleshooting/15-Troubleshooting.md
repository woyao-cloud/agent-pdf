# 第15章 排障：从"面板不加载"到"全链路排查"

## 场景故事：一次真实的面板加载慢排查全记录

> **上午 10:00，大屏监控面板卡住了**
>
> "这都转圈转了 30 秒了，还没加载出来？" 运营总监盯着办公室大屏上的 Grafana Dashboard，眉头紧锁。今天是大促活动的第一天，大屏上显示着实时订单量、支付成功率、库存消耗速度——每一个数字都关系到当天的运营决策。
>
> 运维老陈被紧急叫到办公室，面对一块不断转圈的面板，他开始了一场从"现象"到"根因"的排查之旅。

这不是一个虚构的场景，而是真实发生在无数公司的故事。本章将带你走完一次完整的排障流程，从打开浏览器 DevTools 到定位数据库慢查询，再到最终修复。

---

## 15.1 排查方法论

### 15.1.1 原理比喻：从"车坏了"到"找到故障"

想象你的车启动不了：

- **新手做法**：反复拧钥匙 → 不行 → 打电话叫拖车
- **老手做法**：
  1. 听声音：启动电机转不转？（电池有电吗？）
  2. 看仪表盘：故障灯亮了没？（哪个系统报错？）
  3. 分步排查：油量 → 电池 → 启动电机 → 燃油泵 → 火花塞

Grafana 排查也是一样的分层思路：

```
用户看到：面板加载慢 / 显示 No Data / 报错
  ↓
第 1 层：浏览器端（DevTools 网络请求）
  ↓
第 2 层：Grafana 日志（服务端错误）
  ↓
第 3 层：数据源连接（Prometheus / MySQL 能否连通）
  ↓
第 4 层：查询性能（PromQL / SQL 是否高效）
  ↓
第 5 层：基础设施（网络 / 磁盘 / 内存 / CPU）
```

> **排障第一原则：从最外到最内，从客户端到服务端，层层递进。**

---

## 15.2 手把手：用浏览器 DevTools 定位慢查询

这是每一个 Grafana 用户都应该掌握的技能。我们用 DevTools 来诊断"面板加载慢"的问题。

### 15.2.1 步骤 1：打开浏览器的开发者工具

- **Chrome / Edge**：按 `F12` 或 `Ctrl+Shift+I`
- **Firefox**：按 `F12` 或 `Ctrl+Shift+I`
- **Safari**：先启用"开发"菜单（偏好设置 > 高级），然后按 `Cmd+Option+I`

### 15.2.2 步骤 2：切换到 Network（网络）标签

```
Network 标签
├── 记录按钮 (红色圆点) — 确保已开启
├── 清除按钮 (禁止符号) — 清空之前的记录
└── 过滤输入框 — 输入 "api" 或 "ds/" 来过滤 Grafana API 请求
```

> **旁白注释**：在打开 DevTools 后刷新页面，确保只捕获当前页面的请求，而不是浏览器之前缓存的请求。

### 15.2.3 步骤 3：刷新 Grafana 面板

重新加载有问题的 Dashboard，观察 Network 标签中的请求：

```
Name                           Status  Type    Size    Time
┌─────────────────────────────────────────────────────────────┐
│ dashboard/api/...             200     json    2.3 KB   12ms │  ← Dashboard 元数据
│ ds/query                      200     json    1.2 MB  8.32s │  ← 数据查询（慢！）
│ ds/query                      200     json    892 KB  7.91s │  ← 数据查询（慢！）
│ search/...                    200     json    456 B    5ms  │
└─────────────────────────────────────────────────────────────┘
```

**关键观察**：
- 哪些请求的 **Time** 列特别大？（上例中两个 `ds/query` 请求耗时超过 8 秒）
- 哪个请求的 **Size** 列特别大？（上例中返回了 1.2MB 的数据）

### 15.2.4 步骤 4：检查慢请求的详情

点击耗时最长的那个请求，查看详情：

```
Headers (请求头)
  Request URL: http://grafana/api/ds/query
  Request Method: POST
  Status Code: 200 OK

Preview (预览)
  └── results: [...]
      ├── series: [...]
      │   ├── name: "http_requests_total"
      │   ├── values: [[...], [...], ...]  ← 大量数据点
      └── stats:
          ├── queryTime: 7923ms  ← 数据源查询耗时
          └── processingTime: 89ms  ← Grafana 处理耗时
```

**关键发现**：
- `queryTime: 7923ms`：数据库查询花了 7.9 秒
- `processingTime: 89ms`：Grafana 处理只用了 89 毫秒
- **结论：慢在数据源端，不是 Grafana 本身**

### 15.2.5 步骤 5：查看实际查询语句

在 Preview 或 Payload 标签中，找到实际发送给数据源的查询：

```json
{
  "queries": [
    {
      "refId": "A",
      "expr": "rate(http_requests_total[1y])",  // 问题在这里！
      "datasourceId": 1,
      "maxDataPoints": 1000,
      "intervalMs": 15000
    }
  ]
}
```

**找到问题了！** `rate(http_requests_total[1y])` —— 这个查询试图计算 **一整年** 的数据速率。Prometheus 需要扫描过去一年所有的样本点，当然慢。

### 15.2.6 步骤 6：修复并验证

将查询改为：

```
# Before（慢）: 扫描一年数据
rate(http_requests_total[1y])

# After（快）: 只扫描 5 分钟
rate(http_requests_total[5m])
```

修改后再次加载，Network 标签中显示耗时从 8 秒降到了 120 毫秒。

### 15.2.7 步骤 7：生成 HAR 文件（用于团队协作）

如果你需要把问题发给同事或 Grafana 支持团队：

1. 在 Network 标签中右键点击任意请求
2. 选择 **Save all as HAR with content**
3. 发送给同事

HAR 文件包含了所有请求的详细信息，接收方可以直接导入 DevTools 查看。

---

## 15.3 常见排查场景

### 15.3.1 场景一："No Data" 错误

**现象**：面板显示 "No data" 或 "No data points"

**排查步骤**：

```
第 1 步：检查数据源连接
  → Configuration > Data Sources > 点击你的数据源
  → 点击 "Save & Test"
  → 如果显示 "Data source is working"，说明连接正常
  → 如果报错，检查 URL、认证信息、网络连通性

第 2 步：在 Explore 中测试查询
  → 进入 Explore 页面
  → 选择同一个数据源
  → 输入同样的查询语句
  → 如果能查到数据 → 问题在 Dashboard 配置
  → 如果查不到数据 → 问题在查询语句或数据本身

第 3 步：检查时间范围
  → 确认 Dashboard 的时间范围与数据的时间范围有重叠
  → 例如：数据是今天的，但 Dashboard 显示的是上周

第 4 步：检查数据源权限
  → 确认当前用户有该数据源的 Query 权限
  → 检查数据源的 Permissions 标签
```

**真实案例**：
某团队升级 Grafana 后，所有面板显示 "No data"。排查发现：新版本的 Grafana 默认开启了 "Data source permissions" 功能，但之前没有配置任何权限。所有用户都失去了查询权限。修复方式：进入数据源设置，在 Permissions 中为所有用户添加 Query 权限。

### 15.3.2 场景二：Dashboard 加载非常慢

**现象**：打开 Dashboard 需要 10 秒以上

**排查步骤**：

```
第 1 步：DevTools 检查（参考 15.2 节）
  → 确认是哪个请求慢

第 2 步：检查查询范围
  → 是否有查询使用了过大的时间范围（如 [$__range] 没有限制）
  → 是否有查询使用了过大的 `[interval]`（如 `[1y]`）

第 3 步：检查面板数量
  → 一个 Dashboard 上有多少个面板？
  → 超过 20 个面板的 Dashboard 可以考虑拆分

第 4 步：检查数据源负载
  → Prometheus 的 CPU 和内存使用率
  → MySQL 的慢查询日志
```

**真实案例**：
某公司的 Grafana Dashboard 有 50 个面板，每个面板都查询同一个 Prometheus 实例。打开 Dashboard 时，50 个查询同时发出，Prometheus 的 CPU 瞬间飙到 100%，导致所有查询都超时。

**解决方案**：
1. 将 Dashboard 拆分为多个，每个聚焦一个主题
2. 使用 Dashboard 的 "Refresh" 功能错开查询时间
3. 在 Prometheus 端增加查询超时限制

### 15.3.3 场景三：Grafana 报 502 Bad Gateway

**现象**：访问 Grafana 返回 502

**排查步骤**：

```
第 1 步：检查 Grafana 进程
  → ssh 到服务器
  → ps aux | grep grafana
  → 如果进程不存在，尝试重启

第 2 步：检查端口监听
  → netstat -tlnp | grep 3000
  → 确认 Grafana 在监听 3000 端口

第 3 步：检查 Nginx 反向代理
  → 查看 Nginx 错误日志：/var/log/nginx/error.log
  → 检查 upstream 配置是否正确

第 4 步：检查资源限制
  → dmesg | grep -i oom  → 是否被 OOM Killer 杀掉
  → df -h               → 磁盘是否满了
  → free -m             → 内存是否不足
```

**真实案例**：
某公司 Grafana 每 2 周挂一次，每次都返回 502。排查发现：Grafana 的 SQLite 数据库文件在长时间运行后膨胀到 2GB，每次加载 Dashboard 都需要扫描整个数据库。修复方式：迁移到 MySQL，并配置定期清理旧数据。

### 15.3.4 场景四：告警不触发

**现象**：配置了告警规则，但条件满足时没有收到通知

**排查步骤**：

```
第 1 步：检查告警规则状态
  → Alerting > Alert rules
  → 查看规则的状态：OK / Pending / Firing / NoData / Error
  → 如果状态是 "Error"，检查查询语句

第 2 步：检查告警评估间隔
  → 规则的 evaluate every 设置
  → 确认评估间隔已过（刚创建的规则需要等一个评估周期）

第 3 步：检查通知渠道
  → Alerting > Contact points
  → 点击 "Test" 发送测试通知
  → 如果测试失败，检查通知渠道配置

第 4 步：检查静默规则
  → Alerting > Silences
  → 确认没有正在生效的静默规则
```

**真实案例**：
某团队配置了 CPU 告警，但线上 CPU 飙到 95% 了也没收到通知。排查发现：另一个运维在两周前排查问题时创建了一个静默规则，匹配了所有 `severity=critical` 的告警，但忘记删除了。修复方式：删除或过期静默规则。

### 15.3.5 场景五：Grafana 登录失败

**现象**：输入正确的用户名密码，但登录页面一直跳转或报错

**排查步骤**：

```
第 1 步：检查配置文件
  → 确认 [auth] 部分配置正确
  → 检查是否启用了 OAuth 但没有配置回调 URL

第 2 步：检查 Cookie 配置
  → 如果 Grafana 在反向代理后面，检查 cookie 域名设置
  → GF_SESSION_COOKIE_DOMAIN 是否正确

第 3 步：检查数据库连接
  → 如果使用 MySQL/PostgreSQL，确认数据库服务正常
  → Session 表是否存在

第 4 步：查看日志
  → 检查 Grafana 日志中是否有认证相关的错误
```

**真实案例**：
某公司配置了 Grafana 的 LDAP 认证，但 LDAP 服务器迁移后，Grafana 登录全部失败。排查发现：Grafana 配置文件中 LDAP 的 host 写的是旧服务器 IP。修复方式：更新 LDAP 配置中的服务器地址并重启。

---

## 15.4 日志排查指南

### 15.4.1 关键日志文件

| 文件路径 | 作用 |
|---|---|
| `/var/log/grafana/grafana.log` | Grafana 主日志 |
| `/var/log/nginx/access.log` | Nginx 访问日志 |
| `/var/log/nginx/error.log` | Nginx 错误日志 |
| `/var/log/messages` 或 `/var/log/syslog` | 系统日志 |

### 15.4.2 常用日志排查命令

```bash
# 查看实时日志
journalctl -u grafana-server -f

# 查看最近 100 行
journalctl -u grafana-server -n 100

# 搜索错误
journalctl -u grafana-server | grep -i error

# Docker 环境
docker-compose logs -f grafana

# 搜索特定关键词
docker-compose logs grafana | grep -i "failed\|error\|panic"

# 查看时间范围内的日志
docker-compose logs --since="2024-01-01T10:00:00" --until="2024-01-01T11:00:00" grafana
```

---

## 15.5 常见错误及解决方案速查表

| 错误信息 | 可能原因 | 解决方案 |
|---|---|---|
| `No data` | 查询范围不对 / 数据源权限不足 | 检查时间范围 / 检查数据源权限 |
| `Bad Gateway (502)` | Grafana 进程挂了 / Nginx 配置错误 | 检查进程 / 检查 Nginx upstream |
| `Gateway Timeout (504)` | 查询超时 / 后端负载过高 | 优化查询 / 增加超时时间 |
| `Internal Server Error (500)` | 配置文件错误 / 插件冲突 | 检查配置文件 / 禁用最近安装的插件 |
| `Invalid API Key` | API Key 过期 / 被撤销 | 生成新的 API Key |
| `Too many requests` | 达到速率限制 | 降低查询频率 / 增加速率限制 |
| `database is locked` | 多节点使用 SQLite | 迁移到 MySQL/PostgreSQL |
| `Plugin not found` | 插件未安装 / 路径错误 | 检查插件安装 / 重启 Grafana |
| `Permission denied` | 权限配置不当 | 检查文件夹 / 数据源权限设置 |
| `Quota exceeded` | 超过 Dashboard 数量限制 | 增加配额 / 清理无用 Dashboard |

---

## 15.6 排查工具推荐

| 工具 | 用途 |
|---|---|
| **Chrome DevTools** | 浏览器端排查网络请求、性能、控制台错误 |
| **Grafana Explore** | 交互式查询调试，验证查询语句是否正确 |
| **Prometheus Console** | 直接在 Prometheus 端验证查询结果 |
| **Grafana Logs** | 查看服务端日志，定位后端错误 |
| **curl / wget** | 命令行测试 API 是否正常响应 |
| **Grafana API** | 直接调用 API 获取原始数据，绕过 UI 问题 |
| **PromQL CLI (promtool)** | 在命令行中测试和验证 PromQL 查询 |
| **pg_stat_statements** | PostgreSQL 慢查询分析 |

---

## 15.7 最佳实践：建立排障 SOP

当 Grafana 出问题时，按以下顺序排查：

```
1. 检查 Grafana 能否访问（浏览器打开 URL）
   ├── 能访问 → 转到 2
   └── 不能 → 检查网络、代理、进程

2. 检查 Grafana 日志（最近的错误）
   ├── 有错误 → 根据错误信息排查
   └── 无错误 → 转到 3

3. 检查数据源连接（Save & Test）
   ├── 正常 → 转到 4
   └── 异常 → 检查数据源配置

4. 在 Explore 中测试查询
   ├── 能查到 → 检查 Dashboard 配置
   └── 查不到 → 优化查询语句

5. 检查基础设施（磁盘 / 内存 / CPU / 网络）
   ├── 资源充足 → 考虑升级或优化
   └── 资源不足 → 扩容或清理
```

---

## 15.8 练习

1. 打开浏览器的 DevTools，观察 Grafana 面板加载时的网络请求
2. 找到耗时最长的请求，分析其 queryTime 和 processingTime
3. 模拟一个 "No Data" 场景，使用 Explore 逐步排查
4. 查看 Grafana 日志，找到至少一条 WARNING 级别的日志
5. 创建一个故意写错的 PromQL 查询，观察 Grafana 报错信息并解读
