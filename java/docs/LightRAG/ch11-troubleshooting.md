# 第11章 典型问题排查指南

## 11.1 概述

### 解决的问题

LightRAG 作为一个将图索引与检索增强生成相结合的复杂系统，在实际落地过程中会遇到各种问题。实体提取不准确导致图质量下降、关系遗漏使多跳推理失效、检索结果不相关让用户失去信任、Token 消耗过高推高运营成本、索引构建失败阻塞上线流程、增量更新冲突破坏知识一致性——这些问题在从原型到生产的每个阶段都可能出现。

本章的目标不是罗列所有可能的错误，而是提供一套**可操作的问题排查方法论**。每个问题都包含：问题现象 → 根因分析 → 诊断代码 → 解决方案 → 预防措施。读者可以将本章作为一本"故障手册"，在实际遇到问题时快速定位并修复。

### 核心原理

LightRAG 系统的故障可以归因于三个层面：

1. **输入层问题**：源文档质量、分块策略、提示词设计
2. **处理层问题**：LLM 调用、嵌入模型、图构建逻辑
3. **输出层问题**：检索策略、结果融合、答案生成

排查问题的核心思路是**分层隔离法**：从输出层反向追溯，逐层缩小范围，直到定位根因。本章将围绕这一方法论展开。

---

## 11.2 实体提取不准确

### 11.2.1 问题现象

实体提取是 LightRAG 图索引构建的第一步，也是最容易出问题的环节。典型表现包括：

- **实体遗漏**：文档中的关键实体未被提取，导致后续检索无法命中
- **实体幻觉**：提取了文档中不存在的实体，引入噪声
- **实体碎片化**：同一实体被提取为多个不同名称（如"苹果公司"和"Apple Inc."）
- **类型错误**：实体类型分类错误（如将产品名识别为人名）
- **边界错误**：实体边界识别错误（如"深度学习框架"被提取为"深度"和"学习框架"两个实体）

### 11.2.2 根因分析

实体提取不准确的根本原因通常来自以下方面：

| 根因 | 说明 | 典型场景 |
|------|------|---------|
| **提示词设计不当** | 实体提取的 LLM 提示词缺乏明确的定义和示例 | 未指定实体类型、未提供领域示例 |
| **领域术语未覆盖** | LLM 对特定领域的专业术语识别能力不足 | 医疗术语、法律条款、技术缩写 |
| **上下文窗口限制** | 文档块过大或过小，LLM 无法获取足够的上下文 | 长文档中实体依赖跨段落的上下文 |
| **LLM 能力不足** | 使用的 LLM 模型 NER 能力有限 | 使用轻量模型处理复杂领域 |
| **分块策略不当** | 分块破坏了实体的完整性 | 在实体中间切分文本块 |

### 11.2.3 诊断方法

```python
"""
实体提取质量诊断工具
"""
import json
from typing import List, Dict, Any
from dataclasses import dataclass, field


@dataclass
class EntityExtractionDiagnostic:
    """实体提取诊断结果"""
    document: str
    extracted_entities: List[Dict[str, str]]
    expected_entities: List[Dict[str, str]] = field(default_factory=list)
    precision: float = 0.0
    recall: float = 0.0
    f1_score: float = 0.0
    issues: List[str] = field(default_factory=list)


class EntityExtractionTester:
    """实体提取质量测试器"""

    def __init__(self, llm_extract_func):
        self.llm_extract = llm_extract_func

    def analyze_extraction(self, document: str) -> EntityExtractionDiagnostic:
        """分析单篇文档的实体提取质量"""
        extracted = self.llm_extract(document)
        diag = EntityExtractionDiagnostic(
            document=document[:200],
            extracted_entities=extracted
        )

        # 检查1：空提取
        if not extracted:
            diag.issues.append("未提取到任何实体")
            return diag

        # 检查2：实体名称质量
        for ent in extracted:
            name = ent.get("name", "")
            if len(name) <= 1:
                diag.issues.append(f"实体名称过短: '{name}'")
            if not name.strip():
                diag.issues.append("存在空名称实体")

        # 检查3：重复实体
        names = [e.get("name", "") for e in extracted]
        if len(names) != len(set(names)):
            duplicates = [n for n in names if names.count(n) > 1]
            diag.issues.append(f"存在重复实体: {set(duplicates)}")

        # 检查4：类型分布
        types = [e.get("type", "unknown") for e in extracted]
        if "unknown" in types:
            diag.issues.append(f"存在未分类实体 ({types.count('unknown')}个)")

        # 检查5：描述质量
        for ent in extracted:
            desc = ent.get("description", "")
            if len(desc) < 5:
                diag.issues.append(
                    f"实体 '{ent.get('name', '')}' 描述过短"
                )

        return diag

    def batch_analyze(
        self, documents: List[str]
    ) -> List[EntityExtractionDiagnostic]:
        """批量分析多篇文档"""
        return [self.analyze_extraction(doc) for doc in documents]

    def generate_report(self, diagnostics: List[EntityExtractionDiagnostic]):
        """生成诊断报告"""
        total = len(diagnostics)
        empty_count = sum(
            1 for d in diagnostics if not d.extracted_entities
        )
        duplicate_count = sum(
            1 for d in diagnostics
            if any("重复" in issue for issue in d.issues)
        )
        short_name_count = sum(
            1 for d in diagnostics
            if any("过短" in issue for issue in d.issues)
        )

        print("=" * 60)
        print("实体提取质量诊断报告")
        print("=" * 60)
        print(f"分析文档数: {total}")
        print(f"空提取文档: {empty_count} ({empty_count/total*100:.1f}%)")
        print(f"含重复实体: {duplicate_count} ({duplicate_count/total*100:.1f}%)")
        print(f"含过短名称: {short_name_count} ({short_name_count/total*100:.1f}%)")
        print()

        # 详细问题列表
        print("--- 详细问题 ---")
        for i, diag in enumerate(diagnostics):
            if diag.issues:
                print(f"\n文档 {i+1}:")
                for issue in diag.issues:
                    print(f"  - {issue}")
                print(f"  提取实体: {[e.get('name','') for e in diag.extracted_entities]}")


def diagnose_entity_extraction():
    """实体提取诊断演示"""
    # 模拟 LLM 提取函数
    def mock_extract(text: str) -> List[Dict[str, str]]:
        if "苹果" in text:
            return [
                {"name": "苹果公司", "type": "organization",
                 "description": "科技公司"},
                {"name": "iPhone", "type": "product",
                 "description": "智能手机产品"},
            ]
        return []

    tester = EntityExtractionTester(mock_extract)

    test_docs = [
        "苹果公司发布了新款iPhone，搭载了A18芯片。",
        "OpenAI推出了GPT-4o模型，支持多模态输入。",
        "某公司发布了新产品。",  # 模糊文档
    ]

    diagnostics = tester.batch_analyze(test_docs)
    tester.generate_report(diagnostics)


if __name__ == "__main__":
    diagnose_entity_extraction()
```

### 11.2.4 解决方案

**方案一：优化提示词设计**

实体提取的提示词是影响质量的最关键因素。以下是经过优化的提示词模板：

