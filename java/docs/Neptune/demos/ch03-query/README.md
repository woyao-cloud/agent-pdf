# 图查询语言演示

## 文件说明

| 文件 | 说明 |
|------|------|
| `gremlin_queries.py` | Gremlin 查询演示（支持模拟模式） |
| `sparql_queries.rq` | SPARQL 查询示例 |

## 运行方式

```bash
# Gremlin 演示（模拟模式，无需 Neptune）
python gremlin_queries.py
```

## 演示内容

- 基本查询：g.V()、hasLabel、has
- 遍历查询：out、in、both
- 多步遍历：朋友的朋友
- 路径查询
- 聚合查询：平均评分
