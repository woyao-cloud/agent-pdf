# 第七章 Neptune 故障排查指南

## 7.1 概述

Amazon Neptune 是 AWS 提供的高性能图数据库服务，支持 RDF 和 Property Graph 两种数据模型。在实际生产环境中，Neptune 集群可能面临连接异常、查询超时、性能退化、数据不一致乃至集群不可用等多种故障场景。本章从连接、查询、性能、数据、集群五个维度出发，系统性地梳理常见故障的根因、诊断方法和修复策略，并配套提供 AWS CLI 命令、Python 诊断脚本以及结构化的排查决策树，帮助读者在真实故障场景中快速定位并恢复服务。

---

## 7.2 连接问题

### 7.2.1 连接超时（VPC/子网/安全组配置错误）

#### 解决的问题

客户端无法与 Neptune 集群建立 TCP 连接，表现为 `ConnectionTimeout` 或 `ConnectTimeout` 异常。此类问题通常与网络基础设施配置相关，而非 Neptune 服务本身故障。

#### 核心原理

Neptune 集群部署在 VPC 内部，默认不提供公网访问。客户端必须满足以下条件才能建立连接：

1. 客户端与 Neptune 集群处于同一 VPC，或通过 VPC Peering / Transit Gateway / VPN 实现网络互通
2. 子网关联的路由表存在正确路由
3. 安全组（Security Group）入站规则允许客户端 IP 或客户端安全组访问 Neptune 端口（8182 用于 Gremlin/SPARQL，默认 HTTPS）
4. 网络 ACL（NACL）未阻止相关流量

连接超时的本质是 TCP 三次握手未在操作系统超时阈值内完成，通常意味着请求包被丢弃或无法到达目标。

#### 代码/配置实现

**诊断脚本：检查 Neptune 集群网络可达性**

```python
import socket
import ssl
import sys
import boto3
from datetime import datetime

def check_neptune_connectivity(endpoint, port=8182, timeout=5):
    """检查 Neptune 集群网络可达性"""
    print(f"[{datetime.now()}] 正在检查 Neptune 端点: {endpoint}:{port}")
    
    # 1. DNS 解析检查
    try:
        ip = socket.gethostbyname(endpoint)
        print(f"[OK] DNS 解析成功: {endpoint} -> {ip}")
    except socket.gaierror as e:
        print(f"[FAIL] DNS 解析失败: {e}")
        return False
    
    # 2. TCP 连接检查
    try:
        sock = socket.create_connection((endpoint, port), timeout=timeout)
        sock.close()
        print(f"[OK] TCP 连接成功")
    except socket.timeout:
        print(f"[FAIL] TCP 连接超时（{timeout}s）")
        print("  -> 可能原因：安全组未放行、路由不可达、NACL 阻止")
        return False
    except ConnectionRefusedError:
        print(f"[FAIL] 连接被拒绝（端口未监听）")
        return False
    
    # 3. TLS 握手检查
    try:
        context = ssl.create_default_context()
        with socket.create_connection((endpoint, port), timeout=timeout) as sock:
            with context.wrap_socket(sock, server_hostname=endpoint) as ssock:
                cert = ssock.getpeercert()
                print(f"[OK] TLS 握手成功")
                print(f"    证书颁发者: {cert.get('issuer')}")
                print(f"    证书主题: {cert.get('subject')}")
    except ssl.SSLError as e:
        print(f"[FAIL] TLS 握手失败: {e}")
        return False
    
    return True

if __name__ == "__main__":
    endpoint = sys.argv[1] if len(sys.argv) > 1 else input("请输入 Neptune 端点地址: ")
    check_neptune_connectivity(endpoint)
```

**AWS CLI：验证安全组配置**

```bash
# 获取 Neptune 集群关联的安全组
aws neptune describe-db-instances \
    --db-instance-identifier my-neptune-cluster \
    --query "DBInstances[*].VpcSecurityGroups" \
    --output table

# 检查安全组入站规则
aws ec2 describe-security-groups \
    --group-ids sg-xxxxxxxx \
    --query "SecurityGroups[*].IpPermissions[?FromPort==\`8182\`]" \
    --output table

# 检查子网路由表
aws ec2 describe-route-tables \
    --filters "Name=association.subnet-id,Values=subnet-xxxxxxxx" \
    --query "RouteTables[*].Routes" \
    --output table
```

#### 使用场景

- 新部署的 Neptune 集群首次连接
- 跨 VPC 或跨账号访问 Neptune
- 客户端环境迁移后连接失败
- 安全组策略变更后出现连接异常

#### 潜在风险与注意事项

- 安全组入站规则过于宽松（0.0.0.0/0）会引入安全风险，应仅放行特定客户端安全组
- VPC Peering 不支持传递性路由，跨多个 VPC 时需使用 Transit Gateway
- Neptune 不支持 Publicly Accessible = true，必须通过 VPC 内访问
- 使用 NLB（Network Load Balancer）做流量入口时，需确保 NLB 目标组健康检查通过

#### 本章小结

连接超时是 Neptune 最常见的入门级故障，根因几乎总是网络配置问题。通过分层诊断（DNS → TCP → TLS）可以快速定位故障点。建议在部署初期使用上述 Python 脚本验证网络连通性，并建立安全组变更的审批流程。

---

### 7.2.2 TLS/SSL 错误

#### 解决的问题

客户端与 Neptune 之间的 TLS 握手失败，表现为 `SSLHandshakeException`、`certificate verify failed` 或 `protocol version mismatch`。此类错误在启用 TLS 强制加密的生产环境中尤为常见。

#### 核心原理

Neptune 要求所有客户端连接使用 TLS 1.2 及以上版本，并提供由 AWS Certificate Manager（ACM）签发的服务端证书。客户端需要信任该证书链。TLS 错误的常见根因包括：

1. **证书验证失败**：客户端未信任 ACM 的 CA 证书，或使用了自签名证书
2. **协议版本不匹配**：客户端仅支持 TLS 1.0/1.1，而 Neptune 要求 TLS 1.2+
3. **SNI（Server Name Indication）缺失**：客户端未在 TLS ClientHello 中发送正确的 hostname
4. **证书过期**：ACM 证书轮换期间客户端缓存了旧证书

#### 代码/配置实现

**Python：TLS 诊断与修复**

```python
import ssl
import socket
import sys

def diagnose_tls(endpoint, port=8182):
    """诊断 TLS 连接问题"""
    print(f"=== TLS 诊断: {endpoint}:{port} ===\n")
    
    # 检查支持的 TLS 版本
    print(f"客户端支持的 TLS 版本:")
    for ver in ['TLSv1', 'TLSv1_1', 'TLSv1_2', 'TLSv1_3']:
        try:
            if hasattr(ssl, ver):
                print(f"  - {ver}: 支持")
        except:
            pass
    
    # 尝试不同 TLS 版本连接
    for version, ssl_ver in [
        ("TLS 1.0", ssl.PROTOCOL_TLSv1),
        ("TLS 1.1", ssl.PROTOCOL_TLSv1_1),
        ("TLS 1.2", ssl.PROTOCOL_TLSv1_2),
    ]:
        try:
            context = ssl.SSLContext(ssl_ver)
            with socket.create_connection((endpoint, port), timeout=5) as sock:
                with context.wrap_socket(sock, server_hostname=endpoint) as ssock:
                    print(f"[OK] {version} 握手成功")
                    print(f"    协商协议: {ssock.version()}")
                    print(f"    加密套件: {ssock.cipher()}")
        except ssl.SSLError as e:
            print(f"[FAIL] {version}: {e}")
        except Exception as e:
            print(f"[FAIL] {version}: {e}")
    
    # 检查证书链
    print("\n证书链检查:")
    try:
        context = ssl.create_default_context()
        with socket.create_connection((endpoint, port), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=endpoint) as ssock:
                cert = ssock.getpeercert(binary_form=True)
                from cryptography import x509
                from cryptography.hazmat.backends import default_backend
                cert_obj = x509.load_der_x509_certificate(cert, default_backend())
                print(f"  颁发者: {cert_obj.issuer}")
                print(f"  有效期: {cert_obj.not_valid_before} ~ {cert_obj.not_valid_after}")
                print(f"  序列号: {cert_obj.serial_number}")
    except ImportError:
        print("  (安装 cryptography 库可查看详细证书信息)")
    except Exception as e:
        print(f"  [FAIL] 证书检查失败: {e}")

if __name__ == "__main__":
    endpoint = sys.argv[1] if len(sys.argv) > 1 else input("Neptune 端点: ")
    diagnose_tls(endpoint)
```

**Java Gremlin 客户端：配置 TLS 1.2**

```java
import org.apache.tinkerpop.gremlin.driver.Cluster;
import org.apache.tinkerpop.gremlin.driver.remote.DriverRemoteConnection;
import org.apache.tinkerpop.gremlin.process.traversal.dsl.graph.GraphTraversalSource;
import static org.apache.tinkerpop.gremlin.process.traversal.AnonymousTraversalSource.traversal;

public class NeptuneTlsConfig {
    public static GraphTraversalSource createConnection(String endpoint) {
        Cluster cluster = Cluster.build()
            .addContactPoint(endpoint)
            .port(8182)
            .enableSsl(true)                    // 启用 SSL
            .sslProtocol("TLSv1.2")             // 指定 TLS 1.2
            .keyCertChainFile("path/to/cert.pem") // 可选：自定义证书
            .maxWaitForConnection(5000)
            .create();
        
        return traversal().withRemote(DriverRemoteConnection.using(cluster));
    }
}
```

**AWS CLI：获取 Neptune 集群证书信息**

```bash
# 下载 Neptune 区域证书（用于信任 ACM CA）
curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o rds-ca-bundle.pem

# 验证证书
openssl x509 -in rds-ca-bundle.pem -text -noout | head -20
```

#### 使用场景

- 使用自定义客户端（Java、Python、.NET）首次连接 Neptune
- 证书轮换后出现连接中断
- 老旧系统升级 TLS 版本时
- 使用自签名证书的测试环境迁移到生产环境

#### 潜在风险与注意事项

- 禁用证书验证（`verify=False`）仅适用于开发测试，生产环境绝对禁止
- ACM 证书每 13 个月自动轮换一次，客户端应使用 CA 证书包而非固定服务端证书
- 部分旧版 JDK（如 Java 8u252 之前）默认禁用了 TLS 1.2，需显式启用
- Python 3.6 以下版本对 TLS 1.3 支持不完整

#### 本章小结

TLS 错误的核心解决思路是确保客户端信任 ACM CA 证书链并支持 TLS 1.2+。建议在客户端代码中固定使用 `sslProtocol("TLSv1.2")` 而非依赖默认值，并定期更新 CA 证书包以应对轮换。

---

### 7.2.3 连接池耗尽

#### 解决的问题

应用程序在高并发场景下出现 `Timeout waiting for connection from pool` 或 `All connections are busy` 异常，请求被排队或直接丢弃。

#### 核心原理

Neptune 的 Gremlin/SPARQL 客户端通常使用连接池管理 TCP 连接。连接池耗尽的核心原因包括：

1. **连接数上限过低**：`maxConnectionPoolSize` 配置小于实际并发需求
2. **请求处理缓慢**：单个查询耗时过长，占用连接不释放
3. **连接泄漏**：客户端未正确关闭 `ResultSet` 或遍历未完成，导致连接未归还池中
4. **空闲连接超时**：Neptune 服务端空闲超时（默认 10 分钟）断开连接，客户端未及时重建
5. **实例规格不足**：`db.r5.large` 等小规格实例的连接数上限（约 1000-2000）被耗尽

#### 代码/配置实现

**Java：优化连接池配置**

```java
import org.apache.tinkerpop.gremlin.driver.Cluster;
import org.apache.tinkerpop.gremlin.driver.ser.GryoMessageSerializerV3d0;

public class ConnectionPoolOptimizer {
    public static Cluster createOptimizedCluster(String endpoint) {
        return Cluster.build()
            .addContactPoint(endpoint)
            .port(8182)
            .enableSsl(true)
            .maxConnectionPoolSize(100)          // 最大连接数
            .minConnectionPoolSize(8)            // 最小连接数（预热）
            .maxWaitForConnection(30000)          // 等待连接超时（ms）
            .connectionPool(new ConnectionPoolSettings(
                100,    // maxSize
                8,      // minSize
                30000,  // maxWaitForConnection
                60000,  // maxWaitForSession
                300000, // maxWaitForClose
                30000,  // minConnectionPoolSize
                180000, // connectionTTL (ms) - 3小时强制重建
                true    // enableConnectionReuse
            ))
            .reconnectInterval(2000)             // 重连间隔
            .maxContentLength(65536)             // 最大请求内容长度
            .serializer(new GryoMessageSerializerV3d0())
            .create();
    }
}
```

**Python：使用连接池监控**

```python
from gremlin_python.driver import client, serializer
from gremlin_python.driver.protocol import GremlinServerError
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NeptunePoolMonitor:
    def __init__(self, endpoint, pool_size=50):
        self.endpoint = endpoint
        self.pool_size = pool_size
        self._client = None
    
    def get_client(self):
        if self._client is None or self._client.is_closed():
            self._client = client.Client(
                f"wss://{self.endpoint}:8182/gremlin",
                "g",
                pool_size=self.pool_size,
                max_workers=self.pool_size,
                message_serializer=serializer.GraphSONSerializersV3d0()
            )
        return self._client
    
    def execute_with_retry(self, query, retries=3, timeout=30000):
        """带重试和超时的查询执行"""
        for attempt in range(retries):
            try:
                c = self.get_client()
                result = c.submitAsync(query, request_options={
                    "evalTimeout": timeout
                }).result()
                return result
            except GremlinServerError as e:
                if "timeout" in str(e).lower() and attempt < retries - 1:
                    wait = (attempt + 1) * 2
                    logger.warning(f"查询超时，{wait}s 后重试 ({attempt+1}/{retries})")
                    time.sleep(wait)
                else:
                    raise
            except Exception as e:
                if "pool" in str(e).lower() and attempt < retries - 1:
                    logger.warning(f"连接池问题，重建客户端后重试: {e}")
                    self._client = None
                    time.sleep(1)
                else:
                    raise
    
    def close(self):
        if self._client and not self._client.is_closed():
            self._client.close()

# 使用示例
monitor = NeptunePoolMonitor("my-neptune.cluster-xxxxx.us-east-1.neptune.amazonaws.com")
try:
    result = monitor.execute_with_retry("g.V().limit(10)")
    print(list(result))
finally:
    monitor.close()
```

