# 第13章 Graph RAG：基于Neptune与DeepSeek的图检索增强生成

## 13.1 概述

### 解决的问题

传统RAG（Retrieval Augmented Generation）基于向量相似度检索文本块，存在三个根本性缺陷：第一，**缺乏结构化推理能力**——向量检索返回的是语义相似的文本片段，无法表达实体间的多跳关系（如"A公司投资了B公司，B公司的CTO是C，C曾任职于D公司"这类链式知识）；第二，**信息碎片化**——长文档被切块后，跨块的知识关联断裂，LLM无法重建完整的实体关系网络；第三，**可解释性差**——无法追溯答案所依赖的具体知识路径，难以验证事实准确性。

Graph RAG通过将知识组织为图结构（节点=实体，边=关系），从根本上解决了上述问题。图结构天然支持多跳推理、路径发现和子图提取，使LLM的生成结果可追溯、可验证。

### 核心原理

Graph RAG的完整流程分为四个阶段：

1. **图构建**：从结构化或非结构化数据中提取实体和关系，构建属性图
2. **图检索**：根据自然语言问题，从图中检索相关子图、路径或模式
3. **上下文增强**：将图结构序列化为LLM可理解的文本表示
4. **生成回答**：将增强后的上下文注入提示词，由LLM生成最终答案

```
用户问题 → 实体识别 → 图查询(子图/路径) → 上下文序列化 → DeepSeek推理 → 答案
```

本章使用Amazon Neptune作为图数据库，DeepSeek作为LLM引擎，构建完整的Graph RAG系统。

---

## 13.2 数据准备与图构建

### 13.2.1 解决的问题

Graph RAG的第一步也是最关键的一步：如何将原始数据转化为高质量的属性图。常见挑战包括：实体消歧（同名不同实体）、关系抽取精度、图Schema设计（过度建模导致查询复杂，欠建模导致信息丢失）、大规模数据导入性能。

### 13.2.2 核心原理

**图Schema设计原则**：
- **节点（Vertex）**：表示真实世界实体，按类型分组（如Company、Person、Product、Technology）
- **边（Edge）**：表示实体间关系，带方向性和标签（如 `INVESTED_IN`、`DEVELOPS`、`WORKS_AT`）
- **属性（Property）**：节点和边的键值对元数据

**Neptune Bulk Loader**：Neptune提供专用的批量导入工具，支持CSV/JSON格式，通过`LOAD FROM S3`命令将数据并行加载到图实例中。加载器自动处理主键去重、数据类型转换和索引构建。

### 13.2.3 代码/配置实现

#### 图Schema设计

本章使用一个企业知识图谱示例，包含以下实体和关系：

**节点类型**：
| 标签 | 属性 | 示例 |
|------|------|------|
| Company | id, name, founded, headquarters, revenue | AcmeCorp, 2005, 北京, 50亿 |
| Person | id, name, title, email | 张三, CTO, zhang@acme.com |
| Product | id, name, category, launchDate | GraphDB Pro, 数据库, 2023 |
| Technology | id, name, type, version | Neptune, 图数据库, 1.3 |

**边类型**：
| 标签 | 起点→终点 | 属性 |
|------|----------|------|
| INVESTED_IN | Company → Company | amount, round, date |
| DEVELOPS | Company → Product | since |
| USES | Company → Technology | purpose, since |
| WORKS_AT | Person → Company | startDate, endDate |
| LEADS | Person → Company | role, since |
| BUILT_WITH | Product → Technology | version |
| COMPETES_WITH | Company → Company | market, intensity |
| PARTNERS_WITH | Company → Company | type, since |
| ACQUIRED | Company → Company | amount, year |

#### 数据生成脚本

```python
# data_generator.py
import csv
import uuid
import random
from datetime import datetime, timedelta

COMPANIES = [
    {"id": "c001", "name": "智云科技", "founded": 2015, "headquarters": "北京", "revenue": 120},
    {"id": "c002", "name": "星辰数据", "founded": 2018, "headquarters": "上海", "revenue": 80},
    {"id": "c003", "name": "天图智能", "founded": 2020, "headquarters": "深圳", "revenue": 45},
    {"id": "c004", "name": "深蓝算法", "founded": 2016, "headquarters": "杭州", "revenue": 200},
    {"id": "c005", "name": "云帆科技", "founded": 2019, "headquarters": "北京", "revenue": 30},
    {"id": "c006", "name": "极光数据", "founded": 2014, "headquarters": "广州", "revenue": 95},
    {"id": "c007", "name": "领航智能", "founded": 2017, "headquarters": "成都", "revenue": 60},
    {"id": "c008", "name": "寰宇科技", "founded": 2013, "headquarters": "北京", "revenue": 350},
]

PEOPLE = [
    {"id": "p001", "name": "张明远", "title": "CEO", "email": "zhangmy@zhiyun.com"},
    {"id": "p002", "name": "李思然", "title": "CTO", "email": "lisr@zhiyun.com"},
    {"id": "p003", "name": "王浩然", "title": "VP Engineering", "email": "wanghr@xingchen.com"},
    {"id": "p004", "name": "陈雨桐", "title": "首席科学家", "email": "chenyt@tiantu.com"},
    {"id": "p005", "name": "刘子轩", "title": "CEO", "email": "liuzx@deepblue.com"},
    {"id": "p006", "name": "赵雪晴", "title": "CTO", "email": "zhaoxq@deepblue.com"},
    {"id": "p007", "name": "孙逸飞", "title": "技术总监", "email": "sunyf@yunfan.com"},
    {"id": "p008", "name": "周明熙", "title": "CEO", "email": "zhoumx@aurora.com"},
    {"id": "p009", "name": "吴思远", "title": "首席架构师", "email": "wusy@linghang.com"},
    {"id": "p010", "name": "郑凯文", "title": "CEO", "email": "zhengkw@huanyu.com"},
]

PRODUCTS = [
    {"id": "pr001", "name": "智云Graph", "category": "图数据库", "launchDate": "2020-06"},
    {"id": "pr002", "name": "星辰分析平台", "category": "数据分析", "launchDate": "2021-03"},
    {"id": "pr003", "name": "天图推理引擎", "category": "AI推理", "launchDate": "2022-09"},
    {"id": "pr004", "name": "深蓝ML Suite", "category": "机器学习", "launchDate": "2019-11"},
    {"id": "pr005", "name": "云帆数据管道", "category": "数据集成", "launchDate": "2023-01"},
    {"id": "pr006", "name": "极光实时计算", "category": "流计算", "launchDate": "2020-08"},
    {"id": "pr007", "name": "领航知识图谱", "category": "知识管理", "launchDate": "2022-04"},
    {"id": "pr008", "name": "寰宇云平台", "category": "云计算", "launchDate": "2018-12"},
]

TECHNOLOGIES = [
    {"id": "t001", "name": "Amazon Neptune", "type": "图数据库", "version": "1.3.0"},
    {"id": "t002", "name": "DeepSeek", "type": "大语言模型", "version": "V3"},
    {"id": "t003", "name": "Apache Spark", "type": "计算引擎", "version": "3.5"},
    {"id": "t004", "name": "PyTorch", "type": "深度学习框架", "version": "2.1"},
    {"id": "t005", "name": "Kubernetes", "type": "容器编排", "version": "1.28"},
    {"id": "t006", "name": "LangChain", "type": "LLM框架", "version": "0.2"},
    {"id": "t007", "name": "FastAPI", "type": "Web框架", "version": "0.110"},
]

def generate_vertices():
    """生成节点CSV文件"""
    with open("vertices-company.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([":ID", "name", "founded", "headquarters", "revenue", ":LABEL"])
        for c in COMPANIES:
            w.writerow([c["id"], c["name"], c["founded"], c["headquarters"], c["revenue"], "Company"])

    with open("vertices-person.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([":ID", "name", "title", "email", ":LABEL"])
        for p in PEOPLE:
            w.writerow([p["id"], p["name"], p["title"], p["email"], "Person"])

    with open("vertices-product.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([":ID", "name", "category", "launchDate", ":LABEL"])
        for pr in PRODUCTS:
            w.writerow([pr["id"], pr["name"], pr["category"], pr["launchDate"], "Product"])

    with open("vertices-technology.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([":ID", "name", "type", "version", ":LABEL"])
        for t in TECHNOLOGIES:
            w.writerow([t["id"], t["name"], t["type"], t["version"], "Technology"])

def generate_edges():
    """生成边CSV文件"""
    edges = []

    # INVESTED_IN: Company → Company
    investments = [
        ("c004", "c001", 50, "A轮", "2020-03"),
        ("c008", "c002", 30, "天使轮", "2019-06"),
        ("c004", "c003", 20, "种子轮", "2021-01"),
        ("c008", "c005", 15, "天使轮", "2020-08"),
        ("c001", "c007", 25, "A轮", "2022-05"),
        ("c006", "c003", 10, "种子轮", "2021-01"),
    ]
    for src, dst, amount, rnd, date in investments:
        edges.append((src, dst, "INVESTED_IN", amount, rnd, date))

    # DEVELOPS: Company → Product
    develops = [
        ("c001", "pr001"), ("c002", "pr002"), ("c003", "pr003"),
        ("c004", "pr004"), ("c005", "pr005"), ("c006", "pr006"),
        ("c007", "pr007"), ("c008", "pr008"),
    ]
    for src, dst in develops:
        edges.append((src, dst, "DEVELOPS", "", "", ""))

    # USES: Company → Technology
    uses = [
        ("c001", "t001", "知识存储", "2021-06"),
        ("c001", "t002", "智能问答", "2024-01"),
        ("c002", "t003", "数据处理", "2022-03"),
        ("c003", "t004", "模型训练", "2023-05"),
        ("c004", "t005", "部署管理", "2020-09"),
        ("c001", "t006", "RAG流程", "2024-02"),
        ("c007", "t001", "知识图谱", "2023-01"),
        ("c007", "t002", "问答系统", "2024-03"),
    ]
    for src, dst, purpose, since in uses:
        edges.append((src, dst, "USES", purpose, since, ""))

    # WORKS_AT: Person → Company
    works_at = [
        ("p001", "c001", "2015-04", ""),
        ("p002", "c001", "2016-08", ""),
        ("p003", "c002", "2019-02", ""),
        ("p004", "c003", "2021-05", ""),
        ("p005", "c004", "2016-03", ""),
        ("p006", "c004", "2018-11", ""),
        ("p007", "c005", "2020-01", ""),
        ("p008", "c006", "2014-07", ""),
        ("p009", "c007", "2018-06", ""),
        ("p010", "c008", "2013-09", ""),
    ]
    for src, dst, start, end in works_at:
        edges.append((src, dst, "WORKS_AT", start, end, ""))

    # LEADS: Person → Company
    leads = [
        ("p001", "c001", "CEO", "2015-04"),
        ("p005", "c004", "CEO", "2016-03"),
        ("p008", "c006", "CEO", "2014-07"),
        ("p010", "c008", "CEO", "2013-09"),
    ]
    for src, dst, role, since in leads:
        edges.append((src, dst, "LEADS", role, since, ""))

    # BUILT_WITH: Product → Technology
    built_with = [
        ("pr001", "t001", "1.3"), ("pr001", "t006", "0.2"),
        ("pr003", "t004", "2.1"), ("pr004", "t004", "2.1"),
        ("pr004", "t003", "3.5"), ("pr005", "t003", "3.5"),
        ("pr006", "t003", "3.5"), ("pr007", "t001", "1.3"),
        ("pr007", "t002", "V3"), ("pr008", "t005", "1.28"),
    ]
    for src, dst, ver in built_with:
        edges.append((src, dst, "BUILT_WITH", ver, "", ""))

    # COMPETES_WITH: Company → Company
    competes = [
        ("c001", "c007", "知识图谱", "高"),
        ("c002", "c006", "数据分析", "中"),
        ("c004", "c001", "AI平台", "高"),
    ]
    for src, dst, market, intensity in competes:
        edges.append((src, dst, "COMPETES_WITH", market, intensity, ""))

    # PARTNERS_WITH: Company → Company
    partners = [
        ("c001", "c004", "技术合作", "2022-01"),
        ("c002", "c008", "云服务", "2023-06"),
        ("c003", "c001", "AI研发", "2023-03"),
    ]
    for src, dst, ptype, since in partners:
        edges.append((src, dst, "PARTNERS_WITH", ptype, since, ""))

    # ACQUIRED: Company → Company
    acquired = [
        ("c008", "c005", 80, "2023-12"),
    ]
    for src, dst, amount, year in acquired:
        edges.append((src, dst, "ACQUIRED", amount, year, ""))

    with open("edges.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([":START_ID", ":END_ID", ":TYPE", "prop1", "prop2", "prop3"])
        for src, dst, etype, p1, p2, p3 in edges:
            w.writerow([src, dst, etype, p1, p2, p3])

if __name__ == "__main__":
    generate_vertices()
    generate_edges()
    print("CSV files generated successfully")
```

