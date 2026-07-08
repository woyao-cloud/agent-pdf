# 第12章：慢查询分析与监控

> 优化SQL的第一步是"找到慢SQL"。这章教你如何开启慢查询日志、分析慢SQL、建立优化流程。

---

## 📖 本章导读

小杨的系统上线后，用户反馈"订单列表加载很慢"。但他不知道是哪条SQL慢——系统有几百条SQL，总不能一条条排查。

他开启了慢查询日志（`long_query_time = 0.1`），第二天发现日志中有3条SQL执行超过1秒。用EXPLAIN分析后，发现都是缺少索引导致的。加了索引后，问题解决。

**慢查询分析的核心：先找到慢SQL，再分析原因，最后优化验证。**

---

## 🎯 为什么学这章？

1. **开启慢查询日志** — 自动记录慢SQL
2. **分析慢查询日志** — 找到最耗时的SQL
3. **使用Performance Schema** — 实时监控SQL执行
4. **建立优化流程** — 发现→分析→优化→验证→监控

---

## 🧠 核心概念

### 慢查询日志关键配置

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `slow_query_log` | 是否开启 | 1（开启） |
| `long_query_time` | 慢查询阈值（秒） | 0.1-0.5 |
| `log_queries_not_using_indexes` | 记录无索引查询 | 1（开启） |

### SQL优化标准流程

```
发现慢SQL → EXPLAIN分析 → 优化(加索引/重写/调参) → 验证 → 持续监控
```

---

## 🛠️ 动手实践

```bash
cd demos/12-slow-query
docker compose up -d
docker exec -it mysql-slow mysql -uroot -proot123 optimization_db
```

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-slow mysql -uroot -proot123 optimization_db
# 查看慢查询日志
docker exec -it mysql-slow cat /var/lib/mysql/slow.log
docker compose down -v
```