**AWS CLI：查看实例连接数指标**

```bash
# 查看数据库连接数
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name DatabaseConnections \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-instance \
    --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 300 \
    --statistics Average Maximum

# 查看当前活跃查询数
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name ActiveQueries \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-instance \
    --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 300 \
    --statistics Average Maximum
```

#### 使用场景

- 高并发微服务架构中频繁出现连接超时
- 大促或流量高峰期间连接池耗尽
- 长时间运行的批量查询阻塞连接池
- 客户端应用重启后连接池冷启动

#### 潜在风险与注意事项

- 连接池大小并非越大越好，过大的连接池会增加 Neptune 服务端负载
- 每个 Neptune 实例有最大连接数限制（取决于实例规格），超出后新连接将被拒绝
- 使用 `connectionTTL` 强制周期性重建连接可避免服务端空闲断开导致的 `BrokenPipeError`
- 务必在 `finally` 块中关闭 `ResultSet` 的迭代器，确保连接归还池中

#### 本章小结

连接池耗尽通常不是单一原因导致，而是"并发高 + 查询慢 + 配置不当"的组合问题。优化策略包括：合理设置 `maxConnectionPoolSize` 和 `connectionTTL`、缩短慢查询超时、使用异步非阻塞客户端、以及必要时升级实例规格。

---

## 7.3 查询问题

### 7.3.1 查询超时

#### 解决的问题

Gremlin 或 SPARQL 查询执行时间超过客户端或服务端配置的超时阈值，返回 `TimeoutException` 或 `Request timed out` 错误。

#### 核心原理

Neptune 的查询超时机制分为三层：

1. **客户端超时**：Gremlin 客户端的 `evalTimeout` 或 SPARQL 客户端的 HTTP 超时
2. **服务端超时**：Neptune 参数组中的 `neptune_query_timeout`（默认 120 秒）
3. **HTTP API 超时**：API 请求的 `X-Request-Timeout` 头（默认 120 秒，最大 600 秒）

超时的根本原因通常是查询计划选择了低效的执行路径，如全表扫描而非索引查找、笛卡尔积、或深度遍历未限制步数。

#### 代码/配置实现

**Python：诊断慢查询**

```python
from gremlin_python.driver import client, serializer
import time
import json

class QueryProfiler:
    def __init__(self, endpoint):
        self.client = client.Client(
            f"wss://{endpoint}:8182/gremlin", "g",
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
    
    def profile_query(self, query, timeout=60000):
        """执行查询并返回执行计划信息"""
        # 启用查询分析
        profile_query = f"{query}.profile()"
        try:
            start = time.time()
            result = self.client.submitAsync(profile_query, request_options={
                "evalTimeout": timeout
            }).result()
            elapsed = time.time() - start
            
            data = list(result)
            print(f"查询耗时: {elapsed:.2f}s")
            
            # 解析 profile 输出
            for item in data:
                if hasattr(item, 'get'):
                    print(json.dumps(item, indent=2, default=str))
            
            return data
        except Exception as e:
            print(f"分析失败: {e}")
            return None
    
    def analyze_query_plan(self, query):
        """分析查询计划，识别潜在问题"""
        print("=== 查询计划分析 ===")
        
        # 检查常见反模式
        red_flags = []
        
        if ".V()" in query and ".has(" not in query:
            red_flags.append("⚠️ 无过滤条件的 V() 遍历，可能导致全表扫描")
        
        if ".repeat(" in query and ".times(" not in query and ".until(" not in query:
            red_flags.append("⚠️ repeat() 未限制步数（缺少 times()/until()），可能导致无限循环")
        
        if ".both()" in query and ".limit(" not in query:
            red_flags.append("⚠️ both() 遍历未加 limit()，可能返回大量结果")
        
        if ".fold()" in query and ".unfold()" in query:
            red_flags.append("⚠️ fold()+unfold() 组合可能导致内存溢出")
        
        if red_flags:
            for flag in red_flags:
                print(flag)
        else:
            print("✓ 未检测到明显反模式")
        
        return red_flags
    
    def close(self):
        self.client.close()

# 使用示例
profiler = QueryProfiler("my-neptune.cluster-xxxxx.neptune.amazonaws.com")
query = "g.V().hasLabel('person').out('knows').values('name')"
profiler.analyze_query_plan(query)
profiler.profile_query(query)
profiler.close()
```

**AWS CLI：修改查询超时参数**

```bash
# 查看当前查询超时配置
aws neptune describe-db-parameters \
    --db-parameter-group-name my-neptune-params \
    --query "Parameters[?ParameterName=='neptune_query_timeout']"

# 修改查询超时（单位：毫秒）
aws neptune modify-db-parameter-group \
    --db-parameter-group-name my-neptune-params \
    --parameters "ParameterName=neptune_query_timeout,ParameterValue=300000,ApplyMethod=pending-reboot"

# 重启实例使参数生效
aws neptune reboot-db-instance \
    --db-instance-identifier my-neptune-instance
```

**优化后的查询示例**

```groovy
// 反模式：无索引的全表扫描
g.V().has('name', 'Alice').out('knows')

// 优化：确保 hasLabel 配合索引
g.V().hasLabel('person').has('name', 'Alice').out('knows')

// 反模式：深度遍历无限制
g.V().repeat(out()).until(has('name', 'target'))

// 优化：限制遍历深度
g.V().repeat(out()).times(5).has('name', 'target')

// 反模式：未分页的大结果集
g.V().hasLabel('product').values('name')

// 优化：使用分页
g.V().hasLabel('product').values('name').fold().range(0, 1000)
```

#### 使用场景

- 业务查询响应时间从毫秒级退化到秒级
- 复杂图遍历（如社交网络好友推荐）超时
- 批量 ETL 任务中查询超时
- 新上线查询在生产环境首次执行超时

#### 潜在风险与注意事项

- 盲目增加 `neptune_query_timeout` 会掩盖查询效率问题，导致资源被长时间占用
- 超时时间应设置为业务可接受的最大等待时间，而非查询实际需要的时间
- 使用 `profile()` 步骤会增加查询开销，生产环境谨慎使用
- 部分 Gremlin 步骤（如 `barrier()`）会改变查询的流式行为，可能导致内存压力

#### 本章小结

查询超时的根因几乎总是查询效率问题而非时间配置问题。优先使用 `profile()` 分析查询计划，识别全表扫描、缺少索引、笛卡尔积等低效模式。优化索引策略和查询写法是根治超时的关键。

---

### 7.3.2 内存错误

#### 解决的问题

查询执行过程中抛出 `OutOfMemoryError`、`QueryEvaluationException: Query too large` 或 `Result set too large` 异常，导致查询被强制终止。

#### 核心原理

Neptune 为每个查询分配固定内存预算。当查询需要处理的数据量超过可用内存时，会触发内存错误。常见场景包括：

1. **查询结果集过大**：未分页的查询返回数百万条记录，序列化时撑爆内存
2. **中间结果膨胀**：`fold()`、`barrier()`、`aggregate()` 等步骤将中间数据全部加载到内存
3. **深度遍历的路径爆炸**：`repeat()` 遍历产生指数级增长的中间路径
4. **大属性值**：单个属性值超过 10MB 的序列化限制

#### 代码/配置实现

**Python：安全分页查询**

```python
from gremlin_python.driver import client, serializer

class SafeQueryExecutor:
    def __init__(self, endpoint, page_size=1000):
        self.client = client.Client(
            f"wss://{endpoint}:8182/gremlin", "g",
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        self.page_size = page_size
    
    def paginated_query(self, query_template, id_field="id", timeout=60000):
        """安全的分页查询，避免结果集过大"""
        offset = 0
        total = 0
        has_more = True
        
        while has_more:
            paginated = f"{query_template}.skip({offset}).limit({self.page_size})"
            try:
                result = self.client.submitAsync(paginated, request_options={
                    "evalTimeout": timeout
                }).result()
                
                rows = list(result)
                count = len(rows)
                
                if count == 0:
                    has_more = False
                else:
                    total += count
                    print(f"已获取 {total} 条记录（本批 {count} 条）")
                    yield rows
                    offset += self.page_size
                    
            except Exception as e:
                print(f"分页查询失败 (offset={offset}): {e}")
                # 二分法缩小分页大小
                if self.page_size > 100:
                    self.page_size //= 2
                    print(f"缩小分页大小为 {self.page_size}")
                    continue
                raise
    
    def safe_aggregation(self, query, timeout=120000):
        """安全执行聚合查询，使用 streaming 模式"""
        try:
            result = self.client.submitAsync(query, request_options={
                "evalTimeout": timeout
            }).result()
            
            # 使用迭代器而非 list() 避免全部加载到内存
            count = 0
            for item in result:
                count += 1
                if count % 10000 == 0:
                    print(f"已处理 {count} 条...")
            
            print(f"总计: {count} 条")
            return count
            
        except Exception as e:
            print(f"聚合查询失败: {e}")
            raise
    
    def close(self):
        self.client.close()

# 使用示例
executor = SafeQueryExecutor("my-neptune.cluster-xxxxx.neptune.amazonaws.com")
for batch in executor.paginated_query("g.V().hasLabel('product')"):
    for v in batch:
        print(v)
executor.close()
```

**AWS CLI：监控内存使用**

```bash
# 查看实例可用内存
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name FreeableMemory \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-instance \
    --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 60 \
    --statistics Average Minimum

# 查看查询超限次数
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name QueriesExceededMemoryLimit \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-instance \
    --start-time $(date -u -d '-1 day' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 3600 \
    --statistics Sum
```

**SPARQL：限制结果集大小**

```sparql
# 反模式：无限制查询
SELECT ?s ?p ?o WHERE { ?s ?p ?o }

# 优化：限制结果集
SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10000

# 优化：使用 OFFSET/LIMIT 分页
SELECT ?s ?p ?o WHERE { ?s ?p ?o } ORDER BY ?s LIMIT 1000 OFFSET 0
```

#### 使用场景

- 全量数据导出任务
- 复杂图分析查询（社区发现、最短路径）
- 未加限制的聚合查询
- 大属性值的批量读取

#### 潜在风险与注意事项

- `list()` 转换会将整个结果集加载到客户端内存，大数据量时应使用迭代器
- Neptune 单次查询结果集上限为 128MB（序列化后），超出会报错
- `aggregate()` 步骤的 scope 为 global 时会将数据保留到查询结束，增加内存压力
- 使用 `withSideEffect` 替代 `aggregate` 可减少内存占用

#### 本章小结

内存错误的本质是查询处理的数据量超过了实例可用内存。解决策略包括：使用分页查询、避免全局聚合步骤、使用流式迭代器处理结果、以及升级实例规格。建议在代码层面强制分页，而非依赖服务端限制。

---

### 7.3.3 查询计划异常（全表扫描替代索引查找）

#### 解决的问题

查询执行计划选择了全表扫描（Full Scan）而非索引查找（Index Lookup），导致查询性能远低于预期。即使数据量不大，查询也可能耗时数秒甚至数十秒。

#### 核心原理

Neptune 使用基于成本的优化器（CBO）选择查询计划。当以下条件满足时，优化器倾向于使用索引：

1. 查询中使用了 `hasLabel()` 指定标签
2. 谓词条件（`has()`）中的属性已创建索引
3. 索引的选择性足够高（即匹配的记录数占总记录数的比例足够小）

全表扫描的触发条件包括：

- 未使用 `hasLabel()` 或标签不匹配任何索引
- 查询条件中的属性未创建索引
- 索引选择性过低（如布尔类型字段），优化器认为扫描更优
- 使用了 `hasNot()`、`hasLabel(without())` 等否定条件

#### 代码/配置实现

**Python：检查索引状态**

```python
import boto3
import json

class IndexManager:
    def __init__(self, region="us-east-1"):
        self.neptune = boto3.client("neptune", region_name=region)
    
    def list_indices(self, endpoint):
        """列出 Neptune 集群的所有索引"""
        from gremlin_python.driver import client, serializer
        
        c = client.Client(
            f"wss://{endpoint}:8182/gremlin", "g",
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        
        # 查询索引信息
        query = """
        g.io("audit").option("query", "indexStatus")
        """
        try:
            result = c.submitAsync(query).result()
            indices = list(result)
            print("=== 索引状态 ===")
            for idx in indices:
                print(json.dumps(idx, indent=2, default=str))
            return indices
        finally:
            c.close()
    
    def create_index(self, endpoint, label, property_name, index_type="hash"):
        """创建属性索引"""
        from gremlin_python.driver import client, serializer
        
        c = client.Client(
            f"wss://{endpoint}:8182/gremlin", "g",
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        
        query = f"""
        g.io("index").option("label", "{label}")
            .option("property", "{property_name}")
            .option("type", "{index_type}")
            .option("name", "idx_{label}_{property_name}")
        """
        try:
            result = c.submitAsync(query).result()
            print(f"索引创建成功: idx_{label}_{property_name}")
            return list(result)
        finally:
            c.close()
    
    def analyze_query_index_usage(self, endpoint, query):
        """分析查询的索引使用情况"""
        from gremlin_python.driver import client, serializer
        
        c = client.Client(
            f"wss://{endpoint}:8182/gremlin", "g",
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        
        profile_q = f"{query}.profile()"
        try:
            result = c.submitAsync(profile_q).result()
            data = list(result)
            
            # 解析 profile 输出
            for item in data:
                if isinstance(item, dict):
                    analysis = item.get("@value", item)
                    print("=== 索引使用分析 ===")
                    
                    # 检查是否使用了索引
                    if "index" in str(analysis).lower():
                        print("✓ 查询使用了索引")
                    else:
                        print("⚠️ 查询未使用索引（可能执行全表扫描）")
                    
                    # 输出执行计划详情
                    print(json.dumps(analysis, indent=2, default=str))
            
            return data
        finally:
            c.close()

# 使用示例
mgr = IndexManager()
mgr.list_indices("my-neptune.cluster-xxxxx.neptune.amazonaws.com")
mgr.analyze_query_index_usage(
    "my-neptune.cluster-xxxxx.neptune.amazonaws.com",
    "g.V().hasLabel('person').has('email', 'alice@example.com')"
)
```

