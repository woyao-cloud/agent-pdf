# 第8章 企业知识库问答

企业知识库问答（Enterprise Knowledge Base Q&A）是 LightRAG 最核心、最具商业价值的应用场景。传统企业拥有海量内部文档——产品手册、技术规范、运维记录、客户工单、合规文档等，员工需要快速从这些文档中获取准确答案。本章将从场景分析出发，完整讲解如何基于 LightRAG 构建一套生产级的企业知识库问答系统。

---

## 8.1 场景描述与需求分析

### 8.1.1 企业知识库问答的典型场景

企业知识库问答覆盖的典型场景包括：

- **内部知识检索**：新员工查找产品功能说明、API 文档、内部流程规范
- **技术支持辅助**：客服人员查询已知问题的解决方案、故障处理步骤
- **合规审计查询**：法务或合规人员检索政策文档中的具体条款
- **研发知识管理**：工程师查找技术设计文档、架构决策记录、代码评审记录
- **客户自助服务**：面向客户的 FAQ 系统，自动回答产品使用问题

这些场景的共同特点是：**数据源是结构化和非结构化混合的企业内部文档，查询需要精确理解业务术语和实体关系，答案必须可追溯、可验证**。

### 8.1.2 传统方案的痛点

| 方案 | 痛点 |
|------|------|
| 关键词搜索（Elasticsearch） | 无法理解语义，同义词/近义词匹配差，无法处理复杂问题 |
| 传统 RAG（向量检索 + LLM） | 无法捕捉文档间实体关系，多跳推理能力弱，全局理解差 |
| 人工维护 FAQ | 维护成本高，更新滞后，覆盖面有限 |
| 微软 GraphRAG | Token 消耗大，构建成本高，增量更新复杂 |

### 8.1.3 LightRAG 的解决方案

LightRAG 通过图结构索引 + 双级检索机制，为企业知识库问答提供了更优的解决方案：

1. **关系感知**：自动提取文档中的实体和关系，构建知识图谱，支持多跳推理
2. **双级检索**：低层检索精确匹配具体事实，高层检索提供主题概览和抽象摘要
3. **增量更新**：新文档加入时无需重建整个索引，大幅降低维护成本
4. **轻量高效**：相比 GraphRAG 减少 50-80% 的 Token 消耗，构建速度快 10 倍以上

### 8.1.4 系统需求分析

构建企业知识库问答系统，需要满足以下核心需求：

**功能需求**：
- 支持多种文档格式（PDF、Word、Markdown、HTML、纯文本）
- 支持自然语言提问，返回准确答案
- 答案附带引用来源，支持追溯验证
- 支持增量添加新文档
- 支持特定领域知识库的定制

**非功能需求**：
- 查询响应时间 < 5 秒（首次查询可接受 10-15 秒）
- 支持百万级文档的索引
- 支持并发查询
- 答案准确率 > 85%（基于业务测试集评估）

---

## 8.2 知识库文档处理

### 8.2.1 文档处理流水线

企业知识库的文档处理是整个系统的第一步，也是决定最终问答质量的关键环节。文档处理流水线通常包含以下步骤：

```
原始文档 → 格式解析 → 文本提取 → 清洗与标准化 → 分块 → 元数据标注 → 存储
```

### 8.2.2 多格式文档解析

企业知识库中的文档格式五花八门，需要针对不同格式采用不同的解析策略：

```python
import os
from pathlib import Path
from typing import List, Dict, Any
import fitz  # PyMuPDF for PDF
from docx import Document as DocxDocument
import markdown
from bs4 import BeautifulSoup
import re


class DocumentParser:
    """多格式文档解析器"""

    SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".md", ".txt", ".html", ".htm"}

    def parse(self, file_path: str) -> Dict[str, Any]:
        ext = Path(file_path).suffix.lower()
        if ext not in self.SUPPORTED_EXTENSIONS:
            raise ValueError(f"Unsupported file format: {ext}")

        parser_map = {
            ".pdf": self._parse_pdf,
            ".docx": self._parse_docx,
            ".md": self._parse_markdown,
            ".txt": self._parse_text,
            ".html": self._parse_html,
            ".htm": self._parse_html,
        }
        parser = parser_map[ext]
        content = parser(file_path)
        return {
            "file_path": file_path,
            "file_name": Path(file_path).name,
            "file_ext": ext,
            "content": content,
            "char_count": len(content),
        }

    def _parse_pdf(self, file_path: str) -> str:
        doc = fitz.open(file_path)
        texts = []
        for page in doc:
            texts.append(page.get_text())
        doc.close()
        return "\n".join(texts)

    def _parse_docx(self, file_path: str) -> str:
        doc = DocxDocument(file_path)
        return "\n".join(p.text for p in doc.paragraphs)

    def _parse_markdown(self, file_path: str) -> str:
        with open(file_path, "r", encoding="utf-8") as f:
            raw = f.read()
        html = markdown.markdown(raw)
        soup = BeautifulSoup(html, "html.parser")
        return soup.get_text()

    def _parse_text(self, file_path: str) -> str:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    def _parse_html(self, file_path: str) -> str:
        with open(file_path, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "html.parser")
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
        return soup.get_text(separator="\n")
```

