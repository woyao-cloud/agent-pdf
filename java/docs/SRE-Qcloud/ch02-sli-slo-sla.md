# 第2章 SLI、SLO 与 SLA：腾讯云可靠性度量体系

## 2.1 引言

在云原生时代，可靠性不再是"尽力而为"的承诺，而是可度量、可协商、可追责的工程契约。站点可靠性工程（SRE）的核心方法论之一，就是将运维经验转化为量化指标，并通过指标驱动决策。Google SRE 圣经中提出了三个层层递进的概念——**SLI（Service Level Indicator，服务等级指标）**、**SLO（Service Level Objective，服务等级目标）** 和 **SLA（Service Level Agreement，服务等级协议）**——构成了现代云服务可靠性度量的基石。

腾讯云作为国内头部云厂商，提供了丰富的 SLA 承诺和补偿机制。本章将从 SLI 的定义与采集讲起，逐步深入到 SLO 的设定策略、SLA 的法律效力与补偿计算，并结合腾讯云的实际案例，帮助读者建立一套完整的可靠性度量体系。

---

## 2.2 SLI：服务等级指标

### 2.2.1 什么是 SLI

SLI 是对服务某个特定维度的量化测量结果。简单来说，SLI 回答的问题是："我们的服务现在表现如何？"

一个 SLI 通常由三个要素构成：

1. **测量对象**：要衡量什么（如请求延迟、错误率、吞吐量）
2. **测量方法**：如何采集数据（如服务端日志、客户端探测、第三方拨测）
3. **聚合方式**：如何汇总数据（如时间窗口平均、百分位数、滑动窗口比率）

### 2.2.2 黄金信号（The Four Golden Signals）

Google SRE 团队提出了四个"黄金信号"，几乎适用于任何分布式系统：

| 信号 | 定义 | 典型 SLI 示例 |
|------|------|---------------|
| **延迟（Latency）** | 请求从发出到收到响应的时间 | p99 延迟 < 500ms |
| **流量（Traffic）** | 系统承载的请求量 | QPS、RPS、并发连接数 |
| **错误（Errors）** | 显式或隐式的失败请求 | HTTP 5xx 率 < 1% |
| **饱和度（Saturation）** | 资源使用程度 | CPU 使用率 < 80%、内存使用率 < 70% |

在实践中，腾讯云 SRE 团队还会补充第五个信号——**可用性（Availability）**，即服务正常响应请求的时间比例，通常以"9"的个数来衡量（如 99.99%）。

### 2.2.3 腾讯云场景下的典型 SLI

针对不同的腾讯云产品，SLI 的侧重点有所不同：

**计算类（CVM、TKE）：**
- 实例创建成功率
- 实例运行时长 / 故障间隔时间（MTBF）
- API 调用成功率
- 控制台响应延迟

**存储类（COS、CBS）：**
- 数据持久性（如 99.9999999999%）
- 读写请求延迟（p50 / p99）
- 服务可用性（月度百分比）
- 数据一致性延迟

**网络类（CLB、CDN）：**
- 请求转发成功率
- 连接建立延迟
- 带宽利用率
- 回源成功率

**数据库类（MySQL、Redis、MongoDB）：**
- 连接成功率
- 查询延迟（慢查询比例）
- 主从同步延迟
- 自动故障转移时间

### 2.2.4 SLI 的采集与计算

SLI 的采集通常依赖以下数据源：

1. **服务端日志**：通过分析访问日志中的状态码、响应时间计算
2. **客户端探测**：从用户视角发起拨测，获取真实体验数据
3. **基础设施监控**：利用 Prometheus、腾讯云 Monitor 等工具采集指标
4. **分布式追踪**：通过调用链数据计算端到端延迟

SLI 的计算公式通常为：

```
SLI = 有效事件数 / 总事件数 × 100%
```

例如，可用性 SLI 的计算方式为：

```
可用性 = (总请求数 - 失败请求数) / 总请求数 × 100%
```

其中"失败请求"的定义需要明确：是仅包含 HTTP 5xx，还是包含超时、连接拒绝等情况？这需要在 SRE 团队与业务方之间达成共识。

---

## 2.3 SLO：服务等级目标

### 2.3.1 什么是 SLO

SLO 是为 SLI 设定的目标阈值。如果说 SLI 是"现在怎么样"，那么 SLO 就是"应该怎么样"。SLO 是 SRE 团队与业务方之间的内部契约，它定义了"足够好"的标准。

SLO 的典型表达方式：

```
月度可用性 ≥ 99.95%
p99 延迟 ≤ 200ms
错误率 ≤ 0.1%
```

### 2.3.2 为什么需要 SLO

没有 SLO 的运维是盲目的。SLO 的价值体现在：

1. **决策依据**：当系统出现异常时，SLO 告诉你是否需要立即响应
2. **资源分配**：指导团队将精力投入到最影响用户体验的环节
3. **创新许可**：在 SLO 达标的前提下，允许团队进行风险可控的变更
4. **沟通工具**：用数据而非感觉来讨论服务质量

### 2.3.3 错误预算（Error Budget）

错误预算是 SRE 中最具革命性的概念之一。它的定义是：

```
错误预算 = 1 - SLO
```

