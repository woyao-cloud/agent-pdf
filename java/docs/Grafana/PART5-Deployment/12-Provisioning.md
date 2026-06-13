# 第12章 Provisioning：用代码管理你的Grafana配置

## 场景故事：从"离职同事的账号"到"Git管理一切"

> **"那个线上MySQL的监控大盘在哪里？"**
>
> 新来的运维工程师小王满头大汗地在Grafana里翻找。线上MySQL延迟突然飙高，老板在群里@了他三次，可他怎么也找不到那个传说中的"MySQL关键指标大盘"。
>
> "哦，那个大盘啊，是老张建的。他上个月离职了。"旁边的同事头也不抬地说。
>
> 小王的心凉了半截。老张不仅离职了，他的Grafana账号也被一起删除了——包括他创建的所有Dashboard。
>
> 这还不是最糟的。当小王终于找到另一份备份时，他发现Dashboard上写着一个数据源叫"production-mysql-v2"，但现在的数据源叫"prod-mysql-2024"。他花了整整一个下午，把每个面板的数据源手动改了一遍。
>
> "这种事，发生过不止一次了。"运维经理叹了口气，"每次有人离职，我们就会丢失一批Dashboard。每次数据源改名，我们就得手动改几十个面板。"

这就是**没有Provisioning**的日常——配置全靠人工，丢失是常态，变更靠手搓。

如果你也曾遇到过这样的场景，那么这一章就是为你准备的。Provisioning（自动化配置）让你用声明式文件管理Grafana的一切——Dashboard、数据源、告警规则、文件夹结构——全部纳入Git版本控制。

---

## 12.1 什么是 Provisioning

### 12.1.1 原理比喻：从"传纸条"到"SOP手册"

想象一下你开了一家奶茶店：

- **手动配置 = 传纸条**：今天张三告诉李四"糖浆比例是1:10"，李四告诉王五"糖浆比例是1:8"。信息在传递中失真，最后做出来的奶茶味道千奇百怪。更糟的是，张三请假了，没人知道糖浆比例到底是多少。
- **Provisioning = SOP手册**：你把所有配方写在标准作业手册里，贴在墙上。任何人来上班，照着手册做就行。手册放在Git仓库里，每次修改都有记录，出了问题可以回溯到"是谁、在什么时候、为什么改了配方"。

Grafana Provisioning 就是这个"SOP手册"——你把数据源、Dashboard、告警规则等配置写成YAML文件，放在磁盘上。Grafana启动时自动加载，配置与运行环境解耦，变更可审计。

### 12.1.2 为什么需要 Provisioning

| 痛点 | Provisioning 解决方案 |
|---|---|
| Dashboard 随账号删除而丢失 | Dashboard 存为 JSON 文件，与用户账号无关 |
| 数据源 URL 变更要手动改几十个面板 | 修改一个 YAML 文件，重启即可 |
| 开发/测试/生产环境配置不一致 | 同一套文件，不同环境用不同变量 |
| 变更没有审计记录 | Git 提交历史 = 完整审计日志 |
| 新同事需要权限才能修改配置 | 任何人都可以 PR → Review → Merge |

### 12.1.3 真实案例：Dashboard 随员工离职丢失

**某中型电商公司** 的运维团队一直用手动方式管理 Grafana。三年间，团队经历了多次人员变动。每次有人离职，IT 在清理账号时都会顺手删除 Grafana 用户——连同该用户创建的所有 Dashboard 一起消失。

一年后，他们发现：
- 核心的 "订单量实时监控" 大盘已经换了三任维护者，每次都是"从零重建"
- 丢失的 Dashboard 超过 40 个
- 没有人知道 "正确的" QPS 阈值应该是多少——因为最早的告警规则随着第一任运维的离职一起消失了
- 恢复数据源配置花费了超过 20 人天

事后复盘时，技术总监说了一句话："**最贵的不是服务器，是人脑里的配置。**"

---

## 12.2 Provisioning 文件结构

Provisioning 配置文件默认放在 Grafana 的 `/etc/grafana/provisioning/` 目录下，结构如下：

```
/etc/grafana/provisioning/
├── dashboards/        # Dashboard 定义
│   └── sample.yaml
├── datasources/       # 数据源定义
│   └── sample.yaml
├── notifiers/         # 通知渠道（旧版）
├── alerting/          # 告警规则（Grafana 8+）
└── plugins/           # 插件配置
```

Grafana 启动时会扫描这些目录，加载所有 `.yaml` 文件。

> **旁白注释**：为什么用 YAML 而不是 JSON？YAML 支持注释、可读性更高，适合人类手写和维护。JSON 适合机器生成，但 Provisioning 配置通常是工程师手写的。

