# 第25章 服务网格

服务网格（Service Mesh）是微服务治理的"去代码化"版本——将通信治理（熔断、重试、限流、TLS、追踪）从应用代码中提取到基础设施层。

---

## 25.1 Istio 架构

```
服务网格的数据平面和控制平面：

  Control Plane (Istiod)
  ┌──────────────────────────┐
  │ 配置管理 / 服务发现 / 证书│
  └──────────────────────────┘
              │ 配置下发
  ┌───────────┼───────────┐
  │           │           │
  ▼           ▼           ▼
┌─────┐  ┌─────┐  ┌─────┐
│Envoy│  │Envoy│  │Envoy│  ← Sidecar Proxies (数据平面)
├─────┤  ├─────┤  ├─────┤
│Svc A│  │Svc B│  │Svc C│  ← 应用容器
└─────┘  └─────┘  └─────┘
  ▲           │
  └───────────┘
  Svc A → Envoy(本地) → Envoy(Svc B端) → Svc B
  所有流量过 Sidecar —— mTLS、重试、熔断在 Envoy 层透明处理

应用代码不再需要 Resilience4j、Spring Cloud LoadBalancer
Envoy 为所有语言（Java/Go/Python/Node）提供统一的治理
```

---

## 25.2 流量管理

```yaml
# Istio VirtualService —— 声明流量路由规则
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: payment-service
spec:
  hosts:
    - payment-service
  http:
    # 路由到不同版本（金丝雀）
    - match:
        - headers:
            canary-user:
              exact: "true"
      route:
        - destination:
            host: payment-service
            subset: v2      # 金丝雀用户 → v2
    - route:
        - destination:
            host: payment-service
              subset: v1    # 普通用户 → v1
          weight: 90
        - destination:
            host: payment-service
            subset: v2
          weight: 10        # 10% 普通流量也到 v2
```

```yaml
# DestinationRule —— 定义服务的子集和负载均衡策略
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: payment-service
spec:
  host: payment-service
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100       # 最大 TCP 连接数
      http:
        http1MaxPendingRequests: 10
        maxRequestsPerConnection: 50
    outlierDetection:              # 异常检测（熔断）
      consecutive5xxErrors: 5     # 连续 5 次 5xx → 熔断
      interval: 30s
      baseEjectionTime: 30s       # 踢出 30 秒
```

---

## 25.3 安全策略

```yaml
# Istio 的安全是透明的——应用不需要修改代码

# 自动 mTLS —— 所有服务间通信加密
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
spec:
  mtls:
    mode: STRICT  # 整个 mesh 强制 mTLS

---
# 服务到服务的访问控制（零信任网络）
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: payment-service-authz
spec:
  selector:
    matchLabels:
      app: payment-service
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/production/sa/order-service"]
      to:
        - operation:
            methods: ["POST"]
            paths: ["/api/charge"]
  # 只有订单服务能调 POST /api/charge
  # 其他所有来源和路径默认拒绝
```

---

## 25.4 可观测性

```yaml
# 不需要在代码中加追踪 SDK —— Envoy 自动生成 trace

# 分布式追踪：
# 请求进入 → Envoy 生成 span → 转发给应用
# 请求离开应用的 Envoy → 生成新 span → 转发给下游的 Envoy
# 整个调用链的追踪数据自动收集到 Jaeger

# 监控指标（Envoy 自动暴露给 Prometheus）：
# - istio_requests_total (按服务、状态码、方法的请求计数)
# - istio_request_duration_milliseconds (P50/P90/P99)
# - istio_tcp_connections_opened_total
```

---

## 25.5 服务网格的代价

```
引入 Istio 不是免费的：

运维复杂度:    增加了 15+ CRD (自定义资源) + Sidecar 注入 + 证书管理
性能开销:      每个请求多了两次 Envoy 代理层（发送端 + 接收端）
               → 增加 ~2-5ms 延迟
资源消耗:      每个 Pod 多了一个 Envoy 容器
               → 每个 Pod 额外 ~128MB 内存 + ~50m CPU
排障难度:      网络问题现在有两层来源——应用层和 Envoy 层
```

---

## 25.6 本章小结

服务网格的核心价值主张：**让应用开发者不需要在代码层面关心通信治理。**

适用判断：
- 多语言微服务环境（Java + Go + Python）→ 服务网格价值最高
- 单一语言（纯 Java）+ Spring Cloud → 代码内治理已经足够
- 团队 < 15 人 → 服务网格的运维成本可能超过收益
