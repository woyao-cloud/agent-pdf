# 第39章 GraphQL集成

GraphQL 提供了灵活的数据查询语言。本章从 GraphQL 基础到 FastAPI 集成，从查询与变更到订阅，深入剖析 GraphQL 在 FastAPI 中的机制与实践。

---

## 39.1 概念与语法

### 39.1.1 GraphQL 与 Strawberry 集成

```python
from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter
import strawberry

# 定义类型
@strawberry.type
class User:
    id: int
    name: str
    email: str

@strawberry.type
class Query:
    @strawberry.field
    def user(self, id: int) -> User:
        return get_user_by_id(id)

    @strawberry.field
    def users(self) -> list[User]:
        return get_all_users()

@strawberry.type
class Mutation:
    @strawberry.mutation
    def create_user(self, name: str, email: str) -> User:
        return create_new_user(name, email)

    @strawberry.mutation
    def delete_user(self, id: int) -> bool:
        return delete_user_by_id(id)

schema = strawberry.Schema(query=Query, mutation=Mutation)

app = FastAPI()
graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")

# GraphQL 查询示例：
# query { user(id: 1) { id name email } }
# query { users { id name } }
# mutation { createUser(name: "Alice", email: "a@b.com") { id name } }
```

### 39.1.2 类型系统

```python
import strawberry
from typing import Optional
from datetime import datetime

# 枚举类型
@strawberry.enum
class UserRole:
    ADMIN = "admin"
    USER = "user"
    MODERATOR = "moderator"

# 基本类型
@strawberry.type
class User:
    id: int
    name: str
    email: str
    role: UserRole
    created_at: datetime

    @strawberry.field
    def posts(self) -> list["Post"]:
        return get_posts_by_user(self.id)

# 输入类型（用于 Mutation 参数）
@strawberry.input
class CreateUserInput:
    name: str
    email: str
    role: UserRole = UserRole.USER

@strawberry.input
class UpdateUserInput:
    name: Optional[str] = None
    email: Optional[str] = None

# 分页类型
@strawberry.type
class UserEdge:
    node: User
    cursor: str

@strawberry.type
class PageInfo:
    has_next_page: bool
    end_cursor: Optional[str]

@strawberry.type
class UserConnection:
    edges: list[UserEdge]
    page_info: PageInfo
    total_count: int
```

### 39.1.3 查询与变更

```python
@strawberry.type
class Query:
    @strawberry.field
    def user(self, id: int) -> Optional[User]:
        user = get_user_by_id(id)
        return user

    @strawberry.field
    def users(
        self,
        skip: int = 0,
        limit: int = 20,
        role: Optional[UserRole] = None,
    ) -> list[User]:
        return get_users(skip=skip, limit=limit, role=role)

    @strawberry.field
    def search_users(self, query: str) -> list[User]:
        return search_users_by_name(query)

@strawberry.type
class Mutation:
    @strawberry.mutation
    def create_user(self, input: CreateUserInput) -> User:
        return create_new_user(input.name, input.email, input.role)

    @strawberry.mutation
    def update_user(self, id: int, input: UpdateUserInput) -> User:
        return update_existing_user(id, input)

    @strawberry.mutation
    def delete_user(self, id: int) -> bool:
        return delete_user_by_id(id)
```

### 39.1.4 依赖注入

```python
from strawberry.fastapi import GraphQLRouter
from fastapi import Depends

# FastAPI 依赖注入
async def get_db():
    return Database()

async def get_current_user():
    return authenticated_user()

# 在 GraphQL 中使用 FastAPI 依赖
@strawberry.type
class Query:
    @strawberry.field
    def me(self, info: strawberry.types.Info, db=Depends(get_db)) -> User:
        user_id = info.context["request"].user.id
        return db.get_user(user_id)

# 通过 context 传递依赖
schema = strawberry.Schema(
    query=Query,
)

graphql_app = GraphQLRouter(
    schema,
    context_getter=lambda: {"db": Database(), "user": authenticated_user()},
)

app = FastAPI()
app.include_router(graphql_app, prefix="/graphql")
```

---

## 39.2 原理与机制

### 39.2.1 GraphQL 执行流程

