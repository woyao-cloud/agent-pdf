# 第14章 多租户：让每个团队拥有自己的Grafana

## 场景故事：三个团队，一个 Grafana

> **"为什么我能看到支付系统的数据？"**
>
> 前端团队的小李在 Grafana 上闲逛，无意中看到了"支付系统核心指标"的 Dashboard。他不仅看到了每秒交易量，还看到了交易失败率、日均交易额——这些数据严格来说属于财务敏感信息。
>
> 小李吓了一跳，赶紧截图发到群里："这是我能看的吗？"
>
> 支付团队的安全负责人立刻炸了："谁给前端团队开的权限？！"
>
> 运维一脸无辜："我们只有一个 Grafana 实例啊，所有人都在上面。权限只能按数据源控制，没法精确到每个面板。"
>
> 事后复盘发现：
> - 支付系统的数据源对所有用户可见
> - 基础设施团队能看到所有团队的 Dashboard
> - 最严重的是，实习生账号拥有 Admin 权限——因为"懒得建那么多角色"
> - 没有人知道"谁的账号有什么权限"

这就是**多租户管理不当**的典型后果。当多个团队共享一个 Grafana 实例时，数据隔离和权限控制就成了生死攸关的问题。

---

## 14.1 什么是多租户

### 14.1.1 原理比喻：从"合租房"到"独立公寓"

想象一栋楼：

- **单租户 = 独栋别墅**：整栋楼就你一家人住，想怎么搞都行，隐私完全没问题。但成本高，每栋楼都要请保安、交水电费。
- **多租户 = 合租房 vs 独立公寓**：
  - **没有隔离的多租户 = 合租房**：几家人住在一套房子里，共用客厅、厨房、卫生间。你的东西可能被室友拿走，室友的客人可能走错房间。这就是不配置权限的 Grafana。
  - **有隔离的多租户 = 独立公寓**：每家人有独立的房间、独立的门锁、独立的电表。你在房间里做什么别人不知道，别人也进不来。公共区域（大厅、电梯）大家共享。这就是配置了 Org 和权限的 Grafana。

Grafana 的多租户模型分为三层：

```
Organization (组织)       ← 最外层隔离，相当于"整栋公寓楼"
  └── Teams (团队)        ← 中层分组，相当于"每个楼层"
       └── Users (用户)   ← 最小单位，相当于"每个房间的住户"
```

### 14.1.2 核心概念

| 概念 | 类比 | 说明 |
|---|---|---|
| **Organization (Org)** | 公寓楼 | 完全隔离的数据空间，Org 之间看不到彼此的数据 |
| **Team** | 楼层小组 | Org 内的用户分组，方便批量管理权限 |
| **User** | 住户 | 可以属于多个 Org，但每次只能在一个 Org 上下文中操作 |
| **Role** | 门禁卡等级 | Admin / Editor / Viewer，控制操作权限 |
| **Folder** | 楼层房间 | Dashboard 和告警的逻辑分组 |
| **Data Source** | 水表电表 | 数据源可以在 Org 间共享或隔离 |

---

## 14.2 多租户架构设计

### 14.2.1 两种模式

#### 模式 A：一个 Org，多个 Team

```
Organization: 公司
├── Team: 支付团队
│   ├── Folder: 支付系统监控
│   │   └── Dashboard: 交易量、失败率...
│   └── Data Source: Prometheus-Payment
├── Team: 基础设施团队
│   ├── Folder: 基础设施监控
│   │   └── Dashboard: CPU、内存、网络...
│   └── Data Source: Prometheus-Infra
└── Team: 前端团队
    ├── Folder: 前端性能监控
    │   └── Dashboard: LCP、FID、CLS...
    └── Data Source: Prometheus-Frontend
```

**适用场景**：团队之间需要一定隔离，但可以在同一个 Org 下协作。

**优点**：管理简单，Dashboard 可以跨 Team 共享。
**缺点**：Admin 可以看到所有数据，隔离不够彻底。

#### 模式 B：多个 Org

```
Organization: 支付团队
├── Team: 支付核心
├── Team: 支付风控
└── Data Source: Prometheus-Payment

Organization: 基础设施团队
├── Team: 基础设施
└── Data Source: Prometheus-Infra

Organization: 前端团队
├── Team: 前端
└── Data Source: Prometheus-Frontend
```

**适用场景**：严格的权限隔离需求，不同 Org 的管理员互不可见。

