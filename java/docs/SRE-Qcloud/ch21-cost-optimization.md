# 第21章 腾讯云成本优化实践

## 21.1 引言

在云计算普及的今天，企业上云已成为不可逆转的趋势。然而，云计算的弹性与便利性也带来了新的挑战——成本失控。根据 Flexera 2024 年云报告，企业平均浪费 28% 的云支出，而这一比例在缺乏系统治理的团队中甚至高达 45%。腾讯云作为国内领先的云服务商，提供了丰富的计费模式和成本管理工具，但如何有效利用这些能力实现成本优化，是每一位 SRE 工程师必须掌握的技能。

本章将从腾讯云的成本模型出发，系统性地介绍成本分析、闲置资源识别、实例选型优化、存储生命周期管理以及自动化成本治理的完整方法论，并辅以可落地的 Python 脚本，帮助读者构建一套可持续的成本优化体系。

---

## 21.2 腾讯云成本模型深度解析

### 21.2.1 计费模式概览

腾讯云的计算资源（CVM、Lighthouse 等）支持三种核心计费模式，理解其差异是成本优化的基础。

**按量计费（后付费）**：按实际使用时长秒级计费，适合弹性伸缩场景、短期测试环境和不可预测的工作负载。单价最高，但灵活性最强。

**包年包月（预付费）**：以月或年为单位预付费用，享受显著折扣。包年包月相比按量计费通常有 20%~50% 的折扣，包年时长越长折扣越大。适合稳态业务、数据库节点等长期运行实例。

**资源包**：预先购买特定规格的资源包（如 CPU 资源包、存储资源包），使用时按实际消耗抵扣。适合用量波动但总量可预测的场景。

| 计费模式 | 计费粒度 | 折扣力度 | 适用场景 |
|---------|---------|---------|---------|
| 按量计费 | 秒级 | 无折扣 | 弹性伸缩、测试、短任务 |
| 包年包月 | 月/年 | 20%~50% | 稳态业务、数据库 |
| 资源包 | 按量抵扣 | 10%~30% | 波动但总量可预测 |

### 21.2.2 预留实例与竞价实例

**预留实例（Reserved Instances, RI）**：用户承诺 1 年或 3 年的使用时长，腾讯云提供对应折扣。预留实例不绑定具体实例 ID，而是以计费折扣的形式作用于账户下匹配规格的按量实例。这意味着即使实例重启或更换，只要规格匹配，折扣依然生效。

**竞价实例（Spot Instance）**：腾讯云将闲置计算资源以竞价模式出售，价格通常为按量计费的 10%~20%，但实例可能在资源紧张时被回收（回收前约 2 分钟通知）。适合无状态、容错性强的工作负载，如大数据计算、CI/CD 构建节点、视频转码等。

### 21.2.3 隐藏成本陷阱

SRE 团队在成本治理中常忽略以下隐性支出：

- **公网带宽**：按流量计费时，出流量单价远高于入流量。跨可用区流量、NAT 网关流量均单独计费。
- **快照费用**：云硬盘快照按实际占用空间计费，大量历史快照是常见的成本黑洞。
- **CLB 闲置实例**：负载均衡实例即使无流量也收取小时费。
- **弹性公网 IP（EIP）**：未绑定资源的 EIP 收取资源占用费。
- **日志服务 CLS**：日志存储量随业务增长线性膨胀，缺乏轮转策略时成本失控。

---

## 21.3 闲置资源识别与治理

### 21.3.1 识别方法论

闲置资源是云成本浪费的最大来源。识别策略应覆盖以下维度：

1. **CPU 低利用率**：连续 7 天 CPU 平均利用率低于 5%
2. **内存低利用率**：连续 7 天内存平均利用率低于 10%
3. **网络零流量**：连续 14 天无网络流入/流出
4. **长时间运行但无业务接入**：通过 CM（配置管理数据库）或标签系统交叉验证

### 21.3.2 基于云监控的自动化检测

腾讯云 Cloud Monitor（云监控）提供实例级监控指标，可通过 API 批量拉取。以下是一个完整的 Python 检测脚本：

