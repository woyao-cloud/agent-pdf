# 第十四章 TKE 故障排查指南

## 14.1 概述

在生产环境中，Kubernetes 集群的故障不可避免。Pod 启动失败、网络不通、性能劣化、发布卡顿、监控数据丢失——这些问题每天都在 TKE 集群中发生。本章从实战出发，系统梳理 TKE 上最常见的五类故障场景，提供从现象定位到根因分析的完整排查路径，并给出可复用的诊断脚本和 Checklist。

---

## 14.2 Pod 启动故障

### 14.2.1 CrashLoopBackOff

#### 解决的问题

Pod 反复重启，状态停留在 `CrashLoopBackOff`，无法进入 `Running` 状态。这是 TKE 上最常见的故障之一，需要快速定位是代码异常、配置错误还是探针失效。

#### 核心原理

Kubelet 检测到 Pod 内容器退出后尝试重启，遵循指数退避策略（10s、20s、40s、80s… 最大 5min）。如果容器每次启动后很快退出，Kubelet 将状态标记为 `CrashLoopBackOff`。触发原因分为三类：

1. **进程主动退出**：主进程返回非零退出码
2. **存活探针失败**：`livenessProbe` 连续失败，Kubelet 杀死容器
3. **OOMKill**：超出内存限制，内核 OOM Killer 终止进程

#### 代码/配置实现

**第一步：查看 Pod 状态和重启次数**

```bash
# 查看所有 Pod 状态
kubectl get pods -n <namespace>

# 查看特定 Pod 的详细状态
kubectl get pod <pod-name> -n <namespace> -o wide

# 查看 Pod 的 Events（最关键的排查入口）
kubectl describe pod <pod-name> -n <namespace>
```

`kubectl describe pod` 输出的 Events 段是最重要的信息源：

```
Events:
  Type     Reason     Age   From               Message
  ----     ------     ----  ----               -------
  Warning  BackOff    2m    kubelet            Back-off restarting failed container
  Normal   Pulled     2m    kubelet            Successfully pulled image "nginx:1.21"
  Normal   Created    2m    kubelet            Created container nginx
  Normal   Started    2m    kubelet            Started container nginx
  Warning  Unhealthy  1m    kubelet            Liveness probe failed: HTTP probe failed with statuscode: 503
  Normal   Killing    1m    kubelet            Container nginx failed liveness probe, will be restarted
```

**第二步：查看容器日志**

```bash
# 查看当前容器日志
kubectl logs <pod-name> -n <namespace>

# 查看前一个（已崩溃的）容器日志
kubectl logs <pod-name> -n <namespace> --previous

# 持续跟踪日志
kubectl logs -f <pod-name> -n <namespace>

# 多容器 Pod 指定容器名
kubectl logs <pod-name> -c <container-name> -n <namespace> --previous
```

**第三步：检查存活探针配置**

```yaml
# 常见的存活探针配置问题
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 3    # 过短：应用尚未就绪
  periodSeconds: 5          # 过频：增加应用负载
  failureThreshold: 1       # 过于敏感：一次失败即重启
  timeoutSeconds: 1         # 过短：慢启动应用超时
```

**诊断脚本：一键收集 CrashLoopBackOff 信息**

```bash
#!/bin/bash
# diagnose-crashloop.sh
NAMESPACE=${1:-default}
POD_NAME=$2

if [ -z "$POD_NAME" ]; then
  echo "Usage: $0 <namespace> <pod-name>"
  exit 1
fi

echo "========== POD STATUS =========="
kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o wide

echo -e "\n========== EVENTS =========="
kubectl describe pod "$POD_NAME" -n "$NAMESPACE" | grep -A 20 "Events:"

echo -e "\n========== CURRENT LOGS =========="
kubectl logs "$POD_NAME" -n "$NAMESPACE" --tail=50

echo -e "\n========== PREVIOUS LOGS =========="
kubectl logs "$POD_NAME" -n "$NAMESPACE" --previous --tail=50 2>/dev/null || echo "No previous logs"

echo -e "\n========== CONTAINER RESOURCE USAGE =========="
kubectl top pod "$POD_NAME" -n "$NAMESPACE" 2>/dev/null || echo "Metrics not available"

echo -e "\n========== LIVENESS PROBE CONFIG =========="
kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].livenessProbe}' | python -m json.tool 2>/dev/null || echo "No liveness probe configured"
```

#### 使用场景

- 新版本发布后 Pod 持续重启
- 配置变更导致应用启动失败
- 依赖服务（数据库、Redis）未就绪时应用启动
- 慢启动应用在探针超时前被误杀

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| 日志轮转丢失 | 容器崩溃后日志随 Pod 删除 | 使用 `--previous` 查看崩溃前日志，或配置日志采集到 CLS |
| 探针过于敏感 | `failureThreshold=1` 导致瞬态故障即重启 | 生产环境建议 `failureThreshold=3` |
| 启动耗时波动 | 应用启动时间随负载变化 | `initialDelaySeconds` 设置为 P99 启动时间的 1.5 倍 |
| 退出码为 137 | 可能是 OOM 而非代码崩溃 | 结合 `kubectl describe pod` 的 Reason 字段判断 |

### 14.2.2 ImagePullBackOff

#### 解决的问题

Pod 状态为 `ImagePullBackOff` 或 `ErrImagePull`，镜像拉取失败，容器无法启动。

#### 核心原理

Kubelet 在节点上通过容器运行时（Docker/containerd）拉取镜像，拉取失败后将状态标记为 `ImagePullBackOff`。常见原因：

1. **镜像地址错误**：名称拼写、Tag 不存在、Registry 地址错误
2. **认证失败**：私有仓库未配置 `imagePullSecrets`，或 Secret 过期
3. **镜像不存在**：CI/CD 未推送、镜像被清理、Tag 覆盖
4. **网络不通**：节点无法访问镜像仓库（TKE 公网拉取需 NAT 网关）
5. **磁盘空间不足**：节点磁盘使用率超过 85%，容器运行时无法拉取镜像
6. **镜像拉取限流**：Docker Hub 匿名拉取限流（每 6 小时 100 次）

#### 代码/配置实现

**排查命令**

```bash
# 查看具体错误原因
kubectl describe pod <pod-name> -n <namespace>

# 典型输出
# Events:
#   Type     Reason                  Age   From           Message
#   ----     ------                  ----  ----           -------
#   Warning  Failed                  10s   kubelet        Failed to pull image "myapp:v1": rpc error: code = NotFound desc = failed to pull and unpack image: manifest for myapp:v1 not found
#   Warning  Failed                  30s   kubelet        Error: ErrImagePull
#   Warning  Failed                  40s   kubelet        Failed to pull image "myapp:v1": unauthorized: authentication required
```

**配置私有仓库认证**

```yaml
# 1. 创建 Docker Registry Secret
apiVersion: v1
kind: Secret
metadata:
  name: tencent-registry-secret
  namespace: default
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: <base64-encoded-docker-config>

# 2. 在 Pod 中引用
apiVersion: v1
kind: Pod
metadata:
  name: myapp
spec:
  imagePullSecrets:
  - name: tencent-registry-secret
  containers:
  - name: myapp
    image: ccr.ccs.tencentyun.com/myproject/myapp:v1
```

**TKE 使用 TCR 企业版镜像仓库的认证配置**

```bash
# TCR 使用长期凭证
kubectl create secret docker-registry tcr-secret \
  --docker-server=<tcr-endpoint>.tencentcloudcr.com \
  --docker-username=<username> \
  --docker-password=<password> \
  -n default

# 或使用 Service Account 自动关联
kubectl patch serviceaccount default -n default \
  -p '{"imagePullSecrets": [{"name": "tcr-secret"}]}'
```

**诊断脚本：ImagePullBackOff 排查**

```bash
#!/bin/bash
# diagnose-imagepull.sh
NAMESPACE=${1:-default}
POD_NAME=$2

if [ -z "$POD_NAME" ]; then
  echo "Usage: $0 <namespace> <pod-name>"
  exit 1
fi

echo "========== IMAGE PULL EVENTS =========="
kubectl describe pod "$POD_NAME" -n "$NAMESPACE" | grep -E "(Failed|ImagePull|BackOff|Error)"

echo -e "\n========== IMAGE CONFIG =========="
kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].image}'
echo ""

echo -e "\n========== IMAGE PULL SECRETS =========="
kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.imagePullSecrets}'
echo ""

echo -e "\n========== NODE DISK USAGE =========="
NODE=$(kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}')
kubectl describe node "$NODE" | grep -A 5 "Conditions" | head -10

echo -e "\n========== TEST IMAGE PULL ON NODE =========="
echo "SSH to node and run: ctr image pull <image>"
echo "Or: docker pull <image>"
```

#### 使用场景

- CI/CD 流水线推送镜像后 Pod 无法拉取
- 切换镜像仓库（从 Docker Hub 迁移到 TCR）
- 跨地域拉取镜像（如上海集群拉取硅谷仓库镜像）
- 私有镜像库认证凭证过期

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| Docker Hub 限流 | 匿名用户每 6h 100 次拉取 | 配置 Docker Hub 认证或使用 TCR 镜像缓存 |
| TCR 凭证过期 | 长期凭证有效期最长 90 天 | 使用 `kubectl create secret` 更新前先删除旧 Secret |
| 镜像 Tag 不可变 | TCR 开启 Tag 不可变后无法覆盖 | CI/CD 使用新 Tag 而非覆盖 `latest` |
| 节点磁盘满 | 镜像解压需要额外空间 | 配置节点自动扩容或镜像 GC 策略 |

### 14.2.3 OOMKill

#### 解决的问题

Pod 被 OOM Killer 终止，状态为 `OOMKill`（退出码 137），影响服务可用性。

#### 核心原理

