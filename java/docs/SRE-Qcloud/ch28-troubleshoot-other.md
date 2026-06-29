# 第28章 其他云产品常见故障排查

## 28.1 概述

腾讯云提供了超过400种云服务，除核心的计算、存储、网络、数据库产品外，Redis、对象存储（COS）、云函数（SCF）、云服务器（CVM）等产品在日常运维中同样会遇到各类故障场景。本章聚焦于这些高频产品的典型问题，提供从现象到根因的排查链路、诊断命令和修复方案。

---

## 28.2 Redis 故障排查

### 28.2.1 内存使用率过高

**现象**：Redis 监控中 `used_memory` 持续接近或达到 `maxmemory`，触发 OOM（Out of Memory）错误，写入失败，`INFO commandstats` 中 `del` 或 `evicted_keys` 指标飙升。

**排查步骤**：

1. **确认内存使用量**
   ```bash
   redis-cli -h <host> -p <port> -a <password> INFO memory
   ```
   关注字段：
   - `used_memory_human`：当前实际使用内存
   - `used_memory_rss_human`：操作系统角度占用的物理内存
   - `maxmemory_human`：配置的最大内存上限
   - `mem_fragmentation_ratio`：内存碎片率，>1.5 表示碎片严重

2. **定位大 Key（Big Key）**
   大 Key 是 Redis 内存飙升的首要原因。使用 `--bigkeys` 扫描：
   ```bash
   redis-cli -h <host> -p <port> -a <password> --bigkeys
   ```
   输出示例：
   ```
   Biggest string found 'session:10086' has 52428800 bytes
   Biggest list  found 'task_queue'     has 1000000 items
   ```

   手动检查指定 Key 的大小：
   ```bash
   redis-cli MEMORY USAGE session:10086
   redis-cli STRLEN session:10086
   redis-cli LLEN task_queue
   redis-cli HLEN user:hash:key
   redis-cli SCARD user:set:key
   redis-cli ZCARD user:zset:key
   ```

3. **定位热 Key（Hot Key）**
   热 Key 导致单节点 CPU 打满、请求延迟飙升。使用 `--hotkeys`（Redis 4.0+）：
   ```bash
   redis-cli -h <host> -p <port> -a <password> --hotkeys
   ```

   或通过 `MONITOR` 命令采样分析（生产环境慎用，会降低性能）：
   ```bash
   redis-cli MONITOR | head -10000 | awk '{print $4}' | sort | uniq -c | sort -nr | head -20
   ```

4. **分析 Key 过期策略**
   ```bash
   redis-cli INFO stats | grep -E "expired_keys|evicted_keys"
   ```
   - `expired_keys` 增长过快：大量 Key 设置了相近的 TTL，导致过期风暴
   - `evicted_keys` 持续增长：`maxmemory` 不足，淘汰策略生效

5. **检查内存碎片**
   ```bash
   redis-cli INFO memory | grep mem_fragmentation_ratio
   ```
   - `mem_fragmentation_ratio > 1.5`：碎片率过高，考虑重启或 `MEMORY PURGE`
   - `mem_fragmentation_ratio < 1.0`：可能存在 swap，检查操作系统

**解决方案**：

| 问题类型 | 处理方式 |
|---------|---------|
| 大 Key | 拆分大 Key（如将大 Hash 拆为多个小 Hash），或使用 `UNLINK` 异步删除 |
| 热 Key | 本地缓存 + 读写分离 + Key 散列（加随机后缀） |
| 内存不足 | 扩容规格、调整 `maxmemory-policy` 为 `allkeys-lru` |
| 碎片过高 | 低峰期重启实例，或升级至支持自动碎片整理的版本 |
| 过期风暴 | 在 TTL 上增加随机偏移量，避免集中过期 |

### 28.2.2 大 Key 导致阻塞

**现象**：`DEL` 大 Key 时 Redis 主线程阻塞数秒甚至数十秒，导致所有请求排队超时；`KEYS`、`SMEMBERS`、`HGETALL` 等命令在大集合上执行同样会阻塞。

**根因**：Redis 是单线程模型，`DEL` 一个包含数百万元素的 Key 时，`O(N)` 的复杂度会独占事件循环。

**排查**：
```bash
# 查看慢查询日志
redis-cli SLOWLOG GET 50

# 确认阻塞命令
redis-cli SLOWLOG GET | awk '/del|keys|smembers|hgetall/ {print $0}'
```

**修复**：
- 使用 `UNLINK` 替代 `DEL`（异步释放内存）
- 使用 `SSCAN` / `HSCAN` / `ZSCAN` 替代 `SMEMBERS` / `HGETALL` / `ZRANGE`
- 禁止在线上执行 `KEYS *`，改用 `SCAN 0 COUNT 100`

