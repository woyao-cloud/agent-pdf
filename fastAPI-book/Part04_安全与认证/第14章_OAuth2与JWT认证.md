# 第14章 OAuth2与JWT认证

## 14.1 概念与语法

### 14.1.1 fastapi.security模块概览

FastAPI的`fastapi.security`模块提供了一整套OAuth2与认证相关的工具类，它们并非直接实现认证逻辑，而是定义了从请求中提取凭证的规范。这些工具类全部基于FastAPI的依赖注入系统构建，核心思想是：**声明式地描述"我需要什么凭证"，由框架负责从请求中提取并验证**。

```python
# fastapi.security 模块的核心类层次结构
#
# SecurityBase (ABC)
#   ├── OAuth2: 定义OAuth2基础字段（flows、scheme_name等）
#   │     ├── OAuth2PasswordBearer: 从Authorization头提取Bearer Token
#   │     ├── OAuth2AuthorizationCodeBearer: Authorization Code流程
#   │     └── OAuth2ImplicitBearer: 隐式授权流程
#   ├── HTTPBasic: HTTP Basic认证
# ├── HTTPBearer: Bearer Token认证
# ├── APIKeyBase
#       ├── APIKeyHeader: 从请求头提取API Key
#       ├── APIKeyQuery: 从查询参数提取API Key
#       └── APIKeyCookie: 从Cookie提取API Key
```

`SecurityBase`是所有安全工具的抽象基类，它有一个关键方法`__call__`——这使得每个安全工具都是可调用的依赖项。FastAPI在路由处理时，会调用这些安全依赖的`__call__`方法从请求中提取凭证，如果提取失败则自动返回401/403响应。

### 14.1.2 OAuth2PasswordBearer

`OAuth2PasswordBearer`是FastAPI中最常用的OAuth2工具类，它实现了RFC 6750定义的Bearer Token方案。其核心功能是从HTTP请求的`Authorization`头中提取Bearer Token。

```python
from fastapi.security import OAuth2PasswordBearer

# 基本用法
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# 完整参数
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="auth/login",          # 获取token的URL路径（相对或绝对）
    scheme_name="OAuth2Password",   # OpenAPI scheme名称
    scopes={"read": "读权限", "write": "写权限"},  # 可用scope
    description="OAuth2密码授权流程",  # OpenAPI描述
    auto_error=True,               # 提取失败时是否自动返回401
)
```

**关键参数解析**：

- `tokenUrl`：不是URL路由注册，而是告诉OpenAPI文档"用户应该向这个地址请求Token"。FastAPI不会自动在此路径创建端点，开发者需要自己实现该端点。
- `auto_error`：默认为`True`，当请求中没有合法Token时自动抛出401异常。设为`False`时，缺失Token返回`None`，适合可选认证场景。
- `scopes`：定义OAuth2权限范围，会体现在OpenAPI文档的授权配置中。

**源码级剖析——OAuth2PasswordBearer.__call__**：

```python
# fastapi/security/oauth2.py（简化版源码）
class OAuth2PasswordBearer(OAuth2):
    def __init__(
        self,
        tokenUrl: str,
        scheme_name: Optional[str] = None,
        scopes: Optional[Dict[str, str]] = None,
        description: Optional[str] = None,
        auto_error: bool = True,
    ):
        if not scopes:
            scopes = {}
        # 调用父类OAuth2初始化，构建OAuth2 flows定义
        super().__init__(
            flows=OAuthFlows(
                password=OAuthFlowPassword(
                    tokenUrl=tokenUrl,
                    scopes=scopes,
                )
            ),
            scheme_name=scheme_name,
            description=description,
            auto_error=auto_error,
        )

    async def __call__(self, request: Request) -> Optional[str]:
        # 从Authorization头提取Bearer Token
        authorization: str = request.headers.get("Authorization")
        if not authorization:
            if self.auto_error:
                # 抛出401异常，附带WWW-Authenticate头
                raise HTTPException(
                    status_code=HTTP_401_UNAUTHORIZED,
                    detail="Not authenticated",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return None
        # 解析 "Bearer <token>" 格式
        scheme, _, param = authorization.partition(" ")
        if scheme.lower() != "bearer":
            if self.auto_error:
                raise HTTPException(
                    status_code=HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return None
        return param
```

注意源码中的关键细节：当认证失败时，响应头中包含`WWW-Authenticate: Bearer`，这是RFC 7235规范的要求——当服务器返回401时，必须通过`WWW-Authenticate`头告知客户端所需的认证方案。

### 14.1.3 OAuth2PasswordRequestForm

`OAuth2PasswordRequestForm`是OAuth2密码授权流程中请求体的标准格式，符合RFC 6749 Section 4.3.2的要求。它期望`application/x-www-form-urlencoded`格式的请求体。

```python
from fastapi.security import OAuth2PasswordRequestForm

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # form_data.username  - 用户名（不是email）
    # form_data.password  - 密码
    # form_data.scopes    - 请求的scope列表
    # form_data.client_id - 可选的客户端ID
    # form_data.client_secret - 可选的客户端密钥
    # form_data.grant_type - 固定为"password"
    return {"access_token": "...", "token_type": "bearer"}
```

**源码级剖析——OAuth2PasswordRequestForm**：

```python
# fastapi/security/oauth2.py
class OAuth2PasswordRequestForm:
    """
    OAuth2密码授权的请求表单
    请求体格式：application/x-www-form-urlencoded
    必填字段：username, password
    可选字段：scope, client_id, client_secret, grant_type
    """
    def __init__(
        self,
        grant_type: str = Form(None, regex="password"),
        username: str = Form(...),          # 必填
        password: str = Form(...),          # 必填
        scope: str = Form(""),              # 空格分隔的scope字符串
        client_id: Optional[str] = Form(None),
        client_secret: Optional[str] = Form(None),
    ):
        self.grant_type = grant_type
        self.username = username
        self.password = password
        # 将空格分隔的scope字符串转为列表
        self.scopes = scope.split()
        self.client_id = client_id
        self.client_secret = client_secret
```

重要细节：`scope`字段是单个字符串，多个scope用空格分隔（如`"read write admin"`），`OAuth2PasswordRequestForm`自动将其拆分为列表。这与OAuth2规范一致——scope在请求中以空格分隔，在响应中以列表形式表示。

### 14.1.4 JWT编码解码

JWT（JSON Web Token）是RFC 7519定义的令牌标准。Python生态中有两个主流库：

**python-jose**：