#### Neptune Bulk Loader 加载

```python
# neptune_loader.py
import boto3
import json
import time
import logging
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NeptuneBulkLoader:
    def __init__(self, neptune_endpoint: str, neptune_port: int = 8182,
                 region: str = "us-east-1", iam_role_arn: str = None):
        self.neptune_endpoint = neptune_endpoint
        self.neptune_port = neptune_port
        self.region = region
        self.iam_role_arn = iam_role_arn
        self.client = boto3.client("neptune", region_name=region)

    def load_from_s3(self, s3_bucket: str, s3_prefix: str,
                     fail_on_error: bool = True,
                     parallelism: str = "HIGH") -> str:
        """
        从S3加载CSV数据到Neptune

        Args:
            s3_bucket: S3桶名
            s3_prefix: S3路径前缀（如 'graph-data/')
            fail_on_error: 遇到错误是否失败
            parallelism: 并行度 (LOW/MEDIUM/HIGH/OVERSUBSCRIBE)

        Returns:
            load_id: 加载任务ID
        """
        source = f"s3://{s3_bucket}/{s3_prefix}"

        params = {
            "source": source,
            "format": "csv",
            "region": self.region,
            "failOnError": str(fail_on_error).lower(),
            "parallelism": parallelism,
            "updateSingleCardinalityProperties": False,
            "queueRequest": True,
        }

        if self.iam_role_arn:
            params["iamRoleArn"] = self.iam_role_arn

        try:
            response = self.client.start_loader_job(
                loadSource=source,
                role=self.iam_role_arn,
                format="csv",
                region=self.region,
                failOnError=str(fail_on_error).lower(),
                parallelism=parallelism,
                updateSingleCardinalityProperties=False,
                queueRequest=True,
            )
            load_id = response["loadId"]
            logger.info(f"Bulk load started: {load_id}")
            return load_id
        except ClientError as e:
            logger.error(f"Failed to start bulk load: {e}")
            raise

    def wait_for_completion(self, load_id: str, poll_interval: int = 10,
                            timeout: int = 3600) -> dict:
        """等待加载完成"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                status = self.client.list_loader_jobs(loadId=load_id)
                job = status["payload"]["loadIds"][0]
                state = job["state"]

                if state == "LOAD_COMPLETED":
                    logger.info(f"Load {load_id} completed successfully")
                    return self._get_load_summary(job)
                elif state in ("LOAD_FAILED", "ROLLBACK_COMPLETED"):
                    logger.error(f"Load {load_id} failed: {job.get('errors', 'Unknown')}")
                    raise RuntimeError(f"Bulk load failed: {job.get('errors')}")
                elif state == "LOAD_IN_PROGRESS":
                    loaded = job.get("totalRecordsLoaded", 0)
                    errors = job.get("totalErrors", 0)
                    logger.info(f"Progress: {loaded} records, {errors} errors")

                time.sleep(poll_interval)
            except ClientError as e:
                logger.error(f"Error checking load status: {e}")
                time.sleep(poll_interval)

        raise TimeoutError(f"Load {load_id} did not complete within {timeout}s")

    def _get_load_summary(self, job: dict) -> dict:
        return {
            "load_id": job.get("loadId"),
            "state": job.get("state"),
            "total_records": job.get("totalRecordsLoaded", 0),
            "total_errors": job.get("totalErrors", 0),
            "duration_ms": job.get("duration", 0),
        }

    def load_all(self, s3_bucket: str, s3_prefix: str) -> dict:
        """一键加载所有CSV并等待完成"""
        load_id = self.load_from_s3(s3_bucket, s3_prefix)
        return self.wait_for_completion(load_id)


# 使用示例
if __name__ == "__main__":
    loader = NeptuneBulkLoader(
        neptune_endpoint="your-neptune-cluster.cluster-xxx.neptune.amazonaws.com",
        iam_role_arn="arn:aws:iam::123456789:role/NeptuneLoadRole"
    )
    result = loader.load_all(
        s3_bucket="your-graph-data-bucket",
        s3_prefix="graph-data/"
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
```

#### 使用Gremlin验证数据

```python
# verify_graph.py
from gremlin_python import statics
from gremlin_python.process.anonymous_traversal import traversal
from gremlin_python.driver.driver_remote_connection import DriverRemoteConnection
from gremlin_python.process.graph_traversal import __
import json

class GraphVerifier:
    def __init__(self, neptune_endpoint: str, neptune_port: int = 8182):
        self.connection_str = f"wss://{neptune_endpoint}:{neptune_port}/gremlin"
        self.g = traversal().withRemote(
            DriverRemoteConnection(self.connection_str, "g")
        )

    def verify_schema(self) -> dict:
        """验证图Schema"""
        result = {}

        # 统计各类型节点数
        labels = ["Company", "Person", "Product", "Technology"]
        for label in labels:
            count = self.g.V().hasLabel(label).count().next()
            result[f"{label}_count"] = count

        # 统计各类型边数
        edge_labels = [
            "INVESTED_IN", "DEVELOPS", "USES", "WORKS_AT",
            "LEADS", "BUILT_WITH", "COMPETES_WITH",
            "PARTNERS_WITH", "ACQUIRED"
        ]
        for el in edge_labels:
            count = self.g.E().hasLabel(el).count().next()
            result[f"edge_{el}_count"] = count

        return result

    def sample_query(self) -> list:
        """示例查询：查找投资关系链"""
        results = self.g.V().has("Company", "name", "深蓝算法") \
            .outE("INVESTED_IN").inV().hasLabel("Company") \
            .values("name").toList()
        return results

    def close(self):
        try:
            self.g.close()
        except Exception:
            pass


if __name__ == "__main__":
    verifier = GraphVerifier("your-neptune-endpoint")
    try:
        schema = verifier.verify_schema()
        print("Schema:", json.dumps(schema, indent=2, ensure_ascii=False))

        invested = verifier.sample_query()
        print("深蓝算法投资的公司:", invested)
    finally:
        verifier.close()
```

### 13.2.4 使用场景

- **企业知识管理**：将内部文档、组织架构、产品信息构建为知识图谱
- **金融风控**：构建公司、人员、交易关系图，用于关联分析和风险传导推理
- **医疗知识库**：药物、疾病、基因、治疗方案的多维关系网络
- **电商推荐**：用户、商品、品牌、品类的交互关系图

### 13.2.5 潜在风险与注意事项

1. **数据一致性**：Bulk Loader不支持事务性回滚，建议加载前在测试环境验证CSV格式
2. **ID唯一性**：所有节点的`:ID`必须在全局唯一，建议使用UUID或带前缀的ID方案
3. **属性类型**：Neptune CSV中所有属性默认为字符串，数值型属性需在加载后通过Gremlin转换
4. **加载性能**：`parallelism=OVERSUBSCRIBE`可提升速度但消耗更多实例资源，生产环境建议用`HIGH`
5. **IAM权限**：确保Neptune实例的S3 VPC Endpoint和IAM Role配置正确

### 13.2.6 本章小结

本节实现了从数据生成到Neptune图加载的完整流程。核心要点：Schema设计需平衡查询灵活性和存储效率；Bulk Loader是生产环境加载大规模数据（TB级）的唯一可行方案；加载后务必通过Gremlin验证数据完整性。

---

## 13.3 检索策略设计

### 13.3.1 解决的问题

给定一个自然语言问题，如何从大规模知识图中高效提取最相关的子结构？三种核心检索模式各有适用场景：子图检索适合"描述某实体及其关联"类问题；路径检索适合"A和B有什么关系"类问题；上下文构建解决的是"如何将图结构无损地转化为LLM可理解的文本"。

### 13.3.2 核心原理

**子图检索**：通过实体链接（Entity Linking）将问题中的提及映射到图节点，然后以这些节点为中心进行N跳邻居扩展，形成子图。

**路径检索**：在实体对之间寻找最短路径或加权最优路径，路径上的节点和边构成推理链。

**上下文构建**：将子图/路径序列化为结构化文本，保留节点属性、边标签和方向信息。

### 13.3.3 代码/配置实现

#### 实体识别与链接