```python
#!/usr/bin/env python3
"""
tencent_cost_analyzer.py
腾讯云成本分析工具 - 闲置资源检测与优化建议
"""

import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class TencentCostAnalyzer:
    """腾讯云成本分析器"""

    def __init__(
        self,
        secret_id: str,
        secret_key: str,
        region: str = "ap-guangzhou",
    ):
        self.secret_id = secret_id
        self.secret_key = secret_key
        self.region = region
        self.base_url = "https://monitor.tencentcloudapi.com"
        self.cvm_url = "https://cvm.tencentcloudapi.com"
        self.billing_url = "https://billing.tencentcloudapi.com"

    def _sign_request(self, params: dict, service: str) -> dict:
        """构造 TC3-HMAC-SHA256 签名请求（简化版，生产环境请使用 SDK）"""
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "X-TC-Action": params["Action"],
            "X-TC-Region": self.region,
            "X-TC-Version": params.get("Version", "2019-07-01"),
            "X-TC-Timestamp": str(int(datetime.now().timestamp())),
        }
        return headers

    def get_all_instances(self) -> list[dict[str, Any]]:
        """获取当前地域所有 CVM 实例"""
        instances = []
        offset = 0
        limit = 100

        while True:
            params = {
                "Action": "DescribeInstances",
                "Version": "2017-03-12",
                "Offset": offset,
                "Limit": limit,
            }
            headers = self._sign_request(params, "cvm")
            try:
                resp = requests.post(
                    self.cvm_url, headers=headers, json=params, timeout=30
                )
                data = resp.json()
                instance_set = (
                    data.get("Response", {}).get("InstanceSet", [])
                )
                instances.extend(instance_set)
                total = data.get("Response", {}).get("TotalCount", 0)
                if offset + limit >= total:
                    break
                offset += limit
            except Exception as e:
                logger.error("获取实例列表失败: %s", e)
                break

        return instances

    def get_instance_metrics(
        self, instance_id: str, metric: str, days: int = 7
    ) -> list[float]:
        """获取实例指定指标的时序数据"""
        end_time = datetime.now()
        start_time = end_time - timedelta(days=days)
        params = {
            "Action": "GetMonitorData",
            "Version": "2018-07-24",
            "Namespace": "QCE/CVM",
            "MetricName": metric,
            "Period": 3600,
            "StartTime": start_time.strftime("%Y-%m-%d %H:%M:%S"),
            "EndTime": end_time.strftime("%Y-%m-%d %H:%M:%S"),
            "Instances": [{"Dimensions": [{"Name": "InstanceId", "Value": instance_id}]}],
        }
        headers = self._sign_request(params, "monitor")
        try:
            resp = requests.post(
                self.base_url, headers=headers, json=params, timeout=30
            )
            data = resp.json()
            points = (
                data.get("Response", {}).get("DataPoints", [])
            )
            values = []
            for dp in points:
                values.extend(dp.get("Values", []))
            return values
        except Exception as e:
            logger.error("获取指标 %s 失败 (实例 %s): %s", metric, instance_id, e)
            return []

    def analyze_idle_resources(self, cpu_threshold: float = 5.0, mem_threshold: float = 10.0) -> list[dict[str, Any]]:
        """分析闲置资源，返回优化建议列表"""
        instances = self.get_all_instances()
        idle_resources = []

        for inst in instances:
            inst_id = inst.get("InstanceId", "")
            inst_name = inst.get("InstanceName", "")
            state = inst.get("InstanceState", "")
            charge_type = inst.get("ChargeType", "")

            if state != "RUNNING":
                continue

            cpu_metrics = self.get_instance_metrics(inst_id, "CPUUsage", days=7)
            mem_metrics = self.get_instance_metrics(inst_id, "MemUsage", days=7)

            if not cpu_metrics or not mem_metrics:
                continue

            avg_cpu = sum(cpu_metrics) / len(cpu_metrics) if cpu_metrics else 0
            avg_mem = sum(mem_metrics) / len(mem_metrics) if mem_metrics else 0

            issues = []
            if avg_cpu < cpu_threshold:
                issues.append(f"CPU 平均利用率 {avg_cpu:.1f}% (低于阈值 {cpu_threshold}%)")
            if avg_mem < mem_threshold:
                issues.append(f"内存平均利用率 {avg_mem:.1f}% (低于阈值 {mem_threshold}%)")

            if issues:
                idle_resources.append({
                    "instance_id": inst_id,
                    "instance_name": inst_name,
                    "charge_type": charge_type,
                    "avg_cpu": round(avg_cpu, 2),
                    "avg_mem": round(avg_mem, 2),
                    "issues": issues,
                    "suggestion": self._generate_suggestion(charge_type, avg_cpu, avg_mem),
                })

        return idle_resources

    def _generate_suggestion(self, charge_type: str, avg_cpu: float, avg_mem: float) -> str:
        """根据计费类型和利用率生成优化建议"""
        if charge_type == "PREPAID":
            if avg_cpu < 1 and avg_mem < 2:
                return "【高优】包年包月实例严重低负载，建议到期后不续费，迁移至竞价实例或按量"
            return "【建议】包年包月实例利用率低，到期后降配或切换为按量计费"
        else:
            if avg_cpu < 1 and avg_mem < 2:
                return "【高优】按量实例几乎无负载，建议立即关机或销毁"
            return "【建议】按量实例利用率低，考虑降配或使用竞价实例"

    def get_billing_summary(self) -> dict[str, Any]:
        """获取本月账单概览"""
        params = {
            "Action": "DescribeBillSummary",
            "Version": "2018-07-01",
            "BeginTime": datetime.now().replace(day=1).strftime("%Y-%m-%d"),
            "EndTime": datetime.now().strftime("%Y-%m-%d"),
        }
        headers = self._sign_request(params, "billing")
        try:
            resp = requests.post(
                self.billing_url, headers=headers, json=params, timeout=30
            )
            return resp.json()
        except Exception as e:
            logger.error("获取账单摘要失败: %s", e)
            return {}

    def generate_report(self) -> str:
        """生成完整的成本分析报告"""
        report_parts = [
            "# 腾讯云成本分析报告",
            f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"地域: {self.region}",
            "",
            "## 一、闲置资源分析",
        ]

        idle = self.analyze_idle_resources()
        if not idle:
            report_parts.append("未检测到明显的闲置资源。")
        else:
            report_parts.append(f"发现 {len(idle)} 个潜在闲置资源：\n")
            for res in idle:
                report_parts.append(
                    f"- **{res['instance_name']}** (`{res['instance_id']}`)\n"
                    f"  - 计费模式: {res['charge_type']}\n"
                    f"  - CPU 平均利用率: {res['avg_cpu']}%\n"
                    f"  - 内存平均利用率: {res['avg_mem']}%\n"
                    f"  - 问题: {'; '.join(res['issues'])}\n"
                    f"  - 建议: {res['suggestion']}\n"
                )

        report_parts.extend([
            "",
            "## 二、优化建议汇总",
            "",
            "### 2.1 实例选型优化",
            "- 检查是否使用了过大的实例规格（如 8C16G 但实际只需要 2C4G）",
            "- 使用腾讯云 CVM 规格推荐（基于历史监控数据）",
            "- 批量作业优先使用竞价实例",
            "",
            "### 2.2 计费模式优化",
            "- 稳态业务（7×24 运行）优先包年包月",
            "- 弹性部分使用按量 + 预留实例组合",
            "- 短期批量任务使用竞价实例",
            "",
            "### 2.3 存储成本优化",
            "- 云硬盘 >30 天未使用建议创建快照后销毁",
            "- 历史快照定期清理（保留最近 7 天 + 每月 1 个）",
            "- 冷数据迁移至 COS 低频/归档存储",
            "",
            "### 2.4 网络成本优化",
            "- 同一地域内尽量使用内网通信",
            "- 使用 CDN 降低公网出流量成本",
            "- 评估是否需要独立 EIP（未绑定的 EIP 产生费用）",
            "",
            "---",
            "*报告由 TencentCostAnalyzer 自动生成*",
        ])

        return "\n".join(report_parts)


def main():
    """主函数：读取环境变量，执行成本分析"""
    secret_id = os.environ.get("TENCENT_SECRET_ID")
    secret_key = os.environ.get("TENCENT_SECRET_KEY")
    region = os.environ.get("TENCENT_REGION", "ap-guangzhou")

    if not secret_id or not secret_key:
        logger.error("请设置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY")
        return

    analyzer = TencentCostAnalyzer(secret_id, secret_key, region)
    report = analyzer.generate_report()
    print(report)

    output_file = "cost_report.md"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(report)
    logger.info("报告已保存至 %s", output_file)


if __name__ == "__main__":
    main()
```