**优点**：完全隔离，安全性最高。
**缺点**：管理复杂，无法共享资源。

### 14.2.2 真实案例：权限配置不当导致的数据泄露

**某互联网公司** 使用 Grafana 监控所有业务线。架构是"一个 Org + 多个 Team"的模式。理论上，每个 Team 只能看到自己的 Folder。

**事故经过**：

1. **第一层失误**：运维为了方便，把支付团队的 Data Source 设置为 "Default"，并且没有在 Data Source 上设置权限限制。
2. **第二层失误**：前端团队在创建 Dashboard 时，选择了 "Default" 数据源，结果直接连接到了支付数据库。
3. **第三层失误**：支付团队的 Dashboard 文件夹权限设置为 "Everyone can view"——运维觉得"都是自己人，没问题"。

结果：
- 前端工程师小李在浏览 Dashboard 列表时，看到了支付团队的文件夹
- 他点进去，看到了交易额、失败率、日均订单量等敏感数据
- 虽然他没有修改权限，但这些数据已经超出了他的知悉范围

**事后改进**：
1. 每个数据源都设置了明确的 Team 权限
2. Dashboard 文件夹不再对"Everyone"开放
3. 建立了权限审计机制，每月检查一次

---

## 14.3 手把手：配置多租户

### 14.3.1 步骤 1：创建 Organization

打开 Grafana，进入 **Server Admin > Organizations**：

1. 点击 **New Organization**
2. 输入名称：`支付团队`
3. 点击 **Create**

> **旁白注释**：只有 Server Admin（Grafana 超级管理员）才能创建 Organization。普通用户看不到这个选项。

或者通过 API 创建：

```bash
# 使用 API 创建 Organization
curl -X POST http://localhost:3000/api/orgs \
  -H "Content-Type: application/json" \
  -d '{"name":"支付团队"}' \
  -u admin:admin
```

### 14.3.2 步骤 2：创建 Team

在支付团队的 Org 上下文中：

1. 切换 Org：点击左下角头像 > **Switch to 支付团队**
2. 进入 **Configuration > Teams**
3. 点击 **New Team**
4. 输入名称：`支付核心组`

### 14.3.3 步骤 3：创建用户并分配

**创建用户**（Server Admin 操作）：

```
Server Admin > Users > New User
```

| 字段 | 值 |
|---|---|
| Name | 张三 |
| Email | zhangsan@company.com |
| Username | zhangsan |
| Password | ******** |

**将用户加入 Org 和 Team**：

1. 进入 **Server Admin > Users > 选择张三**
2. 在 Organization 部分点击 **Add organization**
3. 选择 Org：`支付团队`
4. 选择 Role：`Editor`
5. 回到 **Configuration > Teams > 支付核心组**
6. 点击 **Add member**，选择张三

### 14.3.4 步骤 4：创建隔离的数据源

```bash
# 创建仅支付团队可见的数据源
curl -X POST http://localhost:3000/api/datasources \
  -H "Content-Type: application/json" \
  -u admin:admin \
  -d '{
    "name": "Prometheus-Payment",
    "type": "prometheus",
    "url": "http://prometheus-payment:9090",
    "access": "proxy",
    "isDefault": false
  }'
```

然后在 UI 中设置数据源权限：
1. 进入 **Configuration > Data Sources > Prometheus-Payment**
2. 点击 **Permissions** 标签
3. 点击 **Add Permission**
4. 选择 **Team: 支付核心组**
5. 选择 **Query** 权限

> **旁白注释**：设置数据源权限是关键步骤。如果不设置，默认所有用户都能使用这个数据源创建 Dashboard，等于没有隔离。

### 14.3.5 步骤 5：创建文件夹并设置权限

```bash
# 创建文件夹
curl -X POST http://localhost:3000/api/folders \
  -H "Content-Type: application/json" \
  -u admin:admin \
  -d '{
    "title": "支付系统监控",
    "uid": "payment-monitoring"
  }'
```

在 UI 中设置文件夹权限：
1. 进入 **Dashboards > 点击 Folder 旁的 ... > Permissions**
2. 点击 **Add Permission**
3. 选择 **Team: 支付核心组**
4. 选择 **View** 或 **Edit** 权限

### 14.3.6 步骤 6：验证隔离

**验证 1：张三（支付团队）的视角**
- 登录 zhangsan 账号
- 应该能看到：支付系统监控文件夹
- 应该看不到：基础设施团队的文件夹