**AWS CLI：查看查询计划统计**

```bash
# 查看全表扫描查询数
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name FullScans \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-instance \
    --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 300 \
    --statistics Sum
```

**索引创建命令**

```groovy
// 创建哈希索引（精确匹配）
g.io("index").option("label", "person")
    .option("property", "email")
    .option("type", "hash")
    .option("name", "idx_person_email")

// 创建范围索引（范围查询、排序）
g.io("index").option("label", "person")
    .option("property", "age")
    .option("type", "range")
    .option("name", "idx_person_age")

// 创建全文索引（模糊匹配）
g.io("index").option("label", "product")
    .option("property", "description")
    .option("type", "fulltext")
    .option("name", "idx_product_description")

// 查看所有索引
g.io("audit").option("query", "indexStatus")
```

#### 使用场景

- 查询响应时间突然从毫秒级退化到秒级
- 数据量增长后查询性能急剧下降
- 新上线的查询在生产环境表现异常
- 索引创建后查询性能未改善

#### 潜在风险与注意事项

- 索引创建是异步操作，创建期间查询仍可能使用全表扫描
- 索引会占用存储空间和写入性能，不要为每个属性都创建索引
- 选择性低的属性（如性别、状态码）不适合建索引
- 删除索引前需确认没有查询依赖该索引
- Neptune 最多支持 100 个索引

#### 本章小结

查询计划异常的核心诊断方法是使用 `profile()` 步骤查看执行计划。确保查询包含 `hasLabel()` 且过滤条件对应的属性已创建索引。索引策略应基于实际查询模式设计，而非盲目为所有属性建索引。

---

## 7.4 性能问题

### 7.4.1 高 CPU 使用率

#### 解决的问题

Neptune 实例的 CPU 使用率持续超过 80%，导致查询延迟增加、吞吐量下降，甚至触发服务降级。

#### 核心原理

CPU 高负载的常见原因包括：

1. **复杂查询**：深度遍历、笛卡尔积、大量聚合计算
2. **高并发查询**：同时运行的查询数超过实例 CPU 核数的处理能力
3. **序列化/反序列化开销**：大结果集的序列化消耗大量 CPU
4. **索引维护**：大量写入操作触发的索引更新
5. **备份/维护操作**：自动备份、手动快照期间的 CPU 开销

#### 代码/配置实现

**Python：实时监控与诊断**

```python
import boto3
import time
from datetime import datetime, timedelta

class CpuMonitor:
    def __init__(self, instance_id, region="us-east-1"):
        self.cloudwatch = boto3.client("cloudwatch", region_name=region)
        self.instance_id = instance_id
    
    def get_cpu_metrics(self, minutes=60):
        """获取 CPU 使用率指标"""
        end = datetime.utcnow()
        start = end - timedelta(minutes=minutes)
        
        response = self.cloudwatch.get_metric_statistics(
            Namespace="AWS/Neptune",
            MetricName="CPUUtilization",
            Dimensions=[{"Name": "DBInstanceIdentifier", "Value": self.instance_id}],
            StartTime=start,
            EndTime=end,
            Period=60,
            Statistics=["Average", "Maximum", "Minimum"]
        )
        
        datapoints = sorted(response["Datapoints"], key=lambda x: x["Timestamp"])
        
        print(f"=== CPU 使用率（最近 {minutes} 分钟）===")
        for dp in datapoints[-10:]:  # 最近 10 个数据点
            print(f"  {dp['Timestamp']}: 平均={dp['Average']:.1f}% 最大={dp['Maximum']:.1f}%")
        
        avg = sum(dp["Average"] for dp in datapoints) / len(datapoints) if datapoints else 0
        print(f"\n平均 CPU: {avg:.1f}%")
        
        if avg > 80:
            print("⚠️ CPU 使用率过高，建议排查")
        elif avg > 60:
            print("⚡ CPU 使用率偏高，建议关注")
        else:
            print("✓ CPU 使用率正常")
        
        return datapoints
    
    def get_top_queries(self, endpoint, limit=10):
        """获取当前最耗时的查询"""
        from gremlin_python.driver import client, serializer
        
        c = client.Client(
            f"wss://{endpoint}:8182/gremlin", "g",
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        
        # 查询当前活跃查询
        query = "g.io('audit').option('query', 'currentQueries')"
        try:
            result = c.submitAsync(query).result()
            queries = list(result)
            
            print(f"\n=== 当前活跃查询（Top {limit}）===")
            for q in queries[:limit]:
                if isinstance(q, dict):
                    print(f"  ID: {q.get('queryId', 'N/A')}")
                    print(f"  耗时: {q.get('elapsedMillis', 'N/A')}ms")
                    print(f"  查询: {q.get('queryString', 'N/A')[:200]}")
                    print()
            return queries
        finally:
            c.close()
    
    def correlate_queries_and_cpu(self, endpoint):
        """关联查询和 CPU 使用率"""
        print("=== 关联分析 ===")
        print("1. 获取 CPU 峰值时间段...")
        cpu_data = self.get_cpu_metrics(30)
        
        print("2. 获取该时间段内的活跃查询...")
        queries = self.get_top_queries(endpoint)
        
        print("3. 分析结果:")
        print("   - 如果 CPU 高且有大量复杂查询 → 优化查询或升级实例")
        print("   - 如果 CPU 高但查询少 → 检查后台任务（备份、索引维护）")
        print("   - 如果 CPU 高且连接数高 → 考虑连接池优化或读写分离")

# 使用示例
monitor = CpuMonitor("my-neptune-instance")
monitor.correlate_queries_and_cpu("my-neptune.cluster-xxxxx.neptune.amazonaws.com")
```

**AWS CLI：CPU 相关指标批量获取**

```bash
#!/bin/bash
# 批量获取 CPU 相关指标
INSTANCE_ID="my-neptune-instance"
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
START_TIME=$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ)

for metric in CPUUtilization ActiveQueries DatabaseConnections; do
    echo "=== $metric ==="
    aws cloudwatch get-metric-statistics \
        --namespace AWS/Neptune \
        --metric-name $metric \
        --dimensions Name=DBInstanceIdentifier,Value=$INSTANCE_ID \
        --start-time $START_TIME \
        --end-time $END_TIME \
        --period 300 \
        --statistics Average Maximum \
        --output table
    echo
done
```

#### 使用场景

- 业务高峰期（如电商大促）CPU 飙高
- 数据批量导入期间 CPU 持续高负载
- 查询性能退化伴随 CPU 升高
- 实例规格评估和扩容决策

#### 潜在风险与注意事项

- CPU 使用率超过 90% 时，Neptune 可能触发查询排队和限流
- 突发 CPU 峰值（持续 < 5 分钟）通常不需要扩容，持续高负载才需关注
- 升级实例规格（如 r5.large → r5.xlarge）是解决 CPU 问题的直接手段，但应先优化查询
- 使用 Performance Insights 可以精确识别消耗 CPU 的具体查询

#### 本章小结

高 CPU 使用率的排查路径为：确认 CPU 峰值时间段 → 关联该时间段的活跃查询 → 识别慢查询并优化 → 如仍不足再考虑扩容。优化查询永远是性价比最高的方案。

---

### 7.4.2 IOPS 上限达到

#### 解决的问题

Neptune 实例的 IOPS 使用率达到预配置上限，导致读写延迟增加、吞吐量受限，表现为 `IOPS limit reached` 或存储延迟飙升。

#### 核心原理

Neptune 的 IOPS 取决于实例规格和存储配置：

- **gp2（通用型 SSD）**：基准 IOPS = 3 × 存储容量（GB），最大突发 IOPS = 3000（30 分钟内）
- **io1（预配置 IOPS SSD）**：按预配置值提供，最大为实例规格上限
- **io2（块存储 Express）**：更高性能和更低延迟

IOPS 上限达到的常见原因：

1. **热分区**：数据访问集中在少数存储分区，导致单个分区的 IOPS 上限被突破
2. **大量写入**：批量导入、频繁更新操作消耗大量写入 IOPS
3. **全表扫描查询**：读取大量数据页，消耗读取 IOPS
4. **存储容量不足**：gp2 的基准 IOPS 与容量挂钩，容量不足时 IOPS 受限

#### 代码/配置实现

**Python：IOPS 监控与诊断**

```python
import boto3
from datetime import datetime, timedelta

class IopsMonitor:
    def __init__(self, instance_id, region="us-east-1"):
        self.cw = boto3.client("cloudwatch", region_name=region)
        self.instance_id = instance_id
    
    def get_iops_metrics(self, minutes=60):
        """获取 IOPS 相关指标"""
        end = datetime.utcnow()
        start = end - timedelta(minutes=minutes)
        
        metrics = {
            "ReadIOPS": "读取 IOPS",
            "WriteIOPS": "写入 IOPS",
            "ReadLatency": "读取延迟 (ms)",
            "WriteLatency": "写入延迟 (ms)",
            "DiskQueueDepth": "磁盘队列深度"
        }
        
        results = {}
        for metric, label in metrics.items():
            response = self.cw.get_metric_statistics(
                Namespace="AWS/Neptune",
                MetricName=metric,
                Dimensions=[{"Name": "DBInstanceIdentifier", "Value": self.instance_id}],
                StartTime=start,
                EndTime=end,
                Period=300,
                Statistics=["Average", "Maximum"]
            )
            results[metric] = response["Datapoints"]
        
        print(f"=== IOPS 分析（最近 {minutes} 分钟）===")
        for metric, label in metrics.items():
            datapoints = sorted(results[metric], key=lambda x: x["Timestamp"])
            if datapoints:
                max_val = max(dp["Maximum"] for dp in datapoints)
                avg_val = sum(dp["Average"] for dp in datapoints) / len(datapoints)
                print(f"  {label}: 平均={avg_val:.1f} 峰值={max_val:.1f}")
        
        # 检查磁盘队列深度（IOPS 瓶颈指标）
        queue = sorted(results.get("DiskQueueDepth", []), key=lambda x: x["Timestamp"])
        if queue:
            max_queue = max(dp["Maximum"] for dp in queue)
            if max_queue > 10:
                print(f"\n⚠️ 磁盘队列深度峰值 {max_queue:.1f}，可能存在 IOPS 瓶颈")
            else:
                print(f"\n✓ 磁盘队列深度正常（峰值 {max_queue:.1f}）")
        
        return results
    
    def estimate_iops_limit(self, storage_gb, storage_type="gp2"):
        """估算 IOPS 上限"""
        if storage_type == "gp2":
            baseline = min(storage_gb * 3, 16000)
            burst = min(3000, baseline * 3)
            print(f"\n=== IOPS 上限估算 ===")
            print(f"  存储类型: gp2")
            print(f"  存储容量: {storage_gb} GB")
            print(f"  基准 IOPS: {baseline}")
            print(f"  突发 IOPS: {burst}（最多持续 30 分钟）")
            return baseline, burst
        elif storage_type == "io1":
            print(f"\n=== IOPS 上限估算 ===")
            print(f"  存储类型: io1")
            print(f"  预配置 IOPS: 取决于配置")
            return None, None
    
    def check_hot_partitions(self, endpoint):
        """检查热分区（通过查询延迟分布间接判断）"""
        from gremlin_python.driver import client, serializer
        
        c = client.Client(
            f"wss://{endpoint}:8182/gremlin", "g",
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        
        # 检查存储统计
        query = "g.io('audit').option('query', 'storageStats')"
        try:
            result = c.submitAsync(query).result()
            stats = list(result)
            print("\n=== 存储统计 ===")
            for s in stats:
                if isinstance(s, dict):
                    print(f"  分区数: {s.get('partitionCount', 'N/A')}")
                    print(f"  总存储: {s.get('totalStorageBytes', 'N/A')} bytes")
                    print(f"  最大分区大小: {s.get('maxPartitionSizeBytes', 'N/A')} bytes")
                    
                    # 检查分区倾斜
                    max_size = s.get("maxPartitionSizeBytes", 0)
                    avg_size = s.get("totalStorageBytes", 0) / max(s.get("partitionCount", 1), 1)
                    if max_size > avg_size * 3:
                        print("  ⚠️ 检测到分区倾斜，可能存在热分区")
                    else:
                        print("  ✓ 分区分布均匀")
            return stats
        finally:
            c.close()

# 使用示例
monitor = IopsMonitor("my-neptune-instance")
monitor.get_iops_metrics()
monitor.estimate_iops_limit(1000, "gp2")
```

**AWS CLI：IOPS 相关指标**

```bash
# 查看 IOPS 使用情况
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name ReadIOPS \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-instance \
    --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 60 \
    --statistics Sum Average Maximum

# 查看存储配置
aws neptune describe-db-instances \
    --db-instance-identifier my-neptune-instance \
    --query "DBInstances[*].{Storage:AllocatedStorage,Type:StorageType,Iops:Iops}" \
    --output table
```

#### 使用场景

- 数据批量导入期间 IOPS 打满
- 业务高峰期查询延迟突增
- 存储扩容后 IOPS 未改善
- 磁盘队列深度持续偏高

#### 潜在风险与注意事项

- gp2 的突发 IOPS 用完后性能会回退到基准值，可能导致延迟陡增
- 热分区问题无法通过扩容存储解决，需要优化数据分布
- 从 gp2 迁移到 io1/io2 需要创建新集群，涉及数据迁移
- IOPS 上限是实例级别限制，读写分离无法绕过

#### 本章小结

IOPS 瓶颈的排查路径：确认 IOPS 使用率 → 区分读/写 IOPS → 检查磁盘队列深度 → 判断是容量问题还是热分区问题。短期方案包括优化查询减少 IO、使用缓存；长期方案包括升级存储类型、优化数据分布。

---

### 7.4.3 高存储延迟

#### 解决的问题

Neptune 的存储层延迟持续偏高，表现为查询响应时间增加、写入提交延迟、以及 `StorageFull` 或 `ThrottlingException` 异常。

#### 核心原理

Neptune 的存储子系统基于 AWS 分布式存储架构。高存储延迟的常见原因：

1. **Compaction（压缩合并）**：Neptune 后台自动执行 SSTable 合并，消耗大量 IO 资源
2. **备份进行中**：自动快照或手动备份期间，存储层 I/O 优先级被调整
3. **存储扩容**：动态扩容期间数据重新分布
4. **硬件退化**：底层存储介质出现性能问题（罕见）
5. **写入量过大**：持续高写入导致存储层排队