例如，如果 SLO 是 99.9%，那么错误预算就是 0.1%。这意味着在一个月内，服务最多可以"出错"的时间是：

```
30天 × 24小时 × 60分钟 × 0.1% = 43.2分钟
```

错误预算的核心思想是：

- **预算内**：允许发布新功能、进行变更，即使可能引入小风险
- **预算耗尽**：冻结所有非关键变更，全力投入稳定性建设
- **预算为负**：触发紧急响应机制，需要复盘和改进

这种机制将"可靠性"和"创新速度"之间的矛盾转化为可量化的权衡。

### 2.3.4 如何设定合理的 SLO

设定 SLO 不是纯技术活动，而是技术、业务和用户体验的交叉决策。以下是腾讯云 SRE 团队推荐的 SLO 设定流程：

**第一步：理解用户期望**

通过用户反馈、客服工单、用户行为分析等方式，了解用户对服务质量的真实感受。例如：
- 用户能接受的页面加载时间是多少？
- 用户能容忍的故障时长是多少？
- 用户是否会因为一次失败而放弃使用？

**第二步：分析当前表现**

基于历史监控数据，了解当前服务的实际 SLI 水平。如果当前可用性是 99.95%，设定 99.999% 的 SLO 可能不切实际。

**第三步：设定目标 SLO**

结合用户期望和当前表现，设定一个有挑战性但可达成的目标。建议采用"渐进式"策略：

| 阶段 | SLO | 说明 |
|------|-----|------|
| 初始 | 99.9% | 基本可用，适合 MVP 阶段 |
| 优化 | 99.95% | 多数商业场景可接受 |
| 成熟 | 99.99% | 关键业务系统要求 |
| 极致 | 99.999% | 金融、交易等极高要求场景 |

**第四步：定义测量窗口**

SLO 的测量窗口通常为一个月或一个季度。窗口越长，统计意义越强，但对短期波动的敏感度越低。腾讯云通常采用**月度**窗口。

**第五步：建立告警策略**

SLO 告警不应在 SLO 被违反时才触发——那时已经太晚了。推荐的告警策略是**基于燃烧率（Burn Rate）**：

- **快速燃烧**：错误预算在 1 小时内消耗 10% → 立即告警
- **中速燃烧**：错误预算在 6 小时内消耗 10% → 较高优先级告警
- **慢速燃烧**：错误预算在 36 小时内消耗 10% → 工单或低优先级告警

### 2.3.5 与业务团队协商 SLO

SLO 的协商是 SRE 工作中最具挑战性也最重要的环节之一。以下是腾讯云 SRE 团队总结的实战经验：

**常见分歧与应对：**

| 业务方诉求 | SRE 视角 | 折中方案 |
|-----------|---------|---------|
| "我们要 99.999%" | 成本过高，收益递减 | 分模块设定不同 SLO，核心链路 99.999%，非核心 99.9% |
| "出了问题你们负责" | 需要明确责任边界 | 定义共同责任模型，明确双方职责 |
| "SLO 越高越好" | 需要权衡成本 | 展示 SLO 与成本的关系曲线，让业务方做 informed decision |
| "为什么不能立即修复" | 需要评估风险 | 用错误预算沟通，预算内允许排队，预算外立即响应 |

**协商要点：**

1. **用数据说话**：展示当前 SLI 分布、历史故障记录、用户投诉数据
2. **量化成本**：每提升一个"9"需要多少基础设施投入
3. **分层承诺**：不同业务线、不同模块可以有不同的 SLO
4. **预留缓冲**：内部 SLO 应比对外承诺的 SLO 更严格（通常预留 10%-20% 的缓冲）

---

## 2.4 SLA：服务等级协议

### 2.4.1 什么是 SLA

SLA 是服务提供商与客户之间的法律协议，明确规定了服务质量承诺以及未达标时的赔偿方案。与 SLO 不同，SLA 具有法律约束力。

SLA 的核心要素：

1. **服务承诺**：明确的服务质量指标（如可用性 ≥ 99.9%）
2. **测量方式**：如何计算和验证指标
3. **排除条款**：哪些情况不计入 SLA 计算（如计划维护、不可抗力）
4. **赔偿方案**：未达标时的补偿方式（如代金券、延长服务期）
5. **申诉流程**：客户如何发起 SLA 索赔

### 2.4.2 腾讯云 SLA 全景

腾讯云为不同产品线提供了差异化的 SLA 承诺。以下是主要产品的 SLA 概览：

| 产品类别 | 典型产品 | 可用性 SLA | 赔偿上限 |
|---------|---------|-----------|---------|
| 计算 | CVM | 99.975% | 月度服务费的 100% |
| 存储 | COS | 99.95% - 99.99% | 月度服务费的 100% |
| 网络 | CLB | 99.95% | 月度服务费的 100% |
| 数据库 | TencentDB for MySQL | 99.99% | 月度服务费的 100% |
| 容器 | TKE | 99.95% | 月度服务费的 100% |
| CDN | CDN | 99.9% | 月度服务费的 100% |

**赔偿阶梯（以 CVM 为例）：**