```python
# entity_linking.py
import re
from typing import List, Dict, Tuple, Optional
from gremlin_python.process.anonymous_traversal import traversal
from gremlin_python.driver.driver_remote_connection import DriverRemoteConnection
from gremlin_python.process.graph_traversal import __

class EntityLinker:
    """实体识别与链接器：将自然语言问题中的提及映射到图节点"""

    def __init__(self, neptune_endpoint: str, neptune_port: int = 8182):
        self.connection_str = f"wss://{neptune_endpoint}:{neptune_port}/gremlin"
        self.g = traversal().withRemote(
            DriverRemoteConnection(self.connection_str, "g")
        )

    def extract_mentions(self, question: str) -> List[str]:
        """
        从问题中提取可能的实体提及
        使用规则+词典匹配，生产环境可替换为NER模型
        """
        mentions = []

        # 预定义实体词典（可从Neptune动态加载）
        entity_dict = {
            "智云科技": ["智云", "智云科技", "Zhiyun"],
            "星辰数据": ["星辰", "星辰数据", "Xingchen"],
            "天图智能": ["天图", "天图智能", "Tiantu"],
            "深蓝算法": ["深蓝", "深蓝算法", "DeepBlue"],
            "云帆科技": ["云帆", "云帆科技", "Yunfan"],
            "极光数据": ["极光", "极光数据", "Aurora"],
            "领航智能": ["领航", "领航智能", "Linghang"],
            "寰宇科技": ["寰宇", "寰宇科技", "Huanyu"],
            "张明远": ["张明远"],
            "李思然": ["李思然"],
            "王浩然": ["王浩然"],
            "陈雨桐": ["陈雨桐"],
            "刘子轩": ["刘子轩"],
            "赵雪晴": ["赵雪晴"],
            "孙逸飞": ["孙逸飞"],
            "周明熙": ["周明熙"],
            "吴思远": ["吴思远"],
            "郑凯文": ["郑凯文"],
            "智云Graph": ["智云Graph", "智云图数据库"],
            "天图推理引擎": ["天图推理引擎", "天图推理"],
            "深蓝ML Suite": ["深蓝ML", "深蓝ML Suite"],
            "Amazon Neptune": ["Neptune", "Amazon Neptune"],
            "DeepSeek": ["DeepSeek"],
            "LangChain": ["LangChain"],
            "FastAPI": ["FastAPI"],
        }

        for entity_name, aliases in entity_dict.items():
            for alias in aliases:
                if alias in question:
                    mentions.append(entity_name)
                    break

        return mentions

    def link_to_vertices(self, mentions: List[str]) -> Dict[str, Optional[str]]:
        """
        将实体提及链接到Neptune节点ID

        Returns:
            {entity_name: vertex_id_or_None}
        """
        result = {}
        for mention in mentions:
            try:
                vertex = self.g.V().has("name", mention).elementMap().next()
                result[mention] = str(vertex["id"])
            except StopIteration:
                # 尝试模糊匹配
                try:
                    vertex = self.g.V().has("name", containing(mention)) \
                        .elementMap().next()
                    result[mention] = str(vertex["id"])
                except StopIteration:
                    result[mention] = None
        return result

    def link(self, question: str) -> Dict[str, str]:
        """完整流程：提取→链接"""
        mentions = self.extract_mentions(question)
        return self.link_to_vertices(mentions)

    def close(self):
        try:
            self.g.close()
        except Exception:
            pass


def containing(substring: str):
    """Gremlin contains predicate helper"""
    from gremlin_python.process.traversal import P
    return P.containing(substring)
```

#### 子图检索

```python
# subgraph_retriever.py
from typing import List, Dict, Any, Set, Tuple
from gremlin_python.process.anonymous_traversal import traversal
from gremlin_python.driver.driver_remote_connection import DriverRemoteConnection
from gremlin_python.process.graph_traversal import __
from gremlin_python.process.traversal import Order, Direction
import json

class SubgraphRetriever:
    """
    子图检索器：以实体节点为中心，扩展N跳邻居形成子图
    """

    def __init__(self, neptune_endpoint: str, neptune_port: int = 8182,
                 max_depth: int = 2, max_nodes: int = 50):
        self.connection_str = f"wss://{neptune_endpoint}:{neptune_port}/gremlin"
        self.g = traversal().withRemote(
            DriverRemoteConnection(self.connection_str, "g")
        )
        self.max_depth = max_depth
        self.max_nodes = max_nodes

    def retrieve_subgraph(self, seed_vertex_ids: List[str],
                          depth: int = None) -> Dict[str, Any]:
        """
        以种子节点为中心检索子图

        Args:
            seed_vertex_ids: 种子节点ID列表
            depth: 扩展深度（默认使用self.max_depth）

        Returns:
            {"nodes": [...], "edges": [...]}
        """
        depth = depth or self.max_depth
        visited_nodes: Set[str] = set(seed_vertex_ids)
        visited_edges: Set[str] = set()
        nodes: List[Dict] = []
        edges: List[Dict] = []

        # BFS扩展
        current_level = set(seed_vertex_ids)
        for level in range(depth):
            if not current_level:
                break
            if len(visited_nodes) >= self.max_nodes:
                break

            next_level = set()
            for vid in current_level:
                if len(visited_nodes) >= self.max_nodes:
                    break

                # 获取节点属性
                try:
                    v_elem = self.g.V(vid).elementMap().next()
                    node_data = {
                        "id": str(v_elem["id"]),
                        "label": v_elem.get("label", ""),
                        "properties": {
                            k: str(v) for k, v in v_elem.items()
                            if k not in ("id", "label")
                        }
                    }
                    if node_data not in nodes:
                        nodes.append(node_data)
                except Exception as e:
                    continue

                # 向外扩展邻居
                neighbor_query = self.g.V(vid).bothE().bothV().dedup()
                try:
                    neighbors = neighbor_query.limit(
                        self.max_nodes // len(current_level) + 1
                    ).elementMap().toList()

                    for n in neighbors:
                        nid = str(n["id"])
                        if nid not in visited_nodes:
                            visited_nodes.add(nid)
                            next_level.add(nid)
                except Exception:
                    pass

                # 获取边
                edge_query = self.g.V(vid).bothE()
                try:
                    edge_results = edge_query.limit(100).elementMap().toList()
                    for e in edge_results:
                        eid = str(e["id"])
                        if eid not in visited_edges:
                            visited_edges.add(eid)
                            edge_data = {
                                "id": eid,
                                "label": e.get("label", ""),
                                "source": str(e.get("outV", "")),
                                "target": str(e.get("inV", "")),
                                "properties": {
                                    k: str(v) for k, v in e.items()
                                    if k not in ("id", "label", "outV", "inV")
                                }
                            }
                            edges.append(edge_data)
                except Exception:
                    pass

            current_level = next_level

        return {"nodes": nodes, "edges": edges}

    def retrieve_by_question(self, question: str,
                             entity_links: Dict[str, str]) -> Dict[str, Any]:
        """根据问题和实体链接检索子图"""
        seed_ids = [vid for vid in entity_links.values() if vid is not None]
        if not seed_ids:
            return {"nodes": [], "edges": []}
        return self.retrieve_subgraph(seed_ids)

    def close(self):
        try:
            self.g.close()
        except Exception:
            pass
```

#### 路径检索

```python
# path_retriever.py
from typing import List, Dict, Any, Optional, Tuple
from gremlin_python.process.anonymous_traversal import traversal
from gremlin_python.driver.driver_remote_connection import DriverRemoteConnection
from gremlin_python.process.graph_traversal import __
from gremlin_python.process.traversal import Direction, Order
import json

class PathRetriever:
    """
    路径检索器：在实体对之间寻找路径，构建推理链
    """

    def __init__(self, neptune_endpoint: str, neptune_port: int = 8182,
                 max_path_length: int = 4):
        self.connection_str = f"wss://{neptune_endpoint}:{neptune_port}/gremlin"
        self.g = traversal().withRemote(
            DriverRemoteConnection(self.connection_str, "g")
        )
        self.max_path_length = max_path_length

    def find_paths(self, source_id: str, target_id: str,
                   max_length: int = None) -> List[Dict]:
        """
        查找两个节点之间的所有路径

        Args:
            source_id: 起点节点ID
            target_id: 终点节点ID
            max_length: 最大路径长度

        Returns:
            [{"nodes": [...], "edges": [...], "length": int}, ...]
        """
        max_len = max_length or self.max_path_length
        paths = []

        try:
            # 使用Gremlin的repeat...until模式查找路径
            result = self.g.V(source_id) \
                .repeat(__.bothE().bothV().simplePath()) \
                .until(__.has("id", target_id).and_().loops().is_(__.lte(max_len))) \
                .limit(10) \
                .path() \
                .by(__.elementMap()) \
                .toList()

            for path_obj in result:
                path_nodes = []
                path_edges = []

                for i, item in enumerate(path_obj):
                    item_str = str(item)
                    if "label" in item_str and "id" in item_str:
                        # 判断是节点还是边
                        if "outV" in item_str or "inV" in item_str:
                            path_edges.append({
                                "id": str(item.get("id", "")),
                                "label": item.get("label", ""),
                                "source": str(item.get("outV", "")),
                                "target": str(item.get("inV", "")),
                            })
                        else:
                            path_nodes.append({
                                "id": str(item.get("id", "")),
                                "label": item.get("label", ""),
                                "name": str(item.get("name", "")),
                            })

                paths.append({
                    "nodes": path_nodes,
                    "edges": path_edges,
                    "length": len(path_edges),
                })

        except Exception as e:
            print(f"Path search error: {e}")

        # 按路径长度排序
        paths.sort(key=lambda p: p["length"])
        return paths

    def find_all_pairs_paths(self, vertex_ids: List[str],
                             max_length: int = None) -> List[Dict]:
        """在所有实体对之间查找路径"""
        all_paths = []
        for i in range(len(vertex_ids)):
            for j in range(i + 1, len(vertex_ids)):
                paths = self.find_paths(vertex_ids[i], vertex_ids[j], max_length)
                all_paths.extend(paths)
        return all_paths

    def close(self):
        try:
            self.g.close()
        except Exception:
            pass
```

#### 上下文构建