#### 代码/配置实现

**Python：存储延迟诊断**

```python
import boto3
from datetime import datetime, timedelta

class StorageLatencyDiagnoser:
    def __init__(self, instance_id, region="us-east-1"):
        self.cw = boto3.client("cloudwatch", region_name=region)
        self.instance_id = instance_id
    
    def diagnose_latency(self, hours=3):
        """全面诊断存储延迟"""
        end = datetime.utcnow()
        start = end - timedelta(hours=hours)
        
        # 获取延迟指标
        latency_metrics = {
            "ReadLatency": "读取延迟",
            "WriteLatency": "写入延迟",
        }
        
        print(f"=== 存储延迟诊断（最近 {hours} 小时）===")
        
        for metric, label in latency_metrics.items():
            response = self.cw.get_metric_statistics(
                Namespace="AWS/Neptune",
                MetricName=metric,
                Dimensions=[{"Name": "DBInstanceIdentifier", "Value": self.instance_id}],
                StartTime=start,
                EndTime=end,
                Period=300,
                Statistics=["Average", "Maximum", "p95", "p99"]
            )
            
            datapoints = sorted(response["Datapoints"], key=lambda x: x["Timestamp"])
            if datapoints:
                avg = sum(dp["Average"] for dp in datapoints) / len(datapoints)
                max_val = max(dp["Maximum"] for dp in datapoints)
                print(f"\n{label}:")
                print(f"  平均: {avg:.2f} ms")
                print(f"  峰值: {max_val:.2f} ms")
                
                if max_val > 50:
                    print(f"  ⚠️ 延迟偏高（> 50ms）")
                elif max_val > 20:
                    print(f"  ⚡ 延迟中等（20-50ms）")
                else:
                    print(f"  ✓ 延迟正常（< 20ms）")
        
        # 关联分析：检查同时段的其他指标
        print("\n=== 关联指标分析 ===")
        
        # 检查备份状态
        backup_response = self.cw.get_metric_statistics(
            Namespace="AWS/Neptune",
            MetricName="BackupRetentionPeriodStorageUsed",
            Dimensions=[{"Name": "DBInstanceIdentifier", "Value": self.instance_id}],
            StartTime=start,
            EndTime=end,
            Period=3600,
            Statistics=["Average"]
        )
        
        # 检查写入量
        write_response = self.cw.get_metric_statistics(
            Namespace="AWS/Neptune",
            MetricName="WriteIOPS",
            Dimensions=[{"Name": "DBInstanceIdentifier", "Value": self.instance_id}],
            StartTime=start,
            EndTime=end,
            Period=300,
            Statistics=["Sum"]
        )
        
        write_datapoints = sorted(write_response["Datapoints"], key=lambda x: x["Timestamp"])
        if write_datapoints:
            total_writes = sum(dp["Sum"] for dp in write_datapoints)
            print(f"  写入总量: {total_writes:.0f} IOPS")
            
            # 检查写入峰值
            max_write = max(dp["Sum"] for dp in write_datapoints)
            print(f"  写入峰值: {max_write:.0f} IOPS/5min")
        
        print("\n=== 诊断结论 ===")
        print("可能原因分析:")
        print("  1. Compaction 进行中 → 检查维护窗口")
        print("  2. 备份进行中 → 检查自动备份时间")
        print("  3. 写入量过大 → 评估写入速率")
        print("  4. 存储扩容中 → 检查存储指标")
        
        return latency_metrics

# 使用示例
diagnoser = StorageLatencyDiagnoser("my-neptune-instance")
diagnoser.diagnose_latency()
```

**AWS CLI：检查备份和存储状态**

```bash
# 检查备份窗口
aws neptune describe-db-instances \
    --db-instance-identifier my-neptune-instance \
    --query "DBInstances[*].{Window:PreferredBackupWindow,Maintenance:PreferredMaintenanceWindow}" \
    --output table

# 检查存储使用趋势
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name FreeStorageSpace \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-instance \
    --start-time $(date -u -d '-7 days' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 86400 \
    --statistics Average \
    --output table

# 检查最近的事件（可能包含 compaction 信息）
aws neptune describe-events \
    --source-type db-instance \
    --source-identifier my-neptune-instance \
    --duration 360 \
    --query "Events[*].{Date:Date,Message:Message}" \
    --output table
```

#### 使用场景

- 查询延迟周期性升高（可能与备份窗口重合）
- 大量写入后存储延迟持续偏高
- 存储扩容后延迟未恢复正常
- 维护窗口期间出现性能退化

#### 潜在风险与注意事项

- Compaction 是正常后台操作，无法禁用，但可以通过调整维护窗口避开业务高峰期
- 备份期间的延迟升高通常是暂时的，备份完成后自动恢复
- 如果存储延迟持续偏高且与备份/compaction 无关，应考虑存储硬件问题，联系 AWS 支持
- 写入延迟对图数据库的影响比读取延迟更大，因为写入涉及索引更新

#### 本章小结

高存储延迟的排查应首先关联时间线，确认是否与备份窗口或维护窗口重合。如果是 compaction 或备份导致，调整窗口时间即可。如果与写入负载相关，应评估写入速率并考虑批量写入优化。

---

## 7.5 数据问题

### 7.5.1 数据不一致

#### 解决的问题

读取到的数据与预期不一致，包括：写入后立即读取不到、不同副本返回不同结果、聚合查询结果异常等。

#### 核心原理

Neptune 提供"最终一致性"保证。数据不一致的常见原因：

1. **并发写入冲突**：多个客户端同时写入同一顶点/边，最后写入者获胜（LWW），但读取可能看到中间状态
2. **复制延迟**：主节点写入后，只读副本尚未同步完成
3. **事务隔离**：Gremlin 脚本在单个事务内是原子性的，但跨多个请求的操作不保证原子性
4. **缓存过期**：Neptune 的查询缓存返回了过期数据

#### 代码/配置实现

**Python：一致性检查与诊断**

```python
from gremlin_python.driver import client, serializer
import time
import hashlib

class ConsistencyChecker:
    def __init__(self, primary_endpoint, replica_endpoint=None):
        self.primary = client.Client(
            f"wss://{primary_endpoint}:8182/gremlin", "g",
            message_serializer=serializer.GraphSONSerializersV3d0()
        )
        self.replica = None
        if replica_endpoint:
            self.replica = client.Client(
                f"wss://{replica_endpoint}:8182/gremlin", "g",
                message_serializer=serializer.GraphSONSerializersV3d0()
            )
    
    def write_and_verify(self, vertex_id, property_name, value, consistency_check=True):
        """写入并验证一致性"""
        # 写入数据
        write_query = f"""
        g.V('{vertex_id}').property('{property_name}', '{value}')
        """
        try:
            self.primary.submitAsync(write_query).result()
            print(f"[WRITE] 已写入: {vertex_id}.{property_name} = {value}")
        except Exception as e:
            print(f"[FAIL] 写入失败: {e}")
            return False
        
        if not consistency_check:
            return True
        
        # 立即读取验证
        time.sleep(0.5)  # 等待复制
        read_query = f"g.V('{vertex_id}').values('{property_name}')"
        
        # 从主节点读取
        primary_val = list(self.primary.submitAsync(read_query).result())
        print(f"[READ-primary] 读取到: {primary_val}")
        
        # 从副本读取（如果有）
        if self.replica:
            replica_val = list(self.replica.submitAsync(read_query).result())
            print(f"[READ-replica] 读取到: {replica_val}")
            
            if primary_val != replica_val:
                print("⚠️ 主从数据不一致！")
                return False
        
        return True
    
    def check_replication_lag(self):
        """检查复制延迟"""
        if not self.replica:
            print("未配置副本端点")
            return None
        
        # 写入一个带时间戳的数据
        ts = str(time.time())
        test_id = "consistency_test_vertex"
        
        self.primary.submitAsync(
            f"g.V('{test_id}').property('ts', '{ts}')"
        ).result()
        
        # 轮询副本直到数据同步
        max_wait = 30
        for i in range(max_wait):
            try:
                result = list(self.replica.submitAsync(
                    f"g.V('{test_id}').values('ts')"
                ).result())
                if result and result[0] == ts:
                    print(f"复制延迟: {i} 秒")
                    return i
            except:
                pass
            time.sleep(1)
        
        print(f"⚠️ 超过 {max_wait} 秒仍未同步")
        return None
    
    def detect_conflicts(self, vertex_id):
        """检测顶点上的冲突数据"""
        query = f"g.V('{vertex_id}').elementMap()"
        result = list(self.primary.submitAsync(query).result())
        
        print(f"=== 数据冲突检测: {vertex_id} ===")
        for item in result:
            if isinstance(item, dict):
                # 检查多值属性
                for key, value in item.items():
                    if isinstance(value, list) and len(value) > 1:
                        print(f"  ⚠️ 多值属性: {key} = {value}")
                        print(f"     可能原因: 并发写入导致属性值未合并")
        
        return result
    
    def close(self):
        self.primary.close()
        if self.replica:
            self.replica.close()

# 使用示例
checker = ConsistencyChecker(
    primary_endpoint="primary-neptune.cluster-xxxxx.neptune.amazonaws.com",
    replica_endpoint="replica-neptune.cluster-xxxxx.neptune.amazonaws.com"
)
checker.write_and_verify("vertex-1", "status", "active")
checker.check_replication_lag()
checker.detect_conflicts("vertex-1")
checker.close()
```

**AWS CLI：检查复制延迟**

```bash
# 查看只读副本的复制延迟
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name ReplicaLag \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-replica \
    --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 60 \
    --statistics Average Maximum
```

#### 使用场景

- 写入后立即查询返回空结果
- 读写分离架构中主从数据不一致
- 高并发写入场景下的数据异常
- 数据迁移或同步后的校验

#### 潜在风险与注意事项

- Neptune 不提供强一致性读，对一致性要求高的场景应使用主节点读取
- 使用 `consistency_check` 参数控制是否验证，避免每次写入都增加开销
- 复制延迟超过 60 秒时应告警，可能表明副本实例规格不足
- 并发写入冲突的解决依赖最后写入者获胜策略，无法保证业务语义正确性

#### 本章小结

数据不一致的排查核心是区分"最终一致性导致的短暂不一致"和"真正的数据损坏"。前者通过主节点读取或等待复制完成解决，后者需要检查并发写入逻辑和事务边界。建议对关键业务使用主节点读取，对分析类查询使用只读副本。

---

### 7.5.2 导入失败

#### 解决的问题

使用 Neptune 批量导入工具（如 `neptune-export`、`neptune-bulk-import`）或直接写入时出现失败，数据无法正确加载到数据库中。

#### 核心原理

Neptune 支持多种数据导入方式：

1. **AWS Glue ETL**：通过 Apache TinkerPop/Gremlin 连接器
2. **neptune-bulk-import**：基于 S3 的批量加载器，支持 CSV 和 JSON 格式
3. **Gremlin 客户端直接写入**：逐条或批量提交

导入失败的常见原因：

- **格式错误**：CSV 列数不匹配、JSON 结构错误、编码问题
- **Schema 不匹配**：属性类型冲突、缺少必填字段
- **S3 权限不足**：IAM 角色缺少 S3 读取权限
- **数据量超限**：单文件超过 5GB 或单批次超过 100MB
- **特殊字符**：CSV 中未转义的引号、换行符

#### 代码/配置实现

**Python：导入前数据校验**

```python
import csv
import json
import os
import boto3
from typing import List, Dict, Any

class ImportValidator:
    def __init__(self, s3_bucket, s3_prefix):
        self.s3 = boto3.client("s3")
        self.bucket = s3_bucket
        self.prefix = s3_prefix
    
    def validate_csv_file(self, file_key: str, expected_columns: List[str]) -> Dict[str, Any]:
        """验证 CSV 文件格式"""
        result = {"valid": True, "errors": [], "warnings": [], "row_count": 0}
        
        try:
            response = self.s3.get_object(Bucket=self.bucket, Key=file_key)
            content = response["Body"].read().decode("utf-8-sig")  # 处理 BOM
            lines = content.splitlines()
            
            if not lines:
                result["valid"] = False
                result["errors"].append("文件为空")
                return result
            
            # 检查表头
            reader = csv.reader(lines)
            header = next(reader)
            
            if len(header) != len(expected_columns):
                result["valid"] = False
                result["errors"].append(
                    f"列数不匹配: 实际 {len(header)} 列, 期望 {len(expected_columns)} 列"
                )
            
            # 检查每行
            for i, row in enumerate(reader, start=2):
                if len(row) != len(expected_columns):
                    result["errors"].append(f"第 {i} 行列数异常: {len(row)} 列")
                    result["valid"] = False
                
                # 检查空值
                for j, val in enumerate(row):
                    if not val.strip() and j < len(expected_columns):
                        result["warnings"].append(f"第 {i} 行第 {j+1} 列为空")
                
                result["row_count"] += 1
                
                # 限制检查行数
                if result["row_count"] > 10000:
                    result["warnings"].append("仅检查前 10000 行")
                    break
            
            # 检查文件大小
            file_size = response["ContentLength"]
            if file_size > 5 * 1024 * 1024 * 1024:  # 5GB
                result["warnings"].append("文件超过 5GB，建议分割")
            
        except Exception as e:
            result["valid"] = False
            result["errors"].append(f"读取文件失败: {str(e)}")
        
        return result
    
    def validate_json_file(self, file_key: str) -> Dict[str, Any]:
        """验证 JSON 文件格式"""
        result = {"valid": True, "errors": [], "warnings": [], "object_count": 0}
        
        try:
            response = self.s3.get_object(Bucket=self.bucket, Key=file_key)
            content = response["Body"].read().decode("utf-8")
            
            # 尝试解析 JSON
            try:
                data = json.loads(content)
            except json.JSONDecodeError as e:
                result["valid"] = False
                result["errors"].append(f"JSON 解析失败: {str(e)}")
                return result
            
            # 检查结构
            if isinstance(data, list):
                result["object_count"] = len(data)
                for i, obj in enumerate(data[:100]):
                    if not isinstance(obj, dict):
                        result["errors"].append(f"第 {i+1} 个对象不是 JSON 对象")
                        result["valid"] = False
            elif isinstance(data, dict):
                result["object_count"] = 1
            else:
                result["valid"] = False
                result["errors"].append("JSON 根元素必须是对象或数组")
            
        except Exception as e:
            result["valid"] = False
            result["errors"].append(f"读取文件失败: {str(e)}")
        
        return result
    
    def check_s3_permissions(self) -> bool:
        """检查 S3 权限"""
        try:
            # 检查桶权限
            self.s3.head_bucket(Bucket=self.bucket)
            
            # 检查前缀下的文件
            response = self.s3.list_objects_v2(
                Bucket=self.bucket, Prefix=self.prefix, MaxKeys=5
            )
            if "Contents" in response:
                print(f"✓ S3 权限正常，找到 {len(response['Contents'])} 个文件")
                return True
            else:
                print("⚠️ 前缀下没有文件")
                return False
                
        except Exception as e:
            print(f"✗ S3 权限检查失败: {e}")
            return False
    
    def generate_import_manifest(self, files: List[str]) -> Dict:
        """生成批量导入清单文件"""
        manifest = {
            "source": f"s3://{self.bucket}/{self.prefix}",
            "format": "csv",
            "files": files,
            "failOnError": True,
            "updateSingleCardinalityProperties": True,
            "region": "us-east-1"
        }
        return manifest

# 使用示例
validator = ImportValidator("my-neptune-data-bucket", "import/2024/")
validator.check_s3_permissions()
result = validator.validate_csv_file("import/2024/vertices.csv", 
    ["~id", "~label", "name: String", "age: Int"])
print(json.dumps(result, indent=2, ensure_ascii=False))
```