```python
ENTITY_EXTRACTION_PROMPT_TEMPLATE = """你是一个专业的命名实体识别（NER）系统。
请从以下文本中提取所有重要实体，并按照指定的 JSON 格式返回。

## 实体类型定义
- person: 人名（包括全名、称呼、职称+人名）
- organization: 组织名（公司、机构、团队、部门）
- product: 产品名（软件、硬件、服务、版本号）
- concept: 概念/术语（技术名词、理论、方法论）
- location: 地名（国家、城市、地址）
- event: 事件名（会议、发布活动、里程碑）
- time: 时间表达（日期、时间段、频率）

## 提取规则
1. 只提取文本中明确出现的实体，不要编造
2. 实体名称保持原文形式，不要缩写或扩展
3. 每个实体必须提供有意义的描述（至少10个字符）
4. 如果实体有别名，在 aliases 字段中列出
5. 对于复合术语（如"深度学习框架"），提取为完整短语

## 领域上下文
{domain_context}

## 文本
{text}

## 输出格式（JSON数组）
[
  {{
    "name": "实体名称",
    "type": "实体类型",
    "description": "实体描述（基于文本内容）",
    "aliases": ["别名1", "别名2"]
  }}
]

只输出 JSON 数组，不要包含其他内容。"""


def build_entity_prompt(
    text: str,
    domain: str = "通用",
    domain_vocab: List[str] = None
) -> str:
    """构建带领域上下文的实体提取提示词"""
    domain_context = f"领域：{domain}"
    if domain_vocab:
        domain_context += f"\n领域关键词汇：{', '.join(domain_vocab)}"
    return ENTITY_EXTRACTION_PROMPT_TEMPLATE.format(
        domain_context=domain_context,
        text=text
    )
```

**方案二：领域词汇表注入**

对于专业领域，预先提供领域词汇表可以显著提升实体识别准确率：

```python
class DomainVocabularyInjector:
    """领域词汇注入器"""

    def __init__(self):
        self.vocabularies = {}

    def register_domain(self, domain: str, vocab: List[str]):
        self.vocabularies[domain] = vocab

    def get_prompt_with_vocab(self, text: str, domain: str) -> str:
        vocab = self.vocabularies.get(domain, [])
        return build_entity_prompt(text, domain, vocab)


# 注册领域词汇
injector = DomainVocabularyInjector()
injector.register_domain("医疗", [
    "冠状动脉", "心肌梗死", "糖皮质激素", "甲氨蝶呤",
    "CT扫描", "MRI", "血压", "心率", "心电图"
])
injector.register_domain("金融", [
    "市盈率", "净资产收益率", "流动性覆盖率",
    "不良贷款率", "拨备覆盖率", "资本充足率"
])
```

**方案三：多模型投票**

使用多个 LLM 分别提取实体，通过投票机制提高准确率：

```python
class EnsembleEntityExtractor:
    """集成实体提取器（多模型投票）"""

    def __init__(self, extractors: List[callable]):
        self.extractors = extractors

    def extract(self, text: str) -> List[Dict[str, str]]:
        all_entities = []
        for extractor in self.extractors:
            try:
                entities = extractor(text)
                all_entities.extend(entities)
            except Exception:
                continue

        return self._vote_merge(all_entities)

    def _vote_merge(
        self, all_entities: List[Dict[str, str]]
    ) -> List[Dict[str, str]]:
        from collections import defaultdict

        name_votes = defaultdict(list)
        for ent in all_entities:
            name = ent.get("name", "").strip()
            if name:
                name_votes[name].append(ent)

        threshold = max(1, len(self.extractors) // 2)
        result = []
        for name, votes in name_votes.items():
            if len(votes) >= threshold:
                result.append(votes[0])

        return result
```

### 11.2.5 预防措施

1. **建立实体提取评估集**：准备 50-100 篇标注好实体的文档，定期评估提取质量
2. **设置实体白名单**：对已知的重要实体，直接加入白名单确保不被遗漏
3. **人工审核机制**：对高价值文档的实体提取结果进行抽样人工审核
4. **渐进式提示词优化**：从通用提示词开始，根据评估结果逐步添加领域示例

---

## 11.3 关系遗漏

### 11.3.1 问题现象

关系提取的质量直接决定了 LightRAG 多跳推理的能力。关系遗漏的典型表现：

- **关系缺失**：文档中明确描述的实体关系未被提取
- **关系方向错误**：关系方向颠倒（如"A被B收购"提取为"B被A收购"）
- **关系类型泛化**：所有关系都被归类为"相关"或"关联"，缺乏语义区分
- **跨句关系断裂**：关系跨越多个句子时未被识别
- **隐式关系遗漏**：通过上下文暗示而非明确表述的关系未被提取

### 11.3.2 根因分析

| 根因 | 说明 | 诊断方法 |
|------|------|---------|
| **提示词缺乏关系类型定义** | 未定义关系类型体系，LLM 使用默认的通用关系 | 检查提取的关系类型分布 |
| **上下文窗口不足** | 关系跨越多个句子，超出 LLM 的单次处理范围 | 检查文档分块边界 |
| **实体提取先行缺陷** | 实体未被提取，关系自然无法建立 | 先修复实体提取 |
| **LLM 指令遵循能力弱** | 模型无法准确理解关系提取指令 | 对比不同模型的表现 |
| **隐式关系理解不足** | 模型无法推理出文本暗示的关系 | 使用更强的 LLM 或添加推理步骤 |

### 11.3.3 诊断方法

```python
class RelationExtractionDiagnostic:
    """关系提取质量诊断"""

    def __init__(self, llm_relation_func):
        self.extract_relations = llm_relation_func

    def check_relation_density(self, document: str) -> Dict[str, Any]:
        """检查关系密度"""
        relations = self.extract_relations(document)
        entities = self._extract_entities(document)

        n_entities = len(entities)
        n_relations = len(relations)
        max_possible = n_entities * (n_entities - 1) / 2

        density = n_relations / max_possible if max_possible > 0 else 0

        return {
            "entity_count": n_entities,
            "relation_count": n_relations,
            "max_possible_relations": max_possible,
            "density": density,
            "relations": relations,
            "warning": None
        }

    def check_relation_type_distribution(
        self, documents: List[str]
    ) -> Dict[str, int]:
        """检查关系类型分布"""
        type_counts = {}
        for doc in documents:
            relations = self.extract_relations(doc)
            for rel in relations:
                rtype = rel.get("type", "unknown")
                type_counts[rtype] = type_counts.get(rtype, 0) + 1
        return type_counts

    def _extract_entities(self, text: str) -> List[str]:
        """简易实体提取（用于密度计算）"""
        import re
        # 使用正则提取可能的实体（大写词、引号内容等）
        candidates = re.findall(r'"[^"]+"|\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b', text)
        return list(set(candidates))


def diagnose_relation_quality():
    """关系提取质量诊断演示"""
    def mock_relations(text: str) -> List[Dict[str, str]]:
        if "苹果" in text and "收购" in text:
            return [
                {"source": "苹果公司", "target": "Beats",
                 "type": "收购", "description": "苹果公司收购了Beats"}
            ]
        return [{"source": "A", "target": "B", "type": "相关",
                 "description": "A和B相关"}]

    diag = RelationExtractionDiagnostic(mock_relations)

    # 检查关系类型分布
    docs = [
        "苹果公司收购了Beats电子产品和音乐流媒体服务。",
        "微软投资了OpenAI，金额达130亿美元。",
        "特斯拉与松下合作生产电池。",
    ]
    type_dist = diag.check_relation_type_distribution(docs)
    print("关系类型分布:", type_dist)

    # 如果所有关系都是"相关"类型，说明关系提取过于泛化
    if type_dist.get("相关", 0) > 0 and len(type_dist) <= 2:
        print("警告：关系类型过于泛化，建议定义更细粒度的关系类型体系")


if __name__ == "__main__":
    diagnose_relation_quality()
```

### 11.3.4 解决方案

**方案一：定义关系类型体系**

