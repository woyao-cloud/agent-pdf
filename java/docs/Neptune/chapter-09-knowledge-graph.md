# 第9章 基于 Neptune 的知识图谱构建

知识图谱（Knowledge Graph, KG）以图结构组织实体与关系，是语义搜索、推荐系统、风险控制等场景的核心基础设施。Amazon Neptune 作为托管图数据库，同时支持属性图（Gremlin）与 RDF（SPARQL）两种模型，为知识图谱的存储、推理与查询提供了统一平台。本章从数据模型、实体识别、知识融合、推理查询到质量保障，完整覆盖基于 Neptune 的企业级知识图谱构建全流程。

---

## 9.1 知识图谱数据模型

### 9.1.1 解决的问题

知识图谱的数据模型决定了"实体如何表示、关系如何建模、属性如何存储"。选型错误会导致查询效率低下、语义丢失或扩展困难。Neptune 同时支持两种图模型，理解其差异是构建知识图谱的第一步。

### 9.1.2 核心原理

**属性图模型（Property Graph）** 以顶点（Vertex）和边（Edge）为核心：
- 顶点通过标签（Label）表示实体类型，如 `Person`、`Company`
- 边通过标签表示关系类型，如 `worksFor`、`founded`
- 顶点和边均可附加键值对属性

**RDF 模型（Resource Description Framework）** 以三元组（Subject-Predicate-Object）为核心：
- 每个三元组是一个陈述，如 `<Alice> <worksFor> <AcmeCorp>`
- 使用 IRI 作为全局唯一标识
- 支持 RDFS/OWL 本体推理

两种模型的对比如下：

| 维度 | 属性图（Gremlin） | RDF（SPARQL） |
|------|------------------|---------------|
| 实体标识 | 顶点 ID（内部生成或自定义） | IRI（全局唯一） |
| 类型系统 | 顶点/边标签 | rdf:type + 类层次 |
| 属性 | 键值对，支持嵌套 | 字面量三元组 |
| 推理能力 | 需应用层实现 | 内置 RDFS/OWL 推理 |
| 互操作性 | 较低 | W3C 标准，跨系统 |
| 查询语言 | Gremlin（遍历式） | SPARQL（模式匹配） |

### 9.1.3 代码/配置实现

**属性图模式定义示例（Gremlin 顶点/边标签）：**

```groovy
// 创建实体类型（通过标签隐式定义）
g.addV('Person').property('name', 'Alice')
g.addV('Company').property('name', 'AcmeCorp')
g.addV('Patent').property('id', 'US-2024001')

// 创建关系
g.V().has('Person','name','Alice').as('a')
 .V().has('Company','name','AcmeCorp').as('b')
 .addE('worksFor').from('a').to('b')
 .property('since', 2020)

g.V().has('Person','name','Alice').as('a')
 .V().has('Patent','id','US-2024001').as('p')
 .addE('invented').from('a').to('p')
```

**RDF 模式定义示例（Turtle 格式）：**

```turtle
@prefix ex: <http://example.org/kg/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

# 定义类层次
ex:Person rdf:type rdfs:Class .
ex:Company rdf:type rdfs:Class .
ex:Patent rdf:type rdfs:Class .
ex:Employee rdf:type rdfs:Class ;
    rdfs:subClassOf ex:Person .

# 定义属性
ex:worksFor rdf:type rdf:Property ;
    rdfs:domain ex:Person ;
    rdfs:range ex:Company .

ex:invented rdf:type rdf:Property ;
    rdfs:domain ex:Person ;
    rdfs:range ex:Patent .

# 实例数据
ex:Alice rdf:type ex:Employee ;
    ex:name "Alice" ;
    ex:worksFor ex:AcmeCorp .

ex:AcmeCorp rdf:type ex:Company ;
    ex:name "AcmeCorp" .
```

### 9.1.4 使用场景

- **属性图**适合：社交网络分析、实时推荐、欺诈检测（需要低延迟遍历）
- **RDF**适合：开放数据集成、跨组织知识共享、需要本体推理的场景
- **混合策略**：核心知识用 RDF 保证互操作性，应用层用属性图加速查询

### 9.1.5 潜在风险与注意事项

- 属性图缺乏标准模式约束，容易产生不一致的标签命名
- RDF 的 IRI 管理成本高，需要维护前缀映射
- Neptune 不支持在同一实例中跨模型查询（Gremlin 与 SPARQL 不能混合）
- 属性图的边不能指向边，多跳关系需用中间顶点建模

### 9.1.6 本章小结

属性图与 RDF 各有适用场景。企业知识图谱建议以 RDF 作为规范层存储本体与核心数据，以属性图作为查询加速层。Neptune 的双模型支持使这种分层架构成为可能，但需要在设计阶段明确边界。

---

## 9.2 实体识别与关系抽取

### 9.2.1 解决的问题

非结构化文本（文档、新闻、专利）中蕴含大量实体与关系，人工标注成本极高。需要自动化流水线从文本中抽取实体（命名实体识别，NER）和实体间关系（Relation Extraction, RE），并将其转化为图结构存入 Neptune。

### 9.2.2 核心原理

**NER 流水线**通常包含以下步骤：
1. 文本预处理（分句、分词）
2. 实体边界检测与分类（PER、ORG、GPE 等）
3. 实体归一化（别名映射到标准名称）
4. 实体链接（链接到知识库已有实体）

