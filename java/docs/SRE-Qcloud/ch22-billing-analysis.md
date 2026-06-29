# 第22章 腾讯云账单分析与成本优化

## 22.1 引言

在云原生时代，基础设施按需付费的模式虽然带来了弹性与灵活性，但也让成本管理变得前所未有的复杂。传统 IDC 模式下，服务器、网络带宽、机柜租赁等费用相对固定，月度预算偏差可控。而云上环境涉及数十种产品、数百个计费维度、跨区域部署、多账户体系，账单结构呈指数级增长。如果没有系统化的成本分析手段，企业很容易面临"成本失控"——资源闲置未被发现、预留实例覆盖率不足、跨区域流量费用超出预期、标签体系缺失导致成本无法分摊到业务线。

本章聚焦腾讯云的成本管理工具链与实践方法，涵盖成本 explorer、标签分账、账单导出与定制化分析、预算管理与告警体系，并提供一个完整的 Python 账单分析脚本，帮助 SRE 团队建立可复用的成本治理框架。

## 22.2 腾讯云成本分析工具全景

腾讯云提供了一套从"看清"到"管好"再到"优化"的阶梯式成本管理工具：

| 层级 | 工具/产品 | 核心能力 |
|------|-----------|----------|
| L1 看清 | 收支明细、账单概览 | 月度消费总览、产品维度消费排行 |
| L2 分析 | 成本 explorer、账单下载 | 多维筛选、按标签/项目/资源组聚合 |
| L3 分账 | 标签管理、分账报告 | 基于标签的成本分摊到部门/业务线 |
| L4 规划 | 预算管理、费用预测 | 月度/季度预算编制、消费趋势预测 |
| L5 告警 | 异常检测、预算告警 | 消费突增通知、预算阈值触发 |
| L6 优化 | 价格计算器、资源优化建议 | 预留实例/节省计划推荐、闲置资源提醒 |

SRE 团队应至少覆盖 L1-L4 层级，才能在日常运维中有效管控成本。

## 22.3 成本 explorer 深度使用

### 22.3.1 功能概述

成本 explorer（Cost Explorer）是腾讯云控制台内的交互式分析面板，入口位于"费用中心 > 成本管理 > 成本 explorer"。它支持：

- **时间维度**：按日、按月、按累计区间查看
- **粒度下钻**：从总消费 → 产品 → 地域 → 计费项 → 资源 ID
- **高级筛选**：标签、项目、交易类型、组件类型等 20+ 维度组合
- **聚合方式**：累计总和、日均值、环比/同比
- **可视化**：折线图、柱状图、饼图、表格视图

### 22.3.2 典型分析场景

**场景一：月度消费异常排查**

当某月账单突增 50% 时，在成本 explorer 中按以下路径排查：

1. 选择时间范围为"本月"与"上月"，开启"环比"
2. 按"产品"维度分组，定位增长最大的产品（如 CVM 或 CDB）
3. 下钻到该产品的"地域"维度，确认是否因跨区域复制导致流量费用激增
4. 进一步下钻到"资源 ID"，找到具体实例
5. 检查该实例的监控数据，确认是否因业务流量上涨导致，还是存在配置变更（如升配）

**场景二：按标签聚合业务成本**

假设企业使用 `Department` 标签标记资源归属：

1. 在成本 explorer 中选择"标签"维度
2. 选择标签键 `Department`
3. 即可看到每个部门的月度消费分布
4. 导出为 CSV 用于内部财务对账

### 22.3.3 成本 explorer API

对于需要自动化获取成本数据的场景，腾讯云提供 `DescribeCostExplorerSummary` 等 API 接口，支持通过 SDK 拉取分析结果：

```python
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.billing.v20180709 import billing_client, models

cred = credential.Credential("SecretId", "SecretKey")
client = billing_client.BillingClient(cred, "ap-guangzhou")

req = models.DescribeCostExplorerSummaryRequest()
req.BeginTime = "2025-01-01"
req.EndTime = "2025-01-31"
req.MonthlyPeriod = 1  # 环比上月
req.GroupBy = [{"Type": "product", "Key": "product"}]
req.CostType = "monthly_cost"

resp = client.DescribeCostExplorerSummary(req)
print(resp.to_json_string())
```

## 22.4 基于标签的成本分摊体系

### 22.4.1 为什么需要标签分账

没有标签的云账单是一笔"糊涂账"。当多个业务线共享同一套云资源时，必须通过标签将成本归属到具体的成本中心。标签分账的核心价值：

- **责任明确**：每个业务线为其使用的资源付费
- **预算精准**：基于历史标签数据编制各业务线预算
- **优化驱动**：识别高成本业务线，针对性优化
- **财务透明**：内部结算有据可依

### 22.4.2 标签设计原则

腾讯云标签由键（Key）和值（Value）组成，每个资源最多绑定 50 个标签。推荐的分账标签体系：

