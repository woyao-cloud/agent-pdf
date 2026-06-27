# 第11章 灰度发布与流量管理

灰度发布（Gray Release / Canary Release）是生产环境中降低发布风险的核心手段。其核心理念是让新版本先服务一小部分流量，验证无误后再逐步扩大范围，最终全量上线。本章围绕腾讯云 TKE 生态，深入讲解四种主流的灰度发布方案——Ingress 灰度、服务网格灰度、蓝绿部署、金丝雀发布——以及 A/B 测试的实现方法，最后分析灰度发布中的潜在风险。

---

## 11.1 Ingress 灰度发布

### 11.1.1 解决的问题

在 Kubernetes 集群中，Service 的默认负载均衡策略是 Round-Robin，无法实现按比例的流量分发。当需要将新版本先暴露给 5% 的用户进行验证时，原生 Service 无法满足需求。Ingress 灰度发布通过在七层网关层引入流量权重和路由规则，解决了"如何在不修改应用代码的前提下，按比例或按条件分发流量"的问题。

### 11.1.2 核心原理

Ingress 灰度发布依赖 Ingress Controller 的流量治理能力。在 TKE 中，主要有两种方案：

**nginx-ingress canary**：通过额外的 Ingress 资源定义灰度规则，nginx-ingress-controller 根据权重（weight）或请求头（header/cookie）将部分流量路由到灰度 Service。

**CLB 加权转发**：腾讯云 CLB（Cloud Load Balancer）在四层或七层监听器中支持为每个后端服务设置权重，实现流量按比例分发。

两种方案的核心区别在于：nginx-ingress 工作在七层（HTTP/HTTPS），支持基于请求内容的精细化路由；CLB 工作在四层或七层，权重配置粒度较粗但性能更高。

### 11.1.3 代码/配置实现

#### nginx-ingress 基于权重的灰度

```yaml
# 主版本 Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: order-service-main
  namespace: production
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: order.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: order-service-v1
                port:
                  number: 8080
---
# 灰度版本 Ingress（权重 10%）
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: order-service-canary
  namespace: production
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
spec:
  rules:
    - host: order.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: order-service-v2
                port:
                  number: 8080
```

#### nginx-ingress 基于请求头的灰度

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: order-service-canary-header
  namespace: production
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-header: "X-Canary"
    nginx.ingress.kubernetes.io/canary-by-header-value: "enabled"
spec:
  rules:
    - host: order.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: order-service-v2
                port:
                  number: 8080
```

#### nginx-ingress 基于 Cookie 的灰度

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: order-service-canary-cookie
  namespace: production
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-cookie: "canary_token"
    # 当 cookie canary_token=always 时进入灰度版本
spec:
  rules:
    - host: order.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: order-service-v2
                port:
                  number: 8080
```

#### CLB 加权转发配置

```yaml
# 通过 TKE 控制台或 API 配置 CLB 后端权重
# 以下为 Service 注解方式（TKE 原生 CLB 模式）
apiVersion: v1
kind: Service
metadata:
  name: order-service-v1
  namespace: production
  annotations:
    service.kubernetes.io/tke-exist-lb-id: "lb-xxxxxxxx"
    service.kubernetes.io/tke-lb-backend-weight: "90"  # 90% 流量
spec:
  type: LoadBalancer
  ports:
    - port: 8080
      targetPort: 8080
  selector:
    app: order-service
    version: v1
---
apiVersion: v1
kind: Service
metadata:
  name: order-service-v2
  namespace: production
  annotations:
    service.kubernetes.io/tke-exist-lb-id: "lb-xxxxxxxx"
    service.kubernetes.io/tke-lb-backend-weight: "10"  # 10% 流量
spec:
  type: LoadBalancer
  ports:
    - port: 8080
      targetPort: 8080
  selector:
    app: order-service
    version: v2
```

### 11.1.4 使用场景

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 简单按比例灰度（5% → 50% → 100%） | nginx-ingress canary-weight | 配置简单，无需修改代码 |
| 内部测试团队先验证 | nginx-ingress canary-by-header | 通过请求头精确控制灰度范围 |
| 按用户标识灰度 | nginx-ingress canary-by-cookie | 用户维度灰度，体验一致 |
| 高性能场景（四层转发） | CLB 加权转发 | 无七层开销，吞吐更高 |
| 已有 CLB 且不想引入 nginx | CLB 加权转发 | 减少组件依赖 |