**关系抽取**策略：
- **模式匹配**：基于依存句法或正则模板，精度高但召回低
- **远程监督**：利用已有知识库自动标注训练数据
- **端到端模型**：BERT-based 联合模型同时预测实体与关系

### 9.2.3 代码/配置实现

**基于 spaCy 的 NER 流水线：**

```python
import spacy
from typing import List, Dict

nlp = spacy.load("en_core_web_lg")

def extract_entities(text: str) -> List[Dict]:
    doc = nlp(text)
    entities = []
    for ent in doc.ents:
        entities.append({
            "text": ent.text,
            "label": ent.label_,
            "start": ent.start_char,
            "end": ent.end_char
        })
    return entities

# 基于依存句法的关系抽取
def extract_relations(text: str) -> List[Dict]:
    doc = nlp(text)
    relations = []
    for token in doc:
        # 检测 "X founded Y" 模式
        if token.lemma_ == "found" and token.dep_ == "ROOT":
            subj = None
            obj = None
            for child in token.children:
                if child.dep_ in ("nsubj", "nsubjpass"):
                    subj = child.text
                elif child.dep_ == "dobj":
                    obj = child.text
            if subj and obj:
                relations.append({
                    "subject": subj,
                    "predicate": "founded",
                    "object": obj
                })
    return relations

text = "Alice Johnson founded AcmeCorp in 2020. She invented US-2024001."
print(extract_entities(text))
# [{"text": "Alice Johnson", "label": "PERSON", ...},
#  {"text": "AcmeCorp", "label": "ORG", ...},
#  {"text": "2020", "label": "DATE", ...}]

print(extract_relations(text))
# [{"subject": "Alice Johnson", "predicate": "founded", "object": "AcmeCorp"}]
```

**基于 BERT 的联合抽取（使用 HuggingFace Transformers）：**

```python
from transformers import AutoTokenizer, AutoModelForTokenClassification
import torch

model_name = "dslim/bert-base-NER"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForTokenClassification.from_pretrained(model_name)

def bert_ner(text: str) -> List[Dict]:
    inputs = tokenizer(text, return_tensors="pt", truncation=True)
    outputs = model(**inputs)
    predictions = torch.argmax(outputs.logits, dim=2)[0]
    id2label = model.config.id2label

    entities = []
    current_entity = None
    tokens = tokenizer.convert_ids_to_tokens(inputs["input_ids"][0])

    for i, (token, pred) in enumerate(zip(tokens, predictions)):
        label = id2label[pred.item()]
        if label.startswith("B-"):
            if current_entity:
                entities.append(current_entity)
            current_entity = {"text": token, "label": label[2:]}
        elif label.startswith("I-") and current_entity:
            current_entity["text"] += token.replace("##", "")
        else:
            if current_entity:
                entities.append(current_entity)
                current_entity = None

    if current_entity:
        entities.append(current_entity)
    return entities
```

**集成 AWS Comprehend 进行实体抽取：**

```python
import boto3
import json

comprehend = boto3.client("comprehend", region_name="us-east-1")

def comprehend_ner(text: str) -> List[Dict]:
    response = comprehend.detect_entities(Text=text, LanguageCode="en")
    entities = []
    for ent in response["Entities"]:
        entities.append({
            "text": ent["Text"],
            "type": ent["Type"],
            "score": ent["Score"]
        })
    return entities

# 使用 Comprehend 的关系检测（通过 Syntax API + 规则）
def comprehend_relations(text: str) -> List[Dict]:
    syntax = comprehend.detect_syntax(Text=text, LanguageCode="en")
    tokens = syntax["SyntaxTokens"]
    relations = []
    # 简单规则：检测 "VERB -> founded/acquired/invented" 模式
    for i, tok in enumerate(tokens):
        if tok["PartOfSpeech"]["Tag"] == "VERB" and \
           tok["Text"].lower() in ("founded", "acquired", "invented"):
            subj = tokens[i-1]["Text"] if i > 0 else None
            obj = tokens[i+1]["Text"] if i < len(tokens)-1 else None
            if subj and obj:
                relations.append({
                    "subject": subj,
                    "predicate": tok["Text"].lower(),
                    "object": obj
                })
    return relations
```

**将抽取结果写入 Neptune（Gremlin）：**

```python
from gremlin_python.driver import client as gremlin_client

def load_entities_to_neptune(entities: List[Dict], relations: List[Dict]):
    cli = gremlin_client.Client(
        "wss://your-neptune-endpoint:8182/gremlin", "g"
    )

    for ent in entities:
        label_map = {"PERSON": "Person", "ORG": "Company", "GPE": "Location"}
        label = label_map.get(ent["type"], "Entity")
        query = f"g.addV('{label}').property('name', '{ent['text']}')"
        cli.submit(query).all().result()

    for rel in relations:
        pred_map = {"founded": "founded", "acquired": "acquired", "invented": "invented"}
        edge_label = pred_map.get(rel["predicate"], "relatedTo")
        query = (
            f"g.V().has('name','{rel['subject']}').as('s')"
            f".V().has('name','{rel['object']}').as('o')"
            f".addE('{edge_label}').from('s').to('o')"
        )
        cli.submit(query).all().result()

    cli.close()
```