### 21.3.3 脚本使用说明

```bash
# 设置腾讯云 API 密钥
export TENCENT_SECRET_ID="your_secret_id"
export TENCENT_SECRET_KEY="your_secret_key"
export TENCENT_REGION="ap-guangzhou"

# 安装依赖
pip install requests

# 执行分析
python tencent_cost_analyzer.py
```

脚本输出 Markdown 格式报告，包含闲置实例列表、利用率数据和针对性优化建议。建议将其接入定时任务（如每周一执行），持续跟踪成本水位。

---

## 21.4 竞价实例与预留实例策略

### 21.4.1 竞价实例最佳实践

竞价实例的核心优势在于价格低廉，但面临被回收的风险。以下策略可最大化利用竞价实例：

**适用工作负载**：
- 大数据处理（EMR、Spark、Hadoop）
- CI/CD 构建节点
- 视频转码与媒体处理
- 无状态 Web 服务（配合弹性伸缩组）
- 测试与预发布环境

**容错架构设计**：
```python
# 竞价实例管理示例
import random
import time


class SpotInstanceManager:
    """竞价实例管理器"""

    def __init__(self, asg_id: str, desired_capacity: int):
        self.asg_id = asg_id
        self.desired_capacity = desired_capacity
        self.spot_ratio = 0.7  # 竞价实例占比

    def calculate_mix(self, total: int) -> dict:
        """计算按量与竞价实例的混合比例"""
        spot_count = int(total * self.spot_ratio)
        on_demand_count = total - spot_count
        return {
            "spot": spot_count,
            "on_demand": on_demand_count,
            "spot_ratio": self.spot_ratio,
        }

    def estimate_savings(self, on_demand_price: float, spot_price: float, hours: int) -> float:
        """估算使用竞价实例的节省金额"""
        per_instance_saving = (on_demand_price - spot_price) * hours
        total_saving = per_instance_saving * self.desired_capacity * self.spot_ratio
        return round(total_saving, 2)


# 使用示例
manager = SpotInstanceManager(asg_id="asg-xxxxx", desired_capacity=10)
mix = manager.calculate_mix(10)
print(f"推荐配置: {mix['spot']} 台竞价 + {mix['on_demand']} 台按量")
# 输出: 推荐配置: 7 台竞价 + 3 台按量
```

