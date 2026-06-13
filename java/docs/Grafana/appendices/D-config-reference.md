# 附录 D：Grafana 核心配置参数与安全加固 Checklist

## grafana.ini 速查

### 服务器配置

```ini
[server]
# HTTP 监听地址和端口
http_addr = 0.0.0.0
http_port = 3000

# 外部访问 URL（用于回调、告警链接等）
root_url = https://grafana.example.com

# 域名
domain = grafana.example.com

# 启用 HTTPS
protocol = http|https|socket
cert_file = /etc/grafana/grafana.crt
cert_key = /etc/grafana/grafana.key

# 静态文件缓存
static_root_path = public
enable_gzip = true
```

### 数据库配置

```ini
[database]
# 类型：sqlite3 | mysql | postgres
type = sqlite3
host = 127.0.0.1:3306
name = grafana
user = root
password = ${DB_PASSWORD}

# 连接池
max_open_conn = 100
max_idle_conn = 50
conn_max_lifetime = 14400

# 慢查询日志
log_queries = false
```

### Session 配置

```ini
[session]
# 存储方式：file | redis | memcache | postgres | mysql
provider = file
provider_config = sessions
cookie_name = grafana_session
cookie_secure = true
cookie_samesite = strict
session_life_time = 86400
```

### 安全配置

```ini
[security]
# admin 用户密码
admin_user = admin
admin_password = ${ADMIN_PASSWORD}

# 密钥（用于加密敏感数据）
secret_key = ${SECRET_KEY}

# 禁用 Gravatar
disable_gravatar = true

# Cookie 安全
cookie_secure = true
cookie_samesite = strict

# 内容安全策略
content_security_policy = true
content_security_policy_template = """
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  object-src 'none';
"""

# 隐藏版本号
hide_version = true

# 登录限制
login_maximum_inactive_lifetime_days = 7
login_maximum_lifetime_days = 30
```

### 数据源代理配置

```ini
[dataproxy]
# 请求超时
timeout = 30

# 连接池
dial_timeout = 10
keep_alive_seconds = 30
tls_handshake_timeout = 10
max_idle_connections = 100
idle_conn_timeout = 90

# 响应大小限制
response_limit = 0

# 日志
logging = false
```

### 查询配置

```ini
[query]
# 每个查询的最大数据点数
max_data_points = 500000

# 每个 Dashboard 的最大并发查询数
max_concurrent_queries = 10
```

### 渲染配置

```ini
[rendering]
# 渲染服务 URL
server_url = http://renderer:8081/render
callback_url = http://grafana:3000/

# 并发限制
concurrent_render_request_limit = 5

# 超时
renderer_lifetime = 600
```

### 告警配置

```ini
[unified_alerting]
enabled = true

# 告警高可用
ha_peers = grafana-1:9094,grafana-2:9094
ha_listen_address = 0.0.0.0:9094
ha_advertise_address = {{ $node }}:9094

# 执行超时
rule_evaluation_timeout = 30s
max_rule_evaluation_results = 10000
```

### 日志配置

```ini
[log]
mode = console
level = info

[log.console]
level = info
format = json

[log.file]
level = warn
format = text
```

### 认证配置

```ini
[auth]
# 登录限制
login_maximum_inactive_lifetime_days = 7
login_maximum_lifetime_days = 30
token_rotation_interval_minutes = 10
disable_login_form = false
oauth_auto_login = false
sigv4_auth_enabled = false

[auth.basic]
enabled = true

[auth.anonymous]
enabled = false

[auth.generic_oauth]
enabled = false

[auth.ldap]
enabled = false
config_file = /etc/grafana/ldap.toml
```

## 环境变量覆盖

所有 `grafana.ini` 配置都可以通过环境变量覆盖：

```
GF_<SECTION>_<KEY> = value

示例:
GF_SERVER_HTTP_PORT = 3000
GF_DATABASE_TYPE = mysql
GF_SECURITY_ADMIN_PASSWORD = mypassword
GF_INSTALL_PLUGINS = grafana-polystat-panel
```

## 安全加固 Checklist

### 网络层

- [ ] 启用 HTTPS（配置证书）
- [ ] 配置防火墙限制 Grafana 访问来源
- [ ] 使用反向代理（Nginx）隐藏 Grafana 版本信息
- [ ] 禁用不必要的端口
- [ ] 启用 HTTP/2

### 认证层

- [ ] 修改默认 admin 密码
- [ ] 配置强密码策略
- [ ] 启用 SSO（OAuth/LDAP/SAML）
- [ ] 禁用匿名访问
- [ ] 配置登录失败锁定
- [ ] 设置 Session 过期时间

### 数据层

- [ ] 数据库连接使用密码（非默认值）
- [ ] 敏感信息使用环境变量注入
- [ ] 限制 API Key 权限
- [ ] 配置数据源访问白名单
- [ ] 加密存储敏感数据（secret_key）

### 应用层

- [ ] 启用内容安全策略（CSP）
- [ ] 配置 Cookie 安全属性
- [ ] 禁用 Gravatar
- [ ] 隐藏版本号
- [ ] 限制 Dashboard 导入导出的权限
- [ ] 配置审计日志

### 运维层

- [ ] 定期更新 Grafana 版本
- [ ] 备份 grafana.db 和 provisioning 配置
- [ ] 监控 Grafana 自身运行状态
- [ ] 配置资源限制（CPU/内存）
- [ ] 设置日志轮转

### 安全配置模板

```ini
# 生产环境安全配置
[server]
enable_gzip = true
enforce_domain = true

[security]
cookie_secure = true
cookie_samesite = strict
disable_gravatar = true
content_security_policy = true
hide_version = true
login_maximum_inactive_lifetime_days = 7
login_maximum_lifetime_days = 30

[auth]
disable_login_form = false
oauth_auto_login = false

[auth.anonymous]
enabled = false

[plugins]
allow_loading_unsigned_plugins = ""
```