```python
from jose import jwt, JWTError, ExpiredSignatureError

# 编码（签发Token）
token = jwt.encode(
    claims={
        "sub": "user123",          # Subject - 用户标识
        "exp": datetime.utcnow() + timedelta(minutes=30),  # 过期时间
        "iat": datetime.utcnow(),  # 签发时间
        "nbf": datetime.utcnow(),  # 生效时间（Not Before）
        "iss": "my-app",           # 签发者（Issuer）
        "aud": "my-api",           # 受众（Audience）
        "jti": "unique-id-123",    # JWT ID - 唯一标识，用于防重放
        "scope": "read write",     # 自定义声明
    },
    key="secret-key",
    algorithm="HS256"
)

# 解码（验证Token）
try:
    payload = jwt.decode(
        token=token,
        key="secret-key",
        algorithms=["HS256"],      # 必须指定算法列表，防止算法混淆攻击
        audience="my-api",         # 验证受众
        issuer="my-app",           # 验证签发者
    )
    # payload = {"sub": "user123", "exp": ..., "iat": ..., ...}
except ExpiredSignatureError:
    # Token已过期
    pass
except JWTError:
    # 签名无效、格式错误等
    pass
```

**PyJWT**：

```python
import jwt as pyjwt
from jwt import PyJWTError, ExpiredSignatureError, InvalidAudienceError

# 编码
token = pyjwt.encode(
    payload={"sub": "user123", "exp": datetime.utcnow() + timedelta(hours=1)},
    key="secret-key",
    algorithm="HS256",
    headers={"kid": "key-2024-01"},  # Key ID，用于密钥轮换
)

# 解码
payload = pyjwt.decode(
    token,
    "secret-key",
    algorithms=["HS256"],
    audience="my-api",
    issuer="my-app",
    options={
        "require": ["exp", "iat", "sub"],  # 必须包含的声明
        "verify_exp": True,                  # 验证过期时间
        "verify_iat": True,                  # 验证签发时间
        "verify_aud": True,                  # 验证受众
    }
)
```

**两个库的关键差异**：

| 特性 | python-jose | PyJWT |
|------|------------|-------|
| 算法支持 | HS256, RS256, ES256, PS256, EdDSA | HS256, RS256, ES256, PS256, EdDSA |
| 加密JWE | 支持（jose模块） | 不支持（仅签名JWS） |
| 依赖 | 依赖cryptography + ecdsa | 仅依赖cryptography（可选） |
| 性能 | 略慢（JWE支持的开销） | 更轻量更快 |
| 维护 | 社区维护较慢 | 活跃维护 |
| 类型提示 | 较弱 | 较好的类型支持 |

**生产环境推荐**：优先使用PyJWT，除非需要JWE加密功能。PyJWT维护更活跃、类型支持更好、性能更优。

### 14.1.5 密码哈希

FastAPI文档推荐使用`passlib`进行密码哈希处理。passlib是一个密码哈希抽象层，支持多种哈希算法。

```python
from passlib.context import CryptContext

# 创建密码哈希上下文
pwd_context = CryptContext(
    schemes=["bcrypt"],        # 使用的哈希算法列表
    deprecated="auto",          # 自动处理已弃用算法
    bcrypt__rounds=12,          # bcrypt的cost factor（默认12）
)

# 哈希密码
hashed = pwd_context.hash("my-password")
# 输出类似：$2b$12$KIXxqwe...60字符...

# 验证密码
is_valid = pwd_context.verify("my-password", hashed)  # True
is_invalid = pwd_context.verify("wrong-password", hashed)  # False

# 检查是否需要重新哈希（算法升级或rounds变更时）
needs_rehash = pwd_context.needs_update(hashed)  # True/False
```

**bcrypt哈希格式解析**：

```
$2b$12$KIXxqwe...60字符...
 │  │  │  └────────── 哈希值（31字节Base64编码）
 │  │  └───────────── salt（16字节Base64编码）
 │  └──────────────── cost factor（2^12 = 4096轮）
 └─────────────────── 算法标识符（2b = bcrypt修订版）
```

- `$2b$`：bcrypt算法版本标识。`2b`是OpenBSD实现的修正版本，也是目前最广泛使用的版本。
- `12`：cost factor，决定计算轮数（2^12 = 4096轮迭代）。每增加1，计算时间翻倍。
- 后面22个字符是salt（Base64编码的16字节随机盐），31个字符是哈希值。

### 14.1.6 Bearer Token

Bearer Token是RFC 6750定义的OAuth2令牌使用方案。核心规则极为简单：**谁持有Token，谁就拥有访问权限**。

```
客户端请求格式：
GET /api/users HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

三种传输方式（RFC 6750定义）：
1. Authorization头（推荐）：Authorization: Bearer <token>
2. 表单参数（不推荐）：access_token=<token>
3. 查询参数（仅限无其他选择时）：?access_token=<token>
```

FastAPI的`OAuth2PasswordBearer`仅实现了Authorization头方式，这也是最安全的方式——查询参数会出现在日志和浏览器历史中，表单参数不适用于JSON API。

## 14.2 原理与机制

### 14.2.1 OAuth2密码授权流程

OAuth2定义了四种授权类型（Grant Types），FastAPI主要使用密码授权类型（Resource Owner Password Credentials Grant）。以下是完整的交互时序：

```
┌────────┐                          ┌──────────┐                    ┌──────────┐
│ Client │                          │ Auth     │                    │ Resource │
│ (前端) │                          │ Server   │                    │ Server   │
└───┬────┘                          └────┬─────┘                    └────┬─────┘
    │                                    │                               │
    │ 1. POST /token                     │                               │
    │    grant_type=password             │                               │
    │    username=alice                  │                               │
    │    password=secret                 │                               │
    │───────────────────────────────────>│                               │
    │                                    │                               │
    │                                    │ 2. 验证凭证                    │
    │                                    │    pwd_context.verify()        │
    │                                    │                               │
    │                                    │ 3. 签发JWT                    │
    │                                    │    jwt.encode()                │
    │                                    │                               │
    │ 4. { access_token, token_type }    │                               │
    │<───────────────────────────────────│                               │
    │                                    │                               │
    │ 5. GET /api/users                  │                               │
    │    Authorization: Bearer <token>   │                               │
    │──────────────────────────────────────────────────────────────────>│
    │                                    │                               │
    │                                    │    6. jwt.decode()验证Token    │
    │                                    │<──────────────────────────────│
    │                                    │                               │
    │ 7. { users: [...] }                │                               │
    │<──────────────────────────────────────────────────────────────────│
    │                                    │                               │
```

**密码授权流程的安全边界**：

密码授权类型是OAuth2四种授权中最简单的，但也是最不安全的——客户端直接接触用户密码。RFC 6749 Section 4.3明确指出：