### 11.1.5 潜在风险与注意事项

- **权重精度限制**：nginx-ingress 的 canary-weight 使用整数百分比，最小粒度为 1%。对于超大规模集群（日活千万级），1% 可能仍然意味着大量用户受影响。此时应结合 header/cookie 做更精确的控制。
- **多灰度 Ingress 冲突**：当多个 canary Ingress 指向同一 host 时，nginx-ingress 的行为是"第一个匹配优先"，可能导致灰度规则不符合预期。应确保同一 host 下只有一个活跃的 canary Ingress。
- **CLB 权重热更新延迟**：修改 CLB 后端权重后，配置下发到 CLB 节点存在 10-30 秒延迟，在流量突增场景下可能造成短暂的不均衡。
- **Session 保持**：nginx-ingress 的权重分发基于单个请求，不保证同一用户的多次请求落在同一版本。如需 session 保持，应使用 cookie-based 灰度。

### 11.1.6 本章小结

Ingress 灰度发布是 TKE 上最易上手、成本最低的灰度方案。nginx-ingress 提供了 weight、header、cookie 三种灰度模式，覆盖了从简单比例灰度到精细化用户分流的绝大多数场景。CLB 加权转发则适合对性能敏感、已有 CLB 基础设施的团队。选择哪种方案取决于对路由精细度的需求和基础设施现状。

---

## 11.2 服务网格灰度发布

### 11.2.1 解决的问题

Ingress 灰度只能在集群入口处做流量分发，无法控制服务间调用的流量走向。在微服务架构中，一个请求可能经过 A → B → C 三个服务，Ingress 灰度只能控制入口流量进入 A 的哪个版本，而 B 和 C 的版本路由则无法管控。服务网格（Service Mesh）通过 Sidecar 代理拦截所有服务间通信，实现了**全链路灰度**——从入口到每一个下游服务，都可以按规则路由到指定版本。

### 11.2.2 核心原理

服务网格灰度发布的核心是 Istio 的流量管理模型，由两个 CRD 组成：

**VirtualService**：定义路由规则。可以基于权重、请求头、URI 路径、来源服务等条件，将流量分发到不同的 Destination 子集。

**DestinationRule**：定义目标服务的子集（subset）和负载均衡策略。通过标签选择器将 Pod 版本映射为 subset。

流量路径为：客户端请求 → Sidecar（Envoy）→ VirtualService 匹配规则 → DestinationRule 解析 subset → 目标 Pod。

### 11.2.3 代码/配置实现

#### 基于权重的灰度路由

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: order-service-destination
  namespace: production
spec:
  host: order-service
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
        maxConnections: 100
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 60s
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: order-service-routing
  namespace: production
spec:
  hosts:
    - order-service
  http:
    - route:
        - destination:
            host: order-service
            subset: v2
          weight: 5
        - destination:
            host: order-service
            subset: v1
          weight: 95
      timeout: 5s
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: connect-failure,refused-stream,503
```

#### 基于请求头的灰度（按用户组分流）

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: order-service-routing-header
  namespace: production
spec:
  hosts:
    - order-service
  http:
    - match:
        - headers:
            x-user-group:
              exact: "internal-test"
      route:
        - destination:
            host: order-service
            subset: v2
    - match:
        - headers:
            x-user-group:
              exact: "beta-user"
      route:
        - destination:
            host: order-service
            subset: v2
          weight: 50
        - destination:
            host: order-service
            subset: v1
          weight: 50
    - route:
        - destination:
            host: order-service
            subset: v1
          weight: 100
```

#### 基于来源服务的灰度（按调用方分流）

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: order-service-routing-source
  namespace: production
spec:
  hosts:
    - order-service
  http:
    - match:
        - sourceLabels:
            app: api-gateway
      route:
        - destination:
            host: order-service
            subset: v2
          weight: 20
        - destination:
            host: order-service
            subset: v1
          weight: 80
    - match:
        - sourceLabels:
            app: internal-admin
      route:
        - destination:
            host: order-service
            subset: v2
          weight: 100
    - route:
        - destination:
            host: order-service
            subset: v1
          weight: 100
```

#### 基于区域的灰度路由

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: order-service-routing-region
  namespace: production
spec:
  hosts:
    - order-service
  http:
    - match:
        - headers:
            x-region:
              exact: "shanghai"
      route:
        - destination:
            host: order-service
            subset: v2
          weight: 100
    - match:
        - headers:
            x-region:
              exact: "beijing"
      route:
        - destination:
            host: order-service
            subset: v2
          weight: 10
        - destination:
            host: order-service
            subset: v1
          weight: 90
    - route:
        - destination:
            host: order-service
            subset: v1
          weight: 100
```