| 标签键 | 示例值 | 用途 |
|--------|--------|------|
| `BusinessUnit` | `电商`, `金融`, `AI` | 一级业务单元 |
| `Department` | `研发部`, `运维部`, `测试部` | 部门归属 |
| `Project` | `双11大促`, `数据平台` | 项目级成本归集 |
| `Environment` | `prod`, `staging`, `dev`, `test` | 环境区分 |
| `Owner` | `zhangsan` | 资源负责人 |
| `CostCenter` | `CC-1001` | 财务成本中心编码 |

**设计原则：**

1. **一致性**：所有资源必须强制打标，通过 CAM 策略或标签策略（Tag Policy）强制执行
2. **层次性**：从粗到细，先有业务单元再有项目
3. **自动化**：通过 Terraform、标签继承规则或资源创建时的钩子自动打标
4. **可审计**：定期扫描未打标资源，生成合规报告

### 22.4.3 标签策略强制合规

腾讯云标签策略（Tag Policy）允许管理员定义：

- 哪些标签键是必选的
- 哪些标签值是允许的
- 未合规资源是否禁止创建

```json
{
  "tags": {
    "BusinessUnit": {
      "allowed_values": ["电商", "金融", "AI", "教育"]
    },
    "Environment": {
      "allowed_values": ["prod", "staging", "dev"]
    },
    "CostCenter": {
      "required": true
    }
  }
}
```

### 22.4.4 分账报告生成

在"费用中心 > 成本管理 > 分账报告"中，可以基于标签生成正式的分账报告：

1. 选择分账标签键（如 `BusinessUnit`）
2. 设置报告周期（月度/季度）
3. 选择是否包含未打标资源（建议单独归类）
4. 生成报告并导出为 Excel 或 CSV

对于未打标资源，建议设置"未打标资源池"统一归集，推动各业务线限期补标。

## 22.5 账单导出与定制化分析

### 22.5.1 账单导出方式

腾讯云提供多种账单导出方式：

| 方式 | 数据量 | 自动化程度 | 适用场景 |
|------|--------|------------|----------|
| 控制台下载 | 小（<10万条） | 手动 | 临时对账 |
| 定期推送 COS | 大 | 全自动 | 企业级分析平台 |
| API 拉取 | 中 | 可编排 | 自建工具 |
| 消息通知 | 小 | 事件驱动 | 实时监控 |

### 22.5.2 账单推送至 COS

推荐的生产级方案是将账单自动推送至对象存储 COS，再通过数据湖分析或自建 ETL 处理：

**配置步骤：**

1. 进入"费用中心 > 账单管理 > 账单导出设置"
2. 开启"定期导出到 COS"
3. 选择存储桶（建议与业务数据隔离，如 `billing-archive-125xxxxxx`）
4. 设置导出周期（每日/每月）
5. 选择导出格式（CSV/JSON/Parquet）
6. 配置生命周期策略：原始账单保留 3 年，原始文件 90 天后转为归档存储

**COS 目录结构示例：**

```
billing-archive-125xxxxxx/
├── daily/
│   ├── 2025/01/01/账单明细_20250101.csv
│   ├── 2025/01/02/账单明细_20250102.csv
│   └── ...
├── monthly/
│   ├── 2025/01/账单明细_202501.csv
│   ├── 2025/02/账单明细_202502.csv
│   └── ...
└── monthly_l1/
    ├── 2025/01/账单汇总_202501.csv
    └── ...
```

### 22.5.3 账单字段说明

理解账单字段是分析的基础。腾讯云账单明细（L2 级别）核心字段：

| 字段 | 说明 | 分析用途 |
|------|------|----------|
| `billDate` | 账单日期 | 时间序列分析 |
| `payerAccountId` | 付款账户 ID | 多账户合并分析 |
| `ownerAccountId` | 资源归属账户 ID | 内部账户核算 |
| `productCode` | 产品编码 | 产品维度消费排行 |
| `productName` | 产品名称 | 可读性展示 |
| `itemCode` | 组件编码 | 细粒度计费项分析 |
| `itemName` | 组件名称 | 如"内存""磁盘""流量" |
| `resourceId` | 资源 ID | 单资源成本追踪 |
| `resourceName` | 资源名称 | 可读标识 |
| `region` | 地域 | 区域成本分布 |
| `tags` | 标签 JSON | 标签分账 |
| `feeType` | 费用类型 | 原始/折扣/优惠 |
| `originalCost` | 原价 | 折扣前金额 |
| `discount` | 折扣率 | 合同折扣分析 |
| `realCost` | 实付金额 | 实际支出 |
| `voucherPayAmount` | 代金券抵扣 | 优惠使用分析 |
| `cashPayAmount` | 现金支付 | 实际现金流出 |
| `transactionId` | 交易 ID | 对账唯一标识 |

## 22.6 预算管理与告警

### 22.6.1 预算编制

腾讯云预算管理支持三种预算类型：

1. **月度预算**：按月编制，适合稳定的生产环境
2. **季度预算**：按季度编制，适合有季节性波动的业务
3. **年度预算**：按年编制，适合战略规划

