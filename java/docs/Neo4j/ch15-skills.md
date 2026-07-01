# 第15章 Neo4j 开发者必备技能

## 15.1 引言

Neo4j 作为图数据库领域的领导者，其开发者生态正在快速扩展。从传统的 Cypher 查询到 Spring Data Neo4j 集成，从图数据建模到 AI 驱动的图增强检索（RAG），Neo4j 开发者需要掌握一套横跨多个技术栈的核心技能。本章系统梳理这些技能，为不同阶段的开发者提供一条清晰的学习路径。

---

## 15.2 图数据库核心技能

### 15.2.1 Cypher 查询语言

Cypher 是 Neo4j 的声明式图查询语言，其语法直观且表达力强。掌握 Cypher 是 Neo4j 开发者的基本功。

**基础模式匹配**

```cypher
// 查找所有用户
MATCH (u:User) RETURN u

// 查找特定用户及其朋友
MATCH (u:User {name: 'Alice'})-[:FRIENDS_WITH]->(friend:User)
RETURN u.name, friend.name

// 多跳查询
MATCH (u:User {name: 'Alice'})-[:FRIENDS_WITH*2..4]->(friend:User)
RETURN DISTINCT friend.name
```

**聚合与分组**

```cypher
// 按标签统计节点数
MATCH (u:User)
RETURN u.city, count(u) AS userCount
ORDER BY userCount DESC

// 路径聚合
MATCH (u:User)-[:PURCHASED]->(o:Order)-[:CONTAINS]->(p:Product)
RETURN u.name, collect(p.name) AS products, sum(p.price) AS totalSpent
```

**子查询与 UNION**

```cypher
// CALL 子查询
CALL {
    MATCH (u:User)-[:PURCHASED]->(o:Order)
    RETURN u, count(o) AS orderCount
    ORDER BY orderCount DESC
    LIMIT 10
}
MATCH (u)-[:LIVES_IN]->(c:City)
RETURN u.name, orderCount, c.name

// UNION 合并结果
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
RETURN p.name AS name, 'Actor' AS role
UNION
MATCH (p:Person)-[:DIRECTED]->(m:Movie)
RETURN p.name AS name, 'Director' AS role
```

**索引与约束**

```cypher
// 创建索引
CREATE INDEX user_name_idx FOR (n:User) ON (n.name)

// 创建复合索引
CREATE INDEX user_city_age_idx FOR (n:User) ON (n.city, n.age)

// 创建唯一约束
CREATE CONSTRAINT unique_user_email FOR (n:User) REQUIRE n.email IS UNIQUE

// 创建节点键约束（复合唯一）
CREATE CONSTRAINT user_identity FOR (n:User) REQUIRE (n.email, n.source) IS NODE KEY
```

### 15.2.2 图数据建模

图建模与传统关系建模有本质区别。核心原则是"将关联视为一等公民"。

**建模方法论**

1. **领域分析**：识别实体（节点）和关系
2. **关系优先**：先问"实体之间如何关联"，再决定节点属性
3. **反范式化**：图数据库鼓励将关联信息直接建模为关系，而非通过外键
4. **命名规范**：节点标签使用 PascalCase（`User`、`Order`），关系类型使用大写蛇形（`FRIENDS_WITH`、`PURCHASED`）

**常见建模模式**

```cypher
// 1. 星型模式：中心节点连接多个外围节点
(:User)-[:LIVES_IN]->(:City)
(:User)-[:WORKS_AT]->(:Company)

// 2. 时间线模式：将时间建模为节点
(:User)-[:POSTED]->(:Post)-[:PUBLISHED_AT]->(:Date {year: 2025, month: 6})

// 3. 元关系：关系上带属性
(:User)-[:RATED {score: 5, timestamp: datetime()}]->(:Movie)

// 4. 超节点模式：用中间节点避免超节点
(:User)-[:ENROLLED_IN]->(:Enrollment {date: date()})-[:FOR_COURSE]->(:Course)
```

**反模式与注意事项**

| 反模式 | 问题 | 解决方案 |
|--------|------|----------|
| 深度嵌套属性 | 无法单独查询嵌套属性 | 拆分为独立节点 |
| 泛型关系 | 丢失语义信息 | 使用具体关系类型 |
| 超节点 | 单个节点连接过多关系 | 引入中间节点或分片 |
| 过度建模 | 不必要的节点增加查询复杂度 | 适度使用节点属性 |

### 15.2.3 查询性能优化

**执行计划分析**

```cypher
// 查看执行计划
EXPLAIN MATCH (u:User {email: 'alice@example.com'}) RETURN u

// 实际执行并获取统计信息
PROFILE MATCH (u:User {email: 'alice@example.com'}) RETURN u
```

**关键优化策略**

```cypher
// 1. 参数化查询（避免每次解析）
MATCH (u:User) WHERE u.email = $email RETURN u

// 2. 使用节点标签限定范围
// 差：全图扫描
MATCH (n) WHERE n.name = 'Alice' RETURN n
// 好：限定标签
MATCH (n:User) WHERE n.name = 'Alice' RETURN n

// 3. 利用索引排序
MATCH (u:User) WHERE u.age > 18
RETURN u.name, u.age
ORDER BY u.age SKIP 20 LIMIT 10

// 4. 避免笛卡尔积
// 差
MATCH (a:User), (b:Product) WHERE a.id = b.ownerId
// 好
MATCH (a:User)-[:OWNS]->(b:Product)
```