Linux 内核的 Out-Of-Memory (OOM) Killer 在系统内存不足时选择进程杀死以释放内存。Kubernetes 中，当容器内存使用超过 `limits.memory` 时，cgroup 级别的 OOM Killer 直接杀死容器进程。退出码为 137（128 + SIGKILL 信号 9）。

OOM 的典型模式：

1. **内存限制过低**：`limits.memory` 小于应用实际需求
2. **内存泄漏**：应用存在内存泄漏，随时间持续增长
3. **请求/限制不匹配**：`requests.memory` 远低于 `limits.memory`，调度器过度超卖
4. **突发流量**：请求量突增导致内存峰值超过限制

#### 代码/配置实现

**确认 OOMKill**

```bash
# 查看退出码和原因
kubectl describe pod <pod-name> -n <namespace>

# Events 中显示
#   Type     Reason   Age   From     Message
#   ----     ------   ----  ----     -------
#   Warning  OOMKill  10s   kubelet  Memory cgroup out of range: memory usage 512MiB > 256MiB

# 查看容器退出码
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.status.containerStatuses[0].state.terminated.exitCode}'
# 输出: 137
```

**分析内存使用**

```bash
# 查看 Pod 当前内存使用
kubectl top pod <pod-name> -n <namespace>

# 查看节点内存压力
kubectl describe node <node-name> | grep -A 10 "Capacity"

# 查看 Pod 的资源限制
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[0].resources}'
```

**调整资源限制**

```yaml
# 原配置（内存限制过低）
resources:
  requests:
    memory: "128Mi"
  limits:
    memory: "256Mi"    # 应用实际需要 512Mi

# 修正后
resources:
  requests:
    memory: "512Mi"    # 请求值应接近实际使用
  limits:
    memory: "768Mi"    # 留 50% 余量应对突发
```

**Java 应用内存分析**

```bash
# 在容器内查看 JVM 内存配置
kubectl exec <pod-name> -n <namespace> -- java -XX:+PrintFlagsFinal -version | grep -E "(MaxHeapSize|InitialHeapSize)"

# 生成 Heap Dump（需提前配置 -XX:+HeapDumpOnOutOfMemoryError）
kubectl exec <pod-name> -n <namespace> -- jmap -dump:format=b,file=/tmp/heap.hprof 1
kubectl cp <namespace>/<pod-name>:/tmp/heap.hprof ./heap.hprof

# 查看 GC 日志
kubectl logs <pod-name> -n <namespace> | grep -E "(GC|Full GC|OutOfMemory)"
```

**诊断脚本：OOM 排查**

```bash
#!/bin/bash
# diagnose-oom.sh
NAMESPACE=${1:-default}
POD_NAME=$2

if [ -z "$POD_NAME" ]; then
  echo "Usage: $0 <namespace> <pod-name>"
  exit 1
fi

echo "========== EXIT CODE =========="
EXIT_CODE=$(kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.status.containerStatuses[0].state.terminated.exitCode}')
echo "Exit code: $EXIT_CODE"
if [ "$EXIT_CODE" = "137" ]; then
  echo "=> This is an OOMKill (128+9=SIGKILL)"
fi

echo -e "\n========== RESOURCE LIMITS =========="
kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].resources}' | python -m json.tool

echo -e "\n========== ACTUAL MEMORY USAGE =========="
kubectl top pod "$POD_NAME" -n "$NAMESPACE" 2>/dev/null || echo "Metrics not available"

echo -e "\n========== NODE MEMORY PRESSURE =========="
NODE=$(kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}')
kubectl describe node "$NODE" | grep -E "(Memory|OutOfMemory|DiskPressure)"

echo -e "\n========== RECOMMENDED LIMITS =========="
echo "If OOM occurs, increase limits.memory by 50% and set requests to 70% of limits"
```

#### 使用场景

- 大促流量高峰时 Pod 批量 OOM
- Java/Go 应用长期运行后内存持续增长
- 新版本引入内存泄漏
- 多个 Pod 调度到同一节点导致节点级内存压力

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| 盲目提高限制 | 可能导致节点资源不足 | 配合 HPA 和节点自动扩缩容 |
| JVM 未感知 cgroup 限制 | Java 8u131 之前不识别 cgroup | 使用 `-XX:+UseContainerSupport`（JDK 10+）或显式设置 `-Xmx` |
| 请求值设置过低 | 调度器超卖导致节点 OOM | `requests.memory` 应基于 P99 使用量 |
| 未配置 Heap Dump | OOM 后无法分析根因 | 添加 `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/` |

### 14.2.4 Pod 启动故障排查 Checklist

```
□ Pod 状态是否为 CrashLoopBackOff / ImagePullBackOff / OOMKill？
□ 执行 kubectl describe pod 查看 Events
□ 执行 kubectl logs --previous 查看崩溃前日志
□ 检查资源限制是否合理（kubectl top pod）
□ 检查镜像名称和 Tag 是否正确
□ 检查 imagePullSecrets 是否配置且未过期
□ 检查存活探针参数（initialDelaySeconds / failureThreshold）
□ 检查节点磁盘和内存使用率
□ 检查应用启动是否依赖外部服务（数据库、Redis）
```

---

## 14.3 网络故障

### 14.3.1 Service 不可达

#### 解决的问题

客户端通过 Service 访问后端 Pod 失败，返回 Connection Refused 或 Timeout。

#### 核心原理

Kubernetes Service 的流量路径：`Client → Service VIP → kube-proxy (iptables/IPVS) → Endpoint (Pod IP:Port)`。任一环节故障都会导致不可达。

TKE 中 Service 类型分为：

- **ClusterIP**：集群内访问，依赖 kube-proxy
- **NodePort**：节点端口访问，依赖 kube-proxy + 安全组
- **LoadBalancer**：公网/内网访问，依赖 CLB（Cloud Load Balancer）+ 健康检查

#### 代码/配置实现

**排查 Endpoint**

```bash
# 检查 Service 是否有 Endpoint
kubectl get svc <service-name> -n <namespace>
kubectl get endpoints <service-name> -n <namespace>

# 如果 Endpoints 为空，说明 Selector 未匹配到 Pod
# 检查 Service 的 Selector
kubectl get svc <service-name> -n <namespace> -o jsonpath='{.spec.selector}'

# 检查 Pod 的 Labels
kubectl get pods -n <namespace> --show-labels
```

**排查 kube-proxy**

```bash
# 查看 kube-proxy 模式
kubectl get configmap kube-proxy -n kube-system -o jsonpath='{.config.mode}'

# 检查 kube-proxy Pod 状态
kubectl get pods -n kube-system -l k8s-app=kube-proxy

# 在节点上验证 iptables 规则
# SSH 到节点后执行
iptables-save -t nat | grep <service-name>
iptables -t nat -L -n | grep <cluster-ip>

# IPVS 模式
ipvsadm -L -n | grep <cluster-ip>
```

**排查 CLB 健康检查（TKE LoadBalancer 类型 Service）**

```bash
# 查看 Service 关联的 CLB
kubectl get svc <service-name> -n <namespace> -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# 查看 CLB 健康检查状态（需通过 TKE 控制台或 API）
# TKE 控制台：集群 → 服务与路由 → Service → 查看 CLB

# 检查 NodePort 是否可达
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[0].address}')
NODE_PORT=$(kubectl get svc <service-name> -n <namespace> -o jsonpath='{.spec.ports[0].nodePort}')
curl http://$NODE_IP:$NODE_PORT/healthz
```

**诊断脚本：Service 连通性排查**

```bash
#!/bin/bash
# diagnose-service.sh
NAMESPACE=${1:-default}
SERVICE_NAME=$2

if [ -z "$SERVICE_NAME" ]; then
  echo "Usage: $0 <namespace> <service-name>"
  exit 1
fi

echo "========== SERVICE INFO =========="
kubectl get svc "$SERVICE_NAME" -n "$NAMESPACE" -o wide

echo -e "\n========== ENDPOINTS =========="
kubectl get endpoints "$SERVICE_NAME" -n "$NAMESPACE"

echo -e "\n========== SELECTOR MATCH =========="
SELECTOR=$(kubectl get svc "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.selector}')
echo "Service selector: $SELECTOR"
echo "Matching pods:"
kubectl get pods -n "$NAMESPACE" -l "$(echo $SELECTOR | sed 's/[{}" ]//g' | sed 's/,/ /g')" -o wide

echo -e "\n========== CLUSTER IP TEST =========="
CLUSTER_IP=$(kubectl get svc "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}')
PORT=$(kubectl get svc "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}')
echo "Testing $CLUSTER_IP:$PORT from a debug pod..."
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- curl -s -o /dev/null -w "%{http_code}" "http://$CLUSTER_IP:$PORT" 2>/dev/null || echo "Connection failed"

echo -e "\n========== KUBE-PROXY STATUS =========="
kubectl get pods -n kube-system -l k8s-app=kube-proxy

echo -e "\n========== CLB HEALTH CHECK =========="
echo "Check CLB health in TKE console:"
echo "https://console.cloud.tencent.com/tke2/cluster/<cluster-id>/service/<namespace>/$SERVICE_NAME"
```

#### 使用场景

- 新部署的服务无法访问
- 更新 Service 后连接中断
- CLB 健康检查失败导致后端被摘除
- 跨命名空间服务调用失败

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| CLB 闲置连接超时 | 长连接超过 CLB 超时时间被断开 | 配置 CLB 的超时时间或应用层心跳 |
| 安全组未放通 NodePort | TKE 节点安全组默认仅放通部分端口 | 检查节点安全组入站规则 |
| kube-proxy 模式不一致 | 混用 iptables 和 IPVS 模式 | 集群内统一模式 |
| Endpoint 更新延迟 | Service 关联 Pod 变更后 Endpoint 更新有秒级延迟 | 使用 readinessGate 确保流量切换 |

### 14.3.2 DNS 解析故障

