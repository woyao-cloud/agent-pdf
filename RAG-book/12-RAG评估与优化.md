# 第十二章：RAG评估与优化

RAG系统由检索、生成等多个环节组成，任何一个环节的薄弱都可能导致最终输出质量下降。与端到端的大语言模型不同，RAG系统的错误来源多样——可能是检索到的文档不相关，也可能是LLM未能正确利用上下文，还可能是知识库本身存在缺陷。因此，建立系统化的评估体系并针对问题持续优化，是RAG工程实践中不可或缺的环节。

本章将从评估方法论出发，深入介绍RAG各组件的评估指标、主流评估框架、评估数据集构建，然后系统性地分析RAG系统的常见问题及优化策略。

---

## 12.1 为什么评估至关重要

RAG系统是一个典型的**流水线架构**（Pipeline），包含文档处理、分块、嵌入、索引、检索、重排序、生成等多个步骤。这种架构带来了两个核心挑战：

1. **错误传播**：上游环节的误差会逐级放大。例如，分块不当导致关键信息被割裂，检索环节即使用最好的算法也无法找到完整的上下文。
2. **归因困难**：当最终答案质量不佳时，很难直观判断是检索环节出了问题，还是生成环节出了问题。

系统化的评估能帮助我们：

- **定位瓶颈**：量化每个环节的质量，找到最需要优化的组件
- **回归测试**：确保优化一个指标时不会退化另一个指标
- **持续监控**：在生产环境中发现数据漂移和性能退化
- **A/B测试**：对比不同策略（如不同的嵌入模型、分块方案）的效果

---

## 12.2 组件级评估

### 12.2.1 检索质量评估

检索是RAG系统的基础，其质量直接决定生成环节的"天花板"。以下是核心评估指标：

**Precision@K**（精确率）

在返回的K个文档中，相关文档的比例：

```
Precision@K = (相关文档数) / K
```

例如，检索返回了5个文档，其中3个是相关的，则 Precision@5 = 3/5 = 0.6。

**Recall@K**（召回率）

在所有相关文档中，被检索到的比例：

```
Recall@K = (检索到的相关文档数) / (总相关文档数)
```

召回率衡量的是系统"遗漏"了多少重要信息。对于RAG系统，召回率尤为重要——遗漏关键上下文会直接导致幻觉。

**MRR**（Mean Reciprocal Rank，平均倒数排名）

衡量第一个相关文档出现的位置：

```
MRR = (1/|Q|) * Σ(1/rank_i)
```

其中 `rank_i` 是第i个查询中第一个相关文档的排名位置。MRR越高，说明相关文档排名越靠前。

**NDCG**（Normalized Discounted Cumulative Gain，归一化折损累积增益）

NDCG不仅考虑文档是否相关，还考虑相关程度和排名位置：

```python
import numpy as np
from sklearn.metrics import ndcg_score

def compute_ndcg(relevance_scores, k=None):
    """
    relevance_scores: 每个文档的相关性评分列表
    例如 [3, 2, 0, 1, 0] 表示5个文档的相关性
    """
    relevance_array = np.array([relevance_scores])
    ideal_array = np.array([sorted(relevance_scores, reverse=True)])
    return ndcg_score(ideal_array, relevance_array)
```

**Hit Rate**（命中率）

在所有查询中，至少检索到一个相关文档的查询比例：

```
Hit Rate = (至少返回1个相关文档的查询数) / (总查询数)
```

Hit Rate是最基本的检索质量指标，但无法反映排名质量。

**代码示例：评估检索质量**

