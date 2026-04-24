# 第33章 Nginx反向代理与负载均衡

## 33.1 概念与语法

### 33.1.1 反向代理的核心概念

反向代理（Reverse Proxy）位于客户端与后端服务之间，接收客户端请求并转发给后端服务器，再将后端响应返回给客户端。与正向代理（代理客户端）不同，反向代理代理的是服务端，客户端无需知道后端服务器的真实地址。

```
客户端 ──► Nginx (反向代理) ──► FastAPI Worker 1
              │ ──────────────► FastAPI Worker 2
              │ ──────────────► FastAPI Worker 3
```

反向代理为 FastAPI 应用提供的关键能力：

- **负载均衡**：将请求分发到多个 Worker 或实例
- **SSL 终止**：在 Nginx 层处理 TLS，后端无需关心证书
- **静态文件服务**：Nginx 直接提供静态资源，减轻应用服务器负担
- **请求缓冲**：缓冲客户端请求体，保护后端慢速攻击
- **压缩**：gzip 压缩响应体，减少传输体积
- **安全隔离**：后端服务器不直接暴露在公网

### 33.1.2 Nginx 配置文件结构

Nginx 配置采用嵌套的指令块结构，核心组织单元是上下文（context）：

```nginx
# 全局上下文
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

# events 上下文 - 连接处理配置
events {
    worker_connections 1024;
    multi_accept on;
    use epoll;
}

# http 上下文 - HTTP 协议配置
http {
    include       mime.types;
    default_type  application/octet-stream;

    # upstream 上下文 - 后端服务器组定义
    upstream fastapi_backend {
        server 127.0.0.1:8001;
        server 127.0.0.1:8002;
        server 127.0.0.1:8003;
    }

    # server 上下文 - 虚拟主机定义
    server {
        listen 80;
        server_name api.example.com;

        # location 上下文 - 请求路由规则
        location / {
            proxy_pass http://fastapi_backend;
        }
    }
}
```

### 33.1.3 upstream 指令详解

`upstream` 定义后端服务器组，是负载均衡的核心配置单元。

```nginx
upstream <name> {
    # 服务器定义
    server address [parameters];
    server address [parameters];

    # 负载均衡策略
    # (1) round-robin (默认): 轮询
    # (2) least_conn: 最少连接数
    # (3) ip_hash: 基于 IP 的会话保持
    # (4) hash: 基于自定义键的哈希
    # (5) random: 随机选择

    # 健康检查（开源版仅支持被动检查）
    # 主动健康检查需要 Nginx Plus 或第三方模块
}
```

**server 参数**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `weight=N` | 1 | 权重，数值越大分配越多请求 |
| `max_fails=N` | 1 | 最大失败次数，超过后标记为不可用 |
| `fail_timeout=T` | 10s | 失败超时，标记不可用后等待此时间重新尝试 |
| `backup` | - | 备份服务器，仅在主服务器不可用时启用 |
| `down` | - | 标记服务器永久不可用 |
| `max_conns=N` | 0 | 最大并发连接数（0 表示不限） |

### 33.1.4 proxy_pass 指令详解

`proxy_pass` 将请求转发到指定的后端地址或 upstream 组。

```nginx
# 转发到 upstream 组
proxy_pass http://fastapi_backend;

# 转发到具体地址
proxy_pass http://127.0.0.1:8000;

# 带 URI 的转发（替换 location 匹配部分）
location /api/ {
    proxy_pass http://backend/v1/;  # /api/users → /v1/users
}

# 不带 URI 的转发（保留原始路径）
location /api/ {
    proxy_pass http://backend;  # /api/users → /api/users
}
```

**关键区别**：`proxy_pass` 后是否带 URI 决定了路径处理方式。带 URI 时，location 匹配的部分被替换；不带 URI 时，原始路径完整传递。

### 33.1.5 负载均衡策略

Nginx 提供五种内置负载均衡策略：

```nginx
# 1. 轮询（默认，无需额外指令）
upstream backend {
    server 10.0.0.1:8000;
    server 10.0.0.2:8000;
}

# 2. 加权轮询
upstream backend {
    server 10.0.0.1:8000 weight=3;  # 3/4 的请求
    server 10.0.0.2:8000 weight=1;  # 1/4 的请求
}

# 3. 最少连接
upstream backend {
    least_conn;
    server 10.0.0.1:8000;
    server 10.0.0.2:8000;
}

# 4. IP 哈希（会话保持）
upstream backend {
    ip_hash;
    server 10.0.0.1:8000;
    server 10.0.0.2:8000;
}

# 5. 一致性哈希
upstream backend {
    hash $request_uri consistent;
    server 10.0.0.1:8000;
    server 10.0.0.2:8000;
}
```