#### 解决的问题

集群内 Pod 无法解析 Service 域名或外部域名，导致服务调用失败。

#### 核心原理

Kubernetes DNS 解析链路：`Pod → /etc/resolv.conf (nameserver) → kube-dns Service → CoreDNS Pod → 上游 DNS 服务器`。

TKE 默认使用 CoreDNS 作为集群 DNS，Pod 的 `resolv.conf` 由 Kubelet 自动注入，格式为：

```
nameserver <cluster-dns-ip>
search <namespace>.svc.cluster.local svc.cluster.local cluster.local <node-domain>
ndots: 5
```

#### 代码/配置实现

**排查 CoreDNS 状态**

```bash
# 查看 CoreDNS Pod 状态
kubectl get pods -n kube-system -l k8s-app=kube-dns

# 查看 CoreDNS 日志
kubectl logs -n kube-system -l k8s-app=kube-dns

# 查看 CoreDNS 资源使用
kubectl top pod -n kube-system -l k8s-app=kube-dns

# 查看 CoreDNS ConfigMap
kubectl get configmap coredns -n kube-system -o yaml
```

**DNS 解析测试**

```bash
# 创建测试 Pod
kubectl run -it --rm dns-test --image=nicolaka/netshoot --restart=Never

# 在测试 Pod 中执行
# 测试 Service 域名解析
nslookup kubernetes.default.svc.cluster.local

# 测试跨命名空间 Service
nslookup <service-name>.<namespace>.svc.cluster.local

# 测试外部域名
nslookup www.baidu.com

# 测试 DNS 响应时间
dig +stats kubernetes.default.svc.cluster.local

# 查看 Pod 的 DNS 配置
cat /etc/resolv.conf
```

**配置 stub domain（自定义 DNS）**

```yaml
# 修改 CoreDNS ConfigMap 添加自定义域名解析
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns
  namespace: kube-system
data:
  Corefile: |
    .:53 {
        errors
        health {
            lameduck 5s
        }
        ready
        kubernetes cluster.local in-addr.arpa ip6.arpa {
            pods insecure
            fallthrough in-addr.arpa ip6.arpa
        }
        # 自定义域名解析到内网 DNS
        internal.example.com:53 {
            forward . 10.0.0.10
        }
        prometheus :9153
        forward . /etc/resolv.conf
        cache 30
        loop
        reload
        loadbalance
    }
```

**诊断脚本：DNS 全链路排查**

```bash
#!/bin/bash
# diagnose-dns.sh
NAMESPACE=${1:-default}

echo "========== COREDNS POD STATUS =========="
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide

echo -e "\n========== COREDNS SERVICE =========="
kubectl get svc -n kube-system kube-dns

echo -e "\n========== COREDNS LOGS (LAST 20 LINES) =========="
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=20

echo -e "\n========== DNS RESOLUTION TEST =========="
kubectl run -it --rm dns-test-$RANDOM --image=nicolaka/netshoot --restart=Never -- \
  sh -c "nslookup kubernetes.default.svc.cluster.local && nslookup www.baidu.com && cat /etc/resolv.conf" 2>/dev/null

echo -e "\n========== COREDNS RESOURCE USAGE =========="
kubectl top pod -n kube-system -l k8s-app=kube-dns 2>/dev/null || echo "Metrics not available"

echo -e "\n========== NODE RESOLV.CONF =========="
echo "Check node /etc/resolv.conf for upstream DNS"
```

#### 使用场景

- 新部署的服务通过域名调用其他服务失败
- 集群 DNS 解析延迟高
- 需要解析内部自建 DNS 的域名
- 跨集群服务发现

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| ndots:5 导致查询放大 | 每个查询先尝试 search 域，产生 6 次 DNS 请求 | 使用全限定域名（FQDN，末尾加 `.`）避免 search 域遍历 |
| CoreDNS OOM | 集群规模大时 CoreDNS 内存不足 | 配置 CoreDNS 的 HPA，设置合理资源限制 |
| 上游 DNS 超时 | 腾讯云 DNS 服务器故障 | 配置多个上游 DNS 或使用缓存 |
| stub domain 配置错误 | 自定义域名解析循环 | 使用 `loop` 插件检测循环 |

### 14.3.3 跨集群通信

#### 解决的问题

多集群部署场景下，集群间的服务无法互相访问。

#### 核心原理

TKE 跨集群通信的三种方案：

1. **对等连接（Peering Connection）**：VPC 间直接互联，适用于同地域集群
2. **云联网（CCN）**：多 VPC 间互联，支持跨地域，自动路由分发
3. **公网互通**：通过 CLB 暴露服务，公网访问

#### 代码/配置实现

**排查对等连接**

```bash
# 检查 VPC 路由表是否有对等连接路由
# 腾讯云控制台：VPC → 路由表 → 查看目标网段和下一跳

# 在 Pod 中测试对端 VPC 内网连通性
kubectl run -it --rm ping-test --image=nicolaka/netshoot --restart=Never -- \
  ping -c 3 <peer-pod-ip>

# 测试对端 Service ClusterIP
kubectl run -it --rm curl-test --image=nicolaka/netshoot --restart=Never -- \
  curl -s -o /dev/null -w "%{http_code}" http://<peer-service-clusterip>:<port>
```

**排查 CCN**

```bash
# 检查 CCN 路由表
# 腾讯云控制台：云联网 → 路由表 → 查看路由传播

# 检查 CCN 带宽限制（跨地域需要配置带宽）
# 腾讯云控制台：云联网 → 带宽管理

# 测试跨地域延迟
kubectl run -it --rm latency-test --image=nicolaka/netshoot --restart=Never -- \
  ping -c 10 <peer-pod-ip>
```

**配置 GlobalRouter 模式跨集群通信**

```yaml
# TKE GlobalRouter 模式下，Pod 直接使用 VPC 内网 IP
# 跨集群通信只需 VPC 间路由可达

# 集群 A 的 Pod 直接访问集群 B 的 Pod
# 前提：两个集群的 VPC 通过对等连接或 CCN 打通
# 且 Pod CIDR 不重叠

# 检查 Pod IP 是否可达
kubectl run -it --rm test-$RANDOM --image=nicolaka/netshoot --restart=Never -- \
  curl http://<cluster-b-pod-ip>:<port>
```

#### 使用场景

- 多集群微服务间互相调用
- 跨地域容灾集群数据同步
- 开发/测试集群访问生产集群的只读服务
- 混合云场景下 IDC 与 TKE 集群互通

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| Pod CIDR 冲突 | 两个集群的 Pod CIDR 重叠导致路由冲突 | 创建集群时规划不重叠的 CIDR |
| 跨地域延迟高 | 跨地域 CCN 延迟 10-50ms | 高频调用部署在同地域集群 |
| CCN 带宽不足 | 跨地域 CCN 默认带宽为 0 | 配置足够的带宽上限 |
| 安全组/NACL 拦截 | 跨 VPC 流量被安全组或网络 ACL 拒绝 | 放通对端 VPC CIDR |

### 14.3.4 网络故障排查 Checklist

```
□ Service Endpoints 是否为空？
□ Service Selector 是否匹配 Pod Labels？
□ kube-proxy Pod 是否正常运行？
□ CLB 健康检查是否通过？
□ 安全组是否放通了必要端口？
□ CoreDNS Pod 是否正常运行？
□ nslookup 测试是否成功？
□ 跨集群 VPC 路由是否配置？
□ Pod CIDR 是否冲突？
□ 网络延迟是否在正常范围？
```

---

## 14.4 性能故障

### 14.4.1 CPU Throttling

#### 解决的问题

应用响应变慢，CPU 使用率不高但请求延迟增加，通常由 CPU 限制导致的 Throttling 引起。

#### 核心原理

Kubernetes 使用 CFS（Completely Fair Scheduler）实现 CPU 限制。当 `limits.cpu` 设置后，Kubelet 在 cgroup 中配置 `cpu.cfs_period_us`（默认 100ms）和 `cpu.cfs_quota_us`（= `limits.cpu` × 100ms）。如果容器在周期内用尽配额，后续线程被 Throttle 直到下一周期。

例如 `limits.cpu: 1` 意味着每 100ms 周期最多使用 100ms CPU 时间。如果应用在 50ms 内用完全部配额，剩余 50ms 被 Throttle。

#### 代码/配置实现

**检测 CPU Throttling**

```bash
# 查看 cgroup 中的 CPU 统计
# SSH 到节点后执行
cat /sys/fs/cgroup/cpu/kubepods/besteffort/pod<pod-uid>/cpu.stat
# nr_periods: 1000        # 总周期数
# nr_throttled: 500        # 被 Throttle 的周期数
# throttled_time: 25000000 # 被 Throttle 的总时间（微秒）

# 使用 kubectl 查看 Pod 的 CPU 使用
kubectl top pod <pod-name> -n <namespace>

# 查看节点 CPU 压力
kubectl describe node <node-name> | grep -A 5 "Allocated resources"
```

**查看 CPU 限制配置**

```bash
# 查看 Pod 的 CPU 限制
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[0].resources}'

# 查看 Pod 所在节点的可分配 CPU
kubectl describe node <node-name> | grep -E "(cpu|Capacity|Allocatable)"
```

**调整 CPU 配置**

```yaml
# 原配置（CPU 限制过低导致 Throttling）
resources:
  requests:
    cpu: "500m"
  limits:
    cpu: "1000m"    # 应用实际需要 1.5 核

# 修正方案一：提高限制
resources:
  requests:
    cpu: "1000m"
  limits:
    cpu: "2000m"    # 留余量

# 修正方案二：取消限制（不推荐生产环境）
resources:
  requests:
    cpu: "1000m"
  # 不设置 limits.cpu，使用 Burstable QoS
```

**使用 VPA 推荐 CPU 配置**