```python
from dataclasses import dataclass
from typing import List, Set
import numpy as np


@dataclass
class RetrievalEvaluationResult:
    """检索评估结果"""
    precision_at_k: dict[int, float]  # {K: precision}
    recall_at_k: dict[int, float]      # {K: recall}
    mrr: float
    ndcg: float
    hit_rate: float


def evaluate_retrieval(
    queries: List[str],
    retrieved_docs: List[List[str]],      # 每个查询检索到的文档ID列表
    relevant_docs: List[Set[str]],        # 每个查询的相关文档ID集合
    k_values: List[int] = [1, 3, 5, 10],
) -> RetrievalEvaluationResult:
    """评估检索质量"""
    precision_at_k = {}
    recall_at_k = {}

    for k in k_values:
        precisions = []
        recalls = []
        for retrieved, relevant in zip(retrieved_docs, relevant_docs):
            retrieved_set = set(retrieved[:k])
            hits = retrieved_set & relevant

            precisions.append(len(hits) / k if k > 0 else 0.0)
            recalls.append(len(hits) / len(relevant) if relevant else 0.0)

        precision_at_k[k] = np.mean(precisions)
        recall_at_k[k] = np.mean(recalls)

    # 计算 MRR
    mrr_values = []
    for retrieved, relevant in zip(retrieved_docs, relevant_docs):
        for rank, doc_id in enumerate(retrieved, start=1):
            if doc_id in relevant:
                mrr_values.append(1.0 / rank)
                break
        else:
            mrr_values.append(0.0)
    mrr = np.mean(mrr_values)

    # 计算 Hit Rate
    hits_count = sum(
        1 for retrieved, relevant in zip(retrieved_docs, relevant_docs)
        if set(retrieved) & relevant
    )
    hit_rate = hits_count / len(queries) if queries else 0.0

    return RetrievalEvaluationResult(
        precision_at_k=precision_at_k,
        recall_at_k=recall_at_k,
        mrr=mrr,
        ndcg=0.0,  # 需要相关性评分，此处简化
        hit_rate=hit_rate,
    )


# 使用示例
queries = ["什么是向量数据库？", "如何优化RAG系统？"]
retrieved = [
    ["doc_1", "doc_3", "doc_5", "doc_7", "doc_9"],
    ["doc_2", "doc_4", "doc_6", "doc_8", "doc_10"],
]
relevant = [
    {"doc_1", "doc_3", "doc_5"},  # 查询1的相关文档
    {"doc_2", "doc_4"},            # 查询2的相关文档
]

result = evaluate_retrieval(queries, retrieved, relevant)
print(f"Precision@5: {result.precision_at_k[5]:.3f}")
print(f"Recall@5: {result.recall_at_k[5]:.3f}")
print(f"MRR: {result.mrr:.3f}")
print(f"Hit Rate: {result.hit_rate:.3f}")
```

### 12.2.2 生成质量评估

生成质量关注的是LLM基于检索上下文产出答案的能力，主要指标包括：

- **Faithfulness（忠实度）**：答案是否严格基于检索到的上下文，没有编造信息
- **Relevance（相关性）**：答案是否回应了用户的问题
- **Coherence（连贯性）**：答案是否逻辑连贯、表达清晰

这些指标通常需要LLM-as-judge或人工评估，无法仅靠统计计算。

---

## 12.3 端到端评估框架

### 12.3.1 RAGAS框架

RAGAS（Retrieval Augmented Generation Assessment）是专门为RAG系统设计的评估框架，提供四个核心指标：

| 指标 | 评估对象 | 说明 |
|------|----------|------|
| Faithfulness（忠实度） | 生成质量 | 答案中的每个断言是否都能在检索上下文中找到依据 |
| Answer Relevance（答案相关性） | 生成质量 | 答案是否真正回应了问题 |
| Context Precision（上下文精确率） | 检索质量 | 相关的文档块是否排在靠前的位置 |
| Context Recall（上下文召回率） | 检索质量 | 回答问题所需的所有信息是否都被检索到了 |

**代码示例：使用RAGAS评估RAG流水线**

