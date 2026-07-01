# Neo4j 演示代码

## 环境要求

```bash
pip install -r requirements.txt
```

## 演示内容

| 目录 | 文件 | 说明 |
|------|------|------|
| `ch02-cypher/` | `cypher_queries.cql` | Cypher 查询示例 |
| `ch04-storage/` | `neo4j_storage_demo.py` | 存储引擎理解 |
| `ch06-index/` | `neo4j_index_demo.py` | 索引与查询优化 |
| `ch09-social/` | `neo4j_social.py` | 社交网络应用 |
| `ch10-kg/` | `neo4j_kg.py` | 知识图谱构建 |
| `ch11-fraud/` | `neo4j_fraud.py` | 金融风控 |
| `ch12-supply-chain/` | `neo4j_supply_chain.py` | 供应链分析 |
| `ch13-deepseek/` | `neo4j_deepseek.py` | DeepSeek 集成 |
| `ch14-graph-rag/` | `neo4j_graph_rag.py` | Graph RAG 实现 |

## 运行方式

```bash
# Python 演示（无需 Neo4j 实例）
python ch04-storage/neo4j_storage_demo.py
python ch09-social/neo4j_social.py
python ch10-kg/neo4j_kg.py
python ch11-fraud/neo4j_fraud.py
python ch12-supply-chain/neo4j_supply_chain.py
python ch13-deepseek/neo4j_deepseek.py
python ch14-graph-rag/neo4j_graph_rag.py

# Cypher 查询（需要 Neo4j 实例）
# 在 Neo4j Browser 中执行 ch02-cypher/cypher_queries.cql
```

## 使用真实 DeepSeek

```bash
export DEEPSEEK_API_KEY="your-api-key"
python ch13-deepseek/neo4j_deepseek.py
```