```yaml
# 安装 VPA 后查看推荐值
kubectl get vpa <vpa-name> -n <namespace> -o jsonpath='{.status.recommendation.containerRecommendations}'

# VPA 推荐示例
# {
#   "containerName": "app",
#   "target": {"cpu": "1500m", "memory": "512Mi"},
#   "uncappedTarget": {"cpu": "2000m", "memory": "768Mi"},
#   "lowerBound": {"cpu": "1000m", "memory": "384Mi"},
#   "upperBound": {"cpu": "4000m", "memory": "2Gi"}
# }
```

**诊断脚本：CPU Throttling 排查**

```bash
#!/bin/bash
# diagnose-cpu-throttle.sh
NAMESPACE=${1:-default}
POD_NAME=$2

if [ -z "$POD_NAME" ]; then
  echo "Usage: $0 <namespace> <pod-name>"
  exit 1
fi

echo "========== CPU LIMITS =========="
kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].resources}' | python -m json.tool

echo -e "\n========== ACTUAL CPU USAGE =========="
kubectl top pod "$POD_NAME" -n "$NAMESPACE" 2>/dev/null || echo "Metrics not available"

echo -e "\n========== NODE CPU ALLOCATION =========="
NODE=$(kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.nodeName}')
kubectl describe node "$NODE" | grep -A 10 "Allocated resources"

echo -e "\n========== CGROUP CPU STAT (SSH TO NODE) =========="
echo "Run on node $NODE:"
echo "POD_UID=\$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.metadata.uid}')"
echo "cat /sys/fs/cgroup/cpu/kubepods/besteffort/pod\$POD_UID/cpu.stat"

echo -e "\n========== THROTTLE RATE =========="
echo "If nr_throttled / nr_periods > 10%, CPU limit is too low"
```

#### 使用场景

- 延迟敏感型应用（API Gateway、实时推荐）
- 计算密集型任务（批处理、视频转码）
- 多语言混合部署导致 CPU 争抢
- 大促流量高峰时性能劣化

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| 盲目取消 CPU 限制 | 导致节点 CPU 争抢，影响其他 Pod | 使用 VPA 推荐合理值 |
| CFS 配额公平性问题 | 多线程应用在 CFS 限制下表现差 | 考虑使用 Guaranteed QoS 或 CPU Manager |
| 监控盲区 | 默认不采集 cgroup throttle 指标 | 配置 Prometheus 采集 `container_cpu_cfs_throttled_seconds_total` |
| 请求值设置过低 | 调度器过度超卖导致节点 CPU 压力 | `requests.cpu` 应基于 P99 使用量 |

### 14.4.2 内存泄漏

#### 解决的问题

应用内存持续增长，最终 OOM 重启，影响服务稳定性。

#### 核心原理

内存泄漏指应用分配的内存不再使用但未被 GC 回收（Java）或未释放（C/C++/Go）。在容器环境中，泄漏表现为：

1. 容器内存使用随时间线性增长
2. 频繁的 Full GC（Java）或 GC 压力增大（Go）
3. 最终达到 `limits.memory` 触发 OOMKill

#### 代码/配置实现

**监控内存趋势**

```bash
# 查看 Pod 内存使用趋势（需 Prometheus + Grafana）
# PromQL 查询
container_memory_working_set_bytes{namespace="<ns>", pod="<pod>"}

# 查看内存增长速率
rate(container_memory_working_set_bytes{namespace="<ns>", pod="<pod>"}[5m])

# 使用 kubectl 查看当前内存
kubectl top pod <pod-name> -n <namespace>
```

**Java 应用 Heap Dump 分析**

```bash
# 触发 Heap Dump
kubectl exec <pod-name> -n <namespace> -- jmap -dump:format=b,file=/tmp/heap.hprof 1

# 复制到本地
kubectl cp <namespace>/<pod-name>:/tmp/heap.hprof ./heap.hprof

# 使用 jhat 或 Eclipse MAT 分析
# jhat -port 7000 heap.hprof
# 浏览器打开 http://localhost:7000

# 查看 GC 情况
kubectl exec <pod-name> -n <namespace> -- jstat -gcutil 1 1000 5
# 输出示例：
# S0     S1     E      O      M     YGC     YGCT    FGC    FGCT    GCT
# 0.00   0.00   45.67  89.23  92.10  1200    15.234  50     12.345  27.579
# O 区 89.23% 且 FGC 频繁 => 内存泄漏
```

**Go 应用内存分析**

```bash
# 获取 Go 运行时内存统计
kubectl exec <pod-name> -n <namespace> -- wget -q -O- http://localhost:8080/debug/pprof/heap > heap.out

# 使用 go tool pprof 分析
go tool pprof -http=:8081 heap.out

# 查看 goroutine 数量（goroutine 泄漏也是常见原因）
kubectl exec <pod-name> -n <namespace> -- wget -q -O- http://localhost:8080/debug/pprof/goroutine > goroutine.out
go tool pprof -http=:8082 goroutine.out
```

**Node.js 应用内存分析**

```bash
# 生成 Heap Snapshot
kubectl exec <pod-name> -n <namespace> -- node -e "
  const v8 = require('v8');
  v8.writeHeapSnapshot('/tmp/heap.heapsnapshot');
"

# 复制到本地
kubectl cp <namespace>/<pod-name>:/tmp/heap.heapsnapshot ./heap.heapsnapshot
# 在 Chrome DevTools Memory 面板中加载分析
```

**诊断脚本：内存泄漏排查**

```bash
#!/bin/bash
# diagnose-memory-leak.sh
NAMESPACE=${1:-default}
POD_NAME=$2

if [ -z "$POD_NAME" ]; then
  echo "Usage: $0 <namespace> <pod-name>"
  exit 1
fi

echo "========== MEMORY USAGE OVER TIME =========="
echo "Run this every 30s to see trend:"
echo "kubectl top pod $POD_NAME -n $NAMESPACE"

echo -e "\n========== MEMORY LIMITS =========="
kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.containers[0].resources}' | python -m json.tool

echo -e "\n========== OOM HISTORY =========="
kubectl describe pod "$POD_NAME" -n "$NAMESPACE" | grep -E "(OOMKill|Exit Code: 137)"

echo -e "\n========== GC LOGS (JAVA) =========="
kubectl logs "$POD_NAME" -n "$NAMESPACE" --tail=100 | grep -E "(GC|Full GC|OutOfMemory)" || echo "No GC logs found"

echo -e "\n========== RECOMMENDED ACTIONS =========="
echo "1. Enable GC logging: -Xlog:gc*:file=/tmp/gc.log"
echo "2. Enable HeapDumpOnOutOfMemoryError"
echo "3. Set up Prometheus memory monitoring with alert"
echo "4. Use jmap/jstat/pprof for live analysis"
```

#### 使用场景

- 应用上线后内存持续增长
- 大促后内存不回落
- 频繁 OOMKill 和自动重启
- 连接池/线程池泄漏

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| Heap Dump 影响性能 | Dump 期间 JVM 暂停，大堆可能暂停数分钟 | 在低峰期操作，或使用 `-XX:+HeapDumpOnOutOfMemoryError` 自动触发 |
| 磁盘空间不足 | Heap Dump 文件可能很大（≈堆大小） | 确保容器有足够磁盘空间 |
| 生产环境安全 | pprof/jmap 可能暴露敏感信息 | 限制调试端口的网络访问 |
| 误判为泄漏 | 实际是正常缓存增长 | 分析 Object 引用链确认 |

### 14.4.3 慢查询与超时

#### 解决的问题

服务间调用延迟增加，频繁超时，影响用户体验。

#### 核心原理

慢查询和超时的根因通常分布在多个层面：

1. **连接池耗尽**：数据库/Redis 连接池被占满，新请求等待连接超时
2. **数据库慢查询**：SQL 未命中索引、数据量增长、锁竞争
3. **网络延迟**：跨可用区调用、DNS 解析慢、TCP 重传
4. **服务端瓶颈**：CPU Throttling、GC 暂停、线程阻塞

#### 代码/配置实现

**排查连接池**

```bash
# 查看数据库连接池指标（以 HikariCP 为例）
# 通过 Actuator 端点
kubectl exec <pod-name> -n <namespace> -- curl http://localhost:8080/actuator/metrics/hikaricp.connections.active
kubectl exec <pod-name> -n <namespace> -- curl http://localhost:8080/actuator/metrics/hikaricp.connections.pending
kubectl exec <pod-name> -n <namespace> -- curl http://localhost:8080/actuator/metrics/hikaricp.connections.timeout

# 如果 hikaricp.connections.timeout > 0，说明连接池耗尽
```

**排查数据库慢查询**

```bash
# 查看 TDSQL/MySQL 慢查询日志
# 腾讯云控制台：数据库 → 慢查询日志

# 在 Pod 中测试数据库连接延迟
kubectl exec <pod-name> -n <namespace> -- mysql -h <db-host> -u <user> -p<pass> -e "SHOW PROCESSLIST;"

# 查看当前运行的查询
kubectl exec <pod-name> -n <namespace> -- mysql -h <db-host> -u <user> -p<pass> -e "SELECT * FROM information_schema.PROCESSLIST WHERE COMMAND != 'Sleep';"

# 查看慢查询
kubectl exec <pod-name> -n <namespace> -- mysql -h <db-host> -u <user> -p<pass> -e "SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;"
```

**排查网络延迟**

```bash
# 测试到数据库的网络延迟
kubectl run -it --rm net-test --image=nicolaka/netshoot --restart=Never -- \
  ping -c 10 <db-host>

# 测试 TCP 连接时间
kubectl run -it --rm net-test --image=nicolaka/netshoot --restart=Never -- \
  tcptraceroute <db-host> <db-port>

# 查看 TCP 连接状态
kubectl exec <pod-name> -n <namespace> -- ss -s
kubectl exec <pod-name> -n <namespace> -- ss -tan | grep <db-ip>
```