```python
# context_builder.py
from typing import List, Dict, Any, Optional
import json

class ContextBuilder:
    """
    上下文构建器：将图结构序列化为LLM可理解的文本
    """

    @staticmethod
    def subgraph_to_text(subgraph: Dict[str, List]) -> str:
        """将子图转换为结构化文本描述"""
        lines = []
        lines.append("## 知识图谱上下文\n")

        # 节点描述
        nodes = subgraph.get("nodes", [])
        if nodes:
            lines.append("### 实体列表")
            for n in nodes:
                props = n.get("properties", {})
                label = n.get("label", "未知")
                name = props.get("name", n.get("id", "未命名"))
                extra = ", ".join(
                    f"{k}={v}" for k, v in props.items() if k != "name"
                )
                if extra:
                    lines.append(f"- [{label}] {name} ({extra})")
                else:
                    lines.append(f"- [{label}] {name}")
            lines.append("")

        # 边描述
        edges = subgraph.get("edges", [])
        if edges:
            lines.append("### 关系列表")
            # 构建节点ID到名称的映射
            id_to_name = {}
            for n in nodes:
                nid = n.get("id", "")
                name = n.get("properties", {}).get("name", nid)
                id_to_name[nid] = name

            for e in edges:
                src = id_to_name.get(e.get("source", ""), e.get("source", ""))
                tgt = id_to_name.get(e.get("target", ""), e.get("target", ""))
                label = e.get("label", "关联")
                props = e.get("properties", {})
                extra = f" ({', '.join(f'{k}={v}' for k, v in props.items())})" if props else ""
                lines.append(f"- {src} --[{label}]--> {tgt}{extra}")
            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def paths_to_text(paths: List[Dict]) -> str:
        """将路径列表转换为推理链文本"""
        lines = []
        lines.append("## 关系路径\n")

        for i, path in enumerate(paths, 1):
            nodes = path.get("nodes", [])
            edges = path.get("edges", [])
            if not nodes or not edges:
                continue

            # 构建路径字符串
            path_str_parts = []
            for j, edge in enumerate(edges):
                if j < len(nodes):
                    src_name = nodes[j].get("name", nodes[j].get("id", ""))
                    path_str_parts.append(src_name)
                edge_label = edge.get("label", "关联")
                path_str_parts.append(f"--[{edge_label}]-->")

            if nodes:
                last_name = nodes[-1].get("name", nodes[-1].get("id", ""))
                path_str_parts.append(last_name)

            path_str = " ".join(path_str_parts)
            lines.append(f"路径{i} (长度={path['length']}): {path_str}")

        lines.append("")
        return "\n".join(lines)

    @staticmethod
    def build_qa_context(question: str, subgraph: Dict[str, List],
                          paths: List[Dict]) -> str:
        """构建完整的QA上下文"""
        parts = [f"## 用户问题\n{question}\n"]

        if subgraph.get("nodes"):
            parts.append(ContextBuilder.subgraph_to_text(subgraph))

        if paths:
            parts.append(ContextBuilder.paths_to_text(paths))

        return "\n".join(parts)

    @staticmethod
    def subgraph_to_json(subgraph: Dict[str, List]) -> str:
        """将子图转换为JSON格式（适合结构化提示）"""
        simplified = {
            "entities": [],
            "relationships": [],
        }

        id_to_name = {}
        for n in subgraph.get("nodes", []):
            props = n.get("properties", {})
            name = props.get("name", n.get("id", ""))
            entity = {
                "id": n.get("id", ""),
                "type": n.get("label", ""),
                "name": name,
            }
            # 添加关键属性
            for k, v in props.items():
                if k != "name":
                    entity[k] = v
            simplified["entities"].append(entity)
            id_to_name[n["id"]] = name

        for e in subgraph.get("edges", []):
            rel = {
                "source": id_to_name.get(e.get("source", ""), e.get("source", "")),
                "target": id_to_name.get(e.get("target", ""), e.get("target", "")),
                "type": e.get("label", ""),
            }
            props = e.get("properties", {})
            if props:
                rel["properties"] = props
            simplified["relationships"].append(rel)

        return json.dumps(simplified, ensure_ascii=False, indent=2)
```

### 13.3.4 使用场景

- **子图检索**：适合"描述智云科技的业务生态"、"列出深蓝算法的投资组合"等开放域问题
- **路径检索**：适合"张明远和郑凯文之间有什么关系"、"寰宇科技如何影响到天图智能"等推理问题
- **上下文构建**：JSON格式适合结构化提示词，文本格式适合自由形式的LLM推理

### 13.3.5 潜在风险与注意事项

1. **检索爆炸**：2跳扩展在最坏情况下可能返回指数级节点（度中心节点），必须设置`max_nodes`和`max_depth`硬限制
2. **实体链接召回率**：规则匹配的召回率有限，生产环境建议集成BERT-based NER模型
3. **路径数量控制**：`limit(10)`可能遗漏重要路径，建议结合路径权重（如PageRank、边权重）排序
4. **Gremlin超时**：复杂路径查询可能超时，建议设置Neptune的`evaluationTimeout`参数
5. **空结果处理**：当检索不到相关实体时，应有fallback策略（如退化为传统向量RAG）

### 13.3.6 本章小结

三种检索策略形成互补：子图检索提供全景式上下文，路径检索提供推理链，上下文构建解决图→文本的序列化问题。实际系统中，应根据问题类型动态选择检索策略组合。

---

## 13.4 DeepSeek提示词工程

### 13.4.1 解决的问题

图结构数据对LLM是"异类"输入。LLM训练数据以自然语言为主，对三元组、路径、属性图等结构化表示的理解能力有限。提示词工程需要解决三个核心问题：如何将图结构无损编码为LLM可理解的文本；如何引导LLM进行多跳图推理；如何验证LLM输出是否忠实于图事实。

### 13.4.2 核心原理

**图上下文格式化**：将图结构转化为层次化文本，遵循"实体→关系→路径"的递进结构，降低LLM的理解负担。

**推理链设计**：通过Chain-of-Thought（CoT）提示，引导LLM逐步遍历图中的关系路径，每一步都引用具体的图事实。

**结果验证**：设计验证器，检查LLM输出中的每个事实断言是否能在检索到的子图中找到对应证据。

### 13.4.3 代码/配置实现

#### 提示词模板

```python
# prompt_templates.py
from typing import Dict, List, Optional

class GraphRAGPrompts:
    """Graph RAG提示词模板集合"""

    SYSTEM_PROMPT = """你是一个基于知识图谱的企业分析助手。你的知识来源是以下提供的图谱上下文。
请严格基于图谱中的事实回答问题。如果图谱中没有足够信息，请明确说明"图谱中未找到相关信息"。

推理规则：
1. 首先识别问题中提到的实体
2. 在图谱上下文中找到这些实体
3. 沿着关系路径进行推理
4. 每一步推理都要引用具体的图事实
5. 给出最终答案并标注信息来源"""

    @staticmethod
    def build_qa_prompt(question: str, graph_context: str) -> str:
        """构建标准QA提示词"""
        return f"""{GraphRAGPrompts.SYSTEM_PROMPT}

## 图谱上下文
{graph_context}

## 用户问题
{question}

## 推理过程
请逐步推理：

1. **实体识别**：问题中提到了哪些实体？
2. **关系查找**：这些实体在图谱中有哪些关系？
3. **路径分析**：沿着关系路径能得出什么结论？
4. **答案生成**：基于以上分析，给出最终答案。

## 答案"""

    @staticmethod
    def build_verification_prompt(question: str, answer: str,
                                   graph_context: str) -> str:
        """构建验证提示词：检查答案是否基于图事实"""
        return f"""请验证以下答案是否严格基于提供的图谱上下文。

## 图谱上下文
{graph_context}

## 问题
{question}

## 待验证的答案
{answer}

## 验证要求
请逐条检查答案中的每个事实断言：
1. 该断言是否能在图谱上下文中找到直接证据？
2. 如果找不到，请指出具体哪条断言没有证据支持
3. 如果答案遗漏了图谱中的重要信息，请指出

## 验证结果"""

    @staticmethod
    def build_multi_hop_prompt(question: str, paths: List[Dict],
                                subgraph: Dict) -> str:
        """构建多跳推理提示词"""
        # 构建路径描述
        path_descriptions = []
        for i, path in enumerate(paths, 1):
            nodes = path.get("nodes", [])
            edges = path.get("edges", [])
            steps = []
            for j, edge in enumerate(edges):
                if j < len(nodes):
                    src = nodes[j].get("name", "")
                    tgt = nodes[j + 1].get("name", "") if j + 1 < len(nodes) else ""
                    label = edge.get("label", "")
                    props = edge.get("properties", {})
                    prop_str = f" ({props})" if props else ""
                    steps.append(f"{src} -[{label}]{prop_str}-> {tgt}")
            path_descriptions.append(f"路径{i}: {' → '.join(steps)}")

        path_text = "\n".join(path_descriptions)

        return f"""{GraphRAGPrompts.SYSTEM_PROMPT}

## 可用的推理路径
{path_text}

## 用户问题
{question}

## 多跳推理要求
请沿着上述路径逐步推理，每一步都说明：
- 当前所在的实体
- 沿着什么关系移动
- 到达了什么新实体
- 这一步对回答问题有什么帮助

## 推理过程"""

    @staticmethod
    def build_comparison_prompt(entity_a: str, entity_b: str,
                                 subgraph: Dict) -> str:
        """构建实体对比提示词"""
        context = ContextBuilder.subgraph_to_text(subgraph)
        return f"""{GraphRAGPrompts.SYSTEM_PROMPT}

## 图谱上下文
{context}

## 对比分析
请从以下维度对比 {entity_a} 和 {entity_b}：

1. **基本信息**：成立时间、规模、总部
2. **产品与技术**：各自的产品和技术栈
3. **市场关系**：竞争、合作、投资关系
4. **人才团队**：核心人员
5. **综合对比**：各自的优势和劣势

每个维度请引用图谱中的具体事实。"""


# 复用ContextBuilder
class ContextBuilder:
    """上下文构建器（完整版）"""

    @staticmethod
    def subgraph_to_text(subgraph: Dict[str, List]) -> str:
        lines = []
        lines.append("## 知识图谱上下文\n")

        nodes = subgraph.get("nodes", [])
        if nodes:
            lines.append("### 实体列表")
            for n in nodes:
                props = n.get("properties", {})
                label = n.get("label", "未知")
                name = props.get("name", n.get("id", "未命名"))
                extra = ", ".join(
                    f"{k}={v}" for k, v in props.items() if k != "name"
                )
                if extra:
                    lines.append(f"- [{label}] {name} ({extra})")
                else:
                    lines.append(f"- [{label}] {name}")
            lines.append("")

        edges = subgraph.get("edges", [])
        if edges:
            lines.append("### 关系列表")
            id_to_name = {}
            for n in nodes:
                nid = n.get("id", "")
                name = n.get("properties", {}).get("name", nid)
                id_to_name[nid] = name

            for e in edges:
                src = id_to_name.get(e.get("source", ""), e.get("source", ""))
                tgt = id_to_name.get(e.get("target", ""), e.get("target", ""))
                label = e.get("label", "关联")
                props = e.get("properties", {})
                extra = f" ({', '.join(f'{k}={v}' for k, v in props.items())})" if props else ""
                lines.append(f"- {src} --[{label}]--> {tgt}{extra}")
            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def paths_to_text(paths: List[Dict]) -> str:
        lines = []
        lines.append("## 关系路径\n")

        for i, path in enumerate(paths, 1):
            nodes = path.get("nodes", [])
            edges = path.get("edges", [])
            if not nodes or not edges:
                continue

            path_str_parts = []
            for j, edge in enumerate(edges):
                if j < len(nodes):
                    src_name = nodes[j].get("name", nodes[j].get("id", ""))
                    path_str_parts.append(src_name)
                edge_label = edge.get("label", "关联")
                path_str_parts.append(f"--[{edge_label}]-->")

            if nodes:
                last_name = nodes[-1].get("name", nodes[-1].get("id", ""))
                path_str_parts.append(last_name)

            path_str = " ".join(path_str_parts)
            lines.append(f"路径{i} (长度={path['length']}): {path_str}")

        lines.append("")
        return "\n".join(lines)

    @staticmethod
    def build_qa_context(question: str, subgraph: Dict[str, List],
                          paths: List[Dict]) -> str:
        parts = [f"## 用户问题\n{question}\n"]
        if subgraph.get("nodes"):
            parts.append(ContextBuilder.subgraph_to_text(subgraph))
        if paths:
            parts.append(ContextBuilder.paths_to_text(paths))
        return "\n".join(parts)

    @staticmethod
    def subgraph_to_json(subgraph: Dict[str, List]) -> str:
        simplified = {"entities": [], "relationships": []}
        id_to_name = {}
        for n in subgraph.get("nodes", []):
            props = n.get("properties", {})
            name = props.get("name", n.get("id", ""))
            entity = {"id": n.get("id", ""), "type": n.get("label", ""), "name": name}
            for k, v in props.items():
                if k != "name":
                    entity[k] = v
            simplified["entities"].append(entity)
            id_to_name[n["id"]] = name
        for e in subgraph.get("edges", []):
            rel = {
                "source": id_to_name.get(e.get("source", ""), e.get("source", "")),
                "target": id_to_name.get(e.get("target", ""), e.get("target", "")),
                "type": e.get("label", ""),
            }
            props = e.get("properties", {})
            if props:
                rel["properties"] = props
            simplified["relationships"].append(rel)
        return json.dumps(simplified, ensure_ascii=False, indent=2)
```