| 月度服务可用性 | 赔偿代金券金额 |
|---------------|---------------|
| < 99.975% 且 ≥ 99.0% | 月度服务费的 10% |
| < 99.0% 且 ≥ 95.0% | 月度服务费的 25% |
| < 95.0% | 月度服务费的 100% |

### 2.4.3 SLA 的计算方法

腾讯云 SLA 的可用性计算公式为：

```
服务可用性 = (月度总分钟数 - 服务不可用分钟数) / 月度总分钟数 × 100%
```

其中"服务不可用"的定义需要特别注意：

- **CVM**：实例无法与任一内部或外部 IP 通信，且持续时间超过 5 分钟
- **COS**：服务端返回 5xx 错误，且持续时间超过 5 分钟
- **CLB**：CLB 实例无法转发请求，且持续时间超过 5 分钟

**排除条款（不计入不可用时间）：**

1. 腾讯云提前通知的计划内维护
2. 用户自身原因导致的故障（如配置错误、安全组设置不当）
3. 第三方原因（如运营商网络故障、DDoS 攻击超过防护阈值）
4. 不可抗力（自然灾害、战争、政府行为等）
5. 开源软件自身漏洞导致的故障
6. 用户未遵循最佳实践导致的性能下降

### 2.4.4 SLA 赔偿流程

当腾讯云服务未达到 SLA 承诺时，客户可以通过以下步骤申请赔偿：

1. **确认故障**：通过腾讯云控制台或工单系统确认故障时间
2. **提交工单**：在故障发生后 60 天内提交赔偿申请
3. **提供证据**：提供受影响的资源 ID、故障时间段、影响描述
4. **腾讯云审核**：腾讯云在 10 个工作日内完成审核
5. **发放赔偿**：审核通过后，赔偿代金券将在 15 个工作日内发放

**注意事项：**

- 赔偿以代金券形式发放，不可提现
- 单次故障赔偿上限为月度服务费的 100%
- 同一自然月内多次故障，赔偿总额不超过月度服务费的 100%
- 赔偿代金券有效期通常为 6 个月

### 2.4.5 SLA 的局限性

SLA 虽然重要，但 SRE 团队需要清醒认识到它的局限性：

1. **赔偿远不足以覆盖损失**：对于电商平台，1 小时宕机可能造成数百万损失，而 SLA 赔偿可能只有几千元
2. **SLA 是事后补救**：SLA 无法预防故障，也无法在故障发生时帮助恢复
3. **SLA 指标可能不反映真实体验**：99.9% 可用性听起来很好，但如果故障发生在"双十一"当天，影响是灾难性的
4. **SLA 测量存在盲区**：某些故障可能被排除条款覆盖，导致客户无法获得赔偿

因此，SRE 团队不应将 SLA 作为唯一目标，而应将其视为最低保障线。

---

## 2.5 腾讯云 SRE 实践：SLI/SLO/SLA 落地案例

### 2.5.1 案例：某电商平台的 SLO 设计

某电商平台使用腾讯云 TKE + MySQL + Redis + CDN 构建核心交易系统。SRE 团队为其设计了分层 SLO 体系：

**核心交易链路（下单、支付）：**

| 指标 | SLI 定义 | SLO 目标 | 测量窗口 |
|------|---------|---------|---------|
| 可用性 | 下单接口成功率 | 99.99% | 月度 |
| 延迟 | 下单接口 p99 延迟 | ≤ 300ms | 月度 |
| 数据库可用性 | MySQL 连接成功率 | 99.995% | 月度 |
| 缓存可用性 | Redis 操作成功率 | 99.999% | 月度 |

**非核心链路（商品浏览、搜索）：**

| 指标 | SLI 定义 | SLO 目标 | 测量窗口 |
|------|---------|---------|---------|
| 可用性 | 商品列表接口成功率 | 99.9% | 月度 |
| 延迟 | 商品列表 p99 延迟 | ≤ 1s | 月度 |
| CDN 可用性 | 静态资源加载成功率 | 99.9% | 月度 |

**内部 SLO vs 对外 SLA：**

- 内部 SLO：99.99%（预留 0.04% 的错误预算缓冲）
- 对外 SLA：99.95%（与腾讯云 CVM SLA 对齐）

### 2.5.2 错误预算驱动决策

该电商平台的 SRE 团队建立了错误预算仪表板，每周在 SRE 周会上回顾：

- **预算充足（> 50% 剩余）**：允许正常发布，鼓励进行性能优化实验
- **预算中等（20% - 50% 剩余）**：限制高风险变更，增加 Code Review 和灰度比例
- **预算紧张（< 20% 剩余）**：冻结非关键发布，成立稳定性专项小组
- **预算耗尽（0% 剩余）**：启动故障复盘，所有变更需 VP 审批

### 2.5.3 腾讯云 SLA 索赔实战

该平台在运营期间经历了一次持续 15 分钟的 CLB 故障。SRE 团队的处理流程：

1. **故障发现**：监控告警触发，确认 CLB 实例无法转发请求
2. **故障处理**：联系腾讯云技术支持，15 分钟后恢复
3. **影响评估**：影响约 2000 笔订单，直接损失约 50 万元
4. **SLA 索赔**：确认故障属于 CLB SLA 覆盖范围，提交赔偿申请
5. **赔偿结果**：获得当月 CLB 服务费 25% 的代金券赔偿（约 3000 元）
6. **复盘改进**：增加多 CLB 实例部署，避免单点故障