### 9.2.4 使用场景

- **专利分析**：从专利文本中抽取发明人、公司、技术分类
- **金融文档**：从财报中抽取公司、高管、交易事件
- **医疗文献**：从论文中抽取药物、疾病、基因关系
- **新闻监控**：实时抽取事件实体与关系，更新知识图谱

### 9.2.5 潜在风险与注意事项

- spaCy 的 NER 模型在特定领域（如专利、医疗）准确率下降，需要微调
- Comprehend 的实体类型有限（PERSON、ORG、LOCATION 等），自定义类型需用自定义实体识别
- 关系抽取的精度-召回权衡：模式匹配精度高但覆盖率低，模型方法相反
- 抽取结果应经过人工审核或置信度阈值过滤后再写入知识图谱
- 大规模文本处理建议使用 AWS Step Functions 编排批处理流水线

### 9.2.6 本章小结

实体识别与关系抽取是知识图谱构建的数据入口。spaCy 提供轻量级本地 NER，BERT 模型提供更高精度，AWS Comprehend 提供托管服务免运维。生产环境建议组合使用：Comprehend 做粗筛，领域微调模型做精排，规则引擎做关系验证。

---

## 9.3 知识融合与对齐

### 9.3.1 解决的问题

多源数据中同一实体存在不同名称、不同属性、甚至矛盾信息。例如"Alice Johnson"与"A. Johnson"可能指向同一人，"AcmeCorp"与"Acme Corporation"指向同一公司。知识融合的目标是消除冗余、对齐异构数据、解决冲突。

### 9.3.2 核心原理

**实体解析（Entity Resolution）** 的核心步骤：
1. **阻塞（Blocking）**：通过粗粒度键（如首字母、年份）缩小候选对
2. **相似度计算**：编辑距离、Jaccard、余弦相似度、嵌入向量距离
3. **分类决策**：阈值判定、监督学习、聚类算法
4. **合并策略**：合并顶点、添加 sameAs 边、建立引用

**属性对齐** 解决不同源中属性名不一致问题（如 `birthDate` vs `dob`），通常基于模式匹配或语义映射。

**冲突解决** 策略：
- 多数投票（多源一致时采用）
- 来源优先级（权威源优先）
- 时间戳优先（最新数据优先）
- 置信度加权

### 9.3.3 代码/配置实现

**基于 Python 的实体解析流水线：**

```python
import numpy as np
from rapidfuzz import fuzz
from itertools import product

class EntityResolver:
    def __init__(self, threshold=0.85):
        self.threshold = threshold

    def block(self, entities, key_func):
        """基于阻塞键分组"""
        blocks = {}
        for ent in entities:
            key = key_func(ent)
            if key not in blocks:
                blocks[key] = []
            blocks[key].append(ent)
        return blocks

    def compare_names(self, name1, name2):
        """多维度名称相似度"""
        # 精确匹配
        if name1.lower() == name2.lower():
            return 1.0
        # 编辑距离
        ratio = fuzz.ratio(name1, name2) / 100.0
        # 部分匹配（如 "AcmeCorp" vs "Acme Corporation"）
        partial = fuzz.partial_ratio(name1, name2) / 100.0
        # Token 排序匹配
        token_sort = fuzz.token_sort_ratio(name1, name2) / 100.0
        return max(ratio, partial, token_sort)

    def resolve(self, entities):
        """执行实体解析，返回 sameAs 对"""
        # 按首字母阻塞
        blocks = self.block(entities, lambda e: e["name"][0].upper())
        same_as_pairs = []

        for key, group in blocks.items():
            for a, b in product(group, repeat=2):
                if id(a) >= id(b):
                    continue
                sim = self.compare_names(a["name"], b["name"])
                if sim >= self.threshold:
                    same_as_pairs.append((a, b, sim))

        return same_as_pairs

# 示例
entities = [
    {"id": "1", "name": "Alice Johnson", "source": "patent_db"},
    {"id": "2", "name": "A. Johnson", "source": "news_articles"},
    {"id": "3", "name": "Alice J.", "source": "crunchbase"},
    {"id": "4", "name": "AcmeCorp", "source": "patent_db"},
    {"id": "5", "name": "Acme Corporation", "source": "news_articles"},
]

resolver = EntityResolver(threshold=0.75)
pairs = resolver.resolve(entities)
for a, b, sim in pairs:
    print(f"{a['name']} <-> {b['name']} : {sim:.2f}")
# Alice Johnson <-> A. Johnson : 0.82
# Alice Johnson <-> Alice J. : 0.78
# AcmeCorp <-> Acme Corporation : 0.88
```

**基于嵌入的语义对齐：**

```python
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer("all-MiniLM-L6-v2")

def semantic_entity_resolution(entities, threshold=0.85):
    names = [e["name"] for e in entities]
    embeddings = model.encode(names)
    same_as_pairs = []

    for i in range(len(entities)):
        for j in range(i + 1, len(entities)):
            cos_sim = np.dot(embeddings[i], embeddings[j]) / (
                np.linalg.norm(embeddings[i]) * np.linalg.norm(embeddings[j])
            )
            if cos_sim >= threshold:
                same_as_pairs.append((entities[i], entities[j], cos_sim))

    return same_as_pairs
```