**预算编制流程：**

1. 收集过去 6-12 个月的消费数据
2. 识别基线消费（剔除大促、迁移等异常月份）
3. 根据业务增长预期乘以增长率系数
4. 按产品/标签/项目分解预算
5. 设置预算告警阈值（80%、90%、100%、120%）

### 22.6.2 预算告警配置

在"费用中心 > 成本管理 > 预算管理"中配置告警：

```python
# 通过 API 创建预算告警
from tencentcloud.billing.v20180709 import models

req = models.CreateBudgetRequest()
req.BudgetName = "2025-Q1-电商线"
req.BudgetType = "MONTHLY"
req.BudgetAmount = 500000.00  # 50万月度预算
req.AlertRules = [
    {
        "Threshold": 80,
        "ThresholdType": "PERCENT",
        "NotificationUserIds": ["1001234"],
        "NotificationGroupIds": ["grp-xxxxx"]
    },
    {
        "Threshold": 90,
        "ThresholdType": "PERCENT",
        "NotificationUserIds": ["1001234"],
        "NotificationGroupIds": ["grp-xxxxx"]
    },
    {
        "Threshold": 100,
        "ThresholdType": "PERCENT",
        "NotificationUserIds": ["1001234"],
        "NotificationGroupIds": ["grp-xxxxx"]
    }
]
```

**告警通知渠道：**

- 站内信
- 短信
- 邮件
- 企业微信/钉钉/飞书 Webhook（通过云监控对接）
- 自定义回调 URL

### 22.6.3 异常检测

腾讯云异常检测基于机器学习模型，自动识别消费模式突变：

- **检测维度**：总消费、产品消费、地域消费
- **检测频率**：每日
- **告警方式**：邮件 + 站内信
- **灵敏度配置**：高/中/低三档

建议将灵敏度设为"中"，避免过多误报。对于检测到的异常，应自动触发工单系统，由 SRE 值班人员确认原因。

## 22.7 Python 账单分析脚本

以下是一个完整的 Python 账单分析脚本，支持从 COS 拉取账单数据、多维度聚合分析、成本趋势可视化、标签合规检查，并输出 HTML 报告。

### 22.7.1 脚本结构

```
billing_analyzer/
├── config.yaml              # 配置文件
├── requirements.txt         # 依赖
├── billing_analyzer.py      # 主脚本
├── utils/
│   ├── cos_downloader.py    # COS 下载模块
│   ├── data_processor.py    # 数据处理模块
│   └── report_generator.py  # 报告生成模块
└── output/                  # 输出目录
    ├── reports/             # HTML 报告
    └── charts/              # 图表
```

### 22.7.2 配置文件

```yaml
# config.yaml
tencent:
  secret_id: "${TENCENT_SECRET_ID}"
  secret_key: "${TENCENT_SECRET_KEY}"
  region: ap-guangzhou

cos:
  bucket: billing-archive-125xxxxxx
  region: ap-guangzhou
  prefix: monthly/

analysis:
  months: 6                    # 分析最近 N 个月
  top_n: 10                    # Top N 排行
  cost_threshold: 1000         # 单资源月消费阈值（元）
  tag_keys:                    # 分账标签键列表
    - BusinessUnit
    - Department
    - Environment
    - CostCenter

alerts:
  budget_thresholds: [80, 90, 100]
  anomaly_sensitivity: medium

report:
  title: "腾讯云月度账单分析报告"
  company: "示例科技有限公司"
  output_dir: "./output/reports"
```

### 22.7.3 主脚本

