# 第14章 知识图谱构建：从非结构化文本到可查询知识库

## 14.1 知识图谱技术栈概述

### 14.1.1 解决的问题

知识图谱（Knowledge Graph）旨在解决"数据孤岛"与"语义鸿沟"两大问题。传统关系型数据库存储的是结构化表格，缺乏实体间的语义关联；而纯文本数据虽然信息丰富，却无法被机器直接理解和推理。知识图谱通过**实体—关系—实体**的三元组形式，将异构数据统一为语义网络，支撑智能搜索、推荐、问答和推理等上层应用。

### 14.1.2 核心原理

知识图谱的总体架构分为四层：

```
┌─────────────────────────────────────────────┐
│              应用层 (Application)              │
│  智能搜索 · 问答系统 · 推荐引擎 · 风险控制    │
├─────────────────────────────────────────────┤
│              推理层 (Reasoning)               │
│  规则推理 · 路径排序 · 本体推理 · 图算法      │
├─────────────────────────────────────────────┤
│              模式层 (Schema)                  │
│  本体定义 · 实体类型 · 关系类型 · 属性约束    │
├─────────────────────────────────────────────┤
│              数据层 (Data)                    │
│  实体 · 关系 · 属性 · 事件 · 原始文本         │
└─────────────────────────────────────────────┘
```

**关键组件**：

| 组件 | 职责 | 典型技术 |
|------|------|----------|
| 命名实体识别（NER） | 从文本中抽取实体 | BERT, BiLSTM-CRF, 字典匹配 |
| 关系抽取（RE） | 识别实体间语义关系 | CNN, RNN, Prompt-LLM |
| 实体对齐 | 跨源实体去重融合 | 相似度计算, 图匹配 |
| 知识存储 | 三元组持久化 | Neo4j, JanusGraph, RDF |
| 知识推理 | 隐式知识推导 | Drools, OWL Reasoner, GNN |
| 质量评估 | 准确率/完整度度量 | 人工评估, 一致性检查 |

**构建流水线**：

```
原始文本 → 预处理 → NER → RE → 实体对齐 → 知识融合 → 图DB导入 → 推理增强 → 应用
```

### 14.1.3 代码/配置实现

以下是一个知识图谱构建流水线的顶层编排（Python伪代码）：

```python
class KnowledgeGraphPipeline:
    def __init__(self, ner_model, re_model, aligner, db_client):
        self.ner = ner_model
        self.re = re_model
        self.aligner = aligner
        self.db = db_client

    def run(self, documents: list[str]):
        triples = []
        for doc in documents:
            entities = self.ner.extract(doc)
            relations = self.re.extract(doc, entities)
            triples.extend(relations)
        aligned = self.aligner.align(triples)
        self.db.bulk_insert(aligned)
        return len(aligned)
```

### 14.1.4 使用场景

- **搜索引擎**：Google Knowledge Graph 增强搜索结果
- **金融风控**：企业关联关系挖掘、担保圈识别
- **医疗健康**：药品—疾病—症状知识网络
- **工业制造**：设备故障知识库与根因分析

### 14.1.5 潜在风险与注意事项

- 数据质量直接影响图谱价值，GIGO（垃圾进垃圾出）原则在知识图谱中尤为突出
- 模式层设计需平衡灵活性与约束力，过度设计导致扩展困难，设计不足导致语义混乱
- 大规模图谱的推理性能是瓶颈，需合理使用索引和近似推理

### 14.1.6 本章小结

知识图谱构建是一个多阶段、多技术融合的系统工程。本章将从实体识别出发，逐步深入到关系抽取、知识融合、图存储、推理引擎，最终构建一个完整的领域知识图谱。

---

## 14.2 命名实体识别（NER）

### 14.2.1 解决的问题

命名实体识别是从非结构化文本中定位并分类专有名词（人名、地名、机构名、时间、数字等）的任务。它是知识图谱构建的第一道关卡——没有准确的实体识别，后续的关系抽取和知识融合将失去基础。

### 14.2.2 核心原理

NER 技术经历了三个主要阶段：

| 阶段 | 方法 | 特点 | F1 基准 |
|------|------|------|---------|
| 规则时代 | 正则表达式 + 词典 | 高精度、低召回、维护成本高 | 70-80 |
| 统计时代 | CRF、HMM、MEMM | 特征工程驱动、泛化能力一般 | 85-90 |
| 深度学习时代 | BiLSTM-CRF、BERT-NER | 端到端、SOTA 效果 | 92-96 |

**CRF 原理**：条件随机场（Conditional Random Field）建模观测序列（文本）与标签序列（实体标签）之间的条件概率。其核心是定义特征函数并学习权重：

$$P(y|x) = \frac{1}{Z(x)} \exp\left(\sum_{i,k} \lambda_k f_k(y_{i-1}, y_i, x, i)\right)$$

**BiLSTM-CRF 原理**：双向 LSTM 编码上下文信息，CRF 层建模标签转移约束（如"B-PER 后不能接 I-LOC"），结合了深度表示与结构化预测的优势。

**BERT-NER 原理**：预训练语言模型微调，将每个 token 的 [CLS] 或最后一层隐状态送入线性分类层，输出 BIO 标签。

### 14.2.3 代码/配置实现

#### 基于正则与词典的 NER（Java）

```java
import java.util.*;
import java.util.regex.*;

public class RuleBasedNER {
    private static final Map<String, String> DICTIONARY = Map.of(
        "北京", "LOC", "上海", "LOC", "阿里巴巴", "ORG", "腾讯", "ORG"
    );
    private static final Pattern PHONE_PATTERN =
        Pattern.compile("1[3-9]\\d{9}");
    private static final Pattern ID_PATTERN =
        Pattern.compile("\\d{17}[\\dXx]");

    public static List<Entity> extract(String text) {
        List<Entity> entities = new ArrayList<>();
        // 词典匹配
        for (var entry : DICTIONARY.entrySet()) {
            int idx = 0;
            while ((idx = text.indexOf(entry.getKey(), idx)) != -1) {
                entities.add(new Entity(entry.getKey(), entry.getValue(), idx));
                idx += entry.getKey().length();
            }
        }
        // 正则匹配
        Matcher m = PHONE_PATTERN.matcher(text);
        while (m.find()) {
            entities.add(new Entity(m.group(), "PHONE", m.start()));
        }
        return entities;
    }

    record Entity(String name, String type, int offset) {}
}
```

#### 基于 CRF 的 NER（Python，使用 sklearn-crfsuite）

```python
import sklearn_crfsuite
from sklearn_crfsuite import metrics

def word2features(sent, i):
    word = sent[i]
    features = {
        'word': word,
        'word.isdigit': word.isdigit(),
        'word.isupper': word.isupper(),
        'word.istitle': word.istitle(),
        'word[-3:]': word[-3:],
        'word[-2:]': word[-2:],
        'word.prefix': word[:2],
        'word.suffix': word[-2:],
    }
    if i > 0:
        features.update({
            '-1:word': sent[i-1],
            '-1:istitle': sent[i-1].istitle(),
        })
    if i < len(sent) - 1:
        features.update({
            '+1:word': sent[i+1],
            '+1:istitle': sent[i+1].istitle(),
        })
    return features

def sent2features(sent):
    return [word2features(sent, i) for i in range(len(sent))]

# 训练
crf = sklearn_crfsuite.CRF(
    algorithm='lbfgs',
    c1=0.1, c2=0.1,
    max_iterations=100,
    all_possible_transitions=True
)
crf.fit(X_train, y_train)
y_pred = crf.predict(X_test)
print(metrics.flat_f1_score(y_test, y_pred, average='weighted'))
```