### 33.1.6 WebSocket 代理配置

FastAPI 内建 WebSocket 支持，Nginx 需要特殊配置来正确代理 WebSocket 连接：

```nginx
location /ws/ {
    proxy_pass http://fastapi_backend;

    # WebSocket 必需头
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # 超时配置（WebSocket 长连接）
    proxy_read_timeout 3600s;   # 读取超时，1小时
    proxy_send_timeout 3600s;   # 发送超时，1小时
}
```

WebSocket 升级握手流程：

```
1. 客户端发送: GET /ws/ HTTP/1.1
   Headers: Upgrade: websocket, Connection: Upgrade, Sec-WebSocket-Key: xxx

2. Nginx 转发到后端，透传 Upgrade 头

3. 后端响应: 101 Switching Protocols
   Headers: Upgrade: websocket, Connection: Upgrade, Sec-WebSocket-Accept: yyy

4. 连接升级为 WebSocket，Nginx 透明转发后续帧
```

### 33.1.7 SSL/TLS 配置语法

```nginx
server {
    listen 443 ssl http2;          # 启用 SSL 和 HTTP/2
    server_name api.example.com;

    # 证书配置
    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # TLS 协议版本
    ssl_protocols TLSv1.2 TLSv1.3;

    # 密码套件
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;

    # 会话缓存
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 valid=300s;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;
}
```

---

## 33.2 原理与机制

### 33.2.1 Nginx 事件驱动架构

Nginx 采用事件驱动（event-driven）架构，核心是 **epoll**（Linux）/ **kqueue**（macOS）多路复用机制。每个 Worker 进程运行一个事件循环，处理数千个并发连接。

```
Master Process
    │
    ├── Worker 1 (epoll event loop)
    │     ├── 连接1: 读取请求
    │     ├── 连接2: 等待后端响应
    │     └── 连接3: 写入响应
    ├── Worker 2 (epoll event loop)
    │     ├── 连接4: ...
    │     └── 连接5: ...
    └── Worker N ...
```

**为什么 Nginx 适合做反向代理**：异步非阻塞 I/O 使得单个 Worker 能同时处理多个后端连接。当一个后端请求在等待时，Worker 不会阻塞，而是切换到处理其他连接。这与传统 Apache 的 thread-per-connection 模型形成鲜明对比。

### 33.2.2 负载均衡算法的内部实现

**轮询（Round Robin）**：Nginx 维护一个加权轮询状态机。每个 server 有一个 `current_weight` 和 `effective_weight`。每次选择时：

1. 将所有 server 的 `current_weight` 加上 `effective_weight`
2. 选择 `current_weight` 最大的 server
3. 被选中的 server 的 `current_weight` 减去总权重

```
3 台服务器，权重分别为 5, 1, 1 (总权重 7)
请求1: cw=[5,1,1] → 选A, cw=[5-7,1,1]=[-2,1,1]
请求2: cw=[3,2,2] → 选A, cw=[3-7,2,2]=[-4,2,2]
请求3: cw=[1,3,3] → 选B, cw=[1,3-7,3]=[1,-4,3]
请求4: cw=[6,-3,4] → 选A, cw=[6-7,-3,4]=[-1,-3,4]
请求5: cw=[4,-2,5] → 选C, cw=[4,-2,5-7]=[4,-2,-2]
...
```

**最少连接（least_conn）**：在轮询基础上，优先选择当前活跃连接数最少的服务器。Nginx 为每个 upstream server 维护 `conns` 计数器。

**IP 哈希（ip_hash）**：对客户端 IP 地址执行 CRC32 哈希，然后对服务器数量取模。同一 IP 的请求始终路由到同一服务器（除非服务器数量变化）。注意：当 upstream 组中添加或移除服务器时，大部分 IP 的映射关系会改变。

### 33.2.3 代理缓冲机制

Nginx 代理涉及两种缓冲：**请求缓冲**（proxy_request_buffering）和**响应缓冲**（proxy_buffering）。