### 8.2.3 文本清洗与标准化

提取的原始文本通常包含大量噪声，需要进行清洗：

```python
class TextCleaner:
    """文本清洗与标准化"""

    @staticmethod
    def clean(text: str) -> str:
        text = re.sub(r"\s+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
        text = text.strip()
        return text

    @staticmethod
    def remove_boilerplate(text: str) -> str:
        lines = text.split("\n")
        cleaned = []
        for line in lines:
            stripped = line.strip()
            if len(stripped) < 5:
                continue
            if re.match(r"^(第\s*\d+\s*页|Page\s+\d+|Confidential|机密|内部资料)\s*$", stripped, re.IGNORECASE):
                continue
            cleaned.append(line)
        return "\n".join(cleaned)
```

### 8.2.4 文档分块策略

文档分块是影响检索质量的关键因素。LightRAG 内部会进一步对文本进行实体和关系提取，但输入到 LightRAG 之前的预处理分块同样重要。

**分块策略选择**：

| 策略 | 块大小 | 重叠 | 适用场景 |
|------|--------|------|---------|
| 固定大小分块 | 512-1024 tokens | 128 tokens | 通用场景 |
| 段落分块 | 按段落 | 0 | 结构化文档 |
| 语义分块 | 语义边界 | 1-2 句 | 高质量要求 |
| 递归分块 | 分层递归 | 自适应 | 长文档 |

企业场景推荐使用**语义分块**策略，即按语义边界（段落、小节标题）进行分块，保持每个块的语义完整性：

```python
class SemanticChunker:
    """语义分块器：按标题和段落边界分块"""

    def __init__(self, max_chunk_size: int = 1500, min_chunk_size: int = 100):
        self.max_chunk_size = max_chunk_size
        self.min_chunk_size = min_chunk_size

    def chunk(self, text: str) -> List[Dict[str, Any]]:
        sections = self._split_by_headings(text)
        chunks = []
        for section in sections:
            chunks.extend(self._chunk_section(section))
        return chunks

    def _split_by_headings(self, text: str) -> List[str]:
        heading_pattern = re.compile(
            r"^(#{1,6}\s+.*|第[一二三四五六七八九十]+章\s+.*|"
            r"\d+\.\d+\s+.*|【.*】)$",
            re.MULTILINE,
        )
        parts = heading_pattern.split(text)
        sections = []
        current = ""
        for part in parts:
            if heading_pattern.match(part.strip()):
                if current.strip():
                    sections.append(current.strip())
                current = part
            else:
                current += part
        if current.strip():
            sections.append(current.strip())
        return sections

    def _chunk_section(self, section: str) -> List[Dict[str, Any]]:
        if len(section) <= self.max_chunk_size:
            return [{"text": section, "char_count": len(section)}]

        paragraphs = re.split(r"\n\s*\n", section)
        chunks = []
        current_chunk = ""
        for para in paragraphs:
            if len(current_chunk) + len(para) <= self.max_chunk_size:
                current_chunk += "\n\n" + para if current_chunk else para
            else:
                if current_chunk and len(current_chunk) >= self.min_chunk_size:
                    chunks.append({"text": current_chunk.strip(), "char_count": len(current_chunk)})
                current_chunk = para
        if current_chunk and len(current_chunk) >= self.min_chunk_size:
            chunks.append({"text": current_chunk.strip(), "char_count": len(current_chunk)})
        return chunks
```

### 8.2.5 元数据管理

每个文档块需要携带丰富的元数据，以便在检索后进行溯源和过滤：

```python
@dataclass
class DocumentChunk:
    text: str
    doc_id: str
    chunk_id: str
    file_name: str
    file_path: str
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    created_at: str = ""
    embedding: Optional[List[float]] = None
```

---

## 8.3 LightRAG 索引构建

### 8.3.1 索引构建流程

将处理好的文档块输入 LightRAG 构建索引，整体流程如下：

```
文档块 → 实体提取(LLM) → 关系提取(LLM) → 图构建(NetworkX) → 向量嵌入 → 持久化存储
```

