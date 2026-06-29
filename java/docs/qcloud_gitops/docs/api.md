# API 文档

## 基础信息

- **Base URL**: `http://localhost:8080/api/v1`
- **Swagger UI**: `http://localhost:8080/docs`
- **ReDoc**: `http://localhost:8080/redoc`
- **健康检查**: `http://localhost:8080/health`
- **监控指标**: `http://localhost:8080/metrics`

## 用户管理 API

### 创建用户

```http
POST /api/v1/users
Content-Type: application/json

{
  "username": "alice",
  "email": "alice@example.com",
  "full_name": "Alice Wang",
  "age": 28,
  "phone": "+8613800138000"
}
```

**响应 201:**
```json
{
  "id": 1,
  "username": "alice",
  "email": "alice@example.com",
  "full_name": "Alice Wang",
  "age": 28,
  "phone": "+8613800138000",
  "is_active": true,
  "created_at": "2024-01-01T00:00:00",
  "updated_at": "2024-01-01T00:00:00"
}
```

### 获取用户详情

```http
GET /api/v1/users/{id}
```

### 获取用户列表

```http
GET /api/v1/users?page=1&page_size=20
```

**响应 200:**
```json
{
  "total": 1,
  "items": [...],
  "page": 1,
  "page_size": 20
}
```

### 修改用户信息

```http
PUT /api/v1/users/{id}
Content-Type: application/json

{
  "full_name": "Alice Zhang",
  "age": 29
}
```

### 删除用户

```http
DELETE /api/v1/users/{id}
```

## 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | 删除成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 422 | 参数校验失败 |
| 500 | 服务器内部错误 |