#### BiLSTM-CRF（Python，PyTorch 核心片段）

```python
import torch
import torch.nn as nn

class BiLSTM_CRF(nn.Module):
    def __init__(self, vocab_size, tag_size, embedding_dim=256, hidden_dim=256):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embedding_dim)
        self.bilstm = nn.LSTM(embedding_dim, hidden_dim // 2,
                              bidirectional=True, batch_first=True)
        self.fc = nn.Linear(hidden_dim, tag_size)
        # CRF 转移矩阵
        self.transitions = nn.Parameter(torch.randn(tag_size, tag_size))
        self.tag_size = tag_size

    def forward(self, x, masks):
        emb = self.embedding(x)
        lstm_out, _ = self.bilstm(emb)
        emissions = self.fc(lstm_out)
        return emissions

    def loss(self, emissions, tags, masks):
        # 前向算法计算配分函数
        score = self._forward_algorithm(emissions, masks)
        gold_score = self._score_sentence(emissions, tags, masks)
        return (score - gold_score).mean()

    def decode(self, emissions, masks):
        # Viterbi 解码
        batch_size, seq_len, _ = emissions.shape
        viterbi = emissions.new_full((batch_size, self.tag_size), -1e8)
        viterbi[:, 0] = 0  # START tag
        backpointers = []
        for t in range(seq_len):
            viterbi_t = viterbi.unsqueeze(2) + self.transitions.unsqueeze(0)
            best_scores, best_tags = viterbi_t.max(dim=1)
            viterbi = best_scores + emissions[:, t]
            backpointers.append(best_tags)
        # 回溯
        best_path = []
        _, last_tag = viterbi.max(dim=1)
        best_path.append(last_tag)
        for bp in reversed(backpointers):
            last_tag = bp.gather(1, last_tag.unsqueeze(1)).squeeze(1)
            best_path.append(last_tag)
        best_path.reverse()
        return torch.stack(best_path, dim=1)
```

#### BERT-NER 微调（Python，Transformers）

```python
from transformers import AutoTokenizer, AutoModelForTokenClassification, Trainer
from datasets import Dataset

tokenizer = AutoTokenizer.from_pretrained("bert-base-chinese")
model = AutoModelForTokenClassification.from_pretrained(
    "bert-base-chinese", num_labels=len(label_list)
)

def tokenize_and_align_labels(examples):
    tokenized = tokenizer(
        examples["tokens"], truncation=True, padding=True, is_split_into_words=True
    )
    labels = []
    for i, label in enumerate(examples["ner_tags"]):
        word_ids = tokenized.word_ids(batch_index=i)
        aligned = [-100 if wid is None else label[wid] for wid in word_ids]
        labels.append(aligned)
    tokenized["labels"] = labels
    return tokenized

trainer = Trainer(
    model=model,
    args=TrainingArguments(
        output_dir="./ner-model",
        per_device_train_batch_size=16,
        num_train_epochs=3,
        evaluation_strategy="epoch",
    ),
    train_dataset=dataset.map(tokenize_and_align_labels),
)
trainer.train()
```

### 14.2.4 使用场景

| 方法 | 适用场景 | 示例 |
|------|----------|------|
| 规则+词典 | 领域封闭、术语固定 | 药品名、化学分子式 |
| CRF | 标注数据有限、需解释性 | 金融公告实体抽取 |
| BiLSTM-CRF | 通用场景、中等数据量 | 新闻实体识别 |
| BERT-NER | 数据充足、追求 SOTA | 学术文献挖掘 |

### 14.2.5 潜在风险与注意事项

- **嵌套实体**：如"北京大学"既是机构也是地名，BIO 标签体系无法直接处理嵌套，需使用嵌套 NER 模型
- **长尾实体**：BERT 对未见过的实体泛化能力有限，可结合词典增强
- **标注一致性**：标注规范不一致会严重降低模型效果，建议使用 Brat、LabelStudio 等工具保证标注质量
- **推理速度**：BERT 推理较慢，生产环境可考虑蒸馏模型（如 TinyBERT）或 ONNX 加速

### 14.2.6 本章小结

NER 是知识图谱构建的基石。规则方法适合快速冷启动，CRF 适合特征明确的场景，BiLSTM-CRF 和 BERT-NER 提供更高的准确率。实际工程中常采用"词典+模型"的混合策略：词典保证高精度，模型覆盖召回。

---

## 14.3 关系抽取（Relation Extraction）

### 14.3.1 解决的问题

关系抽取的目标是从文本中识别实体之间的语义关系，形成 `(head, relation, tail)` 三元组。例如从"乔布斯创立了苹果公司"中抽取 `(乔布斯, 创始人, 苹果公司)`。没有关系抽取，实体只是孤立节点，无法形成有意义的图结构。

### 14.3.2 核心原理

关系抽取方法可分为四类：

| 方法 | 原理 | 标注需求 | 典型 F1 |
|------|------|----------|---------|
| 模式匹配 | 基于依存句法路径模板 | 无 | 60-75 |
| 监督学习 | CNN/RNN 分类 | 大量标注 | 80-90 |
| 远程监督 | 知识库对齐自动标注 | 知识库 | 70-85 |
| Prompt-LLM | 大模型提示工程 | 少量示例 | 85-95 |

**模式匹配**：利用依存句法分析结果，定义关系模板。如 `nsubj(创立, 乔布斯) ∧ dobj(创立, 苹果) → founder(乔布斯, 苹果)`。

**CNN 关系分类**：将实体标记特殊 token，通过卷积和池化提取句子级特征，送入 softmax 分类。

**远程监督**：将知识库中的三元组与文本对齐，自动生成标注数据。核心假设：如果两个实体在知识库中存在关系，则所有包含这两个实体的句子都表达该关系（存在噪声问题）。

**Prompt-LLM**：构造提示模板，让大语言模型直接生成三元组。如 `"从以下文本中抽取实体关系三元组：(乔布斯, 创始人, 苹果公司)"`。

### 14.3.3 代码/配置实现

#### 基于依存句法模式的关系抽取（Python + spaCy）

```python
import spacy

nlp = spacy.load("zh_core_web_trf")

def extract_relations_by_pattern(text: str):
    doc = nlp(text)
    relations = []
    for sent in doc.sents:
        for token in sent:
            # 模式：nsubj(创立, 人) + dobj(创立, 组织) → founder
            if token.dep_ == "nsubj" and token.head.pos_ == "VERB":
                subj = token.text
                verb = token.head
                for child in verb.children:
                    if child.dep_ == "dobj":
                        obj = child.text
                        relations.append((subj, "founder", obj))
            # 模式：nn(组织, 地点) → located_in
            if token.dep_ == "nn" and token.head.pos_ == "PROPN":
                relations.append((token.text, "located_in", token.head.text))
    return relations
```