**配置合理的超时和重试**

```yaml
# Spring Boot 配置示例
spring:
  datasource:
    hikari:
      connection-timeout: 5000      # 连接超时 5s
      maximum-pool-size: 20         # 最大连接数
      minimum-idle: 5               # 最小空闲连接
      idle-timeout: 300000          # 空闲超时 5min
      max-lifetime: 600000          # 最大存活时间 10min

# 服务间调用超时（Feign/OpenFeign）
feign:
  client:
    config:
      default:
        connectTimeout: 3000        # 连接超时 3s
        readTimeout: 10000          # 读取超时 10s

# 重试策略
resilience4j:
  retry:
    configs:
      default:
        maxAttempts: 3              # 最大重试次数
        waitDuration: 500ms         # 重试间隔
        retryExceptions:
          - org.springframework.dao.DeadlockLoserDataAccessException
          - java.net.ConnectException
```

**诊断脚本：慢查询与超时排查**

```bash
#!/bin/bash
# diagnose-slow-query.sh
NAMESPACE=${1:-default}
POD_NAME=$2

if [ -z "$POD_NAME" ]; then
  echo "Usage: $0 <namespace> <pod-name>"
  exit 1
fi

echo "========== POD RESOURCE USAGE =========="
kubectl top pod "$POD_NAME" -n "$NAMESPACE"

echo -e "\n========== CONNECTION POOL METRICS =========="
echo "Check Actuator endpoints:"
echo "  /actuator/metrics/hikaricp.connections.active"
echo "  /actuator/metrics/hikaricp.connections.pending"
echo "  /actuator/metrics/hikaricp.connections.timeout"

echo -e "\n========== NETWORK LATENCY =========="
echo "Run ping test to database/Redis:"
echo "kubectl run -it --rm net-test --image=nicolaka/netshoot -- ping -c 10 <db-host>"

echo -e "\n========== TCP CONNECTION STATE =========="
kubectl exec "$POD_NAME" -n "$NAMESPACE" -- ss -tan | head -20

echo -e "\n========== APPLICATION LOGS (TIMEOUT ERRORS) =========="
kubectl logs "$POD_NAME" -n "$NAMESPACE" --tail=50 | grep -iE "(timeout|timed out|Connection refused|Too many connections)" || echo "No timeout errors found"

echo -e "\n========== RECOMMENDED CHECKS =========="
echo "1. Check database slow query log"
echo "2. Check connection pool size"
echo "3. Check network latency between services"
echo "4. Check if CPU throttling is occurring"
echo "5. Check GC pause time"
```

#### 使用场景

- 大促期间接口响应时间飙升
- 数据库 CPU 使用率 100%
- 服务间调用频繁超时
- 数据库连接数打满

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| 重试风暴 | 客户端重试导致服务端负载翻倍 | 使用指数退避 + 断路器 |
| 连接池过大 | 过多连接压垮数据库 | 根据数据库 max_connections 合理设置 |
| 事务超时 | 长事务占用连接不释放 | 设置事务超时时间 `@Transactional(timeout=30)` |
| DNS 缓存 | 长连接 DNS 不刷新 | 配置合理的 DNS 缓存 TTL |

### 14.4.4 性能故障排查 Checklist

```
□ CPU Throttling 是否超过 10%？
□ 内存使用是否持续增长？
□ GC 频率和暂停时间是否正常？
□ 连接池是否有超时？
□ 数据库是否有慢查询？
□ 网络延迟是否在正常范围？
□ 是否有 TCP 重传？
□ 资源限制是否合理？
□ 是否需要 HPA 自动扩缩容？
```

---

## 14.5 发布故障

### 14.5.1 滚动更新卡住

#### 解决的问题

Deployment 滚动更新过程中新 Pod 无法就绪，更新卡住，旧 Pod 未被替换。

#### 核心原理

Deployment 滚动更新的核心机制：

```
Replicas: 5
maxSurge: 1        # 允许超出期望 Pod 数 1 个
maxUnavailable: 1  # 允许不可用 Pod 数 1 个
```

更新流程：Kubelet 创建新 Pod → 新 Pod 通过 Readiness Probe → Endpoint Controller 将新 Pod 加入 Service → 删除旧 Pod。任一环节失败则更新卡住。

#### 代码/配置实现

**排查滚动更新状态**

```bash
# 查看 Deployment 滚动更新状态
kubectl rollout status deployment/<deploy-name> -n <namespace>

# 输出示例
# Waiting for deployment "myapp" rollout to finish: 2 out of 5 new replicas have been updated...
# Waiting for deployment "myapp" rollout to finish: 1 old replicas are pending termination...

# 查看 ReplicaSet 状态
kubectl get rs -n <namespace> -l app=<app-name>

# 查看新旧 ReplicaSet 的 Pod 状态
kubectl get pods -n <namespace> -l app=<app-name>
```

**排查 Readiness Probe**

```yaml
# 常见的 Readiness Probe 配置问题
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5    # 过短：应用尚未就绪
  periodSeconds: 10
  failureThreshold: 3
  successThreshold: 1
  timeoutSeconds: 5
```

**排查 PDB（PodDisruptionBudget）**

```bash
# 查看 PDB 配置
kubectl get pdb -n <namespace>

# 查看 PDB 详情
kubectl describe pdb <pdb-name> -n <namespace>

# 输出示例
# Status:
#   Current Healthy:  2
#   Desired Healthy:  3
#   Disruptions Allowed:  0    # 不允许中断，导致滚动更新卡住
```

**排查 maxUnavailable 和 maxSurge**

```bash
# 查看 Deployment 的滚动更新策略
kubectl get deployment <deploy-name> -n <namespace> -o jsonpath='{.spec.strategy.rollingUpdate}'

# 输出示例
# {"maxSurge":"25%","maxUnavailable":"25%"}

# 对于 3 副本的应用，25% 意味着 maxUnavailable=1，maxSurge=1
# 如果 PDB 要求 minAvailable=3，则 maxUnavailable 实际为 0
```

**诊断脚本：滚动更新排查**

```bash
#!/bin/bash
# diagnose-rollout.sh
NAMESPACE=${1:-default}
DEPLOY_NAME=$2

if [ -z "$DEPLOY_NAME" ]; then
  echo "Usage: $0 <namespace> <deployment-name>"
  exit 1
fi

echo "========== ROLLOUT STATUS =========="
kubectl rollout status deployment/"$DEPLOY_NAME" -n "$NAMESPACE" --timeout=5s 2>&1 || true

echo -e "\n========== REPLICASETS =========="
kubectl get rs -n "$NAMESPACE" -l app="$DEPLOY_NAME" -o wide

echo -e "\n========== POD STATUS =========="
kubectl get pods -n "$NAMESPACE" -l app="$DEPLOY_NAME" -o wide

echo -e "\n========== NEW POD EVENTS =========="
NEW_RS=$(kubectl get rs -n "$NAMESPACE" -l app="$DEPLOY_NAME" -o jsonpath='{.items[0].metadata.name}')
kubectl describe rs "$NEW_RS" -n "$NAMESPACE" | grep -A 20 "Events:"

echo -e "\n========== PDB STATUS =========="
kubectl get pdb -n "$NAMESPACE" 2>/dev/null || echo "No PDB found"

echo -e "\n========== ROLLING UPDATE CONFIG =========="
kubectl get deployment "$DEPLOY_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.strategy}' | python -m json.tool

echo -e "\n========== READINESS PROBE =========="
kubectl get deployment "$DEPLOY_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].readinessProbe}' | python -m json.tool 2>/dev/null || echo "No readiness probe"
```

#### 使用场景

- 新版本发布后 Pod 无法就绪
- 更新进度卡在 "waiting for rollout to finish"
- 更新后旧 Pod 未被删除
- 发布窗口内更新超时

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| PDB 阻塞更新 | `minAvailable` 过高导致无法删除旧 Pod | 发布期间临时调整 PDB 或使用 `--force` |
| Readiness 探针过于严格 | 新 Pod 因瞬态问题无法通过探针 | 区分 Readiness 和 Liveness 探针的严格程度 |
| maxSurge 耗尽资源 | 新旧 Pod 同时运行导致资源不足 | 设置合理的 maxSurge（建议 25%） |
| 镜像拉取延迟 | 新镜像拉取慢导致更新超时 | 预热镜像或使用 ImagePullPolicy: Always |

### 14.5.2 回滚失败

#### 解决的问题

新版本发布出问题后需要回滚，但回滚操作失败或回滚后服务仍不可用。

#### 核心原理

Kubernetes 回滚本质上是将 Deployment 的 `spec.template` 恢复到历史版本。Kubelet 根据恢复的模板创建新 Pod。回滚失败的原因：

1. **Helm Revision 冲突**：Helm 管理的 Release 版本号混乱
2. **Schema 迁移不兼容**：数据库 Schema 已变更，旧版本代码不兼容新 Schema
3. **ConfigMap/Secret 版本不匹配**：回滚后的代码需要旧版本的配置
4. **资源不足**：回滚创建新 Pod 时集群资源不足

#### 代码/配置实现

**查看回滚历史**

```bash
# 查看 Deployment 的修订历史
kubectl rollout history deployment/<deploy-name> -n <namespace>

# 输出示例
# deployment.apps/myapp
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         <none>
# 3         <none>

# 查看特定修订版本的详细信息
kubectl rollout history deployment/<deploy-name> -n <namespace> --revision=2
```

**执行回滚**

```bash
# 回滚到上一个版本
kubectl rollout undo deployment/<deploy-name> -n <namespace>

# 回滚到指定版本
kubectl rollout undo deployment/<deploy-name> -n <namespace> --to-revision=2

# 查看回滚状态
kubectl rollout status deployment/<deploy-name> -n <namespace>
```

**Helm 回滚**