```python
RELATION_TYPE_SYSTEM = {
    "收购": "acquired",
    "投资": "invested_in",
    "合作": "collaborates_with",
    "竞争": "competes_with",
    "供应": "supplies",
    "开发": "develops",
    "使用": "uses",
    "位于": "located_in",
    "隶属于": "subsidiary_of",
    "创立": "founded_by",
    "领导": "led_by",
    "发布": "released",
    "包含": "contains",
    "影响": "influences",
    "导致": "causes",
}

RELATION_EXTRACTION_PROMPT = """从以下文本中提取实体之间的关系。

## 关系类型定义
{relation_definitions}

## 提取规则
1. 只提取文本中明确存在的关系
2. 关系方向必须与文本描述一致
3. 每个关系必须提供描述性证据
4. 如果同一对实体存在多种关系，全部提取

## 文本
{text}

## 输出格式
[
  {{
    "source": "源实体名称",
    "target": "目标实体名称",
    "type": "关系类型（从上述定义中选择）",
    "description": "关系描述（引用原文证据）"
  }}
]"""


def build_relation_prompt(text: str) -> str:
    """构建关系提取提示词"""
    definitions = "\n".join([
        f"- {k}: {v}" for k, v in RELATION_TYPE_SYSTEM.items()
    ])
    return RELATION_EXTRACTION_PROMPT.format(
        relation_definitions=definitions,
        text=text
    )
```

**方案二：跨句关系推理**

对于跨越多个句子的关系，使用滑动窗口策略：

```python
class CrossSentenceRelationExtractor:
    """跨句关系提取器"""

    def __init__(self, llm_func, window_size: int = 3):
        self.llm = llm_func
        self.window_size = window_size

    def extract(self, text: str) -> List[Dict[str, str]]:
        sentences = self._split_sentences(text)
        all_relations = []

        for i in range(len(sentences)):
            window = sentences[i:i + self.window_size]
            window_text = " ".join(window)
            relations = self._extract_from_window(window_text)
            all_relations.extend(relations)

        return self._deduplicate(all_relations)

    def _split_sentences(self, text: str) -> List[str]:
        import re
        sentences = re.split(r'[。！？\n]', text)
        return [s.strip() for s in sentences if s.strip()]

    def _extract_from_window(self, window_text: str) -> List[Dict[str, str]]:
        prompt = build_relation_prompt(window_text)
        response = self.llm(prompt)
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return []

    def _deduplicate(
        self, relations: List[Dict[str, str]]
    ) -> List[Dict[str, str]]:
        seen = set()
        unique = []
        for rel in relations:
            key = (rel.get("source"), rel.get("target"), rel.get("type"))
            if key not in seen:
                seen.add(key)
                unique.append(rel)
        return unique
```

**方案三：实体-关系联合提取**

将实体提取和关系提取合并为一步，避免级联错误：

```python
JOINT_EXTRACTION_PROMPT = """从以下文本中同时提取实体和关系。

## 任务
1. 先识别所有重要实体
2. 再识别实体之间的关系

## 文本
{text}

## 输出格式
{{
  "entities": [
    {{"name": "实体名", "type": "实体类型", "description": "描述"}}
  ],
  "relations": [
    {{"source": "源实体", "target": "目标实体", "type": "关系类型", "description": "描述"}}
  ]
}}"""


class JointExtractor:
    """实体-关系联合提取器"""

    def __init__(self, llm_func):
        self.llm = llm_func

    def extract(self, text: str) -> Dict[str, List]:
        prompt = JOINT_EXTRACTION_PROMPT.format(text=text)
        response = self.llm(prompt)
        try:
            result = json.loads(response)
            return {
                "entities": result.get("entities", []),
                "relations": result.get("relations", []),
            }
        except (json.JSONDecodeError, KeyError):
            return {"entities": [], "relations": []}
```

### 11.3.5 预防措施

1. **关系类型体系先行**：在构建索引前，先定义好领域的关系类型体系
2. **关系密度监控**：监控每篇文档的关系密度，低于阈值时触发告警
3. **人工标注验证**：对关键文档进行人工关系标注，与自动提取结果对比
4. **多源交叉验证**：同一关系从多个文档中提取时，进行交叉验证

---

## 11.4 检索结果不相关

### 11.4.1 问题现象

检索结果不相关是用户最直观感受到的问题，表现为：

- **答非所问**：检索到的内容与问题完全无关
- **信息碎片化**：检索到相关实体但缺乏关键上下文
- **遗漏关键信息**：图中有相关信息但未被检索到
- **过度泛化**：高层检索返回过于宽泛的摘要
- **检索结果单一**：多次查询返回相似结果，缺乏多样性

### 11.4.2 根因分析

| 根因 | 说明 | 诊断方法 |
|------|------|---------|
| **查询模式不匹配** | 问题类型与检索模式（low/high/hybrid）不匹配 | 分析问题类型，尝试不同模式 |
| **嵌入模型质量差** | 向量嵌入无法准确捕捉语义 | 对比不同嵌入模型的检索效果 |
| **图结构质量差** | 实体和关系提取不准确导致图结构混乱 | 先诊断实体提取和关系提取 |
| **Top-K 参数不当** | 返回结果过多或过少 | 调整 top_k 参数 |
| **查询表述模糊** | 用户问题过于模糊，无法匹配到具体实体 | 使用查询重写 |

### 11.4.3 诊断方法

```python
class RetrievalQualityDiagnostic:
    """检索质量诊断工具"""

    def __init__(self, rag_instance):
        self.rag = rag_instance

    def compare_modes(
        self, question: str, top_k: int = 10
    ) -> Dict[str, Any]:
        """对比三种检索模式的结果"""
        from lightrag import QueryParam

        results = {}
        for mode in ["low", "high", "hybrid"]:
            param = QueryParam(mode=mode, top_k=top_k)
            answer = self.rag.query(question, param=param)
            results[mode] = {
                "answer": answer,
                "answer_length": len(answer),
            }

        return results

    def analyze_retrieval_gap(
        self, question: str, expected_answer: str
    ) -> Dict[str, Any]:
        """分析检索差距：期望答案 vs 实际答案"""
        from lightrag import QueryParam

        param = QueryParam(mode="hybrid", top_k=10)
        actual = self.rag.query(question, param=param)

        # 计算答案覆盖度（基于关键词）
        import re
        expected_keywords = set(re.findall(r'\w+', expected_answer))
        actual_keywords = set(re.findall(r'\w+', actual))

        overlap = expected_keywords & actual_keywords
        coverage = len(overlap) / len(expected_keywords) if expected_keywords else 0

        return {
            "question": question,
            "expected_answer": expected_answer,
            "actual_answer": actual,
            "keyword_coverage": coverage,
            "missing_keywords": expected_keywords - actual_keywords,
        }

    def test_query_variations(
        self, base_question: str, variations: List[str]
    ) -> List[Dict[str, Any]]:
        """测试同一问题的不同表述对检索结果的影响"""
        results = []
        for q in [base_question] + variations:
            from lightrag import QueryParam
            param = QueryParam(mode="hybrid", top_k=5)
            answer = self.rag.query(q, param=param)
            results.append({
                "question": q,
                "answer": answer[:200],
            })
        return results


def diagnose_retrieval_quality():
    """检索质量诊断演示"""
    print("检索质量诊断")
    print("=" * 60)

    # 模拟诊断
    question = "苹果公司最新发布了什么产品？"
    print(f"\n问题: {question}")

    print("\n1. 模式对比诊断")
    print("   建议: 对具体事实类问题使用 low 模式，")
    print("   对主题概览类问题使用 high 模式，")
    print("   对复杂推理类问题使用 hybrid 模式")

    print("\n2. 查询表述诊断")
    print("   检查问题中是否包含图索引中的实体名称")
    print("   如果实体是'Apple Inc.'但问题中用的是'苹果公司'，")
    print("   需要检查实体去重和别名管理")

    print("\n3. 检索参数诊断")
    print("   top_k 过小 → 可能遗漏相关信息")
    print("   top_k 过大 → 可能引入噪声")
    print("   推荐值: 具体查询 5-10, 概览查询 10-20")


if __name__ == "__main__":
    diagnose_retrieval_quality()
```

### 11.4.4 解决方案

**方案一：查询模式自动选择**