**关键建议**：
- 在弹性伸缩组中设置竞价实例占比不超过 70%，保留 30% 按量实例兜底
- 为竞价实例设置"停止"而非"释放"策略，回收后自动启动新实例
- 使用多可用区部署，降低单可用区资源不足的风险

### 21.4.2 预留实例购买策略

预留实例的购买决策应基于历史用量数据，而非主观判断。推荐以下分析流程：

1. **收集过去 30~90 天的按量实例用量**（按规格聚合）
2. **识别稳态基数**：连续 7×24 运行的实例数量
3. **计算 RI 覆盖率**：RI 数量 / 稳态基数，建议覆盖 80%~90%
4. **选择 RI 类型**：标准型（最大折扣）vs 可转换型（灵活性）

```python
def ri_purchase_advisor(historical_usage: list[dict]) -> dict:
    """
    预留实例购买建议
    historical_usage: [{"spec": "S5.2XLARGE16", "hours": 720, "cost": 500}, ...]
    """
    from collections import defaultdict

    spec_agg = defaultdict(lambda: {"total_hours": 0, "total_cost": 0, "days": 0})

    for record in historical_usage:
        spec = record["spec"]
        spec_agg[spec]["total_hours"] += record["hours"]
        spec_agg[spec]["total_cost"] += record["cost"]
        spec_agg[spec]["days"] += 1

    recommendations = []
    for spec, data in spec_agg.items():
        avg_daily_hours = data["total_hours"] / max(data["days"], 1)
        steady_count = round(avg_daily_hours / 24)

        if steady_count >= 1:
            monthly_cost = data["total_cost"] / max(data["days"], 1) * 30
            ri_discount = 0.25  # 假设 1 年 RI 折扣 25%
            ri_saving = monthly_cost * ri_discount * 12

            recommendations.append({
                "spec": spec,
                "steady_count": steady_count,
                "current_monthly": round(monthly_cost, 2),
                "ri_monthly": round(monthly_cost * (1 - ri_discount), 2),
                "annual_saving": round(ri_saving, 2),
                "priority": "高" if ri_saving > 1000 else "中" if ri_saving > 200 else "低",
            })

    return {
        "total_annual_saving": round(sum(r["annual_saving"] for r in recommendations), 2),
        "recommendations": sorted(
            recommendations, key=lambda x: x["annual_saving"], reverse=True
        ),
    }
```