```bash
# 查看 Helm Release 历史
helm history <release-name> -n <namespace>

# 输出示例
# REVISION  UPDATED                   STATUS     CHART          DESCRIPTION
# 1         Mon Jan 15 10:00:00 2024  deployed   myapp-1.0.0   Install complete
# 2         Mon Jan 15 11:00:00 2024  deployed   myapp-1.1.0   Upgrade complete
# 3         Mon Jan 15 12:00:00 2024  failed     myapp-1.2.0   Upgrade failed

# Helm 回滚
helm rollback <release-name> <revision> -n <namespace>

# 回滚时指定参数
helm rollback <release-name> <revision> -n <namespace> \
  --wait \
  --timeout 5m \
  --recreate-pods
```

**处理 Schema 迁移不兼容**

```bash
# 回滚前检查数据库迁移状态
# 如果使用 Flyway/Liquibase，检查迁移记录
kubectl exec <pod-name> -n <namespace> -- \
  mysql -h <db-host> -u <user> -p<pass> -e \
  "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;"

# 如果新版本执行了不可逆的迁移（如删除列），回滚后需要手动修复
# 方案一：执行反向迁移脚本
# 方案二：从备份恢复数据库
# 方案三：修复新版本代码而非回滚
```

**诊断脚本：回滚失败排查**

```bash
#!/bin/bash
# diagnose-rollback.sh
NAMESPACE=${1:-default}
DEPLOY_NAME=$2

if [ -z "$DEPLOY_NAME" ]; then
  echo "Usage: $0 <namespace> <deployment-name>"
  exit 1
fi

echo "========== ROLLOUT HISTORY =========="
kubectl rollout history deployment/"$DEPLOY_NAME" -n "$NAMESPACE"

echo -e "\n========== HELM HISTORY =========="
helm list -n "$NAMESPACE" | grep "$DEPLOY_NAME" && helm history "$DEPLOY_NAME" -n "$NAMESPACE" 2>/dev/null || echo "Not a Helm release"

echo -e "\n========== CURRENT POD STATUS =========="
kubectl get pods -n "$NAMESPACE" -l app="$DEPLOY_NAME"

echo -e "\n========== RECENT EVENTS =========="
kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | tail -20

echo -e "\n========== DATABASE MIGRATION CHECK =========="
echo "Check flyway_schema_history or similar migration table"
echo "If irreversible migration was applied, rollback may require manual DB fix"

echo -e "\n========== CONFIGMAP/SECRET COMPATIBILITY =========="
echo "Verify that rolled-back code is compatible with current ConfigMaps and Secrets"
```

#### 使用场景

- 新版本发布后出现严重 Bug，需要立即回滚
- Helm 升级失败后回滚
- 数据库迁移导致回滚后应用无法启动
- 回滚后 ConfigMap 版本不匹配

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| 数据库迁移不可逆 | `DROP COLUMN` 等操作无法通过回滚恢复 | 所有迁移必须向前兼容，分多步执行 |
| Helm Revision 混乱 | 多次失败升级导致 Revision 号不连续 | 使用 `helm rollback --cleanup-on-fail` |
| 回滚后配置不匹配 | 新 ConfigMap 被旧代码使用 | 回滚 Deployment 时同时回滚 ConfigMap |
| 回滚触发新一轮更新 | 回滚本身也是一个新的 Revision | 回滚后确认状态稳定再继续操作 |

### 14.5.3 配置未生效

#### 解决的问题

修改 ConfigMap 或 Secret 后，应用未加载新配置，仍使用旧值。

#### 核心原理

Kubernetes 中配置更新的传播路径：

```
ConfigMap 更新 → Kubelet 检测到变化 → 更新 Pod 内挂载文件 → 应用检测文件变化 → 重新加载配置
```

配置未生效的常见原因：

1. **ConfigMap 更新延迟**：Kubelet 同步周期默认 60s
2. **应用未监听文件变化**：应用只在启动时加载配置
3. **缓存未失效**：应用内部缓存了旧配置
4. **环境变量方式注入**：环境变量在 Pod 启动后不会更新
5. **SubPath 挂载不更新**：使用 `subPath` 的 Volume 不会自动更新

#### 代码/配置实现

**检查 ConfigMap 更新**

```bash
# 查看 ConfigMap 当前内容
kubectl get configmap <config-name> -n <namespace> -o yaml

# 查看 Pod 中实际挂载的文件内容
kubectl exec <pod-name> -n <namespace> -- cat /etc/config/application.yaml

# 比较两者是否一致
```

**强制 Pod 重新加载配置**

```bash
# 方案一：滚动重启 Deployment
kubectl rollout restart deployment/<deploy-name> -n <namespace>

# 方案二：使用 Reloader 自动重启
# 安装 Reloader 后，在 Deployment 添加 annotation
kubectl annotate deployment/<deploy-name> -n <namespace> \
  configmap.reloader.stakater.com/reload=<config-name>

# 方案三：修改 ConfigMap 的 metadata 触发滚动更新
# 添加 annotation 使 Deployment 模板变化
kubectl patch deployment <deploy-name> -n <namespace> \
  -p '{"spec":{"template":{"metadata":{"annotations":{"config-updated":"'$(date +%s)'"}}}}}'
```

**配置热加载方案**

```yaml
# Spring Cloud Config 热加载
# 依赖 spring-cloud-starter-bus-kafka 或 spring-cloud-starter-bus-amqp
spring:
  cloud:
    bus:
      enabled: true
    config:
      discovery:
        enabled: true

# 触发配置刷新
# curl -X POST http://<pod-ip>:8080/actuator/busrefresh

# 使用 Sidecar 实现配置热加载
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
      - name: config-watcher
        image: ccr.ccs.tencentyun.com/tke/config-watcher:latest
        args:
        - --configmap=app-config
        - --command=curl -X POST http://localhost:8080/actuator/refresh
      - name: myapp
        image: myapp:latest
```

**诊断脚本：配置生效排查**

```bash
#!/bin/bash
# diagnose-config.sh
NAMESPACE=${1:-default}
POD_NAME=$2
CONFIG_PATH=${3:-/etc/config}

if [ -z "$POD_NAME" ]; then
  echo "Usage: $0 <namespace> <pod-name> [config-path]"
  exit 1
fi

echo "========== CONFIGMAP CONTENT =========="
# 获取 Pod 关联的 ConfigMap
CM_NAME=$(kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.volumes[?(@.configMap)].configMap.name}')
if [ -n "$CM_NAME" ]; then
  echo "ConfigMap: $CM_NAME"
  kubectl get configmap "$CM_NAME" -n "$NAMESPACE" -o yaml
else
  echo "No ConfigMap volume found"
fi

echo -e "\n========== POD MOUNTED FILES =========="
kubectl exec "$POD_NAME" -n "$NAMESPACE" -- ls -la "$CONFIG_PATH" 2>/dev/null || echo "Path $CONFIG_PATH not found"

echo -e "\n========== FILE CONTENT IN POD =========="
kubectl exec "$POD_NAME" -n "$NAMESPACE" -- find "$CONFIG_PATH" -type f -exec echo "--- {} ---" \; -exec cat {} \; 2>/dev/null

echo -e "\n========== ENVIRONMENT VARIABLES =========="
kubectl exec "$POD_NAME" -n "$NAMESPACE" -- env | grep -E "^APP_|^DB_|^REDIS_" 2>/dev/null || echo "No app env vars found"

echo -e "\n========== CONFIG UPDATE MECHANISM =========="
echo "ConfigMap updates are NOT automatically reflected in:"
echo "  - Environment variables (require pod restart)"
echo "  - subPath volume mounts (require pod restart)"
echo "ConfigMap updates ARE reflected in:"
echo "  - Volume mounts (after kubelet sync, ~60s delay)"
echo "  - But only if the app watches for file changes"
```

#### 使用场景

- 修改日志级别后未生效
- 更新数据库连接串后应用仍连旧地址
- 功能开关配置修改后未生效
- 多环境配置管理混乱

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| 环境变量不更新 | Pod 启动后环境变量不可变 | 使用 Volume 挂载方式注入配置 |
| subPath 不更新 | subPath 挂载的文件不会随 ConfigMap 更新 | 避免使用 subPath，或使用 Reloader 自动重启 |
| 部分 Pod 配置不一致 | 滚动更新期间新旧 Pod 使用不同配置 | 先更新 ConfigMap，再 rollout restart |
| 配置格式错误 | ConfigMap 内容格式错误导致应用崩溃 | 使用 `kubectl create configmap --dry-run=client` 验证 |

### 14.5.4 发布故障排查 Checklist

```
□ rollout status 是否显示卡住？
□ 新 Pod 是否通过 Readiness Probe？
□ PDB 是否阻塞了 Pod 删除？
□ maxUnavailable 和 maxSurge 是否合理？
□ 回滚历史是否完整？
□ 数据库迁移是否可逆？
□ ConfigMap 内容是否已更新？
□ 应用是否支持配置热加载？
□ 是否需要 rollout restart 强制刷新？
```

---

## 14.6 日志与监控故障

### 14.6.1 日志采集中断

#### 解决的问题

日志采集 Agent（LogListener）停止工作，日志数据丢失，影响问题排查和审计。

#### 核心原理

TKE 日志采集架构：`Pod 日志 → LogListener (DaemonSet) → CLS (日志服务)`。采集中断的原因：

1. **LogListener 崩溃**：LogListener Pod 异常退出
2. **磁盘空间满**：节点磁盘使用率超过 85%，LogListener 无法写入缓冲
3. **采集路径变更**：日志文件路径变化后未更新采集配置
4. **日志轮转冲突**：应用日志轮转与 LogListener 采集不同步
5. **CLS 服务端故障**：CLS 写入限流或服务不可用

#### 代码/配置实现

**排查 LogListener 状态**