**批量操作**

```cypher
// 批量导入（使用 UNWIND）
UNWIND $batch AS row
MERGE (u:User {email: row.email})
SET u.name = row.name, u.age = row.age

// 定期提交（大事务）
:auto USING PERIODIC COMMIT 1000
LOAD CSV FROM 'file:///users.csv' AS row
MERGE (u:User {email: row[0]})
SET u.name = row[1]
```

---

## 15.3 Java 开发技能

### 15.3.1 Neo4j Java Driver

Neo4j 官方 Java Driver 是连接 Neo4j 的基础组件，支持同步、异步和响应式三种编程模型。

**Maven 依赖**

```xml
<dependency>
    <groupId>org.neo4j.driver</groupId>
    <artifactId>neo4j-java-driver</artifactId>
    <version>5.27.0</version>
</dependency>
```

**基础连接与会话管理**

```java
import org.neo4j.driver.*;

public class Neo4jConnector implements AutoCloseable {
    private final Driver driver;

    public Neo4jConnector(String uri, String user, String password) {
        this.driver = GraphDatabase.driver(uri, AuthTokens.basic(user, password),
            Config.builder()
                .withMaxConnectionPoolSize(50)
                .withConnectionTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .build());
    }

    public void findUser(String email) {
        try (Session session = driver.session(
            SessionConfig.builder()
                .withDatabase("neo4j")
                .withFetchSize(1000)
                .build())) {

            Result result = session.run(
                "MATCH (u:User) WHERE u.email = $email RETURN u.name, u.age",
                org.neo4j.driver.Values.parameters("email", email));

            while (result.hasNext()) {
                Record record = result.next();
                System.out.println(record.get("u.name").asString());
            }
        }
    }

    // 事务管理
    public void createUserWithOrder(String name, String email, String product) {
        try (Session session = driver.session()) {
            session.executeWrite(tx -> {
                tx.run("MERGE (u:User {email: $email}) SET u.name = $name",
                    Values.parameters("email", email, "name", name));
                tx.run("MATCH (u:User {email: $email}) " +
                    "CREATE (o:Order {id: randomUUID(), createdAt: datetime()}) " +
                    "CREATE (u)-[:PURCHASED]->(o)-[:CONTAINS]->(p:Product {name: $product})",
                    Values.parameters("email", email, "product", product));
                return null;
            });
        }
    }

    @Override
    public void close() {
        driver.close();
    }
}
```

**响应式编程**

```java
import org.neo4j.driver.reactive.*;

public class ReactiveService {
    private final Driver driver;

    public Flux<User> searchUsers(String keyword) {
        var rxSession = driver.rxSession();
        var result = rxSession.run(
            "MATCH (u:User) WHERE u.name CONTAINS $keyword RETURN u",
            Values.parameters("keyword", keyword));

        return Flux.from(result.records())
            .map(record -> {
                var node = record.get("u").asNode();
                return new User(node.get("name").asString(), node.get("email").asString());
            })
            .doFinally(signal -> rxSession.close());
    }
}
```

### 15.3.2 Spring Data Neo4j

Spring Data Neo4j (SDN) 提供了声明式的对象-图映射（OGM），大幅简化了 Neo4j 集成开发。

**Maven 依赖**

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-neo4j</artifactId>
    <version>3.4.0</version>
</dependency>
```

**实体映射**

```java
import org.springframework.data.neo4j.core.schema.*;

@Node("User")
public class User {
    @Id
    @GeneratedValue
    private Long id;

    @Property("name")
    private String name;

    @Property("email")
    private String email;

    @Relationship(type = "FRIENDS_WITH", direction = Relationship.Direction.OUTGOING)
    private List<User> friends;

    @Relationship(type = "PURCHASED", direction = Relationship.Direction.OUTGOING)
    private List<Order> orders;

    public User(String name, String email) {
        this.name = name;
        this.email = email;
        this.friends = new ArrayList<>();
        this.orders = new ArrayList<>();
    }
}

@Node("Order")
public class Order {
    @Id
    @GeneratedValue
    private Long id;

    @Property("createdAt")
    private LocalDateTime createdAt;

    @Relationship(type = "CONTAINS", direction = Relationship.Direction.OUTGOING)
    private List<Product> products;

    public Order() {
        this.createdAt = LocalDateTime.now();
        this.products = new ArrayList<>();
    }
}

@Node("Product")
public class Product {
    @Id
    private String name;

    @Property("price")
    private BigDecimal price;