```python
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevance,
    context_precision,
    context_recall,
)


# 构建评估数据集
# 每条数据包含：问题、答案、检索上下文、标准答案（用于context_recall）
eval_data = {
    "question": [
        "什么是RAG？",
        "向量数据库有哪些常见类型？",
        "如何提高检索的召回率？",
    ],
    "answer": [
        "RAG（检索增强生成）是一种结合外部知识检索与大语言模型生成的技术架构，"
        "通过在生成前先检索相关文档来提升答案的准确性和时效性。",
        "常见的向量数据库包括Milvus、Pinecone、Weaviate、Qdrant、Chroma等，"
        "它们各自在性能、规模和部署方式上有所不同。",
        "提高检索召回率的方法包括：使用混合检索（BM25+向量）、"
        "增加返回文档数量、采用HyDE查询扩展、优化分块策略等。",
    ],
    "contexts": [
        [
            "RAG（Retrieval-Augmented Generation）是一种将外部知识检索与语言模型生成"
            "相结合的架构。系统先从知识库中检索相关文档，再将检索结果作为上下文"
            "提供给大语言模型，从而生成更准确、更有时效性的回答。"
        ],
        [
            "向量数据库是专门用于存储和检索向量嵌入的数据库系统。常见的开源方案"
            "包括Milvus（高性能分布式）、Qdrant（Rust编写）、Chroma（轻量级）。"
            "商业方案包括Pinecone（全托管）和Weaviate（混合检索）。",
        ],
        [
            "检索召回率的优化策略包括：1) 混合检索：结合BM25关键词匹配和向量语义"
            "搜索；2) 查询扩展：使用HyDE、多查询等技术扩展检索范围；3) 分块优化："
            "使用语义分块替代固定大小分块；4) 增加top-K：返回更多候选文档。"
        ],
    ],
    "ground_truth": [
        "RAG是一种将外部知识检索与大语言模型生成相结合的技术架构，"
        "通过先检索后生成的方式提升答案的准确性和时效性。",
        "常见向量数据库包括Milvus、Pinecone、Weaviate、Qdrant、Chroma等。",
        "提高召回率可通过混合检索、查询扩展、优化分块、增加top-K等方式。",
    ],
}

dataset = Dataset.from_dict(eval_data)

# 运行评估
results = evaluate(
    dataset,
    metrics=[
        faithfulness,
        answer_relevance,
        context_precision,
        context_recall,
    ],
)

print(results)
# 输出类似：
# {'faithfulness': 0.85, 'answer_relevance': 0.92,
#  'context_precision': 0.78, 'context_recall': 0.88}
```

### 12.3.2 TruLens

TruLens提供了针对RAG的"三元组"评估（Triad），关注三个关键维度：

1. **Answer Relevance**：答案是否回应了问题
2. **Context Relevance**：检索到的上下文是否与问题相关
3. **Groundedness**：答案是否基于上下文（即没有幻觉）

```python
from trulens.apps.basic import TruChain
from trulens.core import Feedback
from trulens.providers.openai import OpenAI

# 初始化评估提供者
provider = OpenAI()

# 定义反馈函数
f_qa_relevance = Feedback(provider.relevance, name="Answer Relevance")
f_context_relevance = Feedback(provider.relevance, name="Context Relevance")
f_groundedness = Feedback(provider.groundedness, name="Groundedness")

# 包装RAG链
tru_chain = TruChain(
    rag_chain,
    app_name="RAG System",
    app_version="v1.0",
    feedbacks=[f_qa_relevance, f_context_relevance, f_groundedness],
)

# 运行并记录评估
with tru_chain as recording:
    response = tru_chain.invoke("什么是向量数据库？")

# 查看评估结果
from trulens.dashboard import run_dashboard
run_dashboard(tru_chain)  # 启动可视化仪表盘
```

### 12.3.3 DeepEval

DeepEval提供了专门针对RAG的指标套件，支持断言式测试：