**在 Neptune 中记录 sameAs 关系（SPARQL UPDATE）：**

```sparql
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX ex: <http://example.org/kg/>

# 添加 sameAs 链接
INSERT DATA {
  ex:Alice_1 owl:sameAs ex:Alice_2 .
  ex:Alice_1 owl:sameAs ex:Alice_3 .
  ex:AcmeCorp owl:sameAs ex:Acme_Corporation .
}
```

**Gremlin 实现实体合并：**

```groovy
// 查找 sameAs 目标并合并属性
g.V().has('name', 'Alice Johnson').as('source')
 .V().has('name', 'A. Johnson').as('target')
 .addE('sameAs').from('source').to('target')

// 查询时通过 sameAs 边跳转
g.V().has('name', 'Alice Johnson')
 .union(
   identity(),
   out('sameAs'),
   in('sameAs')
 )
 .out('worksFor')
 .values('name')
```

### 9.3.4 使用场景

- **企业并购**：整合不同公司的客户数据，识别同一客户
- **开放数据集成**：DBpedia、Wikidata、内部知识库的实体对齐
- **多语言知识图谱**：英文"Apple"与中文"苹果"的对齐
- **数据湖治理**：消除来自不同业务系统的重复实体

### 9.3.5 潜在风险与注意事项

- 实体解析的误报（False Positive）会污染知识图谱，建议设置高阈值并保留人工审核通道
- 大规模实体解析（百万级）需要 MinHash LSH 等近似算法，避免 O(n²) 全量比较
- sameAs 边过多会导致查询性能下降，建议定期执行实体合并
- 跨语言对齐需要翻译或跨语言嵌入，单纯字符串相似度不可靠
- 冲突解决策略应在设计阶段确定，避免不同源数据互相覆盖

### 9.3.6 本章小结

知识融合是知识图谱质量的关键保障。实体解析通过阻塞-比较-决策流水线消除重复，属性对齐和冲突解决确保数据一致性。Neptune 的 sameAs 边和 SPARQL 推理能力为融合后的知识图谱提供了灵活的查询支持。

---

## 9.4 知识推理与查询

### 9.4.1 解决的问题

知识图谱中显式存储的事实有限，大量隐含知识需要通过推理获得。例如已知"Alice worksFor AcmeCorp"且"AcmeCorp isLocatedIn USA"，可推理出"Alice worksIn USA"。推理能力决定了知识图谱的智能程度。

### 9.4.2 核心原理

**SPARQL 推理**基于 RDFS/OWL 本体：
- **RDFS 推理**：子类传递（rdfs:subClassOf）、属性域/范围推断
- **OWL 推理**：等价关系传递（owl:sameAs）、属性特征（对称、传递、逆反）

**属性路径查询（Property Path）** 是 SPARQL 1.1 的核心特性：
- `+`：一个或多个跳转
- `*`：零个或多个跳转
- `^`：反向边
- `|`：并集

**规则推理**通过自定义规则引擎（如 Apache Jena Rules）实现业务逻辑。

**图遍历**在 Gremlin 中通过 `repeat()` 实现多跳查询。

### 9.4.3 代码/配置实现

**SPARQL 推理查询示例：**

```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX ex: <http://example.org/kg/>

# 查询所有员工（包括子类 Employee 的实例）
SELECT ?person ?name WHERE {
  ?person rdf:type/rdfs:subClassOf* ex:Person .
  ?person ex:name ?name .
}

# 利用 owl:sameAs 查询所有别名
SELECT ?entity ?equivalent WHERE {
  ?entity owl:sameAs ?equivalent .
}

# 属性路径：查询 Alice 的间接上级
PREFIX ex: <http://example.org/kg/>
SELECT ?manager WHERE {
  ex:Alice ex:reportsTo+ ?manager .
}

# 属性路径：查询 Alice 所在公司的国家（两跳推理）
SELECT ?country WHERE {
  ex:Alice ex:worksFor/ex:locatedIn ?country .
}

# 复杂推理：查询与 Alice 在同一公司的人
SELECT ?colleague WHERE {
  ex:Alice ex:worksFor ?company .
  ?colleague ex:worksFor ?company .
  FILTER(?colleague != ex:Alice)
}
```

**Gremlin 多跳遍历查询：**

```groovy
// 两跳查询：Alice 所在公司的创始人
g.V().has('Person', 'name', 'Alice')
 .out('worksFor')
 .in('founded')
 .values('name')

// 多跳遍历：查找可达路径（最多5跳）
g.V().has('Person', 'name', 'Alice')
 .repeat(out().simplePath())
 .times(5)
 .path()
 .by('name')

// 条件遍历：查找与 Alice 在同一公司且职位是 CEO 的人
g.V().has('Person', 'name', 'Alice')
 .out('worksFor')
 .in('worksFor')
 .has('position', 'CEO')
 .values('name')

// 聚合查询：统计每个公司的员工数
g.V().hasLabel('Company')
 .project('company', 'employee_count')
 .by('name')
 .by(in('worksFor').count())

// 最短路径查询
g.V().has('name', 'Alice')
 .repeat(out().simplePath())
 .until(has('name', 'Bob'))
 .path()
 .limit(1)
 .by('name')
```

**基于 Neptune 的规则推理（使用 Neptune ML 或 Lambda 推理层）：**

