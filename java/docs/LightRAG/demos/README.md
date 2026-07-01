# LightRAG 演示代码

## 环境要求

```bash
pip install -r requirements.txt
```

## 演示内容

| 目录 | 文件 | 说明 |
|------|------|------|
| `ch04-indexing/` | `lightrag_indexing.py` | 图索引构建演示 |
| `ch05-retrieval/` | `lightrag_retrieval.py` | 双级检索演示 |
| `ch06-incremental/` | `lightrag_incremental.py` | 增量更新演示 |
| `ch07-vector/` | `lightrag_vector.py` | 向量检索演示 |
| `ch08-qa/` | `lightrag_qa.py` | 知识库问答演示 |
| `ch09-summary/` | `lightrag_summary.py` | 文档摘要演示 |
| `ch10-reasoning/` | `lightrag_reasoning.py` | 关系推理演示 |
| `ch12-deploy/` | `lightrag_api.py` | API 服务部署 |

## 运行方式

所有演示均支持模拟模式（无需 API key），直接运行：

```bash
python ch04-indexing/lightrag_indexing.py
python ch05-retrieval/lightrag_retrieval.py
python ch06-incremental/lightrag_incremental.py
python ch07-vector/lightrag_vector.py
python ch08-qa/lightrag_qa.py
python ch09-summary/lightrag_summary.py
python ch10-reasoning/lightrag_reasoning.py
python ch12-deploy/lightrag_api.py
```

## 使用真实 LightRAG

如需使用真实 LightRAG，需设置 OpenAI API key：

```bash
export OPENAI_API_KEY="your-api-key"
pip install lightrag-hku
python ch04-indexing/lightrag_indexing.py
```