### 8.3.2 初始化 LightRAG

```python
from lightrag import LightRAG, QueryParam
from lightrag.llm import gpt_4o_mini_complete, openai_complete
from lightrag.embedding import openai_embedding
import os

# 配置 LLM 和嵌入模型
os.environ["OPENAI_API_KEY"] = "your-api-key"

rag = LightRAG(
    working_dir="./kb_index",
    llm_model_func=gpt_4o_mini_complete,
    embedding_func=openai_embedding,
    embedding_dim=1536,
)
```

**关键参数说明**：

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `working_dir` | 索引存储目录 | 按知识库命名 |
| `llm_model_func` | LLM 调用函数 | gpt-4o-mini（性价比高） |
| `embedding_func` | 嵌入函数 | text-embedding-3-small |
| `embedding_dim` | 嵌入维度 | 1536（与模型匹配） |

### 8.3.3 批量索引构建

对于企业知识库，通常需要批量处理大量文档：

```python
class KnowledgeBaseIndexer:
    """知识库索引构建器"""

    def __init__(self, working_dir: str, llm_func=None, embedding_func=None):
        self.working_dir = working_dir
        os.makedirs(working_dir, exist_ok=True)
        self.rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=llm_func or gpt_4o_mini_complete,
            embedding_func=embedding_func or openai_embedding,
            embedding_dim=1536,
        )
        self.parser = DocumentParser()
        self.cleaner = TextCleaner()
        self.chunker = SemanticChunker()

    def index_document(self, file_path: str) -> Dict[str, Any]:
        parsed = self.parser.parse(file_path)
        cleaned = self.cleaner.clean(parsed["content"])
        cleaned = self.cleaner.remove_boilerplate(cleaned)
        chunks = self.chunker.chunk(cleaned)

        inserted_count = 0
        for chunk in chunks:
            text = chunk["text"]
            if len(text) < 50:
                continue
            self.rag.insert(text)
            inserted_count += 1

        return {
            "file": parsed["file_name"],
            "chunks": inserted_count,
            "char_count": parsed["char_count"],
        }

    def index_directory(self, dir_path: str) -> List[Dict[str, Any]]:
        results = []
        for root, _, files in os.walk(dir_path):
            for file in files:
                ext = Path(file).suffix.lower()
                if ext not in DocumentParser.SUPPORTED_EXTENSIONS:
                    continue
                file_path = os.path.join(root, file)
                try:
                    result = self.index_document(file_path)
                    results.append(result)
                    print(f"  ✓ {file} → {result['chunks']} chunks")
                except Exception as e:
                    print(f"  ✗ {file} → error: {e}")
        return results
```

### 8.3.4 索引构建的耗时与成本

以一个包含 100 份文档（约 50 万字）的中型企业知识库为例：

| 阶段 | 耗时 | Token 消耗 | 成本估算 |
|------|------|-----------|---------|
| 文档解析 | 5-10 秒 | 0 | 0 |
| 实体提取 | 3-5 分钟 | ~200K tokens | ~$0.03 |
| 关系提取 | 3-5 分钟 | ~200K tokens | ~$0.03 |
| 向量嵌入 | 1-2 分钟 | ~50K tokens | ~$0.001 |
| **总计** | **~10 分钟** | **~450K tokens** | **~$0.06** |

相比之下，同等规模的微软 GraphRAG 需要 30-60 分钟，Token 消耗约 2-5M，成本约 $0.3-0.8。LightRAG 在构建效率上具有显著优势。

### 8.3.5 增量更新

企业知识库是动态变化的，新文档不断产生。LightRAG 支持增量更新，无需重建索引：

```python
def incremental_update(self, new_files: List[str]) -> Dict[str, Any]:
    """增量更新知识库"""
    total_chunks = 0
    errors = []
    for file_path in new_files:
        try:
            result = self.index_document(file_path)
            total_chunks += result["chunks"]
            print(f"  + {result['file']} ({result['chunks']} chunks)")
        except Exception as e:
            errors.append({"file": file_path, "error": str(e)})
    return {
        "total_files": len(new_files),
        "total_chunks": total_chunks,
        "errors": errors,
    }
```

增量更新的核心优势在于：
- 新文档的实体和关系会被合并到现有图结构中
- 已有实体会被识别并去重
- 新关系会补充到相关实体之间
- 无需重新处理已有文档

---

## 8.4 问答系统实现

### 8.4.1 查询模式设计

LightRAG 提供三种查询模式，对应不同的业务场景：