### 28.2.3 主从延迟与数据不一致

**现象**：从库 `lag` 持续增大，`master_link_status:down`，业务读到过期或不存在的数据。

**排查**：
```bash
redis-cli INFO replication
```
关注字段：
- `master_repl_offset` 与 `slave_repl_offset` 的差值
- `master_last_io_seconds_ago`：距上次主从通信的秒数
- `repl_backlog_histlen`：复制积压缓冲区大小

**常见原因**：
- 主库大 Key 导致复制缓冲区溢出（`client-output-buffer-limit slave`）
- 从库执行慢查询拖慢复制进度
- 网络延迟过高

**修复**：
- 增大 `repl-backlog-size`（默认 1MB，建议 64MB+）
- 拆分大 Key 减少复制数据量
- 使用腾讯云 Redis 的 Proxy 版，自动处理主从切换

---

## 28.3 COS 对象存储故障排查

### 28.3.1 上传失败

**现象**：`PUT Object` 返回 4xx/5xx 错误，文件上传中断或超时。

**常见错误码及排查**：

| 错误码 | 含义 | 排查方向 |
|--------|------|---------|
| `403 AccessDenied` | 权限不足 | 检查 `APPID`、`SecretId`、`SecretKey`、临时密钥有效期 |
| `404 NoSuchBucket` | Bucket 不存在 | 确认 Bucket 名称和地域是否正确 |
| `409 BucketAlreadyExists` | Bucket 已存在 | 使用唯一名称 |
| `413 EntityTooLarge` | 文件过大 | 单次上传限制 5GB，大文件使用分块上传 |
| `503 SlowDown` | 请求频率过高 | 降低 QPS，启用指数退避重试 |

**上传超时排查**：

```bash
# 使用 COS 命令行工具诊断
coscli config -a <SecretId> -s <SecretKey> -b <BucketName-APPID> -r <Region>

# 测试上传
time coscli cp ./test.txt cos://<bucket>/test.txt

# 使用 curl 测试直连
curl -v -X PUT \
  -H "Host: <bucket>.cos.<region>.myqcloud.com" \
  -H "Authorization: <签名>" \
  -T ./test.txt \
  "https://<bucket>.cos.<region>.myqcloud.com/test.txt"
```

**分块上传问题**：

```bash
# 列出未完成的分块上传
coscli list-parts cos://<bucket>/<key>

# 中止过期分块（避免存储费用）
coscli abort cos://<bucket>/<key> --upload-id <UploadId>
```

**网络诊断**：

```bash
# 检查 COS 接入点 DNS 解析
nslookup <bucket>.cos.<region>.myqcloud.com

# 测试延迟
ping <bucket>.cos.<region>.myqcloud.com

# 路由追踪
tracert <bucket>.cos.<region>.myqcloud.com

# 检查是否被防火墙拦截
telnet <bucket>.cos.<region>.myqcloud.com 443
```

### 28.3.2 下载失败

**现象**：`GET Object` 返回错误，下载速度慢，或文件内容损坏。

**排查步骤**：

1. **检查文件是否存在**
   ```bash
   coscli ls cos://<bucket>/<prefix>
   coscli stat cos://<bucket>/<key>
   ```

2. **检查 MD5 校验**
   ```bash
   # 获取服务端 ETag
   coscli stat cos://<bucket>/<key> | grep ETag

   # 计算本地文件 MD5
   certutil -hashfile ./downloaded.txt MD5
   ```
   注意：分块上传的 ETag 不是简单文件 MD5，需自行计算分块 MD5 拼接后的摘要。

3. **断点续传问题**
   ```bash
   # 使用 --range 参数断点下载
   coscli cp cos://<bucket>/<key> ./local_file --range 0-1048575
   ```

4. **下载速度慢**
   - 确认是否使用了内网域名（同地域 CVM 应使用 `cos.<region>.myqcloud.com` 内网 IP）
   - 检查是否开启了 CDN 加速
   - 确认是否被单连接限速（COS 单连接约 60-80MB/s）

### 28.3.3 跨域访问（CORS）问题

**现象**：浏览器中访问 COS 资源时出现 `No 'Access-Control-Allow-Origin' header` 错误。

**排查**：
```bash
# 使用 curl 测试 CORS 预检请求
curl -v -X OPTIONS \
  -H "Origin: https://yourdomain.com" \
  -H "Access-Control-Request-Method: PUT" \
  "https://<bucket>.cos.<region>.myqcloud.com/<key>"
```

**修复**：在 COS 控制台 Bucket 的「安全管理 > 跨域访问 CORS」中添加规则：
```json
{
  "AllowedOrigins": ["https://yourdomain.com"],
  "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag", "x-cos-request-id"],
  "MaxAgeSeconds": 3600
}
```

### 28.3.4 生命周期与存储类型问题