> The resource owner password credentials grant type is suitable in cases where the resource owner has a trust relationship with the client.

这意味着密码授权仅适用于**第一方应用**（即你自己的前端与后端），绝不应将用户密码发送给第三方应用。这也是为什么OAuth2更推荐授权码（Authorization Code）流程——在授权码流程中，第三方应用永远接触不到用户密码。

### 14.2.2 JWT的结构：Header.Payload.Signature

JWT由三部分组成，用点号（`.`）分隔：

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxNzAxMjM0NTY3fQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
│                                            │                                                  │
└── Header (Base64Url)                       └── Payload (Base64Url)                            └── Signature
```

**Header**：

```json
{
  "alg": "HS256",      // 签名算法
  "typ": "JWT",         // 令牌类型
  "kid": "key-2024-01"  // Key ID（可选，用于密钥轮换）
}
```

`alg`字段指定签名算法，是JWT安全的核心。JWT支持三种算法类型：

| 类型 | 算法 | 密钥 | 典型用途 |
|------|------|------|---------|
| 对称 | HS256/HS384/HS512 | 共享密钥 | 单服务认证 |
| 非对称 | RS256/RS384/RS512 | RSA公私钥对 | 多服务验证 |
| 椭圆曲线 | ES256/ES384/ES512 | ECDSA公私钥对 | 高性能验证 |

**Payload**：

```json
{
  "sub": "user123",              // Subject - 用户唯一标识
  "exp": 1701234567,             // Expiration - 过期时间（Unix时间戳）
  "iat": 1701230967,             // Issued At - 签发时间
  "nbf": 1701230967,             // Not Before - 生效时间
  "iss": "auth.example.com",    // Issuer - 签发者
  "aud": "api.example.com",      // Audience - 受众
  "jti": "550e8400-e29b-41d4",   // JWT ID - 唯一标识
  "scope": "read write",         // 自定义声明：权限范围
  "roles": ["admin", "editor"]   // 自定义声明：角色
}
```

RFC 7519定义了7个注册声明（Registered Claims），均为可选但推荐使用：

- `sub`（Subject）：主题，通常是用户ID。必须在签发者范围内唯一。
- `exp`（Expiration Time）：过期时间。验证时必须检查，防止Token永久有效。
- `iat`（Issued At）：签发时间。可用于计算Token年龄。
- `nbf`（Not Before）：生效时间。允许签发后延迟生效。
- `iss`（Issuer）：签发者标识。验证时确保Token来自可信源。
- `aud`（Audience）：预期接收者。防止Token被错误的服务接受。
- `jti`（JWT ID）：唯一标识。用于Token黑名单和防重放攻击。

**Signature**：

```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

签名的计算方式：
1. 将Header和Payload分别Base64Url编码
2. 用点号连接两个编码字符串
3. 用Header中指定的算法和密钥对连接字符串进行签名
4. 将签名结果Base64Url编码

**Base64Url编码与Base64的区别**：

```
Base64:    使用 +, / 和 = 填充
Base64Url: 使用 -, _ 且无填充（=被移除）

原因：JWT需要在URL、HTTP头、Cookie中传输，
     +, / 和 = 在这些上下文中有特殊含义，必须替换。
```

### 14.2.3 Token验证的依赖注入链

FastAPI的认证验证是通过依赖注入链（Dependency Injection Chain）实现的。这条链从请求到达路由函数开始，经过多个依赖项的层层验证，最终将认证结果注入路由函数。

```
HTTP请求
  │
  ▼
OAuth2PasswordBearer.__call__(request)
  │  从Authorization头提取Token
  │  失败则抛出401异常
  │
  ▼
get_current_user(token: str = Depends(oauth2_scheme))
  │  jwt.decode() 解码验证Token
  │  查询数据库获取用户信息
  │  失败则抛出401/403异常
  │
  ▼
get_current_active_user(current_user: User = Depends(get_current_user))
  │  检查用户是否被禁用
  │  检查用户是否已验证邮箱
  │  失败则抛出400/403异常
  │
  ▼
路由函数(user: User = Depends(get_current_active_user))
```

**依赖注入链的源码级实现机制**：

FastAPI的依赖注入系统由`fastapi.dependencies.utils`模块驱动。当路由被调用时，`solve_dependencies`函数按以下步骤执行：

```python
# fastapi/dependencies/utils.py（简化逻辑）
async def solve_dependencies(
    request: Request,
    dependant: Dependant,
    dependency_overrides_provider: Optional[Any] = None,
) -> Tuple[Dict[str, Any], List[Exception]]:
    # 1. 递归解析所有依赖项
    # 2. 按依赖图拓扑排序执行
    # 3. 每个依赖项的结果作为下一个依赖项的参数
    # 4. 任何依赖项抛出异常即短路返回
    
    values: Dict[str, Any] = {}
    errors: List[Exception] = []
    
    for dep in dependant.dependencies:
        # 递归解析子依赖
        sub_values, sub_errors = await solve_dependencies(
            request=request,
            dependant=dep,
        )
        if sub_errors:
            errors.extend(sub_errors)
            continue
        
        # 调用依赖函数
        try:
            result = await dep.call(**sub_values)
            values[dep.name] = result
        except Exception as e:
            errors.append(e)
    
    return values, errors
```

关键特性：
1. **短路行为**：如果链中某个依赖抛出异常，后续依赖不再执行，异常直接传播。
2. **缓存机制**：同一请求中，相同依赖只执行一次，结果被缓存复用。
3. **作用域隔离**：每个依赖的结果只在声明了该依赖的路由参数中可用。

### 14.2.4 密码哈希的bcrypt算法原理

bcrypt是基于Blowfish密码设计的自适应哈希函数，由Niels Provos和David Mazieres在1999年设计。其核心安全特性是**计算成本可调**——通过cost factor控制哈希计算的迭代轮数。

**bcrypt算法流程**：

```
输入：密码（最多72字节）、cost factor（4-31）
输出：格式为 $2b$cost$salt+hash 的字符串

1. 生成16字节随机盐（salt）
2. 使用盐和密码初始化Blowfish密钥调度
   - EksBlowfishSetup(cost, salt, password)
   - 先用salt扩展密钥
   - 再用password扩展密钥
3. 执行 2^cost 轮加密迭代
   - 每轮使用Blowfish的ECB模式加密固定字符串
   - "OrpheanBeholderScryDoubt"（24字节）
4. 将cost、salt和加密结果编码为字符串
```

**为什么bcrypt比SHA-256更适合密码哈希**：