```python
"""
GraphQL 请求处理流程：

1. HTTP 请求到达 /graphql
   POST /graphql
   Content-Type: application/json
   {"query": "{ user(id: 1) { name email } }"}

2. GraphQL Router 解析请求
   → 提取 query、variables、operationName
   → 交给 Strawberry Schema 处理

3. GraphQL 执行流程：
   a. 解析（Parse）：将查询字符串解析为 AST
   b. 验证（Validate）：检查 AST 是否符合 Schema
   c. 执行（Execute）：按 AST 调用对应的 resolver

4. Resolver 执行：
   user(id: 1) → Query.user(resolver) → 返回 User 对象
   name → User.name(resolver) → 返回 "Alice"
   email → User.email(resolver) → 返回 "alice@example.com"

5. 响应组装：
   {
     "data": {
       "user": {
         "name": "Alice",
         "email": "alice@example.com"
       }
     }
   }

6. GraphQL vs REST：
   - REST：多个端点，固定数据结构
   - GraphQL：单个端点，客户端决定数据结构
   - GraphQL 避免 over-fetching 和 under-fetching
   - GraphQL 有 N+1 问题（需要 DataLoader 解决）
"""
```

### 39.2.2 N+1 问题与 DataLoader

```python
"""
N+1 问题：

查询：{ users { id name posts { id title } } }
执行流程：
1. 查询所有用户（1次查询）
2. 对每个用户查询其文章（N次查询）
→ 1 + N 次数据库查询

解决方案：DataLoader
- 批量加载数据
- 合并同一批次的所有请求
- 每个字段只执行一次查询

Strawberry DataLoader 示例：
"""
from strawberry.dataloader import DataLoader

async def load_posts_for_users(user_ids: list[int]) -> list[list[Post]]:
    # 一次查询所有用户的文章
    posts = await db.execute(
        "SELECT * FROM posts WHERE user_id IN :ids",
        {"ids": user_ids},
    )
    # 按 user_id 分组
    result = {uid: [] for uid in user_ids}
    for post in posts:
        result[post.user_id].append(post)
    return [result[uid] for uid in user_ids]

post_loader = DataLoader(load_fn=load_posts_for_users)

@strawberry.type
class User:
    id: int
    name: str

    @strawberry.field
    async def posts(self) -> list[Post]:
        return await post_loader.load(self.id)
```

---

## 39.3 使用场景

### 39.3.1 REST 与 GraphQL 混合

```python
from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter

app = FastAPI()

# REST API — 简单 CRUD
@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    return get_user_by_id(user_id)

# GraphQL — 复杂查询
graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")

# 使用策略：
# REST：简单的 CRUD 操作、文件上传、缓存友好
# GraphQL：复杂关联查询、多端点聚合、灵活响应
```

---

## 39.4 示例代码

### 39.4.1 完整的 GraphQL API

```python
"""完整的 GraphQL API — 用户与文章管理"""
import strawberry
from strawberry.fastapi import GraphQLRouter
from fastapi import FastAPI
from typing import Optional

@strawberry.type
class Post:
    id: int
    title: str
    content: str
    author_id: int

@strawberry.type
class User:
    id: int
    name: str
    email: str

    @strawberry.field
    def posts(self) -> list[Post]:
        return get_posts_by_author(self.id)

@strawberry.input
class CreateUserInput:
    name: str
    email: str

@strawberry.input
class CreatePostInput:
    title: str
    content: str
    author_id: int

@strawberry.type
class Query:
    @strawberry.field
    def user(self, id: int) -> Optional[User]:
        return get_user_by_id(id)

    @strawberry.field
    def users(self) -> list[User]:
        return get_all_users()

    @strawberry.field
    def post(self, id: int) -> Optional[Post]:
        return get_post_by_id(id)

@strawberry.type
class Mutation:
    @strawberry.mutation
    def create_user(self, input: CreateUserInput) -> User:
        return create_user(input.name, input.email)

    @strawberry.mutation
    def create_post(self, input: CreatePostInput) -> Post:
        return create_post(input.title, input.content, input.author_id)

schema = strawberry.Schema(query=Query, mutation=Mutation)
app = FastAPI()
app.include_router(GraphQLRouter(schema), prefix="/graphql")
```

---

## 39.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| N+1 查询问题 | 使用 DataLoader 批量加载 |
| 过深的嵌套查询 | 限制查询深度和复杂度 |
| 不做查询复杂度限制 | 使用 query cost 分析 |
| GraphQL 完全替代 REST | 简单 CRUD 仍用 REST |
| 不缓存 GraphQL 响应 | 使用 Persisted Queries 缓存 |
| Schema 设计过于细粒度 | 聚合常用字段，减少请求轮次 |
| 不处理错误 | GraphQL 错误需统一处理 |

---

本章从 GraphQL 与 Strawberry 集成到类型系统，从查询变更到 DataLoader，从 N+1 问题到 REST 混合方案，全面剖析了 FastAPI GraphQL 集成的机制与实践。