---

## 12.3 数据源 Provisioning

### 12.3.1 手把手：配置你的第一个数据源

**前提**：你已经安装了 Grafana（参考第 2 章），并且有一台 Prometheus 在运行。

**步骤 1：找到 provisioning 目录**

Grafana 的配置目录通常位于：
- **Linux (deb/rpm 安装)**：`/etc/grafana/provisioning/`
- **Docker 安装**：需要挂载卷，如 `./provisioning:/etc/grafana/provisioning`
- **macOS (Homebrew)**：`/usr/local/etc/grafana/provisioning/`

如果你是用 Docker 启动的，先确认你的 docker-compose.yml 中挂载了 provisioning 目录：

```yaml
# docker-compose.yml 片段
services:
  grafana:
    image: grafana/grafana:latest
    volumes:
      - ./provisioning:/etc/grafana/provisioning  # 挂载 provisioning 目录
```

> **旁白注释**：把 provisioning 目录放到项目仓库中，和你的应用代码一起版本管理。

**步骤 2：创建数据源配置**

在 `provisioning/datasources/` 下创建 `prometheus.yaml`：

```yaml
# provisioning/datasources/prometheus.yaml
# 为什么这样写：声明式定义数据源，Grafana 启动时自动加载
apiVersion: 1  # API 版本，当前固定为 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy       # proxy = 通过 Grafana 后端转发，broswer = 浏览器直连
    url: http://prometheus:9090  # Docker 内部网络使用服务名
    isDefault: true     # 设为默认数据源，新面板自动使用
    editable: false     # 禁止在 UI 中修改，强制通过配置文件管理
    jsonData:
      timeInterval: "15s"  # 采样间隔，与 Prometheus 的 scrape_interval 保持一致
      httpMethod: "POST"   # 推荐用 POST，支持更复杂的查询
```

> **旁白注释**：
> - `editable: false` 很关键：它防止有人在 UI 中误改数据源，导致"在 UI 中改了但重启后又被配置文件覆盖"的混乱。
> - `timeInterval` 应该与 Prometheus 的 `scrape_interval` 匹配。如果 Prometheus 每 15s 抓一次，这里就设 15s。不匹配会导致图表显示异常。

**步骤 3：重启 Grafana**

```bash
# Docker
docker-compose restart grafana

# systemd
sudo systemctl restart grafana
```

**步骤 4：验证**

打开 Grafana，进入 **Configuration > Data Sources**，你应该能看到 "Prometheus" 数据源已经存在，而且状态是 "OK"。

### 12.3.2 多数据源配置示例

```yaml
# provisioning/datasources/multi-datasources.yaml
apiVersion: 1

datasources:
  - name: Prometheus-Production
    type: prometheus
    url: http://prometheus-prod:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: "15s"

  - name: Prometheus-Staging
    type: prometheus
    url: http://prometheus-staging:9090
    editable: false
    jsonData:
      timeInterval: "30s"  # 测试环境采样频率可以低一些

  - name: MySQL-Dev
    type: mysql
    url: mysql-dev:3306
    database: grafana_metrics
    user: grafana
    secureJsonData:
      password: "${MYSQL_PASSWORD}"  # 使用环境变量，不要在配置文件里写死密码
```

> **旁白注释**：`secureJsonData` 中的密码可以通过环境变量注入，避免敏感信息出现在 Git 仓库中。在生产中建议配合 Vault 或 Kubernetes Secrets 使用。

---

## 12.4 Dashboard Provisioning

### 12.4.1 手把手：用文件管理你的第一个 Dashboard

**步骤 1：创建 Dashboard 配置**

在 `provisioning/dashboards/` 下创建 `dashboards.yaml`：

```yaml
# provisioning/dashboards/dashboards.yaml
apiVersion: 1

providers:
  - name: "Default"           # Provider 名称，用于日志和调试
    orgId: 1                  # 组织 ID，多租户环境下区分归属
    folder: "Production"      # 放到指定文件夹，方便管理
    type: file                # 从文件加载
    disableDeletion: true     # 禁止在 UI 中删除，防止误操作
    allowUiUpdates: false     # 禁止在 UI 中修改，确保配置即真理
    updateIntervalSeconds: 10 # 轮询间隔，文件变更后自动重载
    options:
      path: /etc/grafana/provisioning/dashboards/json  # JSON 文件存放路径
```

> **旁白注释**：
> - `disableDeletion: true` + `allowUiUpdates: false` 是"配置即真理"模式的黄金组合。修改 Dashboard 的唯一方式：改 JSON 文件 → 提交 PR → Review → Merge → 自动生效。
> - `updateIntervalSeconds: 10` 表示 Grafana 每 10 秒检查一次文件变更。开发和调试时可以设短一些（比如 5s），生产环境可以设长一些（30s）以减少磁盘 I/O。