```python
from deepeval import assert_test
from deepeval.metrics import (
    FaithfulnessMetric,
    AnswerRelevancyMetric,
    ContextualPrecisionMetric,
    ContextualRecallMetric,
)
from deepeval.test_case import LLMTestCase

# 创建测试用例
test_case = LLMTestCase(
    input="什么是混合检索？",
    actual_output="混合检索是结合BM25关键词搜索和向量语义搜索的检索策略，"
                  "能够同时兼顾精确匹配和语义理解能力。",
    expected_output="混合检索结合了关键词匹配和语义搜索两种方式。",
    retrieval_context=[
        "混合检索（Hybrid Search）同时使用BM25算法进行关键词精确匹配"
        "和向量搜索进行语义匹配，通过融合两者的得分来提升检索质量。"
    ],
)

# 定义评估指标
faithfulness = FaithfulnessMetric(threshold=0.7)
answer_relevancy = AnswerRelevancyMetric(threshold=0.7)
context_precision = ContextualPrecisionMetric(threshold=0.7)
context_recall = ContextualRecallMetric(threshold=0.7)

# 运行评估
assert_test(test_case, [faithfulness, answer_relevancy,
                        context_precision, context_recall])
```

---

## 12.4 评估数据集构建

评估数据集的质量直接决定评估结果的可靠性。一个完整的RAG评估数据集通常包含"问题-上下文-答案"三元组。

### 12.4.1 黄金数据集（Golden Dataset）

黄金数据集是人工标注的高质量评估数据，每条包含：

- **Question**：用户问题
- **Context**：问题对应的正确上下文片段（从知识库中标注）
- **Answer**：基于上下文的参考答案

```python
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class GoldenEntry:
    """黄金数据集条目"""
    question: str
    context: List[str]          # 相关文档片段列表
    answer: str                 # 参考答案
    difficulty: str             # easy / medium / hard
    question_type: str          # factoid / descriptive / multi-hop
    source_doc_id: Optional[str] = None  # 来源文档ID


# 示例：手动构建黄金数据集
golden_dataset = [
    GoldenEntry(
        question="RAG系统中混合检索相比纯向量检索有什么优势？",
        context=[
            "混合检索同时使用BM25算法进行关键词精确匹配和向量搜索"
            "进行语义匹配。BM25擅长处理精确关键词查询，如产品编号、"
            "专有名词等；向量搜索擅长理解同义词和语义关联。",
            "实验表明，混合检索在大多数场景下优于纯向量检索，"
            "特别是在包含专有名词和术语的领域中，提升幅度可达10-30%。",
        ],
        answer="混合检索结合了BM25关键词匹配和向量语义搜索的优势。"
               "BM25擅长精确匹配（如产品编号、专有名词），向量搜索"
               "擅长语义理解。实验显示混合检索在含术语的场景中"
               "可提升10-30%的效果。",
        difficulty="medium",
        question_type="descriptive",
    ),
    # ... 更多条目
]
```

### 12.4.2 合成数据生成

手动标注成本高昂，可以使用LLM自动生成评估数据：

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI


def generate_synthetic_eval_data(
    documents: list[str],
    num_questions: int = 20,
) -> list[dict]:
    """使用LLM从文档中生成合成评估数据"""
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)

    generate_prompt = ChatPromptTemplate.from_messages([
        ("system", """你是一个RAG评估数据生成器。给定一段文档内容，请生成：
1. 一个用户可能会问的问题
2. 基于文档内容的完整答案
3. 问题难度等级（easy/medium/hard）
4. 问题类型（factoid/descriptive/multi-hop）

请以JSON格式输出。"""),
        ("user", "文档内容：\n{document}"),
    ])

    chain = generate_prompt | llm

    results = []
    for doc in documents[:num_questions]:
        response = chain.invoke({"document": doc})
        # 解析LLM返回的JSON
        results.append(response.content)

    return results
```

### 12.4.3 Human-in-the-Loop评估

自动化指标无法完全替代人工判断，生产级评估需要结合人工评审：

```python
from dataclasses import dataclass
from typing import Optional


@dataclass
class HumanEvaluationRecord:
    """人工评估记录"""
    question: str
    generated_answer: str
    retrieved_context: list[str]

    # 人工评分（1-5分）
    relevance_score: Optional[int] = None       # 答案与问题的相关性
    faithfulness_score: Optional[int] = None     # 答案对上下文的忠实度
    completeness_score: Optional[int] = None     # 答案的完整性
    readability_score: Optional[int] = None      # 答案的可读性
    overall_score: Optional[int] = None          # 综合评分
    reviewer_notes: Optional[str] = None         # 评审备注