#### 基于 CNN 的关系分类（PyTorch）

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class CNNRelationClassifier(nn.Module):
    def __init__(self, vocab_size, embed_dim=128, num_filters=100,
                 filter_sizes=[3,4,5], num_classes=10):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim)
        self.convs = nn.ModuleList([
            nn.Conv2d(1, num_filters, (k, embed_dim)) for k in filter_sizes
        ])
        self.dropout = nn.Dropout(0.5)
        self.fc = nn.Linear(len(filter_sizes) * num_filters, num_classes)

    def forward(self, x):
        # x: (batch, seq_len)
        x = self.embedding(x).unsqueeze(1)  # (batch, 1, seq, embed)
        conv_out = []
        for conv in self.convs:
            c = F.relu(conv(x)).squeeze(3)   # (batch, filters, conv_len)
            p = F.max_pool1d(c, c.size(2)).squeeze(2)
            conv_out.append(p)
        out = torch.cat(conv_out, dim=1)
        out = self.dropout(out)
        return self.fc(out)
```

#### 远程监督 + 多实例学习

```python
class MultiInstanceLearning:
    """多实例学习：一个实体对的所有句子中，只要有一个表达关系即为正例"""

    def __init__(self, kg_triples: list[tuple], sentence_bag: dict):
        # kg_triples: [(head, rel, tail)]
        # sentence_bag: {(head, tail): [sent1, sent2, ...]}
        self.kg = set(kg_triples)
        self.bags = sentence_bag

    def generate_training_data(self):
        X, y = [], []
        for (h, t), sents in self.bags.items():
            # 标签：如果知识库中存在该关系则为正
            label = 1 if any((h, r, t) in self.kg for r in ["创始人", "位于"]) else 0
            # 取 bag 中所有句子的平均表示
            bag_vectors = [self._encode(s) for s in sents]
            avg_vector = sum(bag_vectors) / len(bag_vectors)
            X.append(avg_vector)
            y.append(label)
        return X, y

    def _encode(self, sentence: str) -> list[float]:
        # 使用预训练 sentence embedding
        pass
```

#### Prompt-LLM 关系抽取（OpenAI API 示例）

```python
import openai

def extract_triples_llm(text: str, examples: list[dict]) -> list[tuple]:
    prompt = "从以下文本中抽取所有实体关系三元组 (实体1, 关系, 实体2)：\n\n"
    for ex in examples:
        prompt += f"文本: {ex['text']}\n三元组: {ex['triples']}\n\n"
    prompt += f"文本: {text}\n三元组:"

    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )
    return parse_triples(response.choices[0].message.content)

def parse_triples(raw: str) -> list[tuple]:
    triples = []
    for line in raw.strip().split("\n"):
        if "(" in line and ")" in line:
            parts = line.strip("()").split(",")
            if len(parts) == 3:
                triples.append((parts[0].strip(), parts[1].strip(), parts[2].strip()))
    return triples
```

### 14.3.4 使用场景

| 方法 | 场景 | 优势 | 劣势 |
|------|------|------|------|
| 模式匹配 | 垂直领域、句式固定 | 零标注、高精度 | 召回低、维护成本高 |
| 监督学习 | 通用领域、数据充足 | 效果好 | 标注成本高 |
| 远程监督 | 大规模自动构建 | 自动标注 | 噪声大、需降噪 |
| Prompt-LLM | 快速原型、长尾关系 | 灵活、少样本 | 成本高、延迟大 |

### 14.3.5 潜在风险与注意事项

- **关系重叠**：一个句子包含多个关系（如"乔布斯创立苹果并担任CEO"），需使用多标签分类或 Seq2Seq 方法
- **远程监督噪声**：实体对出现在同一句子中不一定表达知识库中的关系，需使用多实例学习或注意力机制降噪
- **长距离依赖**：实体间距离过远时，CNN/RNN 难以捕捉，Transformer 结构更优
- **LLM 幻觉**：大模型可能生成不存在的关系三元组，需设计验证机制

### 14.3.6 本章小结

关系抽取将孤立的实体连接为有意义的图结构。模式匹配适合冷启动，监督学习是主流方案，远程监督解决大规模标注问题，Prompt-LLM 提供了最灵活的新范式。生产环境中常采用"远程监督粗筛 + 模型精排"的两阶段策略。

---

## 14.4 知识融合与实体对齐

### 14.4.1 解决的问题

多源数据构建的知识图谱存在严重的实体冗余和冲突：同一实体在不同数据源中可能有不同名称（"阿里巴巴" vs "Alibaba"）、不同属性值（"成立时间：1999" vs "成立时间：1998"）。知识融合的目标是消除冗余、解决冲突，形成统一、一致的知识图谱。

### 14.4.2 核心原理

知识融合包含四个核心任务：

```
多源数据 → 实体对齐 → 属性对齐 → 冲突解决 → 统一图谱
```

**实体对齐（Entity Alignment）**：判断两个实体是否指向真实世界中的同一对象。方法包括：

| 方法 | 原理 | 适用场景 |
|------|------|----------|
| 基于属性相似度 | 计算名称、描述等属性的字符串/语义相似度 | 属性丰富的实体 |
| 基于图结构 | 利用邻居节点和关系路径的图嵌入相似度 | 结构信息丰富的图谱 |
| 混合方法 | 属性 + 结构联合学习 | 通用场景 |

**冲突解决策略**：

| 策略 | 描述 | 适用 |
|------|------|------|
| 投票法 | 多数数据源一致的值为准 | 多源数据 |
| 可信度加权 | 按数据源可信度加权 | 已知数据源质量 |
| 时间优先 | 取最新时间戳的值 | 时效性敏感 |
| 保留多值 | 保留所有值，标注来源 | 无法确定时 |

### 14.4.3 代码/配置实现

#### 基于属性相似度的实体对齐（Java）

```java
import java.util.*;
import java.util.stream.*;

public class EntityAligner {
    record Entity(String id, String name, String type, Map<String, String> attrs) {}
    record Alignment(String srcId, String tgtId, double score) {}

    public List<Alignment> align(List<Entity> source, List<Entity> target, double threshold) {
        List<Alignment> results = new ArrayList<>();
        for (Entity s : source) {
            for (Entity t : target) {
                double sim = computeSimilarity(s, t);
                if (sim >= threshold) {
                    results.add(new Alignment(s.id(), t.id(), sim));
                }
            }
        }
        return results.stream()
            .sorted((a, b) -> Double.compare(b.score(), a.score()))
            .collect(Collectors.toList());
    }

    private double computeSimilarity(Entity a, Entity b) {
        double nameSim = jaccardSimilarity(a.name(), b.name());
        double attrSim = attributeSimilarity(a.attrs(), b.attrs());
        return 0.7 * nameSim + 0.3 * attrSim;
    }

    private double jaccardSimilarity(String s1, String s2) {
        Set<Character> set1 = s1.chars().mapToObj(c -> (char) c).collect(Collectors.toSet());
        Set<Character> set2 = s2.chars().mapToObj(c -> (char) c).collect(Collectors.toSet());
        Set<Character> intersection = new HashSet<>(set1);
        intersection.retainAll(set2);
        Set<Character> union = new HashSet<>(set1);
        union.addAll(set2);
        return union.isEmpty() ? 0 : (double) intersection.size() / union.size();
    }

    private double attributeSimilarity(Map<String, String> a1, Map<String, String> a2) {
        if (a1.isEmpty() || a2.isEmpty()) return 0;
        double total = 0;
        int count = 0;
        for (var k : a1.keySet()) {
            if (a2.containsKey(k)) {
                total += jaccardSimilarity(a1.get(k), a2.get(k));
                count++;
            }
        }
        return count == 0 ? 0 : total / count;
    }
}
```

#### 基于图嵌入的实体对齐（Python + DGL）

```python
import torch
import torch.nn as nn
import dgl
import dgl.nn as dglnn