```python
# SHA-256：固定计算成本，可被GPU/ASIC暴力加速
import hashlib
hashlib.sha256(b"password").hexdigest()  # 微秒级

# bcrypt：可调计算成本，天然抗GPU/ASIC
from passlib.hash import bcrypt
bcrypt.using(rounds=12).hash("password")  # 毫秒级（~200ms）
```

| 特性 | SHA-256 | bcrypt |
|------|---------|--------|
| 计算成本 | 固定 | 可调（cost factor） |
| GPU加速 | 高度可并行 | 不可并行（内存依赖） |
| 盐值 | 需手动处理 | 内置自动盐 |
| 彩虹表攻击 | 需盐值防护 | 内置盐值防护 |
| 侧信道攻击 | 不防护 | 内存访问模式不可预测 |

**cost factor选择指南**：

```
cost=10:  ~100ms  - 开发环境
cost=12:  ~200ms  - 生产环境最低要求
cost=14:  ~800ms  - 高安全要求
cost=16:  ~3s     - 超高安全（影响用户体验）

原则：在用户体验可接受的前提下，选择最高的cost值。
通常目标延迟在200-500ms之间。
```

### 14.2.5 OAuth2与OpenAPI的集成

FastAPI的`fastapi.security`模块不仅提供认证功能，还自动将OAuth2配置集成到OpenAPI文档中。这使用户可以通过Swagger UI直接测试需要认证的API。

**OpenAPI 3.0中的OAuth2定义**：

```json
{
  "components": {
    "securitySchemes": {
      "OAuth2Password": {
        "type": "oauth2",
        "flows": {
          "password": {
            "tokenUrl": "/auth/login",
            "scopes": {
              "read": "读取权限",
              "write": "写入权限"
            }
          }
        }
      }
    }
  },
  "security": [
    {"OAuth2Password": ["read"]}
  ]
}
```

FastAPI如何自动生成此配置：

```python
# OAuth2PasswordBearer初始化时，构建OAuthFlowPassword对象
flows = OAuthFlows(
    password=OAuthFlowPassword(
        tokenUrl="auth/login",
        scopes={"read": "读取权限", "write": "写入权限"},
    )
)

# FastAPI在生成OpenAPI schema时，遍历所有路由的依赖
# 发现OAuth2PasswordBearer依赖后，将其转换为securitySchemes
# 如果路由函数使用Depends(oauth2_scheme)，则自动在路径操作上添加security声明
```

**Swagger UI中的交互流程**：

1. 用户点击Swagger UI的"Authorize"按钮
2. 弹出OAuth2密码授权表单（username, password, scopes）
3. 用户输入凭证并授权
4. Swagger UI向tokenUrl发送POST请求获取Token
5. 后续所有请求自动附带`Authorization: Bearer <token>`头

这意味着开发者只需声明`Depends(oauth2_scheme)`，FastAPI就自动完成从请求提取到文档生成的全部工作。

## 14.3 使用场景

### 14.3.1 用户登录认证

最常见的OAuth2密码授权场景——用户通过用户名密码登录，获取JWT令牌后访问受保护API。

```
用户 -> 前端 -> POST /auth/login { username, password }
                      │
                      ▼
              验证凭证 -> 签发JWT
                      │
                      ▼
              { access_token, token_type }
                      │
                      ▼
前端存储Token -> 请求API附带Authorization头
```

**适用条件**：
- 第一方应用（前后端属于同一系统）
- 用户信任客户端（用户愿意向此客户端输入密码）
- 不涉及第三方服务认证

### 14.3.2 Token刷新机制

JWT一旦签发就无法撤销（除非使用黑名单），因此应该设置较短的过期时间（如15-30分钟）。但频繁重新登录严重影响用户体验，因此引入刷新Token（Refresh Token）机制。

**双Token架构**：

```
Access Token:  短期有效（15-30分钟），用于API访问
Refresh Token: 长期有效（7-30天），仅用于获取新的Access Token

流程：
1. 登录 -> 获取 { access_token, refresh_token }
2. 使用access_token访问API
3. access_token过期 -> 401错误
4. 前端使用refresh_token请求 POST /auth/refresh
5. 服务端验证refresh_token -> 签发新的access_token
6. 如果refresh_token也过期 -> 跳转登录页
```

**Refresh Token的安全存储**：

```
Access Token:  存储在内存中（JavaScript变量），不持久化
Refresh Token: 存储在HttpOnly Cookie中，防止XSS窃取

为什么？
- Access Token短期有效，即使泄露影响有限
- Refresh Token长期有效，必须最高安全级别保护
- HttpOnly Cookie对JavaScript不可见，XSS攻击无法窃取
- Cookie可设置SameSite属性，防止CSRF
```

### 14.3.3 第三方OAuth2集成

当需要集成Google、GitHub等第三方OAuth2服务时，使用的是授权码流程（Authorization Code Grant），而非密码流程。

```
用户 -> 前端 -> GET /auth/github （重定向到GitHub授权页）
                      │
                      ▼
              GitHub授权页（用户确认授权）
                      │
                      ▼
              回调URL附带authorization_code
                      │
                      ▼
              后端用code换取access_token
                      │
                      ▼
              用第三方access_token获取用户信息
                      │
                      ▼
              签发自己的JWT（本地Token）
```

FastAPI中集成第三方OAuth2需要自定义安全方案，因为`OAuth2PasswordBearer`不适用于授权码流程。需要使用`OAuth2AuthorizationCodeBearer`或自定义依赖项。

## 14.4 示例代码

### 14.4.1 完整的JWT认证系统

以下是一个完整的JWT认证系统，包含注册、登录、刷新和黑名单功能。

```python
# auth/models.py - 数据模型
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)


class UserResponse(UserBase):
    id: str
    roles: List[UserRole] = []
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: str
    roles: List[str] = []
    scope: str = ""
    jti: str = ""  # JWT ID，用于黑名单
```

```python
# auth/config.py - 认证配置
from datetime import timedelta
import os


class AuthConfig:
    # JWT配置
    SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE: timedelta = timedelta(minutes=30)
    REFRESH_TOKEN_EXPIRE: timedelta = timedelta(days=7)

    # bcrypt配置
    BCRYPT_ROUNDS: int = 12

    # Token黑名单配置
    BLACKLIST_ENABLED: bool = True

    # 刷新Token配置
    REFRESH_TOKEN_ROTATION: bool = True  # 每次刷新后轮换refresh token


auth_config = AuthConfig()
```