```python
class QueryModeClassifier:
    """查询模式自动分类器"""

    def classify(self, question: str) -> str:
        """自动判断最适合的查询模式"""
        # 具体事实查询特征
        fact_indicators = [
            "多少", "什么时间", "在哪里", "是谁",
            "如何", "步骤", "方法", "参数", "配置",
            "数值", "比例", "金额", "数量",
        ]

        # 概览查询特征
        overview_indicators = [
            "总结", "概述", "有哪些", "分类",
            "趋势", "发展", "变化", "对比",
            "关系", "影响", "意义",
        ]

        # 复杂推理特征
        reasoning_indicators = [
            "为什么", "原因", "导致", "如果",
            "假设", "推理", "分析", "比较",
            "综合", "结合",
        ]

        for indicator in reasoning_indicators:
            if indicator in question:
                return "hybrid"

        for indicator in overview_indicators:
            if indicator in question:
                return "high"

        for indicator in fact_indicators:
            if indicator in question:
                return "low"

        return "hybrid"  # 默认使用混合模式


class AdaptiveRetriever:
    """自适应检索器"""

    def __init__(self, rag_instance):
        self.rag = rag_instance
        self.classifier = QueryModeClassifier()

    def retrieve(self, question: str, **kwargs) -> str:
        mode = self.classifier.classify(question)
        from lightrag import QueryParam
        param = QueryParam(mode=mode, **kwargs)
        return self.rag.query(question, param=param)
```

**方案二：查询重写与扩展**

```python
class QueryRewriter:
    """查询重写器：提升检索命中率"""

    def __init__(self, llm_func):
        self.llm = llm_func

    def rewrite(self, question: str) -> str:
        prompt = f"""将以下用户问题改写为更适合知识图谱检索的形式：

## 改写规则
1. 提取核心实体名称
2. 使用标准化的实体名称（而非口语化表达）
3. 明确化模糊指代
4. 保持原意不变

## 用户问题
{question}

## 改写后的问题（直接输出，不要解释）："""
        return self.llm(prompt)

    def expand(self, question: str, n_variations: int = 3) -> List[str]:
        """生成多个查询变体"""
        prompt = f"""为以下问题生成{n_variations}个语义等价的查询变体，
用于知识库检索。每个变体使用不同的表述方式。

原始问题: {question}

以JSON数组格式输出，每个元素是一个字符串："""
        response = self.llm(prompt)
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return [question]

    def multi_query_retrieve(
        self, rag_instance, question: str, top_k: int = 5
    ) -> str:
        """多查询融合检索"""
        from lightrag import QueryParam
        from collections import Counter

        variations = self.expand(question)
        all_answers = []

        for q in [question] + variations:
            param = QueryParam(mode="hybrid", top_k=top_k)
            answer = rag_instance.query(q, param=param)
            all_answers.append(answer)

        # 简单融合：返回最长的答案（实际应使用更复杂的融合策略）
        return max(all_answers, key=len)
```

**方案三：检索结果重排序**

```python
class Reranker:
    """检索结果重排序器"""

    def __init__(self, model_name: str = "BAAI/bge-reranker-v2-m3"):
        self.model_name = model_name
        self.model = None
        self.tokenizer = None

    def _lazy_load(self):
        if self.model is None:
            try:
                from transformers import (
                    AutoModelForSequenceClassification,
                    AutoTokenizer
                )
                self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                self.model = AutoModelForSequenceClassification.from_pretrained(
                    self.model_name
                )
            except Exception:
                self.model = False  # 标记加载失败

    def rerank(
        self, query: str, candidates: List[str], top_k: int = 5
    ) -> List[str]:
        """对候选结果进行重排序"""
        self._lazy_load()
        if not self.model:
            return candidates[:top_k]

        pairs = [[query, c] for c in candidates]
        inputs = self.tokenizer(
            pairs, padding=True, truncation=True,
            return_tensors="pt", max_length=512
        )
        outputs = self.model(**inputs)
        scores = outputs.logits.squeeze(-1).detach().numpy().tolist()

        scored = list(zip(candidates, scores))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [c for c, _ in scored[:top_k]]
```

### 11.4.5 预防措施

1. **建立检索评估集**：准备 100+ 对（问题，期望答案），定期评估检索质量
2. **A/B 测试**：对比不同嵌入模型、不同检索参数的效果
3. **用户反馈闭环**：收集用户对答案的反馈（点赞/点踩），用于持续优化
4. **检索日志分析**：记录每次检索的实体匹配情况，分析未命中的原因

---

## 11.5 Token 消耗过高

### 11.5.1 问题现象

Token 消耗直接关系到运营成本。过高消耗的表现：

- **索引构建成本高**：构建一次索引消耗大量 Token
- **查询成本高**：每次查询消耗的 Token 超出预期
- **增量更新成本高**：添加少量文档就消耗大量 Token
- **成本不可控**：Token 消耗随文档量线性增长，缺乏优化空间

### 11.5.2 根因分析

| 根因 | 说明 | 典型数据 |
|------|------|---------|
| **提示词过长** | 实体/关系提取提示词包含过多示例和说明 | 提示词占每次调用的 60-80% |
| **文档块过大** | 每个文档块包含过多文本，LLM 处理成本高 | 块大小 2000 tokens vs 500 tokens |
| **冗余提取** | 对相似内容重复提取实体和关系 | 同一信息被提取 3-5 次 |
| **LLM 模型选择不当** | 使用能力过强的模型处理简单任务 | GPT-4 vs GPT-4o-mini |
| **缺乏缓存** | 相同或相似的 LLM 调用重复执行 | 重复调用率可达 40% |

### 11.5.3 诊断方法

```python
class TokenConsumptionDiagnostic:
    """Token 消耗诊断工具"""

    def __init__(self):
        self.call_log = []

    def log_call(self, stage: str, prompt: str, response: str):
        """记录一次 LLM 调用"""
        prompt_tokens = self._estimate_tokens(prompt)
        response_tokens = self._estimate_tokens(response)
        self.call_log.append({
            "stage": stage,
            "prompt_tokens": prompt_tokens,
            "response_tokens": response_tokens,
            "total_tokens": prompt_tokens + response_tokens,
            "prompt_length": len(prompt),
            "response_length": len(response),
        })

    def _estimate_tokens(self, text: str) -> int:
        """估算 Token 数（中文约 1.5 字符/token，英文约 4 字符/token）"""
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        other_chars = len(text) - chinese_chars
        return int(chinese_chars / 1.5 + other_chars / 4)

    def generate_report(self) -> Dict[str, Any]:
        """生成消耗报告"""
        if not self.call_log:
            return {"error": "无调用记录"}

        total_prompt = sum(c["prompt_tokens"] for c in self.call_log)
        total_response = sum(c["response_tokens"] for c in self.call_log)
        total = total_prompt + total_response

        # 按阶段统计
        stage_stats = {}
        for call in self.call_log:
            stage = call["stage"]
            if stage not in stage_stats:
                stage_stats[stage] = {
                    "calls": 0, "prompt_tokens": 0,
                    "response_tokens": 0, "total_tokens": 0
                }
            stage_stats[stage]["calls"] += 1
            stage_stats[stage]["prompt_tokens"] += call["prompt_tokens"]
            stage_stats[stage]["response_tokens"] += call["response_tokens"]
            stage_stats[stage]["total_tokens"] += call["total_tokens"]

        # 分析提示词效率
        prompt_efficiency = total_response / total_prompt if total_prompt > 0 else 0

        return {
            "total_calls": len(self.call_log),
            "total_prompt_tokens": total_prompt,
            "total_response_tokens": total_response,
            "total_tokens": total,
            "prompt_efficiency_ratio": prompt_efficiency,
            "stage_stats": stage_stats,
            "recommendations": self._generate_recommendations(
                stage_stats, prompt_efficiency
            ),
        }

    def _generate_recommendations(
        self, stage_stats: Dict, efficiency: float
    ) -> List[str]:
        recommendations = []

        if efficiency < 0.2:
            recommendations.append(
                "提示词效率过低（响应/提示词 < 0.2），"
                "建议精简提示词模板"
            )

        for stage, stats in stage_stats.items():
            avg_prompt = stats["prompt_tokens"] / stats["calls"]
            if avg_prompt > 2000:
                recommendations.append(
                    f"'{stage}' 阶段平均提示词 {avg_prompt:.0f} tokens，"
                    f"建议压缩提示词或减小输入文本"
                )

        if len(self.call_log) > 100:
            recommendations.append(
                "LLM 调用次数过多，建议启用缓存机制减少重复调用"
            )

        return recommendations


def diagnose_token_consumption():
    """Token 消耗诊断演示"""
    diag = TokenConsumptionDiagnostic()

    # 模拟索引构建的 Token 消耗
    diag.log_call("entity_extraction",
        "你是一个NER系统。请从以下文本中提取实体...（省略500字）",
        '[{"name": "苹果公司", "type": "organization"}]'
    )
    diag.log_call("relation_extraction",
        "从以下文本中提取关系...（省略400字）",
        '[{"source": "苹果公司", "target": "iPhone"}]'
    )

    report = diag.generate_report()
    print("Token 消耗诊断报告")
    print("=" * 60)
    print(f"总调用次数: {report['total_calls']}")
    print(f"总 Prompt Tokens: {report['total_prompt_tokens']}")
    print(f"总 Response Tokens: {report['total_response_tokens']}")
    print(f"总 Tokens: {report['total_tokens']}")
    print(f"提示词效率比: {report['prompt_efficiency_ratio']:.2f}")
    print()
    print("建议:")
    for rec in report['recommendations']:
        print(f"  - {rec}")


if __name__ == "__main__":
    diagnose_token_consumption()
```