class GNNEntityAligner(nn.Module):
    """基于 GNN 的跨图谱实体对齐"""

    def __init__(self, in_dim, hidden_dim, out_dim):
        super().__init__()
        self.conv1 = dglnn.GraphConv(in_dim, hidden_dim)
        self.conv2 = dglnn.GraphConv(hidden_dim, out_dim)

    def forward(self, g, features):
        h = self.conv1(g, features)
        h = torch.relu(h)
        h = self.conv2(g, h)
        return h  # 实体嵌入

def align_entities(emb1: torch.Tensor, emb2: torch.Tensor,
                   top_k: int = 1) -> list[tuple]:
    """基于嵌入相似度的实体对齐"""
    emb1 = nn.functional.normalize(emb1, dim=1)
    emb2 = nn.functional.normalize(emb2, dim=1)
    sim = emb1 @ emb2.T  # (n1, n2)
    alignments = []
    for i in range(len(emb1)):
        scores, indices = sim[i].topk(top_k)
        for j, score in zip(indices.tolist(), scores.tolist()):
            alignments.append((i, j, score))
    return alignments
```

#### 冲突解决引擎

```python
from dataclasses import dataclass
from enum import Enum

class ConflictStrategy(Enum):
    VOTE = "vote"
    TRUST = "trust"
    LATEST = "latest"
    KEEP_ALL = "keep_all"

@dataclass
class SourceRecord:
    value: str
    source: str
    trust_score: float = 1.0
    timestamp: int = 0

class ConflictResolver:
    def __init__(self, strategy: ConflictStrategy):
        self.strategy = strategy

    def resolve(self, records: list[SourceRecord]) -> list[str]:
        if self.strategy == ConflictStrategy.VOTE:
            return self._vote(records)
        elif self.strategy == ConflictStrategy.TRUST:
            return self._trust_weighted(records)
        elif self.strategy == ConflictStrategy.LATEST:
            return self._latest(records)
        else:
            return [r.value for r in records]

    def _vote(self, records: list[SourceRecord]) -> list[str]:
        from collections import Counter
        counter = Counter(r.value for r in records)
        max_count = max(counter.values())
        return [v for v, c in counter.items() if c == max_count]

    def _trust_weighted(self, records: list[SourceRecord]) -> list[str]:
        scores = {}
        for r in records:
            scores[r.value] = scores.get(r.value, 0) + r.trust_score
        max_score = max(scores.values())
        return [v for v, s in scores.items() if s == max_score]

    def _latest(self, records: list[SourceRecord]) -> list[str]:
        best = max(records, key=lambda r: r.timestamp)
        return [best.value]
```

### 14.4.4 使用场景

- **跨语言知识融合**：中文"苹果公司"与英文"Apple Inc."对齐
- **多源百科融合**：百度百科、维基百科、互动百科的实体合并
- **企业数据整合**：不同业务系统的客户/供应商数据去重
- **知识图谱更新**：新数据与已有图谱的增量对齐

### 14.4.5 潜在风险与注意事项

- **相似度阈值选择**：阈值过低引入错误对齐，过高导致召回不足，需在验证集上调优
- **长尾实体对齐困难**：属性稀疏、邻居少的实体对齐准确率低，可引入外部知识增强
- **大规模对齐性能**：O(n²) 的成对比较不可扩展，需使用分块（blocking）策略或向量索引（如 FAISS）
- **冲突解决的主观性**：不同场景对"正确值"的定义不同，需设计可配置的冲突解决策略

### 14.4.6 本章小结

知识融合是构建高质量知识图谱的关键环节。实体对齐解决"同物异名"问题，属性对齐和冲突解决保证数据一致性。实际工程中采用"分块 + 多轮对齐 + 人工审核"的流程，在效率和准确率之间取得平衡。

---

## 14.5 图数据库存储

### 14.5.1 解决的问题

知识图谱的三元组数据需要高效的存储和查询引擎。传统关系型数据库存储三元组需要多次 JOIN，查询深度关联时性能急剧下降。图数据库以"顶点—边"为原生数据模型，支持毫秒级的多跳关联查询。

### 14.5.2 核心原理

**数据模型映射**：

```
知识图谱三元组         图数据库
  (实体)              → 顶点 (Vertex/Node)
  (关系)              → 边 (Edge/Relationship)
  (实体属性)          → 顶点属性
  (关系属性)          → 边属性
```

**主流图数据库对比**：

| 特性 | Neo4j | JanusGraph | NebulaGraph |
|------|-------|------------|-------------|
| 存储引擎 | 本地 | HBase/Cassandra/BE | 自研 |
| 查询语言 | Cypher | Gremlin | nGQL |
| 事务 | ACID | 最终一致性 | 最终一致性 |
| 分布式 | 集群版 | 原生分布式 | 原生分布式 |
| 适合规模 | 单机百亿 | 千亿级 | 千亿级 |

**索引策略**：

| 索引类型 | 作用 | Neo4j 实现 |
|----------|------|------------|
| 标签索引 | 按实体类型快速定位 | `CREATE INDEX FOR (n:Person) ON (n.name)` |
| 全文索引 | 属性模糊搜索 | `CREATE FULLTEXT INDEX` |
| 复合索引 | 多条件组合查询 | `CREATE INDEX FOR (n:Person) ON (n.age, n.city)` |
| 空间索引 | 地理空间查询 | `CREATE POINT INDEX` |

### 14.5.3 代码/配置实现

#### Neo4j 模式设计与导入（Java + Spring Data Neo4j）

```java
// 实体节点定义
@Node("Person")
public record Person(
    @Id String id,
    @Property("name") String name,
    @Property("birthYear") Integer birthYear,
    @Property("nationality") String nationality
) {}

@Node("Company")
public record Company(
    @Id String id,
    @Property("name") String name,
    @Property("foundedYear") Integer foundedYear
) {}

// 关系定义
@RelationshipProperties
public record FoundedBy(
    @Id String id,
    @Property("role") String role,
    @Property("startYear") Integer startYear
) {}

// Repository
@Repository
public interface PersonRepository extends Neo4jRepository<Person, String> {
    // 自动派生查询
    List<Person> findByName(@Param("name") String name);

    // 自定义 Cypher 查询
    @Query("""
        MATCH (p:Person)-[:FOUNDED]->(c:Company)
        WHERE c.foundedYear >= $year
        RETURN p, c
    """)
    List<Person> findFoundersOfRecentCompanies(@Param("year") int year);
}
```

#### 批量导入（Python + Neo4j Driver）

```python
from neo4j import GraphDatabase

class KnowledgeGraphImporter:
    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def create_constraints_and_indexes(self):
        with self.driver.session() as session:
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (c:Company) REQUIRE c.id IS UNIQUE")
            session.run("CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.name)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (c:Company) ON (c.name)")

    def import_triples_batch(self, triples: list[tuple]):
        BATCH_SIZE = 1000
        with self.driver.session() as session:
            for i in range(0, len(triples), BATCH_SIZE):
                batch = triples[i:i+BATCH_SIZE]
                session.execute_write(self._batch_create, batch)

    @staticmethod
    def _batch_create(tx, batch: list[tuple]):
        for h, rel, t in batch:
            tx.run("""
                MERGE (a:Entity {id: $head_id})
                SET a.name = $head_name
                MERGE (b:Entity {id: $tail_id})
                SET b.name = $tail_name
                MERGE (a)-[r:RELATION {type: $rel_type}]->(b)
                SET r.type = $rel_type
            """, head_id=hash(h), head_name=h,
                 tail_id=hash(t), tail_name=t,
                 rel_type=rel)

    def close(self):
        self.driver.close()