**步骤 2：导出已有 Dashboard 为 JSON**

如果你已经在 UI 中创建了 Dashboard，可以通过 API 导出：

```bash
# 使用 Grafana API 导出 Dashboard
# 前提：需要 API Key 或 Basic Auth
curl -s -u admin:admin \
  "http://localhost:3000/api/dashboards/uid/your-dashboard-uid" \
  | jq '.dashboard' > provisioning/dashboards/json/my-dashboard.json
```

> **旁白注释**：`jq '.dashboard'` 很关键——API 返回的完整响应包含 `meta` 信息（版本号、创建时间等），我们只需要 `dashboard` 字段下的实际 Dashboard 定义。

或者在 UI 中操作：
1. 打开 Dashboard
2. 点击右上角的 **Share** 图标
3. 选择 **Export** 标签
4. 点击 **Save to file**

**步骤 3：优化导出的 JSON**

导出的 JSON 可能包含环境特定的配置（如数据源名称），需要参数化：

```json
{
  "title": "MySQL 关键指标",
  "panels": [
    {
      "title": "QPS",
      "datasource": "${DS_PROMETHEUS}",  // 参数化数据源
      "targets": [
        {
          "expr": "rate(mysql_queries_total[1m])"
        }
      ]
    }
  ]
}
```

> **旁白注释**：`${DS_PROMETHEUS}` 是一个变量，在加载时会被替换为实际的数据源名称。这样同一个 JSON 文件可以部署到不同环境（开发/测试/生产），只需在不同环境中定义不同的变量值。

**步骤 4：放入正确目录**

```bash
mkdir -p provisioning/dashboards/json
cp my-dashboard.json provisioning/dashboards/json/
```

**步骤 5：重启 Grafana**

```bash
docker-compose restart grafana
```

**步骤 6：验证**

打开 Grafana，进入 **Dashboards**，你应该能看到 "Production" 文件夹下出现了你的 Dashboard。

### 12.4.2 Before/After 对比

| 场景 | Before（手动管理） | After（Provisioning） |
|---|---|---|
| 新同事加入 | "我用你电脑导出一份 JSON，微信发我" | `git clone` 仓库，`docker-compose up` 即可 |
| 数据源变更 | 逐个面板修改 → 遗漏 → 出事故 | 改 JSON 中的变量 → PR → Merge → 自动生效 |
| 回滚 | "我记得昨天还是好的..." | `git revert` 一键回滚 |
| 审计 | "谁改了这个阈值？" "不是我。" | Git Blame 精准定位 |
| 灾难恢复 | 找备份 → 找不到 → 从零重建 | `git clone && docker-compose up` |

### 12.4.3 真实案例：错误的 Before/After

**Before（错误做法）：直接在 UI 中编辑 JSON**

某团队的运维在 UI 中直接编辑 Dashboard JSON，把数据源从 `prometheus-old` 改成了 `prometheus-new`。但 Grafana 的 JSON 编辑器没有语法校验，他不小心删除了一行关键的 `"datasource"` 字段。

结果：整个 Dashboard 加载不出来，所有面板显示 "No data"。花了 30 分钟才找到原因——JSON 中少了一个逗号。

**After（正确做法）：用 Provisioning 文件管理**

```yaml
# provisioning/dashboards/dashboards.yaml
# 正确做法：禁止 UI 修改，强制走文件
apiVersion: 1
providers:
  - name: "Default"
    disableDeletion: true     # 防止误删
    allowUiUpdates: false     # 禁止 UI 修改，所有变更走 Git
    options:
      path: /etc/grafana/provisioning/dashboards/json
```

---

## 12.5 手把手：从零搭建 GitOps 工作流

这是本章的重头戏——一个完整的、生产可用的 GitOps 工作流。

### 整体架构

```
开发者修改 JSON → 提交 PR → Review → Merge → CI/CD 推送 → Grafana 自动加载
```

### 步骤 1：创建 Git 仓库

```bash
# 创建一个新的仓库来管理 Grafana 配置
mkdir grafana-configs
cd grafana-configs
git init

# 创建目录结构
mkdir -p provisioning/datasources
mkdir -p provisioning/dashboards/json
mkdir -p provisioning/alerting
```

### 步骤 2：创建 docker-compose.yml