**现象**：文件未按预期自动沉降或过期删除。

**排查**：
```bash
# 查看文件当前存储类型
coscli stat cos://<bucket>/<key> | grep StorageClass

# 列出生命周期规则
# 通过 API 查询
curl -X GET \
  "https://<bucket>.cos.<region>.myqcloud.com/?lifecycle"
```

**常见原因**：
- 生命周期规则未正确配置 `Filter` 前缀
- 文件上传时间未达到规则生效时间（沉降规则最早次日生效）
- 归档存储文件有 60 天最短存储期限制

---

## 28.4 SCF 云函数故障排查

### 28.4.1 函数超时

**现象**：函数执行返回 `Task timed out after X seconds`，监控中 `duration` 达到配置的超时上限。

**排查步骤**：

1. **确认超时配置**
   ```bash
   # 通过 TC CLI 查看函数配置
   tccli scf GetFunction --FunctionName <function-name> --Namespace <ns> | grep Timeout
   ```
   默认超时 3 秒，最大 900 秒。

2. **定位耗时环节**
   在函数代码中添加分段计时日志：
   ```python
   import time
   import logging

   def main_handler(event, context):
       start = time.time()
       logging.info(f"[TIMING] init={time.time()-start:.3f}s")

       # 数据库查询
       db_start = time.time()
       result = query_database()
       logging.info(f"[TIMING] db_query={time.time()-db_start:.3f}s")

       # 外部 API 调用
       api_start = time.time()
       resp = call_external_api()
       logging.info(f"[TIMING] external_api={time.time()-api_start:.3f}s")

       return result
   ```

3. **检查是否有死循环或等待**
   ```python
   # 排查常见的无限等待模式
   # ❌ 错误：同步等待异步操作
   import asyncio
   loop = asyncio.get_event_loop()
   loop.run_until_complete(some_async_task())  # SCF 环境可能阻塞

   # ✅ 正确：使用同步 HTTP 库
   import requests
   resp = requests.get("https://api.example.com", timeout=5)
   ```

4. **优化方向**
   - 增加超时配置（控制台或 API 修改 `Timeout` 参数）
   - 启用异步处理：耗时任务通过 `Invoke` 异步调用或投递到 CMQ/Ckafka
   - 使用数据库连接池复用连接
   - 将初始化逻辑移到全局作用域（冷启动后复用）

### 28.4.2 并发超限

**现象**：返回 `429 ResourceExhausted` 或 `Function concurrent execution limit exceeded`，请求被限流。

**排查**：

```bash
# 查看当前并发数
tccli scf GetFunction --FunctionName <function-name> | grep ConcurrentExecutions

# 查看账号级并发配额
tccli scf GetAccountSettings | grep -E "TotalConcurrency|AvailableConcurrency"
```

**SCF 并发模型**：
- 账号级并发配额：每个地域默认 12800 MB（即 1280 个 128MB 函数实例）
- 函数级并发限制：可单独设置，默认不限制（受账号配额约束）
- 预置并发：保留固定数量实例消除冷启动

**解决方案**：

| 场景 | 方案 |
|------|------|
| 突发流量 | 设置函数级保留并发配额 |
| 冷启动敏感 | 配置预置并发（Provisioned Concurrency） |
| 长时间占用 | 优化函数执行时间，降低单实例耗时 |
| 持续超限 | 提交工单提升账号并发配额 |

### 28.4.3 冷启动延迟

**现象**：函数偶尔出现 1-5 秒的额外延迟，通常发生在长时间未调用后。

**根因**：SCF 在无请求时会回收实例，下次请求需要重新下载代码、初始化运行时环境。

**排查**：
```bash
# 查看冷启动频率
# 在日志中搜索 "Init Report" 或 "冷启动"
tccli scf GetFunctionLogs --FunctionName <function-name> --StartTime "2024-01-01" --EndTime "2024-01-02" | grep "InitReport"
```

**优化**：
- 配置预置并发（保留 1-2 个常驻实例）
- 减少代码包体积（移除 `node_modules` 中未使用的依赖）
- 使用懒加载替代全局导入
- 设置定时触发器（每 5 分钟调用一次）保持实例 Warm

### 28.4.4 代码包超限

**现象**：部署时报 `Code size exceeds maximum allowed size`，SCF 限制为 500MB（含层）。

**排查**：
```bash
# 查看代码包大小
ls -lh function.zip

# 分析目录大小
du -sh ./*
du -sh node_modules/*
```

**优化**：
- 使用层（Layer）管理公共依赖
- 移除开发依赖（`npm prune --production`）
- 使用 `tmp` 目录处理运行时生成的大文件
- 将静态资源迁移到 COS，函数内通过 SDK 读取

---

## 28.5 CVM 云服务器故障排查

