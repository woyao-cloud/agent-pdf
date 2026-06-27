# 知识图谱构建演示项目

本项目演示了从文本中构建知识图谱的完整流程，包括命名实体识别、关系抽取、图谱构建、查询推理以及 LLM 集成。

## 环境要求

- Python 3.8+
- pip

## 安装依赖

```bash
# 1. 安装 Python 依赖
pip install -r requirements.txt

# 2. 下载 spaCy 中文模型
python -m spacy download zh_core_web_sm
```

> **注意**: 如果下载速度慢，可以使用国内镜像：
> ```bash
> pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
> ```

## 文件说明

| 文件 | 说明 |
|------|------|
| `01_ner_demo.py` | 命名实体识别演示 |
| `02_relation_extraction.py` | 关系抽取演示 |
| `03_knowledge_graph_builder.py` | 知识图谱构建 |
| `04_kg_query_and_reason.py` | 图谱查询与推理 |
| `05_llm_kg_integration.py` | LLM + KG 集成 |

## 运行方法

按顺序依次运行各演示脚本：

```bash
# 1. 命名实体识别
python 01_ner_demo.py

# 2. 关系抽取
python 02_relation_extraction.py

# 3. 知识图谱构建
python 03_knowledge_graph_builder.py

# 4. 查询与推理
python 04_kg_query_and_reason.py

# 5. LLM 集成 (模拟模式，无需 API Key)
python 05_llm_kg_integration.py
```

## 预期输出

### 01_ner_demo.py
- 对 18 条中文新闻文本进行命名实体识别
- 输出每个实体的文本、类型和位置
- 实体类型分布统计
- 生成 `ner_distribution.png` 分布图

### 02_relation_extraction.py
- 从 18 个中文句子中抽取关系三元组
- 支持的关系类型: founded, works_at, located_in, acquired, invested_in, produces
- 输出每个三元组的主体、谓词、客体及类型

### 03_knowledge_graph_builder.py
- 从一篇综合文档中抽取实体和关系
- 构建 NetworkX 知识图谱
- 输出图谱统计信息 (节点数、边数、密度)
- 生成 `knowledge_graph.png` 可视化图
- 导出 `knowledge_graph.json` (图数据库兼容格式)

### 04_kg_query_and_reason.py
- 路径查询: 找出在某人创立的公司中工作的所有人
- 规则推理: 通过 works_at + located_in 推理出 works_in
- 最短路径查询: 计算两个实体间的最短路径
- 社区发现: 基于连通分量识别社区结构
- 生成 `kg_communities.png` 社区结构图

### 05_llm_kg_integration.py
- 构建企业收购关系知识图谱
- Graph RAG: 检索子图作为 LLM 上下文
- KG 增强问答 vs 普通问答对比
- 自然语言转图查询翻译
- 默认使用模拟模式，无需 API Key

## 技术栈

- **spaCy**: 中文 NLP 处理 (分词、词性标注、依存分析、NER)
- **NetworkX**: 图数据结构与算法
- **Matplotlib**: 可视化
- **OpenAI API** (可选): LLM 集成

## 扩展建议

1. 替换为真实 API Key 体验 LLM 集成功能
2. 使用自己的文本数据替换示例文本
3. 将导出的 JSON 导入 Neo4j 等图数据库
4. 添加更多推理规则 (如传递闭包)
5. 集成 Sentence Transformers 实现语义检索