**AWS CLI：批量导入操作**

```bash
# 1. 创建 S3 桶并上传数据
aws s3 cp ./data/ s3://my-neptune-data-bucket/import/ --recursive

# 2. 创建 IAM 角色（允许 Neptune 访问 S3）
aws iam create-role \
    --role-name neptune-s3-import-role \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "rds.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }]
    }'

# 3. 附加 S3 访问策略
aws iam put-role-policy \
    --role-name neptune-s3-import-role \
    --policy-name s3-import-access \
    --policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": ["s3:GetObject", "s3:ListBucket"],
            "Resource": [
                "arn:aws:s3:::my-neptune-data-bucket",
                "arn:aws:s3:::my-neptune-data-bucket/*"
            ]
        }]
    }'

# 4. 启动批量导入
aws neptune start-load-job \
    --db-cluster-identifier my-neptune-cluster \
    --source s3://my-neptune-data-bucket/import/ \
    --format csv \
    --s3-bucket-role-arn arn:aws:iam::123456789012:role/neptune-s3-import-role

# 5. 查看导入状态
aws neptune describe-pending-maintenance-actions \
    --resource-identifier my-neptune-cluster
```

#### 使用场景

- 首次数据迁移到 Neptune
- 定期数据同步任务
- 数据格式变更后的导入
- 跨账号数据导入

#### 潜在风险与注意事项

- CSV 文件必须包含表头行，且列名必须符合 Neptune 命名规范
- 导入过程中 Neptune 集群仍可正常服务，但性能可能受影响
- 大文件建议分割为多个 1GB 左右的文件并行导入
- 导入失败后需要清理部分写入的数据，Neptune 不提供导入事务回滚

#### 本章小结

导入失败的最常见原因是数据格式问题和 S3 权限配置错误。建议在导入前使用上述校验脚本检查数据文件，并确保 IAM 角色配置正确。对于大规模导入，建议使用 `neptune-bulk-import` 工具而非逐条写入。

---

### 7.5.3 数据丢失

#### 解决的问题

Neptune 中的数据意外丢失，包括顶点/边被误删除、属性值丢失、或整个数据库被清空。

#### 核心原理

数据丢失的常见原因：

1. **误操作删除**：执行了无过滤条件的 `g.V().drop()` 或 `DROP ALL`
2. **备份失败**：自动备份或手动快照未成功创建
3. **保留期过期**：备份保留期（默认 1 天）过短，超过后无法恢复
4. **并发写入覆盖**：最后写入者获胜策略下，旧数据被新数据覆盖
5. **TTL 过期**：如果启用了 TTL（Time-to-Live），数据自动过期删除

#### 代码/配置实现

**Python：数据恢复与备份管理**

```python
import boto3
from datetime import datetime, timedelta
import json

class BackupManager:
    def __init__(self, cluster_id, region="us-east-1"):
        self.neptune = boto3.client("neptune", region_name=region)
        self.cluster_id = cluster_id
    
    def list_snapshots(self):
        """列出所有可用的快照"""
        print(f"=== 集群 {self.cluster_id} 的快照列表 ===")
        
        # 自动快照
        auto = self.neptune.describe_db_cluster_snapshots(
            DBClusterIdentifier=self.cluster_id,
            SnapshotType="automated"
        )
        
        # 手动快照
        manual = self.neptune.describe_db_cluster_snapshots(
            DBClusterIdentifier=self.cluster_id,
            SnapshotType="manual"
        )
        
        all_snapshots = []
        
        print("\n自动快照:")
        for snap in auto.get("DBClusterSnapshots", []):
            info = {
                "id": snap["DBClusterSnapshotIdentifier"],
                "创建时间": snap["SnapshotCreateTime"].strftime("%Y-%m-%d %H:%M:%S"),
                "状态": snap["Status"],
                "类型": "自动"
            }
            all_snapshots.append(info)
            print(f"  - {info['id']} ({info['创建时间']}) [{info['状态']}]")
        
        print("\n手动快照:")
        for snap in manual.get("DBClusterSnapshots", []):
            info = {
                "id": snap["DBClusterSnapshotIdentifier"],
                "创建时间": snap["SnapshotCreateTime"].strftime("%Y-%m-%d %H:%M:%S"),
                "状态": snap["Status"],
                "类型": "手动"
            }
            all_snapshots.append(info)
            print(f"  - {info['id']} ({info['创建时间']}) [{info['状态']}]")
        
        return all_snapshots
    
    def create_manual_snapshot(self, snapshot_id=None):
        """创建手动快照"""
        if not snapshot_id:
            snapshot_id = f"{self.cluster_id}-manual-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        try:
            response = self.neptune.create_db_cluster_snapshot(
                DBClusterIdentifier=self.cluster_id,
                DBClusterSnapshotIdentifier=snapshot_id
            )
            print(f"快照创建中: {snapshot_id}")
            return response["DBClusterSnapshot"]
        except Exception as e:
            print(f"快照创建失败: {e}")
            return None
    
    def restore_from_snapshot(self, snapshot_id, new_cluster_id):
        """从快照恢复新集群"""
        try:
            response = self.neptune.restore_db_cluster_from_snapshot(
                DBClusterIdentifier=new_cluster_id,
                SnapshotIdentifier=snapshot_id,
                Engine="neptune"
            )
            print(f"正在从 {snapshot_id} 恢复到 {new_cluster_id}")
            return response["DBCluster"]
        except Exception as e:
            print(f"恢复失败: {e}")
            return None
    
    def check_backup_config(self):
        """检查备份配置"""
        response = self.neptune.describe_db_clusters(
            DBClusterIdentifier=self.cluster_id
        )
        cluster = response["DBClusters"][0]
        
        print("=== 备份配置 ===")
        print(f"  备份保留期: {cluster['BackupRetentionPeriod']} 天")
        print(f"  备份窗口: {cluster.get('PreferredBackupWindow', '未设置')}")
        print(f"  最新恢复时间: {cluster.get('LatestRestorableTime', 'N/A')}")
        
        if cluster["BackupRetentionPeriod"] < 7:
            print("  ⚠️ 备份保留期小于 7 天，建议延长")
        
        return cluster
    
    def point_in_time_recovery(self, restore_time, new_cluster_id):
        """时间点恢复（PITR）"""
        try:
            response = self.neptune.restore_db_cluster_to_point_in_time(
                DBClusterIdentifier=new_cluster_id,
                SourceDBClusterIdentifier=self.cluster_id,
                RestoreToTime=restore_time,
                UseLatestRestorableTime=False
            )
            print(f"正在恢复到 {restore_time}")
            return response["DBCluster"]
        except Exception as e:
            print(f"PITR 恢复失败: {e}")
            return None

# 使用示例
mgr = BackupManager("my-neptune-cluster")
mgr.check_backup_config()
snapshots = mgr.list_snapshots()
```

**AWS CLI：备份与恢复操作**

```bash
# 检查备份保留期
aws neptune describe-db-clusters \
    --db-cluster-identifier my-neptune-cluster \
    --query "DBClusters[*].{Retention:BackupRetentionPeriod,Window:PreferredBackupWindow}" \
    --output table

# 创建手动快照
aws neptune create-db-cluster-snapshot \
    --db-cluster-identifier my-neptune-cluster \
    --db-cluster-snapshot-identifier my-neptune-snapshot-20240101

# 从快照恢复
aws neptune restore-db-cluster-from-snapshot \
    --db-cluster-identifier my-neptune-restored \
    --snapshot-identifier my-neptune-snapshot-20240101 \
    --engine neptune

# 时间点恢复（恢复到 1 小时前）
aws neptune restore-db-cluster-to-point-in-time \
    --db-cluster-identifier my-neptune-pitr \
    --source-db-cluster-identifier my-neptune-cluster \
    --restore-to-time "$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ)" \
    --engine neptune

# 修改备份保留期（延长到 7 天）
aws neptune modify-db-cluster \
    --db-cluster-identifier my-neptune-cluster \
    --backup-retention-period 7 \
    --apply-immediately
```

#### 使用场景

- 误执行 `g.V().drop()` 后需要恢复数据
- 备份策略审计和加固
- 数据被恶意删除后的应急恢复
- 合规性要求下的备份保留期调整

#### 潜在风险与注意事项

- 手动快照不会自动过期，会产生持续存储费用
- 时间点恢复的最小粒度是 5 分钟
- 恢复操作会创建新集群，需要更新应用程序连接字符串
- 删除集群时如果勾选"创建最终快照"，可以保留最后一份数据

#### 本章小结

数据丢失的最佳防御策略是合理的备份配置。建议将备份保留期设置为至少 7 天，并定期创建手动快照。对于误删除操作，时间点恢复（PITR）是最有效的恢复手段。同时，应在应用层实施操作审计，防止无过滤条件的 `drop()` 操作。

---

## 7.6 集群问题

### 7.6.1 故障转移失败

#### 解决的问题

Neptune 主节点发生故障后，自动故障转移（Failover）未能成功将只读副本提升为主节点，导致数据库长时间不可用。

#### 核心原理

Neptune 的多可用区（Multi-AZ）部署中，主节点和只读副本分布在不同的可用区。故障转移的触发条件包括：

1. 主节点不可达（网络分区、硬件故障）
2. 主节点操作系统或数据库进程崩溃
3. 手动触发故障转移（`failover-db-cluster`）

故障转移失败的常见原因：

- **容量不足**：目标可用区没有足够的资源启动新实例
- **网络分区**：副本所在可用区与主节点同时不可用
- **复制中断**：副本的复制延迟过大，无法安全提升
- **实例状态异常**：副本处于 `storage-full` 或 `incompatible-parameters` 状态

#### 代码/配置实现

**Python：故障转移诊断**

```python
import boto3
from datetime import datetime, timedelta

class FailoverDiagnoser:
    def __init__(self, cluster_id, region="us-east-1"):
        self.neptune = boto3.client("neptune", region_name=region)
        self.ec2 = boto3.client("ec2", region_name=region)
        self.cluster_id = cluster_id
    
    def check_cluster_health(self):
        """检查集群健康状态"""
        response = self.neptune.describe_db_clusters(
            DBClusterIdentifier=self.cluster_id
        )
        cluster = response["DBClusters"][0]
        
        print(f"=== 集群健康检查: {self.cluster_id} ===")
        print(f"  状态: {cluster['Status']}")
        print(f"  引擎版本: {cluster['EngineVersion']}")
        print(f"  多 AZ: {cluster['MultiAZ']}")
        
        # 检查集群成员
        members = cluster.get("DBClusterMembers", [])
        print(f"\n集群成员 ({len(members)}):")
        for member in members:
            print(f"  - {member['DBInstanceIdentifier']}")
            print(f"    角色: {'主节点' if member.get('IsClusterWriter') else '只读副本'}")
            print(f"    状态: {member.get('DBInstanceStatus', 'N/A')}")
            print(f"    优先级: {member.get('PromotionTier', 0)}")
        
        # 检查是否有足够的副本
        writers = [m for m in members if m.get("IsClusterWriter")]
        readers = [m for m in members if not m.get("IsClusterWriter")]
        
        if not writers:
            print("\n⚠️ 没有主节点！集群不可写入")
        if not readers:
            print("\n⚠️ 没有只读副本！故障转移不可用")
        if len(readers) < 2:
            print("\n⚡ 建议至少配置 2 个只读副本以确保高可用")
        
        return cluster
    
    def check_instance_health(self, instance_id):
        """检查实例健康状态"""
        response = self.neptune.describe_db_instances(
            DBInstanceIdentifier=instance_id
        )
        instance = response["DBInstances"][0]
        
        print(f"\n=== 实例健康检查: {instance_id} ===")
        print(f"  状态: {instance['DBInstanceStatus']}")
        print(f"  规格: {instance['DBInstanceClass']}")
        print(f"  可用区: {instance['AvailabilityZone']}")
        print(f"  存储: {instance['AllocatedStorage']} GB")
        
        # 检查存储空间
        if instance.get("StorageType") == "gp2":
            iops = min(instance["AllocatedStorage"] * 3, 16000)
            print(f"  基准 IOPS: {iops}")
        
        # 检查维护状态
        if instance.get("PendingModifiedValues"):
            print(f"  待生效修改: {instance['PendingModifiedValues']}")
        
        return instance
    
    def simulate_failover(self):
        """模拟故障转移（仅测试，不实际执行）"""
        print("\n=== 故障转移模拟 ===")
        print("执行故障转移前需确认:")
        print("  1. 目标可用区有足够容量")
        print("  2. 副本复制延迟 < 30 秒")
        print("  3. 副本实例状态正常")
        print("  4. 网络连通性正常")
        
        # 检查可用区容量
        response = self.neptune.describe_db_clusters(
            DBClusterIdentifier=self.cluster_id
        )
        cluster = response["DBClusters"][0]
        
        for member in cluster.get("DBClusterMembers", []):
            if not member.get("IsClusterWriter"):
                inst_resp = self.neptune.describe_db_instances(
                    DBInstanceIdentifier=member["DBInstanceIdentifier"]
                )
                inst = inst_resp["DBInstances"][0]
                az = inst["AvailabilityZone"]
                instance_class = inst["DBInstanceClass"]
                
                print(f"\n  副本 {member['DBInstanceIdentifier']}:")
                print(f"    可用区: {az}")
                print(f"    规格: {instance_class}")
                
                # 检查该可用区的容量（通过 EC2 描述）
                try:
                    zones = self.ec2.describe_availability_zones(
                        ZoneNames=[az]
                    )
                    zone_info = zones["AvailabilityZones"][0]
                    print(f"    可用区状态: {zone_info['State']}")
                except Exception as e:
                    print(f"    无法检查可用区状态: {e}")
    
    def trigger_failover(self):
        """手动触发故障转移"""
        print(f"\n=== 触发故障转移 ===")
        try:
            response = self.neptune.failover_db_cluster(
                DBClusterIdentifier=self.cluster_id
            )
            print(f"故障转移已触发")
            print(f"新主节点将在几分钟内选举完成")
            return response["DBCluster"]
        except Exception as e:
            print(f"触发失败: {e}")
            return None

# 使用示例
diagnoser = FailoverDiagnoser("my-neptune-cluster")
diagnoser.check_cluster_health()
diagnoser.simulate_failover()
```