```

#### JanusGraph 配置（Gremlin）

```groovy
// janusgraph-config.yaml
storage.backend: cql
storage.hostname: 127.0.0.1
storage.cql.keyspace: knowledge_graph

index.search.backend: elasticsearch
index.search.hostname: 127.0.0.1
index.search.elasticsearch.client-only: true

// 模式定义（Gremlin）
mgmt = graph.openManagement()
// 顶点标签
person = mgmt.makeVertexLabel("person").make()
company = mgmt.makeVertexLabel("company").make()
// 边标签
founded = mgmt.makeEdgeLabel("founded").multiplicity(MULTI).make()
// 属性键
name = mgmt.makePropertyKey("name").dataType(String.class).cardinality(SINGLE).make()
year = mgmt.makePropertyKey("foundedYear").dataType(Integer.class).cardinality(SINGLE).make()
// 索引
mgmt.buildIndex("byName", Vertex.class).addKey(name).buildMixedIndex("search")
mgmt.commit()
```

#### 查询示例（Cypher）

```cypher
// 查询某人的两度人脉
MATCH (p:Person {name: "马云"})-[:FOUNDED|INVESTED*1..2]-(related)
RETURN p, related

// 查询最短路径
MATCH p = shortestPath(
  (a:Person {name: "马云"})-[:FOUNDED|CEO*]-(b:Company {name: "特斯拉"})
)
RETURN p

// 社区检测：查找关联企业群
CALL gds.louvain.stream('company-graph')
YIELD nodeId, communityId
RETURN gds.util.asNode(nodeId).name AS company, communityId
```

### 14.5.4 使用场景

- **社交网络**：用户关系链、影响力传播路径分析
- **供应链图谱**：供应商—客户—产品的多级关联查询
- **知识问答**：基于图遍历的多跳推理问答
- **反欺诈**：异常交易环路检测、团伙识别

### 14.5.5 潜在风险与注意事项

- **超节点问题**：高热度实体（如"中国"）关联数百万条边，查询时需使用 `limit` 或分页
- **数据倾斜**：部分标签/关系类型数据量远大于其他类型，需针对性优化存储
- **事务大小**：Neo4j 单事务建议不超过 10 万条操作，大批量导入需分批
- **备份与恢复**：图数据库的备份策略与关系型数据库不同，需定期导出为 CSV 或使用快照

### 14.5.6 本章小结

图数据库是知识图谱的物理载体。Neo4j 适合中小规模、需要 ACID 事务的场景；JanusGraph 适合超大规模、需要水平扩展的场景。合理设计索引和分片策略是保证查询性能的关键。

---

## 14.6 知识推理与规则引擎

### 14.6.1 解决的问题

知识图谱中显式存储的三元组只是冰山一角，大量隐含知识需要通过推理获得。例如已知"马云是阿里巴巴创始人"和"阿里巴巴是电商公司"，可以推理出"马云从事电商行业"。知识推理的目标是从显式知识推导出隐式知识，丰富图谱的语义密度。

### 14.6.2 核心原理

知识推理分为三大类：

| 推理类型 | 原理 | 典型工具 | 推理能力 |
|----------|------|----------|----------|
| 本体推理 | 基于 RDFS/OWL 公理 | Apache Jena, Pellet | 类层次、属性约束 |
| 规则推理 | 前向/后向链式推理 | Drools, Datalog | 业务规则、自定义逻辑 |
| 图推理 | 路径排序、图嵌入 | GNN, PathRank | 隐式关系发现 |

**RDFS 推理规则示例**：

```
规则1 (子类传递):  IF A subClassOf B AND B subClassOf C THEN A subClassOf C
规则2 (类型传递):  IF X type A AND A subClassOf B THEN X type B
规则3 (定义域):    IF X P Y AND P domain A THEN X type A
规则4 (值域):      IF X P Y AND P range B THEN Y type B
```

**路径排序算法（PRA）**：在图中随机游走，统计不同路径模式在正负样本间的分布差异，学习路径权重，用于预测缺失关系。

### 14.6.3 代码/配置实现

#### 基于 Apache Jena 的本体推理（Java）

```java
import org.apache.jena.rdf.model.*;
import org.apache.jena.reasoner.*;
import org.apache.jena.reasoner.rulesys.*;

public class OntologyReasoner {
    public static void main(String[] args) {
        // 加载本体
        Model schema = ModelFactory.createDefaultModel();
        schema.read("ontology.owl");

        // 加载数据
        Model data = ModelFactory.createDefaultModel();
        data.read("knowledge-graph-data.ttl");

        // 创建推理器
        Reasoner reasoner = new GenericRuleReasoner(Rule.rulesFromURL("rules.txt"));
        reasoner.setDerivationLogging(true);
        InfModel inf = ModelFactory.createInfModel(reasoner, schema, data);

        // 查询推理结果
        String query = """
            PREFIX ex: <http://example.org/>
            SELECT ?person ?industry WHERE {
                ?person ex:worksIn ?industry .
            }
        """;
        // 执行查询...
    }
}
```

#### 自定义规则引擎（Java）

```java
import java.util.*;
import java.util.function.Predicate;

public class RuleEngine {
    record Triple(String subject, String predicate, String object) {}
    record Rule(String name, Predicate<List<Triple>> condition, List<Triple> conclusion) {}

    private final List<Rule> rules = new ArrayList<>();
    private final Set<Triple> facts = new HashSet<>();

    public void addRule(Rule rule) { rules.add(rule); }
    public void addFact(Triple fact) { facts.add(fact); }

    public int reason(int maxIterations) {
        int totalInferred = 0;
        for (int iter = 0; iter < maxIterations; iter++) {
            int inferred = 0;
            for (Rule rule : rules) {
                if (rule.condition().test(new ArrayList<>(facts))) {
                    for (Triple conclusion : rule.conclusion()) {
                        if (facts.add(conclusion)) {
                            inferred++;
                        }
                    }
                }
            }
            if (inferred == 0) break;
            totalInferred += inferred;
        }
        return totalInferred;
    }