```python
import boto3
from gremlin_python.driver import client as gremlin_client

def apply_inference_rules(event, context):
    """AWS Lambda 推理规则引擎"""
    cli = gremlin_client.Client(
        "wss://neptune-endpoint:8182/gremlin", "g"
    )

    # 规则1: 如果 A worksFor B 且 B locatedIn C，则 A worksIn C
    rule1_query = """
    g.V().hasLabel('Person').as('p')
     .out('worksFor').as('c')
     .out('locatedIn').as('loc')
     .select('p','c','loc')
     .where(select('p').outE('worksIn').count().is(eq(0)))
     .select('p','loc')
     .each({p, loc ->
         g.addE('worksIn').from(p).to(loc).next()
     })
    """

    # 规则2: 传递闭包 - 如果 A reportsTo B 且 B reportsTo C，则 A reportsTo C
    rule2_query = """
    g.V().hasLabel('Person').as('a')
     .out('reportsTo').as('b')
     .out('reportsTo').as('c')
     .select('a','c')
     .where(select('a').outE('reportsTo').where(inV().as('c')).count().is(eq(0)))
     .select('a','c')
     .each({a, c ->
         g.addE('reportsTo').from(a).to(c).next()
     })
    """

    cli.submit(rule1_query).all().result()
    cli.submit(rule2_query).all().result()
    cli.close()
    return {"status": "inference complete"}
```

**Neptune 推理配置（启用 OWL 推理）：**

```bash
# 创建 Neptune 集群时启用 OWL 推理
aws neptune create-db-cluster \
    --db-cluster-identifier kg-inference-cluster \
    --engine neptune \
    --enable-cloudwatch-logs-exports '["audit"]' \
    --db-cluster-parameter-group-name neptune1-params

# 参数组中设置推理模式
aws neptune modify-db-cluster-parameter-group \
    --db-cluster-parameter-group-name neptune1-params \
    --parameters "ParameterName=neptune_enable_owl_reasoning,ParameterValue=true,ApplyMethod=pending-reboot"
```

### 9.4.4 使用场景

- **组织架构推理**：从直接汇报关系推导间接汇报关系
- **地理推理**：从"公司位于城市"推导"员工工作国家"
- **供应链分析**：多跳追踪原材料到成品的完整链路
- **合规检查**：通过推理检测违反策略的关系模式
- **推荐系统**：基于图相似度推理潜在兴趣实体

### 9.4.5 潜在风险与注意事项

- OWL 推理在大型图谱上计算开销大，建议在写入时预计算推理结果
- SPARQL 属性路径查询可能产生指数级中间结果，需设置查询超时
- Gremlin 的 `repeat()` 应始终配合 `times()` 或 `until()` 限制深度
- 推理规则应版本化管理，错误的规则会污染整个知识图谱
- Neptune 的推理能力有限，复杂推理（如 OWL 2 DL）需外部推理引擎

### 9.4.6 本章小结

知识推理将显式知识转化为隐式知识，是知识图谱区别于普通数据库的核心能力。SPARQL 属性路径和 RDFS/OWL 推理提供了声明式推理，Gremlin 遍历提供了过程式图分析。生产环境建议将推理结果物化为显式边，以查询性能换取推理灵活性。

---

## 9.5 实战：企业知识图谱构建

### 9.5.1 解决的问题

从零开始构建一个企业级知识图谱涉及模式设计、数据加载、查询优化和可视化等多个环节。本节以"企业专利知识图谱"为例，展示完整的端到端构建流程。

### 9.5.2 核心原理

**模式设计原则**：
- 实体类型控制在 10-20 个，避免过度细分
- 关系类型控制在 20-50 个，保持语义清晰
- 属性尽量扁平化，避免深层嵌套
- 为高频查询路径建立索引

**数据加载策略**：
- 小数据量（< 10万条）：Gremlin/SPARQL INSERT 逐条写入
- 大数据量：Neptune Bulk Loader（S3 触发，并行加载）
- 流式数据：Kinesis + Lambda 实时写入

### 9.5.3 代码/配置实现

**模式设计（属性图模型）：**

```groovy
// 实体标签
// Person, Company, Patent, Technology, Location, Product

// 关系标签
// invented, assignedTo, worksFor, founded, citedBy,
// classifiedAs, locatedIn, acquired, investedIn, collaboratesWith

// 创建索引（Neptune DFE 引擎自动管理，无需显式创建）
// 但可以通过属性约束优化查询
g.addV('Person').property('name', 'Alice').property('id', 'P001')
g.addV('Company').property('name', 'AcmeCorp').property('id', 'C001')
g.addV('Patent').property('id', 'US-2024001')
    .property('title', 'Graph Database System')
    .property('filingDate', '2024-01-15')
    .property('status', 'granted')
g.addV('Technology').property('name', 'Knowledge Graph')
g.addV('Location').property('name', 'United States')
    .property('code', 'US')
```

**Bulk Loader 配置与数据准备：**