**AWS CLI：故障转移相关操作**

```bash
# 手动触发故障转移
aws neptune failover-db-cluster \
    --db-cluster-identifier my-neptune-cluster

# 检查集群事件（查看故障转移历史）
aws neptune describe-events \
    --source-type db-cluster \
    --source-identifier my-neptune-cluster \
    --duration 1440 \
    --query "Events[?contains(Message, 'failover') || contains(Message, 'Failover')]" \
    --output table

# 修改副本提升优先级（值越小优先级越高）
aws neptune modify-db-instance \
    --db-instance-identifier my-neptune-replica-1 \
    --promotion-tier 1 \
    --apply-immediately
```

#### 使用场景

- 主节点故障后集群长时间不可用
- 计划内维护需要手动触发故障转移
- 多可用区部署的高可用性验证
- 故障转移后性能评估

#### 潜在风险与注意事项

- 故障转移期间有 1-2 分钟的写入中断
- 故障转移后 DNS 记录自动更新，但客户端 DNS 缓存可能导致短暂连接失败
- 副本的提升优先级（Promotion Tier）决定故障转移时的选举顺序
- 如果所有副本都不可用，故障转移将失败，集群变为只读模式

#### 本章小结

故障转移失败的核心原因是副本不可用或容量不足。建议至少配置 2 个跨可用区的只读副本，并设置不同的提升优先级。定期进行故障转移演练可以验证高可用配置的有效性。

---

### 7.6.2 只读副本延迟

#### 解决的问题

Neptune 只读副本与主节点之间的数据同步延迟持续偏高，导致副本上的查询返回过期数据，影响读扩展和读写分离架构的可靠性。

#### 核心原理

Neptune 使用异步复制将数据从主节点同步到只读副本。复制延迟的常见原因：

1. **主节点写入负载过高**：主节点的写入速率超过副本的复制能力
2. **副本规格不足**：副本实例规格（CPU/内存/IOPS）低于主节点
3. **副本上的查询负载过高**：副本上的读查询消耗了本应用于复制的资源
4. **网络延迟**：主节点和副本之间的网络带宽不足或延迟高
5. **长事务阻塞**：主节点上的长事务导致 WAL（Write-Ahead Log）积压

#### 代码/配置实现

**Python：复制延迟监控与诊断**

```python
import boto3
from datetime import datetime, timedelta
import time

class ReplicaLagMonitor:
    def __init__(self, cluster_id, region="us-east-1"):
        self.cw = boto3.client("cloudwatch", region_name=region)
        self.neptune = boto3.client("neptune", region_name=region)
        self.cluster_id = cluster_id
    
    def get_replicas(self):
        """获取集群中的所有只读副本"""
        response = self.neptune.describe_db_clusters(
            DBClusterIdentifier=self.cluster_id
        )
        cluster = response["DBClusters"][0]
        
        replicas = []
        for member in cluster.get("DBClusterMembers", []):
            if not member.get("IsClusterWriter"):
                replicas.append({
                    "id": member["DBInstanceIdentifier"],
                    "status": member.get("DBInstanceStatus"),
                    "promotion_tier": member.get("PromotionTier", 0)
                })
        
        return replicas
    
    def monitor_lag(self, duration_minutes=60):
        """监控复制延迟"""
        replicas = self.get_replicas()
        if not replicas:
            print("没有只读副本")
            return
        
        end = datetime.utcnow()
        start = end - timedelta(minutes=duration_minutes)
        
        print(f"=== 复制延迟监控（最近 {duration_minutes} 分钟）===")
        
        for replica in replicas:
            response = self.cw.get_metric_statistics(
                Namespace="AWS/Neptune",
                MetricName="ReplicaLag",
                Dimensions=[{
                    "Name": "DBInstanceIdentifier",
                    "Value": replica["id"]
                }],
                StartTime=start,
                EndTime=end,
                Period=300,
                Statistics=["Average", "Maximum", "p95"]
            )
            
            datapoints = sorted(response["Datapoints"], key=lambda x: x["Timestamp"])
            
            if datapoints:
                avg_lag = sum(dp["Average"] for dp in datapoints) / len(datapoints)
                max_lag = max(dp["Maximum"] for dp in datapoints)
                
                print(f"\n副本: {replica['id']}")
                print(f"  平均延迟: {avg_lag:.1f} 秒")
                print(f"  最大延迟: {max_lag:.1f} 秒")
                
                if max_lag > 60:
                    print(f"  ⚠️ 延迟严重（> 60 秒），需要立即处理")
                elif max_lag > 30:
                    print(f"  ⚡ 延迟偏高（30-60 秒），建议关注")
                elif max_lag > 10:
                    print(f"  ⚡ 延迟中等（10-30 秒）")
                else:
                    print(f"  ✓ 延迟正常（< 10 秒）")
    
    def diagnose_lag_cause(self, replica_id):
        """诊断复制延迟的根因"""
        end = datetime.utcnow()
        start = end - timedelta(hours=1)
        
        print(f"\n=== 复制延迟根因诊断: {replica_id} ===")
        
        # 1. 检查主节点写入负载
        primary_response = self.cw.get_metric_statistics(
            Namespace="AWS/Neptune",
            MetricName="WriteIOPS",
            Dimensions=[{"Name": "DBInstanceIdentifier", "Value": replica_id}],
            StartTime=start, EndTime=end, Period=300,
            Statistics=["Average", "Maximum"]
        )
        
        # 2. 检查副本 CPU
        cpu_response = self.cw.get_metric_statistics(
            Namespace="AWS/Neptune",
            MetricName="CPUUtilization",
            Dimensions=[{"Name": "DBInstanceIdentifier", "Value": replica_id}],
            StartTime=start, EndTime=end, Period=300,
            Statistics=["Average", "Maximum"]
        )
        
        # 3. 检查副本网络
        network_response = self.cw.get_metric_statistics(
            Namespace="AWS/Neptune",
            MetricName="NetworkReceiveThroughput",
            Dimensions=[{"Name": "DBInstanceIdentifier", "Value": replica_id}],
            StartTime=start, EndTime=end, Period=300,
            Statistics=["Average"]
        )
        
        # 分析结果
        cpu_datapoints = sorted(cpu_response["Datapoints"], key=lambda x: x["Timestamp"])
        if cpu_datapoints:
            avg_cpu = sum(dp["Average"] for dp in cpu_datapoints) / len(cpu_datapoints)
            max_cpu = max(dp["Maximum"] for dp in cpu_datapoints)
            
            print(f"  副本 CPU 使用率: 平均 {avg_cpu:.1f}%, 峰值 {max_cpu:.1f}%")
            
            if avg_cpu > 80:
                print("  → 根因: 副本 CPU 过载，查询负载过高")
                print("  建议: 升级副本规格或减少副本上的查询")
            elif avg_cpu > 50:
                print("  → 可能原因: 副本 CPU 偏高")
                print("  建议: 检查副本上的慢查询")
            else:
                print("  → 副本 CPU 正常")
        
        # 检查主节点和副本规格是否匹配
        print("\n  规格对比建议:")
        print("  - 副本规格应 >= 主节点规格")
        print("  - 副本存储类型应与主节点一致")
        print("  - 副本和主节点应在同一区域")
    
    def continuous_monitor(self, interval_seconds=60, duration_minutes=30):
        """持续监控复制延迟"""
        iterations = duration_minutes * 60 // interval_seconds
        
        print(f"开始持续监控（每 {interval_seconds}s 一次，共 {iterations} 次）")
        
        for i in range(iterations):
            replicas = self.get_replicas()
            for replica in replicas:
                response = self.cw.get_metric_statistics(
                    Namespace="AWS/Neptune",
                    MetricName="ReplicaLag",
                    Dimensions=[{"Name": "DBInstanceIdentifier", "Value": replica["id"]}],
                    StartTime=datetime.utcnow() - timedelta(minutes=5),
                    EndTime=datetime.utcnow(),
                    Period=60,
                    Statistics=["Average"]
                )
                
                if response["Datapoints"]:
                    lag = response["Datapoints"][-1]["Average"]
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] {replica['id']}: {lag:.1f}s")
            
            time.sleep(interval_seconds)

# 使用示例
monitor = ReplicaLagMonitor("my-neptune-cluster")
monitor.monitor_lag()
monitor.diagnose_lag_cause("my-neptune-replica-1")
```

**AWS CLI：复制延迟相关指标**

```bash
# 查看所有副本的复制延迟
for replica in replica-1 replica-2; do
    echo "=== $replica ==="
    aws cloudwatch get-metric-statistics \
        --namespace AWS/Neptune \
        --metric-name ReplicaLag \
        --dimensions Name=DBInstanceIdentifier,Value=$replica \
        --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) \
        --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
        --period 300 \
        --statistics Average Maximum \
        --output table
done

# 检查主节点写入吞吐量
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name WriteThroughput \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-primary \
    --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 300 \
    --statistics Average
```

#### 使用场景

- 读写分离架构中副本查询返回过期数据
- 主节点写入量突增后副本延迟升高
- 副本规格评估和扩容决策
- 高可用架构的 SLA 验证

#### 潜在风险与注意事项

- 复制延迟超过 30 秒时应触发告警
- 副本规格应不低于主节点规格，否则复制延迟会持续累积
- 副本上的慢查询会占用 CPU 和 IOPS，间接增加复制延迟
- 跨区域复制（跨 Region）的延迟通常比同区域高 10-100 倍

#### 本章小结

复制延迟的排查路径：确认延迟值 → 检查副本 CPU/IOPS → 对比主节点写入负载 → 评估副本规格。解决方案包括升级副本规格、减少副本上的查询负载、或增加更多副本分担读压力。

---

### 7.6.3 存储空间满

#### 解决的问题

Neptune 实例的可用存储空间耗尽，导致写入操作失败、查询性能下降，甚至实例进入只读模式。

#### 核心原理

Neptune 的存储空间消耗包括：

1. **数据文件**：顶点、边、属性值的实际存储
2. **索引文件**：属性索引、全文索引
3. **WAL 日志**：预写日志，用于故障恢复和复制
4. **临时文件**：查询执行过程中的临时数据
5. **快照文件**：自动备份的快照差异

存储空间满的常见原因：

- **数据增长超出预期**：未规划的数据量增长
- **保留策略不当**：备份保留期过长或快照过多
- **临时文件堆积**：大查询或长时间运行的事务产生大量临时数据
- **索引膨胀**：频繁更新导致索引碎片化

#### 代码/配置实现

**Python：存储空间监控与预警**

```python
import boto3
from datetime import datetime, timedelta
import json

class StorageMonitor:
    def __init__(self, instance_id, region="us-east-1"):
        self.cw = boto3.client("cloudwatch", region_name=region)
        self.neptune = boto3.client("neptune", region_name=region)
        self.instance_id = instance_id
    
    def get_storage_metrics(self, days=7):
        """获取存储使用趋势"""
        end = datetime.utcnow()
        start = end - timedelta(days=days)
        
        # 可用存储空间
        free_response = self.cw.get_metric_statistics(
            Namespace="AWS/Neptune",
            MetricName="FreeStorageSpace",
            Dimensions=[{"Name": "DBInstanceIdentifier", "Value": self.instance_id}],
            StartTime=start, EndTime=end, Period=86400,
            Statistics=["Average", "Minimum"]
        )
        
        # 备份存储
        backup_response = self.cw.get_metric_statistics(
            Namespace="AWS/Neptune",
            MetricName="BackupRetentionPeriodStorageUsed",
            Dimensions=[{"Name": "DBInstanceIdentifier", "Value": self.instance_id}],
            StartTime=start, EndTime=end, Period=86400,
            Statistics=["Average"]
        )
        
        print(f"=== 存储空间分析（最近 {days} 天）===")
        
        free_datapoints = sorted(free_response["Datapoints"], key=lambda x: x["Timestamp"])
        if free_datapoints:
            current_free = free_datapoints[-1]["Average"]
            min_free = min(dp["Minimum"] for dp in free_datapoints)
            first_free = free_datapoints[0]["Average"]
            
            print(f"  当前可用: {current_free / 1024**3:.2f} GB")
            print(f"  最低可用: {min_free / 1024**3:.2f} GB")
            
            # 计算消耗速率
            consumed = first_free - current_free
            days_span = len(free_datapoints)
            daily_rate = consumed / days_span if days_span > 0 else 0
            
            print(f"  日均消耗: {daily_rate / 1024**3:.2f} GB/天")
            
            if daily_rate > 0:
                days_until_full = current_free / daily_rate if daily_rate > 0 else float('inf')
                print(f"  预计可用天数: {days_until_full:.0f} 天")
                
                if days_until_full < 30:
                    print(f"  ⚠️ 存储将在 {days_until_full:.0f} 天内耗尽！")
                elif days_until_full < 90:
                    print(f"  ⚡ 存储将在 {days_until_full:.0f} 天内耗尽，建议规划扩容")
                else:
                    print(f"  ✓ 存储充足")
        
        # 备份存储
        backup_datapoints = sorted(backup_response["Datapoints"], key=lambda x: x["Timestamp"])
        if backup_datapoints:
            backup_avg = sum(dp["Average"] for dp in backup_datapoints) / len(backup_datapoints)
            print(f"  备份存储使用: {backup_avg / 1024**3:.2f} GB")
    
    def get_instance_storage_info(self):
        """获取实例存储配置"""
        response = self.neptune.describe_db_instances(
            DBInstanceIdentifier=self.instance_id
        )
        instance = response["DBInstances"][0]
        
        print("\n=== 存储配置 ===")
        print(f"  分配存储: {instance['AllocatedStorage']} GB")
        print(f"  存储类型: {instance['StorageType']}")
        
        if instance.get("Iops"):
            print(f"  预配置 IOPS: {instance['Iops']}")
        
        # 检查是否支持自动扩容
        if instance.get("StorageThroughput"):
            print(f"  存储吞吐量: {instance['StorageThroughput']} MB/s")
        
        return instance
    
    def estimate_storage_cost(self, current_gb, daily_growth_gb, months=12):
        """估算存储成本"""
        print(f"\n=== 存储成本估算（{months} 个月）===")
        
        future_gb = current_gb + daily_growth_gb * 30 * months
        
        # gp2 成本（$0.115/GB/月）
        gp2_cost = future_gb * 0.115
        print(f"  gp2 预估月费: ${gp2_cost:.2f}")
        
        # io1 成本（$0.125/GB/月 + IOPS 费用）
        io1_cost = future_gb * 0.125
        print(f"  io1 预估月费（不含 IOPS）: ${io1_cost:.2f}")
        
        print(f"  建议: 如果日均增长 > 1GB，考虑 io2 以获得更好性能")

# 使用示例
monitor = StorageMonitor("my-neptune-instance")
monitor.get_storage_metrics(30)
monitor.get_instance_storage_info()
```