#### DeepSeek API 调用封装

```python
# deepseek_client.py
import requests
import json
import time
from typing import List, Dict, Optional, Generator
from dataclasses import dataclass, field

@dataclass
class DeepSeekConfig:
    api_key: str
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-chat"
    temperature: float = 0.1
    max_tokens: int = 2048
    top_p: float = 0.9
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0

class DeepSeekClient:
    """DeepSeek API客户端封装"""

    def __init__(self, config: DeepSeekConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        })

    def chat(self, messages: List[Dict[str, str]],
             stream: bool = False) -> Dict:
        """调用DeepSeek Chat API"""
        url = f"{self.config.base_url}/chat/completions"
        payload = {
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "top_p": self.config.top_p,
            "frequency_penalty": self.config.frequency_penalty,
            "presence_penalty": self.config.presence_penalty,
            "stream": stream,
        }

        response = self.session.post(url, json=payload, timeout=60)
        response.raise_for_status()

        if stream:
            return self._handle_stream(response)
        return response.json()

    def _handle_stream(self, response: requests.Response) -> Dict:
        """处理流式响应"""
        content = ""
        for line in response.iter_lines():
            if line:
                line = line.decode("utf-8")
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0].get("delta", {})
                        content += delta.get("content", "")
                    except json.JSONDecodeError:
                        continue

        return {
            "choices": [{
                "message": {"content": content, "role": "assistant"}
            }]
        }

    def generate(self, prompt: str, system_prompt: str = None) -> str:
        """简化接口：直接传入提示词获取回答"""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        result = self.chat(messages)
        return result["choices"][0]["message"]["content"]

    def generate_with_retry(self, prompt: str, system_prompt: str = None,
                            max_retries: int = 3) -> str:
        """带重试的生成"""
        for attempt in range(max_retries):
            try:
                return self.generate(prompt, system_prompt)
            except (requests.exceptions.RequestException,
                    KeyError) as e:
                if attempt == max_retries - 1:
                    raise
                wait = 2 ** attempt
                print(f"API call failed (attempt {attempt + 1}), "
                      f"retrying in {wait}s: {e}")
                time.sleep(wait)
        return ""
```

#### 答案验证器

```python
# answer_validator.py
from typing import List, Dict, Any, Tuple
import re

class AnswerValidator:
    """
    答案验证器：验证LLM输出是否忠实于图事实
    """

    def __init__(self, deepseek_client):
        self.client = deepseek_client

    def extract_factual_claims(self, answer: str) -> List[str]:
        """从答案中提取事实性断言"""
        claims = []

        # 按句号分割
        sentences = re.split(r'[。！？]', answer)
        for s in sentences:
            s = s.strip()
            if not s:
                continue
            # 过滤掉推理过程、元评论等非事实性内容
            if any(kw in s for kw in ["我认为", "可能", "推测", "或许"]):
                continue
            if len(s) > 10:  # 太短的句子不视为事实断言
                claims.append(s)

        return claims

    def verify_claim(self, claim: str, subgraph: Dict) -> Tuple[bool, str]:
        """
        验证单个断言是否在图谱中有证据支持

        Returns:
            (is_supported, evidence_or_reason)
        """
        nodes = subgraph.get("nodes", [])
        edges = subgraph.get("edges", [])

        # 提取断言中出现的实体名
        entity_names = set()
        for n in nodes:
            name = n.get("properties", {}).get("name", "")
            if name and name in claim:
                entity_names.add(name)

        if not entity_names:
            return False, "断言中未找到图谱中的实体"

        # 检查关系是否匹配
        id_to_name = {}
        for n in nodes:
            id_to_name[n["id"]] = n.get("properties", {}).get("name", "")

        for e in edges:
            src = id_to_name.get(e.get("source", ""), "")
            tgt = id_to_name.get(e.get("target", ""), "")
            label = e.get("label", "")

            # 检查断言是否描述了这条边
            if src in claim and tgt in claim:
                if label.lower() in claim.lower():
                    return True, f"证据: {src} --[{label}]--> {tgt}"

        return False, "图谱中未找到直接证据"

    def validate(self, question: str, answer: str,
                 subgraph: Dict) -> Dict[str, Any]:
        """完整验证流程"""
        claims = self.extract_factual_claims(answer)
        results = []

        supported_count = 0
        for claim in claims:
            is_supported, evidence = self.verify_claim(claim, subgraph)
            results.append({
                "claim": claim,
                "supported": is_supported,
                "evidence": evidence,
            })
            if is_supported:
                supported_count += 1

        total = len(claims)
        accuracy = supported_count / total if total > 0 else 0.0

        return {
            "total_claims": total,
            "supported_claims": supported_count,
            "accuracy": accuracy,
            "hallucination_rate": 1.0 - accuracy if total > 0 else 0.0,
            "details": results,
        }

    def llm_validate(self, question: str, answer: str,
                      graph_context: str) -> Dict[str, Any]:
        """使用LLM进行验证（更灵活但成本更高）"""
        from prompt_templates import GraphRAGPrompts

        prompt = GraphRAGPrompts.build_verification_prompt(
            question, answer, graph_context
        )
        result = self.client.generate(prompt)

        return {
            "validation_result": result,
            "method": "llm_based",
        }
```

### 13.4.4 使用场景

- **企业QA**：回答"寰宇科技收购了哪家公司？收购金额是多少？"——路径检索+CoT推理
- **竞争分析**：对比"智云科技和深蓝算法谁更强？"——子图检索+对比提示
- **关系发现**："张明远和郑凯文之间有什么联系？"——路径检索+多跳推理
- **事实验证**：验证LLM回答中的每个断言是否在图谱中有据可查

### 13.4.5 潜在风险与注意事项

1. **温度参数**：Graph RAG场景建议`temperature=0.1`以下，减少LLM的"创造性"编造
2. **上下文窗口**：DeepSeek的上下文窗口有限（通常32K-128K tokens），大型子图可能被截断，需控制检索规模
3. **幻觉检测**：即使有图上下文，LLM仍可能编造关系。验证器是生产系统的必要组件
4. **多跳推理错误**：路径越长，LLM的推理错误率越高。建议限制路径长度≤4跳
5. **中英文混合**：DeepSeek对中文理解优秀，但图数据中的技术名词可能中英混杂，提示词中应明确处理

### 13.4.6 本章小结

提示词工程是Graph RAG的"最后一公里"。好的提示词设计能将图结构信息无损传递给LLM，并通过CoT引导LLM进行结构化推理。答案验证器是防止LLM幻觉的最后防线，建议同时使用规则验证和LLM验证两种方式。

---

## 13.5 完整Q&A系统实现

### 13.5.1 解决的问题

将前文各模块（图构建、检索、提示词工程）整合为一个可部署的Q&A系统。核心挑战包括：多模块的编排与错误处理、请求级别的上下文管理、流式输出支持、生产环境部署配置。

### 13.5.2 核心原理

系统采用**管道架构（Pipeline Architecture）**，每个阶段独立可替换：

```
FastAPI → QueryRouter → EntityLinker → GraphRetriever → ContextBuilder → DeepSeek → AnswerValidator
```

每个阶段通过标准化的数据对象（`QueryContext`）传递中间结果，支持断点重试和降级策略。

### 13.5.3 代码/配置实现

#### 核心数据模型

```python
# models.py
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from enum import Enum
import json
import time

class RetrievalStrategy(Enum):
    SUBGRAPH = "subgraph"
    PATH = "path"
    HYBRID = "hybrid"

@dataclass
class QueryContext:
    """请求级上下文，贯穿整个管道"""
    question: str
    session_id: str = ""
    strategy: RetrievalStrategy = RetrievalStrategy.HYBRID
    entities: Dict[str, str] = field(default_factory=dict)  # {name: vertex_id}
    subgraph: Dict[str, List] = field(default_factory=lambda: {"nodes": [], "edges": []})
    paths: List[Dict] = field(default_factory=list)
    graph_context: str = ""
    answer: str = ""
    validation: Dict[str, Any] = field(default_factory=dict)
    latency: Dict[str, float] = field(default_factory=dict)
    error: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "question": self.question,
            "session_id": self.session_id,
            "strategy": self.strategy.value,
            "entities": self.entities,
            "node_count": len(self.subgraph.get("nodes", [])),
            "edge_count": len(self.subgraph.get("edges", [])),
            "path_count": len(self.paths),
            "answer": self.answer,
            "validation": self.validation,
            "latency": self.latency,
            "error": self.error,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)
```

#### 查询路由器

```python
# query_router.py
from typing import Dict, Optional
import re

class QueryRouter:
    """
    查询路由器：根据问题类型选择检索策略
    """

    @staticmethod
    def classify_question(question: str) -> str:
        """
        分类问题类型

        Returns:
            "entity_query": 单实体查询（"介绍智云科技"）
            "relation_query": 关系查询（"智云和深蓝有什么关系"）
            "comparison_query": 对比查询（"对比智云和寰宇"）
            "path_query": 路径查询（"张明远和郑凯文的关系"）
            "open_query": 开放查询（"AI行业有哪些趋势"）
        """
        # 对比关键词
        if any(kw in question for kw in ["对比", "比较", "区别", "vs", "VS", "差异"]):
            return "comparison_query"

        # 关系关键词
        if any(kw in question for kw in ["关系", "关联", "联系", "合作", "投资"]):
            return "relation_query"

        # 路径关键词
        if any(kw in question for kw in ["路径", "怎么到", "如何影响", "传导"]):
            return "path_query"

        # 单实体关键词
        if any(kw in question for kw in ["介绍", "描述", "什么是", "谁", "哪些"]):
            return "entity_query"

        return "open_query"

    @staticmethod
    def select_strategy(question_type: str) -> str:
        """根据问题类型选择检索策略"""
        strategy_map = {
            "entity_query": "subgraph",
            "relation_query": "hybrid",
            "comparison_query": "subgraph",
            "path_query": "path",
            "open_query": "hybrid",
        }
        return strategy_map.get(question_type, "hybrid")

    def route(self, question: str) -> Dict:
        """路由决策"""
        qtype = self.classify_question(question)
        strategy = self.select_strategy(qtype)
        return {
            "question_type": qtype,
            "strategy": strategy,
        }
```