```python
#!/usr/bin/env python3
"""
腾讯云账单分析工具
功能：账单拉取、多维度聚合、成本趋势分析、标签合规检查、HTML 报告生成
"""

import os
import json
import csv
import logging
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import yaml
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "WenQuanYi Micro Hei"]
plt.rcParams["axes.unicode_minus"] = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


class BillingAnalyzer:
    """腾讯云账单分析器"""

    def __init__(self, config_path: str = "config.yaml"):
        with open(config_path, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f)

        self.months = self.config["analysis"]["months"]
        self.top_n = self.config["analysis"]["top_n"]
        self.cost_threshold = self.config["analysis"]["cost_threshold"]
        self.tag_keys = self.config["analysis"]["tag_keys"]
        self.output_dir = self.config["report"]["output_dir"]

        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs("./output/charts", exist_ok=True)

        self.df: Optional[pd.DataFrame] = None

    # ------------------------------------------------------------------
    # 数据加载
    # ------------------------------------------------------------------

    def load_from_local(self, data_dir: str) -> pd.DataFrame:
        """从本地目录加载 CSV 账单文件"""
        all_files = []
        for root, _, files in os.walk(data_dir):
            for f in files:
                if f.endswith(".csv"):
                    all_files.append(os.path.join(root, f))

        if not all_files:
            raise FileNotFoundError(f"在 {data_dir} 下未找到 CSV 账单文件")

        frames = []
        for fpath in sorted(all_files):
            logger.info("加载账单文件: %s", fpath)
            df = pd.read_csv(fpath, dtype={"resourceId": str, "tags": str})
            frames.append(df)

        self.df = pd.concat(frames, ignore_index=True)
        self._preprocess()
        return self.df

    def load_from_cos(self) -> pd.DataFrame:
        """从 COS 拉取账单（需配置 COS 权限）"""
        try:
            from qcloud_cos import CosConfig, CosS3Client
        except ImportError:
            raise ImportError("请安装 cos-python-sdk-v5: pip install cos-python-sdk-v5")

        cos_conf = self.config["cos"]
        secret_id = os.getenv("TENCENT_SECRET_ID", self.config["tencent"]["secret_id"])
        secret_key = os.getenv("TENCENT_SECRET_KEY", self.config["tencent"]["secret_key"])

        config = CosConfig(
            Region=cos_conf["region"],
            SecretId=secret_id,
            SecretKey=secret_key,
        )
        client = CosS3Client(config)

        # 列出最近 N 个月的账单文件
        prefix = cos_conf["prefix"]
        response = client.list_objects(
            Bucket=cos_conf["bucket"],
            Prefix=prefix,
        )

        frames = []
        for content in response.get("Contents", []):
            key = content["Key"]
            if not key.endswith(".csv"):
                continue

            local_path = f"./output/tmp/{os.path.basename(key)}"
            os.makedirs(os.path.dirname(local_path), exist_ok=True)

            logger.info("下载 COS 文件: %s", key)
            client.download_file(
                Bucket=cos_conf["bucket"],
                Key=key,
                DestFilePath=local_path,
            )

            df = pd.read_csv(local_path, dtype={"resourceId": str, "tags": str})
            frames.append(df)

        self.df = pd.concat(frames, ignore_index=True)
        self._preprocess()
        return self.df

    def _preprocess(self):
        """数据预处理：类型转换、空值处理、标签解析"""
        if self.df is None or self.df.empty:
            raise ValueError("数据为空，请先加载账单数据")

        # 统一列名（中英文兼容）
        col_map = {
            "billDate": "bill_date",
            "bill_date": "bill_date",
            "productName": "product_name",
            "product_name": "product_name",
            "productCode": "product_code",
            "resourceId": "resource_id",
            "resource_id": "resource_id",
            "resourceName": "resource_name",
            "resource_name": "resource_name",
            "region": "region",
            "realCost": "real_cost",
            "real_cost": "real_cost",
            "originalCost": "original_cost",
            "original_cost": "original_cost",
            "tags": "tags",
            "feeType": "fee_type",
            "fee_type": "fee_type",
        }
        self.df.rename(columns=col_map, inplace=True)

        # 日期处理
        if "bill_date" in self.df.columns:
            self.df["bill_date"] = pd.to_datetime(self.df["bill_date"], errors="coerce")

        # 金额字段转数值
        for col in ["real_cost", "original_cost"]:
            if col in self.df.columns:
                self.df[col] = pd.to_numeric(self.df[col], errors="coerce").fillna(0.0)

        # 解析标签 JSON
        if "tags" in self.df.columns:
            self._parse_tags()

        logger.info("数据预处理完成，共 %d 条记录", len(self.df))

    def _parse_tags(self):
        """将 tags JSON 字符串解析为独立列"""
        def safe_parse(tag_str):
            if pd.isna(tag_str) or tag_str == "":
                return {}
            try:
                return json.loads(tag_str) if isinstance(tag_str, str) else tag_str
            except (json.JSONDecodeError, TypeError):
                return {}

        parsed = self.df["tags"].apply(safe_parse)

        for tag_key in self.tag_keys:
            self.df[f"tag_{tag_key}"] = parsed.apply(
                lambda t: t.get(tag_key, "未标记") if isinstance(t, dict) else "未标记"
            )

    # ------------------------------------------------------------------
    # 分析引擎
    # ------------------------------------------------------------------

    def monthly_trend(self) -> pd.DataFrame:
        """月度消费趋势"""
        trend = (
            self.df.groupby(self.df["bill_date"].dt.to_period("M"))
            .agg(总消费=("real_cost", "sum"), 原价=("original_cost", "sum"))
            .reset_index()
        )
        trend["bill_date"] = trend["bill_date"].astype(str)
        trend["折扣率"] = (trend["总消费"] / trend["原价"] * 100).round(1)
        return trend

    def product_top_n(self, n: int = None) -> pd.DataFrame:
        """Top N 产品消费排行"""
        n = n or self.top_n
        return (
            self.df.groupby("product_name")
            .agg(消费金额=("real_cost", "sum"), 占比=("real_cost", lambda x: f"{x.sum() / self.df['real_cost'].sum() * 100:.1f}%"))
            .sort_values("消费金额", ascending=False)
            .head(n)
            .reset_index()
        )

    def resource_cost_ranking(self, top_n: int = 20) -> pd.DataFrame:
        """单资源消费排行"""
        ranking = (
            self.df.groupby(["resource_id", "resource_name", "product_name"])
            .agg(消费金额=("real_cost", "sum"))
            .sort_values("消费金额", ascending=False)
            .head(top_n)
            .reset_index()
        )
        return ranking

    def cost_by_tag(self, tag_key: str) -> pd.DataFrame:
        """按标签聚合成本"""
        col = f"tag_{tag_key}"
        if col not in self.df.columns:
            logger.warning("标签列 %s 不存在", col)
            return pd.DataFrame()

        return (
            self.df.groupby(col)
            .agg(消费金额=("real_cost", "sum"), 资源数=("resource_id", "nunique"))
            .sort_values("消费金额", ascending=False)
            .reset_index()
        )

    def cost_by_region(self) -> pd.DataFrame:
        """按地域聚合成本"""
        return (
            self.df.groupby("region")
            .agg(消费金额=("real_cost", "sum"), 占比=("real_cost", lambda x: f"{x.sum() / self.df['real_cost'].sum() * 100:.1f}%"))
            .sort_values("消费金额", ascending=False)
            .reset_index()
        )

    def tag_compliance_report(self) -> pd.DataFrame:
        """标签合规检查：统计各标签键的覆盖率"""
        results = []
        total = len(self.df)

        for tag_key in self.tag_keys:
            col = f"tag_{tag_key}"
            if col not in self.df.columns:
                continue
            tagged = (self.df[col] != "未标记").sum()
            untagged = total - tagged
            results.append({
                "标签键": tag_key,
                "已标记资源数": tagged,
                "未标记资源数": untagged,
                "覆盖率": f"{tagged / total * 100:.1f}%",
            })

        return pd.DataFrame(results)

    def high_cost_resources(self) -> pd.DataFrame:
        """高消费资源清单（月消费超过阈值）"""
        monthly = (
            self.df.groupby(["resource_id", "resource_name", "product_name", "region"])
            .agg(月消费=("real_cost", "sum"))
            .reset_index()
        )
        return monthly[monthly["月消费"] >= self.cost_threshold].sort_values("月消费", ascending=False)

    def daily_cost_peak_analysis(self) -> pd.DataFrame:
        """日消费峰值分析"""
        daily = (
            self.df.groupby("bill_date")
            .agg(日消费=("real_cost", "sum"))
            .reset_index()
            .sort_values("bill_date")
        )
        daily["7日均值"] = daily["日消费"].rolling(7).mean()
        daily["日环比"] = daily["日消费"].pct_change() * 100
        return daily

    # ------------------------------------------------------------------
    # 可视化
    # ------------------------------------------------------------------

    def plot_monthly_trend(self, trend: pd.DataFrame):
        """月度消费趋势图"""
        fig, ax = plt.subplots(figsize=(14, 6))

        x = trend["bill_date"]
        ax.bar(x, trend["原价"], label="原价", alpha=0.3, color="gray")
        ax.bar(x, trend["总消费"], label="实付", color="#0052d9")
        ax.plot(x, trend["总消费"], "o-", color="#d9001b", linewidth=2, markersize=6)

        for i, row in trend.iterrows():
            ax.annotate(
                f"¥{row['总消费']:,.0f}",
                (x[i], row["总消费"]),
                textcoords="offset points",
                xytext=(0, 10),
                ha="center",
                fontsize=9,
            )

        ax.set_title("月度消费趋势", fontsize=16, fontweight="bold")
        ax.set_ylabel("金额（元）")
        ax.legend()
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"¥{v:,.0f}"))
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig("./output/charts/monthly_trend.png", dpi=150)
        plt.close()
        logger.info("月度趋势图已保存")

    def plot_product_pie(self, products: pd.DataFrame):
        """产品消费分布饼图"""
        fig, ax = plt.subplots(figsize=(10, 8))

        others = pd.DataFrame([{
            "product_name": "其他",
            "消费金额": products.iloc[self.top_n - 1:]["消费金额"].sum()
        }])
        top = products.head(self.top_n - 1)
        plot_data = pd.concat([top, others], ignore_index=True)

        colors = plt.cm.Set3(range(len(plot_data)))
        wedges, texts, autotexts = ax.pie(
            plot_data["消费金额"],
            labels=plot_data["product_name"],
            autopct="%1.1f%%",
            colors=colors,
            startangle=90,
            pctdistance=0.85,
        )
        for t in autotexts:
            t.set_fontsize(9)

        ax.set_title("产品消费分布", fontsize=16, fontweight="bold")
        plt.tight_layout()
        plt.savefig("./output/charts/product_distribution.png", dpi=150)
        plt.close()
        logger.info("产品分布饼图已保存")

    def plot_tag_distribution(self, tag_key: str, data: pd.DataFrame):
        """标签维度成本分布"""
        fig, ax = plt.subplots(figsize=(12, 6))

        top = data.head(10)
        colors = plt.cm.Blues(range(50, 50 + 10 * 20, 20))

        bars = ax.barh(range(len(top)), top["消费金额"], color=colors)
        ax.set_yticks(range(len(top)))
        ax.set_yticklabels(top.iloc[:, 0])
        ax.invert_yaxis()

        for bar, val in zip(bars, top["消费金额"]):
            ax.text(
                bar.get_width() + 100,
                bar.get_y() + bar.get_height() / 2,
                f"¥{val:,.0f}",
                va="center",
                fontsize=9,
            )

        ax.set_title(f"按 {tag_key} 成本分布（Top 10）", fontsize=14, fontweight="bold")
        ax.set_xlabel("金额（元）")
        ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"¥{v:,.0f}"))
        plt.tight_layout()
        plt.savefig(f"./output/charts/tag_{tag_key}_distribution.png", dpi=150)
        plt.close()

    def plot_daily_trend(self, daily: pd.DataFrame):
        """日消费趋势与 7 日均线"""
        fig, ax = plt.subplots(figsize=(14, 6))

        ax.fill_between(
            daily["bill_date"], daily["日消费"], alpha=0.15, color="#0052d9"
        )
        ax.plot(
            daily["bill_date"], daily["日消费"],
            "-", color="#0052d9", linewidth=1, label="日消费"
        )
        ax.plot(
            daily["bill_date"], daily["7日均值"],
            "--", color="#d9001b", linewidth=2, label="7日均值"
        )

        ax.set_title("日消费趋势", fontsize=16, fontweight="bold")
        ax.set_ylabel("金额（元）")
        ax.legend()
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"¥{v:,.0f}"))
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig("./output/charts/daily_trend.png", dpi=150)
        plt.close()

    # ------------------------------------------------------------------
    # 报告生成
    # ------------------------------------------------------------------

    def generate_html_report(self) -> str:
        """生成完整的 HTML 分析报告"""
        if self.df is None or self.df.empty:
            raise ValueError("请先加载数据")

        total_cost = self.df["real_cost"].sum()
        total_resources = self.df["resource_id"].nunique()
        avg_discount = (total_cost / self.df["original_cost"].sum() * 100) if self.df["original_cost"].sum() > 0 else 100

        trend = self.monthly_trend()
        products = self.product_top_n()
        regions = self.cost_by_region()
        compliance = self.tag_compliance_report()
        high_cost = self.high_cost_resources()
        daily = self.daily_cost_peak_analysis()

        self.plot_monthly_trend(trend)
        self.plot_product_pie(products)
        self.plot_daily_trend(daily)

        for tag_key in self.tag_keys:
            tag_data = self.cost_by_tag(tag_key)
            if not tag_data.empty:
                self.plot_tag_distribution(tag_key, tag_data)

        # 构建 HTML
        report_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        period_start = self.df["bill_date"].min().strftime("%Y-%m-%d")
        period_end = self.df["bill_date"].max().strftime("%Y-%m-%d")

        # 产品排行 HTML 行
        product_rows = ""
        for i, row in products.iterrows():
            product_rows += f"""
            <tr>
                <td>{i + 1}</td>
                <td>{row['product_name']}</td>
                <td class="amount">¥{row['消费金额']:,.2f}</td>
                <td>{row['占比']}</td>
            </tr>"""

        # 地域分布 HTML 行
        region_rows = ""
        for _, row in regions.iterrows():
            region_rows += f"""
            <tr>
                <td>{row['region']}</td>
                <td class="amount">¥{row['消费金额']:,.2f}</td>
                <td>{row['占比']}</td>
            </tr>"""

        # 标签合规 HTML 行
        compliance_rows = ""
        for _, row in compliance.iterrows():
            compliance_rows += f"""
            <tr>
                <td>{row['标签键']}</td>
                <td>{row['已标记资源数']}</td>
                <td>{row['未标记资源数']}</td>
                <td>{row['覆盖率']}</td>
            </tr>"""

        # 高消费资源 HTML 行
        high_cost_rows = ""
        for _, row in high_cost.head(20).iterrows():
            high_cost_rows += f"""
            <tr>
                <td>{row['resource_id']}</td>
                <td>{row['resource_name']}</td>
                <td>{row['product_name']}</td>
                <td>{row['region']}</td>
                <td class="amount">¥{row['月消费']:,.2f}</td>
            </tr>"""

        # 月度趋势 HTML 行
        trend_rows = ""
        for _, row in trend.iterrows():
            trend_rows += f"""
            <tr>
                <td>{row['bill_date']}</td>
                <td class="amount">¥{row['原价']:,.2f}</td>
                <td class="amount">¥{row['总消费']:,.2f}</td>
                <td>{row['折扣率']}%</td>
            </tr>"""

        # 日消费异常检测
        anomaly_rows = ""
        anomaly_days = daily[daily["日环比"].abs() > 20].dropna()
        for _, row in anomaly_days.iterrows():
            direction = "↑" if row["日环比"] > 0 else "↓"
            anomaly_rows += f"""
            <tr>
                <td>{row['bill_date'].strftime('%Y-%m-%d')}</td>
                <td class="amount">¥{row['日消费']:,.2f}</td>
                <td class="amount">{direction}{abs(row['日环比']):.1f}%</td>
            </tr>"""

        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{self.config['report']['title']}</title>
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: "Microsoft YaHei", "PingFang SC", sans-serif; background: #f5f7fa; color: #333; }}
    .container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}
    .header {{ background: linear-gradient(135deg, #0052d9, #1a66ff); color: #fff; padding: 40px; border-radius: 12px; margin-bottom: 30px; }}
    .header h1 {{ font-size: 28px; margin-bottom: 10px; }}
    .header p {{ opacity: 0.9; font-size: 14px; }}
    .summary-cards {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }}
    .card {{ background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }}
    .card .label {{ font-size: 13px; color: #888; margin-bottom: 6px; }}
    .card .value {{ font-size: 24px; font-weight: bold; color: #0052d9; }}
    .card .sub {{ font-size: 12px; color: #999; margin-top: 4px; }}
    .section {{ background: #fff; border-radius: 10px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }}
    .section h2 {{ font-size: 18px; color: #0052d9; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e8edf5; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th {{ background: #f0f4ff; color: #0052d9; padding: 10px 12px; text-align: left; font-weight: 600; }}
    td {{ padding: 10px 12px; border-bottom: 1px solid #eee; }}
    tr:hover td {{ background: #f8faff; }}
    .amount {{ text-align: right; font-family: "Courier New", monospace; }}
    .chart {{ text-align: center; margin: 20px 0; }}
    .chart img {{ max-width: 100%; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
    .badge {{ display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }}
    .badge-green {{ background: #e8f5e9; color: #2e7d32; }}
    .badge-yellow {{ background: #fff8e1; color: #f57f17; }}
    .badge-red {{ background: #fbe9e7; color: #c62828; }}
    .footer {{ text-align: center; color: #999; font-size: 12px; padding: 20px; }}
    @media (max-width: 768px) {{ .summary-cards {{ grid-template-columns: repeat(2, 1fr); }} }}
</style>
</head>
<body>
<div class="container">

<div class="header">
    <h1>{self.config['report']['title']}</h1>
    <p>{self.config['report']['company']} | 报告周期: {period_start} ~ {period_end} | 生成时间: {report_time}</p>
</div>

<div class="summary-cards">
    <div class="card">
        <div class="label">总消费金额</div>
        <div class="value">¥{total_cost:,.2f}</div>
        <div class="sub">分析周期内累计支出</div>
    </div>
    <div class="card">
        <div class="label">平均折扣率</div>
        <div class="value">{avg_discount:.1f}%</div>
        <div class="sub">实付/原价</div>
    </div>
    <div class="card">
        <div class="label">活跃资源数</div>
        <div class="value">{total_resources:,}</div>
        <div class="sub">有消费记录的资源</div>
    </div>
    <div class="card">
        <div class="label">月均消费</div>
        <div class="value">¥{total_cost / max(len(trend), 1):,.2f}</div>
        <div class="sub">月平均值</div>
    </div>
</div>

<div class="section">
    <h2>月度消费趋势</h2>
    <div class="chart"><img src="../charts/monthly_trend.png" alt="月度趋势"></div>
    <table>
        <tr><th>月份</th><th>原价</th><th>实付</th><th>折扣率</th></tr>
        {trend_rows}
    </table>
</div>

<div class="section">
    <h2>日消费趋势与异常检测</h2>
    <div class="chart"><img src="../charts/daily_trend.png" alt="日趋势"></div>
    {f'''
    <h3 style="color:#c62828;margin:16px 0 8px;">⚠ 日环比异常波动（>20%）</h3>
    <table>
        <tr><th>日期</th><th>日消费</th><th>日环比</th></tr>
        {anomaly_rows}
    </table>
    ''' if anomaly_rows else '<p style="color:#2e7d32;">✓ 未检测到显著日环比异常</p>'}
</div>

<div class="section">
    <h2>产品消费排行（Top {self.top_n}）</h2>
    <div class="chart"><img src="../charts/product_distribution.png" alt="产品分布"></div>
    <table>
        <tr><th>排名</th><th>产品</th><th>消费金额</th><th>占比</th></tr>
        {product_rows}
    </table>
</div>

<div class="section">
    <h2>地域分布</h2>
    <table>
        <tr><th>地域</th><th>消费金额</th><th>占比</th></tr>
        {region_rows}
    </table>
</div>

<div class="section">
    <h2>标签合规检查</h2>
    <table>
        <tr><th>标签键</th><th>已标记</th><th>未标记</th><th>覆盖率</th></tr>
        {compliance_rows}
    </table>
</div>

<div class="section">
    <h2>高消费资源清单（月消费 ≥ ¥{self.cost_threshold:,}）</h2>
    {f'''
    <table>
        <tr><th>资源 ID</th><th>名称</th><th>产品</th><th>地域</th><th>月消费</th></tr>
        {high_cost_rows}
    </table>
    ''' if high_cost_rows else '<p>✓ 无超过阈值的高消费资源</p>'}
</div>

<div class="footer">
    <p>本报告由腾讯云账单分析工具自动生成 | {report_time}</p>
</div>

</div>
</body>
</html>"""

        report_path = os.path.join(self.output_dir, f"billing_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(html)

        logger.info("HTML 报告已生成: %s", report_path)
        return report_path


def main():
    """命令行入口"""
    import argparse

    parser = argparse.ArgumentParser(description="腾讯云账单分析工具")
    parser.add_argument("--config", default="config.yaml", help="配置文件路径")
    parser.add_argument("--data-dir", help="本地账单 CSV 目录")
    parser.add_argument("--cos", action="store_true", help="从 COS 拉取账单")
    parser.add_argument("--report-only", action="store_true", help="仅生成报告（跳过分析）")

    args = parser.parse_args()

    analyzer = BillingAnalyzer(args.config)

    if args.data_dir:
        analyzer.load_from_local(args.data_dir)
    elif args.cos:
        analyzer.load_from_cos()
    else:
        parser.print_help()
        return

    report_path = analyzer.generate_html_report()
    print(f"\n✅ 分析完成！报告已生成: {report_path}")


if __name__ == "__main__":
    main()
```