这个案例很好地说明了 SLA 赔偿的局限性——3000 元的代金券远不足以覆盖 50 万元的业务损失。这也再次印证了：**SLA 是底线，不是目标**。

---

## 2.6 Python SLO 计算脚本

以下是一个完整的 Python 脚本，用于计算 SLO 合规性、错误预算消耗和燃烧率。该脚本可以直接集成到腾讯云监控体系中。

```python
#!/usr/bin/env python3
"""
SLO 计算工具 —— 腾讯云 SRE 实践
功能：
  1. 计算月度可用性 SLI
  2. 判断 SLO 是否达标
  3. 计算错误预算消耗
  4. 计算燃烧率（Burn Rate）
  5. 生成 SLO 报告
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import json
import math


class SLICalculator:
    """SLI 计算器：根据原始指标计算服务等级指标"""

    @staticmethod
    def availability(
        total_requests: int,
        failed_requests: int,
    ) -> float:
        """
        计算可用性 SLI

        参数:
            total_requests: 总请求数
            failed_requests: 失败请求数（5xx、超时、连接拒绝等）

        返回:
            可用性百分比（如 99.95）
        """
        if total_requests == 0:
            return 100.0
        return round((1 - failed_requests / total_requests) * 100, 4)

    @staticmethod
    def latency_percentile(
        latencies: List[float],
        percentile: float = 99.0,
    ) -> float:
        """
        计算延迟百分位数

        参数:
            latencies: 延迟列表（单位：毫秒）
            percentile: 百分位（如 99.0 表示 p99）

        返回:
            对应百分位的延迟值（毫秒）
        """
        if not latencies:
            return 0.0
        sorted_latencies = sorted(latencies)
        index = math.ceil(len(sorted_latencies) * percentile / 100) - 1
        index = max(0, min(index, len(sorted_latencies) - 1))
        return sorted_latencies[index]

    @staticmethod
    def error_rate(
        total_requests: int,
        error_requests: int,
    ) -> float:
        """
        计算错误率

        参数:
            total_requests: 总请求数
            error_requests: 错误请求数

        返回:
            错误率百分比
        """
        if total_requests == 0:
            return 0.0
        return round(error_requests / total_requests * 100, 4)


class SLOMonitor:
    """SLO 监控器：评估 SLO 合规性并管理错误预算"""

    def __init__(
        self,
        slo_target: float,
        window_days: int = 30,
        name: str = "default",
    ):
        """
        初始化 SLO 监控器

        参数:
            slo_target: SLO 目标值（如 99.95 表示 99.95%）
            window_days: 评估窗口（天）
            name: SLO 名称标识
        """
        self.slo_target = slo_target
        self.window_days = window_days
        self.name = name
        self.error_budget_total = 100.0 - slo_target
        self.error_budget_consumed = 0.0
        self.sli_history: List[Tuple[datetime, float]] = []

    def record_sli(self, timestamp: datetime, sli_value: float) -> None:
        """
        记录一次 SLI 测量值

        参数:
            timestamp: 测量时间戳
            sli_value: SLI 值（百分比）
        """
        self.sli_history.append((timestamp, sli_value))
        # 清理超出窗口的历史数据
        cutoff = timestamp - timedelta(days=self.window_days)
        self.sli_history = [
            (t, v) for t, v in self.sli_history if t >= cutoff
        ]

    def calculate_compliance(self) -> Dict:
        """
        计算 SLO 合规状态

        返回:
            包含合规性详细信息的字典
        """
        if not self.sli_history:
            return {
                "slo_name": self.name,
                "slo_target": self.slo_target,
                "status": "no_data",
                "current_sli": None,
                "error_budget_total_pct": self.error_budget_total,
                "error_budget_consumed_pct": 0.0,
                "error_budget_remaining_pct": self.error_budget_total,
                "is_compliant": True,
            }

        # 计算窗口内的平均 SLI
        avg_sli = sum(v for _, v in self.sli_history) / len(self.sli_history)
        sli_deficit = self.slo_target - avg_sli

        # 计算错误预算消耗
        if sli_deficit > 0:
            self.error_budget_consumed = sli_deficit
        else:
            self.error_budget_consumed = 0.0

        error_budget_remaining = self.error_budget_total - self.error_budget_consumed
        is_compliant = error_budget_remaining >= 0

        return {
            "slo_name": self.name,
            "slo_target": self.slo_target,
            "status": "compliant" if is_compliant else "breached",
            "current_sli": round(avg_sli, 4),
            "sli_deficit": round(sli_deficit, 4),
            "error_budget_total_pct": round(self.error_budget_total, 4),
            "error_budget_consumed_pct": round(self.error_budget_consumed, 4),
            "error_budget_remaining_pct": round(error_budget_remaining, 4),
            "is_compliant": is_compliant,
            "measurement_count": len(self.sli_history),
        }

    def calculate_burn_rate(
        self,
        window_minutes: int = 60,
    ) -> Dict:
        """
        计算错误预算燃烧率

        燃烧率 = 当前窗口内消耗的错误预算 / 理想消耗速率
        理想消耗速率 = 总错误预算 / 总窗口时间

        参数:
            window_minutes: 计算窗口（分钟）

        返回:
            燃烧率信息
        """
        if len(self.sli_history) < 2:
            return {
                "burn_rate": 0.0,
                "level": "unknown",
                "message": "数据不足，无法计算燃烧率",
            }

        # 取最近 window_minutes 的数据
        now = self.sli_history[-1][0]
        cutoff = now - timedelta(minutes=window_minutes)
        recent_data = [
            (t, v) for t, v in self.sli_history if t >= cutoff
        ]

        if len(recent_data) < 2:
            return {
                "burn_rate": 0.0,
                "level": "unknown",
                "message": "窗口内数据不足",
            }

        # 计算窗口内的平均 SLI
        avg_sli = sum(v for _, v in recent_data) / len(recent_data)
        sli_deficit = max(0, self.slo_target - avg_sli)

        # 理想消耗速率：在完整窗口内均匀消耗错误预算
        total_window_minutes = self.window_days * 24 * 60
        ideal_burn_rate = self.error_budget_total / total_window_minutes

        # 实际消耗速率
        actual_burn_rate = sli_deficit / window_minutes if window_minutes > 0 else 0

        # 燃烧率 = 实际 / 理想
        burn_rate = (
            round(actual_burn_rate / ideal_burn_rate, 2)
            if ideal_burn_rate > 0
            else 0.0
        )

        # 燃烧率等级
        if burn_rate >= 10:
            level = "critical"
            message = "🔥 快速燃烧！错误预算正在快速消耗，需要立即响应"
        elif burn_rate >= 4:
            level = "warning"
            message = "⚠️ 中速燃烧，建议排查问题"
        elif burn_rate >= 1:
            level = "notice"
            message = "📋 正常消耗，持续关注"
        else:
            level = "healthy"
            message = "✅ 燃烧率低于预期，状态健康"

        return {
            "burn_rate": burn_rate,
            "level": level,
            "message": message,
            "window_minutes": window_minutes,
            "window_avg_sli": round(avg_sli, 4),
            "window_sli_deficit": round(sli_deficit, 4),
        }

    def time_to_budget_exhaustion(self, burn_rate: float) -> Optional[float]:
        """
        预测错误预算耗尽时间

        参数:
            burn_rate: 当前燃烧率

        返回:
            预计耗尽时间（小时），如果燃烧率 <= 0 则返回 None
        """
        if burn_rate <= 0:
            return None

        remaining_budget = self.error_budget_total - self.error_budget_consumed
        if remaining_budget <= 0:
            return 0.0

        # 理想消耗速率（每小时）
        total_hours = self.window_days * 24
        ideal_hourly = self.error_budget_total / total_hours

        # 实际消耗速率
        actual_hourly = ideal_hourly * burn_rate

        if actual_hourly <= 0:
            return None

        hours_remaining = remaining_budget / actual_hourly
        return round(hours_remaining, 1)


class SLACalculator:
    """SLA 计算器：评估腾讯云 SLA 合规性及赔偿金额"""

    # 腾讯云典型产品 SLA 配置
    TENCENT_CLOUD_SLA = {
        "cvm": {"availability": 99.975, "monthly_max_compensation": 1.0},
        "cos": {"availability": 99.95, "monthly_max_compensation": 1.0},
        "clb": {"availability": 99.95, "monthly_max_compensation": 1.0},
        "mysql": {"availability": 99.99, "monthly_max_compensation": 1.0},
        "redis": {"availability": 99.99, "monthly_max_compensation": 1.0},
        "tke": {"availability": 99.95, "monthly_max_compensation": 1.0},
        "cdn": {"availability": 99.9, "monthly_max_compensation": 1.0},
    }

    # 赔偿阶梯（以 CVM 为例）
    COMPENSATION_TIERS = [
        (99.975, 99.0, 0.10),   # < 99.975% 且 >= 99.0% → 10%
        (99.0, 95.0, 0.25),     # < 99.0% 且 >= 95.0% → 25%
        (95.0, 0.0, 1.0),       # < 95.0% → 100%
    ]

    def __init__(self, product: str, monthly_fee: float):
        """
        初始化 SLA 计算器

        参数:
            product: 腾讯云产品名（cvm, cos, clb, mysql 等）
            monthly_fee: 月度服务费（元）
        """
        self.product = product.lower()
        self.monthly_fee = monthly_fee
        sla_config = self.TENCENT_CLOUD_SLA.get(self.product)
        if sla_config is None:
            raise ValueError(f"不支持的产品: {product}，支持的产品: {list(self.TENCENT_CLOUD_SLA.keys())}")
        self.sla_availability = sla_config["availability"]
        self.max_compensation_ratio = sla_config["monthly_max_compensation"]

    def check_sla_compliance(self, actual_availability: float) -> Dict:
        """
        检查 SLA 合规性

        参数:
            actual_availability: 实际可用性（百分比）

        返回:
            SLA 合规性评估结果
        """
        is_compliant = actual_availability >= self.sla_availability
        deficit = round(self.sla_availability - actual_availability, 4)

        return {
            "product": self.product,
            "sla_commitment": self.sla_availability,
            "actual_availability": actual_availability,
            "is_compliant": is_compliant,
            "deficit": max(0, deficit),
            "monthly_fee": self.monthly_fee,
        }

    def calculate_compensation(self, actual_availability: float) -> Dict:
        """
        计算 SLA 赔偿金额

        参数:
            actual_availability: 实际可用性（百分比）

        返回:
            赔偿详细信息
        """
        sla_result = self.check_sla_compliance(actual_availability)

        if sla_result["is_compliant"]:
            return {
                **sla_result,
                "compensation_ratio": 0.0,
                "compensation_amount": 0.0,
                "compensation_note": "SLA 达标，无需赔偿",
            }

        # 根据赔偿阶梯计算赔偿比例
        compensation_ratio = 0.0
        for upper, lower, ratio in self.COMPENSATION_TIERS:
            if actual_availability < upper and actual_availability >= lower:
                compensation_ratio = ratio
                break

        # 赔偿金额 = 月度服务费 × 赔偿比例
        compensation_amount = round(self.monthly_fee * compensation_ratio, 2)

        # 不超过月度服务费的 100%
        max_compensation = round(self.monthly_fee * self.max_compensation_ratio, 2)
        compensation_amount = min(compensation_amount, max_compensation)

        return {
            **sla_result,
            "compensation_ratio": compensation_ratio,
            "compensation_amount": compensation_amount,
            "max_compensation": max_compensation,
            "compensation_note": (
                f"SLA 未达标（差额 {sla_result['deficit']}%），"
                f"赔偿比例 {compensation_ratio * 100}%，"
                f"赔偿金额 ¥{compensation_amount}"
            ),
        }

    @staticmethod
    def minutes_to_availability(
        total_minutes: int,
        unavailable_minutes: int,
    ) -> float:
        """
        根据不可用分钟数计算可用性

        参数:
            total_minutes: 月度总分钟数
            unavailable_minutes: 不可用分钟数

        返回:
            可用性百分比
        """
        if total_minutes == 0:
            return 100.0
        return round((1 - unavailable_minutes / total_minutes) * 100, 4)

    @staticmethod
    def availability_to_downtime(availability: float, period_days: int = 30) -> Dict:
        """
        将可用性转换为允许的停机时间

        参数:
            availability: 可用性百分比
            period_days: 评估周期（天）

        返回:
            不同时间单位的停机时间
        """
        total_minutes = period_days * 24 * 60
        unavailable_ratio = (100 - availability) / 100
        unavailable_minutes = total_minutes * unavailable_ratio

        return {
            "availability": availability,
            "period_days": period_days,
            "total_minutes": total_minutes,
            "unavailable_minutes": round(unavailable_minutes, 2),
            "unavailable_hours": round(unavailable_minutes / 60, 2),
            "unavailable_days": round(unavailable_minutes / 60 / 24, 4),
            "nines": round(-math.log10(100 - availability), 2) if availability < 100 else float('inf'),
        }


def generate_slo_report(
    sli_data: Dict[str, List[float]],
    slo_configs: Dict[str, float],
    product: str = "cvm",
    monthly_fee: float = 10000.0,
) -> str:
    """
    生成完整的 SLO 报告

    参数:
        sli_data: SLI 数据，格式 {指标名: [测量值列表]}
        slo_configs: SLO 配置，格式 {指标名: SLO 目标值}
        product: 腾讯云产品名
        monthly_fee: 月度服务费

    返回:
        格式化的 SLO 报告文本
    """
    lines = []
    lines.append("=" * 60)
    lines.append("  SRE SLO 合规性报告")
    lines.append(f"  生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("=" * 60)
    lines.append("")

    total_compliant = 0
    total_metrics = len(slo_configs)

    for metric_name, slo_target in slo_configs.items():
        values = sli_data.get(metric_name, [])
        if not values:
            lines.append(f"  [指标] {metric_name}")
            lines.append(f"  [状态] ⚠️ 无数据")
            lines.append("")
            continue

        # 计算当前 SLI
        if metric_name == "availability":
            # 可用性：假设 values 是 [总请求数, 失败请求数]
            current_sli = SLICalculator.availability(int(values[0]), int(values[1]))
        elif metric_name == "error_rate":
            current_sli = SLICalculator.error_rate(int(values[0]), int(values[1]))
        elif metric_name == "latency":
            current_sli = SLICalculator.latency_percentile(values, 99.0)
        else:
            current_sli = sum(values) / len(values)

        # 创建 SLO 监控器
        monitor = SLOMonitor(slo_target, name=metric_name)
        now = datetime.now()
        for i in range(len(values)):
            monitor.record_sli(
                now - timedelta(hours=len(values) - i),
                current_sli if metric_name in ("availability", "error_rate") else values[i],
            )

        compliance = monitor.calculate_compliance()
        burn_rate = monitor.calculate_burn_rate(window_minutes=60)

        # 输出指标信息
        status_icon = "✅" if compliance["is_compliant"] else "❌"
        lines.append(f"  {status_icon} [{metric_name}]")
        lines.append(f"     SLO 目标: {slo_target}%")
        lines.append(f"     当前 SLI: {compliance['current_sli']}%")
        lines.append(f"     状态: {compliance['status']}")
        lines.append(f"     错误预算: 总计 {compliance['error_budget_total_pct']}% | "
                      f"已消耗 {compliance['error_budget_consumed_pct']}% | "
                      f"剩余 {compliance['error_budget_remaining_pct']}%")
        lines.append(f"     燃烧率: {burn_rate['burn_rate']} ({burn_rate['level']})")
        lines.append(f"     {burn_rate['message']}")
        lines.append("")

        if compliance["is_compliant"]:
            total_compliant += 1

    # SLA 评估
    lines.append("-" * 60)
    lines.append("  SLA 评估")
    lines.append("-" * 60)
    lines.append("")

    sla_calc = SLACalculator(product, monthly_fee)
    # 假设可用性 SLI 作为 SLA 评估依据
    avail_values = sli_data.get("availability", [100, 0])
    actual_avail = SLICalculator.availability(int(avail_values[0]), int(avail_values[1]))
    sla_result = sla_calc.calculate_compensation(actual_avail)

    lines.append(f"  产品: {product.upper()}")
    lines.append(f"  SLA 承诺: {sla_result['sla_commitment']}%")
    lines.append(f"  实际可用性: {sla_result['actual_availability']}%")
    lines.append(f"  合规: {'是 ✅' if sla_result['is_compliant'] else '否 ❌'}")
    lines.append(f"  月度服务费: ¥{monthly_fee:,.2f}")
    lines.append(f"  赔偿金额: ¥{sla_result['compensation_amount']:,.2f}")
    lines.append(f"  说明: {sla_result['compensation_note']}")
    lines.append("")

    # 可用性等级对照
    lines.append("-" * 60)
    lines.append("  可用性等级参考")
    lines.append("-" * 60)
    lines.append("")
    for nines in [1, 2, 3, 4, 5]:
        avail = 100 - 10 ** (-nines)
        downtime = SLACalculator.availability_to_downtime(avail)
        lines.append(f"  {avail:.{'0' if nines <= 3 else ''}{nines}f}% "
                      f"({nines}个9) → "
                      f"年停机约 {downtime['unavailable_minutes'] * 12:.0f} 分钟 / "
                      f"月停机约 {downtime['unavailable_minutes']:.0f} 分钟")
    lines.append("")

    lines.append("=" * 60)
    lines.append(f"  总结: {total_compliant}/{total_metrics} 指标达标")
    lines.append("=" * 60)

    return "\n".join(lines)


# ============================================================
# 示例：使用脚本进行 SLO 计算
# ============================================================
if __name__ == "__main__":
    # 示例 1：可用性 SLO 计算
    print("=" * 60)
    print("  示例 1：可用性 SLO 计算")
    print("=" * 60)

    monitor = SLOMonitor(slo_target=99.95, name="API 可用性")
    now = datetime.now()

    # 模拟 30 天的 SLI 数据（每天 1 个数据点）
    import random
    random.seed(42)
    for day in range(30):
        timestamp = now - timedelta(days=29 - day)
        # 模拟可用性：大部分在 99.95% 以上，偶尔波动
        base = 99.95
        noise = random.uniform(-0.1, 0.05)
        sli = base + noise
        # 第 10 天模拟故障
        if day == 10:
            sli = 99.5
        monitor.record_sli(timestamp, sli)

    compliance = monitor.calculate_compliance()
    print(f"  SLO 目标: {compliance['slo_target']}%")
    print(f"  当前 SLI: {compliance['current_sli']}%")
    print(f"  状态: {compliance['status']}")
    print(f"  错误预算剩余: {compliance['error_budget_remaining_pct']}%")
    print()

    burn_rate = monitor.calculate_burn_rate(window_minutes=1440)  # 最近 24 小时
    print(f"  燃烧率: {burn_rate['burn_rate']}")
    print(f"  等级: {burn_rate['level']}")
    print(f"  {burn_rate['message']}")
    print()

    # 示例 2：SLA 赔偿计算
    print("=" * 60)
    print("  示例 2：腾讯云 SLA 赔偿计算")
    print("=" * 60)

    sla = SLACalculator("cvm", monthly_fee=5000.0)

    # 场景 A：SLA 达标
    result_a = sla.calculate_compensation(99.98)
    print(f"  场景 A（可用性 99.98%）：{result_a['compensation_note']}")

    # 场景 B：轻微不达标
    result_b = sla.calculate_compensation(99.9)
    print(f"  场景 B（可用性 99.90%）：{result_b['compensation_note']}")

    # 场景 C：严重不达标
    result_c = sla.calculate_compensation(94.0)
    print(f"  场景 C（可用性 94.00%）：{result_c['compensation_note']}")
    print()

    # 示例 3：可用性等级对照
    print("=" * 60)
    print("  示例 3：可用性等级与停机时间")
    print("=" * 60)
    for avail in [99.9, 99.95, 99.99, 99.999]:
        dt = SLACalculator.availability_to_downtime(avail)
        print(f"  {avail}% → 月停机 {dt['unavailable_minutes']:.1f} 分钟 / "
              f"年停机 {dt['unavailable_minutes'] * 12:.0f} 分钟")
    print()

    # 示例 4：生成完整报告
    print("=" * 60)
    print("  示例 4：生成完整 SLO 报告")
    print("=" * 60)

    report = generate_slo_report(
        sli_data={
            "availability": [1000000, 500],    # 100 万请求，500 失败
            "latency": [random.uniform(50, 300) for _ in range(100)],
            "error_rate": [1000000, 800],       # 100 万请求，800 错误
        },
        slo_configs={
            "availability": 99.95,
            "latency": 95.0,    # p99 延迟 ≤ 200ms 的达标率
            "error_rate": 99.9,  # 错误率 ≤ 0.1%
        },
        product="cvm",
        monthly_fee=8000.0,
    )
    print(report)
```