```bash
# 1. 准备 CSV 数据文件（顶点）
cat > vertices.csv << 'EOF'
~id,~label,name:string,title:string,filingDate:date,status:string
P001,Person,Alice,,
P002,Person,Bob,,
C001,Company,AcmeCorp,,
C002,Company,InnovateInc,,
US-2024001,Patent,,Graph Database System,2024-01-15,granted
US-2024002,Patent,,Machine Learning Model,2024-03-20,pending
T001,Technology,Knowledge Graph,,
T002,Technology,Natural Language Processing,,
L001,Location,United States,,
EOF

# 2. 准备 CSV 数据文件（边）
cat > edges.csv << 'EOF'
~id,~from,~to,~label,since:int
E001,P001,C001,worksFor,2020
E002,P002,C002,worksFor,2019
E003,P001,US-2024001,invented,
E004,P002,US-2024002,invented,
E005,US-2024001,T001,classifiedAs,
E006,US-2024002,T002,classifiedAs,
E007,C001,L001,locatedIn,
E008,C002,L001,locatedIn,
E009,US-2024001,US-2024002,citedBy,
EOF

# 3. 上传到 S3
aws s3 cp vertices.csv s3://kg-bulk-load/vertices.csv
aws s3 cp edges.csv s3://kg-bulk-load/edges.csv

# 4. 创建 Bulk Loader 任务
aws neptune start-loader-job \
    --db-cluster-identifier kg-cluster \
    --endpoint https://your-neptune-endpoint:8182 \
    --source s3://kg-bulk-load/ \
    --format csv \
    --s3-bucket kg-bulk-load \
    --s3-iam-role-arn arn:aws:iam::123456789012:role/NeptuneLoadRole \
    --region us-east-1 \
    --fail-on-error true \
    --parallelism HIGH
```

**Bulk Loader 配置文件（JSON）：**

```json
{
  "source": "s3://kg-bulk-load/",
  "format": "csv",
  "s3Bucket": "kg-bulk-load",
  "iamRoleArn": "arn:aws:iam::123456789012:role/NeptuneLoadRole",
  "region": "us-east-1",
  "failOnError": true,
  "parallelism": "HIGH",
  "updateSingleCardinalityProperties": true,
  "queueRequest": true,
  "dependencies": ["vertices.csv"]
}
```

**查询示例（Gremlin）：**

```groovy
// 查询某发明人的所有专利
g.V().has('Person', 'name', 'Alice')
 .out('invented')
 .valueMap('title', 'filingDate', 'status')

// 查询某专利的发明人及其公司
g.V().has('Patent', 'id', 'US-2024001')
 .in('invented')
 .as('inventor')
 .out('worksFor')
 .as('company')
 .select('inventor', 'company')
 .by('name')
 .by('name')

// 查询与某专利技术分类相同的其他专利
g.V().has('Patent', 'id', 'US-2024001')
 .out('classifiedAs')
 .in('classifiedAs')
 .where(neq( constant('US-2024001') ))
 .values('title')

// 查询公司专利组合的完整技术分布
g.V().has('Company', 'name', 'AcmeCorp')
 .in('worksFor')
 .out('invented')
 .out('classifiedAs')
 .groupCount()
 .by('name')
```

**查询示例（SPARQL）：**

```sparql
PREFIX ex: <http://example.org/kg/>

-- 查询 Alice 的所有专利
SELECT ?patent ?title ?status WHERE {
  ex:Alice ex:invented ?patent .
  ?patent ex:title ?title .
  ?patent ex:status ?status .
}

-- 查询与 US-2024001 同技术分类的专利
SELECT ?relatedPatent ?title WHERE {
  ex:US-2024001 ex:classifiedAs ?tech .
  ?relatedPatent ex:classifiedAs ?tech .
  ?relatedPatent ex:title ?title .
  FILTER(?relatedPatent != ex:US-2024001)
}

-- 查询公司专利技术分布（聚合）
SELECT ?tech (COUNT(?patent) AS ?count) WHERE {
  ?person ex:worksFor ex:AcmeCorp .
  ?person ex:invented ?patent .
  ?patent ex:classifiedAs ?tech .
}
GROUP BY ?tech
ORDER BY DESC(?count)

-- 查询引用网络（多跳）
SELECT ?original ?cited ?depth WHERE {
  ex:US-2024001 ex:citedBy+ ?cited .
  BIND("1-hop" AS ?depth)
}
UNION
{
  ex:US-2024001 ex:citedBy/ex:citedBy ?cited .
  BIND("2-hop" AS ?depth)
}
```

**可视化配置（Neptune Workbench + Graph Explorer）：**

```python
import boto3
import json

# 使用 Neptune 导出子图用于可视化
def export_subgraph_for_viz(person_name: str):
    cli = gremlin_client.Client(
        "wss://neptune-endpoint:8182/gremlin", "g"
    )

    # 导出以某人为中心的 2 跳子图
    query = """
    g.V().has('Person', 'name', person_name)
     .union(
       identity(),
       outE().inV(),
       out().outE().inV()
     )
     .dedup()
     .project('id', 'label', 'properties', 'type')
     .by(id)
     .by(label)
     .by(valueMap())
     .by(constant('vertex'))
    """

    result = cli.submit(query).all().result()
    cli.close()

    # 转换为 Graph JSON 格式（供 D3.js / vis.js 使用）
    nodes = []
    edges = []
    for item in result:
        nodes.append({
            "id": str(item["id"]),
            "label": item["label"],
            "properties": item["properties"]
        })

    return {"nodes": nodes, "edges": edges}

# 使用 Neptune Streams 实现实时可视化更新
def get_graph_changes(last_event_id: str = None):
    neptune = boto3.client("neptune")
    response = neptune.list_engine_events(
        dbClusterIdentifier="kg-cluster",
        startTime="2024-01-01T00:00:00Z"
    )
    return response
```