def create_evaluation_form(record: HumanEvaluationRecord) -> str:
    """生成人工评估表单"""
    return f"""
=== RAG系统评估 ===

【问题】{record.question}

【检索上下文】
{chr(10).join(f'[{i+1}] {ctx}' for i, ctx in enumerate(record.retrieved_context))}

【系统回答】{record.generated_answer}

请评分（1-5分）：
- 相关性（答案是否回应了问题）：___
- 忠实度（答案是否基于上下文）：___
- 完整性（答案是否包含所需信息）：___
- 可读性（答案是否清晰易懂）：___
- 综合评分：___
- 备注：___
"""
```

---

## 12.5 常见问题与优化策略

### 12.5.1 检索不到相关文档

这是RAG系统最常见也最致命的问题。当检索环节无法找到与问题相关的文档时，后续所有环节都将失效。

**优化方案1：改进分块策略**

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader

# 不推荐：固定大小分块，可能切断语义
naive_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
)

# 推荐：语义感知分块，保留语义完整性
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

semantic_splitter = SemanticChunker(
    OpenAIEmbeddings(),
    breakpoint_threshold_type="percentile",  # 按语义断点分块
    breakpoint_threshold_amount=75,           # 阈值百分位
)
```

**优化方案2：查询扩展与HyDE**

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI


class HyDEQueryTransformer:
    """Hypothetical Document Embeddings（假设文档嵌入）
    
    原理：先用LLM生成一个假设性答案，然后用该答案的嵌入
    去检索真实文档。假设答案与真实文档在嵌入空间中更接近。
    """

    def __init__(self, llm=None):
        self.llm = llm or ChatOpenAI(model="gpt-4o", temperature=0.0)
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", "请为以下问题生成一段详细的假设性答案，"
                       "就好像你完全知道答案一样。"),
            ("user", "{question}"),
        ])
        self.chain = self.prompt | self.llm

    def transform(self, query: str) -> str:
        """将原始查询转换为假设文档"""
        response = self.chain.invoke({"question": query})
        return response.content


class MultiQueryExpander:
    """多查询扩展：从不同角度生成多个查询变体"""

    def __init__(self, llm=None, num_variants: int = 3):
        self.llm = llm or ChatOpenAI(model="gpt-4o", temperature=0.7)
        self.num_variants = num_variants
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", f"请为以下问题生成{num_variants}个不同角度的变体问题，"
                       "每行一个，不要编号。"),
            ("user", "{question}"),
        ])
        self.chain = self.prompt | self.llm

    def expand(self, query: str) -> list[str]:
        response = self.chain.invoke({"question": query})
        variants = [q.strip() for q in response.content.strip().split("\n")
                    if q.strip()]
        return [query] + variants  # 包含原始查询
```

**优化方案3：混合检索**

```python
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain_community.vectorstores import Chroma


def create_hybrid_retriever(
    documents,
    vector_store,
    bm25_weight: float = 0.4,
    vector_weight: float = 0.6,
    k: int = 10,
):
    """创建混合检索器：BM25 + 向量搜索"""

    # BM25检索器（关键词精确匹配）
    bm25_retriever = BM25Retriever.from_documents(documents)
    bm25_retriever.k = k

    # 向量检索器（语义搜索）
    vector_retriever = vector_store.as_retriever(
        search_kwargs={"k": k}
    )

    # 混合检索器
    ensemble_retriever = EnsembleRetriever(
        retrievers=[bm25_retriever, vector_retriever],
        weights=[bm25_weight, vector_weight],
    )

    return ensemble_retriever
```

### 12.5.2 检索上下文过长

过多的检索结果会稀释关键信息，增加LLM处理成本和幻觉风险。

**优化方案：重排序与上下文压缩**

```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain_cohere import CohereRerank
from langchain_openai import ChatOpenAI
from langchain.chains import LLMChain