### 11.5.4 解决方案

**方案一：提示词压缩**

```python
class PromptCompressor:
    """提示词压缩器"""

    @staticmethod
    def compress_entity_prompt(text: str) -> str:
        """压缩实体提取提示词"""
        return f"""提取实体(JSON): {text}"""

    @staticmethod
    def compress_relation_prompt(
        text: str, entities: List[str]
    ) -> str:
        """压缩关系提取提示词"""
        ents = ", ".join(entities[:10])
        return f"""提取"{ents}"间关系(JSON): {text}"""

    @staticmethod
    def measure_compression_rate(
        original: str, compressed: str
    ) -> float:
        """计算压缩率"""
        return 1 - (len(compressed) / len(original))
```

**方案二：缓存机制**

```python
class LLMCache:
    """LLM 调用缓存"""

    def __init__(self, max_size: int = 1000):
        self.cache = {}
        self.max_size = max_size
        self.hits = 0
        self.misses = 0

    def _make_key(self, prompt: str) -> str:
        import hashlib
        return hashlib.md5(prompt.encode()).hexdigest()

    def get(self, prompt: str) -> str:
        key = self._make_key(prompt)
        if key in self.cache:
            self.hits += 1
            return self.cache[key]
        self.misses += 1
        return None

    def set(self, prompt: str, response: str):
        key = self._make_key(prompt)
        if len(self.cache) >= self.max_size:
            self.cache.pop(next(iter(self.cache)))
        self.cache[key] = response

    def stats(self) -> Dict[str, Any]:
        total = self.hits + self.misses
        return {
            "cache_size": len(self.cache),
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": self.hits / total if total > 0 else 0,
        }


class CachedLLM:
    """带缓存的 LLM 包装器"""

    def __init__(self, llm_func, cache: LLMCache = None):
        self.llm = llm_func
        self.cache = cache or LLMCache()

    def __call__(self, prompt: str) -> str:
        cached = self.cache.get(prompt)
        if cached:
            return cached
        response = self.llm(prompt)
        self.cache.set(prompt, response)
        return response
```

**方案三：模型分级策略**

```python
class TieredLLM:
    """分级 LLM 策略：简单任务用小模型，复杂任务用大模型"""

    def __init__(self, small_model, large_model, complexity_estimator=None):
        self.small = small_model
        self.large = large_model
        self.estimator = complexity_estimator or self._default_estimator

    def _default_estimator(self, prompt: str) -> str:
        """估算任务复杂度"""
        # 简单任务特征：短文本、明确指令
        if len(prompt) < 500:
            return "simple"
        # 复杂任务特征：长文本、需要推理
        if any(kw in prompt for kw in ["推理", "分析", "综合", "判断"]):
            return "complex"
        return "simple"

    def __call__(self, prompt: str) -> str:
        complexity = self.estimator(prompt)
        model = self.small if complexity == "simple" else self.large
        return model(prompt)
```

### 11.5.5 预防措施

1. **设置 Token 预算**：为索引构建和查询分别设置 Token 预算上限
2. **定期审计**：每周检查 Token 消耗报告，识别异常增长
3. **模型降级策略**：在 Token 消耗接近预算时，自动降级到更经济的模型
4. **批处理优化**：合并多个小任务为一个大任务，减少提示词开销

---

## 11.6 索引构建失败

### 11.6.1 问题现象

索引构建失败是上线初期最常见的问题，表现为：

- **构建过程中断**：处理到某个文档时异常退出
- **构建完成但索引为空**：没有报错但查询不到任何结果
- **部分文档索引失败**：部分文档成功，部分失败
- **构建超时**：处理时间远超预期
- **内存溢出**：处理大文档时 OOM

### 11.6.2 根因分析

| 根因 | 说明 | 诊断方法 |
|------|------|---------|
| **LLM API 错误** | API 限流、超时、认证失败 | 检查 API 返回状态码 |
| **JSON 解析失败** | LLM 返回格式不符合预期 | 检查 LLM 输出原始内容 |
| **文档编码问题** | 非 UTF-8 编码导致解析错误 | 检查文件编码 |
| **文档过大** | 单篇文档超过 LLM 上下文窗口 | 检查文档大小 |
| **特殊字符** | 不可见字符、控制字符导致处理异常 | 检查文档的原始字节 |
| **依赖缺失** | 缺少必要的 Python 包 | 检查 import 错误 |

### 11.6.3 诊断方法