### 11.2.4 使用场景

- **全链路灰度**：需要从入口到所有下游服务都按版本路由，确保灰度流量在整个调用链中保持一致。
- **多维度灰度**：需要同时按用户组、地域、设备类型等多个维度进行灰度，Ingress 无法满足。
- **精细流量治理**：需要超时控制、重试策略、熔断、故障注入等高级流量管理能力。
- **Tencent Service Mesh（TSM）集成**：腾讯云托管的服务网格产品，与 TKE 深度集成，提供 Istio 兼容 API 和可视化流量管理界面。

### 11.2.5 潜在风险与注意事项

- **Sidecar 资源开销**：每个 Pod 额外运行一个 Envoy Sidecar，增加 CPU（约 50-100m）和内存（约 128-256Mi）开销。大规模集群下资源消耗不可忽视。
- **调试复杂度增加**：服务间调用链路中增加了 Sidecar 跳转，网络问题排查需要理解 Envoy 的流量模型。建议配合 Kiali、Jaeger 等可观测性工具使用。
- **VirtualService 规则冲突**：多个 VirtualService 匹配同一 host 时，Istio 的合并规则可能产生非预期行为。建议每个服务只定义一个 VirtualService。
- **Istio 版本升级风险**：Istio 控制面（istiod）升级可能导致 Sidecar 断连，造成短暂流量中断。生产环境应使用金丝雀升级策略。

### 11.2.6 本章小结

服务网格灰度发布是 TKE 上最强大的流量治理方案。通过 VirtualService 和 DestinationRule 的组合，可以实现从入口到服务间调用的全链路灰度路由，支持权重、请求头、来源服务、地域等多维度的精细化流量控制。代价是引入 Sidecar 带来的资源开销和运维复杂度。对于微服务数量超过 20 个、需要全链路灰度的团队，服务网格是值得投入的方向。

---

## 11.3 蓝绿部署

### 11.3.1 解决的问题

滚动更新（RollingUpdate）虽然实现了零宕机部署，但在更新过程中存在"新旧版本共存"的窗口期。如果新版本存在兼容性问题（如数据库 schema 变更不兼容），滚动更新期间部分请求可能失败。蓝绿部署通过维护两套完全独立的环境，在切换瞬间完成版本替换，从根本上避免了新旧版本共存的问题。

### 11.3.2 核心原理

蓝绿部署维护两套环境：**蓝环境（当前生产环境）** 和 **绿环境（新版本环境）**。两套环境独立部署，拥有完整的服务栈。切换时，只需修改 Service 的标签选择器（selector），将流量从蓝环境指向绿环境（或反之）。

切换过程是瞬时的，不存在新旧版本共存的时间窗口。如果新版本出现问题，只需将 selector 改回旧版本即可完成回滚。

### 11.3.3 代码/配置实现

#### 蓝绿环境部署

```yaml
# 蓝环境（当前生产版本）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service-blue
  namespace: production
spec:
  replicas: 10
  selector:
    matchLabels:
      app: order-service
      version: blue
  template:
    metadata:
      labels:
        app: order-service
        version: blue
    spec:
      containers:
        - name: order
          image: ccr.ccs.tencentyun.com/production/order-service:v2.3.1
          ports:
            - containerPort: 8080
---
# 绿环境（新版本）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service-green
  namespace: production
spec:
  replicas: 10
  selector:
    matchLabels:
      app: order-service
      version: green
  template:
    metadata:
      labels:
        app: order-service
        version: green
    spec:
      containers:
        - name: order
          image: ccr.ccs.tencentyun.com/production/order-service:v2.4.0
          ports:
            - containerPort: 8080
```

#### 流量切换（指向蓝环境）

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  ports:
    - port: 8080
      targetPort: 8080
  selector:
    app: order-service
    version: blue  # 当前指向蓝环境
```

#### 流量切换到绿环境

```yaml
# 只需修改 selector 中的 version 标签
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  ports:
    - port: 8080
      targetPort: 8080
  selector:
    app: order-service
    version: green  # 切换到绿环境
```

#### 回滚（切回蓝环境）

```yaml
# 再次修改 selector
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  ports:
    - port: 8080
      targetPort: 8080
  selector:
    app: order-service
    version: blue  # 回滚到蓝环境