**响应缓冲**（默认开启）：

```
客户端 ←──[慢速]──► Nginx ──[快速]──► 后端
                     │
                     └── 缓冲区: 先从后端读取完整响应，
                         再慢慢发送给客户端
```

Nginx 先从后端读取响应到缓冲区，然后异步发送给客户端。这释放了后端连接，使 Worker 能更快处理下一个请求。

**请求缓冲**（默认开启）：

```
客户端 ──[慢速上传]──► Nginx ──[完整请求体]──► 后端
```

Nginx 先完整读取客户端请求体，再一次性发送给后端。这防止慢速客户端长时间占用后端连接。

```nginx
# 关闭响应缓冲（适用于 Server-Sent Events / 流式响应）
proxy_buffering off;
proxy_cache off;

# 请求缓冲大小
client_body_buffer_size 16k;     # 请求体缓冲区大小
client_max_body_size 10m;        # 请求体最大大小

# 响应缓冲配置
proxy_buffer_size 4k;            # 响应头缓冲区
proxy_buffers 8 4k;              # 响应体缓冲区（8个，每个4k）
proxy_busy_buffers_size 8k;      # 忙时缓冲区大小
```

### 33.2.4 WebSocket 代理的内部机制

WebSocket 连接的生命周期在 Nginx 层的处理：

1. **升级阶段**：客户端发送 HTTP 请求，携带 `Upgrade: websocket` 头。Nginx 通过 `proxy_set_header Upgrade` 和 `proxy_set_header Connection "upgrade"` 将升级请求透传给后端。

2. **数据转发阶段**：升级成功后（HTTP 101 响应），Nginx 进入双向透传模式。此时不再解析 HTTP 协议，而是在两个 socket 之间直接拷贝数据帧。

3. **超时管理**：`proxy_read_timeout` 控制从后端读取数据的超时。WebSocket 长连接必须设置足够大的值，否则空闲连接会被 Nginx 关闭。

```
客户端 ──WS Handshake──► Nginx ──WS Handshake──► FastAPI
  │                          │                        │
  │◄──101 Switching──────────│◄──101 Switching─────── │
  │                          │                        │
  │──WS Frame──►             │ ──WS Frame──►          │
  │              ◄──WS Frame─│            ◄──WS Frame─│
```

### 33.2.5 SSL 终止的性能影响

SSL/TLS 握手是 CPU 密集型操作。在 Nginx 中执行 SSL 终止后，后端通信使用明文 HTTP，减少后端 CPU 开销。

**TLS 1.2 握手流程**（2-RTT）：

```
客户端                        Nginx
  │──ClientHello──────────────►│
  │◄──ServerHello + Cert───────│
  │──Key Exchange + Finished──►│
  │◄──Finished──────────────── │
  │                            │
  │═══加密通信══════════════════│
```

**TLS 1.3 优化**（1-RTT）：

```
客户端                        Nginx
  │──ClientHello + Key Share──►│
  │◄──ServerHello + Key Share──│
  │    + Finished              │
  │──Finished─────────────────►│
  │                            │
  │═══加密通信══════════════════│
```

Nginx 的 `ssl_session_cache` 通过缓存 TLS 会话参数，使后续连接可跳过完整握手（0-RTT 恢复），大幅降低 SSL 终止的性能开销。

### 33.2.6 静态文件服务的 sendfile 机制

Nginx 通过 `sendfile` 系统调用实现零拷贝（zero-copy）文件传输：

```
传统方式:
磁盘 → 内核缓冲区 → 用户空间 → Socket 缓冲区 → 网卡

sendfile 方式:
磁盘 → 内核缓冲区 → Socket 缓冲区 → 网卡
       (跳过用户空间拷贝)
```

```nginx
# 启用零拷贝
sendfile on;

# 配合 tcp_nopush，减少网络包数量
tcp_nopush on;

# 配合 tcp_nodelay，减少小包延迟
tcp_nodelay on;
```

这使得 Nginx 提供静态文件的性能远超 FastAPI（后者需要先读取文件到用户空间再写入 socket）。

---

## 33.3 使用场景

### 33.3.1 多 Worker 负载均衡

单机部署多个 Uvicorn Worker，通过 Nginx 分发请求：