```python
class IndexBuildDiagnostic:
    """索引构建故障诊断器"""

    def __init__(self):
        self.errors = []
        self.warnings = []

    def test_llm_connection(self, llm_func) -> bool:
        """测试 LLM 连接"""
        try:
            response = llm_func("回复OK")
            return response is not None and len(response) > 0
        except Exception as e:
            self.errors.append(f"LLM 连接失败: {e}")
            return False

    def test_embedding_connection(self, embed_func) -> bool:
        """测试嵌入模型连接"""
        try:
            embedding = embed_func(["测试"])
            return embedding is not None and len(embedding) > 0
        except Exception as e:
            self.errors.append(f"嵌入模型连接失败: {e}")
            return False

    def test_document_encoding(self, file_path: str) -> bool:
        """测试文档编码"""
        try:
            with open(file_path, "rb") as f:
                raw = f.read()
            raw.decode("utf-8")
            return True
        except UnicodeDecodeError:
            self.errors.append(f"文件编码不是 UTF-8: {file_path}")
            return False

    def test_document_size(self, file_path: str, max_size: int = 10*1024*1024) -> bool:
        """测试文档大小"""
        import os
        size = os.path.getsize(file_path)
        if size > max_size:
            self.warnings.append(
                f"文件过大 ({size/1024/1024:.1f}MB): {file_path}"
            )
            return False
        return True

    def test_llm_output_parseable(self, llm_func, prompt: str) -> bool:
        """测试 LLM 输出是否可解析"""
        import json
        try:
            response = llm_func(prompt)
            json.loads(response)
            return True
        except json.JSONDecodeError as e:
            self.errors.append(f"LLM 输出 JSON 解析失败: {e}")
            self.warnings.append(f"原始输出: {response[:200]}")
            return False
        except Exception as e:
            self.errors.append(f"LLM 调用异常: {e}")
            return False

    def run_full_diagnostic(
        self, llm_func, embed_func, documents: List[str]
    ) -> Dict[str, Any]:
        """运行完整诊断"""
        print("索引构建环境诊断")
        print("=" * 60)

        # 1. 连接测试
        print("\n1. 连接测试")
        llm_ok = self.test_llm_connection(llm_func)
        print(f"   LLM: {'✓' if llm_ok else '✗'}")
        embed_ok = self.test_embedding_connection(embed_func)
        print(f"   嵌入: {'✓' if embed_ok else '✗'}")

        if not llm_ok or not embed_ok:
            return {"status": "failed", "errors": self.errors}

        # 2. 文档测试
        print("\n2. 文档测试")
        for i, doc in enumerate(documents):
            size_ok = len(doc.encode("utf-8")) < 10*1024*1024
            print(f"   文档 {i+1}: 大小 {'✓' if size_ok else '✗'}")

        # 3. LLM 输出测试
        print("\n3. LLM 输出格式测试")
        test_prompt = f"从以下文本提取实体：{documents[0][:200]}"
        parse_ok = self.test_llm_output_parseable(llm_func, test_prompt)
        print(f"   JSON 可解析: {'✓' if parse_ok else '✗'}")

        return {
            "status": "ok" if not self.errors else "warnings",
            "errors": self.errors,
            "warnings": self.warnings,
        }


def diagnose_index_build():
    """索引构建诊断演示"""
    def mock_llm(prompt: str) -> str:
        return '[{"name": "测试实体", "type": "concept"}]'

    def mock_embed(texts: List[str]) -> List[List[float]]:
        import numpy as np
        return np.random.rand(len(texts), 768).tolist()

    diag = IndexBuildDiagnostic()
    test_docs = [
        "苹果公司发布了新款iPhone。",
        "OpenAI推出了GPT-4o模型。",
    ]

    result = diag.run_full_diagnostic(mock_llm, mock_embed, test_docs)
    print(f"\n诊断结果: {result['status']}")
    if result.get('errors'):
        print("错误:")
        for e in result['errors']:
            print(f"  - {e}")
    if result.get('warnings'):
        print("警告:")
        for w in result['warnings']:
            print(f"  - {w}")


if __name__ == "__main__":
    diagnose_index_build()
```

### 11.6.4 解决方案

**方案一：健壮的索引构建流水线**

```python
import json
import time
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class IndexBuildResult:
    """单文档索引构建结果"""
    document_id: str
    success: bool
    entities_count: int = 0
    relations_count: int = 0
    error: Optional[str] = None
    retry_count: int = 0


class RobustIndexBuilder:
    """健壮的索引构建器"""

    def __init__(
        self,
        llm_func,
        max_retries: int = 3,
        retry_delay: float = 2.0,
        fallback_llm=None,
    ):
        self.llm = llm_func
        self.fallback_llm = fallback_llm
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    def build_index(self, documents: List[str]) -> List[IndexBuildResult]:
        """构建索引（带错误恢复）"""
        results = []

        for doc_id, doc in enumerate(documents):
            result = self._process_single_document(doc_id, doc)
            results.append(result)

            if not result.success:
                print(f"文档 {doc_id} 索引失败: {result.error}")

        return results

    def _process_single_document(
        self, doc_id: int, document: str
    ) -> IndexBuildResult:
        """处理单篇文档（带重试和降级）"""
        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                # 尝试使用主 LLM
                llm = self.llm if attempt == 0 else (
                    self.fallback_llm or self.llm
                )

                entities = self._extract_entities_safe(llm, document)
                relations = self._extract_relations_safe(
                    llm, document, entities
                )

                return IndexBuildResult(
                    document_id=str(doc_id),
                    success=True,
                    entities_count=len(entities),
                    relations_count=len(relations),
                    retry_count=attempt,
                )

            except json.JSONDecodeError as e:
                last_error = f"JSON 解析错误: {e}"
                if attempt < self.max_retries:
                    time.sleep(self.retry_delay * (attempt + 1))

            except Exception as e:
                last_error = str(e)
                if attempt < self.max_retries:
                    time.sleep(self.retry_delay * (attempt + 1))

        return IndexBuildResult(
            document_id=str(doc_id),
            success=False,
            error=last_error,
            retry_count=self.max_retries,
        )

    def _extract_entities_safe(
        self, llm, text: str
    ) -> List[Dict]:
        """安全提取实体（带格式修复）"""
        prompt = f"提取实体(JSON数组): {text[:2000]}"
        response = llm(prompt)
        return self._safe_parse_json(response, "entities")

    def _extract_relations_safe(
        self, llm, text: str, entities: List[Dict]
    ) -> List[Dict]:
        """安全提取关系（带格式修复）"""
        names = [e.get("name", "") for e in entities[:10]]
        prompt = f"提取关系(JSON数组): {text[:2000]}"
        response = llm(prompt)
        return self._safe_parse_json(response, "relations")

    def _safe_parse_json(
        self, text: str, fallback_name: str
    ) -> List[Dict]:
        """安全解析 JSON（带自动修复）"""
        # 尝试直接解析
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 尝试提取 JSON 数组
        import re
        array_match = re.search(r'\[.*\]', text, re.DOTALL)
        if array_match:
            try:
                return json.loads(array_match.group())
            except json.JSONDecodeError:
                pass

        # 尝试修复常见格式问题
        fixed = text.strip()
        if not fixed.startswith("["):
            fixed = "[" + fixed
        if not fixed.endswith("]"):
            fixed = fixed + "]"
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        return []
```

**方案二：断点续传**

```python
class CheckpointIndexBuilder:
    """支持断点续传的索引构建器"""

    def __init__(self, checkpoint_path: str = "./index_checkpoint.json"):
        self.checkpoint_path = checkpoint_path
        self.completed = set()

    def load_checkpoint(self):
        """加载检查点"""
        import os
        if os.path.exists(self.checkpoint_path):
            with open(self.checkpoint_path, "r") as f:
                data = json.load(f)
                self.completed = set(data.get("completed", []))
            print(f"恢复检查点: {len(self.completed)} 篇文档已完成")

    def save_checkpoint(self, doc_id: str):
        """保存检查点"""
        self.completed.add(doc_id)
        with open(self.checkpoint_path, "w") as f:
            json.dump({"completed": list(self.completed)}, f)

    def build(
        self, documents: List[str], builder: RobustIndexBuilder
    ) -> List[IndexBuildResult]:
        """构建索引（支持断点续传）"""
        self.load_checkpoint()
        results = []

        for doc_id, doc in enumerate(documents):
            str_id = str(doc_id)
            if str_id in self.completed:
                print(f"跳过已完成的文档 {doc_id}")
                continue

            result = builder._process_single_document(doc_id, doc)
            results.append(result)

            if result.success:
                self.save_checkpoint(str_id)
            else:
                print(f"文档 {doc_id} 失败，暂停构建")
                break

        return results
```

### 11.6.5 预防措施

1. **构建前运行诊断**：在正式构建前运行 `IndexBuildDiagnostic` 检查环境
2. **小批量验证**：先用 3-5 篇文档验证索引构建流程
3. **设置超时保护**：为每个 LLM 调用设置超时时间
4. **日志分级**：区分 INFO（进度）、WARNING（可恢复错误）、ERROR（致命错误）
5. **监控告警**：对构建失败率、重试次数设置告警阈值

---

## 11.7 增量更新冲突

### 11.7.1 问题现象

增量更新是 LightRAG 的核心优势之一，但在实际使用中可能遇到以下问题：

- **实体重复**：同一实体在图中出现多个节点
- **关系矛盾**：新关系与已有关系冲突
- **信息丢失**：增量更新后，原有信息被错误覆盖
- **图结构膨胀**：增量更新后图规模快速增长
- **检索退化**：增量更新后检索质量反而下降

### 11.7.2 根因分析