---

## 21.5 存储生命周期管理

### 21.5.1 云硬盘（CBS）成本优化

云硬盘是容易被忽视的成本项。优化策略包括：

**快照管理**：
- 建立快照轮转策略：保留最近 7 天每日快照 + 最近 4 周每周快照 + 最近 12 月每月快照
- 使用定期快照策略（CBS 支持自动快照策略）
- 删除不再需要的自定义镜像关联的快照

**磁盘降配**：
- 监控磁盘使用率，对使用率长期低于 30% 的磁盘降配
- 系统盘建议 50GB（Linux）或 100GB（Windows），数据盘按需分配
- 使用高性能 SSD 仅用于数据库等 IOPS 敏感场景，日志类使用普通云硬盘

### 21.5.2 对象存储（COS）分层

腾讯云 COS 提供多种存储类型，成本差异显著：

| 存储类型 | 单价（元/GB/月） | 适用场景 |
|---------|----------------|---------|
| 标准存储 | ~0.099 | 热数据、频繁访问 |
| 低频存储 | ~0.05 | 30 天以上不常访问 |
| 归档存储 | ~0.015 | 90 天以上冷数据 |
| 深度归档 | ~0.004 | 180 天以上归档数据 |

**生命周期策略配置**（通过 COS API 或控制台）：

```json
{
  "Rules": [
    {
      "ID": "log-lifecycle",
      "Filter": {"Prefix": "logs/"},
      "Status": "Enabled",
      "Transitions": [
        {"Days": 30, "StorageClass": "STANDARD_IA"},
        {"Days": 90, "StorageClass": "ARCHIVE"}
      ],
      "Expiration": {"Days": 365}
    },
    {
      "ID": "backup-lifecycle",
      "Filter": {"Prefix": "backup/"},
      "Status": "Enabled",
      "Transitions": [
        {"Days": 7, "StorageClass": "STANDARD_IA"},
        {"Days": 30, "StorageClass": "DEEP_ARCHIVE"}
      ],
      "Expiration": {"Days": 730}
    }
  ]
}
```

### 21.5.3 日志存储成本治理

日志是云成本中增长最快的部分之一。推荐以下治理方案：