### 脚本使用说明

**运行方式：**

```bash
python slo_calculator.py
```

**核心类说明：**

| 类名 | 功能 | 主要方法 |
|------|------|---------|
| `SLICalculator` | SLI 计算 | `availability()`, `latency_percentile()`, `error_rate()` |
| `SLOMonitor` | SLO 监控与错误预算管理 | `record_sli()`, `calculate_compliance()`, `calculate_burn_rate()` |
| `SLACalculator` | SLA 合规与赔偿计算 | `check_sla_compliance()`, `calculate_compensation()`, `availability_to_downtime()` |
| `generate_slo_report()` | 生成完整报告 | 整合所有计算并输出格式化报告 |

**集成到腾讯云监控：**

该脚本可以通过以下方式与腾讯云监控体系集成：

1. **数据源**：通过腾讯云 API（`DescribeMonitorData`）获取监控指标
2. **定时任务**：部署在 CVM 或 SCF（云函数）上，每小时运行一次
3. **告警集成**：当燃烧率超过阈值时，通过腾讯云 CM（云监控）发送告警
4. **可视化**：将计算结果写入 Prometheus 或腾讯云 Grafana

---

## 2.7 腾讯云 SRE 最佳实践总结

### 2.7.1 SLI 最佳实践

1. **从用户视角定义 SLI**：不要只测量"服务器是否活着"，要测量"用户是否能用"
2. **保持 SLI 数量精简**：每个服务 3-5 个核心 SLI 足够，过多会导致注意力分散
3. **统一测量口径**：确保所有团队使用相同的 SLI 定义和计算方法
4. **自动化采集**：SLI 数据应自动采集，避免人工上报