```python
# auth/jwt_handler.py - JWT处理
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import uuid

import jwt
from jwt import PyJWTError, ExpiredSignatureError

from auth.config import auth_config
from auth.models import Token, TokenData


class JWTHandler:
    """JWT令牌处理器 - 负责编码、解码和验证"""

    def __init__(self, secret_key: str, algorithm: str = "HS256"):
        self._secret_key = secret_key
        self._algorithm = algorithm

    def create_access_token(
        self,
        user_id: str,
        roles: list[str] | None = None,
        scope: str = "",
        expires_delta: timedelta | None = None,
    ) -> str:
        """签发Access Token"""
        if roles is None:
            roles = []
        expire = datetime.utcnow() + (
            expires_delta or auth_config.ACCESS_TOKEN_EXPIRE
        )
        jti = str(uuid.uuid4())

        payload = {
            "sub": user_id,
            "roles": roles,
            "scope": scope,
            "jti": jti,
            "exp": expire,
            "iat": datetime.utcnow(),
            "iss": "fastapi-auth",
            "aud": "fastapi-api",
            "type": "access",
        }
        return jwt.encode(payload, self._secret_key, algorithm=self._algorithm)

    def create_refresh_token(
        self,
        user_id: str,
        expires_delta: timedelta | None = None,
    ) -> str:
        """签发Refresh Token"""
        expire = datetime.utcnow() + (
            expires_delta or auth_config.REFRESH_TOKEN_EXPIRE
        )
        jti = str(uuid.uuid4())

        payload = {
            "sub": user_id,
            "jti": jti,
            "exp": expire,
            "iat": datetime.utcnow(),
            "iss": "fastapi-auth",
            "aud": "fastapi-api",
            "type": "refresh",
        }
        return jwt.encode(payload, self._secret_key, algorithm=self._algorithm)

    def create_token_pair(self, user_id: str, roles: list[str] | None = None) -> Token:
        """签发Token对（access + refresh）"""
        access_token = self.create_access_token(user_id, roles)
        refresh_token = self.create_refresh_token(user_id)
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
        )

    def decode_token(self, token: str) -> Dict[str, Any]:
        """解码并验证Token"""
        try:
            payload = jwt.decode(
                token,
                self._secret_key,
                algorithms=[self._algorithm],
                audience="fastapi-api",
                issuer="fastapi-auth",
                options={
                    "require": ["exp", "iat", "sub", "type"],
                    "verify_exp": True,
                    "verify_iat": True,
                    "verify_aud": True,
                },
            )
            return payload
        except ExpiredSignatureError:
            raise ValueError("Token已过期")
        except PyJWTError as e:
            raise ValueError(f"Token无效: {str(e)}")

    def decode_token_without_verification(self, token: str) -> Dict[str, Any]:
        """
        解码Token但不验证签名和过期时间
        仅用于从过期Token中提取信息（如刷新时获取user_id）
        """
        try:
            payload = jwt.decode(
                token,
                self._secret_key,
                algorithms=[self._algorithm],
                options={
                    "verify_exp": False,
                    "verify_signature": True,  # 签名仍然验证
                },
            )
            return payload
        except PyJWTError as e:
            raise ValueError(f"Token无效: {str(e)}")

    def extract_token_data(self, token: str) -> TokenData:
        """从Token中提取结构化数据"""
        payload = self.decode_token(token)
        return TokenData(
            user_id=payload["sub"],
            roles=payload.get("roles", []),
            scope=payload.get("scope", ""),
            jti=payload.get("jti", ""),
        )


# 全局JWT处理器实例
jwt_handler = JWTHandler(
    secret_key=auth_config.SECRET_KEY,
    algorithm=auth_config.ALGORITHM,
)
```

```python
# auth/password.py - 密码处理
from passlib.context import CryptContext

from auth.config import auth_config


class PasswordHandler:
    """密码哈希处理器"""

    def __init__(self, rounds: int = auth_config.BCRYPT_ROUNDS):
        self._context = CryptContext(
            schemes=["bcrypt"],
            deprecated="auto",
            bcrypt__rounds=rounds,
        )

    def hash(self, password: str) -> str:
        """哈希密码"""
        return self._context.hash(password)

    def verify(self, plain_password: str, hashed_password: str) -> bool:
        """验证密码"""
        return self._context.verify(plain_password, hashed_password)

    def needs_rehash(self, hashed_password: str) -> bool:
        """检查是否需要重新哈希（cost变更或算法升级时）"""
        return self._context.needs_update(hashed_password)


# 全局密码处理器实例
password_handler = PasswordHandler()
```

```python
# auth/token_blacklist.py - Token黑名单
from datetime import datetime, timedelta
from typing import Optional
import threading


class TokenBlacklist:
    """
    Token黑名单（内存实现，生产环境应使用Redis）
    
    黑名单存储格式：{ jti: expire_time }
    只在Token自然过期前保持黑名单条目，过期后自动清理。
    """

    def __init__(self):
        self._blacklist: dict[str, datetime] = {}
        self._lock = threading.Lock()

    def add(self, jti: str, expire_time: datetime) -> None:
        """将Token加入黑名单"""
        with self._lock:
            self._blacklist[jti] = expire_time

    def is_blacklisted(self, jti: str) -> bool:
        """检查Token是否在黑名单中"""
        with self._lock:
            expire_time = self._blacklist.get(jti)
            if expire_time is None:
                return False
            # 如果Token自然过期，黑名单条目不再需要
            if datetime.utcnow() > expire_time:
                del self._blacklist[jti]
                return False
            return True

    def cleanup(self) -> int:
        """清理过期的黑名单条目，返回清理数量"""
        with self._lock:
            now = datetime.utcnow()
            expired_jtis = [
                jti for jti, expire in self._blacklist.items()
                if now > expire
            ]
            for jti in expired_jtis:
                del self._blacklist[jti]
            return len(expired_jtis)

    @property
    def size(self) -> int:
        """当前黑名单大小"""
        with self._lock:
            return len(self._blacklist)


# 全局黑名单实例
token_blacklist = TokenBlacklist()


# Redis版本的黑名单实现（生产推荐）
class RedisTokenBlacklist:
    """基于Redis的Token黑名单（生产环境推荐）"""

    def __init__(self, redis_client):
        self._redis = redis_client
        self._prefix = "token_blacklist:"

    async def add(self, jti: str, expire_seconds: int) -> None:
        """将Token加入黑名单，设置TTL自动过期"""
        await self._redis.setex(
            f"{self._prefix}{jti}",
            expire_seconds,
            "1",
        )

    async def is_blacklisted(self, jti: str) -> bool:
        """检查Token是否在黑名单中"""
        return await self._redis.exists(f"{self._prefix}{jti}") > 0
```

