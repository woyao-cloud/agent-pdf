# 第29章 TestClient与单元测试

TestClient 是 FastAPI 测试的基础工具。本章从 TestClient 的配置到单元测试编写，从依赖覆盖到模拟外部服务，深入剖析 FastAPI 单元测试的机制与实践。

---

## 29.1 概念与语法

### 29.1.1 TestClient 基础

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()

@app.get("/items/{item_id}")
async def read_item(item_id: int):
    return {"item_id": item_id}

client = TestClient(app)

# GET 请求
def test_read_item():
    response = client.get("/items/1")
    assert response.status_code == 200
    assert response.json() == {"item_id": 1}

# POST 请求
@app.post("/items")
async def create_item(item: ItemCreate):
    return {"id": 1, **item.model_dump()}

def test_create_item():
    response = client.post("/items", json={"name": "Widget", "price": 9.99})
    assert response.status_code == 200
    assert response.json()["name"] == "Widget"

# 常用 TestClient 方法：
# client.get(url, **kwargs)
# client.post(url, json={}, data={}, files={}, **kwargs)
# client.put(url, json={}, **kwargs)
# client.patch(url, json={}, **kwargs)
# client.delete(url, **kwargs)
# client.options(url, **kwargs)
# client.head(url, **kwargs)

# 请求参数：
# params: dict       — 查询参数
# json: dict        — JSON 请求体
# data: dict        — 表单数据
# files: dict       — 上传文件
# headers: dict     — 请求头
# cookies: dict     — Cookie
```

### 29.1.2 测试结构组织

```python
"""
推荐测试目录结构：

tests/
├── conftest.py          — 共享 fixtures
├── test_api/
│   ├── test_users.py    — 用户 API 测试
│   ├── test_items.py    — 物品 API 测试
│   └── test_orders.py   — 订单 API 测试
├── test_services/
│   ├── test_auth.py     — 认证服务测试
│   └── test_payment.py — 支付服务测试
└── test_models/
    └── test_schemas.py  — Pydantic 模型测试
"""

# conftest.py — 共享 fixtures
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def auth_client(client):
    # 预认证的客户端
    response = client.post("/auth/login", json={"username": "test", "password": "test"})
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
```

### 29.1.3 依赖覆盖

```python
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

app = FastAPI()

# 生产依赖
async def get_db():
    return Database("postgresql://...")

async def get_current_user():
    return authenticate_user()

@app.get("/me")
async def get_me(user=Depends(get_current_user)):
    return {"username": user.username}

# 测试中覆盖依赖
def test_get_me():
    # 创建测试依赖
    async def override_get_current_user():
        return User(username="testuser", role="admin")

    async def override_get_db():
        return MockDatabase()

    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_db] = override_get_db

    client = TestClient(app)
    response = client.get("/me")
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"

    # 清理覆盖
    app.dependency_overrides.clear()
```

### 29.1.4 Pydantic 模型测试

```python
from pydantic import BaseModel, Field, ValidationError
import pytest

class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(pattern=r"^[\w.-]+@[\w.-]+\.\w+$")
    age: int = Field(ge=0, le=150)

def test_user_create_valid():
    user = UserCreate(name="Alice", email="alice@example.com", age=30)
    assert user.name == "Alice"
    assert user.age == 30

def test_user_create_invalid_email():
    with pytest.raises(ValidationError) as exc_info:
        UserCreate(name="Alice", email="invalid", age=30)
    errors = exc_info.value.errors()
    assert any(e["loc"] == ("email",) for e in errors)

def test_user_create_invalid_age():
    with pytest.raises(ValidationError) as exc_info:
        UserCreate(name="Alice", email="alice@example.com", age=-1)
    errors = exc_info.value.errors()
    assert any(e["loc"] == ("age",) for e in errors)

def test_user_create_empty_name():
    with pytest.raises(ValidationError):
        UserCreate(name="", email="alice@example.com", age=30)
