# 第4章 图索引构建原理

## 4.1 文本分块策略

### 解决的问题

文档需要被切分为适合 LLM 处理的块，同时保持语义完整性。分块策略直接影响实体提取和关系构建的质量。

### 核心原理

LightRAG 使用基于 Token 的分块策略，默认块大小为 1024 Token，块重叠为 128 Token。这种策略在保持上下文完整性和控制 Token 消耗之间取得平衡。

### 代码/配置实现

```python
from lightrag import LightRAG
from lightrag.utils import chunk_text

# 自定义分块
text = "长文档内容..."
chunks = chunk_text(text, chunk_size=1024, overlap=128)
print(f"文档被切分为 {len(chunks)} 个块")
```

### 使用场景

- 长文档处理
- 多文档索引
- 批量文档导入

### 潜在风险与注意事项

- 块大小过小会丢失上下文
- 块大小过大会增加 Token 消耗
- 重叠度过低会丢失边界信息

### 本章小结

- 默认块大小 1024 Token，重叠 128 Token
- 分块策略影响实体提取质量
- 可根据文档类型调整参数

---

## 4.2 实体提取

### 解决的问题

从文本中自动识别出有意义的实体（人、组织、产品、概念等），是构建知识图谱的第一步。

### 核心原理

LightRAG 使用 LLM 进行实体提取，通过精心设计的 Prompt 引导 LLM 识别文本中的实体。提取的实体包括名称、类型和描述。

### 代码/配置实现

```python
from lightrag import LightRAG
from lightrag.llm import gpt_4o_mini_complete

rag = LightRAG(
    working_dir="./lightrag_cache",
    llm_func=gpt_4o_mini_complete
)

# 插入文档时自动提取实体
rag.insert("""
苹果公司由史蒂夫·乔布斯在1976年创立。
2023年发布的iPhone 15搭载了A17 Pro芯片。
""")

# 查看提取的实体（通过内部API）
# LightRAG 自动管理实体提取，无需手动调用
```

### 使用场景

- 文档实体识别
- 知识图谱构建
- 信息抽取

### 潜在风险与注意事项

- 实体提取依赖 LLM 质量
- 同义词实体可能被重复提取
- 实体类型定义影响提取效果

### 本章小结

- LightRAG 使用 LLM 自动提取实体
- 实体包括名称、类型和描述
- 提取质量影响后续检索效果

---

## 4.3 关系提取与三元组构建

### 解决的问题

识别实体之间的关系，构建 (实体, 关系, 实体) 三元组，形成知识图谱的边。

### 核心原理

LightRAG 在提取实体的同时，也提取实体之间的关系。关系以三元组形式存储，构成图结构的基础。

### 代码/配置实现

```python
# LightRAG 自动提取关系
rag.insert("""
苹果公司发布了iPhone 15。
iPhone 15搭载了A17 Pro芯片。
""")
# 自动提取的关系：
# (苹果公司, 发布了, iPhone 15)
# (iPhone 15, 搭载了, A17 Pro芯片)
```

### 使用场景

- 关系抽取
- 知识图谱构建
- 语义网络分析

### 潜在风险与注意事项

- 关系类型可能不一致
- 复杂关系可能被简化
- 关系方向性需要确认

### 本章小结

- 关系以三元组形式存储
- 关系提取与实体提取同时进行
- 关系质量影响图结构质量

---

## 4.4 图结构存储

### 解决的问题

将提取的实体和关系组织为图结构，支持高效的检索和遍历。

### 核心原理

LightRAG 使用 NetworkX 作为图存储后端，将实体作为节点、关系作为边。图结构支持高效的邻居查询和路径搜索。

### 代码/配置实现

```python
import networkx as nx

# LightRAG 内部使用 NetworkX 存储图
# 可以通过 LightRAG 的 API 访问图结构
# graph = rag.graph  # 获取图对象
# nodes = graph.nodes(data=True)
# edges = graph.edges(data=True)
```

### 使用场景

- 图数据存储
- 关系查询
- 图遍历

### 潜在风险与注意事项

- 图结构存储在内存中
- 大规模图需要更多内存
- 图序列化需要额外处理

### 本章小结

- 使用 NetworkX 作为图存储后端
- 实体为节点，关系为边
- 支持高效的图遍历和查询

---

## 4.5 完整索引构建流程

### 解决的问题

将上述步骤整合为完整的索引构建流程，从原始文档到可查询的图索引。

### 核心原理

完整流程：文本分块 → 实体提取 → 关系提取 → 图构建 → 向量嵌入 → 索引存储

### 代码/配置实现

```python
from lightrag import LightRAG
from lightrag.llm import gpt_4o_mini_complete

# 1. 初始化
rag = LightRAG(
    working_dir="./lightrag_cache",
    llm_func=gpt_4o_mini_complete
)

# 2. 插入文档（自动完成分块、实体提取、关系提取、图构建）
rag.insert("文档1内容...")
rag.insert("文档2内容...")

# 3. 查询验证
answer = rag.query("测试问题", mode="hybrid")
print(answer)
```

### 使用场景

- 知识库初始化
- 批量文档导入
- 索引重建

### 潜在风险与注意事项

- 首次索引构建较慢
- 大量文档需要分批处理
- 索引存储占用磁盘空间

### 本章小结

- 索引构建全流程自动化
- 插入文档时自动完成所有步骤
- 查询验证索引质量