```python
# auth/dependencies.py - 认证依赖项
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from auth.jwt_handler import jwt_handler
from auth.password import password_handler
from auth.token_blacklist import token_blacklist
from auth.config import auth_config
from auth.models import TokenData


# OAuth2方案定义
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login",
    scopes={
        "read": "读取权限",
        "write": "写入权限",
        "admin": "管理权限",
    },
)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenData:
    """
    从请求中提取并验证当前用户
    这是认证依赖注入链的核心环节
    """
    # 1. 解码Token
    try:
        token_data = jwt_handler.extract_token_data(token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. 检查Token类型
    payload = jwt_handler.decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的Token类型，需要Access Token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. 检查黑名单
    if auth_config.BLACKLIST_ENABLED and token_data.jti:
        if token_blacklist.is_blacklisted(token_data.jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token已被撤销",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return token_data


async def get_current_active_user(
    current_user: TokenData = Depends(get_current_user),
) -> TokenData:
    """验证当前用户是否活跃"""
    # 这里可以加入更多检查：用户是否被禁用、邮箱是否验证等
    # 此处仅作为示例，实际应查询数据库
    return current_user


def require_scope(required_scope: str):
    """
    创建一个要求特定scope的依赖项
    用法：Depends(require_scope("admin"))
    """
    async def scope_checker(current_user: TokenData = Depends(get_current_user)) -> TokenData:
        user_scopes = current_user.scope.split() if current_user.scope else []
        if required_scope not in user_scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要 '{required_scope}' 权限",
            )
        return current_user
    return scope_checker


# 可选认证（Token缺失不报错）
optional_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login",
    auto_error=False,
)


async def get_optional_current_user(
    token: str | None = Depends(optional_oauth2_scheme),
) -> TokenData | None:
    """可选认证 - Token缺失时返回None而非401"""
    if token is None:
        return None
    try:
        return await get_current_user(token)
    except HTTPException:
        return None
```

```python
# auth/service.py - 认证服务
from datetime import datetime
from typing import Optional
import uuid

from auth.jwt_handler import jwt_handler
from auth.password import password_handler
from auth.token_blacklist import token_blacklist
from auth.config import auth_config
from auth.models import (
    UserCreate,
    UserResponse,
    Token,
    TokenData,
)


# 模拟数据库（生产环境使用真实数据库）
_mock_users_db: dict[str, dict] = {}


class AuthService:
    """认证服务 - 业务逻辑层"""

    async def register(self, user_create: UserCreate) -> UserResponse:
        """用户注册"""
        # 1. 检查用户名是否已存在
        if user_create.username in _mock_users_db:
            raise ValueError("用户名已存在")

        # 2. 检查邮箱是否已注册
        for user in _mock_users_db.values():
            if user["email"] == user_create.email:
                raise ValueError("邮箱已注册")

        # 3. 哈希密码
        hashed_password = password_handler.hash(user_create.password)

        # 4. 创建用户记录
        user_id = str(uuid.uuid4())
        user_record = {
            "id": user_id,
            "username": user_create.username,
            "email": user_create.email,
            "hashed_password": hashed_password,
            "roles": ["viewer"],  # 默认角色
            "is_active": True,
            "created_at": datetime.utcnow(),
        }
        _mock_users_db[user_create.username] = user_record

        # 5. 返回用户信息（不含密码）
        return UserResponse(
            id=user_id,
            username=user_create.username,
            email=user_create.email,
            roles=["viewer"],
            is_active=True,
            created_at=user_record["created_at"],
        )

    async def authenticate(self, username: str, password: str) -> Token:
        """用户认证（登录）"""
        # 1. 查找用户
        user = _mock_users_db.get(username)
        if user is None:
            raise ValueError("用户名或密码错误")

        # 2. 验证密码
        if not password_handler.verify(password, user["hashed_password"]):
            raise ValueError("用户名或密码错误")

        # 3. 检查是否需要重新哈希
        if password_handler.needs_rehash(user["hashed_password"]):
            user["hashed_password"] = password_handler.hash(password)

        # 4. 检查用户状态
        if not user["is_active"]:
            raise ValueError("用户已被禁用")

        # 5. 签发Token对
        return jwt_handler.create_token_pair(
            user_id=user["id"],
            roles=user["roles"],
        )

    async def refresh_token(self, refresh_token_str: str) -> Token:
        """刷新Access Token"""
        # 1. 解码refresh token
        try:
            payload = jwt_handler.decode_token_without_verification(refresh_token_str)
        except ValueError as e:
            raise ValueError(f"无效的Refresh Token: {str(e)}")

        # 2. 验证Token类型
        if payload.get("type") != "refresh":
            raise ValueError("需要Refresh Token类型")

        # 3. 检查黑名单
        jti = payload.get("jti", "")
        if token_blacklist.is_blacklisted(jti):
            raise ValueError("Refresh Token已被撤销")

        # 4. 如果启用Token轮换，将旧refresh token加入黑名单
        if auth_config.REFRESH_TOKEN_ROTATION and jti:
            # 计算剩余有效期（秒）
            exp = datetime.utcfromtimestamp(payload["exp"])
            remaining = int((exp - datetime.utcnow()).total_seconds())
            if remaining > 0:
                token_blacklist.add(jti, exp)

        # 5. 签发新的Token对
        user_id = payload["sub"]
        # 从数据库获取用户角色（实际应查询数据库）
        roles = []
        for user in _mock_users_db.values():
            if user["id"] == user_id:
                roles = user["roles"]
                break

        return jwt_handler.create_token_pair(user_id=user_id, roles=roles)

    async def logout(self, token_data: TokenData) -> None:
        """用户登出 - 将Token加入黑名单"""
        if token_data.jti:
            # Access Token的过期时间
            token_blacklist.add(token_data.jti, datetime.utcnow() + auth_config.ACCESS_TOKEN_EXPIRE)


# 全局认证服务实例
auth_service = AuthService()
```

```python
# auth/router.py - 认证路由
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from auth.models import UserCreate, UserResponse, Token, TokenData
from auth.dependencies import get_current_user, get_current_active_user
from auth.service import auth_service


router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_create: UserCreate):
    """用户注册"""
    try:
        return await auth_service.register(user_create)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    用户登录（OAuth2密码授权）
    请求体格式：application/x-www-form-urlencoded
    字段：username, password, scope（可选）
    """
    try:
        token = await auth_service.authenticate(form_data.username, form_data.password)
        return token
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/refresh", response_model=Token)
async def refresh_token(refresh_token: str):
    """刷新Access Token"""
    try:
        return await auth_service.refresh_token(refresh_token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/logout")
async def logout(current_user: TokenData = Depends(get_current_user)):
    """用户登出"""
    await auth_service.logout(current_user)
    return {"message": "已成功登出"}


@router.get("/me", response_model=TokenData)
async def read_users_me(current_user: TokenData = Depends(get_current_active_user)):
    """获取当前用户信息"""
    return current_user
```