```python
from lightrag import QueryParam

# 低层检索：精确事实查询
param_low = QueryParam(mode="low", top_k=10)

# 高层检索：主题概览查询
param_high = QueryParam(mode="high", top_k=10)

# 混合检索：综合查询（默认）
param_hybrid = QueryParam(mode="hybrid", top_k=10)
```

**模式选择指南**：

| 查询模式 | 适用场景 | 示例问题 |
|---------|---------|---------|
| `low` | 具体事实、数值、定义 | "数据库连接超时时间默认是多少？" |
| `high` | 主题概览、趋势、总结 | "公司有哪些安全合规政策？" |
| `hybrid` | 综合查询、复杂推理 | "如何配置双因素认证？需要哪些步骤？" |

### 8.4.2 问答引擎实现

```python
class QAEngine:
    """企业知识库问答引擎"""

    def __init__(self, indexer: KnowledgeBaseIndexer):
        self.rag = indexer.rag

    def query(
        self,
        question: str,
        mode: str = "hybrid",
        top_k: int = 10,
        history: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        param = QueryParam(mode=mode, top_k=top_k)
        answer = self.rag.query(question, param=param)
        return {
            "question": question,
            "answer": answer,
            "mode": mode,
        }

    def query_with_sources(
        self,
        question: str,
        mode: str = "hybrid",
        top_k: int = 10,
    ) -> Dict[str, Any]:
        param = QueryParam(mode=mode, top_k=top_k)
        result = self.rag.query_with_selection(question, param=param)
        return {
            "question": question,
            "answer": result["answer"],
            "mode": mode,
            "sources": result.get("sources", []),
        }
```

### 8.4.3 多轮对话支持

企业知识库问答往往需要多轮交互，用户会基于前一个答案继续追问：

```python
class ConversationalQA:
    """支持多轮对话的问答引擎"""

    def __init__(self, qa_engine: QAEngine):
        self.qa = qa_engine
        self.conversation_history = []

    def ask(self, question: str, mode: str = "hybrid") -> str:
        context = self._build_context()
        full_question = self._augment_with_context(question, context)
        result = self.qa.query(full_question, mode=mode)
        self.conversation_history.append({
            "role": "user",
            "content": question,
        })
        self.conversation_history.append({
            "role": "assistant",
            "content": result["answer"],
        })
        return result["answer"]

    def _build_context(self) -> str:
        recent = self.conversation_history[-6:]
        if not recent:
            return ""
        lines = []
        for msg in recent:
            prefix = "用户" if msg["role"] == "user" else "助手"
            lines.append(f"{prefix}: {msg['content']}")
        return "\n".join(lines)

    def _augment_with_context(self, question: str, context: str) -> str:
        if not context:
            return question
        return (
            f"基于以下对话历史回答用户的最新问题。\n\n"
            f"对话历史：\n{context}\n\n"
            f"最新问题：{question}"
        )

    def reset(self):
        self.conversation_history = []
```

### 8.4.4 答案后处理与格式化

企业场景中，答案的呈现方式直接影响用户体验：

```python
class AnswerFormatter:
    """答案格式化与后处理"""

    @staticmethod
    def format_answer(answer: str, sources: List[str] = None) -> str:
        formatted = answer.strip()
        if sources:
            source_refs = "\n\n---\n**参考来源**：\n"
            for i, src in enumerate(sources, 1):
                source_refs += f"{i}. {src}\n"
            formatted += source_refs
        return formatted

    @staticmethod
    def extract_citations(text: str) -> str:
        citations = re.findall(r"\[(\d+)\]", text)
        return ", ".join(citations) if citations else "无引用"

    @staticmethod
    def truncate_to_sentence(text: str, max_chars: int = 500) -> str:
        if len(text) <= max_chars:
            return text
        truncated = text[:max_chars]
        last_period = truncated.rfind("。")
        if last_period > 0:
            return truncated[: last_period + 1]
        return truncated + "..."
```

### 8.4.5 查询优化策略

生产环境中，可以通过以下策略提升查询质量：

**查询重写**：对用户问题进行改写，提升检索命中率

```python
class QueryRewriter:
    """查询重写：优化用户问题"""

    def __init__(self, llm_func=None):
        self.llm = llm_func or gpt_4o_mini_complete

    def rewrite(self, question: str) -> str:
        prompt = (
            f"你是一个查询优化助手。请将以下用户问题改写为更适合知识库检索的形式。\n"
            f"- 提取核心实体和关键词\n"
            f"- 去除冗余表达\n"
            f"- 保持原意不变\n\n"
            f"用户问题：{question}\n\n"
            f"优化后的问题："
        )
        return self.llm(prompt)
```

**结果重排序**：对检索结果进行二次排序，提升相关性