    @Property("category")
    private String category;
}
```

**Repository 层**

```java
import org.springframework.data.neo4j.repository.Neo4jRepository;
import org.springframework.data.neo4j.repository.query.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends Neo4jRepository<User, Long> {

    Optional<User> findByEmail(String email);

    List<User> findByNameContainingIgnoreCase(String keyword);

    @Query("MATCH (u:User)-[:PURCHASED]->(:Order)-[:CONTAINS]->(p:Product) " +
           "WHERE p.category = $category " +
           "RETURN DISTINCT u ORDER BY u.name")
    List<User> findUsersWhoBoughtCategory(@Param("category") String category);

    @Query("MATCH (u:User {email: $email})-[:FRIENDS_WITH]->(friend:User) " +
           "RETURN friend ORDER BY friend.name")
    List<User> findFriendsByEmail(@Param("email") String email);

    @Query("MATCH (u:User {email: $email}) " +
           "MATCH (u)-[:PURCHASED]->(:Order)-[:CONTAINS]->(p:Product) " +
           "RETURN p.name AS product, count(p) AS purchaseCount " +
           "ORDER BY purchaseCount DESC")
    List<ProductStat> findTopPurchasedProducts(@Param("email") String email);
}
```

**投影接口**

```java
public interface ProductStat {
    String getProduct();
    Integer getPurchaseCount();
}
```

**Service 层与事务**

```java
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RecommendationService {

    private final UserRepository userRepository;
    private final ProductRepository productRepository;

    public RecommendationService(UserRepository userRepository,
                                  ProductRepository productRepository) {
        this.userRepository = userRepository;
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public List<Product> recommendProducts(String userEmail) {
        var user = userRepository.findByEmail(userEmail)
            .orElseThrow(() -> new RuntimeException("User not found"));

        var friends = userRepository.findFriendsByEmail(userEmail);
        var friendEmails = friends.stream()
            .map(User::getEmail)
            .toList();

        return productRepository.findProductsPurchasedByUsers(friendEmails);
    }

    @Transactional
    public User createUserWithFriends(String name, String email, List<String> friendEmails) {
        var user = new User(name, email);
        user = userRepository.save(user);

        var friends = userRepository.findByEmailIn(friendEmails);
        user.setFriends(friends);
        return userRepository.save(user);
    }
}
```

**配置**

```yaml
# application.yml
spring:
  neo4j:
    uri: bolt://localhost:7687
    authentication:
      username: neo4j
      password: ${NEO4J_PASSWORD}
  data:
    neo4j:
      database: neo4j
```

### 15.3.3 自定义查询与映射

```java
import org.neo4j.driver.types.Node;
import org.springframework.data.neo4j.core.Neo4jClient;
import org.springframework.stereotype.Repository;

@Repository
public class CustomUserRepository {

    private final Neo4jClient neo4jClient;

    public CustomUserRepository(Neo4jClient neo4jClient) {
        this.neo4jClient = neo4jClient;
    }

    public List<UserSummary> getUserNetwork(String email, int depth) {
        return neo4jClient.query(
            "MATCH (u:User {email: $email}) " +
            "-[:FRIENDS_WITH*1..$depth]-(connected:User) " +
            "RETURN connected.name AS name, connected.email AS email, " +
            "       min(length(path)) AS distance")
            .bind(email).to("email")
            .bind(depth).to("depth")
            .fetchAs(UserSummary.class)
            .mappedBy((typeSystem, record) -> {
                var name = record.get("name").asString();
                var emailVal = record.get("email").asString();
                var distance = record.get("distance").asInt();
                return new UserSummary(name, emailVal, distance);
            })
            .all();
    }
}

public record UserSummary(String name, String email, int distance) {}
```

---

## 15.4 Python 开发技能

### 15.4.1 Neo4j Python Driver

```python
from neo4j import GraphDatabase, basic_auth
from neo4j.exceptions import Neo4jError
from typing import Optional, List, Dict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Neo4jClient:
    def __init__(self, uri: str, user: str, password: str, database: str = "neo4j"):
        self.driver = GraphDatabase.driver(
            uri,
            auth=basic_auth(user, password),
            max_connection_pool_size=50,
            connection_timeout=30,
        )
        self.database = database

    def close(self):
        self.driver.close()

    # 基础查询
    def find_user(self, email: str) -> Optional[Dict]:
        query = "MATCH (u:User {email: $email}) RETURN u.name AS name, u.email AS email"
        with self.driver.session(database=self.database) as session:
            result = session.run(query, email=email)
            record = result.single()
            return dict(record) if record else None

    # 事务操作
    def create_user_with_order(self, name: str, email: str, product: str, price: float):
        def tx_work(tx):
            tx.run(
                "MERGE (u:User {email: $email}) SET u.name = $name",
                email=email, name=name
            )
            tx.run(
                "MATCH (u:User {email: $email}) "
                "CREATE (o:Order {id: randomUUID(), created_at: datetime()}) "
                "CREATE (u)-[:PURCHASED]->(o)-[:CONTAINS]->"
                "(p:Product {name: $product, price: $price})",
                email=email, product=product, price=price
            )

        with self.driver.session(database=self.database) as session:
            session.execute_write(tx_work)

    # 批量导入
    def batch_import_users(self, users: List[Dict]):
        query = """
        UNWIND $users AS user
        MERGE (u:User {email: user.email})
        SET u.name = user.name, u.age = user.age, u.city = user.city
        """
        with self.driver.session(database=self.database) as session:
            session.run(query, users=users)

    # 图遍历
    def get_friend_recommendations(self, email: str, max_depth: int = 3) -> List[Dict]:
        query = """
        MATCH (u:User {email: $email})
        -[:FRIENDS_WITH*2..$max_depth]-(recommended:User)
        WHERE NOT (u)-[:FRIENDS_WITH]-(recommended)
          AND u <> recommended
        RETURN recommended.name AS name, recommended.email AS email,
               min(length(p)) AS distance,
               count(p) AS common_connections
        ORDER BY common_connections DESC, distance ASC
        LIMIT 20
        """
        with self.driver.session(database=self.database) as session:
            results = session.run(query, email=email, max_depth=max_depth)
            return [dict(r) for r in results]

    # 异步查询
    async def async_find_user(self, email: str) -> Optional[Dict]:
        query = "MATCH (u:User {email: $email}) RETURN u"
        async with self.driver.async_session(database=self.database) as session:
            result = await session.run(query, email=email)
            record = await result.single()
            if record:
                node = record["u"]
                return dict(node.items())
            return None
```

### 15.4.2 Py2neo 与 Neomodel

**Neomodel（ODM）**

```python
from neomodel import (
    StructuredNode, StringProperty, IntegerProperty,
    DateTimeProperty, RelationshipTo, RelationshipFrom,
    UniqueProperty, db
)
from neomodel.integration.pandas import to_dataframe
import datetime


class User(StructuredNode):
    __label__ = "User"

    email = StringProperty(unique_index=True, required=True)
    name = StringProperty(required=True)
    age = IntegerProperty()
    city = StringProperty()
    created_at = DateTimeProperty(default_now=True)

    friends = RelationshipTo("User", "FRIENDS_WITH")
    orders = RelationshipTo("Order", "PURCHASED")


class Order(StructuredNode):
    __label__ = "Order"

    order_id = StringProperty(required=True)
    created_at = DateTimeProperty(default_now=True)

    user = RelationshipFrom("User", "PURCHASED")
    products = RelationshipTo("Product", "CONTAINS")


class Product(StructuredNode):
    __label__ = "Product"

    name = StringProperty(required=True)
    price = IntegerProperty()
    category = StringProperty()


# 使用示例
def neomodel_example():
    # 连接数据库
    db.set_connection("bolt://neo4j:password@localhost:7687")

    # 创建用户
    alice = User(email="alice@example.com", name="Alice", age=30).save()
    bob = User(email="bob@example.com", name="Bob", age=28).save()

    # 建立关系
    alice.friends.connect(bob)

    # 创建订单
    product = Product(name="Laptop", price=9999, category="Electronics").save()
    order = Order(order_id="ORD-001").save()
    order.products.connect(product)
    alice.orders.connect(order)

    # 查询
    results = User.nodes.filter(age__gt=25, city="Beijing")
    for user in results:
        print(f"{user.name} ({user.email})")

    # 导出到 Pandas
    df = to_data_df(
        "MATCH (u:User) RETURN u.name, u.age, u.city"
    )
    print(df.head())
```

### 15.4.3 数据科学集成

```python
import pandas as pd
from neo4j import GraphDatabase
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import networkx as nx
import matplotlib.pyplot as plt


class GraphDataScience:
    def __init__(self, driver):
        self.driver = driver

    def export_to_pandas(self, query: str, params: dict = None) -> pd.DataFrame:
        with self.driver.session() as session:
            result = session.run(query, **(params or {}))
            records = [dict(r) for r in result]
            return pd.DataFrame(records)

    def build_networkx_graph(self, label: str = "User",
                             rel_type: str = "FRIENDS_WITH") -> nx.Graph:
        query = f"""
        MATCH (a:{label})-[r:{rel_type}]->(b:{label})
        RETURN a.name AS source, b.name AS target, r.weight AS weight
        """
        df = self.export_to_pandas(query)
        G = nx.from_pandas_edgelist(
            df, "source", "target",
            edge_attr=["weight"] if "weight" in df.columns else None
        )
        return G

    def community_detection(self, G: nx.Graph) -> Dict:
        from networkx.algorithms.community import greedy_modularity_communities
        communities = greedy_modularity_communities(G)
        return {
            f"community_{i}": list(comm)
            for i, comm in enumerate(communities)
        }

    def user_segmentation(self, min_age: int = 18) -> pd.DataFrame:
        query = """
        MATCH (u:User)-[:PURCHASED]->(:Order)-[:CONTAINS]->(p:Product)
        WHERE u.age >= $min_age
        RETURN u.email AS email, u.age AS age,
               count(DISTINCT p) AS product_count,
               sum(p.price) AS total_spent
        """
        df = self.export_to_pandas(query, {"min_age": min_age})

        if len(df) < 5:
            return df

        features = StandardScaler().fit_transform(
            df[["age", "product_count", "total_spent"]]
        )
        df["segment"] = KMeans(n_clusters=3, random_state=42).fit_predict(features)
        return df
```

---

## 15.5 AI 与 LLM 技能

### 15.5.1 提示工程（Prompt Engineering）

与 LLM 协作开发 Neo4j 应用时，高质量的提示至关重要。

**Cypher 生成提示模板**

```python
CYPHER_GENERATION_PROMPT = """
你是一个 Neo4j 图数据库专家。根据以下数据库模式，将自然语言问题转换为 Cypher 查询。

数据库模式：
{schema}

自然语言问题：{question}

要求：
1. 只返回 Cypher 查询，不要解释
2. 使用参数化查询（$param 语法）
3. 如果问题不明确，返回最合理的解释
4. 考虑使用索引和标签来优化性能

Cypher 查询：
"""
```

**图分析提示模板**

```python
GRAPH_ANALYSIS_PROMPT = """
你是一个图数据分析专家。分析以下图查询结果并给出洞察。

查询：{query}
结果（前 {limit} 条）：
{results}

请提供：
1. 关键发现（2-3 点）
2. 数据中的模式或异常
3. 业务建议

分析：
"""
```

**实体提取提示**

```python
ENTITY_EXTRACTION_PROMPT = """
从以下文本中提取实体和关系，格式化为 Cypher MERGE 语句。

文本：{text}

实体类型：{entity_types}
关系类型：{relationship_types}

输出格式：
MERGE (e1:Type {{name: "实体1"}})
MERGE (e2:Type {{name: "实体2"}})
MERGE (e1)-[:RELATIONSHIP]->(e2)

提取结果：
"""
```

### 15.5.2 检索增强生成（RAG）

图增强 RAG（GraphRAG）将图数据库的结构化知识注入 LLM 上下文，显著提升回答质量。

**基础 GraphRAG 实现**

```python
import os
from typing import List, Dict, Optional
from openai import OpenAI
from neo4j import GraphDatabase
import numpy as np


class GraphRAG:
    def __init__(self, neo4j_uri: str, neo4j_user: str, neo4j_password: str,
                 openai_api_key: str, embedding_model: str = "text-embedding-3-small"):
        self.neo4j_driver = GraphDatabase.driver(
            neo4j_uri, auth=(neo4j_user, neo4j_password)
        )
        self.llm = OpenAI(api_key=openai_api_key)
        self.embedding_model = embedding_model

    def _get_embedding(self, text: str) -> List[float]:
        response = self.llm.embeddings.create(
            model=self.embedding_model,
            input=text
        )
        return response.data[0].embedding

    def _retrieve_subgraph(self, entity_names: List[str], max_depth: int = 2) -> str:
        query = """
        MATCH (n)
        WHERE n.name IN $entities
        OPTIONAL MATCH path = (n)-[*1..$depth]-(connected)
        RETURN nodes(path) AS nodes, relationships(path) AS rels
        LIMIT 200
        """
        with self.neo4j_driver.session() as session:
            result = session.run(query, entities=entity_names, depth=max_depth)
            nodes_set = set()
            rels_list = []
            for record in result:
                for node in record["nodes"]:
                    nodes_set.add(f"({node.labels[0]} {{name: '{node.get('name', '')}'}})")
                for rel in record["rels"]:
                    start = rel.start_node
                    end = rel.end_node
                    rels_list.append(
                        f"({start.labels[0]}:{start.get('name', '')})"
                        f"-[:{rel.type}]->"
                        f"({end.labels[0]}:{end.get('name', '')})"
                    )
            return "\n".join(list(nodes_set) + rels_list)

    def _vector_search(self, query_text: str, top_k: int = 5) -> List[Dict]:
        embedding = self._get_embedding(query_text)
        vector_query = """
        CALL db.index.vector.queryNodes('entity_embeddings', $top_k, $embedding)
        YIELD node, score
        RETURN node.name AS name, labels(node)[0] AS label, score
        """
        with self.neo4j_driver.session() as session:
            result = session.run(vector_query, top_k=top_k, embedding=embedding)
            return [dict(r) for r in result]

    def query(self, question: str, use_graph: bool = True) -> str:
        # 1. 向量检索：找到相关实体
        relevant_entities = self._vector_search(question)

        # 2. 图上下文检索
        context = ""
        if use_graph and relevant_entities:
            entity_names = [e["name"] for e in relevant_entities if e.get("name")]
            subgraph = self._retrieve_subgraph(entity_names)
            context = f"图数据库上下文：\n{subgraph}\n\n"

        # 3. 向量相似结果
        vector_context = "\n".join([
            f"- {e['label']}: {e['name']} (相似度: {e['score']:.3f})"
            for e in relevant_entities
        ])

        # 4. 构建提示并调用 LLM
        prompt = f"""
你是一个知识图谱问答助手。使用以下上下文回答问题。

{context}
相关实体：
{vector_context}

问题：{question}

请基于提供的上下文给出准确、简洁的回答。如果上下文不足以回答问题，请明确说明。
"""
        response = self.llm.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        return response.choices[0].message.content
```

**高级 GraphRAG：多跳推理**

```python
class AdvancedGraphRAG(GraphRAG):
    def _multi_hop_reasoning(self, question: str, max_hops: int = 3) -> str:
        """多跳推理：逐步探索图结构"""
        # 第一步：提取初始实体
        entities = self._extract_entities_from_question(question)
        all_context = []

        for hop in range(max_hops):
            if not entities:
                break

            # 获取当前跳的上下文
            context = self._retrieve_subgraph(entities, depth=1)
            all_context.append(f"第 {hop + 1} 跳探索：\n{context}")

            # 从结果中发现新实体
            new_entities = self._discover_new_entities(context, entities)
            entities = new_entities

        return "\n\n".join(all_context)

    def _extract_entities_from_question(self, question: str) -> List[str]:
        response = self.llm.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": "从问题中提取关键实体名称，返回 JSON 数组格式。"
            }, {
                "role": "user", "content": question
            }],
            response_format={"type": "json_object"}
        )
        import json
        data = json.loads(response.choices[0].message.content)
        return data.get("entities", [])

    def _discover_new_entities(self, context: str, known: List[str]) -> List[str]:
        response = self.llm.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": "从图上下文中找出与已知实体相关的新实体名称，"
                           "返回 JSON 数组格式。排除已知实体。"
            }, {
                "role": "user",
                "content": f"已知实体：{known}\n图上下文：{context}"
            }],
            response_format={"type": "json_object"}
        )
        import json
        data = json.loads(response.choices[0].message.content)
        return data.get("new_entities", [])

    def query_with_reasoning(self, question: str) -> str:
        # 1. 向量检索
        vector_hits = self._vector_search(question)

        # 2. 多跳图探索
        graph_context = self._multi_hop_reasoning(question)

        # 3. 综合回答
        prompt = f"""
你是一个高级图分析助手。综合以下信息回答问题。

向量检索结果：
{chr(10).join(f'- {h["label"]}: {h["name"]}' for h in vector_hits)}

图探索结果：
{graph_context}

问题：{question}

请进行综合分析，说明推理路径和结论。
"""
        response = self.llm.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        return response.choices[0].message.content