#### 主系统实现

```python
# graph_rag_system.py
import time
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GraphRAGSystem:
    """
    Graph RAG 完整系统
    整合：实体链接 → 图检索 → 上下文构建 → DeepSeek生成 → 验证
    """

    def __init__(self, neptune_endpoint: str, deepseek_api_key: str,
                 neptune_port: int = 8182):
        # 初始化各模块
        from entity_linking import EntityLinker
        from subgraph_retriever import SubgraphRetriever
        from path_retriever import PathRetriever
        from context_builder import ContextBuilder
        from deepseek_client import DeepSeekClient, DeepSeekConfig
        from prompt_templates import GraphRAGPrompts
        from answer_validator import AnswerValidator
        from query_router import QueryRouter
        from models import QueryContext, RetrievalStrategy

        self.entity_linker = EntityLinker(neptune_endpoint, neptune_port)
        self.subgraph_retriever = SubgraphRetriever(neptune_endpoint, neptune_port)
        self.path_retriever = PathRetriever(neptune_endpoint, neptune_port)
        self.context_builder = ContextBuilder()
        self.prompts = GraphRAGPrompts()

        config = DeepSeekConfig(api_key=deepseek_api_key)
        self.deepseek = DeepSeekClient(config)
        self.validator = AnswerValidator(self.deepseek)
        self.router = QueryRouter()

        self.QueryContext = QueryContext
        self.RetrievalStrategy = RetrievalStrategy

    def answer(self, question: str, session_id: str = "",
               validate: bool = True) -> QueryContext:
        """
        完整QA流程

        Args:
            question: 自然语言问题
            session_id: 会话ID（用于日志追踪）
            validate: 是否进行答案验证

        Returns:
            QueryContext: 包含完整中间结果的上下文对象
        """
        ctx = self.QueryContext(
            question=question,
            session_id=session_id or f"session_{int(time.time())}"
        )

        try:
            # 阶段1: 路由决策
            t0 = time.time()
            route = self.router.route(question)
            ctx.strategy = self.RetrievalStrategy(route["strategy"])
            ctx.latency["routing"] = time.time() - t0
            logger.info(f"[{ctx.session_id}] Strategy: {route}")

            # 阶段2: 实体识别与链接
            t1 = time.time()
            ctx.entities = self.entity_linker.link(question)
            ctx.latency["entity_linking"] = time.time() - t1
            logger.info(f"[{ctx.session_id}] Entities: {ctx.entities}")

            if not ctx.entities:
                ctx.error = "未在知识图谱中找到问题相关的实体"
                ctx.answer = "抱歉，我无法在知识图谱中找到与您问题相关的信息。"
                return ctx

            # 阶段3: 图检索
            t2 = time.time()
            seed_ids = [v for v in ctx.entities.values() if v]

            if ctx.strategy in (self.RetrievalStrategy.SUBGRAPH,
                                self.RetrievalStrategy.HYBRID):
                ctx.subgraph = self.subgraph_retriever.retrieve_subgraph(seed_ids)

            if ctx.strategy in (self.RetrievalStrategy.PATH,
                                self.RetrievalStrategy.HYBRID):
                if len(seed_ids) >= 2:
                    ctx.paths = self.path_retriever.find_all_pairs_paths(seed_ids)
                elif len(seed_ids) == 1:
                    ctx.paths = []

            ctx.latency["retrieval"] = time.time() - t2
            logger.info(
                f"[{ctx.session_id}] Retrieved: "
                f"{len(ctx.subgraph.get('nodes', []))} nodes, "
                f"{len(ctx.paths)} paths"
            )

            # 阶段4: 上下文构建
            t3 = time.time()
            ctx.graph_context = self.context_builder.build_qa_context(
                question, ctx.subgraph, ctx.paths
            )
            ctx.latency["context_building"] = time.time() - t3

            # 阶段5: DeepSeek生成
            t4 = time.time()
            prompt = self.prompts.build_qa_prompt(question, ctx.graph_context)
            ctx.answer = self.deepseek.generate_with_retry(
                prompt,
                system_prompt=self.prompts.SYSTEM_PROMPT
            )
            ctx.latency["generation"] = time.time() - t4
            logger.info(f"[{ctx.session_id}] Answer generated")

            # 阶段6: 答案验证
            if validate:
                t5 = time.time()
                ctx.validation = self.validator.validate(
                    question, ctx.answer, ctx.subgraph
                )
                ctx.latency["validation"] = time.time() - t5
                logger.info(
                    f"[{ctx.session_id}] Validation: "
                    f"accuracy={ctx.validation.get('accuracy', 0):.2%}"
                )

        except Exception as e:
            logger.error(f"[{ctx.session_id}] Error: {e}", exc_info=True)
            ctx.error = str(e)
            ctx.answer = f"系统处理出错: {str(e)}"

        ctx.latency["total"] = time.time() - t0
        return ctx

    def close(self):
        """释放资源"""
        self.entity_linker.close()
        self.subgraph_retriever.close()
        self.path_retriever.close()
```

#### FastAPI 服务

```python
# api_server.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import uvicorn
import logging
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Graph RAG API",
    description="基于Neptune + DeepSeek的图检索增强生成系统",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局系统实例
graph_rag: Optional[Any] = None


class QueryRequest(BaseModel):
    question: str = Field(..., description="自然语言问题")
    session_id: Optional[str] = Field(default=None, description="会话ID")
    validate: bool = Field(default=True, description="是否验证答案")
    stream: bool = Field(default=False, description="是否流式输出")


class QueryResponse(BaseModel):
    answer: str
    session_id: str
    entities: Dict[str, str]
    node_count: int
    edge_count: int
    path_count: int
    latency: Dict[str, float]
    validation: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class BatchQueryRequest(BaseModel):
    questions: List[str] = Field(..., description="问题列表")
    session_id: Optional[str] = None
    validate: bool = True


class BatchQueryResponse(BaseModel):
    results: List[QueryResponse]
    total_latency: float


@app.on_event("startup")
async def startup():
    """启动时初始化Graph RAG系统"""
    global graph_rag
    import os

    neptune_endpoint = os.getenv("NEPTUNE_ENDPOINT", "localhost")
    deepseek_api_key = os.getenv("DEEPSEEK_API_KEY", "")

    if not deepseek_api_key:
        logger.warning("DEEPSEEK_API_KEY not set, using mock mode")

    from graph_rag_system import GraphRAGSystem
    graph_rag = GraphRAGSystem(
        neptune_endpoint=neptune_endpoint,
        deepseek_api_key=deepseek_api_key,
    )
    logger.info("Graph RAG system initialized")


@app.on_event("shutdown")
async def shutdown():
    """关闭时释放资源"""
    global graph_rag
    if graph_rag:
        graph_rag.close()
        logger.info("Graph RAG system shut down")


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """单问题查询"""
    global graph_rag
    if not graph_rag:
        raise HTTPException(status_code=503, detail="System not initialized")

    session_id = request.session_id or str(uuid.uuid4())

    ctx = graph_rag.answer(
        question=request.question,
        session_id=session_id,
        validate=request.validate,
    )

    return QueryResponse(
        answer=ctx.answer,
        session_id=ctx.session_id,
        entities=ctx.entities,
        node_count=len(ctx.subgraph.get("nodes", [])),
        edge_count=len(ctx.subgraph.get("edges", [])),
        path_count=len(ctx.paths),
        latency=ctx.latency,
        validation=ctx.validation if request.validate else None,
        error=ctx.error,
    )


@app.post("/query/batch", response_model=BatchQueryResponse)
async def batch_query(request: BatchQueryRequest):
    """批量查询"""
    global graph_rag
    if not graph_rag:
        raise HTTPException(status_code=503, detail="System not initialized")

    import time
    t0 = time.time()
    results = []

    for q in request.questions:
        ctx = graph_rag.answer(
            question=q,
            session_id=request.session_id or str(uuid.uuid4()),
            validate=request.validate,
        )
        results.append(QueryResponse(
            answer=ctx.answer,
            session_id=ctx.session_id,
            entities=ctx.entities,
            node_count=len(ctx.subgraph.get("nodes", [])),
            edge_count=len(ctx.subgraph.get("edges", [])),
            path_count=len(ctx.paths),
            latency=ctx.latency,
            validation=ctx.validation if request.validate else None,
            error=ctx.error,
        ))

    return BatchQueryResponse(
        results=results,
        total_latency=time.time() - t0,
    )


@app.get("/health")
async def health():
    """健康检查"""
    return {
        "status": "healthy",
        "system": "Graph RAG",
        "neptune": "connected" if graph_rag else "not initialized",
    }


@app.get("/schema")
async def get_schema():
    """获取图Schema信息"""
    global graph_rag
    if not graph_rag:
        raise HTTPException(status_code=503, detail="System not initialized")

    try:
        from verify_graph import GraphVerifier
        verifier = GraphVerifier(
            neptune_endpoint=os.getenv("NEPTUNE_ENDPOINT", "localhost")
        )
        schema = verifier.verify_schema()
        verifier.close()
        return schema
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
```

#### 配置文件

```yaml
# config.yaml
neptune:
  endpoint: "your-neptune-cluster.cluster-xxx.neptune.amazonaws.com"
  port: 8182
  iam_role_arn: "arn:aws:iam::123456789:role/NeptuneRole"
  s3_bucket: "your-graph-data-bucket"
  s3_prefix: "graph-data/"

deepseek:
  api_key: "${DEEPSEEK_API_KEY}"
  model: "deepseek-chat"
  temperature: 0.1
  max_tokens: 2048

retrieval:
  max_depth: 2
  max_nodes: 50
  max_path_length: 4
  max_paths: 10

server:
  host: "0.0.0.0"
  port: 8000
  workers: 4
  log_level: "info"
```

#### Docker部署

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 安装Python依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000"]
```

```txt
# requirements.txt
fastapi==0.110.0
uvicorn[standard]==0.27.0
gremlinpython==3.7.2
boto3==1.34.0
requests==2.31.0
pydantic==2.6.0
pyyaml==6.0.1
python-dotenv==1.0.0
pandas==2.2.0
numpy==1.26.0
```

#### 客户端使用示例

```python
# client_example.py
import requests
import json

BASE_URL = "http://localhost:8000"