**验证 2：李四（基础设施团队）的视角**
- 登录 lisi 账号
- 应该看不到：支付系统监控文件夹
- 应该能看到：基础设施监控文件夹

**验证 3：数据源隔离**
- 张三在创建 Dashboard 时，数据源下拉列表中只看到 `Prometheus-Payment`
- 看不到 `Prometheus-Infra`

---

## 14.4 Before/After 对比

### Before：权限配置不当（错误做法）

```yaml
# 错误做法：数据源没有权限限制
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    # 没有设置权限，所有用户可用
```

问题：任何用户都可以用这个数据源查询任何指标。

### After：正确配置

```yaml
# 正确做法：每个团队的数据源独立且有权限控制
apiVersion: 1

datasources:
  - name: Prometheus-Payment
    type: prometheus
    url: http://prometheus-payment:9090
    jsonData:
      # 限制到支付团队的数据
      httpHeaderName1: "X-Scope-OrgID"
    secureJsonData:
      httpHeaderValue1: "payment-team"

  - name: Prometheus-Infra
    type: prometheus
    url: http://prometheus-infra:9090
    jsonData:
      httpHeaderName1: "X-Scope-OrgID"
    secureJsonData:
      httpHeaderValue1: "infra-team"
```

---

## 14.5 高级配置：使用 Provisioning 管理多租户

### 14.5.1 多 Org 的 Provisioning

```yaml
# provisioning/datasources/multi-org-datasources.yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus-payment:9090
    orgId: 2  # 支付团队的 Org ID

  - name: Prometheus
    type: prometheus
    url: http://prometheus-infra:9090
    orgId: 3  # 基础设施团队的 Org ID
```

### 14.5.2 Dashboard 按 Org 分配

```yaml
# provisioning/dashboards/dashboards.yaml
apiVersion: 1

providers:
  - name: "Payment Dashboards"
    orgId: 2  # 支付团队
    folder: "支付系统监控"
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards/payment

  - name: "Infra Dashboards"
    orgId: 3  # 基础设施团队
    folder: "基础设施监控"
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards/infra
```

---

## 14.6 多租户最佳实践

### 14.6.1 权限原则

1. **最小权限原则**：只给用户完成工作所需的最小权限
2. **默认拒绝原则**：默认不授予任何权限，显式授予
3. **分层管理原则**：
   - Server Admin：运维团队（1-2人）
   - Org Admin：各团队负责人
   - Editor：开发工程师
   - Viewer：只读用户（管理者、产品经理）

### 14.6.2 组织建议

```
Server Admin（运维团队）
├── Org: 支付团队
│   ├── Admin: 支付团队 TL
│   ├── Editor: 支付开发
│   └── Viewer: 支付 PM
├── Org: 基础设施团队
│   ├── Admin: 基础设施 TL
│   ├── Editor: 运维工程师
│   └── Viewer: CTO
└── Org: 前端团队
    ├── Admin: 前端团队 TL
    ├── Editor: 前端开发
    └── Viewer: 前端 PM
```

### 14.6.3 审计清单

每月检查以下项目：

- [ ] 是否有已离职员工的账号未禁用
- [ ] 是否有非 Admin 用户拥有 Admin 权限
- [ ] 是否有 Dashboard 的权限设置过于宽松（Everyone can view）
- [ ] 是否有数据源未设置权限限制
- [ ] 是否有 Viewer 用户意外获得了 Editor 权限

---

## 14.7 常见问题

| 问题 | 原因 | 解决 |
|---|---|---|
| 用户能看到其他团队的数据 | 数据源权限未设置 | 为每个数据源设置 Team 权限 |
| 用户创建了 Dashboard 但别人看不到 | 创建时选错了 Org | 切换 Org 上下文后创建 |
| API Key 权限过高 | 使用了 Admin 级别的 API Key | 创建 API Key 时限定权限 |
| 文件夹权限与数据源权限冲突 | 用户能看到文件夹但不能查询数据 | 统一设置文件夹和数据源权限 |
| 跨 Org 共享 Dashboard | Org 间完全隔离，无法直接共享 | 使用 Dashboard 导出/导入功能 |

---

## 14.8 练习

1. 创建两个 Org 并验证数据隔离
2. 为不同的 Team 分配不同的数据源权限
3. 创建一个只有 Viewer 权限的账号，验证其无法修改 Dashboard
4. 使用 API 创建多 Org 的 Provisioning 配置
5. 搭建多租户环境后，尝试从不同账号登录验证权限隔离效果