# 方案1：使用重排序模型过滤
def create_reranking_retriever(base_retriever, top_k: int = 5):
    """使用Cohere Rerank对检索结果重排序"""
    compressor = CohereRerank(
        model="rerank-multilingual-v3.0",
        top_n=top_k,
    )
    compression_retriever = ContextualCompressionRetriever(
        base_compressor=compressor,
        base_retriever=base_retriever,
    )
    return compression_retriever


# 方案2：使用LLM提取关键信息
def create_llm_compressor(llm=None):
    """使用LLM压缩上下文，仅保留与问题相关的部分"""
    from langchain.chains import LLMChain
    from langchain_core.prompts import ChatPromptTemplate

    llm = llm or ChatOpenAI(model="gpt-4o-mini")

    prompt = ChatPromptTemplate.from_messages([
        ("system", "请从以下文档片段中提取与问题最相关的信息，"
                   "去除无关内容。保持原文表述，不要添加新信息。"),
        ("user", "问题：{question}\n\n文档片段：\n{context}"),
    ])

    chain = prompt | llm
    return chain


# 方案3：父文档检索（Parent-Child Retrieval）
# 先用小块精确匹配，再返回包含该小块的大文档
from langchain.retrievers import ParentDocumentRetriever
from langchain.storage import InMemoryStore


def create_parent_child_retriever(documents, vector_store, embeddings):
    """父文档检索器：用小块检索，返回大文档"""

    # 子分块器（用于精确匹配）
    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=200,
        chunk_overlap=20,
    )

    # 父分块器（用于返回完整上下文）
    parent_splitter = RecursiveCharacterTextSplitter(
        chunk_size=2000,
        chunk_overlap=200,
    )

    # 文档存储（存储父文档）
    docstore = InMemoryStore()

    retriever = ParentDocumentRetriever(
        vectorstore=vector_store,
        docstore=docstore,
        child_splitter=child_splitter,
        parent_splitter=parent_splitter,
        documents=documents,
    )

    return retriever
```

### 12.5.3 LLM幻觉问题

即使检索到了正确的上下文，LLM仍可能产生幻觉——编造不在上下文中的信息。

**优化方案：Prompt工程与引用机制**

```python
RAG_PROMPT_TEMPLATE = """你是一个严格的问答助手。请仅基于以下检索到的上下文回答问题。

重要规则：
1. 只使用下方上下文中明确提到的信息，不要编造或推断
2. 如果上下文中没有足够信息回答问题，请明确回答"根据提供的资料，我无法回答这个问题"
3. 在回答中标注信息来源，使用[文档N]的格式
4. 不要使用任何外部知识

检索到的上下文：
{context}

用户问题：{question}

请基于上下文回答："""


def build_rag_chain_with_citations(retriever, llm):
    """构建带引用的RAG链"""
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser
    from langchain_core.runnables import RunnablePassthrough

    prompt = ChatPromptTemplate.from_template(RAG_PROMPT_TEMPLATE)

    def format_docs_with_ids(docs):
        """格式化文档并添加编号"""
        formatted = []
        for i, doc in enumerate(docs, 1):
            formatted.append(f"[文档{i}] {doc.page_content}")
        return "\n\n".join(formatted)

    chain = (
        {
            "context": retriever | format_docs_with_ids,
            "question": RunnablePassthrough(),
        }
        | prompt
        | llm
        | StrOutputParser()
    )

    return chain
```

### 12.5.4 检索延迟过高

**优化方案：索引参数调优与缓存**

```python
from functools import lru_cache
from typing import Optional