```

---

## 29.2 原理与机制

### 29.2.1 TestClient 内部机制

```python
"""
TestClient 的内部实现（基于 httpx）：

1. TestClient 继承自 httpx.Client：
   class TestClient(httpx.Client):
       def __init__(self, app, base_url="http://testserver", ...):
           # 将 ASGI 应用转换为 WSGI 兼容接口
           transport = ASGITransport(app=app)
           super().__init__(base_url=base_url, transport=transport)

2. 请求处理流程：
   TestClient.get("/items")
   → httpx 构造 Request 对象
   → ASGITransport 将请求转换为 ASGI scope
   → 直接调用 app(scope, receive, send)
   → 获取 ASGI 响应
   → 构造 httpx.Response 返回

3. 关键特性：
   - 不经过网络层（无 TCP/HTTP 协议开销）
   - 直接调用 ASGI 应用
   - 支持所有 HTTP 方法
   - 支持 WebSocket 测试
   - 支持生命周期事件（lifespan）

4. ASGITransport 的核心逻辑：
   async def handle_async_request(self, request):
       scope = self.build_scope(request)
       # 构造 ASGI scope 字典
       # 调用 app(scope, receive, send)
       # 收集响应数据
       # 返回 httpx.Response

5. 依赖覆盖机制：
   app.dependency_overrides = {
       original_dependency: mock_dependency,
   }
   FastAPI 在 solve_dependencies() 中检查此字典
   如果依赖被覆盖，使用覆盖版本
"""
```

### 29.2.2 依赖覆盖的源码

```python
"""
依赖覆盖的源码实现（fastapi/dependencyInjection.py）：

def solve_dependencies(...):
    for dep in dependencies:
        # 检查是否被覆盖
        if dep.dependency in request.app.dependency_overrides:
            # 使用覆盖版本
            solved = request.app.dependency_overrides[dep.dependency]
        else:
            # 使用原始版本
            solved = dep.dependency

关键点：
1. dependency_overrides 是字典：{原始依赖: 覆盖依赖}
2. 覆盖在 app 级别，影响所有路由
3. 需要手动清理（app.dependency_overrides.clear()）
4. 覆盖必须在 TestClient 创建前设置
5. 嵌套依赖也会被覆盖
"""
```

---

## 29.3 使用场景

### 29.3.1 认证测试

```python
import pytest
from fastapi.testclient import TestClient

def test_login_success(client):
    response = client.post("/auth/login", json={
        "username": "testuser", "password": "testpass",
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_login_invalid_credentials(client):
    response = client.post("/auth/login", json={
        "username": "testuser", "password": "wrong",
    })
    assert response.status_code == 401

def test_protected_endpoint_without_token(client):
    response = client.get("/me")
    assert response.status_code == 401

def test_protected_endpoint_with_token(auth_client):
    response = auth_client.get("/me")
    assert response.status_code == 200
```

### 29.3.2 模拟外部服务

```python
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client_with_mock():
    with patch("app.services.email.send_email", new_callable=AsyncMock) as mock_email:
        mock_email.return_value = {"status": "sent"}
        client = TestClient(app)
        yield client, mock_email

def test_register_sends_email(client_with_mock):
    client, mock_email = client_with_mock
    response = client.post("/register", json={
        "username": "newuser", "email": "new@example.com", "password": "pass123",
    })
    assert response.status_code == 200
    mock_email.assert_called_once()
```

---

## 29.4 示例代码

### 29.4.1 完整的测试项目

```python
"""conftest.py — 测试配置"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.dependencies import get_db

@pytest.fixture
def mock_db():
    return MockDatabase()

@pytest.fixture
def client(mock_db):
    app.dependency_overrides[get_db] = lambda: mock_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def auth_headers():
    # 模拟认证
    return {"Authorization": "Bearer test_token"}

# === test_users.py ===
def test_list_users(client, auth_headers):
    response = client.get("/users", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_create_user(client, auth_headers):
    response = client.post("/users", json={
        "name": "Alice", "email": "alice@example.com",
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Alice"

def test_create_user_invalid(client, auth_headers):
    response = client.post("/users", json={
        "name": "", "email": "invalid",
    }, headers=auth_headers)
    assert response.status_code == 422

def test_get_user_not_found(client, auth_headers):
    response = client.get("/users/999", headers=auth_headers)
    assert response.status_code == 404
```

---

## 29.5 常见陷阱与最佳实践

| 陷阱 | 最佳实践 |
|------|---------|
| 测试使用真实数据库 | 使用依赖覆盖替换为模拟数据库 |
| 不清理 dependency_overrides | 使用 fixture 的 yield 确保清理 |
| 测试间共享状态 | 每个测试使用独立 fixture |
| 不测试错误路径 | 测试 400/401/404/422/500 |
| 测试覆盖面不足 | 目标 80%+ 覆盖率 |
| 不测试 Pydantic 验证 | 单独测试模型验证逻辑 |
| TestClient 不关闭 | 使用 `with TestClient(app) as c` |

---

本章从 TestClient 的配置到单元测试编写，从依赖覆盖到模拟外部服务，从 ASGI 传输层到依赖注入覆盖源码，全面剖析了 FastAPI 单元测试的底层机制与实践。