```python
# main.py - 主应用
from fastapi import FastAPI
from auth.router import router as auth_router

app = FastAPI(
    title="JWT认证示例",
    description="完整的JWT认证系统示例",
    version="1.0.0",
)

app.include_router(auth_router)


@app.get("/")
async def root():
    return {"message": "JWT认证系统示例 - 访问 /docs 查看API文档"}


@app.get("/api/protected")
async def protected_route():
    """公开路由 - 不需要认证"""
    return {"message": "这是公开数据"}


# 启动命令：uvicorn main:app --reload
# 测试流程：
# 1. POST /auth/register  - 注册用户
# 2. POST /auth/login     - 登录获取Token
# 3. GET /auth/me         - 使用Token访问受保护路由
# 4. POST /auth/refresh   - 刷新Token
# 5. POST /auth/logout    - 登出（Token加入黑名单）
```

### 14.4.2 OAuth2PasswordBearer与Swagger UI集成测试

```python
# test_swagger_integration.py - 使用httpx测试
import httpx
import asyncio

BASE_URL = "http://localhost:8000"


async def test_full_auth_flow():
    """测试完整的认证流程"""
    async with httpx.AsyncClient(base_url=BASE_URL) as client:

        # 1. 注册
        register_resp = await client.post(
            "/auth/register",
            json={
                "username": "testuser",
                "email": "test@example.com",
                "password": "securePassword123",
            },
        )
        assert register_resp.status_code == 201
        print(f"注册成功: {register_resp.json()}")

        # 2. 登录（OAuth2密码授权格式）
        login_resp = await client.post(
            "/auth/login",
            data={  # 注意：OAuth2使用form-data，不是JSON
                "username": "testuser",
                "password": "securePassword123",
            },
        )
        assert login_resp.status_code == 200
        tokens = login_resp.json()
        print(f"登录成功: access_token={tokens['access_token'][:20]}...")

        # 3. 使用Access Token访问受保护路由
        me_resp = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        assert me_resp.status_code == 200
        print(f"用户信息: {me_resp.json()}")

        # 4. 刷新Token
        refresh_resp = await client.post(
            "/auth/refresh",
            params={"refresh_token": tokens["refresh_token"]},
        )
        assert refresh_resp.status_code == 200
        new_tokens = refresh_resp.json()
        print(f"刷新成功: 新access_token={new_tokens['access_token'][:20]}...")

        # 5. 登出
        logout_resp = await client.post(
            "/auth/logout",
            headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
        )
        assert logout_resp.status_code == 200
        print(f"登出: {logout_resp.json()}")

        # 6. 验证旧Token已被黑名单
        me_resp2 = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
        )
        assert me_resp2.status_code == 401
        print("已登出Token正确返回401")


if __name__ == "__main__":
    asyncio.run(test_full_auth_flow())
```

## 14.5 常见陷阱与最佳实践

### 14.5.1 JWT密钥管理

**陷阱：硬编码密钥或使用弱密钥**

```python
# 错误：硬编码密钥
SECRET_KEY = "my-secret-key"  # 极度危险！

# 错误：弱密钥
SECRET_KEY = "123456"  # 可被暴力破解

# 正确：从环境变量读取，启动时验证
import os
import sys

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    print("ERROR: JWT_SECRET_KEY环境变量未设置")
    sys.exit(1)
if len(SECRET_KEY) < 32:
    print("ERROR: JWT_SECRET_KEY长度不足，至少32字符")
    sys.exit(1)
```

**最佳实践：密钥轮换策略**

```python
# 支持多密钥验证（密钥轮换期间旧密钥仍可验证）
from jose import jwt

class MultiKeyJWTHandler:
    """
    多密钥JWT处理器
    支持密钥轮换：用新密钥签发，用密钥列表验证
    """

    def __init__(self, current_key_id: str, keys: dict[str, str], algorithm: str = "HS256"):
        self._current_key_id = current_key_id
        self._keys = keys  # { key_id: secret_key }
        self._algorithm = algorithm

    def encode(self, payload: dict) -> str:
        """使用当前密钥签发Token"""
        payload["kid"] = self._current_key_id  # 在Header中嵌入Key ID
        return jwt.encode(
            payload,
            self._keys[self._current_key_id],
            algorithm=self._algorithm,
            headers={"kid": self._current_key_id},
        )

    def decode(self, token: str) -> dict:
        """根据Token中的kid选择对应密钥验证"""
        # 先解码Header获取kid
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        if kid not in self._keys:
            raise ValueError(f"未知的密钥ID: {kid}")

        return jwt.decode(
            token,
            self._keys[kid],
            algorithms=[self._algorithm],
        )
```

**RSA非对称密钥方案**（适用于微服务架构）：

```python
# 使用RSA密钥对：私钥签发，公钥验证
# 只有认证服务持有私钥，其他服务只需公钥即可验证Token
from cryptography.hazmat.primitives import serialization

# 加载私钥（仅认证服务使用）
with open("private_key.pem", "rb") as f:
    private_key = serialization.load_pem_private_key(f.read(), password=None)

# 加载公钥（所有验证服务使用）
with open("public_key.pem", "rb") as f:
    public_key = serialization.load_pem_public_key(f.read())

# 签发
token = jwt.encode(payload, private_key, algorithm="RS256")

# 验证
payload = jwt.decode(token, public_key, algorithms=["RS256"])
```

### 14.5.2 Token过期策略

**陷阱：Access Token过期时间过长**

```python
# 错误：Access Token有效期7天
ACCESS_TOKEN_EXPIRE = timedelta(days=7)  # Token泄露后7天内有效

# 正确：Access Token短期有效，配合Refresh Token
ACCESS_TOKEN_EXPIRE = timedelta(minutes=15)    # 15分钟
REFRESH_TOKEN_EXPIRE = timedelta(days=7)       # 7天
```

**最佳实践：分层过期策略**

```python
class TokenExpiryPolicy:
    """分层Token过期策略"""

    # Access Token: 短期有效
    ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)

    # Refresh Token: 中期有效
    REFRESH_TOKEN_LIFETIME = timedelta(days=7)

    # 记住登录状态: 长期有效
    REMEMBER_ME_LIFETIME = timedelta(days=30)

    # 绝对过期: 即使刷新也不能超过此时间
    ABSOLUTE_EXPIRY = timedelta(days=90)

    @classmethod
    def get_refresh_expiry(cls, remember_me: bool = False) -> timedelta:
        """根据是否'记住我'调整Refresh Token有效期"""
        return cls.REMEMBER_ME_LIFETIME if remember_me else cls.REFRESH_TOKEN_LIFETIME

    @classmethod
    def is_absolutely_expired(cls, iat: datetime) -> bool:
        """检查是否绝对过期（防止无限刷新）"""
        return datetime.utcnow() - iat > cls.ABSOLUTE_EXPIRY
```