### 2.7.2 SLO 最佳实践

1. **内部 SLO 比外部 SLA 严格**：预留 10%-20% 的缓冲
2. **SLO 是目标，不是承诺**：SLO 可以调整，但要基于数据而非感觉
3. **错误预算要可视化**：在团队仪表板上实时展示错误预算消耗
4. **SLO 要分层**：核心链路、非核心链路、批处理任务使用不同的 SLO

### 2.7.3 SLA 最佳实践

1. **理解 SLA 的局限性**：SLA 赔偿远不足以覆盖业务损失
2. **建立 SLA 索赔流程**：提前准备好故障时间记录和证据
3. **不要被 SLA 绑架**：SLA 是底线，不是目标
4. **关注排除条款**：了解哪些情况不计入 SLA，避免认知偏差

### 2.7.4 腾讯云特有建议

1. **利用腾讯云 SLA 页面**：定期查看 https://cloud.tencent.com/document/product/301 了解最新 SLA 承诺
2. **开启云监控告警**：配置腾讯云 CM 告警策略，第一时间发现 SLO 偏离
3. **使用多可用区部署**：腾讯云支持多可用区（Zone）部署，可显著提升可用性
4. **建立故障演练机制**：定期进行混沌工程实验，验证 SLO 的鲁棒性

