# 第8章 全文搜索

## 8.1 场景故事：搭建站内商品搜索

### 业务需求

电商网站需要一个商品搜索功能：用户输入关键词如"华为5G手机"，需要快速搜索商品名称、描述、参数中包含的部分或全部词汇，并按照相关性排序。传统的 LIKE '%keyword%' 查询无法满足：

- `LIKE '%华为%'` 无法同时搜索"手机"
- `LIKE '%5G%'` 可能匹配到"5G套餐"而不仅仅是手机
- 无法按照搜索相关性排序
- 无法处理中文分词

PostgreSQL的原生全文搜索功能（Full-Text Search）可以解决这些问题，而不需要引入Elasticsearch。

## 8.2 实现原理

### tsvector 与 tsquery

PostgreSQL全文搜索的核心是两个数据类型：

**tsvector**：将文本分词后的向量表示。包含每个词及其在文档中的位置：

```sql
SELECT to_tsvector('english', 'The quick brown fox jumps over the lazy dog');
-- 输出: 'brown':3 'dog':9 'fox':4 'jump':5 'lazi':8 'quick':2
-- 注意：stop words (the/a/an) 被移除，动词被词干化
-- 'jumps' → 'jump', 'lazy' → 'lazi'（词干化）
```

**tsquery**：搜索查询的向量表示。使用逻辑操作符组合搜索词：

```sql
-- 包含"华为"和"手机"的文档
SELECT to_tsquery('simple', '华为 & 手机');

-- 包含"华为"或"荣耀"的文档
SELECT to_tsquery('simple', '华为 | 荣耀');

-- 包含"手机"但不包含"华为"
SELECT to_tsquery('simple', '手机 & !华为');
```

### 全文搜索的完整示例

```sql
-- 1. 创建商品表
CREATE TABLE products (
    id serial PRIMARY KEY,
    name text NOT NULL,
    description text,
    category varchar(50),
    price numeric(10,2),
    -- 存储搜索用的分词向量
    search_vector tsvector
);

-- 2. 插入数据并生成搜索向量
INSERT INTO products (name, description, category, price, search_vector) VALUES
    ('华为Mate60 Pro', '5G旗舰手机，卫星通信，昆仑玻璃', '手机', 6999.00,
     to_tsvector('simple', '华为Mate60 Pro 5G旗舰手机 卫星通信 昆仑玻璃')),
    ('iPhone 15 Pro Max', 'A17芯片，钛金属边框，USB-C', '手机', 9999.00,
     to_tsvector('simple', 'iPhone 15 Pro Max A17芯片 钛金属边框 USB-C')),
    ('华为MatePad Pro', '13.2英寸OLED屏，鸿蒙系统', '平板', 4999.00,
     to_tsvector('simple', '华为MatePad Pro 13.2英寸OLED屏 鸿蒙系统'));
```

### 排名

```sql
-- 搜索"华为手机"并按相关性排序
SELECT
    name,
    ts_rank(search_vector, query) AS rank
FROM products, to_tsquery('simple', '华为 & 手机') AS query
WHERE search_vector @@ query
ORDER BY rank DESC;

-- 输出：
-- 华为Mate60 Pro    0.99
-- 华为MatePad Pro   0.30（匹配到"华为"但没匹配到"手机"完全匹配）
```

`ts_rank` 使用TF-IDF（词频-逆文档频率）算法计算相关性。词频越高、在文档中出现越早的词贡献越大。

### GIN索引

对于大规模数据（数十万到数百万行），全文搜索需要GIN索引来加速：

```sql
-- 创建GIN索引加速全文搜索
CREATE INDEX idx_products_search ON products USING gin(search_vector);

-- 查询计划将使用 Bitmap Index Scan on idx_products_search
```

GIN索引将每个分词作为一个索引条目，查找时直接定位到包含该词的文档，效率远高于全表扫描。

### 中文分词

PostgreSQL内置的分词器只支持英文、俄文等西方语言。中文分词需要额外的扩展。最常用的是 **zhparser**（基于SCWS中文分词系统）：

```sql
-- 安装zhparser扩展（需要先编译安装）
CREATE EXTENSION zhparser;

-- 创建中文分词配置
CREATE TEXT SEARCH CONFIGURATION chinese (PARSER = zhparser);

-- 测试中文分词
SELECT to_tsvector('chinese', '华为5G手机是一款非常出色的旗舰产品');
-- 分词结果：'华为' '5G' '手机' '非常' '出色' '旗舰' '产品'
```

## 8.3 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: search_demo
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-fts.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-fts.sql
CREATE TABLE products (
    id serial PRIMARY KEY,
    name text NOT NULL,
    description text,
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))
    ) STORED
);

INSERT INTO products (name, description) VALUES
    ('华为Mate60 Pro', '5G卫星通信 昆仑玻璃 旗舰手机'),
    ('华为MatePad Pro', '13.2英寸 OLED屏 鸿蒙系统 生产力 平板'),
    ('iPhone 15 Pro Max', 'A17芯片 钛金属 5G手机 USB-C接口'),
    ('小米14 Ultra', '骁龙8Gen3 徕卡光学 旗舰影像'),
    ('ThinkPad X1 Carbon', '14英寸 商务笔记本 轻薄便携 14小时续航');

CREATE INDEX idx_products_search ON products USING gin(search_vector);

-- 搜索测试
SELECT name, ts_rank(search_vector, query) AS rank
FROM products, to_tsquery('simple', '华为 & 手机') AS query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

## 8.4 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 中文分词质量 | zhparser分词准确度不如商业方案 | 自定义用户词典，补充业务关键词 |
| 大数据量性能 | 百万级以上检索慢于Elasticsearch | 考虑ES作为专业搜索方案 |
| 向量更新维护 | 文本更新后需要更新tsvector | 使用GENERATED ALWAYS AS或触发器 |
| 词库更新 | 新词（如"栓Q"）需要定期添加 | 规划词典更新周期 |

## 8.5 典型问题

**问题：PG全文搜索 vs Elasticsearch，选择哪个？**

| 维度 | PG全文搜索 | Elasticsearch |
|------|-----------|-------------|
| 部署复杂度 | 内建，无需额外组件 | 需要独立集群 |
| 数据同步 | 无需同步 | 需要从DB同步到ES |
| 搜索质量 | 基础TF-IDF | BM25+ML |
| 中文分词 | 需要第三方扩展 | 内置IK分词 |
| 扩展性 | 受单机限制 | 天然分布式 |
| 适合场景 | 小型站内搜索（百万级文档） | 大型搜索引擎（亿级文档） |

结论：对于小型站内搜索（如商品搜索、文章搜索），PostgreSQL全文搜索足够好用，省去了引入ES的运维成本。当数据量超过千万级或需要复杂搜索引擎功能时，考虑ES。