```

#### 蓝绿切换脚本

```bash
#!/bin/bash
# blue-green-switch.sh
# 用法: ./blue-green-switch.sh <target-version>
# 示例: ./blue-green-switch.sh green

TARGET=$1
if [ "$TARGET" != "blue" ] && [ "$TARGET" != "green" ]; then
  echo "Usage: $0 [blue|green]"
  exit 1
fi

echo "Switching traffic to $TARGET environment..."
kubectl patch service order-service -n production \
  -p "{\"spec\":{\"selector\":{\"app\":\"order-service\",\"version\":\"$TARGET\"}}}"

echo "Verifying switch..."
kubectl get endpoints order-service -n production -o wide

echo "Switch to $TARGET completed at $(date)"
```

### 11.3.4 使用场景

- **数据库 schema 变更**：新版本需要修改数据库表结构，无法与旧版本兼容。蓝绿部署确保切换前旧版本完全不受影响。
- **高风险发布**：核心交易系统、支付服务等对稳定性要求极高的场景，需要瞬时切换和瞬时回滚。
- **合规审计需求**：需要明确的版本切换记录和回滚路径，蓝绿部署的切换操作可审计、可追溯。
- **性能对比测试**：在切换前可以对绿环境进行压测，验证性能指标满足要求后再切换。

### 11.3.5 潜在风险与注意事项

- **资源成本翻倍**：需要同时运行两套完整环境，资源消耗是正常情况的两倍。对于大规模集群，成本压力显著。建议在切换验证完成后及时释放旧环境。
- **数据同步问题**：蓝绿切换时，绿环境需要处理蓝环境运行期间产生的增量数据。如果数据库是共享的，需要确保 schema 兼容；如果数据库是独立的，需要数据同步机制。
- **切换瞬间的请求中断**：kube-proxy 更新 iptables 规则需要数秒时间，切换瞬间可能有少量请求路由到旧 Pod 但旧 Pod 已不再接收新流量。建议配置 Pod 的 preStop hook 和 terminationGracePeriodSeconds。
- **长连接断开**：WebSocket、gRPC Stream 等长连接在切换时会被强制断开。需要客户端实现重连机制。

### 11.3.6 本章小结

蓝绿部署通过维护两套独立环境实现了瞬时切换和瞬时回滚，是风险最高的发布场景下的首选方案。其核心优势在于"新旧版本零共存"，彻底避免了兼容性问题。代价是双倍资源成本和数据同步的复杂度。在 TKE 上实现蓝绿部署非常简单——只需修改 Service 的 selector 标签即可完成流量切换。

---

## 11.4 金丝雀发布

### 11.4.1 解决的问题

蓝绿部署虽然安全，但"全有或全无"的切换方式仍然存在风险——即使经过充分测试，新版本在生产环境中仍可能出现未预料到的问题。金丝雀发布（Canary Release）通过逐步扩大新版本的流量比例，在灰度过程中持续监控，一旦发现问题立即回滚，将影响范围控制在最小。

### 11.4.2 核心原理

金丝雀发布的核心是**渐进式流量迁移**和**自动化可观测性反馈**。典型流程为：

1. 部署金丝雀版本（初始权重 1%）
2. 监控错误率、延迟、业务指标
3. 如果指标正常，逐步提高权重（5% → 20% → 50% → 100%）
4. 如果指标异常，自动或手动回滚

每一步的流量调整和指标验证构成了"发布-验证-扩大"的闭环。

### 11.4.3 代码/配置实现

#### 金丝雀发布完整流程

```yaml
# 步骤 1：部署金丝雀版本（1% 流量）
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: order-service-canary
  namespace: production
spec:
  hosts:
    - order-service
  http:
    - route:
        - destination:
            host: order-service
            subset: canary
          weight: 1
        - destination:
            host: order-service
            subset: stable
          weight: 99
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: order-service-destination
  namespace: production
spec:
  host: order-service
  subsets:
    - name: stable
      labels:
        version: v2.3.1
    - name: canary
      labels:
        version: v2.4.0
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
    outlierDetection:
      consecutive5xxErrors: 3
      interval: 10s
      baseEjectionTime: 30s
```

```yaml
# 步骤 2：验证通过后，提升到 5%
# 修改 VirtualService 中的 weight
http:
  - route:
      - destination:
          host: order-service
          subset: canary
        weight: 5
      - destination:
          host: order-service
          subset: stable
        weight: 95