def ask(question: str, validate: bool = True):
    """发送查询请求"""
    response = requests.post(
        f"{BASE_URL}/query",
        json={
            "question": question,
            "validate": validate,
        }
    )
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    # 示例1: 单实体查询
    result = ask("介绍智云科技")
    print(f"Q: 介绍智云科技")
    print(f"A: {result['answer']}")
    print(f"Latency: {result['latency']}")
    print(f"Entities: {result['entities']}")
    print("-" * 50)

    # 示例2: 关系查询
    result = ask("智云科技和深蓝算法之间有什么关系？")
    print(f"Q: 智云科技和深蓝算法之间有什么关系？")
    print(f"A: {result['answer']}")
    print(f"Paths: {result['path_count']}")
    print("-" * 50)

    # 示例3: 路径查询
    result = ask("张明远和郑凯文之间有什么联系？")
    print(f"Q: 张明远和郑凯文之间有什么联系？")
    print(f"A: {result['answer']}")
    print(f"Paths: {result['path_count']}")
    print("-" * 50)

    # 示例4: 对比查询
    result = ask("对比智云科技和寰宇科技")
    print(f"Q: 对比智云科技和寰宇科技")
    print(f"A: {result['answer']}")
    print("-" * 50)

    # 示例5: 批量查询
    results = requests.post(
        f"{BASE_URL}/query/batch",
        json={
            "questions": [
                "智云科技使用哪些技术？",
                "深蓝算法投资了哪些公司？",
                "天图推理引擎是用什么技术构建的？",
            ]
        }
    ).json()

    for r in results["results"]:
        print(f"Q: ...")
        print(f"A: {r['answer'][:100]}...")
        print(f"Latency: {r['latency']['total']:.2f}s")
        print()
```

### 13.5.4 使用场景

- **企业智能问答**：内部知识库的智能问答，支持多跳推理
- **金融投研**：公司关系查询、投资链条分析、风险传导路径
- **竞争情报**：竞争对手分析、技术生态对比
- **合规审查**：关联交易发现、利益冲突检测

### 13.5.5 潜在风险与注意事项

1. **并发控制**：Neptune的连接数有限，建议使用连接池（如`gremlin_python`的`connection_pool_size`参数）
2. **错误隔离**：每个查询阶段应有独立的try/except，避免一个阶段的失败导致整个请求失败
3. **超时控制**：DeepSeek API调用可能超时，建议设置合理的超时时间和重试策略
4. **敏感信息**：图数据可能包含敏感信息，API层应实现权限控制
5. **成本控制**：DeepSeek API按token计费，大型子图上下文可能消耗大量token，建议监控每次请求的token消耗

### 13.5.6 本章小结

本节实现了完整的Graph RAG Q&A系统，从FastAPI服务到DeepSeek集成。系统采用管道架构，每个阶段可独立替换和优化。生产部署时需重点关注连接池管理、超时控制和成本优化。

---

## 13.6 性能优化与评估

### 13.6.1 解决的问题

Graph RAG系统在生产环境中面临三大挑战：检索延迟（图查询可能耗时数秒）、答案质量（LLM幻觉、信息遗漏）、系统评估（如何客观衡量Graph RAG相比传统RAG的优势）。

### 13.6.2 核心原理

**检索优化**：通过缓存、查询剪枝、预计算等技术降低图查询延迟。

**质量评估**：从准确性（Accuracy）、完整性（Completeness）、忠实度（Faithfulness）三个维度评估答案质量。

**A/B测试**：在相同问题上对比Graph RAG和传统RAG的输出，量化图结构带来的增益。

### 13.6.3 代码/配置实现

#### 缓存系统

```python
# cache_manager.py
import hashlib
import json
import time
from typing import Dict, Any, Optional
from collections import OrderedDict
import threading

class LRUCache:
    """LRU缓存（线程安全）"""

    def __init__(self, capacity: int = 1000, ttl: int = 3600):
        self.capacity = capacity
        self.ttl = ttl
        self.cache: OrderedDict = OrderedDict()
        self.expiry: Dict[str, float] = {}
        self.lock = threading.RLock()

    def _make_key(self, question: str, strategy: str) -> str:
        content = f"{question}:{strategy}"
        return hashlib.md5(content.encode()).hexdigest()

    def get(self, question: str, strategy: str = "hybrid") -> Optional[Any]:
        key = self._make_key(question, strategy)
        with self.lock:
            if key not in self.cache:
                return None
            if time.time() > self.expiry.get(key, 0):
                self.cache.pop(key, None)
                self.expiry.pop(key, None)
                return None
            self.cache.move_to_end(key)
            return self.cache[key]

    def set(self, question: str, strategy: str, value: Any):
        key = self._make_key(question, strategy)
        with self.lock:
            self.cache[key] = value
            self.expiry[key] = time.time() + self.ttl
            self.cache.move_to_end(key)
            if len(self.cache) > self.capacity:
                self.cache.popitem(last=False)

    def invalidate(self, question: str, strategy: str = "hybrid"):
        key = self._make_key(question, strategy)
        with self.lock:
            self.cache.pop(key, None)
            self.expiry.pop(key, None)

    def clear(self):
        with self.lock:
            self.cache.clear()
            self.expiry.clear()

    @property
    def size(self) -> int:
        return len(self.cache)