```bash
# 启动 3 个 Uvicorn Worker（不同端口）
uvicorn app.main:app --host 127.0.0.1 --port 8001 &
uvicorn app.main:app --host 127.0.0.1 --port 8002 &
uvicorn app.main:app --host 127.0.0.1 --port 8003 &
```

### 33.3.2 微服务 API 网关

Nginx 作为 API 网关，根据路径前缀路由到不同微服务：

```nginx
location /users/    { proxy_pass http://user-service:8000; }
location /orders/  { proxy_pass http://order-service:8000; }
location /payment/ { proxy_pass http://payment-service:8000; }
```

### 33.3.3 静态资源 + API 分离

前端静态文件由 Nginx 直接提供，API 请求代理到 FastAPI：

```nginx
location /static/ { alias /var/www/static/; }
location /api/   { proxy_pass http://fastapi_backend; }
```

### 33.3.4 SSL 终止与 HTTP/2 推送

生产环境在 Nginx 层终止 SSL，后端仅用 HTTP：

```nginx
server {
    listen 443 ssl http2;
    # SSL 配置...
    location / {
        proxy_pass http://fastapi_backend;  # 后端使用 HTTP
    }
}
```

### 33.3.5 WebSocket 实时通信

FastAPI WebSocket 应用（如聊天、实时通知）通过 Nginx 代理：

```nginx
location /ws/ {
    proxy_pass http://fastapi_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### 33.3.6 灰度发布与流量切分

通过 Nginx 的 `split_clients` 模块实现灰度发布：

```nginx
split_clients "${remote_addr}" $variant {
    10%   "canary";
    90%   "stable";
}

upstream stable  { server 10.0.0.1:8000; }
upstream canary  { server 10.0.0.2:8000; }

server {
    location / {
        if ($variant = "canary") {
            proxy_pass http://canary;
            break;
        }
        proxy_pass http://stable;
    }
}
```

---

## 33.4 示例代码

### 33.4.1 生产级 Nginx 配置

```nginx
# /etc/nginx/nginx.conf - 全局配置
user nginx;
worker_processes auto;              # 自动检测 CPU 核心数
worker_cpu_affinity auto;           # CPU 亲和性
worker_rlimit_nofile 65535;         # 文件描述符限制

error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 4096;         # 单 Worker 最大连接数
    multi_accept on;                # 一次接受所有新连接
    use epoll;                      # Linux 使用 epoll
}