| 根因 | 说明 | 诊断方法 |
|------|------|---------|
| **去重阈值不当** | 实体相似度阈值过高或过低 | 检查去重前后的实体数量变化 |
| **冲突解决策略缺失** | 没有定义关系冲突时的处理策略 | 检查关系更新日志 |
| **缺乏版本控制** | 无法回滚错误的增量更新 | 检查是否有版本管理机制 |
| **批量更新原子性不足** | 部分成功部分失败导致数据不一致 | 检查更新前后的图状态 |
| **缺乏维护调度** | 增量更新后未进行图结构优化 | 检查图规模增长曲线 |

### 11.7.3 诊断方法

```python
class IncrementalUpdateDiagnostic:
    """增量更新冲突诊断器"""

    def __init__(self, graph):
        self.graph = graph

    def check_entity_duplicates(self) -> List[tuple]:
        """检查潜在的重复实体"""
        from rapidfuzz import fuzz

        nodes = list(self.graph.nodes())
        duplicates = []

        for i in range(len(nodes)):
            for j in range(i + 1, len(nodes)):
                similarity = fuzz.ratio(nodes[i], nodes[j]) / 100.0
                if similarity > 0.8:
                    duplicates.append((nodes[i], nodes[j], similarity))

        return duplicates

    def check_relation_conflicts(self) -> List[Dict]:
        """检查关系冲突"""
        conflicts = []
        for u, v, data in self.graph.edges(data=True):
            edge_key = (u, v)
            # 检查是否有方向相反的关系
            if self.graph.has_edge(v, u):
                reverse_data = self.graph.get_edge_data(v, u)
                if data.get("type") != reverse_data.get("type"):
                    conflicts.append({
                        "edge": edge_key,
                        "forward_type": data.get("type"),
                        "reverse_type": reverse_data.get("type"),
                        "issue": "方向冲突",
                    })
        return conflicts

    def check_graph_growth(
        self, history: List[int]
    ) -> Dict[str, Any]:
        """检查图规模增长趋势"""
        if len(history) < 2:
            return {"warning": "数据不足"}

        growth_rates = []
        for i in range(1, len(history)):
            if history[i-1] > 0:
                rate = (history[i] - history[i-1]) / history[i-1]
                growth_rates.append(rate)

        avg_growth = sum(growth_rates) / len(growth_rates)

        return {
            "current_size": history[-1],
            "avg_growth_rate": avg_growth,
            "is_exponential": avg_growth > 0.1,
            "warning": (
                "图规模增长过快，建议启用图剪枝"
                if avg_growth > 0.1 else None
            ),
        }

    def generate_report(self) -> Dict[str, Any]:
        """生成诊断报告"""
        report = {
            "node_count": self.graph.number_of_nodes(),
            "edge_count": self.graph.number_of_edges(),
        }

        duplicates = self.check_entity_duplicates()
        if duplicates:
            report["duplicate_entities"] = [
                {"name1": d[0], "name2": d[1], "similarity": d[2]}
                for d in duplicates[:10]
            ]
            report["duplicate_warning"] = (
                f"发现 {len(duplicates)} 组潜在重复实体"
            )

        conflicts = self.check_relation_conflicts()
        if conflicts:
            report["relation_conflicts"] = conflicts[:10]
            report["conflict_warning"] = (
                f"发现 {len(conflicts)} 组关系冲突"
            )

        return report


def diagnose_incremental_update():
    """增量更新诊断演示"""
    import networkx as nx

    # 创建模拟图
    G = nx.Graph()
    G.add_node("苹果公司", type="organization")
    G.add_node("Apple Inc.", type="organization")  # 重复实体
    G.add_node("iPhone", type="product")
    G.add_edge("苹果公司", "iPhone", type="发布")
    G.add_edge("Apple Inc.", "iPhone", type="开发")  # 关系冲突

    diag = IncrementalUpdateDiagnostic(G)
    report = diag.generate_report()

    print("增量更新诊断报告")
    print("=" * 60)
    print(f"节点数: {report['node_count']}")
    print(f"边数: {report['edge_count']}")

    if "duplicate_warning" in report:
        print(f"\n⚠ {report['duplicate_warning']}")
        for dup in report.get("duplicate_entities", []):
            print(f"  - '{dup['name1']}' vs '{dup['name2']}' "
                  f"(相似度: {dup['similarity']:.2f})")

    if "conflict_warning" in report:
        print(f"\n⚠ {report['conflict_warning']}")
        for conf in report.get("relation_conflicts", []):
            print(f"  - {conf['edge']}: {conf['forward_type']} vs "
                  f"{conf['reverse_type']}")


if __name__ == "__main__":
    diagnose_incremental_update()
```

### 11.7.4 解决方案

**方案一：智能实体去重**

```python
class SmartEntityDeduplicator:
    """智能实体去重器"""

    def __init__(
        self,
        name_threshold: float = 0.85,
        embedding_threshold: float = 0.90,
    ):
        self.name_threshold = name_threshold
        self.embedding_threshold = embedding_threshold

    def find_duplicates(self, graph) -> List[tuple]:
        """查找重复实体"""
        from rapidfuzz import fuzz

        nodes = list(graph.nodes(data=True))
        duplicates = []

        for i in range(len(nodes)):
            for j in range(i + 1, len(nodes)):
                name_i = nodes[i][0]
                name_j = nodes[j][0]

                # 多维度相似度计算
                name_sim = fuzz.token_sort_ratio(name_i, name_j) / 100.0

                # 邻居相似度（Jaccard）
                neighbors_i = set(graph.neighbors(name_i))
                neighbors_j = set(graph.neighbors(name_j))
                if neighbors_i or neighbors_j:
                    jaccard = len(neighbors_i & neighbors_j) / \
                              len(neighbors_i | neighbors_j)
                else:
                    jaccard = 0

                # 综合评分
                combined = 0.6 * name_sim + 0.4 * jaccard

                if combined >= self.name_threshold:
                    duplicates.append((name_i, name_j, combined))

        return duplicates

    def merge_entities(self, graph, primary: str, secondary: str):
        """合并两个实体节点"""
        # 重定向边
        for neighbor in list(graph.neighbors(secondary)):
            if neighbor == primary:
                continue
            if graph.has_edge(primary, neighbor):
                existing = graph.get_edge_data(primary, neighbor)
                new_data = graph.get_edge_data(secondary, neighbor)
                # 合并边属性
                for key, value in new_data.items():
                    if key not in existing:
                        existing[key] = value
                    elif existing[key] != value:
                        existing[key] = f"{existing[key]}; {value}"
            else:
                edge_data = graph.get_edge_data(secondary, neighbor)
                graph.add_edge(primary, neighbor, **edge_data)

        # 合并节点属性
        for key, value in graph.nodes[secondary].items():
            if key not in graph.nodes[primary]:
                graph.nodes[primary][key] = value
            elif key == "aliases":
                aliases = set(graph.nodes[primary].get("aliases", []))
                aliases.add(secondary)
                if value:
                    aliases.update(value)
                graph.nodes[primary]["aliases"] = list(aliases)

        # 删除被合并的节点
        graph.remove_node(secondary)
```

**方案二：关系冲突解决策略**