### 28.5.1 无法连接（SSH/登录）

**现象**：`ssh` 连接超时、`Connection refused`、控制台 VNC 也无法登录。

**排查链路**：

```
客户端 → DNS解析 → 网络可达 → 安全组 → 防火墙 → SSH服务 → 认证
```

1. **检查云服务器状态**
   ```bash
   # 通过 API 检查实例状态
   tccli cvm DescribeInstancesStatus --InstanceIds '["ins-xxxxx"]'
   ```
   确认状态为 `RUNNING`，非 `STOPPED` 或 `SHUTDOWN`。

2. **检查网络可达性**
   ```bash
   # Ping 测试（需安全组允许 ICMP）
   ping <公网IP>

   # 路由追踪
   tracert <公网IP>

   # 端口连通性
   telnet <公网IP> 22
   ```

3. **检查安全组规则**
   ```bash
   # 查看实例关联的安全组
   tccli cvm DescribeInstances --InstanceIds '["ins-xxxxx"]' | grep SecurityGroupId

   # 查看安全组入站规则
   tccli vpc DescribeSecurityGroupPolicies --SecurityGroupId sg-xxxxx
   ```
   确认存在 `TCP:22` 来源为 `0.0.0.0/0`（或可信 IP）的入站规则。

4. **检查操作系统防火墙**
   ```bash
   # 通过 VNC 或串行控制台登录后检查
   # Windows
   netsh advfirewall show allprofiles

   # Linux
   systemctl status firewalld
   iptables -L -n | grep 22
   ```

5. **检查 SSH 服务**
   ```bash
   # Linux
   systemctl status sshd
   netstat -tlnp | grep :22
   cat /etc/ssh/sshd_config | grep -E "Port|PermitRootLogin|PasswordAuthentication"
   ```

6. **检查 hosts.deny**
   ```bash
   cat /etc/hosts.deny
   # 如果 SSH 频繁失败登录，sshd 可能通过 tcp_wrappers 封禁了来源 IP
   ```

### 28.5.2 CPU 负载过高

**现象**：`top` 显示 `%CPU` 持续 > 80%，`load average` 超过 CPU 核数，业务响应变慢。

**排查步骤**：

1. **定位高 CPU 进程**
   ```bash
   # 实时查看 CPU 占用
   top -c -o %CPU

   # 查看进程线程级 CPU
   ps -eo pid,ppid,%cpu,%mem,cmd --sort=-%cpu | head -20

   # 查看特定进程的线程
   top -H -p <PID>
   ```

2. **Java 应用 CPU 高排查**
   ```bash
   # 找到 Java 进程
   jps -l

   # 查看最耗 CPU 的线程
   top -H -p <PID>

   # 将线程 ID 转为十六进制
   printf "%x\n" <线程PID>

   # 导出线程栈
   jstack <PID> > jstack.log

   # 在栈中搜索对应线程
   grep -A 30 "0x<十六进制线程ID>" jstack.log
   ```

3. **Python 应用 CPU 高排查**
   ```bash
   # 使用 py-spy 采样（无需重启）
   pip install py-spy
   py-spy top --pid <PID>

   # 生成火焰图
   py-spy record -o flame.svg --pid <PID> --duration 30
   ```

4. **排查常见原因**
   - 死循环：检查 `while True` 或递归调用
   - 频繁 GC：`jstat -gcutil <PID> 1000 10` 查看 GC 频率
   - 大量正则匹配：回溯分析日志中是否存在灾难性回溯
   - 加密/解密操作：检查 SSL 握手频率

### 28.5.3 内存不足（OOM）

**现象**：`dmesg` 中出现 `Out of memory: Kill process`，`free -m` 显示可用内存接近 0，`/var/log/messages` 中有 OOM Killer 日志。

**排查**：

```bash
# 查看内存使用概览
free -h
cat /proc/meminfo

# 查看进程内存排序
ps -eo pid,ppid,%mem,rss,cmd --sort=-%mem | head -20

# 查看 OOM Killer 日志
dmesg | grep -i "out of memory"
dmesg | grep -i "killed process"

# 查看进程详细内存映射
pmap -x <PID> | tail -20

# 查看 Swap 使用
swapon --show
vmstat 1 10
```

**Java 应用内存排查**：
```bash
# 查看堆内存
jmap -heap <PID>

# 导出堆转储（谨慎，会触发 Full GC）
jmap -dump:live,format=b,file=heap.hprof <PID>

# 查看 GC 情况
jstat -gcutil <PID> 1000 10
```

**解决方案**：
- 增加 CVM 规格（升配）
- 配置 `swap` 作为缓冲（不推荐长期依赖）
- 优化应用内存使用：减少缓存、分页加载、连接池限制
- 设置 `OOMScoreAdjust` 保护关键进程不被优先杀死