```

### 15.5.3 向量索引与语义搜索

Neo4j 5.15+ 原生支持向量索引，可直接在数据库内进行语义搜索。

```cypher
// 创建向量索引
CREATE VECTOR INDEX entity_embeddings IF NOT EXISTS
FOR (n:Entity) ON (n.embedding)
OPTIONS {indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
}}

// 向量相似查询
CALL db.index.vector.queryNodes('entity_embeddings', 10, $query_embedding)
YIELD node, score
RETURN node.name AS name, node.description AS description, score
```

**Python 端到端示例**

```python
class VectorIndexManager:
    def __init__(self, driver):
        self.driver = driver

    def create_vector_index(self, label: str = "Entity",
                            property_name: str = "embedding",
                            dimension: int = 1536,
                            similarity: str = "cosine"):
        query = f"""
        CREATE VECTOR INDEX {label.lower()}_embeddings IF NOT EXISTS
        FOR (n:{label}) ON (n.{property_name})
        OPTIONS {{indexConfig: {{
            `vector.dimensions`: {dimension},
            `vector.similarity_function`: '{similarity}'
        }}}}
        """
        with self.driver.session() as session:
            session.run(query)

    def populate_embeddings(self, label: str = "Entity",
                            text_property: str = "description"):
        query = f"""
        MATCH (n:{label})
        WHERE n.{text_property} IS NOT NULL AND n.embedding IS NULL
        RETURN elementId(n) AS id, n.{text_property} AS text
        LIMIT 1000
        """
        with self.driver.session() as session:
            results = session.run(query)
            batch = []
            for record in results:
                batch.append({
                    "id": record["id"],
                    "text": record["text"]
                })

        # 批量生成嵌入
        embeddings = self._batch_embed([item["text"] for item in batch])

        # 批量写回
        update_query = """
        UNWIND $batch AS item
        MATCH (n) WHERE elementId(n) = item.id
        SET n.embedding = item.embedding
        """
        with self.driver.session() as session:
            for i in range(0, len(batch), 100):
                chunk = batch[i:i + 100]
                chunk_embeds = embeddings[i:i + 100]
                session.run(update_query, batch=[
                    {"id": item["id"], "embedding": emb}
                    for item, emb in zip(chunk, chunk_embeds)
                ])

    def _batch_embed(self, texts: List[str]) -> List[List[float]]:
        client = OpenAI()
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=texts
        )
        return [d.embedding for d in response.data]
