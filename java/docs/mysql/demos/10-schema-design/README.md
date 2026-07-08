# 第10章：表结构设计优化

> SQL优化不只是改查询——表结构设计直接影响查询性能。字段类型选错了（用VARCHAR存数字）、没有合理分表、大字段没有拆分——这些设计问题会让所有优化努力白费。

---

## 📖 本章导读

### 一个真实的故事

小周接手了一个遗留系统。他发现订单表的主键是`VARCHAR(32)`（存UUID），金额字段是`VARCHAR(20)`，状态字段也是`VARCHAR(20)`。数据量到100万后，查询和JOIN都变得很慢。

他把主键改为`INT AUTO_INCREMENT`，金额改为`DECIMAL(10,2)`，状态改为`TINYINT`。同样的查询，性能提升了3倍，存储空间减少了60%。

**表结构优化的核心：选对字段类型、合理范式设计、拆分大字段。** 这些优化不需要改SQL，只需要改表结构——但效果往往比查询优化更显著。

---

## 🎯 为什么学这章？

学完这章，你将能够：

1. **选对字段类型** — 整数、字符串、时间类型的最优选择。用`INT`存IP地址而不是`VARCHAR(15)`，用`TIMESTAMP`存时间而不是`VARCHAR(30)`。
2. **理解范式与反范式** — 什么时候该遵循范式（减少冗余），什么时候该反范式（减少JOIN）。
3. **处理大字段** — TEXT/BLOB的存储和查询优化。大字段应该拆分到独立的表中。

---

## 🧠 核心概念详解

### 字段类型选择指南

字段类型选择是表结构设计中最基础也最重要的决策。选错了类型，不仅浪费存储空间，还会拖慢查询。

**整数类型**：
- `TINYINT`（1字节，0-255）：适合年龄、状态、布尔值
- `SMALLINT`（2字节，0-65535）：适合数量、年份
- `INT`（4字节，0-43亿）：适合用户ID、订单ID
- `BIGINT`（8字节）：适合分布式ID、超大计数

**字符串类型**：
- `CHAR(N)`：固定长度，适合短且长度固定的字段（如MD5、手机号）
- `VARCHAR(N)`：可变长度，适合长度不固定的字段（如姓名、邮箱）
- `TEXT`：大文本，适合文章内容、JSON数据。TEXT数据存储在独立的区域

**时间类型**：
- `DATE`：日期（3字节），`TIME`：时间（3字节）
- `DATETIME`：日期时间（8字节），范围1000-9999年
- `TIMESTAMP`：时间戳（4字节），范围1970-2038年，自动时区转换

### 范式 vs 反范式

**范式设计**：减少数据冗余，但需要更多JOIN。优点：数据一致性好。缺点：查询需要JOIN。
**反范式设计**：允许数据冗余，减少JOIN。优点：查询快。缺点：数据可能不一致。

**选择原则**：高频查询的字段可以冗余存储，低频更新的字段可以冗余存储。

---

## 🛠️ 动手实践

```bash
cd demos/10-schema-design
docker compose up -d
docker exec -it mysql-schema mysql -uroot -proot123 optimization_db
```

在MySQL客户端中执行：

```sql
-- 对比错误设计和正确设计的存储空间
SHOW TABLE STATUS LIKE 'bad_design';
SHOW TABLE STATUS LIKE 'good_design';

-- 列表查询只查必要字段（避免读取TEXT）
SELECT id, title, summary, author FROM articles ORDER BY created_at DESC LIMIT 20;

-- 详情查询才读取TEXT
SELECT * FROM articles WHERE id = 1;
```

---

## ⚠️ 常见误区

### 误区1：用VARCHAR存所有数据

`VARCHAR`存数字不仅浪费空间（'1234567890'占10字节，INT只占4字节），还会导致隐式类型转换和索引失效。

### 误区2：过度范式化

一个用户查询需要JOIN 5张表——这是过度范式化的典型症状。适当反范式化，把常用字段冗余存储。

### 误区3：大字段和常用字段混在一起

TEXT/BLOB大字段应该拆分到独立的表中，只在需要时JOIN。

---

## 💭 思考题

1. 为什么`CHAR(10)`总是占用10个字符的空间，而`VARCHAR(10)`只占用实际长度的空间？
2. 订单表中应该冗余存储"用户名"吗？什么情况下应该冗余？
3. IP地址应该用什么类型存储？`VARCHAR(15)`和`INT UNSIGNED`各有什么优缺点？

---

## 🏃 运行命令速查

```bash
docker compose up -d
docker exec -it mysql-schema mysql -uroot -proot123 optimization_db
docker compose down -v
```