```

```yaml
# 步骤 3：继续提升到 20%
http:
  - route:
      - destination:
          host: order-service
          subset: canary
        weight: 20
      - destination:
          host: order-service
          subset: stable
        weight: 80
```

```yaml
# 步骤 4：全量发布（100%）
http:
  - route:
      - destination:
          host: order-service
          subset: canary
        weight: 100
      - destination:
          host: order-service
          subset: stable
        weight: 0
```

#### 金丝雀发布自动化脚本

```bash
#!/bin/bash
# canary-release.sh
# 自动化金丝雀发布流程

SERVICE="order-service"
NAMESPACE="production"
CANARY_WEIGHT=1
MAX_WEIGHT=100
STEP_WEIGHTS=(1 5 20 50 100)
MONITOR_INTERVAL=120  # 每个阶段监控 2 分钟

rollback() {
  echo "[ROLLBACK] 检测到异常，回滚到稳定版本..."
  kubectl apply -f - <<EOF
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: $SERVICE-canary
  namespace: $NAMESPACE
spec:
  hosts:
    - $SERVICE
  http:
    - route:
        - destination:
            host: $SERVICE
            subset: stable
          weight: 100
EOF
  echo "[ROLLBACK] 回滚完成"
  exit 1
}

check_metrics() {
  # 检查错误率（示例：查询 Prometheus）
  local error_rate=$(kubectl exec prometheus-server -- \
    curl -s "http://localhost:9090/api/v1/query" \
    --data-urlencode "query=sum(rate(http_requests_total{service='$SERVICE',status=~'5..'}[1m]))/sum(rate(http_requests_total{service='$SERVICE'}[1m]))" \
    | jq -r '.data.result[0].value[1] // 0')

  if (( $(echo "$error_rate > 0.01" | bc -l) )); then
    echo "[ALERT] 错误率异常: ${error_rate}%"
    return 1
  fi

  # 检查 P99 延迟
  local p99_latency=$(kubectl exec prometheus-server -- \
    curl -s "http://localhost:9090/api/v1/query" \
    --data-urlencode "query=histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service='$SERVICE'}[1m])) by (le))" \
    | jq -r '.data.result[0].value[1] // 0')

  if (( $(echo "$p99_latency > 2.0" | bc -l) )); then
    echo "[ALERT] P99 延迟异常: ${p99_latency}s"
    return 1
  fi

  echo "[OK] 指标正常 (错误率: ${error_rate}%, P99: ${p99_latency}s)"
  return 0
}

# 主流程
echo "[START] 开始金丝雀发布: $SERVICE"

for weight in "${STEP_WEIGHTS[@]}"; do
  echo "[STEP] 将金丝雀权重提升至 ${weight}%"

  # 更新权重
  kubectl apply -f - <<EOF
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: $SERVICE-canary
  namespace: $NAMESPACE
spec:
  hosts:
    - $SERVICE
  http:
    - route:
        - destination:
            host: $SERVICE
            subset: canary
          weight: $weight
        - destination:
            host: $SERVICE
            subset: stable
          weight: $((100 - weight))
EOF

  echo "[WAIT] 等待 $MONITOR_INTERVAL 秒观察指标..."
  sleep $MONITOR_INTERVAL

  # 检查指标
  if ! check_metrics; then
    rollback
  fi
done