```

### 15.5.4 LLM 驱动的 Cypher 生成

```python
class CypherGenerator:
    def __init__(self, schema: str, llm_client):
        self.schema = schema
        self.llm = llm_client

    def generate(self, question: str, context: str = "") -> str:
        prompt = f"""
你是一个 Neo4j Cypher 专家。根据数据库模式将问题转换为 Cypher 查询。

模式：
{self.schema}

{context}

问题：{question}

要求：
- 只输出 Cypher 查询，不要解释
- 使用参数化查询
- 考虑性能：使用索引、限制结果数
- 如果问题需要多步操作，使用 CALL 子查询

Cypher：
"""
        response = self.llm.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )
        return response.choices[0].message.content.strip()

    def validate_and_fix(self, cypher: str, error: str) -> str:
        prompt = f"""
以下 Cypher 查询执行出错。请修复它。

查询：
{cypher}

错误：
{error}

模式：
{self.schema}

只输出修复后的 Cypher 查询：
"""
        response = self.llm.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )
        return response.choices[0].message.content.strip()

    def explain(self, cypher: str) -> str:
        prompt = f"""
解释以下 Cypher 查询的执行逻辑和预期结果。

查询：
{cypher}

请说明：
1. 查询的意图
2. 匹配模式的含义
3. 返回结果的结构
4. 潜在的性能考虑
"""
        response = self.llm.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        return response.choices[0].message.content
