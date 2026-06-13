# 附录 C：常用社区插件推荐榜

## 可视化面板插件

### 1. Polystat Panel

**用途**：在一个面板中展示多个服务的状态（类似服务树）。

```
[web-1] 🟢  UP    [web-2] 🟢  UP    [web-3] 🔴 DOWN
[db-1]  🟢  UP    [db-2]  🟡 Slow  [cache] 🟢  UP
```

**安装**：
```bash
grafana-cli plugins install grafana-polystat-panel
```

### 2. Flowcharting

**用途**：使用 SVG 绘制自定义架构图，根据数据动态着色。

```
                   ┌─────────────┐
        🟢         │   Nginx     │         🟢
    ┌──────────────┤   (UP)      ├──────────────┐
    │              └─────────────┘              │
    ▼                                           ▼
┌────────┐  🟢                           ┌────────┐  🟢
│  App 1 │                                 │  App 2 │
│   OK   │                                 │  OK    │
└────────┘                                 └────────┘
    │                                           │
    ▼                                           ▼
┌────────┐  🟢                           ┌────────┐  🟢
│ MySQL  │                                 │ Redis  │
│  (UP)  │                                 │  (UP)  │
└────────┘                                 └────────┘
```

**安装**：
```bash
grafana-cli plugins install agenty-flowcharting-panel
```

### 3. Business Text

**用途**：在 Dashboard 中嵌入 Markdown 文本、图片、HTML。

```markdown
# 生产环境状态
**SLA**: 99.95% ✅
**当前告警**: 3 🔴
**值班人员**: 张三 (138-xxxx-xxxx)
```

**安装**：
```bash
grafana-cli plugins install marcusolsson-text-panel
```

### 4. Status History

**用途**：展示时间轴上的状态变化（类似 Git 提交历史）。

```
web-1  🟢🟢🟢🟢🔴🔴🔴🟢🟢🟢
web-2  🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢
db-1   🟢🟢🟡🟡🟢🟢🟢🟢🟢🟢
       10:00    10:05    10:10
```

**安装**：
```bash
grafana-cli plugins install michaeldmoore-multistatus-panel
```

### 5. Diagram

**用途**：绘制架构拓扑图（类似 Draw.io 集成）。

**安装**：
```bash
grafana-cli plugins install jpgoload-diagram-panel
```

## 数据源插件

### 1. Infinity

**用途**：从任意 REST API、CSV、JSON、HTML 页面获取数据。

**典型场景**：
- GitHub Stars 数量
- CI/CD 构建状态
- 天气 API
- 外汇汇率

**安装**：
```bash
grafana-cli plugins install yesoreyeram-infinity-datasource
```

### 2. JSON API

**用途**：从 JSON API 获取数据并转换为表格或时间序列。

**安装**：
```bash
grafana-cli plugins install simpod-json-datasource
```

### 3. SQLite

**用途**：直接查询 SQLite 数据库文件。

**安装**：
```bash
grafana-cli plugins install frser-sqlite-datasource
```

## 应用插件

### 1. Zabbix

**用途**：集成 Zabbix 监控系统，查看 Zabbix 的告警和历史数据。

**安装**：
```bash
grafana-cli plugins install alexanderzobnin-zabbix-app
```

### 2. Kubernetes App

**用途**：在 Grafana 中查看 K8s 集群状态、Pod 日志、资源使用。

**安装**：
```bash
grafana-cli plugins install grafana-kubernetes-app
```

## 插件安装方式

```dockerfile
# Dockerfile
FROM grafana/grafana:10.2.0

# 安装社区插件
RUN grafana-cli plugins install grafana-polystat-panel && \
    grafana-cli plugins install agenty-flowcharting-panel && \
    grafana-cli plugins install yesoreyeram-infinity-datasource && \
    grafana-cli plugins install marcusolsson-text-panel
```

```yaml
# docker-compose.yml
services:
  grafana:
    image: grafana/grafana:10.2.0
    environment:
      GF_INSTALL_PLUGINS: "grafana-polystat-panel,agenty-flowcharting-panel,yesoreyeram-infinity-datasource"
```

## 插件管理命令

```bash
# 列出已安装的插件
grafana-cli plugins ls

# 安装插件
grafana-cli plugins install <plugin-id>

# 更新插件
grafana-cli plugins update <plugin-id>

# 卸载插件
grafana-cli plugins remove <plugin-id>

# 列出所有可用插件
grafana-cli plugins list-remote
```