```python
class ResultReranker:
    """检索结果重排序"""

    def __init__(self, model_name: str = "BAAI/bge-reranker-v2-m3"):
        try:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
            self.available = True
        except Exception:
            self.available = False

    def rerank(self, query: str, candidates: List[str], top_k: int = 5) -> List[tuple]:
        if not self.available or not candidates:
            return [(c, 1.0) for c in candidates[:top_k]]
        pairs = [[query, c] for c in candidates]
        inputs = self.tokenizer(pairs, padding=True, truncation=True, return_tensors="pt", max_length=512)
        outputs = self.model(**inputs)
        scores = outputs.logits.squeeze(-1).detach().numpy().tolist()
        scored = list(zip(candidates, scores))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]
```

---

## 8.5 完整代码示例

本节提供一个可直接运行的完整企业知识库问答系统代码。完整代码位于 `demos/ch08-qa/` 目录。

### 8.5.1 系统架构

```
demos/ch08-qa/
├── __init__.py
├── document_parser.py    # 文档解析
├── text_cleaner.py       # 文本清洗
├── chunker.py            # 文档分块
├── kb_indexer.py         # 索引构建
├── qa_engine.py          # 问答引擎
├── app.py                # Web API 服务
├── requirements.txt      # 依赖
├── sample_docs/          # 示例文档
└── kb_index/             # 索引存储
```

### 8.5.2 核心实现

**kb_indexer.py** — 知识库索引构建器：

```python
import os
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from lightrag import LightRAG
from lightrag.llm import gpt_4o_mini_complete
from lightrag.embedding import openai_embedding
from document_parser import DocumentParser
from text_cleaner import TextCleaner
from chunker import SemanticChunker


class KnowledgeBaseIndexer:
    def __init__(
        self,
        working_dir: str = "./kb_index",
        llm_func=None,
        embedding_func=None,
        embedding_dim: int = 1536,
    ):
        self.working_dir = working_dir
        os.makedirs(working_dir, exist_ok=True)
        self.rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=llm_func or gpt_4o_mini_complete,
            embedding_func=embedding_func or openai_embedding,
            embedding_dim=embedding_dim,
        )
        self.parser = DocumentParser()
        self.cleaner = TextCleaner()
        self.chunker = SemanticChunker()

    def index_document(self, file_path: str) -> Dict[str, Any]:
        parsed = self.parser.parse(file_path)
        cleaned = self.cleaner.clean(parsed["content"])
        cleaned = self.cleaner.remove_boilerplate(cleaned)
        chunks = self.chunker.chunk(cleaned)
        inserted = 0
        for chunk in chunks:
            text = chunk["text"]
            if len(text) < 50:
                continue
            self.rag.insert(text)
            inserted += 1
        return {
            "file": parsed["file_name"],
            "chunks": inserted,
            "char_count": parsed["char_count"],
        }

    def index_directory(self, dir_path: str) -> List[Dict[str, Any]]:
        results = []
        supported = DocumentParser.SUPPORTED_EXTENSIONS
        for root, _, files in os.walk(dir_path):
            for file in sorted(files):
                ext = Path(file).suffix.lower()
                if ext not in supported:
                    continue
                file_path = os.path.join(root, file)
                try:
                    result = self.index_document(file_path)
                    results.append(result)
                    print(f"  ✓ {file} → {result['chunks']} chunks")
                except Exception as e:
                    print(f"  ✗ {file} → {e}")
        return results

    def incremental_update(self, new_files: List[str]) -> Dict[str, Any]:
        total_chunks = 0
        errors = []
        for file_path in new_files:
            try:
                result = self.index_document(file_path)
                total_chunks += result["chunks"]
                print(f"  + {result['file']} ({result['chunks']} chunks)")
            except Exception as e:
                errors.append({"file": file_path, "error": str(e)})
        return {"total_files": len(new_files), "total_chunks": total_chunks, "errors": errors}

    def get_stats(self) -> Dict[str, Any]:
        stats_path = os.path.join(self.working_dir, "kv_store_stats.json")
        if os.path.exists(stats_path):
            with open(stats_path, "r") as f:
                return json.load(f)
        return {"status": "unknown"}
```

**qa_engine.py** — 问答引擎：