```

---

## 15.6 学习路线图

### 15.6.1 阶段一：基础入门（1-2 个月）

| 主题 | 学习目标 | 推荐资源 |
|------|----------|----------|
| 图数据库概念 | 理解节点、关系、属性、标签 | Neo4j GraphAcademy: Graph Basics |
| Cypher 基础 | MATCH、CREATE、MERGE、RETURN | Neo4j Cypher Refcard |
| 数据建模 | 领域建模、关系设计 | Graph Data Modeling for Neo4j |
| Java Driver | 连接、会话、事务管理 | Neo4j Java Developer Guide |
| Python Driver | 基础 CRUD 操作 | Neo4j Python Driver Docs |

**里程碑**：能独立设计简单的图模型并编写基础 Cypher 查询。

### 15.6.2 阶段二：进阶开发（2-4 个月）

| 主题 | 学习目标 | 推荐资源 |
|------|----------|----------|
| 高级 Cypher | 子查询、聚合、图遍历算法 | Neo4j Cypher Manual |
| 性能优化 | 执行计划、索引策略、批量操作 | Neo4j Performance Tuning |
| Spring Data Neo4j | 实体映射、Repository、事务 | Spring Data Neo4j Reference |
| Python 集成 | Neomodel、Pandas 集成、数据科学 | Neo4j Python Developer Guide |
| APOC 库 | 图算法、数据导入、工具函数 | APOC Library Documentation |

**里程碑**：能构建完整的图数据库应用，理解查询优化策略。

### 15.6.3 阶段三：高级应用（4-6 个月）

| 主题 | 学习目标 | 推荐资源 |
|------|----------|----------|
| 图算法 | PageRank、社区发现、最短路径 | Neo4j Graph Data Science |
| 全文搜索 | 全文索引、模糊匹配 | Neo4j Full-Text Search |
| 向量索引 | 语义搜索、嵌入存储 | Neo4j Vector Index Docs |
| 响应式编程 | Reactive Driver、WebFlux 集成 | Neo4j Reactive Programming |
| 集群管理 | 因果集群、读写分离、备份 | Neo4j Operations Manual |

**里程碑**：能设计和优化大规模图数据库系统。

### 15.6.4 阶段四：AI 融合（6-12 个月）

| 主题 | 学习目标 | 推荐资源 |
|------|----------|----------|
| GraphRAG | 图增强检索、多跳推理 | Microsoft GraphRAG Paper |
| LLM 集成 | Cypher 生成、自然语言查询 | LangChain Neo4j Integration |
| 知识图谱 | 本体设计、实体链接、关系抽取 | Knowledge Graph Construction |
| 提示工程 | 图分析提示、少样本学习 | Prompt Engineering Guide |
| 生产部署 | 监控、CI/CD、安全审计 | Neo4j Deployment Guide |

**里程碑**：能构建 AI 驱动的图数据库应用，实现自然语言交互。

### 15.6.5 推荐学习资源

**官方资源**
- Neo4j GraphAcademy：https://graphacademy.neo4j.com
- Neo4j 文档：https://neo4j.com/docs
- Neo4j GitHub：https://github.com/neo4j

**书籍**
- 《Graph Databases》- Ian Robinson 等
- 《Graph Algorithms》- Mark Needham 等
- 《Learning Neo4j》- Rik Van Bruggen

**社区**
- Neo4j 社区论坛：https://community.neo4j.com
- Neo4j 博客：https://neo4j.com/blog
- Stack Overflow：neo4j 标签

---

## 15.7 实战项目建议

### 项目一：社交推荐系统

```python
# 核心功能：基于共同好友和兴趣的推荐
def friend_recommendation_pipeline(driver, user_email: str):
    queries = {
        "共同好友推荐": """
            MATCH (u:User {email: $email})-[:FRIENDS_WITH]->(f:User)
            -[:FRIENDS_WITH]->(rec:User)
            WHERE NOT (u)-[:FRIENDS_WITH]-(rec)
            RETURN rec.name, count(f) AS common_friends
            ORDER BY common_friends DESC LIMIT 10
        """,
        "兴趣推荐": """
            MATCH (u:User {email: $email})-[:INTERESTED_IN]->(tag:Tag)
            MATCH (other:User)-[:INTERESTED_IN]->(tag)
            WHERE other.email <> $email
            MATCH (other)-[:INTERESTED_IN]->(rec_tag:Tag)
            WHERE NOT (u)-[:INTERESTED_IN]->(rec_tag)
            RETURN rec_tag.name, count(DISTINCT other) AS interested_users
            ORDER BY interested_users DESC LIMIT 10
        """,
        "协同过滤推荐": """
            MATCH (u:User {email: $email})-[:PURCHASED]->(:Order)
            -[:CONTAINS]->(p:Product)
            MATCH (p)<-[:CONTAINS]-(:Order)<-[:PURCHASED]-(other:User)
            MATCH (other)-[:PURCHASED]->(:Order)-[:CONTAINS]->(rec:Product)
            WHERE NOT (u)-[:PURCHASED]->(:Order)-[:CONTAINS]->(rec)
            RETURN rec.name, count(DISTINCT other) AS score
            ORDER BY score DESC LIMIT 10
        """
    }
    return queries