# 方案1：向量数据库索引参数优化
def create_optimized_milvus_collection(
    collection_name: str,
    dim: int = 1536,
):
    """创建优化的Milvus集合"""
    from pymilvus import CollectionSchema, FieldSchema, DataType, Collection

    # HNSW索引参数优化
    # ef: 搜索时的动态列表大小，越大越精确但越慢
    # M: 每个节点的最大连接数，越大越精确但内存越多
    index_params = {
        "metric_type": "COSINE",
        "index_type": "HNSW",
        "params": {
            "M": 16,          # 平衡精度与内存 (范围: 4-64)
            "efConstruction": 256,  # 构建时精度 (范围: 8-512)
        },
    }

    search_params = {
        "metric_type": "COSINE",
        "params": {
            "ef": 128,  # 搜索时精度 (范围: top_K-32768)
        },
    }

    return index_params, search_params


# 方案2：查询结果缓存
class CachedRetriever:
    """带缓存的检索器"""

    def __init__(self, base_retriever, cache_size: int = 1000):
        self.base_retriever = base_retriever
        self._cache = {}
        self._max_cache_size = cache_size

    def invoke(self, query: str):
        """检索，优先使用缓存"""
        cache_key = query.strip().lower()

        if cache_key in self._cache:
            return self._cache[cache_key]

        results = self.base_retriever.invoke(query)

        # 简单LRU缓存
        if len(self._cache) >= self._max_cache_size:
            self._cache.pop(next(iter(self._cache)))
        self._cache[cache_key] = results

        return results


# 方案3：向量量化降低内存
def create_quantized_index(embeddings, documents):
    """使用量化降低内存占用和搜索延迟"""
    from langchain_community.vectorstores import FAISS

    # 创建索引时启用量化
    vector_store = FAISS.from_documents(
        documents,
        embeddings,
    )

    # FAISS支持多种量化方式：
    # - PQ (Product Quantization): 大幅压缩内存
    # - OPQ (Optimized Product Quantization): 更精确的PQ
    # - IVF + PQ: 先聚类再量化，适合大规模数据

    return vector_store
```

### 12.5.5 特定查询表现不佳

某些类型的查询（如多跳推理、比较性问题、领域术语密集的问题）可能表现较差。

```python
class QueryDecomposer:
    """查询分解：将复杂问题拆解为多个子问题"""

    def __init__(self, llm=None):
        self.llm = llm or ChatOpenAI(model="gpt-4o", temperature=0.0)
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", "将以下复杂问题分解为多个简单的子问题，"
                       "每个子问题应该是可以独立回答的。每行一个子问题。"),
            ("user", "{question}"),
        ])
        self.chain = self.prompt | self.llm

    def decompose(self, question: str) -> list[str]:
        response = self.chain.invoke({"question": question})
        sub_questions = [
            q.strip() for q in response.content.strip().split("\n")
            if q.strip()
        ]
        return sub_questions


class MultiHopRAG:
    """多跳RAG：逐步检索和推理"""

    def __init__(self, retriever, llm):
        self.retriever = retriever
        self.llm = llm
        self.decomposer = QueryDecomposer(llm)

    def query(self, question: str) -> str:
        # 步骤1：分解问题
        sub_questions = self.decomposer.decompose(question)

        # 步骤2：对每个子问题分别检索
        all_contexts = []
        for sub_q in sub_questions:
            docs = self.retriever.invoke(sub_q)
            all_contexts.extend([doc.page_content for doc in docs])

        # 步骤3：汇总上下文，生成最终答案
        context_str = "\n\n".join(set(all_contexts))

        prompt = ChatPromptTemplate.from_messages([
            ("system", "基于以下检索到的信息，综合回答用户的原始问题。"),
            ("user", "原始问题：{question}\n\n子问题：{sub_questions}\n\n"
                     "检索信息：{context}"),
        ])

        chain = prompt | self.llm
        response = chain.invoke({
            "question": question,
            "sub_questions": "\n".join(f"- {sq}" for sq in sub_questions),
            "context": context_str,
        })

        return response.content
```

### 12.5.6 知识过期问题

知识库中的文档会随时间变得过时，需要建立更新机制。

```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class DocumentMetadata:
    """文档元数据，支持增量更新"""
    doc_id: str
    source: str
    created_at: datetime
    updated_at: datetime
    content_hash: str           # 内容哈希，用于变更检测
    version: int = 1
    tags: list[str] = field(default_factory=list)