### 9.5.4 使用场景

- **企业专利管理**：追踪发明人、专利组合、技术分类、引用网络
- **竞争对手分析**：通过共同技术分类发现竞争对手
- **人才发现**：通过专利引用网络识别领域专家
- **技术趋势**：分析技术分类的时间序列变化
- **尽职调查**：在并购场景中快速评估目标公司的知识产权

### 9.5.5 潜在风险与注意事项

- Bulk Loader 的 CSV 格式要求严格，`~id` 必须唯一，特殊字符需转义
- 大规模加载时建议先加载顶点再加载边，避免外键引用失败
- Neptune 的写入吞吐受实例规格限制，批量加载时监控 CPU 和内存
- 查询性能优化：为高频属性添加索引，避免全图扫描
- 可视化时限制子图大小（建议 2-3 跳），避免浏览器崩溃

### 9.5.6 本章小结

企业知识图谱的构建需要模式设计、数据加载、查询优化和可视化四个环节的紧密配合。Bulk Loader 提供了高效的批量加载能力，Gremlin 和 SPARQL 分别适合遍历式和声明式查询。以专利知识图谱为例的完整流程可复用到其他领域。

---

## 9.6 知识图谱质量保障

### 9.6.1 解决的问题

知识图谱的价值取决于其质量。不完整、不准确、不一致的知识图谱会导致下游应用产生错误结论。质量保障需要从完整性、准确性、一致性和时效性四个维度持续监控和改进。

### 9.6.2 核心原理

**完整性（Completeness）** 衡量知识图谱覆盖真实世界的程度：
- **模式完整性**：实体类型和关系类型是否覆盖了领域模型
- **属性完整性**：实体是否填充了关键属性
- **引用完整性**：关系两端的实体是否存在

**准确性（Accuracy）** 衡量事实的正确性：
- 实体属性值与真实值的一致程度
- 关系类型是否正确
- 实体分类是否正确

**一致性（Consistency）** 衡量知识图谱内部是否存在矛盾：
- 类型约束：实体属性是否符合其类型的定义
- 关系约束：关系两端的实体类型是否匹配域/范围
- 逻辑约束：如"员工不能同时是竞争对手"

**时效性（Currency）** 衡量知识的更新程度：
- 实体最后更新时间
- 过期数据的识别与标记
- 增量更新策略

### 9.6.3 代码/配置实现

**完整性检查脚本：**

```python
from gremlin_python.driver import client as gremlin_client

class KGQualityChecker:
    def __init__(self, endpoint):
        self.cli = gremlin_client.Client(
            f"wss://{endpoint}:8182/gremlin", "g"
        )

    def check_completeness(self):
        """检查属性完整性"""
        results = {}

        # 检查 Person 实体是否都有 name 属性
        query = """
        g.V().hasLabel('Person')
         .project('total', 'with_name')
         .by(count())
         .by(has('name').count())
        """
        res = self.cli.submit(query).all().result()
        if res:
            results["person_name_completeness"] = res[0]

        # 检查 Patent 实体是否都有 title 和 filingDate
        query = """
        g.V().hasLabel('Patent')
         .project('total', 'with_title', 'with_date')
         .by(count())
         .by(has('title').count())
         .by(has('filingDate').count())
        """
        res = self.cli.submit(query).all().result()
        if res:
            results["patent_completeness"] = res[0]

        return results

    def check_referential_integrity(self):
        """检查引用完整性：边的两端实体是否存在"""
        query = """
        g.E().project('edge', 'from_exists', 'to_exists')
         .by(id)
         .by(outV().count())
         .by(inV().count())
         .where(values('from_exists').is(eq(0))
             .or().values('to_exists').is(eq(0)))
        """
        return self.cli.submit(query).all().result()

    def check_consistency(self):
        """检查逻辑一致性"""
        # 检查是否有 Patent 指向了非 Technology 的分类
        query = """
        g.V().hasLabel('Patent').out('classifiedAs')
         .filter(hasLabel(neq('Technology')))
         .count()
        """
        return self.cli.submit(query).all().result()

    def check_accuracy(self, sample_ratio=0.01):
        """抽样检查准确性（返回待审核样本）"""
        query = f"""
        g.V().sample({int(sample_ratio * 10000)})
         .valueMap().with(WithOptions.tokens)
        """
        return self.cli.submit(query).all().result()

    def close(self):
        self.cli.close()

# 使用
checker = KGQualityChecker("your-neptune-endpoint")
print("Completeness:", checker.check_completeness())
print("Orphan edges:", checker.check_referential_integrity())
print("Consistency violations:", checker.check_consistency())
checker.close()
```

**SPARQL 一致性约束检查：**

