# 第9章 JSON/NoSQL混合

## 9.1 场景故事：用户扩展字段的灵活Schema设计

### 业务需求

在用户管理系统中，不同用户类型的属性差异巨大。个人用户需要昵称、性别、生日；企业用户需要企业名称、营业执照、法人代表；教育用户需要学校名称、教师证号。如果用关系模型，要么每个用户类型一张表（增删改查复杂），要么EAV（Entity-Attribute-Value）设计模式（查询性能差）。

PostgreSQL的JSONB数据类型提供了一个优雅的解决方案：**公共字段使用关系列（便于索引和查询），差异化字段使用JSONB列（灵活扩展）**：

```sql
CREATE TABLE users (
    id bigserial PRIMARY KEY,
    user_type varchar(20) NOT NULL,       -- personal/enterprise/education
    email varchar(200) NOT NULL UNIQUE,   -- 公共字段（关系列）
    phone varchar(20),
    status varchar(20) DEFAULT 'active',
    created_at timestamptz DEFAULT now(),
    -- 扩展属性存在这里
    attributes jsonb DEFAULT '{}'
);

-- 插入不同类型用户（灵活Schema！）
INSERT INTO users (user_type, email, attributes) VALUES
    ('personal', 'zhangsan@email.com',
     '{"nickname":"张三","gender":"male","birthday":"1990-01-01","hobbies":["reading","swimming"]}'),
    ('enterprise', 'contact@company.com',
     '{"company_name":"XX科技有限公司","business_license":"91440101MA5XXXX","legal_person":"李四","credit_code":"12345678-9"}'),
    ('education', 'teacher@school.edu',
     '{"school_name":"清华大学","teacher_id":"T2024001","title":"教授","department":"计算机系"}');
```

---

## 9.2 实现原理

### JSON vs JSONB

PostgreSQL支持两种JSON数据类型，区别显著：

| 特性 | JSON | JSONB |
|------|------|-------|
| 存储 | 文本（原样存储） | 二进制（分解存储） |
| 索引 | 不支持直接索引 | 支持GIN索引 |
| 重复key | 保留所有key | 只保留最后一个 |
| 键顺序 | 保留插入顺序 | 不保证顺序 |
| 空格 | 保留 | 不保留 |
| 操作速度 | 每次查询需解析 | 直接访问分解后的结构 |

**永远使用JSONB**，不要使用JSON。JSONB提供索引支持和更快的查询速度，几乎没有理由选择JSON。

### JSONB操作符

```sql
-- -> 返回JSONB（保留类型）
SELECT attributes -> 'nickname' FROM users WHERE id = 1;
-- "张三"（JSONB字符串，带引号）

-- ->> 返回文本
SELECT attributes ->> 'nickname' FROM users WHERE id = 1;
-- 张三（纯文本，无引号）

-- @> 包含查询（使用GIN索引）
SELECT * FROM users WHERE attributes @> '{"user_type": "personal"}';

-- ? 键是否存在
SELECT * FROM users WHERE attributes ? 'company_name';

-- ?| 任意键存在
SELECT * FROM users WHERE attributes ?| ARRAY['company_name', 'school_name'];

-- || 合并两个JSONB
UPDATE users SET attributes = attributes || '{"score": 100}' WHERE id = 1;

-- #>> 路径查询
SELECT attributes #>> '{hobbies, 0}' FROM users WHERE id = 1;
-- reading

-- jsonb_set 更新嵌套字段
UPDATE users SET attributes = jsonb_set(attributes, '{address, city}', '"北京"') WHERE id = 1;
```

### GIN索引

```sql
-- 默认GIN索引（支持?、?|、?&操作符）
CREATE INDEX idx_users_attrs ON users USING gin(attributes);

-- jsonb_path_ops索引（更小、对@>更快，但对?不支持）
CREATE INDEX idx_users_attrs_ops ON users USING gin(attributes jsonb_path_ops);
```

jsonb_path_ops 索引比默认GIN索引小约40%，且对 `@>` 包含查询更快。但缺点是不支持简单键存在查询（`?` 操作符）。

---

## 9.3 选择JSONB还是关系表

| 场景 | 推荐 | 原因 |
|------|------|------|
| 属性固定、需要关联查询 | 关系列 | 外键、强类型、可索引 |
| 属性不固定、差异大 | JSONB | 灵活扩展 |
| 属性需要模糊搜索 | JSONB + GIN | 支持全文搜索 |
| 属性有严格约束 | 关系列 | CHECK约束 |
| 混合场景 | 关系列 + JSONB | 公共字段标准化，扩展字段JSONB |

---

## 9.4 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 无约束校验 | JSONB内部结构无法使用CHECK约束 | 应用层做数据校验 |
| 索引膨胀 | JSONB更新频繁导致索引膨胀 | 定期REINDEX |
| 查询复杂度 | 嵌套路径查询可读性差 | 适当使用视图将JSONB路径封装为虚拟列 |
| 序列化开销 | 大数据量JSONB序列化慢 | 只查询需要的字段 |

---

## 9.5 Java示例

```java
@Entity
@Table(name = "users")
public class User {
    @Id
    private Long id;
    
    private String email;
    
    @Column(columnDefinition = "jsonb")
    private String attributes;  // 存储JSON字符串
    
    // Jackson 反序列化
    public String getAttribute(String key) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode node = mapper.readTree(attributes);
            JsonNode value = node.get(key);
            return value != null ? value.asText() : null;
        } catch (Exception e) {
            return null;
        }
    }
}

// Spring Data JPA 原生查询
@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    
    @Query(value = "SELECT * FROM users WHERE attributes @> ?1", nativeQuery = true)
    List<User> findByAttributeValue(String jsonFilter);
    
    @Query(value = "SELECT * FROM users WHERE attributes @> :filter", nativeQuery = true)
    List<User> searchUsers(@Param("filter") String filter);
}

// 使用
List<User> enterprises = userRepository.findByAttributeValue(
    "{\"company_name\": \"XX科技有限公司\"}");
```

---

## 9.6 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: jsonb_demo
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-jsonb.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-jsonb.sql
CREATE TABLE products (
    id serial PRIMARY KEY,
    name varchar(200) NOT NULL,
    category varchar(50) NOT NULL,
    base_price numeric(10,2) NOT NULL,
    attributes jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- 不同品类的商品有不同的字段
INSERT INTO products (name, category, base_price, attributes) VALUES
    ('iPhone 15', '手机', 5999.00,
     '{"color": ["黑色","白色","蓝色"], "storage": [128,256,512], "screen_size": 6.1, "ram": 8}'),
    ('ThinkPad X1', '笔记本', 9999.00,
     '{"cpu": "i7-1370P", "ram": 16, "storage_type": "SSD", "storage_size": 512, "weight_kg": 1.12}'),
    ('华为MatePad Pro', '平板', 4999.00,
     '{"screen_size": 13.2, "resolution": "2880x1920", "battery_mah": 10100, "pen_support": true}');

CREATE INDEX idx_products_attrs ON products USING gin(attributes jsonb_path_ops);
```