```python
class RelationConflictResolver:
    """关系冲突解决器"""

    STRATEGIES = {
        "keep_existing": "保留已有关系",
        "use_new": "使用新关系",
        "merge": "合并两者",
        "llm_judge": "由 LLM 判断",
    }

    def __init__(self, strategy: str = "merge", llm_func=None):
        if strategy not in self.STRATEGIES:
            raise ValueError(f"未知策略: {strategy}")
        self.strategy = strategy
        self.llm = llm_func

    def resolve(
        self,
        existing: Dict,
        new: Dict,
        context: str = "",
    ) -> Dict:
        """解决关系冲突"""
        if self.strategy == "keep_existing":
            return existing

        if self.strategy == "use_new":
            return new

        if self.strategy == "merge":
            return self._merge(existing, new)

        if self.strategy == "llm_judge" and self.llm:
            return self._llm_judge(existing, new, context)

        return existing

    def _merge(self, existing: Dict, new: Dict) -> Dict:
        """合并关系"""
        merged = existing.copy()

        # 合并描述
        existing_desc = existing.get("description", "")
        new_desc = new.get("description", "")
        if existing_desc and new_desc and existing_desc != new_desc:
            merged["description"] = f"{existing_desc}；{new_desc}"

        # 合并来源
        existing_src = existing.get("source_doc", "")
        new_src = new.get("source_doc", "")
        if existing_src and new_src:
            merged["source_doc"] = f"{existing_src}; {new_src}"

        # 更新置信度
        merged["confidence"] = max(
            existing.get("confidence", 1.0),
            new.get("confidence", 1.0),
        )

        return merged

    def _llm_judge(
        self, existing: Dict, new: Dict, context: str
    ) -> Dict:
        """使用 LLM 判断"""
        prompt = f"""两个关系描述存在冲突，请判断哪个更准确：

上下文：{context}

关系A：{json.dumps(existing, ensure_ascii=False)}
关系B：{json.dumps(new, ensure_ascii=False)}

请输出 "A" 或 "B"："""
        response = self.llm(prompt)
        return existing if "A" in response else new
```

**方案三：增量更新事务管理**

```python
class IncrementalTransaction:
    """增量更新事务"""

    def __init__(self, graph):
        self.graph = graph
        self.snapshot = None
        self.changes = []

    def begin(self):
        """开始事务"""
        import copy
        self.snapshot = copy.deepcopy(self.graph)
        self.changes = []
        print("事务开始")

    def record_change(self, change_type: str, detail: str):
        """记录变更"""
        self.changes.append({
            "type": change_type,
            "detail": detail,
            "timestamp": time.time(),
        })

    def commit(self):
        """提交事务"""
        if self.snapshot is None:
            raise RuntimeError("没有活跃的事务")
        print(f"事务提交: {len(self.changes)} 项变更")
        self.snapshot = None
        self.changes = []

    def rollback(self):
        """回滚事务"""
        if self.snapshot is None:
            raise RuntimeError("没有活跃的事务")
        import copy
        self.graph.clear()
        self.graph.update(copy.deepcopy(self.snapshot))
        print(f"事务回滚: 撤销 {len(self.changes)} 项变更")
        self.snapshot = None
        self.changes = []


class TransactionalIncrementalUpdater:
    """支持事务的增量更新器"""

    def __init__(self, graph):
        self.graph = graph
        self.tx = IncrementalTransaction(graph)

    def update(self, new_entities: List, new_relations: List) -> bool:
        """执行带事务的增量更新"""
        self.tx.begin()

        try:
            # 添加实体
            for entity in new_entities:
                name = entity.get("name")
                if name and not self.graph.has_node(name):
                    self.graph.add_node(name, **entity)
                    self.tx.record_change(
                        "add_entity", f"添加实体: {name}"
                    )

            # 添加关系
            for rel in new_relations:
                src = rel.get("source")
                tgt = rel.get("target")
                if src and tgt:
                    self.graph.add_edge(src, tgt, **rel)
                    self.tx.record_change(
                        "add_relation", f"添加关系: {src}->{tgt}"
                    )

            self.tx.commit()
            return True

        except Exception as e:
            self.tx.rollback()
            print(f"更新失败，已回滚: {e}")
            return False
```

### 11.7.5 预防措施

1. **增量更新前备份**：每次增量更新前备份图结构
2. **设置去重白名单**：对已知的实体名称变体，预先配置别名映射
3. **增量更新后验证**：更新后运行检索测试，确保质量未下降
4. **定期全量重建**：即使使用增量更新，也建议每 N 次更新后全量重建一次
5. **监控图健康度**：持续监控节点数、边数、重复率、冲突率等指标

---

## 11.8 综合排查流程

### 11.8.1 问题分类速查表

| 问题现象 | 优先排查 | 次要排查 | 参考章节 |
|---------|---------|---------|---------|
| 答案不准确 | 检索模式选择 | 实体提取质量 | 11.2, 11.4 |
| 检索不到信息 | 实体提取完整性 | 查询表述 | 11.2, 11.4 |
| 构建成本高 | 提示词大小 | LLM 模型选择 | 11.5 |
| 构建失败 | LLM 连接 | 文档编码 | 11.6 |
| 增量后质量下降 | 实体去重 | 关系冲突 | 11.7 |
| 图规模膨胀 | 图剪枝配置 | 去重阈值 | 11.7 |

### 11.8.2 标准排查流程

```python
class TroubleshootingPipeline:
    """标准问题排查流水线"""

    def __init__(self, rag_instance):
        self.rag = rag_instance

    def run(self, issue_type: str = "auto") -> Dict[str, Any]:
        """运行排查流水线"""
        results = {}

        # 1. 基础环境检查
        print("[1/5] 检查基础环境...")
        results["environment"] = self._check_environment()

        # 2. 实体提取质量检查
        print("[2/5] 检查实体提取质量...")
        results["entity_extraction"] = self._check_entity_extraction()

        # 3. 关系提取质量检查
        print("[3/5] 检查关系提取质量...")
        results["relation_extraction"] = self._check_relation_extraction()

        # 4. 检索质量检查
        print("[4/5] 检查检索质量...")
        results["retrieval"] = self._check_retrieval()

        # 5. 图健康度检查
        print("[5/5] 检查图健康度...")
        results["graph_health"] = self._check_graph_health()

        return results

    def _check_environment(self) -> Dict[str, bool]:
        return {
            "llm_available": True,
            "embedding_available": True,
            "storage_available": True,
        }

    def _check_entity_extraction(self) -> Dict[str, Any]:
        return {"status": "pending"}

    def _check_relation_extraction(self) -> Dict[str, Any]:
        return {"status": "pending"}

    def _check_retrieval(self) -> Dict[str, Any]:
        return {"status": "pending"}

    def _check_graph_health(self) -> Dict[str, Any]:
        return {"status": "pending"}
```

### 11.8.3 常见错误码参考

| 错误码 | 含义 | 处理建议 |
|--------|------|---------|
| `E001` | LLM API 认证失败 | 检查 API Key 配置 |
| `E002` | LLM API 限流 | 降低并发数，增加重试延迟 |
| `E003` | LLM 输出格式错误 | 优化提示词，添加格式约束 |
| `E004` | 文档编码错误 | 统一使用 UTF-8 编码 |
| `E005` | 文档过大 | 增加分块，减小块大小 |
| `E006` | 图存储写入失败 | 检查磁盘空间和权限 |
| `E007` | 嵌入维度不匹配 | 检查嵌入模型配置 |
| `E008` | 实体去重异常 | 检查去重阈值配置 |
| `E009` | 关系冲突无法解决 | 检查冲突解决策略配置 |
| `E010` | 增量更新事务回滚 | 检查更新数据格式 |

---

## 本章小结

1. **分层排查法**：从输出层反向追溯，逐层缩小范围，是排查 LightRAG 问题的最有效方法论
2. **实体提取是基础**：实体提取质量决定了整个系统的上限，优先优化提示词和领域适配
3. **关系提取决定推理能力**：定义清晰的关系类型体系，使用联合提取避免级联错误
4. **检索质量受多重因素影响**：查询模式、嵌入模型、图结构、Top-K 参数都需要调优
5. **Token 消耗可以优化**：提示词压缩、缓存机制、模型分级可降低 50-80% 的 Token 消耗
6. **索引构建需要健壮性设计**：重试机制、断点续传、格式修复是生产环境的必备能力
7. **增量更新需要事务保护**：实体去重、关系冲突解决、事务回滚是增量更新的三大支柱
8. **预防胜于修复**：建立评估集、监控指标、定期维护，可以避免大部分问题