### 28.5.4 磁盘 I/O 过高

**现象**：`iowait` 持续 > 30%，`top` 中 `wa` 指标高，应用读写缓慢。

**排查**：

```bash
# 查看磁盘 I/O 统计
iostat -x 1 5

# 定位 I/O 密集型进程
iotop -o

# 查看具体文件读写
lsof -p <PID> | grep -E "REG|DIR"

# 查看磁盘空间和 inode
df -h
df -i
```

**关键指标**：
- `%util`：磁盘繁忙率（> 80% 表示过载）
- `await`：I/O 平均等待时间（ms），SSD 应 < 10ms
- `rkb/s`、`wkb/s`：读写吞吐量
- `svctm`：平均服务时间

**常见原因**：
- 日志未轮转：`logrotate` 配置不当，单日志文件过大
- 数据库大量刷盘：检查 `WAL` 写入频率
- Page Cache 回收压力大：`cat /proc/sys/vm/dirty_ratio`
- 云硬盘达到性能上限：查看 CBS 监控中的 `IOPS` 和 `吞吐量` 是否达到规格上限

### 28.5.5 内网带宽打满

**现象**：`sar -n DEV 1` 显示内网网卡 `rxkB/s` 或 `txkB/s` 接近实例规格上限，业务出现网络延迟。

**排查**：

```bash
# 查看网卡流量
sar -n DEV 1 5

# 查看连接数
ss -s
netstat -nat | awk '{print $6}' | sort | uniq -c | sort -rn

# 查看每个连接的流量
nethogs -d 1

# 查看特定端口的流量
iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
iptables -A OUTPUT -p tcp --sport 8080 -j ACCEPT
iptables -L -v -n | grep 8080
```

**CVM 内网带宽规格**（参考）：

| 实例类型 | 内网带宽上限 |
|---------|------------|
| S5.SMALL1 | 1.5 Gbps |
| S5.LARGE4 | 3 Gbps |
| S5.4XLARGE32 | 10 Gbps |
| S5.16XLARGE128 | 40 Gbps |

**解决方案**：
- 升级实例规格获取更高内网带宽
- 使用内网 CLB 分流
- 启用连接池复用减少新建连接
- 使用 CDN 或 COS 分担带宽

---

## 28.6 综合诊断脚本

以下是一个综合诊断脚本，可一键收集上述所有产品的关键指标，适用于故障初期的快速排查。