echo "[SUCCESS] 金丝雀发布完成，新版本已全量上线"
```

### 11.4.4 使用场景

- **常规版本迭代**：每周或双周发布的常规功能版本，通过金丝雀发布逐步放量，降低回归风险。
- **基础设施变更**：Kubernetes 版本升级、节点池更换、CNI 插件升级等基础设施变更，先让少量业务 Pod 验证。
- **配置变更**：业务配置中心的大范围配置修改，先推送给少量实例验证。
- **第三方依赖升级**：SDK 版本升级、基础镜像更新等，先灰度验证兼容性。

### 11.4.5 潜在风险与注意事项

- **监控指标覆盖不全**：仅监控错误率和延迟可能不够，业务指标（如订单转化率、支付成功率）的异常往往更隐蔽。建议同时监控业务层指标。
- **金丝雀流量过小导致统计偏差**：1% 的流量在低并发时段可能只有几十个请求，不足以暴露问题。建议设置最小请求量阈值，低于阈值时自动暂停推进。
- **回滚延迟**：从问题发生到监控告警，再到人工确认回滚，通常需要 5-15 分钟。这段时间内受影响用户持续增加。建议配置自动化回滚策略。
- **状态兼容性**：金丝雀版本可能写入与旧版本不兼容的数据（如新增字段），回滚后这些数据无法被旧版本正确处理。需要设计向前兼容的数据格式。

### 11.4.6 本章小结

金丝雀发布是生产环境中应用最广泛的灰度发布策略。它通过渐进式流量迁移和持续监控，在风险可控的前提下完成版本上线。在 TKE 上，结合 Istio 的权重路由和 Prometheus 监控，可以实现高度自动化的金丝雀发布流程。关键在于设置合理的监控指标和自动化回滚阈值，将 MTTR（平均修复时间）降到最低。

---

## 11.5 A/B 测试

### 11.5.1 解决的问题

灰度发布和金丝雀发布的目的是"降低发布风险"，而 A/B 测试的目的是"验证哪个版本更好"。两者虽然技术实现相似，但目标不同：灰度发布追求稳定性，A/B 测试追求业务指标优化。A/B 测试需要将用户随机分配到不同版本，并对比关键业务指标（转化率、点击率、留存率等），以数据驱动的方式决定哪个版本胜出。

### 11.5.2 核心原理

A/B 测试的技术实现分为两个层面：

**流量路由层**：将用户按规则分配到不同版本。分配规则需要保证同一用户始终访问同一版本（一致性哈希），否则测试结果会被污染。

**特征标记层**：通过 Feature Flag（特征标记）在应用代码中动态控制功能开关。Feature Flag 可以在不重新部署的情况下开启或关闭某个功能，是实现 A/B 测试的灵活手段。

### 11.5.3 代码/配置实现

#### 基于用户 ID 哈希的 A/B 测试路由

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: recommendation-ab-testing
  namespace: production
spec:
  hosts:
    - recommendation-service
  http:
    - match:
        - headers:
            x-user-id:
              regex: "^[0-4]"  # 用户 ID 以 0-4 开头 → 实验组 A
      route:
        - destination:
            host: recommendation-service
            subset: v2  # 新版推荐算法
    - match:
        - headers:
            x-user-id:
              regex: "^[5-9]"  # 用户 ID 以 5-9 开头 → 对照组 B
      route:
        - destination:
            host: recommendation-service
            subset: v1  # 旧版推荐算法
```

#### 基于设备类型的 A/B 测试路由

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: payment-ab-testing
  namespace: production
spec:
  hosts:
    - payment-service
  http:
    - match:
        - headers:
            x-device-type:
              exact: "ios"
      route:
        - destination:
            host: payment-service
            subset: v2  # iOS 用户使用新版支付流程
    - match:
        - headers:
            x-device-type:
              exact: "android"
      route:
        - destination:
            host: payment-service
            subset: v2
          weight: 50  # Android 用户 50% 使用新版
        - destination:
            host: payment-service
            subset: v1
          weight: 50
    - route:
        - destination:
            host: payment-service
            subset: v1  # 其他设备使用旧版
          weight: 100
```

#### Feature Flag 配置（基于 ConfigMap）

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: feature-flags
  namespace: production
data:
  features.yaml: |
    features:
      new_checkout_flow:
        enabled: true
        rollout_percentage: 30
        target_users:
          - region: shanghai
          - user_group: beta
      ai_recommendation:
        enabled: true
        rollout_percentage: 5
      dark_mode:
        enabled: false
```

#### Feature Flag 客户端代码示例

```java
// Feature Flag 客户端（简化示例）
@Component
public class FeatureFlagClient {

    @Value("${feature.flags.config:features.yaml}")
    private String configPath;

    private Map<String, FeatureFlag> flags;

    @PostConstruct
    public void init() {
        // 从 ConfigMap 加载配置
        this.flags = loadFeatureFlags();
    }

    public boolean isEnabled(String featureName, UserContext user) {
        FeatureFlag flag = flags.get(featureName);
        if (flag == null || !flag.isEnabled()) {
            return false;
        }

        // 基于用户 ID 哈希决定是否命中灰度范围
        int hash = Math.abs(user.getUserId().hashCode()) % 100;
        if (hash >= flag.getRolloutPercentage()) {
            return false;
        }

        // 检查用户是否在目标范围内
        if (flag.getTargetRegions() != null
            && !flag.getTargetRegions().contains(user.getRegion())) {
            return false;
        }

        return true;
    }
}

// 业务代码中使用 Feature Flag
@Service
public class CheckoutService {

    @Autowired
    private FeatureFlagClient featureFlag;

    public CheckoutResult checkout(Order order, UserContext user) {
        if (featureFlag.isEnabled("new_checkout_flow", user)) {
            return newCheckoutFlow(order, user);  // 新版流程
        }
        return oldCheckoutFlow(order, user);  // 旧版流程
    }
}
```