```yaml
# docker-compose.yml
# 为什么这样写：将 provisioning 目录挂载到 Grafana 容器
version: '3.8'

services:
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    volumes:
      - ./provisioning:/etc/grafana/provisioning  # 配置文件目录
      - ./grafana-data:/var/lib/grafana            # 持久化数据
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${ADMIN_PASSWORD}  # 从 .env 文件读取
      - GF_INSTALL_PLUGINS=grafana-piechart-panel      # 自动安装插件
    restart: unless-stopped
```

### 步骤 3：创建数据源配置

```yaml
# provisioning/datasources/datasources.yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: "15s"
```

### 步骤 4：创建 Dashboard 配置

```yaml
# provisioning/dashboards/dashboards.yaml
apiVersion: 1

providers:
  - name: "Default"
    orgId: 1
    folder: "Production"
    type: file
    disableDeletion: true
    allowUiUpdates: false
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards/json
```

### 步骤 5：准备 Dashboard JSON

导出你的 Dashboard JSON 文件，放入 `provisioning/dashboards/json/` 目录。

```bash
# 从已有 Grafana 导出
curl -s -u admin:${ADMIN_PASSWORD} \
  "http://localhost:3000/api/dashboards/uid/your-dashboard-uid" \
  | jq '.dashboard' > provisioning/dashboards/json/node-exporter-full.json
```

### 步骤 6：提交到 Git

```bash
git add .
git commit -m "feat: 初始化 Grafana GitOps 配置

- 添加 Prometheus 数据源配置
- 添加 Node Exporter Full Dashboard
- 配置 Provisioning 自动加载"
git push origin main
```

### 步骤 7：部署

```bash
# 从 Git 仓库拉取最新配置
git pull

# 启动 Grafana
docker-compose up -d

# 验证
curl -s http://localhost:3000/api/health | jq .
```

### 步骤 8：变更工作流

当需要修改 Dashboard 时，流程如下：

```bash
# 1. 创建分支
git checkout -b fix/qps-threshold

# 2. 修改 Dashboard JSON
# 编辑 provisioning/dashboards/json/node-exporter-full.json

# 3. 预览变更（可选）
# 使用 grafana-dashboard-diff 工具对比变更
# npx grafana-dashboard-diff old.json new.json

# 4. 提交
git add .
git commit -m "fix: 调整 QPS 告警阈值从 1000 到 800"

# 5. 推送并创建 PR
git push origin fix/qps-threshold

# 6. Review → Merge → CI/CD 自动部署
```

### 步骤 9：CI/CD 自动化（可选）

在 GitHub Actions 中自动部署：

```yaml
# .github/workflows/deploy-grafana.yml
name: Deploy Grafana Configs

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Validate Dashboard JSON
        run: |
          # 校验 JSON 格式
          for f in provisioning/dashboards/json/*.json; do
            echo "Validating $f..."
            jq empty "$f" || exit 1
          done

      - name: Deploy to Grafana Server
        run: |
          # 通过 SCP 或 Rsync 推送配置到目标服务器
          scp -r provisioning/ user@grafana-server:/etc/grafana/
          # 重启 Grafana 加载新配置
          ssh user@grafana-server "sudo systemctl restart grafana-server"
```

---

## 12.6 告警规则 Provisioning（Grafana 8+）

从 Grafana 8 开始，告警规则也可以通过 Provisioning 管理。

```yaml
# provisioning/alerting/rules.yaml
apiVersion: 1

groups:
  - name: "Production Alerts"
    folder: "Production Alerts"
    interval: 30s
    rules:
      - uid: "high_cpu_alert"
        title: "CPU 使用率过高"
        condition: "A"
        data:
          - refId: "A"
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: "prometheus"
            model:
              expr: "avg by(instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) < 0.2"
        noDataState: "NoData"
        execErrState: "Error"
        for: "5m"
        annotations:
          summary: "Instance {{ $labels.instance }} CPU 使用率超过 80%"
        labels:
          severity: "critical"
```

---

## 12.7 最佳实践总结

1. **配置即真理**：所有配置通过文件管理，UI 设为只读
2. **Git 做唯一来源**：所有变更走 Git，禁止直接修改服务器文件
3. **环境分离**：使用变量区分开发/测试/生产环境
4. **敏感信息加密**：密码等敏感信息使用环境变量或密钥管理服务
5. **自动校验**：CI 中检查 JSON/YAML 格式和 Schema 合法性
6. **文档化**：在 README 中记录目录结构和变更流程

---

## 12.8 练习

1. 创建一个 Prometheus 数据源的 Provisioning 配置
2. 导出一个已有 Dashboard 并参数化数据源
3. 搭建 GitOps 工作流并模拟一次 Dashboard 变更流程
4. 尝试配置 Grafana Alerting 的 Provisioning