class IncrementalIndexer:
    """增量索引管理器"""

    def __init__(self, vector_store, embedding_model):
        self.vector_store = vector_store
        self.embedding_model = embedding_model
        self._doc_registry = {}  # doc_id -> DocumentMetadata

    def detect_changes(
        self,
        documents: list[tuple[str, str]],  # (doc_id, content)
    ) -> dict:
        """检测新增、修改和删除的文档"""
        new_docs = []
        updated_docs = []
        deleted_doc_ids = []

        current_ids = {doc_id for doc_id, _ in documents}

        # 检测新增和修改
        for doc_id, content in documents:
            content_hash = hash(content)
            if doc_id not in self._doc_registry:
                new_docs.append((doc_id, content))
            elif self._doc_registry[doc_id].content_hash != content_hash:
                updated_docs.append((doc_id, content))

        # 检测删除
        for registered_id in self._doc_registry:
            if registered_id not in current_ids:
                deleted_doc_ids.append(registered_id)

        return {
            "new": new_docs,
            "updated": updated_docs,
            "deleted": deleted_doc_ids,
        }

    def incremental_update(self, documents: list[tuple[str, str]]):
        """执行增量索引更新"""
        changes = self.detect_changes(documents)

        # 删除过期文档
        for doc_id in changes["deleted"]:
            self.vector_store.delete([doc_id])
            del self._doc_registry[doc_id]

        # 添加新文档
        for doc_id, content in changes["new"]:
            # 这里简化，实际需要分块和嵌入
            self._doc_registry[doc_id] = DocumentMetadata(
                doc_id=doc_id,
                source="incremental_update",
                created_at=datetime.now(),
                updated_at=datetime.now(),
                content_hash=hash(content),
            )

        # 更新修改的文档
        for doc_id, content in changes["updated"]:
            self.vector_store.delete([doc_id])
            self._doc_registry[doc_id].updated_at = datetime.now()
            self._doc_registry[doc_id].content_hash = hash(content)
            self._doc_registry[doc_id].version += 1

        return {
            "added": len(changes["new"]),
            "updated": len(changes["updated"]),
            "deleted": len(changes["deleted"]),
        }
```

---

## 12.6 优化检查清单

在部署和运维RAG系统时，请逐项确认以下优化是否到位：

### 检索层
- [ ] **分块策略**：是否针对不同文档类型采用了合适的分块方案（语义分块、Markdown分块等）
- [ ] **嵌入模型**：是否在领域数据上评估过不同嵌入模型的效果
- [ ] **混合检索**：是否配置了BM25+向量的混合检索
- [ ] **重排序**：是否在检索后添加了重排序步骤
- [ ] **查询扩展**：是否对查询进行了HyDE或多查询扩展

### 生成层
- [ ] **Prompt设计**：是否明确要求LLM仅基于上下文回答
- [ ] **温度设置**：是否使用了较低的温度（0.0-0.3）以减少幻觉
- [ ] **引用机制**：是否在回答中包含信息来源引用
- [ ] **上下文预算**：是否控制了输入上下文的长度，避免超出窗口

### 运维层
- [ ] **评估流水线**：是否建立了自动化的RAG评估流程
- [ ] **增量索引**：是否配置了文档变更检测和增量更新
- [ ] **延迟SLA**：是否满足端到端延迟要求（通常<5秒）
- [ ] **监控告警**：是否对检索质量、生成质量设置了监控和告警

---

## 12.7 小结

RAG评估与优化是一个持续迭代的过程。关键要点：

1. **先评估，再优化**：用数据驱动决策，避免盲目调参
2. **分层诊断**：先评估检索质量，再评估生成质量，定位瓶颈
3. **组合优化**：分块、嵌入、检索、重排序、Prompt等多个环节的优化往往需要组合使用
4. **持续监控**：生产环境中的数据分布会随时间变化，评估和监控不能只做一次

下一章将讨论RAG系统的生产部署最佳实践和未来发展方向。