**AWS CLI：存储扩容操作**

```bash
# 查看当前存储使用
aws cloudwatch get-metric-statistics \
    --namespace AWS/Neptune \
    --metric-name FreeStorageSpace \
    --dimensions Name=DBInstanceIdentifier,Value=my-neptune-instance \
    --start-time $(date -u -d '-1 day' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 3600 \
    --statistics Average Minimum \
    --output table

# 扩容存储（仅支持增加，不支持减少）
aws neptune modify-db-instance \
    --db-instance-identifier my-neptune-instance \
    --allocated-storage 2000 \
    --apply-immediately

# 修改备份保留期（减少备份存储消耗）
aws neptune modify-db-cluster \
    --db-cluster-identifier my-neptune-cluster \
    --backup-retention-period 3 \
    --apply-immediately

# 清理手动快照
aws neptune delete-db-cluster-snapshot \
    --db-cluster-snapshot-identifier my-old-snapshot-20230101
```

#### 使用场景

- 存储使用率持续增长告警
- 数据量突增后的存储规划
- 备份存储费用优化
- 存储扩容前的容量评估

#### 潜在风险与注意事项

- Neptune 存储扩容只支持增加，不支持减少
- 扩容操作期间实例可能短暂不可用（取决于规格）
- 存储使用率超过 95% 时实例将进入只读模式
- 删除手动快照不可恢复，操作前需确认

#### 本章小结

存储空间满的预防比事后处理更重要。建议建立存储使用趋势监控，设置 80% 使用率告警阈值，并根据日均增长率提前规划扩容。同时定期清理不再需要的手动快照，优化备份保留期。

---

## 7.7 诊断工具

### 7.7.1 CloudWatch 监控与告警

#### 解决的问题

通过 CloudWatch 指标和告警实现 Neptune 集群的全面可观测性，在问题发生前或发生时及时获知异常状态。

#### 核心原理

Neptune 自动向 CloudWatch 上报以下类别的指标：

| 类别 | 关键指标 |
|------|---------|
| 计算 | CPUUtilization, FreeableMemory |
| 存储 | FreeStorageSpace, ReadIOPS, WriteIOPS, ReadLatency, WriteLatency |
| 连接 | DatabaseConnections, ActiveQueries |
| 复制 | ReplicaLag |
| 查询 | QueriesExceededMemoryLimit, FullScans |
| 网络 | NetworkReceiveThroughput, NetworkTransmitThroughput |

#### 代码/配置实现

**AWS CLI：创建 CloudWatch 告警**

```bash
#!/bin/bash
# 创建 Neptune 核心告警

CLUSTER_ID="my-neptune-cluster"
INSTANCE_ID="my-neptune-instance"
SNS_TOPIC_ARN="arn:aws:sns:us-east-1:123456789012:neptune-alerts"

# 1. CPU 使用率告警（> 80% 持续 5 分钟）
aws cloudwatch put-metric-alarm \
    --alarm-name "${CLUSTER_ID}-high-cpu" \
    --alarm-description "Neptune CPU 使用率超过 80%" \
    --metric-name CPUUtilization \
    --namespace AWS/Neptune \
    --statistic Average \
    --period 300 \
    --evaluation-periods 2 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=DBInstanceIdentifier,Value=${INSTANCE_ID} \
    --alarm-actions ${SNS_TOPIC_ARN}

# 2. 存储空间告警（可用空间 < 20%）
aws cloudwatch put-metric-alarm \
    --alarm-name "${CLUSTER_ID}-low-storage" \
    --alarm-description "Neptune 可用存储空间低于 20%" \
    --metric-name FreeStorageSpace \
    --namespace AWS/Neptune \
    --statistic Average \
    --period 300 \
    --evaluation-periods 1 \
    --threshold 214748364800 \
    --comparison-operator LessThanThreshold \
    --dimensions Name=DBInstanceIdentifier,Value=${INSTANCE_ID} \
    --alarm-actions ${SNS_TOPIC_ARN}

# 3. 复制延迟告警（> 30 秒）
for replica in replica-1 replica-2; do
    aws cloudwatch put-metric-alarm \
        --alarm-name "${CLUSTER_ID}-replica-lag-${replica}" \
        --alarm-description "Neptune 复制延迟超过 30 秒" \
        --metric-name ReplicaLag \
        --namespace AWS/Neptune \
        --statistic Maximum \
        --period 60 \
        --evaluation-periods 3 \
        --threshold 30 \
        --comparison-operator GreaterThanThreshold \
        --dimensions Name=DBInstanceIdentifier,Value=${replica} \
        --alarm-actions ${SNS_TOPIC_ARN}
done

# 4. 查询超限告警（内存超限查询数 > 0）
aws cloudwatch put-metric-alarm \
    --alarm-name "${CLUSTER_ID}-query-memory-limit" \
    --alarm-description "Neptune 查询超过内存限制" \
    --metric-name QueriesExceededMemoryLimit \
    --namespace AWS/Neptune \
    --statistic Sum \
    --period 300 \
    --evaluation-periods 1 \
    --threshold 0 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=DBInstanceIdentifier,Value=${INSTANCE_ID} \
    --alarm-actions ${SNS_TOPIC_ARN}

# 5. 数据库连接数告警（> 80% 最大连接数）
aws cloudwatch put-metric-alarm \
    --alarm-name "${CLUSTER_ID}-high-connections" \
    --alarm-description "Neptune 连接数超过阈值" \
    --metric-name DatabaseConnections \
    --namespace AWS/Neptune \
    --statistic Average \
    --period 300 \
    --evaluation-periods 2 \
    --threshold 800 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=DBInstanceIdentifier,Value=${INSTANCE_ID} \
    --alarm-actions ${SNS_TOPIC_ARN}
```

**Python：CloudWatch 仪表盘生成**

```python
import boto3
import json

class NeptuneDashboard:
    def __init__(self, instance_id, region="us-east-1"):
        self.cw = boto3.client("cloudwatch", region_name=region)
        self.instance_id = instance_id
    
    def create_dashboard(self, dashboard_name="Neptune-Monitoring"):
        """创建 Neptune 监控仪表盘"""
        dashboard_body = {
            "widgets": [
                {
                    "type": "metric",
                    "x": 0, "y": 0,
                    "width": 12, "height": 6,
                    "properties": {
                        "metrics": [
                            ["AWS/Neptune", "CPUUtilization", 
                             "DBInstanceIdentifier", self.instance_id]
                        ],
                        "period": 300,
                        "stat": "Average",
                        "region": "us-east-1",
                        "title": "CPU 使用率",
                        "yAxis": {"left": {"min": 0, "max": 100}}
                    }
                },
                {
                    "type": "metric",
                    "x": 12, "y": 0,
                    "width": 12, "height": 6,
                    "properties": {
                        "metrics": [
                            ["AWS/Neptune", "FreeableMemory",
                             "DBInstanceIdentifier", self.instance_id]
                        ],
                        "period": 300,
                        "stat": "Average",
                        "region": "us-east-1",
                        "title": "可用内存"
                    }
                },
                {
                    "type": "metric",
                    "x": 0, "y": 6,
                    "width": 8, "height": 6,
                    "properties": {
                        "metrics": [
                            ["AWS/Neptune", "ReadIOPS",
                             "DBInstanceIdentifier", self.instance_id],
                            ["AWS/Neptune", "WriteIOPS",
                             "DBInstanceIdentifier", self.instance_id]
                        ],
                        "period": 300,
                        "stat": "Average",
                        "region": "us-east-1",
                        "title": "IOPS"
                    }
                },
                {
                    "type": "metric",
                    "x": 8, "y": 6,
                    "width": 8, "height": 6,
                    "properties": {
                        "metrics": [
                            ["AWS/Neptune", "ReadLatency",
                             "DBInstanceIdentifier", self.instance_id],
                            ["AWS/Neptune", "WriteLatency",
                             "DBInstanceIdentifier", self.instance_id]
                        ],
                        "period": 300,
                        "stat": "Average",
                        "region": "us-east-1",
                        "title": "存储延迟"
                    }
                },
                {
                    "type": "metric",
                    "x": 16, "y": 6,
                    "width": 8, "height": 6,
                    "properties": {
                        "metrics": [
                            ["AWS/Neptune", "FreeStorageSpace",
                             "DBInstanceIdentifier", self.instance_id]
                        ],
                        "period": 300,
                        "stat": "Average",
                        "region": "us-east-1",
                        "title": "可用存储空间"
                    }
                },
                {
                    "type": "metric",
                    "x": 0, "y": 12,
                    "width": 12, "height": 6,
                    "properties": {
                        "metrics": [
                            ["AWS/Neptune", "DatabaseConnections",
                             "DBInstanceIdentifier", self.instance_id],
                            ["AWS/Neptune", "ActiveQueries",
                             "DBInstanceIdentifier", self.instance_id]
                        ],
                        "period": 300,
                        "stat": "Average",
                        "region": "us-east-1",
                        "title": "连接与活跃查询"
                    }
                },
                {
                    "type": "metric",
                    "x": 12, "y": 12,
                    "width": 12, "height": 6,
                    "properties": {
                        "metrics": [
                            ["AWS/Neptune", "NetworkReceiveThroughput",
                             "DBInstanceIdentifier", self.instance_id],
                            ["AWS/Neptune", "NetworkTransmitThroughput",
                             "DBInstanceIdentifier", self.instance_id]
                        ],
                        "period": 300,
                        "stat": "Average",
                        "region": "us-east-1",
                        "title": "网络吞吐量"
                    }
                }
            ]
        }
        
        try:
            self.cw.put_dashboard(
                DashboardName=dashboard_name,
                DashboardBody=json.dumps(dashboard_body)
            )
            print(f"仪表盘 {dashboard_name} 创建成功")
        except Exception as e:
            print(f"创建失败: {e}")

# 使用示例
dashboard = NeptuneDashboard("my-neptune-instance")
dashboard.create_dashboard()
```

#### 使用场景

- 生产环境 7x24 小时监控
- 容量规划和扩容决策
- 故障根因分析
- SLA 指标追踪

#### 潜在风险与注意事项

- CloudWatch 指标默认 1 分钟粒度，高精度监控需要启用详细监控（额外费用）
- 告警的评估周期应结合实际业务场景，避免频繁误报
- SNS 告警建议配置多个订阅终端（邮件 + Slack + PagerDuty）

#### 本章小结

CloudWatch 是 Neptune 监控的第一道防线。建议至少配置 CPU、存储、复制延迟和连接数四个核心告警，并创建统一的监控仪表盘实现可视化运维。

---

### 7.7.2 Performance Insights

#### 解决的问题

深入分析 Neptune 的数据库负载特征，识别消耗资源最多的查询、等待事件和会话信息。

#### 核心原理

Performance Insights 通过采集数据库引擎的内部指标，提供以下维度的分析：

1. **DB Load（数据库负载）**：按等待事件分类的负载分布
2. **Top SQL**：按负载排序的查询语句
3. **等待事件**：锁等待、IO 等待、CPU 调度等

#### 代码/配置实现

**AWS CLI：启用和查询 Performance Insights**

```bash
# 启用 Performance Insights（创建实例时或修改）
aws neptune modify-db-instance \
    --db-instance-identifier my-neptune-instance \
    --enable-performance-insights \
    --performance-insights-retention-period 7 \
    --apply-immediately

# 查询 Performance Insights 指标
aws pi get-resource-metrics \
    --service-type RDS \
    --identifier "db-AAAAAAAAAAAAAAAAAAAAAAAAAA" \
    --start-time "$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ)" \
    --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --period-in-seconds 60 \
    --metric-queries '[{
        "Metric": "db.load.avg",
        "GroupBy": {"Group": "db.wait_event", "Limit": 10}
    }]'

# 获取 Top SQL
aws pi get-resource-metrics \
    --service-type RDS \
    --identifier "db-AAAAAAAAAAAAAAAAAAAAAAAAAA" \
    --start-time "$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ)" \
    --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --period-in-seconds 300 \
    --metric-queries '[{
        "Metric": "db.load.avg",
        "GroupBy": {"Group": "db.sql", "Limit": 10}
    }]'
```

#### 使用场景

- 定位消耗资源最多的查询
- 分析等待事件（IO 等待、锁等待）
- 性能回归的根因分析
- 容量规划和性能基准测试

#### 潜在风险与注意事项

- Performance Insights 会产生额外费用（按保留期计费）
- 数据保留期可选 7 天（免费）或 2 年（付费）
- 需要为实例关联适当的 IAM 策略才能访问 PI API