```bash
#!/bin/bash
# ============================================================
# 腾讯云多产品故障快速诊断脚本
# 适用场景：Redis / COS / SCF / CVM 异常时的初步排查
# 使用方法：bash qcloud_diag.sh [--all|--redis|--cos|--scf|cvm]
# ============================================================

set -euo pipefail

# ---------- 配置区（请按实际情况修改）----------
REDIS_HOST=""
REDIS_PORT="6379"
REDIS_PASS=""

COS_BUCKET=""
COS_REGION="ap-guangzhou"
COS_SECRET_ID=""
COS_SECRET_KEY=""

SCF_FUNCTION_NAME=""
SCF_NAMESPACE="default"

CVM_INSTANCE_ID=""
# ---------------------------------------------

DIAG_DATE=$(date '+%Y-%m-%d %H:%M:%S')
DIAG_FILE="qcloud_diag_$(date '+%Y%m%d_%H%M%S').log"

log() {
    echo "[$(date '+%H:%M:%S')] $*" | tee -a "$DIAG_FILE"
}

section() {
    echo "" | tee -a "$DIAG_FILE"
    echo "============================================" | tee -a "$DIAG_FILE"
    echo "  $*" | tee -a "$DIAG_FILE"
    echo "============================================" | tee -a "$DIAG_FILE"
}

# ---------- Redis 诊断 ----------
diag_redis() {
    section "Redis 诊断"

    if [ -z "$REDIS_HOST" ]; then
        log "[SKIP] REDIS_HOST 未配置，跳过 Redis 诊断"
        return
    fi

    local AUTH=""
    [ -n "$REDIS_PASS" ] && AUTH="-a $REDIS_PASS"

    # 1. 基础连通性
    log "[INFO] 测试 Redis 连通性..."
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $AUTH ping 2>/dev/null | grep -q "PONG"; then
        log "[OK] Redis 连接正常"
    else
        log "[FAIL] Redis 无法连接，请检查网络和认证"
        return
    fi

    # 2. 内存使用
    log "[INFO] 内存使用情况："
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $AUTH INFO memory 2>/dev/null | \
        grep -E "used_memory_human|used_memory_rss_human|maxmemory_human|mem_fragmentation_ratio" | \
        while read line; do log "  $line"; done

    # 3. 命中率
    log "[INFO] 缓存命中率："
    local hits misses
    hits=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $AUTH INFO stats 2>/dev/null | \
        grep "keyspace_hits" | cut -d: -f2 | tr -d '\r')
    misses=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $AUTH INFO stats 2>/dev/null | \
        grep "keyspace_misses" | cut -d: -f2 | tr -d '\r')
    if [ "$hits" -gt 0 ] || [ "$misses" -gt 0 ]; then
        local total=$((hits + misses))
        local rate=$(echo "scale=2; $hits * 100 / $total" | bc)
        log "  命中率: ${rate}% (hits=${hits}, misses=${misses})"
    fi

    # 4. 慢查询
    log "[INFO] 最近慢查询："
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $AUTH SLOWLOG GET 10 2>/dev/null | \
        grep -E "duration|cmd" | head -20 | while read line; do log "  $line"; done

    # 5. 大 Key 扫描（仅提示，不自动执行以免影响线上）
    log "[WARN] 如需扫描大 Key，请手动执行："
    log "  redis-cli -h $REDIS_HOST -p $REDIS_PORT $AUTH --bigkeys"

    # 6. 复制状态
    log "[INFO] 复制状态："
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $AUTH INFO replication 2>/dev/null | \
        grep -E "role|connected_slaves|master_link_status|master_last_io_seconds_ago" | \
        while read line; do log "  $line"; done

    # 7. 逐出统计
    log "[INFO] Key 逐出统计："
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $AUTH INFO stats 2>/dev/null | \
        grep "evicted_keys" | while read line; do log "  $line"; done
}

# ---------- COS 诊断 ----------
diag_cos() {
    section "COS 诊断"

    if [ -z "$COS_BUCKET" ]; then
        log "[SKIP] COS_BUCKET 未配置，跳过 COS 诊断"
        return
    fi

    local ENDPOINT="${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com"

    # 1. DNS 解析
    log "[INFO] DNS 解析："
    nslookup "$ENDPOINT" 2>/dev/null | grep -A 2 "Name:" | while read line; do log "  $line"; done

    # 2. 网络延迟
    log "[INFO] 网络延迟测试："
    ping -n 4 "$ENDPOINT" 2>/dev/null | tail -1 | while read line; do log "  $line"; done

    # 3. 端口连通性
    log "[INFO] 端口连通性（443）："
    if timeout 3 bash -c "echo > /dev/tcp/$ENDPOINT/443" 2>/dev/null; then
        log "[OK] HTTPS 端口可达"
    else
        log "[FAIL] HTTPS 端口不可达，请检查网络/防火墙"
    fi

    # 4. 上传测试（需配置密钥）
    if [ -n "$COS_SECRET_ID" ] && [ -n "$COS_SECRET_KEY" ]; then
        log "[INFO] 上传测试..."
        local TEST_FILE="/tmp/cos_diag_test_$$.txt"
        echo "COS diagnostic test file - $DIAG_DATE" > "$TEST_FILE"

        if command -v coscli &>/dev/null; then
            if coscli cp "$TEST_FILE" "cos://${COS_BUCKET}/diag_test.txt" 2>/dev/null; then
                log "[OK] 上传成功"
                coscli rm "cos://${COS_BUCKET}/diag_test.txt" 2>/dev/null
            else
                log "[FAIL] 上传失败，请检查密钥和权限"
            fi
        else
            log "[WARN] coscli 未安装，跳过上传测试"
        fi
        rm -f "$TEST_FILE"
    else
        log "[SKIP] COS_SECRET_ID/KEY 未配置，跳过上传测试"
    fi
}

# ---------- SCF 诊断 ----------
diag_scf() {
    section "SCF 诊断"

    if [ -z "$SCF_FUNCTION_NAME" ]; then
        log "[SKIP] SCF_FUNCTION_NAME 未配置，跳过 SCF 诊断"
        return
    fi

    # 1. 检查函数状态
    log "[INFO] 函数基本信息："
    tccli scf GetFunction --FunctionName "$SCF_FUNCTION_NAME" --Namespace "$SCF_NAMESPACE" 2>/dev/null | \
        grep -E "FunctionName|Runtime|Status|Timeout|MemorySize|CodeSize" | \
        while read line; do log "  $line"; done

    # 2. 并发情况
    log "[INFO] 并发执行数："
    tccli scf GetFunction --FunctionName "$SCF_FUNCTION_NAME" --Namespace "$SCF_NAMESPACE" 2>/dev/null | \
        grep "ConcurrentExecutions" | while read line; do log "  $line"; done

    # 3. 最近错误
    log "[INFO] 最近 1 小时错误日志："
    local START_TIME END_TIME
    START_TIME=$(date -d '1 hour ago' '+%Y-%m-%dT%H:%M:%S+08:00')
    END_TIME=$(date '+%Y-%m-%dT%H:%M:%S+08:00')

    tccli scf GetFunctionLogs \
        --FunctionName "$SCF_FUNCTION_NAME" \
        --Namespace "$SCF_NAMESPACE" \
        --StartTime "$START_TIME" \
        --EndTime "$END_TIME" \
        --Limit 20 2>/dev/null | grep -E "FunctionName|Message|RetryNum|Duration|MemUsage" | \
        while read line; do log "  $line"; done

    # 4. 账号配额
    log "[INFO] 账号并发配额："
    tccli scf GetAccountSettings 2>/dev/null | \
        grep -E "TotalConcurrency|AvailableConcurrency" | \
        while read line; do log "  $line"; done
}

# ---------- CVM 诊断 ----------
diag_cvm() {
    section "CVM 诊断（本机）"

    # 1. 系统基本信息
    log "[INFO] 系统信息："
    log "  主机名: $(hostname)"
    log "  内核: $(uname -a)"
    log "  运行时间: $(uptime -p)"
    log "  当前负载: $(uptime | awk -F'load average:' '{print $2}')"

    # 2. CPU
    log "[INFO] CPU 使用率："
    local cpu_idle
    cpu_idle=$(top -bn1 | grep "Cpu(s)" | awk '{print $8}' | cut -d. -f1)
    log "  CPU 空闲: ${cpu_idle}%"
    log "  进程数: $(ps -ef | wc -l)"
    log "  Top 5 CPU 进程："
    ps -eo pid,%cpu,%mem,cmd --sort=-%cpu | head -6 | while read line; do log "  $line"; done

    # 3. 内存
    log "[INFO] 内存使用："
    free -h | while read line; do log "  $line"; done
    log "  Top 5 内存进程："
    ps -eo pid,%mem,%cpu,cmd --sort=-%mem | head -6 | while read line; do log "  $line"; done

    # 4. 磁盘
    log "[INFO] 磁盘使用："
    df -h | grep -v tmpfs | while read line; do log "  $line"; done
    log "  inode 使用："
    df -i | grep -v tmpfs | while read line; do log "  $line"; done

    # 5. 磁盘 I/O
    log "[INFO] 磁盘 I/O（最近 5 秒）："
    if command -v iostat &>/dev/null; then
        iostat -x 1 3 | tail -20 | while read line; do log "  $line"; done
    else
        log "  iostat 未安装，跳过"
    fi

    # 6. 网络
    log "[INFO] 网络连接数："
    log "  ESTABLISHED: $(ss -t state established | wc -l)"
    log "  TIME_WAIT:   $(ss -t state time-wait | wc -l)"
    log "  CLOSE_WAIT:  $(ss -t state close-wait | wc -l)"
    log "  监听端口："
    ss -tlnp | while read line; do log "  $line"; done

    # 7. 网络流量
    log "[INFO] 网络流量（最近 5 秒）："
    if command -v sar &>/dev/null; then
        sar -n DEV 1 3 | tail -10 | while read line; do log "  $line"; done
    else
        log "  sar 未安装，跳过"
    fi

    # 8. 系统日志中的错误
    log "[INFO] 系统日志错误（最近 30 分钟）："
    if [ -f /var/log/messages ]; then
        grep -i "error\|oom\|killed\|failed" /var/log/messages 2>/dev/null | \
            tail -20 | while read line; do log "  $line"; done
    elif [ -f /var/log/syslog ]; then
        grep -i "error\|oom\|killed\|failed" /var/log/syslog 2>/dev/null | \
            tail -20 | while read line; do log "  $line"; done
    else
        log "  未找到系统日志文件"
    fi

    # 9. D 状态进程（不可中断睡眠，通常表示 I/O 阻塞）
    log "[INFO] D 状态进程（I/O 阻塞）："
    local d_procs
    d_procs=$(ps -eo state,pid,cmd | grep "^D" | wc -l)
    if [ "$d_procs" -gt 0 ]; then
        log "  发现 ${d_procs} 个 D 状态进程："
        ps -eo state,pid,cmd | grep "^D" | while read line; do log "  $line"; done
    else
        log "  无 D 状态进程"
    fi

    # 10. OOM 检查
    log "[INFO] OOM Killer 历史："
    if dmesg 2>/dev/null | grep -qi "out of memory"; then
        dmesg | grep -i "out of memory" | tail -5 | while read line; do log "  $line"; done
    else
        log "  未发现 OOM 记录"
    fi
}

# ---------- 主流程 ----------
main() {
    echo "============================================"
    echo "  腾讯云多产品故障快速诊断"
    echo "  诊断时间: $DIAG_DATE"
    echo "  日志文件: $DIAG_FILE"
    echo "============================================"

    case "${1:---all}" in
        --redis) diag_redis ;;
        --cos)   diag_cos ;;
        --scf)   diag_scf ;;
        --cvm)   diag_cvm ;;
        --all|*)
            diag_redis
            diag_cos
            diag_scf
            diag_cvm
            ;;
    esac

    echo ""
    echo "============================================"
    echo "  诊断完成，详细日志已保存至: $DIAG_FILE"
    echo "============================================"
}

main "$@"
```