http {
    # 基础配置
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # 日志格式（含请求时间和上游响应时间）
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    'rt=$request_time uct=$upstream_connect_time '
                    'uht=$upstream_header_time urt=$upstream_response_time';

    access_log /var/log/nginx/access.log main;

    # 性能优化
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # 客户端请求限制
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    client_max_body_size 10m;
    large_client_header_buffers 4 8k;
    client_body_timeout 12s;
    client_header_timeout 12s;
    send_timeout 10s;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 4;
    gzip_min_length 256;
    gzip_types
        application/json
        application/javascript
        text/css
        text/plain
        text/xml;

    # 包含其他配置
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

### 33.4.2 FastAPI 应用 upstream 配置

```nginx
# /etc/nginx/conf.d/fastapi-upstream.conf

# 定义后端服务器组
upstream fastapi_backend {
    # 最少连接策略（适合请求处理时间差异大的场景）
    least_conn;

    # 后端服务器
    server 127.0.0.1:8001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8002 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8003 max_fails=3 fail_timeout=30s;

    # 备份服务器（仅在主服务器不可用时启用）
    server 127.0.0.1:8004 backup;

    # 保持与后端的长连接
    keepalive 32;  # 每个 Worker 到后端保持 32 个空闲长连接
}
```

### 33.4.3 完整的反向代理 server 块

```nginx
# /etc/nginx/sites-available/fastapi-app

server {
    listen 80;
    server_name api.example.com;

    # HTTP 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    # ============================================
    # SSL 配置
    # ============================================
    ssl_certificate     /etc/nginx/ssl/api.example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/api.example.com.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # 安全头
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ============================================
    # API 代理配置
    # ============================================
    location / {
        proxy_pass http://fastapi_backend;

        # 透传客户端信息
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # 超时配置
        proxy_connect_timeout 5s;      # 连接后端超时
        proxy_send_timeout 30s;        # 发送请求到后端超时
        proxy_read_timeout 60s;        # 读取后端响应超时

        # 缓冲配置
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 16k;
        proxy_busy_buffers_size 32k;

        # 错误处理
        proxy_next_upstream error timeout http_502 http_503 http_504;
        proxy_next_upstream_timeout 10s;
        proxy_next_upstream_tries 2;

        # 重试限制
        proxy_intercept_errors off;
    }

    # ============================================
    # WebSocket 代理配置
    # ============================================
    location /ws/ {
        proxy_pass http://fastapi_backend;

        # WebSocket 升级必需
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 透传客户端信息
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 长连接超时
        proxy_connect_timeout 7s;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;

        # 禁用缓冲（WebSocket 是双向流）
        proxy_buffering off;
    }

    # ============================================
    # 静态文件服务
    # ============================================
    location /static/ {
        alias /var/www/api.example.com/static/;

        # 缓存控制
        expires 30d;
        add_header Cache-Control "public, immutable";

        # 安全头
        add_header X-Content-Type-Options "nosniff" always;

        # 禁止执行上传的脚本
        location /static/uploads/ {
            alias /var/www/api.example.com/uploads/;
            expires 7d;
            add_header Cache-Control "public";
            # 禁止执行 PHP/Python 等脚本
            location ~* /static/uploads/.*\.(php|py|pl|cgi)$ {
                deny all;
            }
        }
    }

    # ============================================
    # 健康检查端点（不代理，直接返回）
    # ============================================
    location /nginx-health {
        access_log off;
        return 200 "OK";
        add_header Content-Type text/plain;
    }

    # ============================================
    # 拒绝访问隐藏文件
    # ============================================
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

### 33.4.4 Docker 化 Nginx 部署

```dockerfile
# nginx/Dockerfile
FROM nginx:1.25-bookworm

# 删除默认配置
RUN rm /etc/nginx/conf.d/default.conf

# 复制自定义配置
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/
COPY sites-available/ /etc/nginx/sites-available/

# 创建软链接启用站点
RUN mkdir -p /etc/nginx/sites-enabled && \
    ln -s /etc/nginx/sites-available/fastapi-app /etc/nginx/sites-enabled/fastapi-app

# SSL 证书目录
RUN mkdir -p /etc/nginx/ssl

# 非 root 用户（Nginx 需要特权端口，master 以 root 启动）
# 但 worker 进程以 nginx 用户运行

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
```

对应的 docker-compose 编排：

```yaml
# docker-compose.yml（含 Nginx）
version: "3.9"

services:
  nginx:
    image: myapp-nginx:1.0.0
    container_name: myapp-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/sites-available:/etc/nginx/sites-available:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/logs:/var/log/nginx
      - static-files:/var/www/api.example.com/static:ro
    depends_on:
      app:
        condition: service_healthy
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost/nginx-health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: myapp-api
    restart: unless-stopped
    # 注意：不对宿主机暴露端口，仅通过 Nginx 访问
    expose:
      - "8000"
    environment:
      - ENV=production
      - DATABASE_URL=postgresql://appuser:secret@db:5432/appdb
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - backend

  db:
    image: postgres:16-bookworm
    container_name: myapp-db
    restart: unless-stopped
    environment:
      - POSTGRES_USER=appuser
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=appdb
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

volumes:
  db-data:
  static-files:

networks:
  backend:
    driver: bridge
```

### 33.4.5 FastAPI 应用配合反向代理

```python
# app/main.py - 配合 Nginx 反向代理的 FastAPI 应用
from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.responses import JSONResponse
import time
import logging

logger = logging.getLogger("api")

app = FastAPI(
    title="FastAPI behind Nginx",
    version="1.0.0",
    # 信任 Nginx 代理头
    root_path="/api",  # 如果 Nginx 使用 location /api/
)


# 获取真实 IP 的中间件
@app.middleware("http")
async def proxy_headers_middleware(request: Request, call_next):
    """
    从 Nginx 透传的 X-Forwarded-* 头中提取真实客户端信息
    """
    # X-Real-IP 由 Nginx 设置
    real_ip = request.headers.get("X-Real-IP", request.client.host)
    forwarded_proto = request.headers.get("X-Forwarded-Proto", "http")
    forwarded_for = request.headers.get("X-Forwarded-For", "")

    # 将信息附加到请求状态
    request.state.real_ip = real_ip
    request.state.forwarded_proto = forwarded_proto
    request.state.forwarded_for = forwarded_for

    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time

    # 记录请求日志（包含真实 IP）
    logger.info(
        f"method={request.method} path={request.url.path} "
        f"status={response.status_code} "
        f"real_ip={real_ip} "
        f"duration={duration:.3f}s "
        f"forwarded_proto={forwarded_proto}"
    )

    return response


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/client-info")
async def client_info(request: Request):
    """演示获取真实客户端信息"""
    return {
        "real_ip": request.state.real_ip,
        "forwarded_proto": request.state.forwarded_proto,
        "forwarded_for": request.state.forwarded_for,
        "host": request.headers.get("host"),
        "user_agent": request.headers.get("user-agent"),
    }


# WebSocket 端点
@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """WebSocket 端点 - 需要配合 Nginx WebSocket 代理"""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except Exception:
        pass


# SSE 端点（需要关闭 Nginx 缓冲）
from fastapi.responses import StreamingResponse
import asyncio

@app.get("/api/events")
async def server_sent_events():
    """Server-Sent Events - Nginx 需要设置 proxy_buffering off"""
    async def event_generator():
        for i in range(100):
            yield f"data: Event {i}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 告知 Nginx 不缓冲此响应
        }
    )