#### 指标对比（Prometheus 指标定义）

```yaml
# Prometheus 指标采集配置
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ab-testing-monitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: recommendation-service
  endpoints:
    - port: metrics
      path: /metrics
      interval: 15s
  namespaceSelector:
    matchNames:
      - production
---
# 应用代码中暴露 A/B 测试指标
# 示例 Prometheus 指标：
# ab_test_conversion_rate{experiment="new_checkout",variant="control"} 0.032
# ab_test_conversion_rate{experiment="new_checkout",variant="treatment"} 0.041
# ab_test_click_through_rate{experiment="ai_recommendation",variant="control"} 0.12
# ab_test_click_through_rate{experiment="ai_recommendation",variant="treatment"} 0.18
```

### 11.5.4 使用场景

- **UI/UX 改版**：新首页布局、新的按钮样式、新的导航结构，通过 A/B 测试验证用户 engagement 指标。
- **算法优化**：推荐算法、搜索排序、定价策略的优化效果验证。
- **流程优化**：注册流程简化、支付流程优化、下单流程变更，对比转化率。
- **文案和营销**：不同文案、不同促销策略的效果对比。

### 11.5.5 潜在风险与注意事项

- **样本一致性**：A/B 测试要求同一用户在测试期间始终访问同一版本，否则测试结果无效。必须使用一致性哈希或用户维度路由。
- **测试时长**：测试时间过短可能无法达到统计显著性。建议使用统计工具（如样本量计算器）预先计算所需样本量和测试时长。
- **多重测试偏差**：同时运行多个 A/B 测试时，不同测试之间可能相互干扰。建议使用分层实验平台或确保测试覆盖的用户群体不重叠。
- **Novelty 效应**：用户对新功能的新鲜感可能导致短期指标虚高，长期效果可能回落。建议延长测试周期以观察稳定后的效果。
- **伦理与合规**：A/B 测试不应损害用户体验或利益。涉及价格、隐私等敏感实验需要谨慎设计。

### 11.5.6 本章小结

A/B 测试与灰度发布共享技术基础设施，但目标不同。灰度发布追求"安全上线"，A/B 测试追求"哪个更好"。在 TKE 上，可以使用 Istio 的请求头路由实现用户分桶，结合 Feature Flag 实现细粒度的功能开关控制。关键在于保证用户分桶的一致性、采集正确的业务指标、以及使用统计方法验证结果的显著性。

---

## 11.6 灰度发布的潜在风险

### 11.6.1 灰度范围失控

#### 问题描述

灰度范围失控是指灰度流量意外覆盖了不应覆盖的用户群体。例如，基于权重的灰度中，1% 的权重在日活 1000 万的系统里意味着每天有 10 万用户受到影响。如果灰度版本存在严重 Bug，影响面可能远超预期。

#### 根因分析

- **权重理解偏差**：1% 权重在低流量时段可能只影响几十个请求，但在高峰期可能影响数万用户。团队对"1%"的实际影响面缺乏量化认知。
- **灰度规则冲突**：多个灰度规则同时生效时，某些请求可能匹配到非预期的规则，进入灰度版本。
- **缓存和 CDN 干扰**：CDN 节点或浏览器缓存可能导致用户绕过灰度规则，直接访问到新版本。

#### 应对措施

- 在灰度初期使用 header/cookie 精确控制灰度范围，而非仅依赖权重。
- 设置灰度流量的绝对上限（如最大 QPS 限制），防止流量突增。
- 在灰度版本中增加"白名单"机制，只有明确标记的用户才能访问。

### 11.6.2 流量比例不精确

#### 问题描述

配置的灰度权重与实际到达灰度版本的流量比例存在偏差。例如，配置 1% 权重，实际可能只有 0.3% 或 2.5%。

#### 根因分析