---

## 2.8 本章小结

SLI、SLO 和 SLA 构成了云服务可靠性度量的完整体系：

- **SLI** 回答"现在怎么样"——是客观的量化测量
- **SLO** 回答"应该怎么样"——是团队内部的目标契约
- **SLA** 回答"做不到怎么办"——是对外的法律承诺

在腾讯云环境中，SRE 团队需要：

1. 根据业务特点定义合适的 SLI
2. 与业务方协商合理的 SLO
3. 理解腾讯云 SLA 承诺和赔偿机制
4. 利用错误预算平衡可靠性与创新速度
5. 通过自动化工具持续监控和优化

**核心公式回顾：**

```
错误预算 = 1 - SLO
燃烧率 = 实际消耗速率 / 理想消耗速率
SLA 赔偿 = 月度服务费 × 赔偿比例（阶梯计算）
```

下一章将深入探讨腾讯云监控体系，包括云监控（CM）、Prometheus 托管服务、日志服务（CLS）等，帮助读者建立完整的可观测性平台。

---

## 参考资源

1. Google SRE Book - "Service Level Objectives"
2. 腾讯云 SLA 文档：https://cloud.tencent.com/document/product/301
3. 腾讯云云监控产品文档：https://cloud.tencent.com/document/product/248
4. Site Reliability Engineering: How Google Runs Production Systems
5. The Site Reliability Workbook - "SLO Engineering" 章节