### 使用说明

```bash
# 1. 编辑脚本顶部配置区，填入实际资源信息
# 2. 添加执行权限
chmod +x qcloud_diag.sh

# 3. 全量诊断
bash qcloud_diag.sh --all

# 4. 单产品诊断
bash qcloud_diag.sh --redis
bash qcloud_diag.sh --cos
bash qcloud_diag.sh --scf
bash qcloud_diag.sh --cvm
```

### 脚本输出解读

诊断脚本会生成一个带时间戳的日志文件，包含以下关键信息：

| 产品 | 关键检查项 | 正常指标 |
|------|-----------|---------|
| Redis | 连通性、内存使用率、命中率、慢查询、逐出数 | 内存 < 80% maxmemory，命中率 > 90%，无逐出 |
| COS | DNS 解析、端口连通性、上传测试 | 延迟 < 50ms（同地域），上传成功 |
| SCF | 函数状态、并发数、错误日志 | Status: Active，无 429 错误 |
| CVM | CPU/内存/磁盘/网络、D 状态进程、OOM | CPU < 70%，内存 < 80%，iowait < 30% |

---

## 28.7 故障处理最佳实践

### 28.7.1 故障响应 SOP

```
发现告警
  │
  ├─ 1分钟：确认告警真实性（排除误报）
  │
  ├─ 5分钟：执行诊断脚本，收集现场信息
  │
  ├─ 15分钟：定位根因，执行止血操作
  │   ├─ Redis 内存高 → 临时扩容 / 淘汰非关键 Key
  │   ├─ COS 上传失败 → 切换备用 Bucket / 启用内网
  │   ├─ SCF 超时 → 增加超时配置 / 启用异步
  │   └─ CVM 不可达 → 重启 / 切换备用 CVM
  │
  ├─ 30分钟：根因修复
  │
  └─ 复盘：输出故障报告，更新监控和告警
```