```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX ex: <http://example.org/kg/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

-- 约束1：Patent 必须有 title
SELECT ?patent ?msg WHERE {
  ?patent rdf:type ex:Patent .
  FILTER NOT EXISTS { ?patent ex:title ?title }
  BIND("Patent missing title" AS ?msg)
}

-- 约束2：worksFor 关系的对象必须是 Company
SELECT ?person ?company ?msg WHERE {
  ?person ex:worksFor ?company .
  ?company rdf:type ?type .
  FILTER(?type != ex:Company)
  BIND("worksFor target is not a Company" AS ?msg)
}

-- 约束3：filingDate 必须在合理范围内
SELECT ?patent ?date ?msg WHERE {
  ?patent ex:filingDate ?date .
  FILTER(?date > "2025-01-01"^^xsd:date)
  BIND("filingDate is in the future" AS ?msg)
}

-- 约束4：检测孤立实体（没有任何关系的实体）
SELECT ?entity ?type ?msg WHERE {
  ?entity rdf:type ?type .
  FILTER NOT EXISTS { ?entity ?p ?o . FILTER(?p != rdf:type) }
  FILTER NOT EXISTS { ?s ?p ?entity }
  BIND("Entity has no relationships" AS ?msg)
}
```

**持续更新流水线（AWS Step Functions）：**

```python
import boto3
import json

stepfunctions = boto3.client("stepfunctions")

def trigger_kg_update_pipeline(new_data_bucket: str, new_data_key: str):
    """触发知识图谱更新流水线"""
    response = stepfunctions.start_execution(
        stateMachineArn="arn:aws:states:us-east-1:123456789012:stateMachine:kg-update-pipeline",
        input=json.dumps({
            "bucket": new_data_bucket,
            "key": new_data_key,
            "timestamp": "2024-06-01T00:00:00Z"
        })
    )
    return response

# Step Functions 定义（简化）
pipeline_definition = {
    "Comment": "Knowledge Graph Continuous Update Pipeline",
    "StartAt": "ValidateInput",
    "States": {
        "ValidateInput": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:validate-input",
            "Next": "ExtractEntities"
        },
        "ExtractEntities": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:comprehend-ner",
            "Next": "ResolveEntities"
        },
        "ResolveEntities": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:entity-resolution",
            "Next": "LoadToNeptune"
        },
        "LoadToNeptune": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:neptune-bulk-loader",
            "Next": "QualityCheck"
        },
        "QualityCheck": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:kg-quality-check",
            "Next": "PublishMetrics"
        },
        "PublishMetrics": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:cloudwatch-metrics",
            "End": True
        }
    }
}
```

**质量指标上报到 CloudWatch：**

```python
import boto3

cloudwatch = boto3.client("cloudwatch")

def publish_quality_metrics(checker: KGQualityChecker):
    completeness = checker.check_completeness()
    consistency = checker.check_consistency()

    cloudwatch.put_metric_data(
        Namespace="KnowledgeGraph",
        MetricData=[
            {
                "MetricName": "PersonNameCompleteness",
                "Value": completeness["person_name_completeness"]["with_name"]
                         / completeness["person_name_completeness"]["total"],
                "Unit": "Percent"
            },
            {
                "MetricName": "ConsistencyViolations",
                "Value": consistency[0] if consistency else 0,
                "Unit": "Count"
            },
            {
                "MetricName": "TotalEntities",
                "Value": sum(
                    v["total"] for v in completeness.values()
                ),
                "Unit": "Count"
            }
        ]
    )
```

### 9.6.4 使用场景

- **数据治理**：定期生成质量报告，跟踪改进趋势
- **生产监控**：在 CI/CD 流水线中嵌入质量检查，阻止低质量数据上线
- **SLA 保障**：向数据消费者承诺完整性、准确性的量化指标
- **增量更新验证**：每次更新后自动运行质量检查，回滚不合格的变更

### 9.6.5 潜在风险与注意事项

- 完整性检查在大规模图谱上可能耗时，建议使用抽样或增量检查
- 准确性检查需要标注样本作为黄金标准，标注成本不可忽视
- 一致性约束过严会导致合法数据被拒绝，需要在严格与灵活之间平衡
- 质量指标应随时间跟踪趋势，单次检查的绝对值意义有限
- 持续更新流水线需要处理数据版本回滚，避免更新失败导致数据损坏

### 9.6.6 本章小结

知识图谱质量保障是一个持续过程，而非一次性活动。完整性、准确性、一致性和时效性四个维度需要配套的检查工具和监控机制。CloudWatch 指标和 Step Functions 流水线为生产环境的质量保障提供了可落地的技术方案。

---

## 本章总结

基于 Neptune 构建知识图谱是一个从数据模型设计、实体关系抽取、知识融合对齐、推理查询到质量保障的完整生命周期。属性图与 RDF 双模型为不同场景提供了灵活选择，Bulk Loader 解决了大规模数据加载问题，SPARQL 推理和 Gremlin 遍历分别满足了声明式和过程式查询需求。质量保障体系确保知识图谱在生产环境中持续可靠。

关键实践建议：
1. **设计先行**：在加载数据前完成模式设计，明确实体类型、关系类型和属性定义
2. **流水线自动化**：使用 Step Functions 编排 NER、融合、加载、质检全流程
3. **质量内建**：将质量检查嵌入 CI/CD 流水线，而非事后补救
4. **渐进式推理**：先物化高频推理结果，再按需使用动态推理
5. **监控驱动改进**：基于 CloudWatch 指标持续优化知识图谱的完整性和准确性