```bash
# 查看 LogListener Pod 状态
kubectl get pods -n kube-system -l app=tke-log-agent

# 查看 LogListener 日志
kubectl logs -n kube-system -l app=tke-log-agent --tail=50

# 查看 LogListener 资源使用
kubectl top pod -n kube-system -l app=tke-log-agent
```

**检查采集配置**

```bash
# 查看日志采集规则（TKE 控制台）
# 集群 → 日志采集 → 采集规则

# 通过 API 查看采集规则
tke log list-log-collectors --cluster-id <cluster-id>

# 检查采集路径是否正确
# 标准路径示例
# /var/log/containers/*.log          # 容器标准输出
# /data/app/logs/*.log               # 应用日志文件
# /var/log/nginx/access.log          # Nginx 日志
```

**检查磁盘空间**

```bash
# 查看节点磁盘使用率
kubectl describe node <node-name> | grep -E "(DiskPressure|Conditions)"

# SSH 到节点查看磁盘
df -h
# 重点关注 /var/lib/docker (容器数据) 和 /var/log (日志)

# 查看 LogListener 缓冲目录
# 默认缓冲路径：/var/log/tke-log-agent/buffer
du -sh /var/log/tke-log-agent/
```

**诊断脚本：日志采集排查**

```bash
#!/bin/bash
# diagnose-log-collection.sh
NAMESPACE=${1:-kube-system}

echo "========== LOGLISTENER POD STATUS =========="
kubectl get pods -n "$NAMESPACE" -l app=tke-log-agent -o wide

echo -e "\n========== LOGLISTENER LOGS (LAST 30 LINES) =========="
kubectl logs -n "$NAMESPACE" -l app=tke-log-agent --tail=30 2>/dev/null || echo "No logs available"

echo -e "\n========== NODE DISK USAGE =========="
echo "Check DiskPressure condition on nodes:"
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.conditions[?(@.type=="DiskPressure")].status}{"\n"}{end}'

echo -e "\n========== COLLECTION RULES =========="
echo "Check collection rules in TKE console:"
echo "https://console.cloud.tencent.com/tke2/cluster/<cluster-id>/log"

echo -e "\n========== LOG FILE EXISTENCE =========="
echo "Verify log files exist on nodes:"
echo "SSH to node and check: ls -la /var/log/containers/ | head -20"

echo -e "\n========== CLS SERVICE STATUS =========="
echo "Check CLS service health in Tencent Cloud console"
echo "https://console.cloud.tencent.com/cls"
```

#### 使用场景

- 日志搜索不到新数据
- 日志延迟严重
- 磁盘告警后日志采集中断
- 应用日志路径变更后采集停止

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| 磁盘满导致日志丢失 | 节点磁盘满时 LogListener 无法缓冲 | 配置磁盘告警，设置日志轮转策略 |
| 日志轮转丢失 | 日志轮转过快 LogListener 来不及采集 | 调整日志轮转大小和时间（建议 100MB/10min） |
| 采集路径错误 | 路径写错或通配符不匹配 | 使用 `kubectl exec` 验证路径是否存在 |
| CLS 写入限流 | 单日志主题写入超过 5MB/s | 拆分日志主题或调整采集频率 |

### 14.6.2 监控指标缺失

#### 解决的问题

Grafana 面板数据缺失，Prometheus Target 显示 Down，无法监控集群和应用状态。

#### 核心原理

TKE 监控架构：`Metrics Endpoint → Prometheus (采集) → Grafana (展示)`。指标缺失的原因：

1. **Prometheus Target Down**：采集目标不可达
2. **Metrics Endpoint 不可用**：应用未暴露 `/metrics` 端点
3. **ServiceMonitor 配置错误**：Prometheus Operator 的采集规则不匹配
4. **Prometheus 自身故障**：Prometheus Pod OOM、磁盘满
5. **网络隔离**：Prometheus 无法访问目标 Pod

#### 代码/配置实现

**排查 Prometheus Target 状态**

```bash
# 查看 Prometheus Target 状态（通过 Prometheus UI）
# 端口转发到 Prometheus
kubectl port-forward -n kube-system prometheus-0 9090:9090

# 浏览器访问 http://localhost:9090/targets
# 查看 State 为 Down 的 Target

# 通过 API 查询
kubectl exec -n kube-system prometheus-0 -- wget -q -O- http://localhost:9090/api/v1/targets | python -c "
import json,sys
data = json.load(sys.stdin)
for t in data['data']['activeTargets']:
    if t['health'] == 'down':
        print(f\"DOWN: {t['labels']['job']} - {t['labels']['instance']} - {t['lastError']}\")
"
```

**排查 ServiceMonitor**

```bash
# 查看 ServiceMonitor 配置
kubectl get servicemonitor -n <namespace>

# 查看 ServiceMonitor 详情
kubectl describe servicemonitor <monitor-name> -n <namespace>

# 检查 ServiceMonitor 的 Selector 是否匹配 Service
kubectl get svc -n <namespace> --show-labels

# 检查 Service 的端口命名是否符合规范
kubectl get svc <svc-name> -n <namespace> -o jsonpath='{.spec.ports}'
# Prometheus 要求端口名以 "http" 或 "metrics" 开头
```

**排查 Metrics Endpoint**

```bash
# 直接测试 Metrics 端点
kubectl run -it --rm metrics-test --image=nicolaka/netshoot --restart=Never -- \
  curl -s http://<pod-ip>:<port>/metrics | head -20

# 检查应用是否启用了 Metrics
# Spring Boot Actuator
kubectl exec <pod-name> -n <namespace> -- curl http://localhost:8080/actuator/prometheus

# 自定义 Metrics
kubectl exec <pod-name> -n <namespace> -- curl http://localhost:8080/metrics
```

**配置 Prometheus 采集**

```yaml
# Prometheus Operator ServiceMonitor 配置
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp-monitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: myapp
  endpoints:
  - port: metrics          # 端口名必须与 Service 定义一致
    interval: 15s
    path: /metrics
    scheme: http
  namespaceSelector:
    matchNames:
    - default
```

**诊断脚本：监控指标排查**

```bash
#!/bin/bash
# diagnose-metrics.sh
NAMESPACE=${1:-default}
APP_LABEL=${2:-app}

echo "========== PROMETHEUS TARGET STATUS =========="
kubectl port-forward -n kube-system prometheus-0 9090:9090 &
sleep 2
curl -s http://localhost:9090/api/v1/targets | python -c "
import json,sys
data = json.load(sys.stdin)
up = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'up')
down = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'down')
print(f'Up: {up}, Down: {down}')
for t in data['data']['activeTargets']:
    if t['health'] == 'down':
        print(f\"  DOWN: {t['labels']['job']}/{t['labels']['instance']} - {t['lastError']}\")
"
kill %1 2>/dev/null

echo -e "\n========== SERVICEMONITORS =========="
kubectl get servicemonitor -A

echo -e "\n========== METRICS ENDPOINT TEST =========="
echo "Testing metrics endpoint on pods with label $APP_LABEL:"
PODS=$(kubectl get pods -n "$NAMESPACE" -l "$APP_LABEL" -o jsonpath='{.items[*].status.podIP}')
for IP in $PODS; do
  echo "Testing $IP:8080/metrics..."
  kubectl run -it --rm test-$RANDOM --image=nicolaka/netshoot --restart=Never -- \
    curl -s -o /dev/null -w "%{http_code}" "http://$IP:8080/metrics" --connect-timeout 3 2>/dev/null || echo "  Failed"
done

echo -e "\n========== PROMETHEUS POD STATUS =========="
kubectl get pods -n kube-system -l app=prometheus

echo -e "\n========== RECOMMENDED CHECKS =========="
echo "1. Check Prometheus targets in UI (port-forward 9090)"
echo "2. Verify ServiceMonitor selector matches Service labels"
echo "3. Verify Service port name starts with 'http' or 'metrics'"
echo "4. Test metrics endpoint directly from a debug pod"
echo "5. Check Prometheus logs for scrape errors"
```

#### 使用场景

- Grafana 面板显示 "No data"
- 新服务上线后监控指标缺失
- 集群节点指标丢失
- 自定义 Metrics 未采集

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| Prometheus OOM | 采集目标过多导致内存不足 | 配置合理的采集间隔和保留时间 |
| 指标基数爆炸 | 高基数 Label（如 user_id）导致存储膨胀 | 避免高基数 Label，使用记录规则聚合 |
| 端口命名不规范 | Service 端口名不以 `http` 开头导致不被发现 | 端口名使用 `http-metrics` 或 `metrics` |
| 网络策略拦截 | Prometheus 无法跨命名空间采集 | 配置 NetworkPolicy 放通 Prometheus |

### 14.6.3 告警未触发

#### 解决的问题

业务指标异常但告警未触发，导致故障发现延迟。

#### 核心原理

告警链路：`Prometheus 采集 → 告警规则评估 → AlertManager → 通知渠道`。告警未触发的根因：

1. **告警规则配置错误**：PromQL 语法错误、阈值不合理
2. **Silence 规则**：告警被静默规则抑制
3. **AlertManager 配置错误**：通知渠道未正确配置
4. **指标数据缺失**：Prometheus 未采集到指标
5. **告警状态误解**：告警处于 Pending 状态（未满足 `for` 持续时间）

#### 代码/配置实现

**排查告警规则**

```bash
# 查看 Prometheus 告警规则
kubectl port-forward -n kube-system prometheus-0 9090:9090 &
# 浏览器访问 http://localhost:9090/alerts

# 通过 API 查看告警规则状态
curl -s http://localhost:9090/api/v1/rules | python -c "
import json,sys
data = json.load(sys.stdin)
for group in data['data']['groups']:
    for rule in group['rules']:
        if rule['type'] == 'alerting':
            print(f\"{rule['name']}: state={rule['state']}, health={rule['health']}\")
            if rule['health'] == 'err':
                print(f\"  Error: {rule.get('lastError', 'N/A')}\")
"
```