    // 示例：定义传递性规则
    public static void main(String[] args) {
        RuleEngine engine = new RuleEngine();
        // 规则：如果 A 是 B 的上级，B 是 C 的上级，则 A 是 C 的上级
        engine.addRule(new Rule(
            "manager-transitivity",
            facts -> {
                for (var t1 : facts) {
                    if (t1.predicate().equals("managerOf")) {
                        for (var t2 : facts) {
                            if (t2.predicate().equals("managerOf")
                                && t1.object().equals(t2.subject())) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            },
            List.of()  // 实际需动态生成结论
        ));
    }
}
```

#### 基于图嵌入的链接预测（Python + PyG）

```python
import torch
import torch.nn.functional as F
from torch_geometric.nn import TransE

class LinkPredictor:
    """基于 TransE 的知识图谱链接预测"""

    def __init__(self, num_entities, num_relations, dim=128):
        self.model = TransE(num_entities, num_relations, dim)
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=0.01)

    def train(self, edge_index, edge_type, num_epochs=100):
        self.model.train()
        for epoch in range(num_epochs):
            self.optimizer.zero_grad()
            # 正样本得分
            pos_score = self.model(edge_index, edge_type)
            # 负采样
            neg_edge_index = self._negative_sample(edge_index)
            neg_score = self.model(neg_edge_index, edge_type)
            # 损失：最大化正样本与负样本的间隔
            loss = F.margin_ranking_loss(
                pos_score, neg_score,
                torch.ones_like(pos_score),
                margin=1.0
            )
            loss.backward()
            self.optimizer.step()
            if epoch % 10 == 0:
                print(f"Epoch {epoch}, Loss: {loss.item():.4f}")

    def predict(self, head, relation, tail_candidates):
        self.model.eval()
        with torch.no_grad():
            scores = self.model.predict(head, relation, tail_candidates)
            _, top_k = scores.topk(10)
            return top_k.tolist()

    def _negative_sample(self, edge_index):
        # 随机替换头或尾实体
        neg = edge_index.clone()
        mask = torch.rand(edge_index.size(1)) > 0.5
        neg[0, mask] = torch.randint(0, self.model.num_entities,
                                       (mask.sum().item(),))
        neg[1, ~mask] = torch.randint(0, self.model.num_entities,
                                       (~mask.sum().item(),))
        return neg
```

#### Drools 规则引擎配置

```drools
package knowledge.graph.reasoning

import com.example.Triple;

rule "FounderWorksInCompanyIndustry"
    when
        $founded : Triple(predicate == "founder", $person : subject, $company : object)
        $industry : Triple(subject == $company, predicate == "industry", $ind : object)
    then
        insert(new Triple($person, "worksIn", $ind));
end

rule "LocatedInTransitivity"
    when
        $loc1 : Triple(predicate == "locatedIn", $city : subject, $region : object)
        $loc2 : Triple(subject == $region, predicate == "locatedIn", $country : object)
    then
        insert(new Triple($city, "locatedIn", $country));
end
```

### 14.6.4 使用场景

- **合规检查**：根据监管规则自动检测违规行为
- **推荐系统**：基于用户—物品关系的路径推理推荐
- **药物发现**：药物—靶点—疾病的推理链路发现
- **故障诊断**：根据设备—故障—症状的规则链推理根因

### 14.6.5 潜在风险与注意事项

- **推理爆炸**：OWL 2 Full 推理不可判定，实际使用中应限制为 OWL 2 RL/QL 等可判定子集
- **规则冲突**：多条规则可能推导出矛盾结论，需设计冲突检测和优先级机制
- **性能问题**：大规模图谱上的推理可能耗时巨大，建议离线推理 + 增量更新
- **可解释性**：基于 GNN 的推理结果难以解释，规则推理天然可解释

### 14.6.6 本章小结

知识推理是知识图谱区别于普通数据库的核心能力。本体推理保证语义一致性，规则引擎实现业务逻辑自动化，图推理发现隐式关联。生产环境中通常采用"规则推理 + 图嵌入"的混合策略，兼顾准确率和召回率。

---

## 14.7 实战：构建领域知识图谱

### 14.7.1 解决的问题

本节以"金融领域企业关联知识图谱"为例，完整演示从原始数据到可查询知识图谱的全流程。目标：从企业公告、新闻、工商数据中构建企业—股东—高管—投资关系的知识图谱。

### 14.7.2 核心原理

**整体流水线**：

```
原始数据 → 数据清洗 → Schema 设计 → NER → RE → 实体对齐 → 图DB导入 → 查询验证
```

**Schema 设计**：

```
实体类型: 企业(Company), 个人(Person), 产品(Product)
关系类型:
  - (Person)-[FOUNDED]->(Company)     # 创始人
  - (Person)-[CEO]->(Company)         # 高管
  - (Company)-[INVESTED]->(Company)   # 投资
  - (Company)-[PRODUCES]->(Product)   # 产品
  - (Person)-[SHAREHOLDER_OF]->(Company)  # 股东
```

### 14.7.3 代码/配置实现

#### 步骤1：数据采集与预处理

```python
import json
import re
from typing import Generator

class DataCollector:
    def collect_from_json(self, filepath: str) -> Generator[dict, None, None]:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                yield json.loads(line)

    def clean_text(self, text: str) -> str:
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'[^\u4e00-\u9fa5a-zA-Z0-9，。、：；（）""''《》·\s]', '', text)
        return text.strip()
```

#### 步骤2：NER + RE 联合抽取

```python
class FinanceNER:
    def __init__(self):
        self.company_dict = self._load_dictionary("company_names.txt")
        self.person_dict = self._load_dictionary("person_names.txt")

    def _load_dictionary(self, path: str) -> set:
        with open(path, 'r', encoding='utf-8') as f:
            return {line.strip() for line in f}

    def extract(self, text: str) -> list[dict]:
        entities = []
        # 词典匹配企业名
        for company in self.company_dict:
            if company in text:
                entities.append({"text": company, "type": "Company"})
        # 词典匹配人名
        for person in self.person_dict:
            if person in text:
                entities.append({"text": person, "type": "Person"})
        return entities

class FinanceRE:
    PATTERNS = [
        (r"(\S+)投资(\S+)", "INVESTED"),
        (r"(\S+)创始人(\S+)", "FOUNDED"),
        (r"(\S+)担任(\S+)CEO", "CEO"),
        (r"(\S+)持有(\S+)股份", "SHAREHOLDER_OF"),
    ]

    def extract(self, text: str, entities: list[dict]) -> list[tuple]:
        triples = []
        for pattern, rel_type in self.PATTERNS:
            for match in re.finditer(pattern, text):
                h, t = match.group(1), match.group(2)
                # 验证头尾是否在实体列表中
                if any(e["text"] == h for e in entities) and \
                   any(e["text"] == t for e in entities):
                    triples.append((h, rel_type, t))
        return triples
```

#### 步骤3：实体对齐与融合

```python
class FinanceEntityAligner:
    def __init__(self):
        self.seen = {}  # canonical_name -> id

    def align(self, name: str, source: str) -> str:
        # 归一化
        canonical = self._normalize(name)
        if canonical in self.seen:
            return self.seen[canonical]
        # 模糊匹配
        for existing, eid in self.seen.items():
            if self._fuzzy_match(canonical, existing) > 0.85:
                self.seen[canonical] = eid
                return eid
        # 新实体
        eid = f"E{len(self.seen) + 1:06d}"
        self.seen[canonical] = eid
        return eid

    def _normalize(self, name: str) -> str:
        name = name.replace("（", "(").replace("）", ")")
        name = re.sub(r"[有限公司股份有限公司集团\s]", "", name)
        return name

    def _fuzzy_match(self, a: str, b: str) -> float:
        # 编辑距离相似度
        m, n = len(a), len(b)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1): dp[i][0] = i
        for j in range(n + 1): dp[0][j] = j
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                cost = 0 if a[i-1] == b[j-1] else 1
                dp[i][j] = min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost)
        return 1 - dp[m][n] / max(m, n)
```

#### 步骤4：导入 Neo4j

```python
from neo4j import GraphDatabase