### 22.7.4 使用方式

```bash
# 安装依赖
pip install pandas pyyaml matplotlib cos-python-sdk-v5

# 从本地 CSV 文件分析
python billing_analyzer.py --data-dir ./billing_data

# 从 COS 拉取分析
export TENCENT_SECRET_ID="your_secret_id"
export TENCENT_SECRET_KEY="your_secret_key"
python billing_analyzer.py --cos
```

### 22.7.5 分析报告内容

生成的 HTML 报告包含以下模块：

1. **概览卡片**：总消费、平均折扣率、活跃资源数、月均消费
2. **月度消费趋势**：柱状图 + 折线图，展示原价与实付对比
3. **日消费趋势与异常检测**：日消费曲线 + 7 日均线，自动标记日环比超过 20% 的异常日期
4. **产品消费排行**：饼图 + 表格，展示 Top N 产品消费分布
5. **地域分布**：各区域消费金额与占比
6. **标签合规检查**：各标签键的覆盖率统计
7. **高消费资源清单**：月消费超过阈值的资源明细

## 22.8 成本优化最佳实践

### 22.8.1 计算资源优化

| 策略 | 说明 | 预期节省 |
|------|------|----------|
| 预留实例（RI） | 1年/3年预付费，换取折扣 | 40%-60% |
| 节省计划 | 承诺消费额度换取折扣 | 20%-50% |
| 竞价实例 | 无状态容错型任务使用 | 60%-90% |
| 自动扩缩容 | 根据负载调整实例数量 | 20%-40% |
| 实例降配 | 识别过配实例并降配 | 10%-30% |