### 28.7.2 预防性措施

| 产品 | 预防措施 |
|------|---------|
| Redis | 设置 `maxmemory` 和合理淘汰策略，监控大 Key 和热 Key，定期 `SLOWLOG` 巡检 |
| COS | 启用版本控制防止误删，设置生命周期自动沉降，使用 CDN 加速 |
| SCF | 配置预置并发消除冷启动，设置死信队列处理失败事件，代码包控制在 100MB 以内 |
| CVM | 配置告警（CPU > 80%、内存 > 80%、磁盘 > 85%），定期安全组审计，使用 HAVIP 实现高可用 |

### 28.7.3 关键监控指标

**Redis**：
- `used_memory / maxmemory`：内存使用率
- `evicted_keys / total_commands_processed`：逐出率
- `instantaneous_ops_per_sec`：QPS
- `connected_clients`：连接数

**COS**：
- `2xx / 4xx / 5xx` 请求数
- `TotalReqCount`：总请求量
- `TrafficInternet` / `TrafficIntranet`：流量
- `Storage`：存储量

**SCF**：
- `Duration`：执行耗时（P99）
- `InvocationCount`：调用次数
- `ErrorRate`：错误率
- `ConcurrentExecutions`：并发数

**CVM**：
- `CPUUsage`：CPU 使用率
- `MemUsage`：内存使用率
- `DiskUsage`：磁盘使用率
- `LanOutTraffic` / `LanInTraffic`：内网流量
- `BaseCPU`：CPU 基础监控

---

## 28.8 本章小结

本章覆盖了腾讯云四个高频产品的典型故障场景：

- **Redis**：内存过高、大 Key 阻塞、热 Key 打满 CPU、主从延迟。核心排查工具为 `INFO memory`、`--bigkeys`、`SLOWLOG`。
- **COS**：上传/下载失败、CORS 跨域、生命周期异常。核心排查工具为 `coscli`、`curl` 直连测试、DNS 诊断。
- **SCF**：超时、并发超限、冷启动、代码包过大。核心排查工具为 `tccli scf`、分段计时日志、预置并发配置。
- **CVM**：SSH 不可达、CPU/内存/磁盘/带宽打满。核心排查工具为 `top`、`iostat`、`ss`、`dmesg`。

综合诊断脚本 `qcloud_diag.sh` 可在故障发生时一键收集上述所有产品的关键指标，大幅缩短 MTTR（平均修复时间）。建议将此脚本纳入各环境的运维工具库，并根据实际业务场景持续补充检查项。