class FinanceGraphImporter:
    def __init__(self, uri="bolt://localhost:7687", user="neo4j", password="password"):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def setup_schema(self):
        with self.driver.session() as session:
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (c:Company) REQUIRE c.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE")
            session.run("CREATE INDEX IF NOT EXISTS FOR (c:Company) ON (c.name)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.name)")

    def import_entity(self, entity_type: str, entity_id: str, name: str, **attrs):
        with self.driver.session() as session:
            label = entity_type
            query = f"""
                MERGE (n:{label} {{id: $id}})
                SET n.name = $name
            """
            params = {"id": entity_id, "name": name}
            for k, v in attrs.items():
                query += f"\nSET n.{k} = ${k}"
                params[k] = v
            session.run(query, **params)

    def import_relation(self, src_id: str, rel_type: str, tgt_id: str, **props):
        with self.driver.session() as session:
            query = f"""
                MATCH (a {{id: $src_id}})
                MATCH (b {{id: $tgt_id}})
                MERGE (a)-[r:{rel_type}]->(b)
            """
            params = {"src_id": src_id, "tgt_id": tgt_id}
            for k, v in props.items():
                query += f"\nSET r.{k} = ${k}"
                params[k] = v
            session.run(query, **params)

    def close(self):
        self.driver.close()
```

#### 步骤5：查询验证

```cypher
// 查询某企业的完整股权链
MATCH path = (c:Company {name: "蚂蚁集团"})-[:SHAREHOLDER_OF|FOUNDED*1..3]-(related)
RETURN path LIMIT 50

// 查询两个企业之间的最短关联路径
MATCH p = shortestPath(
  (a:Company {name: "阿里巴巴"})-[:INVESTED|SHAREHOLDER_OF|FOUNDED*]-(b:Company {name: "滴滴出行"})
)
RETURN p

// 查询某人的所有关联企业
MATCH (p:Person {name: "马云"})-[r:FOUNDED|CEO|SHAREHOLDER_OF]->(c:Company)
RETURN p.name, type(r) AS relation, c.name

// 社区检测：识别企业关联群
CALL gds.louvain.stream('finance-graph')
YIELD nodeId, communityId
MATCH (n) WHERE id(n) = nodeId AND n:Company
RETURN n.name AS company, communityId
ORDER BY communityId
```

### 14.7.4 使用场景

- **企业尽职调查**：自动发现目标企业的关联方、担保圈
- **供应链分析**：追踪上下游企业关系网络
- **监管合规**：检测关联交易、利益输送等异常模式
- **投资决策**：分析企业间的投资关系和股权结构

### 14.7.5 潜在风险与注意事项

- **数据时效性**：工商数据、新闻数据具有时效性，需设计增量更新机制
- **实体歧义**：同名不同实体（如"马云"可能指不同人），需结合上下文消歧
- **关系稀疏性**：冷启动阶段图谱稀疏，查询结果可能不理想，可先导入结构化数据
- **隐私合规**：涉及个人信息的实体需脱敏处理，遵守数据保护法规

### 14.7.6 本章小结

本节完整演示了从原始数据到可查询知识图谱的全流程。核心要点：Schema 先行、NER+RE 联合抽取、实体对齐去重、图数据库高效存储。实际项目中建议先以结构化数据（工商注册信息）构建骨架，再以非结构化数据（新闻、公告）丰富细节。

---

## 14.8 知识图谱质量评估

### 14.8.1 解决的问题

知识图谱的质量直接决定其应用价值。错误的三元组会导致问答系统给出错误答案、推荐系统做出错误推荐、风控系统产生误报。质量评估的目标是系统性地度量图谱的准确性、完整性和一致性，并建立持续改进机制。

### 14.8.2 核心原理

**质量评估维度**：

| 维度 | 定义 | 度量方法 |
|------|------|----------|
| 准确率 (Accuracy) | 三元组与事实一致的比例 | 人工抽样评估、远程监督验证 |
| 完整度 (Completeness) | 图谱覆盖真实世界知识的比例 | 与权威知识库对比、密度分析 |
| 一致性 (Consistency) | 图谱内部无逻辑矛盾 | 规则检查、OWL 一致性检测 |
| 时效性 (Timeliness) | 知识是否过时 | 时间戳检查、更新频率统计 |

**评估指标**：

```
准确率 = 正确三元组数 / 总三元组数
召回率 = 图谱中正确三元组数 / 真实世界中总三元组数
F1 = 2 * 准确率 * 召回率 / (准确率 + 召回率)
密度 = 关系边数 / (实体数 * (实体数 - 1))
```

### 14.8.3 代码/配置实现

#### 质量评估框架（Python）

```python
from dataclasses import dataclass
from typing import Callable
import random

@dataclass
class QualityReport:
    accuracy: float
    completeness: float
    consistency: float
    density: float
    details: dict

class KnowledgeGraphEvaluator:
    def __init__(self, triples: list[tuple], schema: dict):
        self.triples = triples
        self.schema = schema  # 关系类型定义及定义域/值域约束

    def evaluate(self, sample_ratio: float = 0.05) -> QualityReport:
        return QualityReport(
            accuracy=self._measure_accuracy(sample_ratio),
            completeness=self._measure_completeness(),
            consistency=self._check_consistency(),
            density=self._compute_density(),
            details={
                "total_entities": self._count_entities(),
                "total_relations": len(self.triples),
                "relation_types": self._count_relation_types(),
            }
        )

    def _measure_accuracy(self, sample_ratio: float) -> float:
        """抽样人工评估准确率"""
        sample = random.sample(self.triples,
                               max(1, int(len(self.triples) * sample_ratio)))
        correct = 0
        for h, r, t in sample:
            # 实际项目中此处应调用人工审核接口
            if self._auto_verify(h, r, t):
                correct += 1
        return correct / len(sample)

    def _auto_verify(self, h: str, r: str, t: str) -> bool:
        """自动验证：检查定义域/值域约束"""
        if r in self.schema:
            domain = self.schema[r].get("domain", set())
            range_ = self.schema[r].get("range", set())
            # 检查实体类型是否匹配
            h_type = self._infer_type(h)
            t_type = self._infer_type(t)
            if domain and h_type not in domain:
                return False
            if range_ and t_type not in range_:
                return False
        return True

    def _measure_completeness(self) -> float:
        """完整度：当前关系数 / 预期关系数"""
        entities = self._count_entities()
        expected = entities * (entities - 1) * 0.01  # 假设1%的实体对有关系
        return min(1.0, len(self.triples) / expected) if expected > 0 else 0

    def _check_consistency(self) -> float:
        """一致性检查：无矛盾的三元组比例"""
        conflicts = 0
        # 检查属性值冲突
        attr_values = {}
        for h, r, t in self.triples:
            if r in {"birthYear", "foundedYear", "height"}:
                key = (h, r)
                if key in attr_values and attr_values[key] != t:
                    conflicts += 1
                attr_values[key] = t
        # 检查关系互斥
        for h, r, t in self.triples:
            if r == "parentOf" and (t, "parentOf", h) in self.triples:
                conflicts += 1  # 亲子关系不能对称
        return 1 - (conflicts / len(self.triples)) if self.triples else 1

    def _compute_density(self) -> float:
        entities = self._count_entities()
        if entities <= 1:
            return 0
        return len(self.triples) / (entities * (entities - 1))

    def _count_entities(self) -> int:
        all_entities = set()
        for h, r, t in self.triples:
            all_entities.add(h)
            all_entities.add(t)
        return len(all_entities)

    def _count_relation_types(self) -> dict:
        counts = {}
        for _, r, _ in self.triples:
            counts[r] = counts.get(r, 0) + 1
        return counts

    def _infer_type(self, entity: str) -> str:
        # 简化：根据命名规则推断实体类型
        if entity.endswith(("公司", "集团", "有限")):
            return "Company"
        return "Person"
```

#### 一致性检查规则引擎（Java）

```java
import java.util.*;
import java.util.stream.*;

public class ConsistencyChecker {
    record Triple(String s, String p, String o) {}
    record Violation(String rule, String description, Triple triple) {}