**Refresh Token轮换安全**：

```python
# Refresh Token轮换：每次使用refresh token后，旧token立即失效
# 这意味着如果攻击者窃取了refresh token并使用，
# 合法用户下次使用旧token时会失败，从而发现泄露

async def rotate_refresh_token(self, old_jti: str, user_id: str) -> Token:
    """轮换Refresh Token"""
    # 1. 将旧refresh token加入黑名单
    token_blacklist.add(old_jti, datetime.utcnow() + self.REFRESH_TOKEN_EXPIRE)

    # 2. 签发新的token对
    return jwt_handler.create_token_pair(user_id)

# 检测Token泄露：如果已黑名单的refresh token被尝试使用
# 说明可能存在Token泄露，建议强制所有会话登出
```

### 14.5.3 密码哈希性能

**陷阱：同步哈希操作阻塞事件循环**

```python
# 错误：bcrypt验证直接在async函数中调用（阻塞事件循环）
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # password_handler.verify 是CPU密集操作（~200ms）
    # 直接调用会阻塞整个事件循环！
    is_valid = password_handler.verify(form_data.password, user.hashed_password)
```

```python
# 正确：使用run_in_executor将CPU密集操作放到线程池
import asyncio
from concurrent.futures import ThreadPoolExecutor

_password_executor = ThreadPoolExecutor(max_workers=4)


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    """异步密码验证 - 不阻塞事件循环"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _password_executor,
        password_handler.verify,
        plain_password,
        hashed_password,
    )


async def hash_password_async(password: str) -> str:
    """异步密码哈希 - 不阻塞事件循环"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _password_executor,
        password_handler.hash,
        password,
    )
```

**陷阱：过高的cost factor**

```python
# 错误：cost=20会导致单次哈希~3分钟
pwd_context = CryptContext(schemes=["bcrypt"], bcrypt__rounds=20)

# 正确：根据硬件选择合适的cost
import time

def benchmark_bcrypt():
    """基准测试：找到合适的cost值"""
    from passlib.hash import bcrypt as bcrypt_hash

    for rounds in range(10, 18):
        start = time.perf_counter()
        bcrypt_hash.using(rounds=rounds).hash("test-password")
        elapsed = time.perf_counter() - start
        print(f"rounds={rounds}: {elapsed*1000:.1f}ms")

# 目标：200-500ms延迟（在用户体验和安全之间平衡）
# 典型结果（现代服务器）：
# rounds=10: ~100ms
# rounds=12: ~200ms  ← 推荐
# rounds=14: ~800ms
# rounds=16: ~3000ms
```

### 14.5.4 刷新Token安全

**陷阱：Refresh Token存储在不安全的位置**

```python
# 错误：将refresh token存储在localStorage
# localStorage对JavaScript可见，XSS攻击可窃取
# 前端代码（错误示例）：
# localStorage.setItem("refresh_token", token);  // 不安全！

# 正确：将refresh token存储在HttpOnly Cookie
from fastapi import Response

@router.post("/login")
async def login(response: Response, form_data: OAuth2PasswordRequestForm = Depends()):
    tokens = await auth_service.authenticate(form_data.username, form_data.password)

    # Access Token通过响应体返回（前端存储在内存中）
    # Refresh Token通过HttpOnly Cookie设置（前端JavaScript无法访问）
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        httponly=True,       # JavaScript不可访问
        secure=True,         # 仅HTTPS传输
        samesite="strict",   # 防止CSRF
        max_age=7 * 24 * 3600,  # 7天
        path="/auth/refresh",    # 仅在刷新请求时发送
    )

    return {"access_token": tokens.access_token, "token_type": "bearer"}
```

**陷阱：Refresh Token无使用次数限制**

```python
# 错误：Refresh Token可无限使用
# 如果攻击者窃取了refresh token，可以无限期获取新access token

# 正确：限制Refresh Token使用次数 + 泄露检测
class SecureRefreshTokenManager:
    """安全的Refresh Token管理器"""

    def __init__(self):
        self._usage_count: dict[str, int] = {}  # jti -> 使用次数
        self._max_usage = 1  # 每个refresh token只能使用一次（轮换模式）

    async def use_refresh_token(self, jti: str) -> None:
        """使用refresh token，检查是否超过最大使用次数"""
        count = self._usage_count.get(jti, 0) + 1
        self._usage_count[jti] = count

        if count > self._max_usage:
            # 超过最大使用次数 -> 可能的Token泄露！
            # 安全措施：撤销该用户所有refresh token
            await self._revoke_all_user_tokens(jti)
            raise ValueError(
                "Refresh Token重用检测：可能存在安全威胁，"
                "所有会话已撤销，请重新登录"
            )

    async def _revoke_all_user_tokens(self, compromised_jti: str) -> None:
        """撤销所有相关Token（检测到泄露时）"""
        # 1. 从数据库查询该用户的所有活跃Token
        # 2. 全部加入黑名单
        # 3. 通知用户（邮件/SMS）
        # 4. 记录安全事件日志
        pass
```

**陷阱：JWT作为session使用**

```python
# 错误：将大量业务数据放入JWT，将其当作session
payload = {
    "sub": "user123",
    "cart_items": [...],       # 50个商品
    "preferences": {...},      # 大量配置
    "permissions": [...],      # 所有权限
}
# 结果：Token体积巨大（>8KB），每次请求都要传输

# 正确：JWT只携带最小必要信息，详细数据从数据库获取
payload = {
    "sub": "user123",     # 用户ID
    "exp": 1701234567,    # 过期时间
    "jti": "unique-id",  # 唯一标识
}
# Token体积约200字节，详细数据通过user_id从数据库查询
```

**最佳实践总结**：

1. **密钥管理**：从环境变量读取、支持轮换、使用非对称密钥（微服务）
2. **Token过期**：Access Token短期（15分钟）、Refresh Token中期（7天）、绝对过期上限（90天）
3. **密码哈希**：bcrypt + 合适的cost（12-14）、异步执行避免阻塞、定期rehash
4. **Refresh Token**：HttpOnly Cookie存储、Token轮换、重用检测、使用次数限制
5. **JWT体积**：只携带必要声明、详细数据查数据库、避免将JWT当作session
6. **安全防御**：算法白名单（`algorithms=["HS256"]`）、验证audience和issuer、使用jti防重放