```

### 项目二：知识图谱问答系统

```python
# 核心架构
class KnowledgeGraphQA:
    def __init__(self):
        self.cypher_gen = CypherGenerator(schema, llm)
        self.graph_rag = GraphRAG(neo4j_uri, user, password, api_key)

    def answer(self, question: str) -> str:
        # 1. 尝试直接 Cypher 生成
        try:
            cypher = self.cypher_gen.generate(question)
            results = execute_cypher(cypher)
            if results:
                return format_results(results)
        except Exception:
            pass

        # 2. 回退到 GraphRAG
        return self.graph_rag.query(question)
```

### 项目三：实时图分析仪表盘

```python
# 使用 WebSocket 推送实时图数据
import asyncio
from neo4j import GraphDatabase
import json

class RealtimeGraphStream:
    def __init__(self, driver):
        self.driver = driver

    async def stream_changes(self, callback):
        query = """
        MATCH (n)
        WHERE n.updated_at > $last_check
        OPTIONAL MATCH (n)-[r]-(connected)
        RETURN n, collect(r) AS relationships, collect(connected) AS neighbors
        """
        last_check = datetime.min
        while True:
            with self.driver.session() as session:
                result = session.run(query, last_check=last_check.isoformat())
                for record in result:
                    await callback(json.dumps({
                        "node": dict(record["n"].items()),
                        "relationships": [
                            dict(r.items()) for r in record["relationships"]
                        ]
                    }))
            last_check = datetime.utcnow()
            await asyncio.sleep(5)