#### 本章小结

Performance Insights 是定位 Neptune 性能瓶颈的利器。通过 DB Load 和 Top SQL 视图，可以快速识别消耗资源最多的查询和等待事件，为性能优化提供精确方向。

---

### 7.7.3 Neptune API 诊断命令

#### 解决的问题

通过 Neptune API 获取集群和实例的元数据、配置信息和运行状态，用于故障排查和配置审计。

#### 核心原理

Neptune API 提供以下关键操作：

- `DescribeDBInstances`：获取实例规格、状态、端点、安全组等
- `DescribeDBClusters`：获取集群拓扑、成员信息、备份配置
- `ListTagsForResource`：获取资源标签
- `DescribeEvents`：获取集群和实例的事件历史
- `DescribeDBParameterGroups`：获取参数组配置

#### 代码/配置实现

**Python：Neptune API 诊断工具**

```python
import boto3
import json
from datetime import datetime, timedelta

class NeptuneApiDiagnoser:
    def __init__(self, region="us-east-1"):
        self.neptune = boto3.client("neptune", region_name=region)
    
    def describe_all_instances(self):
        """描述所有 Neptune 实例"""
        response = self.neptune.describe_db_instances()
        
        print("=== Neptune 实例列表 ===")
        for inst in response.get("DBInstances", []):
            print(f"\n实例: {inst['DBInstanceIdentifier']}")
            print(f"  规格: {inst['DBInstanceClass']}")
            print(f"  引擎: {inst['Engine']} {inst['EngineVersion']}")
            print(f"  状态: {inst['DBInstanceStatus']}")
            print(f"  端点: {inst['Endpoint']['Address']}:{inst['Endpoint']['Port']}")
            print(f"  可用区: {inst['AvailabilityZone']}")
            print(f"  存储: {inst['AllocatedStorage']} GB ({inst['StorageType']})")
            print(f"  多 AZ: {inst.get('MultiAZ', False)}")
            
            # 安全组
            sg_ids = [sg['VpcSecurityGroupId'] for sg in inst.get('VpcSecurityGroups', [])]
            print(f"  安全组: {', '.join(sg_ids)}")
            
            # 子网组
            subnet_group = inst.get('DBSubnetGroup', {})
            print(f"  子网组: {subnet_group.get('DBSubnetGroupName', 'N/A')}")
            
            # 参数组
            param_group = inst.get('DBParameterGroups', [])
            if param_group:
                print(f"  参数组: {param_group[0]['DBParameterGroupName']}")
        
        return response["DBInstances"]
    
    def describe_cluster(self, cluster_id):
        """描述集群详情"""
        response = self.neptune.describe_db_clusters(
            DBClusterIdentifier=cluster_id
        )
        cluster = response["DBClusters"][0]
        
        print(f"\n=== 集群详情: {cluster_id} ===")
        print(f"  状态: {cluster['Status']}")
        print(f"  端口: {cluster['Port']}")
        print(f"  引擎版本: {cluster['EngineVersion']}")
        print(f"  备份保留期: {cluster['BackupRetentionPeriod']} 天")
        print(f"  备份窗口: {cluster.get('PreferredBackupWindow', 'N/A')}")
        print(f"  维护窗口: {cluster.get('PreferredMaintenanceWindow', 'N/A')}")
        
        # 集群端点
        print(f"  端点: {cluster.get('Endpoint', 'N/A')}")
        print(f"  读取端点: {cluster.get('ReaderEndpoint', 'N/A')}")
        
        # 集群成员
        print(f"\n  集群成员:")
        for member in cluster.get("DBClusterMembers", []):
            role = "主节点" if member.get("IsClusterWriter") else "只读副本"
            print(f"    - {member['DBInstanceIdentifier']} ({role})")
            print(f"      状态: {member.get('DBInstanceStatus', 'N/A')}")
            print(f"      提升优先级: {member.get('PromotionTier', 0)}")
        
        return cluster
    
    def list_tags(self, resource_arn):
        """列出资源标签"""
        response = self.neptune.list_tags_for_resource(
            ResourceName=resource_arn
        )
        
        print(f"\n=== 标签: {resource_arn} ===")
        for tag in response.get("TagList", []):
            print(f"  {tag['Key']} = {tag['Value']}")
        
        return response["TagList"]
    
    def get_events(self, source_id, source_type="db-instance", hours=24):
        """获取事件历史"""
        end = datetime.utcnow()
        start = end - timedelta(hours=hours)
        
        response = self.neptune.describe_events(
            SourceType=source_type,
            SourceIdentifier=source_id,
            StartTime=start,
            EndTime=end,
            Duration=hours * 60
        )
        
        print(f"\n=== 事件历史: {source_id}（最近 {hours} 小时）===")
        for event in response.get("Events", []):
            print(f"  [{event['Date'].strftime('%Y-%m-%d %H:%M:%S')}] {event['Message']}")
        
        return response["Events"]
    
    def full_diagnostic(self, cluster_id):
        """全量诊断"""
        print("=" * 60)
        print(f"Neptune 全量诊断报告: {cluster_id}")
        print(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)
        
        # 获取集群信息
        cluster = self.describe_cluster(cluster_id)
        
        # 获取所有实例信息
        instances = self.describe_all_instances()
        
        # 获取事件
        self.get_events(cluster_id, "db-cluster", 24)
        
        # 获取标签
        cluster_arn = cluster.get("DBClusterArn", "")
        if cluster_arn:
            self.list_tags(cluster_arn)
        
        print("\n" + "=" * 60)
        print("诊断完成")
        print("=" * 60)

# 使用示例
diagnoser = NeptuneApiDiagnoser()
diagnoser.full_diagnostic("my-neptune-cluster")
```

**AWS CLI：常用诊断命令速查**

```bash
# 1. 获取实例详细信息
aws neptune describe-db-instances \
    --db-instance-identifier my-neptune-instance \
    --output json

# 2. 获取集群信息
aws neptune describe-db-clusters \
    --db-cluster-identifier my-neptune-cluster \
    --output json

# 3. 获取参数组配置
aws neptune describe-db-parameters \
    --db-parameter-group-name my-neptune-params \
    --query "Parameters[?ParameterName=='neptune_query_timeout' || ParameterName=='neptune_lambdA_compiler']" \
    --output table

# 4. 获取事件
aws neptune describe-events \
    --source-type db-instance \
    --source-identifier my-neptune-instance \
    --duration 1440 \
    --output table

# 5. 获取资源标签
aws neptune list-tags-for-resource \
    --resource-name arn:aws:neptune:us-east-1:123456789012:db-instance:my-neptune-instance

# 6. 获取待处理维护
aws neptune describe-pending-maintenance-actions \
    --resource-identifier arn:aws:neptune:us-east-1:123456789012:db:my-neptune-instance
```

#### 使用场景

- 故障排查时的信息收集
- 配置审计和合规检查
- 资源清单管理
- 自动化运维脚本

#### 潜在风险与注意事项

- Describe API 有速率限制（每秒约 10 次），批量调用时需注意
- 资源 ARN 格式因资源类型而异，需确认正确的 ARN 格式
- 事件历史最多保留 14 天

#### 本章小结

Neptune API 是故障排查的基础数据源。建议将上述诊断命令封装为自动化脚本，在故障发生时一键收集全量信息，减少人工排查时间。

---

## 7.8 故障排查清单与决策树

### 7.8.1 连接问题排查清单

| 检查项 | 命令/方法 | 预期结果 |
|--------|----------|---------|
| DNS 解析 | `nslookup <endpoint>` | 返回正确 IP |
| TCP 连通性 | `telnet <endpoint> 8182` | 连接成功 |
| TLS 握手 | Python TLS 诊断脚本 | 握手成功 |
| 安全组规则 | `aws ec2 describe-security-groups` | 8182 端口放行 |
| 子网路由 | `aws ec2 describe-route-tables` | 路由正确 |
| NACL 规则 | `aws ec2 describe-network-acls` | 未阻止 8182 |
| 连接池配置 | 检查客户端代码 | 池大小合理 |
| 实例状态 | `aws neptune describe-db-instances` | available |

### 7.8.2 查询问题排查清单

| 检查项 | 命令/方法 | 预期结果 |
|--------|----------|---------|
| 查询超时 | `g.V().profile()` | 执行计划合理 |
| 索引使用 | `g.io("audit").option("query", "indexStatus")` | 索引存在且生效 |
| 全表扫描 | CloudWatch FullScans 指标 | 接近 0 |
| 内存超限 | CloudWatch QueriesExceededMemoryLimit | 0 |
| 查询计划 | profile() 输出 | 使用索引查找 |
| 结果集大小 | 检查分页逻辑 | 每页 < 10000 条 |

### 7.8.3 性能问题排查清单

| 检查项 | 命令/方法 | 预期结果 |
|--------|----------|---------|
| CPU 使用率 | CloudWatch CPUUtilization | < 80% |
| IOPS 使用率 | CloudWatch ReadIOPS/WriteIOPS | < 上限 80% |
| 存储延迟 | CloudWatch ReadLatency/WriteLatency | < 20ms |
| 磁盘队列 | CloudWatch DiskQueueDepth | < 3 |
| 复制延迟 | CloudWatch ReplicaLag | < 10s |
| 连接数 | CloudWatch DatabaseConnections | < 上限 80% |
| 活跃查询 | CloudWatch ActiveQueries | < 50 |

### 7.8.4 数据问题排查清单

| 检查项 | 命令/方法 | 预期结果 |
|--------|----------|---------|
| 备份配置 | `aws neptune describe-db-clusters` | 保留期 >= 7 天 |
| 快照列表 | `aws neptune describe-db-cluster-snapshots` | 快照正常 |
| 复制一致性 | 主从对比查询 | 数据一致 |
| 导入状态 | `aws neptune describe-pending-maintenance-actions` | 无失败 |
| S3 权限 | `aws s3 ls s3://bucket/prefix/` | 可访问 |

### 7.8.5 集群问题排查清单

| 检查项 | 命令/方法 | 预期结果 |
|--------|----------|---------|
| 集群状态 | `aws neptune describe-db-clusters` | available |
| 实例状态 | `aws neptune describe-db-instances` | available |
| 多 AZ 配置 | `aws neptune describe-db-clusters` | MultiAZ = true |
| 副本数量 | `aws neptune describe-db-clusters` | >= 2 |
| 存储使用率 | CloudWatch FreeStorageSpace | > 20% |
| 事件历史 | `aws neptune describe-events` | 无异常事件 |

### 7.8.6 故障决策树

```
问题: Neptune 连接失败
├─ DNS 解析成功?
│  ├─ 否 → 检查 VPC DNS 配置和 Route 53
│  └─ 是 → TCP 连接成功?
│       ├─ 否 → 检查安全组、NACL、路由表
│       └─ 是 → TLS 握手成功?
│            ├─ 否 → 检查证书信任链、TLS 版本
│            └─ 是 → 连接池可用?
│                 ├─ 否 → 检查连接池配置、实例连接数上限
│                 └─ 是 → 连接成功

问题: 查询超时或慢查询
├─ 使用 profile() 分析执行计划
├─ 是否使用索引?
│  ├─ 否 → 创建索引
│  └─ 是 → 索引选择性是否足够?
│       ├─ 否 → 优化查询条件或创建组合索引
│       └─ 是 → 查询复杂度是否过高?
│            ├─ 是 → 简化查询、限制遍历深度、使用分页
│            └─ 否 → 检查实例规格是否不足

问题: CPU/IOPS 使用率过高
├─ 检查 ActiveQueries 指标
├─ 活跃查询数高?
│  ├─ 是 → 使用 Performance Insights 定位 Top SQL
│  └─ 否 → 检查后台任务（备份、compaction）
├─ 优化慢查询后是否改善?
│  ├─ 是 → 问题解决
│  └─ 否 → 升级实例规格

问题: 数据不一致
├─ 从主节点读取是否一致?
│  ├─ 是 → 复制延迟问题，等待同步或使用主节点读取
│  └─ 否 → 检查并发写入冲突
├─ 检查 ReplicaLag 指标
├─ 延迟 > 30s?
│  ├─ 是 → 检查副本规格和主节点写入负载
│  └─ 否 → 检查应用层事务逻辑

问题: 存储空间不足
├─ 检查 FreeStorageSpace 趋势
├─ 日均消耗 > 1GB?
│  ├─ 是 → 评估数据增长原因，规划扩容
│  └─ 否 → 检查临时文件和备份存储
├─ 清理手动快照和缩短备份保留期
├─ 扩容存储
└─ 设置 80% 使用率告警
```

### 7.8.7 应急响应流程

```
第一阶段：发现（0-5 分钟）
  1. 确认告警类型和影响范围
  2. 收集当前集群状态（describe-db-clusters / describe-db-instances）
  3. 检查 CloudWatch 指标趋势

第二阶段：诊断（5-15 分钟）
  1. 执行对应类别的排查清单
  2. 使用诊断脚本收集全量信息
  3. 定位根因

第三阶段：恢复（15-30 分钟）
  1. 执行修复操作（扩容、重启、故障转移、快照恢复）
  2. 验证服务恢复
  3. 通知相关方

第四阶段：复盘（事后）
  1. 编写事故报告
  2. 更新监控告警
  3. 优化运维流程
```

---

## 7.9 本章总结

Neptune 故障排查的核心方法论可以概括为"分层诊断、指标驱动、工具辅助"。

**分层诊断**意味着从网络层（DNS/TCP/TLS）到应用层（查询/数据）逐层排查，避免在错误层面浪费时间。**指标驱动**要求以 CloudWatch 指标和 Performance Insights 数据作为判断依据，而非凭感觉猜测。**工具辅助**强调将诊断命令和脚本标准化、自动化，在故障发生时快速执行。

本章覆盖了连接、查询、性能、数据、集群五大类共 12 种常见故障场景，每种场景都提供了根因分析、诊断脚本和修复方案。建议读者根据自身业务场景，将本章的排查清单和决策树转化为自动化运维脚本，并定期进行故障演练，确保团队在真实故障发生时能够快速响应。

最后，记住故障排查的三条黄金法则：

1. **先看指标，再查日志，最后改代码**——数据比直觉可靠
2. **一次只改一个变量**——同时修改多个配置无法确定根因
3. **恢复优先于根因分析**——先让业务恢复，再排查根本原因