```python
from typing import List, Dict, Any, Optional
from lightrag import QueryParam
from kb_indexer import KnowledgeBaseIndexer


class QAEngine:
    def __init__(self, indexer: KnowledgeBaseIndexer):
        self.rag = indexer.rag

    def query(
        self,
        question: str,
        mode: str = "hybrid",
        top_k: int = 10,
    ) -> Dict[str, Any]:
        param = QueryParam(mode=mode, top_k=top_k)
        answer = self.rag.query(question, param=param)
        return {
            "question": question,
            "answer": answer,
            "mode": mode,
        }

    def batch_query(
        self,
        questions: List[str],
        mode: str = "hybrid",
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        results = []
        for q in questions:
            results.append(self.query(q, mode=mode, top_k=top_k))
        return results


class ConversationalQA:
    def __init__(self, qa_engine: QAEngine):
        self.qa = qa_engine
        self.history: List[Dict[str, str]] = []

    def ask(self, question: str, mode: str = "hybrid") -> str:
        context = self._build_context()
        if context:
            full_question = (
                f"基于以下对话历史回答用户的最新问题。\n\n"
                f"对话历史：\n{context}\n\n"
                f"最新问题：{question}"
            )
        else:
            full_question = question
        result = self.qa.query(full_question, mode=mode)
        self.history.append({"role": "user", "content": question})
        self.history.append({"role": "assistant", "content": result["answer"]})
        return result["answer"]

    def _build_context(self) -> str:
        recent = self.history[-6:]
        if not recent:
            return ""
        lines = []
        for msg in recent:
            prefix = "用户" if msg["role"] == "user" else "助手"
            lines.append(f"{prefix}: {msg['content']}")
        return "\n".join(lines)

    def reset(self):
        self.history = []
```

### 8.5.3 Web API 服务

使用 FastAPI 构建 RESTful API，提供知识库问答服务：

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import uvicorn
from kb_indexer import KnowledgeBaseIndexer
from qa_engine import QAEngine, ConversationalQA

app = FastAPI(title="Enterprise KB Q&A API", version="1.0.0")

indexer = KnowledgeBaseIndexer(working_dir="./kb_index")
qa_engine = QAEngine(indexer)
conversation = ConversationalQA(qa_engine)


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    mode: str = Field(default="hybrid", pattern="^(low|high|hybrid)$")
    top_k: int = Field(default=10, ge=1, le=50)


class QueryResponse(BaseModel):
    question: str
    answer: str
    mode: str


class IndexRequest(BaseModel):
    directory: str = Field(..., description="文档目录路径")


class IndexResponse(BaseModel):
    total_files: int
    total_chunks: int
    results: List[dict]


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "enterprise-kb-qa"}


@app.post("/query", response_model=QueryResponse)
def query_endpoint(req: QueryRequest):
    try:
        result = qa_engine.query(req.question, mode=req.mode, top_k=req.top_k)
        return QueryResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
def chat_endpoint(req: QueryRequest):
    try:
        answer = conversation.ask(req.question, mode=req.mode)
        return {"question": req.question, "answer": answer, "mode": req.mode}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/reset")
def chat_reset():
    conversation.reset()
    return {"status": "ok"}