```

---

## 15.8 常见陷阱与最佳实践

### 15.8.1 开发陷阱

1. **忽略事务边界**：每个 `session.run()` 默认是自动提交事务。需要原子性的多步操作应使用 `executeWrite`。

2. **N+1 查询问题**：在循环中逐条查询是常见性能杀手。应使用 `UNWIND` 批量处理或在 Cypher 层面完成所有操作。

3. **过度使用 MERGE**：`MERGE` 会检查整个模式是否存在，比 `CREATE` 开销大。确定不存在重复时使用 `CREATE`。

4. **忽略连接池**：每次请求创建新连接是反模式。应复用 Driver 实例并配置合理的连接池大小。

### 15.8.2 安全最佳实践

```java
// 1. 使用参数化查询防止 Cypher 注入
// 错误：字符串拼接
session.run("MATCH (u:User {name: '" + userName + "'}) RETURN u");
// 正确：参数化
session.run("MATCH (u:User {name: $name}) RETURN u", Values.parameters("name", userName));

// 2. 最小权限原则
// 创建只读用户
GRANT MATCH {*} ON GRAPH neo4j TO read_only_user
// 限制特定标签访问
DENY WRITE ON GRAPH neo4j NODES User TO read_only_user

// 3. 加密连接
Config config = Config.builder()
    .withEncryption()
    .withTrustStrategy(TrustStrategy.systemCertificates())
    .build();
```

### 15.8.3 生产环境最佳实践

```yaml
# 连接池配置
spring:
  neo4j:
    pool:
      max-connection-pool-size: 50
      connection-acquisition-timeout: 30s
      idle-timeout: 60s
      max-lifetime: 1800s

# 监控配置
management:
  endpoints:
    web:
      exposure:
        include: health,metrics,neo4j
  metrics:
    export:
      neo4j:
        enabled: true
```

---

## 15.9 总结

Neo4j 开发者需要掌握的技能横跨图数据库理论、编程语言集成、性能优化和 AI 融合等多个维度。本章从 Cypher 查询、图建模、Java/Python 开发、Spring Data Neo4j 到 GraphRAG 和提示工程，系统性地梳理了各阶段的核心技能。

关键要点：

1. **Cypher 是基础**：掌握模式匹配、聚合、子查询和索引策略是高效使用 Neo4j 的前提
2. **图建模决定上限**：好的图模型能让查询简洁高效，差的模型则会导致性能灾难
3. **驱动层精通**：无论是 Java 还是 Python，理解连接池、事务和响应式编程模式至关重要
4. **AI 融合是趋势**：GraphRAG 和 LLM 驱动的 Cypher 生成正在重新定义图数据库的开发范式
5. **持续学习**：Neo4j 生态快速演进，向量索引、GenAI 集成等新功能不断涌现

建议读者按照学习路线图循序渐进，在每个阶段完成至少一个实战项目来巩固所学。图数据库的开发思维与传统关系型数据库有本质区别——拥抱图思维，才能真正发挥 Neo4j 的威力。