    private final List<Triple> triples;

    public ConsistencyChecker(List<Triple> triples) { this.triples = triples; }

    public List<Violation> checkAll() {
        List<Violation> violations = new ArrayList<>();
        violations.addAll(checkDomainRange());
        violations.addAll(checkSymmetricConflict());
        violations.addAll(checkFunctionalProperty());
        violations.addAll(checkTransitiveClosure());
        return violations;
    }

    // 检查定义域/值域
    private List<Violation> checkDomainRange() {
        Map<String, String> domain = Map.of("foundedBy", "Company", "ceoOf", "Person");
        Map<String, String> range = Map.of("foundedBy", "Person", "ceoOf", "Company");
        return triples.stream()
            .filter(t -> domain.containsKey(t.p()) && !t.s().endsWith(domain.get(t.p())))
            .map(t -> new Violation("domain-range",
                "Subject type mismatch for " + t.p(), t))
            .collect(Collectors.toList());
    }

    // 检查对称冲突（如 parentOf 不能对称）
    private List<Violation> checkSymmetricConflict() {
        Set<String> asymmetric = Set.of("parentOf", "founderOf", "ceoOf");
        Set<String> seen = triples.stream()
            .map(t -> t.s() + "|" + t.p() + "|" + t.o())
            .collect(Collectors.toSet());
        return triples.stream()
            .filter(t -> asymmetric.contains(t.p())
                && seen.contains(t.o() + "|" + t.p() + "|" + t.s()))
            .map(t -> new Violation("symmetric-conflict",
                "Asymmetric relation " + t.p() + " has symmetric instance", t))
            .collect(Collectors.toList());
    }

    // 检查函数属性（一个实体只能有一个值）
    private List<Violation> checkFunctionalProperty() {
        Set<String> functional = Set.of("birthYear", "nationality");
        Map<String, Set<String>> values = new HashMap<>();
        List<Violation> violations = new ArrayList<>();
        for (Triple t : triples) {
            if (!functional.contains(t.p())) continue;
            String key = t.s() + "|" + t.p();
            values.computeIfAbsent(key, k -> new HashSet<>()).add(t.o());
            if (values.get(key).size() > 1) {
                violations.add(new Violation("functional-property",
                    "Multiple values for functional property " + t.p(), t));
            }
        }
        return violations;
    }

    // 检查传递闭包（如 locatedIn 不应有环）
    private List<Violation> checkTransitiveClosure() {
        Set<String> transitive = Set.of("locatedIn", "subClassOf");
        List<Violation> violations = new ArrayList<>();
        for (String rel : transitive) {
            Map<String, List<String>> graph = triples.stream()
                .filter(t -> t.p().equals(rel))
                .collect(Collectors.groupingBy(
                    Triple::s, Collectors.mapping(Triple::o, Collectors.toList())));
            for (String start : graph.keySet()) {
                if (hasCycle(start, graph, new HashSet<>())) {
                    violations.add(new Violation("transitive-cycle",
                        "Cycle detected in " + rel + " starting from " + start,
                        new Triple(start, rel, "?")));
                }
            }
        }
        return violations;
    }

    private boolean hasCycle(String node, Map<String, List<String>> graph,
                             Set<String> visited) {
        if (visited.contains(node)) return true;
        visited.add(node);
        for (String neighbor : graph.getOrDefault(node, List.of())) {
            if (hasCycle(neighbor, graph, visited)) return true;
        }
        visited.remove(node);
        return false;
    }
}
```

#### 持续更新机制

```python
class IncrementalUpdater:
    """知识图谱增量更新"""

    def __init__(self, db_client, evaluator):
        self.db = db_client
        self.evaluator = evaluator

    def update(self, new_triples: list[tuple], source: str):
        # 1. 冲突检测
        conflicts = self._detect_conflicts(new_triples)
        # 2. 解决冲突
        resolved = self._resolve_conflicts(conflicts)
        # 3. 插入新三元组
        for h, r, t in resolved:
            self.db.insert(h, r, t, source=source, timestamp=time.time())
        # 4. 重新评估质量
        report = self.evaluator.evaluate()
        # 5. 如果质量下降，回滚
        if report.accuracy < 0.9:
            self.db.rollback()
            raise ValueError(f"Update rejected: accuracy {report.accuracy:.2f} < 0.9")
        return report

    def _detect_conflicts(self, new_triples: list[tuple]) -> list[tuple]:
        existing = self.db.query_all()
        conflicts = []
        for h, r, t in new_triples:
            for eh, er, et in existing:
                if h == eh and r == er and t != et:
                    conflicts.append((h, r, t, et))
        return conflicts

    def _resolve_conflicts(self, conflicts: list[tuple]) -> list[tuple]:
        # 策略：新数据覆盖旧数据（假设新数据更准确）
        return [(h, r, t) for h, r, t, _ in conflicts]
```

### 14.8.4 使用场景

- **图谱上线前评估**：在知识图谱发布前进行全面的质量审计
- **增量更新验证**：每次数据更新后自动验证质量是否下降
- **多源融合质量监控**：监控不同数据源对图谱质量的贡献
- **长期质量趋势分析**：追踪图谱质量随时间的变化趋势

### 14.8.5 潜在风险与注意事项

- **抽样偏差**：随机抽样可能遗漏特定类型的错误，建议分层抽样
- **人工评估成本**：大规模图谱的准确率评估需要大量人工，可结合众包平台
- **完整度难以绝对度量**：真实世界的知识总量未知，完整度通常是相对指标
- **一致性检查的局限性**：OWL 一致性检测在大型图谱上可能不可判定，需使用轻量级规则

### 14.8.6 本章小结

知识图谱质量评估是保证图谱可用性的必要环节。准确率、完整度、一致性、时效性四个维度构成完整的评估体系。持续的质量监控和增量更新机制确保图谱在动态环境中保持高质量。建议在构建初期就建立质量评估流水线，避免"先污染后治理"。

---

## 14.9 总结与展望

### 14.9.1 全章回顾

本章系统性地介绍了知识图谱构建的完整技术栈：

1. **NER**：从规则到深度学习的实体识别技术
2. **关系抽取**：从模式匹配到 Prompt-LLM 的关系发现方法
3. **知识融合**：实体对齐与冲突解决
4. **图存储**：Neo4j/JanusGraph 的存储模式与索引策略
5. **知识推理**：本体推理、规则引擎与图推理
6. **实战案例**：金融领域企业关联知识图谱
7. **质量评估**：准确率、完整度、一致性、时效性

### 14.9.2 技术趋势

- **大语言模型驱动**：LLM 正在重塑知识图谱构建范式，从传统的流水线模式向"端到端 LLM 抽取 + 符号验证"演进
- **多模态知识图谱**：融合文本、图像、视频的多模态知识图谱成为研究热点
- **动态知识图谱**：从静态快照向流式更新的时序知识图谱演进
- **自动化构建**：AutoKG 等自动化构建工具降低知识图谱构建门槛
- **联邦知识图谱**：跨组织、跨领域的安全知识共享与联邦学习

### 14.9.3 工程建议

- **渐进式构建**：先构建核心 Schema 和高质量种子数据，再逐步扩展
- **人机协同**：全自动构建质量不可控，建议采用"机器构建 + 人工审核"的闭环
- **监控告警**：建立知识图谱的实时质量监控和异常告警机制
- **版本管理**：知识图谱应像代码一样进行版本管理，支持回滚和 diff