@app.post("/index", response_model=IndexResponse)
def index_endpoint(req: IndexRequest):
    if not os.path.isdir(req.directory):
        raise HTTPException(status_code=400, detail=f"Directory not found: {req.directory}")
    try:
        results = indexer.index_directory(req.directory)
        total_chunks = sum(r["chunks"] for r in results)
        return IndexResponse(
            total_files=len(results),
            total_chunks=total_chunks,
            results=results,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index/file")
def index_file_endpoint(file_path: str):
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {file_path}")
    try:
        result = indexer.index_document(file_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
def stats_endpoint():
    return indexer.get_stats()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 8.5.4 命令行使用示例

```python
# main.py — 命令行入口
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from kb_indexer import KnowledgeBaseIndexer
from qa_engine import QAEngine, ConversationalQA


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Enterprise KB Q&A System")
    parser.add_argument("--index", type=str, help="索引指定目录的文档")
    parser.add_argument("--query", type=str, help="提问")
    parser.add_argument("--mode", type=str, default="hybrid", choices=["low", "high", "hybrid"])
    parser.add_argument("--working-dir", type=str, default="./kb_index")
    parser.add_argument("--chat", action="store_true", help="交互式对话模式")
    args = parser.parse_args()

    indexer = KnowledgeBaseIndexer(working_dir=args.working_dir)
    qa = QAEngine(indexer)

    if args.index:
        print(f"正在索引目录: {args.index}")
        results = indexer.index_directory(args.index)
        total = sum(r["chunks"] for r in results)
        print(f"\n索引完成: {len(results)} 个文件, {total} 个文档块")

    if args.query:
        result = qa.query(args.query, mode=args.mode)
        print(f"\n问题: {result['question']}")
        print(f"答案: {result['answer']}")

    if args.chat:
        conv = ConversationalQA(qa)
        print("=" * 50)
        print("企业知识库问答系统 (输入 'exit' 退出, 'reset' 重置对话)")
        print("=" * 50)
        while True:
            question = input("\n问题: ").strip()
            if question.lower() == "exit":
                break
            if question.lower() == "reset":
                conv.reset()
                print("对话已重置")
                continue
            if not question:
                continue
            answer = conv.ask(question)
            print(f"\n答案: {answer}")


if __name__ == "__main__":
    main()
```

### 8.5.5 运行指南

**安装依赖**：

```bash
pip install lightrag fastapi uvicorn pydantic pymupdf python-docx beautifulsoup4 markdown
```

**索引文档**：

```bash
# 索引整个文档目录
python main.py --index ./sample_docs --working-dir ./kb_index

# 启动 Web 服务
python app.py
```

**查询示例**：

```bash
# 命令行查询
python main.py --query "数据库连接超时时间是多少？" --mode low

# API 查询
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "如何配置双因素认证？", "mode": "hybrid"}'

# 交互式对话
python main.py --chat --working-dir ./kb_index
```

### 8.5.6 完整运行示例

以下是一个完整的端到端运行示例，展示从文档索引到问答的全流程：

```python
# run_demo.py — 完整演示脚本
import os
import tempfile
from kb_indexer import KnowledgeBaseIndexer
from qa_engine import QAEngine, ConversationalQA


def create_sample_docs():
    """创建示例文档"""
    docs = {
        "产品手册.md": """# 数据平台产品手册 v2.1

## 系统架构
数据平台采用微服务架构，包含以下核心组件：
- 数据采集服务（Collector Service）
- 数据处理引擎（Processing Engine）
- 存储层（Storage Layer）
- API 网关（API Gateway）

## 数据库配置
系统支持 PostgreSQL 15+ 和 MySQL 8.0+ 两种数据库。
默认连接超时时间为 30 秒，最大连接数为 100。
连接池大小建议设置为 10-20。

## 认证机制
平台支持双因素认证（2FA），包括：
1. 密码认证
2. 短信验证码或 TOTP 动态码
启用双因素认证需要在用户设置中开启，首次配置需绑定手机号或 TOTP 应用。
""",
        "运维手册.md": """# 数据平台运维手册

## 部署要求
- 最低配置：4核 CPU、16GB 内存、100GB 磁盘
- 推荐配置：8核 CPU、32GB 内存、500GB SSD
- 操作系统：Ubuntu 22.04 LTS 或 CentOS 8+

## 日志管理
系统日志位于 /var/log/dataplatform/ 目录下。
日志级别：DEBUG < INFO < WARN < ERROR
生产环境建议设置为 INFO 级别。
日志保留策略：保留最近 30 天的日志，自动归档。

## 备份策略
- 数据库：每日全量备份 + 每小时增量备份
- 配置文件：每次变更自动备份
- 备份保留：全量备份保留 90 天，增量备份保留 30 天
""",
        "安全规范.md": """# 企业安全规范

## 密码策略
- 密码长度至少 12 位
- 必须包含大小写字母、数字和特殊字符
- 每 90 天强制更换密码
- 禁止使用最近 5 次使用过的密码

## 访问控制
- 基于角色的访问控制（RBAC）
- 角色分为：管理员、运维人员、开发人员、只读用户
- 敏感操作需要二次审批
- 所有访问记录留存至少 180 天

## 数据加密
- 传输加密：TLS 1.3
- 存储加密：AES-256
- 密钥管理：使用硬件安全模块（HSM）
""",
    }
    doc_dir = tempfile.mkdtemp(prefix="kb_docs_")
    for name, content in docs.items():
        with open(os.path.join(doc_dir, name), "w", encoding="utf-8") as f:
            f.write(content)
    return doc_dir


def main():
    print("=" * 60)
    print("企业知识库问答系统 — 完整演示")
    print("=" * 60)

    # 1. 创建示例文档
    print("\n[1/4] 创建示例文档...")
    doc_dir = create_sample_docs()
    print(f"  文档目录: {doc_dir}")
    for f in os.listdir(doc_dir):
        print(f"  - {f}")

    # 2. 构建索引
    print("\n[2/4] 构建 LightRAG 索引...")
    index_dir = tempfile.mkdtemp(prefix="kb_index_")
    indexer = KnowledgeBaseIndexer(working_dir=index_dir)
    results = indexer.index_directory(doc_dir)
    total_chunks = sum(r["chunks"] for r in results)
    print(f"  索引完成: {len(results)} 个文件, {total_chunks} 个文档块")

    # 3. 问答测试
    print("\n[3/4] 问答测试...")
    qa = QAEngine(indexer)
    test_questions = [
        ("数据库连接超时时间是多少？", "low"),
        ("系统支持哪些数据库？", "low"),
        ("公司有哪些安全策略？", "high"),
        ("如何配置双因素认证？", "hybrid"),
        ("运维部署的最低配置要求是什么？", "low"),
    ]
    for question, mode in test_questions:
        result = qa.query(question, mode=mode)
        print(f"\n  Q: {question} (mode={mode})")
        print(f"  A: {result['answer'][:200]}...")

    # 4. 多轮对话测试
    print("\n[4/4] 多轮对话测试...")
    conv = ConversationalQA(qa)
    dialogue = [
        "系统支持哪些数据库？",
        "它们的默认连接超时是多少？",
        "如何修改这个超时配置？",
    ]
    for question in dialogue:
        answer = conv.ask(question)
        print(f"\n  Q: {question}")
        print(f"  A: {answer[:200]}...")

    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

---

## 8.6 生产部署最佳实践

### 8.6.1 性能优化

| 优化项 | 方案 | 效果 |
|--------|------|------|
| 嵌入缓存 | 缓存已计算的文档嵌入 | 减少 50% 索引时间 |
| 批量插入 | 使用 `insert_batch` 替代逐条插入 | 提升 3-5 倍索引速度 |
| 异步查询 | 使用异步 LLM 调用 | 提升并发能力 |
| 结果缓存 | 缓存高频查询结果 | 减少 80% 重复查询延迟 |

### 8.6.2 监控与日志

```python
import logging
import time
from functools import wraps

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("kb_qa.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


def monitor_query(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = func(*args, **kwargs)
            elapsed = time.time() - start
            logger.info(f"Query OK | {elapsed:.2f}s | {kwargs.get('question', '')[:50]}")
            return result
        except Exception as e:
            elapsed = time.time() - start
            logger.error(f"Query FAIL | {elapsed:.2f}s | {e}")
            raise
    return wrapper
```

### 8.6.3 安全考虑

- **API 认证**：使用 API Key 或 JWT 保护查询接口
- **查询审计**：记录所有查询日志，便于审计追踪
- **内容过滤**：对用户输入进行敏感词过滤
- **速率限制**：防止滥用和 DDoS 攻击
- **数据隔离**：不同部门的知识库使用独立的索引目录

---

## 8.7 潜在风险与注意事项

### 8.7.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 答案不准确 | 文档分块不合理 | 调整分块大小和重叠策略 |
| 实体提取遗漏 | 领域术语未识别 | 提供领域词典或微调提示词 |
| 检索结果不相关 | 查询模式选择不当 | 尝试不同模式（low/high/hybrid） |
| 索引构建慢 | 文档量过大 | 使用批量插入，增加并行度 |
| Token 消耗高 | 文档块过大 | 减小分块大小，优化提示词 |

### 8.7.2 架构陷阱

1. **过度依赖默认配置**：LightRAG 的默认参数适用于通用场景，企业知识库需要根据领域特点调整分块大小、检索参数和提示词模板
2. **忽略文档质量**：知识库问答的质量上限取决于输入文档的质量。低质量、过时、矛盾的文档会直接降低系统效果
3. **缺乏评估体系**：没有建立标准化的问答评估数据集，无法量化系统改进效果
4. **忽视增量更新冲突**：增量更新时，新文档可能与已有实体产生冲突，需要设计冲突解决策略

### 8.7.3 领域适配建议

不同领域的企业知识库需要不同的适配策略：

| 领域 | 适配重点 | 建议 |
|------|---------|------|
| 金融 | 术语精确性 | 提供金融术语词典，使用领域微调模型 |
| 医疗 | 合规性 | 严格验证答案准确性，添加免责声明 |
| 法律 | 可追溯性 | 强制答案附带原文引用 |
| 技术 | 代码示例 | 保留代码块格式，支持代码检索 |
| 制造 | 多语言 | 支持中英文混合查询 |

---

## 本章小结

1. **企业知识库问答是 LightRAG 最核心的应用场景**，解决了传统 RAG 无法捕捉实体关系、多跳推理能力弱的核心痛点
2. **文档处理是基础**，多格式解析、文本清洗、语义分块和元数据管理决定了系统质量的上限
3. **LightRAG 索引构建高效轻量**，相比 GraphRAG 减少 50-80% Token 消耗，且支持增量更新
4. **双级检索机制**（low/high/hybrid）覆盖了从具体事实到主题概览的全谱查询需求
5. **生产部署需要关注**性能优化、监控日志、安全控制和领域适配
6. **完整的代码示例**提供了从文档索引到 Web API 服务的全链路实现，可直接用于企业项目