- **nginx-ingress 权重实现**：nginx-ingress 的 canary-weight 基于 nginx 的 `split_clients` 指令，使用一致性哈希分发。在请求量较小时，实际比例可能偏离配置值。
- **CLB 权重精度**：CLB 的权重配置最小粒度为 1，对于后端数量较少的场景，实际流量比例可能无法精确到 1%。
- **DNS 缓存**：客户端 DNS 缓存可能导致流量长时间指向同一后端，造成比例偏差。

#### 应对措施

- 在低流量时段使用 header/cookie 灰度替代权重灰度，确保灰度范围精确可控。
- 使用 Istio 的权重路由（基于 Envoy 的 `runtime` 过滤器），精度更高。
- 通过监控系统实时验证实际流量比例，而非仅信任配置值。

### 11.6.3 回滚延迟

#### 问题描述

从问题发生到完成回滚，中间存在数分钟甚至数十分钟的延迟。这段时间内，受影响用户持续增加，业务损失不断扩大。

#### 根因分析

- **检测延迟**：监控系统的采集周期（通常 15-30 秒）加上告警评估周期（通常 1-5 分钟），导致问题发生 2-5 分钟后才触发告警。
- **确认延迟**：人工确认告警需要查看仪表盘、确认问题根因，通常需要 3-10 分钟。
- **操作延迟**：手动执行回滚命令、等待配置生效，需要 1-3 分钟。
- **缓存和连接池**：即使回滚完成，客户端缓存和连接池中的旧连接可能继续访问问题版本。

#### 应对措施

- 配置自动化回滚策略：当错误率超过阈值时，系统自动将灰度权重归零。
- 缩短监控采集周期（如 10 秒）和告警评估周期（如 30 秒）。
- 使用蓝绿部署替代金丝雀发布：蓝绿部署的回滚是瞬时切换，延迟最低。
- 在回滚脚本中增加缓存刷新和连接池清理步骤。

### 11.6.4 数据兼容性问题

#### 问题描述

灰度版本写入的数据格式与旧版本不兼容，回滚后旧版本无法正确处理这些数据。

#### 根因分析

- **Schema 变更**：灰度版本新增了数据库字段或修改了字段类型，回滚后旧版本无法识别。
- **消息格式变更**：灰度版本修改了消息队列的消息格式，旧版本消费者无法解析。
- **缓存格式变更**：灰度版本修改了 Redis 缓存的数据结构，旧版本读取时反序列化失败。

#### 应对措施

- 严格遵循"向前兼容"原则：新版本写入的数据必须能被旧版本读取。
- 数据库变更使用"新增不修改"策略：只新增字段和表，不修改或删除已有结构。
- 消息队列使用版本化 schema（如 Avro、Protobuf），支持新旧格式共存。
- 缓存数据使用版本号标记，旧版本遇到高版本数据时自动跳过或重建。

### 11.6.5 本章小结

灰度发布并非银弹，它本身也引入了一系列风险。灰度范围失控、流量比例不精确、回滚延迟、数据兼容性问题是生产环境中最常见的四类灰度事故。应对这些风险需要从三个方面入手：**技术层面**（精确的流量控制、自动化回滚、向前兼容的数据设计）、**流程层面**（灰度前评审、灰度中监控、灰度后复盘）、**组织层面**（明确灰度决策权、建立灰度事故应急响应机制）。只有将灰度发布作为一套完整的风险管理体系来建设，才能真正发挥其降低发布风险的作用。

---

## 本章总结

本章围绕 TKE 上的灰度发布与流量管理，系统讲解了四种主流方案：

| 方案 | 路由粒度 | 全链路支持 | 资源成本 | 运维复杂度 | 适用场景 |
|------|----------|------------|----------|------------|----------|
| Ingress 灰度 | 入口流量 | 否 | 低 | 低 | 简单按比例灰度 |
| 服务网格灰度 | 服务间调用 | 是 | 中 | 高 | 全链路灰度、精细路由 |
| 蓝绿部署 | 全量切换 | 是 | 高 | 低 | 高风险发布、瞬时回滚 |
| 金丝雀发布 | 渐进式 | 是 | 中 | 中 | 常规版本迭代 |

选择灰度方案时，需要综合考虑业务风险等级、团队运维能力、基础设施现状和资源成本。没有放之四海而皆准的最佳方案，只有最适合当前业务阶段的选择。

灰度发布的本质是**风险控制**——在"快速上线"和"安全上线"之间找到平衡点。技术方案只是工具，真正决定灰度成败的是配套的监控体系、自动化能力和组织流程。