**排查 AlertManager**

```bash
# 查看 AlertManager 状态
kubectl port-forward -n kube-system alertmanager-0 9093:9093 &
# 浏览器访问 http://localhost:9093

# 查看 Silences
curl -s http://localhost:9093/api/v2/silences | python -c "
import json,sys
data = json.load(sys.stdin)
for s in data:
    if s['status']['state'] == 'active':
        print(f\"Active silence: {s['id']} - {s['comment']}\")
        print(f\"  Matchers: {s['matchers']}\")
"

# 查看 AlertManager 配置
kubectl describe configmap alertmanager -n kube-system
```

**测试告警规则**

```bash
# 手动触发告警测试
# 创建一个临时的高指标 Pod
kubectl run -it --rm stress-test --image=progrium/stress --restart=Never -- \
  --cpu 4 --timeout 60s

# 查看告警是否触发
curl -s http://localhost:9090/api/v1/alerts | python -c "
import json,sys
data = json.load(sys.stdin)
for a in data['data']['alerts']:
    print(f\"{a['labels']['alertname']}: {a['state']} - {a['annotations']['summary']}\")
"

kill %1 %2 2>/dev/null
```

**诊断脚本：告警排查**

```bash
#!/bin/bash
# diagnose-alert.sh

echo "========== PROMETHEUS ALERTS =========="
kubectl port-forward -n kube-system prometheus-0 9090:9090 &
PROM_PID=$!
sleep 2

curl -s http://localhost:9090/api/v1/rules | python -c "
import json,sys
data = json.load(sys.stdin)
for group in data['data']['groups']:
    for rule in group['rules']:
        if rule['type'] == 'alerting':
            print(f\"{rule['name']}: state={rule['state']}, health={rule['health']}\")
            if rule['health'] == 'err':
                print(f\"  Error: {rule.get('lastError', 'N/A')}\")
"

echo -e "\n========== ACTIVE ALERTS =========="
curl -s http://localhost:9090/api/v1/alerts | python -c "
import json,sys
data = json.load(sys.stdin)
alerts = data['data']['alerts']
print(f'Total active alerts: {len(alerts)}')
for a in alerts:
    print(f\"  {a['labels'].get('alertname','N/A')}: {a['state']} - {a['labels'].get('severity','N/A')}\")
"

kill $PROM_PID 2>/dev/null

echo -e "\n========== ALERTMANAGER SILENCES =========="
kubectl port-forward -n kube-system alertmanager-0 9093:9093 &
AM_PID=$!
sleep 2
curl -s http://localhost:9093/api/v2/silences | python -c "
import json,sys
data = json.load(sys.stdin)
active = [s for s in data if s['status']['state'] == 'active']
print(f'Active silences: {len(active)}')
for s in active:
    print(f\"  {s['id']}: {s['comment']} - matchers: {s['matchers']}\")
"
kill $AM_PID 2>/dev/null

echo -e "\n========== RECOMMENDED CHECKS =========="
echo "1. Check if alert rule PromQL is correct (test in Grafana Explore)"
echo "2. Check if 'for' duration is met (alert may be Pending)"
echo "3. Check AlertManager silences"
echo "4. Check notification channel configuration"
echo "5. Check if metric data exists for the alert condition"
```

#### 使用场景

- 服务宕机但未收到告警
- 告警规则修改后不再触发
- 告警通知渠道失效
- 告警被意外静默

#### 潜在风险与注意事项

| 风险 | 说明 | 建议 |
|------|------|------|
| for 持续时间过长 | 告警需要持续 N 分钟才触发，延迟发现 | 关键告警设置 `for: 1m`，非关键设置 `for: 5m` |
| Silence 忘记取消 | 维护窗口后 Silence 未自动过期 | 设置 Silence 的到期时间 |
| 通知渠道限流 | 短信/邮件通道有发送频率限制 | 配置 AlertManager 的 `repeat_interval` |
| 告警风暴 | 大量告警同时触发导致通知淹没 | 使用告警分组和抑制规则 |

### 14.6.4 日志与监控故障排查 Checklist

```
□ LogListener Pod 是否正常运行？
□ 节点磁盘使用率是否超过 85%？
□ 日志采集路径是否正确？
□ Prometheus Target 是否全部 Up？
□ ServiceMonitor 的 Selector 是否匹配 Service？
□ Metrics 端点是否可访问？
□ 告警规则 PromQL 是否正确？
□ 告警是否处于 Pending 状态？
□ AlertManager 是否有活跃的 Silence？
□ 通知渠道配置是否正确？
```

---

## 14.7 综合故障排查方法论

### 14.7.1 故障排查黄金流程

面对 TKE 集群故障，遵循以下黄金流程可以避免遗漏和误判：

```
1. 确认故障范围
   ├── 影响哪些服务？
   ├── 影响哪些用户？
   ├── 何时开始？
   └── 是否持续？

2. 收集现场信息
   ├── kubectl get events --all-namespaces
   ├── kubectl describe pod/node/deployment
   ├── 查看监控面板（Grafana）
   └── 查看日志（CLS / kubectl logs）

3. 形成假设
   ├── 基于 Events 和日志的根因推测
   ├── 排除法：网络？资源？代码？配置？
   └── 优先级排序：影响最大的假设优先验证

4. 验证假设
   ├── 执行诊断命令
   ├── 创建临时调试 Pod
   └── 对比正常和异常 Pod 的差异

5. 制定恢复方案
   ├── 止血：回滚 / 扩容 / 重启
   ├── 根治：修复代码 / 调整配置
   └── 验证：确认恢复后持续观察

6. 复盘总结
   ├── 根因分析文档
   ├── 告警规则补充
   ├── 自动化恢复脚本
   └── 故障演练
```

### 14.7.2 常用诊断命令速查

```bash
# ========== Pod 诊断 ==========
kubectl describe pod <pod> -n <ns>          # Pod 完整信息 + Events
kubectl logs <pod> -n <ns> --previous       # 崩溃前日志
kubectl get events -n <ns> --sort-by='.lastTimestamp'  # 按时间排序事件

# ========== 节点诊断 ==========
kubectl describe node <node>                 # 节点资源 + 状态
kubectl top node                             # 节点资源使用
kubectl get nodes -o wide                    # 节点 IP 和状态

# ========== 网络诊断 ==========
kubectl get endpoints <svc> -n <ns>         # Service 后端
kubectl run -it --rm debug --image=nicolaka/netshoot  # 调试 Pod
kubectl get svc --all-namespaces             # 所有 Service

# ========== 资源诊断 ==========
kubectl top pod -n <ns>                      # Pod 资源使用
kubectl describe quota -n <ns>               # 资源配额
kubectl get pod -n <ns> -o wide              # Pod 所在节点

# ========== 发布诊断 ==========
kubectl rollout status deploy/<name> -n <ns> # 滚动更新状态
kubectl rollout history deploy/<name> -n <ns> # 修订历史
kubectl get rs -n <ns>                       # ReplicaSet 状态

# ========== 集群诊断 ==========
kubectl cluster-info                         # 集群信息
kubectl get componentstatuses                # 控制面组件状态
kubectl get nodes                            # 节点状态
```

### 14.7.3 故障场景速查表

| 现象 | 最可能原因 | 优先排查命令 |
|------|-----------|-------------|
| Pod CrashLoopBackOff | 应用异常或探针失败 | `kubectl logs --previous` |
| Pod ImagePullBackOff | 镜像不存在或认证失败 | `kubectl describe pod` |
| Pod OOMKill | 内存限制过低 | `kubectl top pod` |
| Service 不可达 | Endpoint 为空 | `kubectl get endpoints` |
| DNS 解析失败 | CoreDNS 异常 | `kubectl get pod -n kube-system -l k8s-app=kube-dns` |
| 滚动更新卡住 | Readiness 探针失败 | `kubectl rollout status` |
| 配置未生效 | ConfigMap 未更新 | `kubectl exec cat /etc/config/...` |
| 日志采集中断 | LogListener 异常 | `kubectl get pod -n kube-system -l app=tke-log-agent` |
| 监控指标缺失 | ServiceMonitor 不匹配 | `kubectl get servicemonitor` |
| 告警未触发 | 告警规则错误 | `kubectl port-forward prometheus 9090` |

---

## 14.8 本章小结

TKE 故障排查是一项系统工程，涉及容器运行时、Kubernetes 编排、网络、存储、监控等多个技术栈。本章从 Pod 启动故障、网络故障、性能故障、发布故障、日志与监控故障五个维度，系统梳理了 TKE 生产环境中最高频的故障场景及其排查方法。

核心要点：

1. **Pod 启动故障**是排查的起点——`kubectl describe pod` 的 Events 段包含了 80% 的根因信息，`kubectl logs --previous` 是查看崩溃前日志的关键命令。

2. **网络故障**的排查遵循链路追踪法：从 Service → Endpoint → kube-proxy → Pod，逐层验证。DNS 问题优先检查 CoreDNS Pod 状态和 Pod 的 `/etc/resolv.conf`。

3. **性能故障**需要区分 CPU Throttling、内存泄漏和慢查询三类场景。监控数据（`kubectl top`、Prometheus）是定位性能瓶颈的基础。

4. **发布故障**的核心是滚动更新策略、PDB 和 Readiness Probe 的协同。回滚前务必检查数据库迁移的兼容性。

5. **日志与监控故障**的排查从 Agent 状态开始，逐层检查采集链路和告警链路。告警未触发时优先检查 PromQL 和 Silence 规则。

建议团队将本章的诊断脚本纳入运维工具库，并在故障演练中定期验证。同时，建立故障复盘机制，将每次故障的根因和修复方案沉淀为知识库，持续提升集群的稳定性和可观测性。