```python
def estimate_log_cost(daily_volume_gb: float, retention_days: int) -> dict:
    """
    估算 CLS 日志存储成本
    daily_volume_gb: 日均日志写入量 (GB)
    retention_days: 保留天数
    """
    # CLS 计费参考（以广州地域为例）
    write_price = 0.13       # 元/GB 写入
    storage_price = 0.0024   # 元/GB/日 存储
    read_price = 0.016       # 元/GB 读取（按 10% 读取率估算）

    daily_write_cost = daily_volume_gb * write_price
    daily_read_cost = daily_volume_gb * 0.1 * read_price

    # 存储成本 = 每日累计存储量 * 单价
    total_storage = daily_volume_gb * retention_days
    daily_storage_cost = total_storage * storage_price

    monthly_cost = (daily_write_cost + daily_read_cost + daily_storage_cost) * 30

    # 优化建议：缩短保留期 + 冷热分离
    optimized_retention = min(retention_days, 30)
    optimized_storage = daily_volume_gb * optimized_retention
    optimized_monthly = (
        daily_write_cost + daily_read_cost + optimized_storage * storage_price
    ) * 30

    return {
        "daily_volume_gb": daily_volume_gb,
        "current_retention_days": retention_days,
        "current_monthly_cost": round(monthly_cost, 2),
        "optimized_retention_days": optimized_retention,
        "optimized_monthly_cost": round(optimized_monthly, 2),
        "monthly_saving": round(monthly_cost - optimized_monthly, 2),
        "suggestion": (
            f"建议将日志保留期从 {retention_days} 天缩短至 {optimized_retention} 天，"
            f"历史日志转存至 COS 归档存储，预计每月节省 {monthly_cost - optimized_monthly:.0f} 元"
        ),
    }


# 使用示例
result = estimate_log_cost(daily_volume_gb=50, retention_days=90)
print(f"当前月成本: {result['current_monthly_cost']} 元")
print(f"优化后月成本: {result['optimized_monthly_cost']} 元")
print(f"建议: {result['suggestion']}")
```

---

## 21.6 自动化成本治理体系

### 21.6.1 成本监控告警

建立多层级成本告警体系：

1. **预算告警**：在腾讯云预算中心设置月度预算，达到 80%、90%、100% 时触发通知
2. **异常增长告警**：日环比增长超过 20% 时告警
3. **资源创建告警**：创建高规格实例（如 32C64G 以上）时通知审批
4. **闲置资源告警**：结合 21.3 节的脚本，每周推送闲置资源清单

### 21.6.2 标签治理与成本分摊

标签是成本归因的基础设施。推荐标签体系：

| 标签键 | 标签值示例 | 用途 |
|-------|-----------|------|
| `env` | `prod`, `staging`, `test`, `dev` | 环境归属 |
| `team` | `platform`, `data`, `backend` | 团队归属 |
| `project` | `order-service`, `user-center` | 项目归属 |
| `cost_center` | `CC-1001`, `CC-1002` | 财务核算 |
| `auto_off` | `true`, `false` | 是否允许非工作时间关机 |

**标签强制策略**：使用腾讯云标签策略（Tag Policy），禁止创建未携带必要标签的资源。

### 21.6.3 非工作时间自动关机

对于开发、测试、预发布环境，非工作时间关机可节省 60%~70% 的计算成本。

```python
import datetime


def calculate_auto_off_savings(
    instance_count: int,
    hourly_cost: float,
    off_hours_start: int = 20,
    off_hours_end: int = 8,
    weekend_off: bool = True,
) -> dict:
    """
    计算非自动关机的节省金额
    instance_count: 实例数量
    hourly_cost: 每实例每小时成本（元）
    off_hours_start: 关机开始时间（24小时制）
    off_hours_end: 开机时间（24小时制）
    weekend_off: 周末是否关机
    """
    hours_per_day = off_hours_start - off_hours_end
    if hours_per_day <= 0:
        hours_per_day += 24

    daily_saving = instance_count * hourly_cost * hours_per_day
    monthly_weekdays = 22
    monthly_weekends = 8

    if weekend_off:
        monthly_saving = daily_saving * (monthly_weekdays + monthly_weekends)
    else:
        monthly_saving = daily_saving * monthly_weekdays

    annual_saving = monthly_saving * 12

    return {
        "instance_count": instance_count,
        "hourly_cost": hourly_cost,
        "daily_saving": round(daily_saving, 2),
        "monthly_saving": round(monthly_saving, 2),
        "annual_saving": round(annual_saving, 2),
        "note": f"每晚 {off_hours_start}:00 至关机，次日 {off_hours_end}:00 开机"
        + ("，周末全天关机" if weekend_off else ""),
    }


# 使用示例
savings = calculate_auto_off_savings(
    instance_count=20, hourly_cost=2.5, off_hours_start=20, off_hours_end=8
)
print(f"自动关机预计年节省: {savings['annual_saving']} 元")
```

