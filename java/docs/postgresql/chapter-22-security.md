# 第22章 安全机制

## 22.1 SSL加密

```ini
# postgresql.conf
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
ssl_ca_file = 'root.crt'
```

```bash
# 生成自签名证书
openssl req -new -text -nodes -subj '/CN=localhost' -out server.req
openssl rsa -in privkey.pem -out server.key
openssl req -x509 -in server.req -text -key server.key -out server.crt
```

## 22.2 行级安全（RLS）

RLS允许在数据库层面实现"每行数据不同权限"：

```sql
-- 创建普通表
CREATE TABLE employee_data (
    id serial PRIMARY KEY,
    employee_name text,
    salary numeric(10,2),
    department text
);

-- 启用行级安全
ALTER TABLE employee_data ENABLE ROW LEVEL SECURITY;

-- 创建策略：员工只能查看自己部门的工资
CREATE POLICY dept_policy ON employee_data
    FOR ALL
    USING (department = current_setting('app.current_dept'));

-- 管理员可以查看所有
CREATE POLICY admin_policy ON employee_data
    FOR ALL
    USING (current_user = 'admin');
```

## 22.3 审计日志（pgaudit）

```sql
-- 需要先安装pgaudit扩展
CREATE EXTENSION pgaudit;

-- 记录所有DDL操作
ALTER SYSTEM SET pgaudit.log = 'write,ddl';
-- 记录特定表的所有操作
ALTER SYSTEM SET pgaudit.relation = 'orders,users';
```

---

## 22.4 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: security_demo
      POSTGRES_PASSWORD: test
    command: >
      -c ssl=off
      -c log_statement=mod
      -c log_line_prefix='%t [%p]: [%l-1] user=%u,db=%d '
    volumes:
      - ./init-security.sql:/docker-entrypoint-initdb.d/init.sql
```