```

### 33.4.6 限流配置

```nginx
# /etc/nginx/conf.d/rate-limiting.conf

# 定义限流区域（基于客户端 IP）
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

# 定义连接数限制
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

server {
    listen 443 ssl http2;
    server_name api.example.com;

    # 全局连接限制（单 IP 最多 50 个并发连接）
    limit_conn conn_limit 50;

    # API 接口限流（30 请求/秒，突发允许 10 个）
    location /api/ {
        limit_req zone=api_limit burst=10 nodelay;
        limit_req_status 429;

        proxy_pass http://fastapi_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 认证接口限流（5 请求/分钟，防暴力破解）
    location /api/auth/ {
        limit_req zone=auth_limit burst=3 nodelay;
        limit_req_status 429;

        proxy_pass http://fastapi_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 自定义限流响应
    error_page 429 = @rate_limited;
    location @rate_limited {
        default_type application/json;
        return 429 '{"detail":"Rate limit exceeded. Please try again later."}';
    }
}
```

### 33.4.7 Nginx 配置验证与重载脚本

```bash
#!/bin/bash
# scripts/nginx-reload.sh

set -euo pipefail

echo "Validating Nginx configuration..."

# 测试配置语法
if ! nginx -t 2>&1; then
    echo "ERROR: Nginx configuration test failed!"
    exit 1
fi

echo "Configuration is valid."

# 优雅重载（不中断现有连接）
echo "Reloading Nginx..."
nginx -s reload

echo "Nginx reloaded successfully."

# 等待 Worker 启动
sleep 2

# 验证 Nginx 正在运行
if ! curl -sf http://localhost/nginx-health > /dev/null; then
    echo "ERROR: Nginx health check failed after reload!"
    exit 1
fi

echo "Nginx is healthy."
```

### 33.4.8 日志轮转配置

```text
# /etc/logrotate.d/nginx
/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 nginx adm
    sharedscripts
    prerotate
        if [ -d /etc/logrotate.d/httpd-prerotate ]; then \
            run-parts /etc/logrotate.d/httpd-prerotate; \
        fi
    endscript
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
    endscript
}
```

---

## 33.5 常见陷阱与最佳实践

### 33.5.1 陷阱：丢失客户端真实 IP

**问题**：默认 `proxy_set_header Host $proxy_host` 会将 Host 改为后端地址，且不传递客户端 IP。FastAPI 中 `request.client.host` 返回 Nginx 的 IP 而非客户端真实 IP。

**解决方案**：

```nginx
# 必须设置的代理头
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

### 33.5.2 陷阱：WebSocket 连接被 Nginx 断开

**问题**：默认 `proxy_read_timeout` 为 60s。如果 WebSocket 连接空闲超过 60s，Nginx 会主动关闭连接。

**解决方案**：

```nginx
# 根据业务场景设置合理超时
location /ws/ {
    proxy_read_timeout 3600s;   # 1小时
    proxy_send_timeout 3600s;
    # 或使用心跳机制保持连接活跃
}
```

### 33.5.3 陷阱：SSE 响应被缓冲

**问题**：Nginx 默认启用 `proxy_buffering on`，会将 SSE（Server-Sent Events）响应缓冲到完整后再发送，导致客户端无法实时接收事件。

**解决方案**：

```nginx
# 方案1：在 Nginx 中关闭特定 location 的缓冲
location /api/events {
    proxy_buffering off;
    proxy_cache off;
    proxy_pass http://fastapi_backend;
}

# 方案2：在 FastAPI 响应头中告知 Nginx
# X-Accel-Buffering: no
```

### 33.5.4 陷阱：upstream 连接耗尽

**问题**：当并发请求量大时，Nginx Worker 到后端的连接可能不够用。默认 `keepalive` 未设置，每次请求建立新的 TCP 连接。

**解决方案**：

```nginx
upstream fastapi_backend {
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
    keepalive 32;  # 每个 Worker 保持 32 个空闲长连接
}

server {
    location / {
        proxy_pass http://fastapi_backend;
        proxy_http_version 1.1;           # 长连接需要 HTTP/1.1
        proxy_set_header Connection "";   # 清除 Connection: close
    }
}
```

### 33.5.5 陷阱：502 Bad Gateway 频繁出现

**问题**：FastAPI Worker 处理慢请求时，Nginx 的 `proxy_read_timeout` 超时导致 502。

**解决方案**：

```nginx
# 调整超时以匹配业务最长请求时间
proxy_connect_timeout 5s;
proxy_read_timeout 120s;     # 匹配后端最长处理时间
proxy_send_timeout 30s;

# 启用上游故障转移
proxy_next_upstream error timeout http_502 http_503 http_504;
```

### 33.5.6 陷阱：大文件上传失败

**问题**：默认 `client_max_body_size` 为 1m，上传大文件会被 Nginx 拒绝（413 Request Entity Too Large）。

**解决方案**：

```nginx
# 全局设置
client_max_body_size 10m;

# 或针对特定路径
location /api/upload/ {
    client_max_body_size 100m;
    proxy_pass http://fastapi_backend;
}
```

### 33.5.7 陷阱：Nginx 与后端之间出现请求头重复

**问题**：Nginx 添加 `X-Forwarded-For` 时，如果请求本身已有此头，`proxy_add_x_forwarded_for` 会在后面追加。后端解析时可能出错。

**最佳实践**：

```python
# FastAPI 中正确解析 X-Forwarded-For
def get_client_ip(request: Request) -> str:
    """获取最左边的真实客户端 IP"""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        # X-Forwarded-For: client, proxy1, proxy2
        # 最左边是真实客户端 IP（假设信任 Nginx）
        return forwarded.split(",")[0].strip()
    return request.headers.get("X-Real-IP", request.client.host)
```

### 33.5.8 陷阱：proxy_pass 带 URI 导致路径错误

**问题**：

```nginx
location /api/ {
    # 带 URI 尾斜杠：/api/users → /v1/users（/api 被替换为 /v1）
    proxy_pass http://backend/v1/;
}

location /api/ {
    # 不带 URI：/api/users → /api/users（路径不变）
    proxy_pass http://backend;
}
```

误用会导致 404 或路由错误。确保理解 `proxy_pass` 后是否带 URI 的区别。

### 33.5.9 最佳实践清单

1. **始终透传客户端信息头**：`X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto`
2. **使用 `least_conn` 策略**：比默认轮询更适合 FastAPI 异步请求
3. **启用 upstream keepalive**：减少 TCP 连接建立开销
4. **区分 WebSocket 和普通 HTTP 的 location**：避免超时配置冲突
5. **关闭 SSE/流式响应的缓冲**：`proxy_buffering off` 或 `X-Accel-Buffering: no`
6. **配置 `proxy_next_upstream`**：实现后端故障自动转移
7. **启用 gzip 压缩**：JSON API 响应压缩率可达 70%+
8. **设置安全响应头**：HSTS、X-Content-Type-Options 等
9. **使用 `include` 拆分配置**：提高可维护性
10. **配置日志轮转**：防止日志文件占满磁盘
11. **配置限流**：防止单个客户端消耗所有资源
12. **验证配置后再重载**：`nginx -t && nginx -s reload`
13. **使用 `client_max_body_size` 限制上传大小**：防止大请求耗尽内存
14. **监控 upstream 响应时间**：在日志中记录 `upstream_response_time`
15. **使用 `split_clients` 实现灰度发布**：而非手动修改 upstream