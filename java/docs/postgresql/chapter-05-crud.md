# 第5章 高效CRUD与批量操作

## 5.1 场景故事：订单批量导入的优化

### 从30分钟到30秒

某电商平台每天需要从供应商系统导入约50万条商品数据。最初的做法是逐条INSERT：

```java
// ❌ 错误：逐条INSERT（50万条需要30分钟）
for (Product product : products) {
    jdbcTemplate.update(
        "INSERT INTO products(id, name, price, stock) VALUES(?, ?, ?, ?)",
        product.getId(), product.getName(), product.getPrice(), product.getStock()
    );
}
```

每条INSERT都涉及一次网络往返、一次事务日志写入。50万条就是50万次网络往返，再加上默认每条的自动提交，性能极其低下。

优化方案使用PostgreSQL的COPY协议：

```java
// ✅ 正确：使用 COPY 协议（50万条仅需30秒）
// 通过 JDBC 的 CopyManager 批量加载
CopyManager copyManager = new CopyManager((BaseConnection) connection);
String sql = "COPY products (id, name, price, stock) FROM STDIN WITH CSV";
StringReader reader = new StringReader(csvData);
copyManager.copyIn(sql, reader);
```

COPY协议直接以原生PostgreSQL协议传输数据，绕过了SQL解析和事务管理开销，速度是逐条INSERT的50-100倍。

## 5.2 实现原理

### COPY协议

COPY是PostgreSQL最高效的数据导入导出方式。它工作在PostgreSQL的"原生协议层"，而不是SQL层：

```sql
-- 将数据导出到CSV文件
COPY products TO '/tmp/products_export.csv' WITH CSV HEADER;

-- 从CSV文件导入
COPY products (id, name, price, stock) FROM '/tmp/products_import.csv' WITH CSV;

-- 在特殊情况下跳过错误
COPY products FROM '/tmp/data.csv' WITH CSV ON_ERROR ignore;
```

### UPSERT（INSERT ON CONFLICT）

PostgreSQL的UPSERT语法允许你在插入冲突时执行更新或忽略：

```sql
-- 插入，如果唯一键冲突则更新
INSERT INTO products (id, name, price, stock)
VALUES (1, '新品', 99.00, 100)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    stock = EXCLUDED.stock,
    updated_at = now();

-- 插入，如果唯一键冲突则忽略
INSERT INTO products (id, name, price, stock)
VALUES (1, '新品', 99.00, 100)
ON CONFLICT (id) DO NOTHING;
```

这个功能非常适合数据同步场景：反复执行同一个导入任务，不会因为重复数据而报错。

### RETURNING

PostgreSQL的RETURNING子句可以在INSERT/UPDATE/DELETE后返回被影响的数据，避免了额外的SELECT查询：

```java
// 插入并返回自增ID（不需要额外查询）
KeyHolder keyHolder = new GeneratedKeyHolder();
jdbcTemplate.update(connection -> {
    PreparedStatement ps = connection.prepareStatement(
        "INSERT INTO orders(user_id, amount) VALUES(?, ?) RETURNING id",
        new String[]{"id"});
    ps.setString(1, userId);
    ps.setBigDecimal(2, amount);
    return ps;
}, keyHolder);
Long orderId = keyHolder.getKey().longValue();
```

## 5.3 使用场景

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| 首次导入大量数据 | COPY | 最快的方式 |
| 常规数据同步 | UPSERT | 幂等，可重复执行 |
| 数据迁移 | COPY + UPSERT | 先COPY加载，再UPSERT增量 |
| 需要操作后的数据 | RETURNING | 减少一次查询 |
| 逐条插入但很少量 | 普通INSERT | API调用等场景 |

## 5.4 潜在风险与优化

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 大量死元组 | 批量UPDATE产生大量垃圾版本 | 完成后VACUUM |
| 事务日志膨胀 | 大事务生成大量WAL | 拆分事务（每万条提交一次） |
| 索引维护开销 | 索引重建消耗大 | 先删索引再COPY，完成后重建 |
| 连接超时 | 大事务执行时间过长 | 增大statement_timeout |

### Java示例：批量UPSERT

```java
@Service
public class ProductImportService {
    
    private static final int BATCH_SIZE = 2000;
    private final JdbcTemplate jdbcTemplate;
    
    @Transactional
    public void batchUpsertProducts(List<Product> products) {
        // 避免单条提交，使用批处理
        jdbcTemplate.batchUpdate(
            "INSERT INTO products (id, name, price, stock, category_id) " +
            "VALUES (?, ?, ?, ?, ?) " +
            "ON CONFLICT (id) DO UPDATE SET " +
            "  name = EXCLUDED.name, price = EXCLUDED.price, " +
            "  stock = EXCLUDED.stock, updated_at = now()",
            products,
            BATCH_SIZE,
            (ps, product) -> {
                ps.setLong(1, product.getId());
                ps.setString(2, product.getName());
                ps.setBigDecimal(3, product.getPrice());
                ps.setInt(4, product.getStock());
                ps.setInt(5, product.getCategoryId());
            });
    }
}
```

## 5.5 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: crud_demo
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-crud.sql:/docker-entrypoint-initdb.d/init.sql
      - ./test_data.csv:/tmp/test_data.csv
```

```sql
-- init-crud.sql
CREATE TABLE products (
    id bigserial PRIMARY KEY,
    name varchar(200) NOT NULL,
    price numeric(10,2) NOT NULL,
    stock int NOT NULL DEFAULT 0,
    category_id int,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 测试COPY导入
COPY products (name, price, stock, category_id)
FROM '/tmp/test_data.csv' WITH CSV HEADER;
```

启动测试：
```bash
# 生成测试数据
seq 1 100000 | while read i; do
  echo "商品$i,$RANDOM,$RANDOM,$((RANDOM % 10))"
done > test_data.csv

# 导入测试
docker cp test_data.csv postgres:/tmp/test_data.csv
docker exec -it postgres psql -U postgres -d crud_demo -c "
  \timing
  COPY products (name, price, stock, category_id)
  FROM '/tmp/test_data.csv' WITH CSV;
"
```