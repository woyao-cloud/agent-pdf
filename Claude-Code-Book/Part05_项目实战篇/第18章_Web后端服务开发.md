# 第18章 Web 后端服务开发

## 18.1 技术选型与项目初始化

### 18.1.1 框架选择

**Python Web 框架对比**

| 框架 | 特点 | 适用场景 |
|------|------|----------|
| FastAPI | 现代、高性能、自动文档 | 新项目、微服务 |
| Flask | 轻量、灵活 | 小型项目、API |
| Django | 全功能、ORM | 中大型项目 |

**推荐：FastAPI**

```python
from fastapi import FastAPI

app = FastAPI(title="My API")

@app.get("/")
def root():
    return {"message": "Hello World"}

@app.post("/items/")
def create_item(item: Item):
    return item
```

### 18.1.2 数据库设计

**SQLAlchemy 模型**

```python
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    orders = relationship("Order", back_populates="user")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String, default="pending")
    total = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="orders")
```

### 18.1.3 API 设计原则

**RESTful API 设计**

```python
# 资源命名
GET    /api/users          # 用户列表
GET    /api/users/{id}     # 单个用户
POST   /api/users          # 创建用户
PUT    /api/users/{id}     # 更新用户
DELETE /api/users/{id}     # 删除用户

# 过滤和分页
GET /api/users?status=active&page=1&size=20

# 错误响应
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "用户不存在",
    "details": {...}
  }
}
```

## 18.2 核心功能开发

### 18.2.1 用户认证

**JWT 认证实现**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return username

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="用户名或密码错误")
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}
```

### 18.2.2 业务接口

**CRUD 示例**

```python
@router.post("/users/", response_model=UserResponse, status_code=201)
async def create_user(user: UserCreate, db: Session = Depends(get_db)):
    # 检查用户是否存在
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    # 创建用户
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user
```

### 18.2.3 权限控制

**基于角色的权限**

```python
class Role(StrEnum):
    ADMIN = "admin"
    USER = "user"
    MODERATOR = "moderator"

def require_role(required_role: Role):
    async def role_checker(
        current_user: User = Depends(get_current_user)
    ):
        if current_user.role != required_role:
            if required_role == Role.ADMIN:
                raise HTTPException(
                    status_code=403,
                    detail="需要管理员权限"
                )
            else:
                raise HTTPException(
                    status_code=403,
                    detail="权限不足"
                )
        return current_user
    return role_checker

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    # 删除用户的逻辑
    pass
```

## 18.3 部署与运维

### 18.3.1 Docker 容器化

**Dockerfile**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**docker-compose.yml**

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
    depends_on:
      - db
    volumes:
      - ./logs:/app/logs

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=mydb
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 18.3.2 CI/CD 流程

**GitHub Actions 示例**

```yaml
name: CI/CD
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-cov
      - name: Run tests
        run: pytest --cov=app tests/
      - name: Build
        run: docker build -t my-api:${{ github.sha }} .
```

### 18.3.3 监控与日志

**日志配置**

```python
import logging
from logging.handlers import TimedRotatingFileHandler

logging_config = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        }
    },
    "handlers": {
        "file": {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": "logs/api.log",
            "formatter": "default",
            "when": "midnight",
            "interval": 1,
            "backupCount": 30
        }
    },
    "root": {"level": "INFO", "handlers": ["file"]}
}

logging.config.dictConfig(logging_config)
```

## 本章小结

本章介绍了 Web 后端服务开发。涵盖技术选型、数据库设计、API 设计、用户认证、业务接口开发、Docker 部署和 CI/CD 流程。

## 练习题

1. 使用 FastAPI 开发一个完整的 CRUD API
2. 实现 JWT 认证
3. 部署到 Docker