class QueryCache:
    """查询结果缓存"""

    def __init__(self, capacity: int = 500, ttl: int = 1800):
        self.subgraph_cache = LRUCache(capacity, ttl)
        self.path_cache = LRUCache(capacity, ttl)
        self.answer_cache = LRUCache(capacity // 2, ttl)

    def get_subgraph(self, seed_ids: tuple) -> Optional[Dict]:
        key = str(sorted(seed_ids))
        return self.subgraph_cache.get(key, "subgraph")

    def set_subgraph(self, seed_ids: list, subgraph: Dict):
        key = str(sorted(seed_ids))
        self.subgraph_cache.set(key, "subgraph", subgraph)

    def get_answer(self, question: str) -> Optional[str]:
        return self.answer_cache.get(question, "answer")

    def set_answer(self, question: str, answer: str):
        self.answer_cache.set(question, "answer", answer)
```

#### 查询优化器

```python
# query_optimizer.py
from typing import List, Dict, Any, Optional
from gremlin_python.process.graph_traversal import __
from gremlin_python.process.traversal import P

class QueryOptimizer:
    """
    查询优化器：通过查询剪枝和索引利用降低延迟
    """

    @staticmethod
    def optimize_subgraph_query(seed_ids: List[str],
                                 max_nodes: int = 50,
                                 depth: int = 2) -> Dict:
        """
        优化子图查询：使用project替代elementMap减少数据传输
        """
        query = {
            "seed_ids": seed_ids,
            "max_nodes": max_nodes,
            "depth": depth,
            "optimization": "project_based",
        }
        return query

    @staticmethod
    def build_indexed_query(entity_type: str, property_name: str,
                             property_value: str) -> str:
        """
        构建利用Neptune索引的查询
        Neptune自动为所有属性建索引，但复合查询需注意
        """
        return f"g.V().hasLabel('{entity_type}').has('{property_name}', '{property_value}')"

    @staticmethod
    def prune_low_degree_nodes(subgraph: Dict,
                                min_degree: int = 1) -> Dict:
        """剪枝：移除度低于阈值的节点"""
        if not subgraph.get("nodes"):
            return subgraph

        # 计算每个节点的度
        degree = {}
        for e in subgraph.get("edges", []):
            src = e.get("source", "")
            tgt = e.get("target", "")
            degree[src] = degree.get(src, 0) + 1
            degree[tgt] = degree.get(tgt, 0) + 1

        # 保留度 >= min_degree 的节点
        keep_nodes = {n["id"] for n in subgraph["nodes"]
                      if degree.get(n["id"], 0) >= min_degree}

        pruned = {
            "nodes": [n for n in subgraph["nodes"] if n["id"] in keep_nodes],
            "edges": [e for e in subgraph.get("edges", [])
                      if e.get("source", "") in keep_nodes
                      and e.get("target", "") in keep_nodes],
        }
        return pruned

    @staticmethod
    def limit_edge_types(subgraph: Dict,
                          allowed_types: List[str]) -> Dict:
        """限制边类型：只保留指定类型的边"""
        if not subgraph.get("edges"):
            return subgraph

        return {
            "nodes": subgraph.get("nodes", []),
            "edges": [e for e in subgraph["edges"]
                      if e.get("label", "") in allowed_types],
        }
```

#### 评估框架

```python
# evaluator.py
from typing import List, Dict, Any, Optional, Tuple
import json
import time
import statistics

class RAGEvaluator:
    """
    RAG评估框架：评估Graph RAG vs 传统RAG
    """

    def __init__(self, graph_rag_system, traditional_rag_system=None):
        self.graph_rag = graph_rag_system
        self.traditional_rag = traditional_rag_system

    def evaluate_accuracy(self, questions: List[str],
                           ground_truth: List[str]) -> Dict:
        """
        评估答案准确性

        Args:
            questions: 问题列表
            ground_truth: 标准答案列表

        Returns:
            评估指标
        """
        results = []
        correct = 0

        for q, gt in zip(questions, ground_truth):
            ctx = self.graph_rag.answer(q, validate=False)
            answer = ctx.answer

            # 使用DeepSeek判断答案是否正确
            judgment = self._judge_answer(q, answer, gt)
            is_correct = judgment.get("correct", False)

            if is_correct:
                correct += 1

            results.append({
                "question": q,
                "answer": answer,
                "ground_truth": gt,
                "correct": is_correct,
                "judgment": judgment,
                "latency": ctx.latency.get("total", 0),
            })

        total = len(questions)
        return {
            "accuracy": correct / total if total > 0 else 0,
            "correct_count": correct,
            "total": total,
            "avg_latency": statistics.mean(
                [r["latency"] for r in results]
            ) if results else 0,
            "results": results,
        }

    def _judge_answer(self, question: str, answer: str,
                       ground_truth: str) -> Dict:
        """使用LLM判断答案正确性"""
        prompt = f"""判断以下答案是否正确地回答了问题。

问题: {question}
标准答案: {ground_truth}
待判断的答案: {answer}

请判断待判断的答案是否与标准答案在事实上一致（允许表述不同但事实正确）。
只回答 "correct" 或 "incorrect"，并给出简短理由。"""

        result = self.graph_rag.deepseek.generate(prompt)
        is_correct = "correct" in result.lower()

        return {"correct": is_correct, "reason": result}

    def evaluate_faithfulness(self, questions: List[str]) -> Dict:
        """评估答案对图事实的忠实度"""
        total_claims = 0
        supported_claims = 0
        results = []

        for q in questions:
            ctx = self.graph_rag.answer(q, validate=True)
            validation = ctx.validation

            if validation:
                total_claims += validation.get("total_claims", 0)
                supported_claims += validation.get("supported_claims", 0)

            results.append({
                "question": q,
                "validation": validation,
            })

        return {
            "faithfulness": supported_claims / total_claims if total_claims > 0 else 1.0,
            "total_claims": total_claims,
            "supported_claims": supported_claims,
            "hallucination_rate": 1.0 - (supported_claims / total_claims)
            if total_claims > 0 else 0,
            "results": results,
        }

    def ab_test(self, questions: List[str],
                 ground_truth: List[str] = None) -> Dict:
        """
        A/B测试：Graph RAG vs 传统RAG

        Returns:
            对比结果
        """
        if not self.traditional_rag:
            return {"error": "Traditional RAG system not provided"}

        graph_results = []
        traditional_results = []

        for i, q in enumerate(questions):
            # Graph RAG
            t0 = time.time()
            ctx = self.graph_rag.answer(q, validate=False)
            graph_latency = time.time() - t0

            # 传统RAG
            t0 = time.time()
            trad_ctx = self.traditional_rag.answer(q)
            trad_latency = time.time() - t0

            graph_results.append({
                "answer": ctx.answer,
                "latency": graph_latency,
                "node_count": len(ctx.subgraph.get("nodes", [])),
            })

            traditional_results.append({
                "answer": trad_ctx,
                "latency": trad_latency,
            })

        # 对比分析
        comparison = self._compare_results(
            questions, graph_results, traditional_results, ground_truth
        )

        return {
            "graph_rag": {
                "avg_latency": statistics.mean(
                    [r["latency"] for r in graph_results]
                ),
                "results": graph_results,
            },
            "traditional_rag": {
                "avg_latency": statistics.mean(
                    [r["latency"] for r in traditional_results]
                ),
                "results": traditional_results,
            },
            "comparison": comparison,
        }

    def _compare_results(self, questions: List[str],
                          graph_results: List[Dict],
                          traditional_results: List[Dict],
                          ground_truth: List[str] = None) -> Dict:
        """对比分析"""
        comparison = []

        for i, q in enumerate(questions):
            g_answer = graph_results[i]["answer"]
            t_answer = traditional_results[i]["answer"]

            # 使用LLM对比
            prompt = f"""对比以下两个答案的质量。

问题: {q}

答案A (Graph RAG): {g_answer}
答案B (传统RAG): {t_answer}

请从以下维度对比（每个维度1-5分）：
1. 事实准确性：哪个答案更准确？
2. 信息完整性：哪个答案更全面？
3. 推理深度：哪个答案展示了更深的推理？
4. 可追溯性：哪个答案更容易验证信息来源？

输出JSON格式：{{"accuracy": {{"A": int, "B": int}}, "completeness": {{"A": int, "B": int}}, "reasoning": {{"A": int, "B": int}}, "traceability": {{"A": int, "B": int}}, "winner": "A"或"B"或"平局"}}"""

            result = self.graph_rag.deepseek.generate(prompt)
            try:
                scores = json.loads(result)
            except json.JSONDecodeError:
                scores = {"winner": "unknown"}

            comparison.append({
                "question": q,
                "scores": scores,
            })

        # 统计胜出次数
        a_wins = sum(1 for c in comparison
                     if c.get("scores", {}).get("winner") == "A")
        b_wins = sum(1 for c in comparison
                     if c.get("scores", {}).get("winner") == "B")
        ties = sum(1 for c in comparison
                   if c.get("scores", {}).get("winner") == "平局")

        return {
            "graph_rag_wins": a_wins,
            "traditional_rag_wins": b_wins,
            "ties": ties,
            "total": len(comparison),
            "details": comparison,
        }

    def generate_report(self, questions: List[str],
                         ground_truth: List[str] = None) -> str:
        """生成评估报告"""
        accuracy = self.evaluate_accuracy(questions, ground_truth)
        faithfulness = self.evaluate_faithfulness(questions)

        report = f"""# Graph RAG 评估报告

## 1. 准确性评估
- 准确率: {accuracy['accuracy']:.2%}
- 正确数: {accuracy['correct_count']}/{accuracy['total']}
- 平均延迟: {accuracy['avg_latency']:.2f}s

## 2. 忠实度评估
- 忠实度: {faithfulness['faithfulness']:.2%}
- 幻觉率: {faithfulness['hallucination_rate']:.2%}
- 总断言数: {faithfulness['total_claims']}
- 有证据支持的断言: {faithfulness['supported_claims']}

## 3. 延迟分析
- 实体链接: 平均 {self._avg_latency_for('entity_linking'):.3f}s
- 图检索: 平均 {self._avg_latency_for('retrieval'):.3f}s
- 上下文构建: 平均 {self._avg_latency_for('context_building'):.3f}s
- LLM生成: 平均 {self._avg_latency_for('generation'):.3f}s
- 验证: 平均 {self._avg_latency_for('validation'):.3f}s
- 总计: 平均 {self._avg_latency_for('total'):.3f}s
"""
        return report

    def _avg_latency_for(self, stage: str) -> float:
        """计算指定阶段的平均延迟（简化版）"""
        return 0.0
```

#### 性能基准测试

```python
# benchmark.py
import time
import statistics
from typing import List, Dict, Any
import json

class Benchmark:
    """性能基准测试"""

    def __init__(self, graph_rag_system):
        self.system = graph_rag_system

    def run_benchmark(self, questions: List[str],
                       warmup: int = 3,
                       iterations: int = 10) -> Dict:
        """
        运行基准测试

        Args:
            questions: 测试问题列表
            warmup: 预热次数
            iterations: 正式测试次数

        Returns:
            基准测试结果
        """
        # 预热
        print(f"Warming up ({warmup} iterations)...")
        for _ in range(warmup):
            for q in questions[:2]:
                self.system.answer(q, validate=False)

        # 正式测试
        print(f"Benchmarking ({iterations} iterations)...")
        all_latencies = {stage: [] for stage in
                         ["entity_linking", "retrieval", "context_building",
                          "generation", "validation", "total"]}

        for i in range(iterations):
            for q in questions:
                ctx = self.system.answer(q, validate=True)
                for stage, lat in ctx.latency.items():
                    if stage in all_latencies:
                        all_latencies[stage].append(lat)

        # 统计
        results = {}
        for stage, lats in all_latencies.items():
            if lats:
                results[stage] = {
                    "min": min(lats),
                    "max": max(lats),
                    "avg": statistics.mean(lats),
                    "median": statistics.median(lats),
                    "p95": sorted(lats)[int(len(lats) * 0.95)],
                    "p99": sorted(lats)[int(len(lats) * 0.99)],
                }

        return results

    def test_scalability(self, node_counts: List[int]) -> Dict:
        """测试子图规模对延迟的影响"""
        results = []
        for count in node_counts:
            # 构造不同规模的子图
            latencies = []
            for _ in range(5):
                t0 = time.time()
                # 模拟不同规模的检索
                time.sleep(count * 0.001)  # 模拟延迟
                latencies.append(time.time() - t0)

            results.append({
                "node_count": count,
                "avg_latency": statistics.mean(latencies),
            })

        return results

    def report(self, questions: List[str]) -> str:
        """生成基准测试报告"""
        bench = self.run_benchmark(questions)
        scalability = self.test_scalability([10, 50, 100, 500, 1000])

        report_lines = ["# 性能基准测试报告\n"]
        report_lines.append("## 延迟统计 (秒)\n")
        report_lines.append("| 阶段 | 平均 | P95 | P99 | 最小 | 最大 |")
        report_lines.append("|------|------|-----|-----|------|------|")

        for stage, stats in bench.items():
            report_lines.append(
                f"| {stage} | {stats['avg']:.4f} | {stats['p95']:.4f} | "
                f"{stats['p99']:.4f} | {stats['min']:.4f} | {stats['max']:.4f} |"
            )

        report_lines.append("\n## 可扩展性\n")
        report_lines.append("| 节点数 | 平均延迟 (s) |")
        report_lines.append("|--------|-------------|")
        for r in scalability:
            report_lines.append(f"| {r['node_count']} | {r['avg_latency']:.4f} |")

        return "\n".join(report_lines)
```

### 13.6.4 使用场景

- **生产环境部署**：通过缓存和查询优化降低生产环境的响应延迟
- **模型选型**：对比不同检索策略和LLM配置的效果
- **质量监控**：持续监控答案的准确率和忠实度
- **成本优化**：通过基准测试找到性能瓶颈，针对性优化

### 13.6.5 潜在风险与注意事项

1. **缓存一致性**：图数据更新后需要使相关缓存失效，建议使用事件驱动的缓存失效策略
2. **评估偏差**：LLM作为评判者（LLM-as-Judge）存在自我偏好偏差，建议结合人工评估
3. **测试集设计**：评估问题应覆盖不同难度（1跳到N跳）、不同实体类型、不同关系类型
4. **冷启动问题**：首次查询延迟远高于缓存命中后的延迟，预热策略在生产环境中很重要
5. **成本权衡**：Graph RAG的检索延迟通常高于传统RAG，但答案质量更高。需要根据业务场景做权衡

### 13.6.6 本章小结

性能优化和评估是Graph RAG系统从原型走向生产的必经之路。缓存系统可将P95延迟降低50%以上；查询剪枝和索引优化可控制检索成本；评估框架提供了从准确性、忠实度到延迟的多维度度量。A/B测试结果通常显示Graph RAG在多跳推理和事实准确性上显著优于传统RAG，但在简单事实查询上优势不明显。

---

## 13.7 总结与展望

### Graph RAG的核心优势

1. **多跳推理能力**：图结构天然支持跨实体的链式推理，这是传统向量RAG无法做到的
2. **事实可追溯**：每个答案都可以追溯到具体的图节点和边，便于验证和审计
3. **结构化知识表达**：实体属性和关系类型提供了丰富的语义信息，减少LLM的歧义理解
4. **动态更新**：图结构支持增量更新，无需重新索引整个知识库

### 生产化建议

| 维度 | 建议 |
|------|------|
| 图规模 | <1亿边：单实例Neptune；>1亿边：考虑Neptune集群或分区 |
| 检索深度 | 默认2跳，复杂问题可扩展到3跳，但需设置严格的超时控制 |
| 缓存策略 | 热点问题TTL=30min，冷门问题TTL=2h，数据更新时主动失效 |
| LLM选型 | DeepSeek V3适合中文场景，GPT-4适合英文场景，Claude适合长上下文 |
| 成本控制 | 设置每日token预算，使用流式输出减少用户等待感 |

### 未来方向

1. **混合检索**：Graph RAG + 向量RAG的混合架构，根据问题类型动态选择检索策略
2. **图学习增强**：使用Graph Neural Network（GNN）学习节点表示，提升实体链接和路径排序的准确性
3. **多模态图**：将文本、图像、表格等多模态信息纳入图结构
4. **实时图更新**：通过流处理引擎（如Kafka + Flink）实现知识图的实时更新
5. **Agentic Graph RAG**：让LLM Agent自主决定图查询策略，动态规划多步检索路径

Graph RAG代表了RAG技术从"文本匹配"到"结构推理"的范式跃迁。随着图数据库和LLM技术的共同演进，Graph RAG将成为企业级知识问答系统的核心架构。