### 21.6.4 成本优化仪表盘

建议在腾讯云 Dashboard 或自建 Grafana 中搭建成本看板，核心指标包括：

- **月度总成本趋势**（同比/环比）
- **按服务维度成本分布**（CVM、COS、CLB、NAT 等）
- **按标签维度成本分布**（团队/项目/环境）
- **闲置资源数量与预估浪费金额**
- **RI 覆盖率与节省金额**
- **竞价实例使用比例**

---

## 21.7 实战案例：某互联网公司成本优化

### 21.7.1 背景

某电商平台在腾讯云运行 200+ 台 CVM 实例，月均云支出约 45 万元。SRE 团队发现成本增长趋势异常，启动专项优化。

### 21.7.2 优化措施与效果

| 优化项 | 措施 | 月节省（元） |
|-------|------|------------|
| 闲置实例清理 | 关闭 15 台 CPU<3% 的按量实例 | 18,000 |
| 包年包月转换 | 40 台稳态实例从按量转为包年包月 | 12,000 |
| 竞价实例引入 | CI/CD 节点从按量切换为竞价实例 | 5,000 |
| 快照清理 | 删除 180 天前的历史快照 | 3,500 |
| COS 生命周期 | 日志存储 30 天后转为归档 | 2,800 |
| 非工作时间关机 | 20 台测试实例晚 8 点关机 | 8,000 |
| **合计** | | **49,300** |

### 21.7.3 经验总结

1. **成本优化是持续过程**，而非一次性活动。建议建立月度成本回顾机制。
2. **自动化是规模化的前提**。手动治理在 50 台以内可行，超过 100 台必须依赖脚本和工具。
3. **文化比工具更重要**。推动"成本意识"成为研发团队的工程文化，在代码审查中加入成本评估环节。
4. **先治理后优化**。在优化计费模式之前，先消除浪费——闲置资源是最大的成本黑洞。

---

## 21.8 总结

本章从腾讯云的成本模型出发，系统性地介绍了闲置资源识别、竞价与预留实例策略、存储生命周期管理以及自动化成本治理的完整方法论。核心要点总结如下：

1. **理解计费模式**：按量计费、包年包月、资源包各有适用场景，混合使用可最大化性价比。
2. **消除闲置浪费**：通过云监控 API 自动化检测低利用率实例，这是成本优化的第一步，也是ROI最高的一步。
3. **合理使用竞价实例**：无状态工作负载优先使用竞价实例，配合弹性伸缩组保留 30% 按量实例兜底。
4. **存储分层管理**：利用 COS 生命周期策略自动迁移冷数据，建立快照轮转机制。
5. **自动化治理**：通过标签体系、预算告警、自动关机等机制，将成本优化融入日常运维流程。

成本优化不是一次性的降本运动，而是 SRE 团队需要持续运营的核心能力。当成本意识融入组织文化，每一行代码、每一次部署都带有成本考量时，云计算的弹性才能真正成为业务优势而非财务负担。

---

## 参考资源

- 腾讯云计费模式文档: https://cloud.tencent.com/document/product/555
- 腾讯云云监控 API: https://cloud.tencent.com/document/product/248
- 腾讯云 COS 生命周期: https://cloud.tencent.com/document/product/436/14605
- 腾讯云预算中心: https://console.cloud.tencent.com/expense/budget
- 腾讯云标签管理: https://cloud.tencent.com/document/product/651