### 22.8.2 存储成本优化

- **生命周期管理**：标准存储 → 低频存储 → 归档存储，自动沉降
- **存储桶标签分账**：按业务线划分存储桶
- **删除未完成的分片上传**：分片上传残留文件会持续计费
- **快照管理**：定期清理过期快照，保留最近 3-7 天

### 22.8.3 网络成本优化

- **内网互通**：同地域资源使用内网 IP 通信，避免公网流量费
- **CDN 缓存**：静态资源通过 CDN 分发，减少源站带宽
- **跨地域专线**：高频跨地域通信使用专线而非公网
- **带宽包**：多实例共享带宽包，降低单位带宽成本

### 22.8.4 持续治理机制

成本优化不是一次性活动，需要建立持续治理机制：

1. **每日**：自动扫描高消费资源，发送日报
2. **每周**：检查标签合规率，推动未打标资源补标
3. **每月**：生成月度账单分析报告，召开成本评审会
4. **每季**：评估 RI/节省计划覆盖率，调整承诺额度
5. **每年**：复盘年度成本趋势，制定下一年预算

## 22.9 总结

本章从腾讯云成本管理工具链出发，系统介绍了成本 explorer 的使用方法、基于标签的分账体系设计、账单导出与定制化分析方案、预算管理与告警配置，并提供了一个可直接投入使用的 Python 账单分析脚本。

核心要点：

- **看清是管好的前提**：利用成本 explorer 和账单导出功能建立成本可见性
- **标签是分账的基石**：设计合理的标签体系，通过标签策略强制执行
- **自动化是持续优化的保障**：通过脚本和 API 实现账单分析的自动化
- **预算告警是成本失控的防线**：设置多级预算告警，结合异常检测提前发现风险
- **优化是持续的过程**：建立日/周/月/季/年的持续治理节奏

对于 SRE 团队而言，成本管理能力与稳定性保障能力同等重要。只有将成本分析融入日常运维流程，才能真正实现"用最合理的成本，提供最稳定的服务"。
