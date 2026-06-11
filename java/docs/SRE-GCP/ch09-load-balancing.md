# 第 9 章 全局负载均衡

## 9.1 为什么负载均衡配置很重要？

### 一个故事：健康检查配置不当的后果

某团队配置了 Cloud Load Balancing，但健康检查的阈值设置得过于宽松——`unhealthy-threshold` 设置为 10 次，`check-interval` 设置为 30 秒。

一天，后端服务因为代码问题开始返回 500 错误。但由于健康检查需要 10 次连续失败（5 分钟）才会将后端标记为不健康，在这 5 分钟内，负载均衡器继续将流量发送到已经出问题的后端。

用户收到了 5 分钟的 502 错误，团队才意识到问题。

**教训：** 健康检查的配置直接影响故障发现和恢复的速度。

### Cloud Load Balancing 的独特优势

GCP 的 Cloud Load Balancing 是一个**分布式的、软件定义的**负载均衡服务。与传统硬件负载均衡器不同，它不需要预先配置容量，也不存在单点故障。

**关键特性：**

- **全局性**：一个 IP 地址可以承载全球多个 Region 的后端
- **软件定义**：不需要管理物理设备
- **自动扩缩容**：自动适应流量变化
- **集成 CDN**：与 Cloud CDN 无缝集成

---

## 9.2 负载均衡器类型

### 外部 HTTP(S) 负载均衡器

面向互联网的 Web 流量，支持 HTTP/HTTPS、内容路由、SSL 卸载等功能。

```bash
# 创建全局静态 IP
gcloud compute addresses create web-lb-ip \
    --global

# 创建 SSL 证书
gcloud compute ssl-certificates create web-cert \
    --domains example.com \
    --global

# 创建后端服务
gcloud compute backend-services create web-backend \
    --protocol HTTP \
    --port-name http \
    --health-checks web-health-check \
    --global

# 添加后端（后端可以跨 Region）
gcloud compute backend-services add-backend web-backend \
    --instance-group web-mig-us \
    --instance-group-region us-central1 \
    --balancing-mode UTILIZATION \
    --max-utilization 0.8 \
    --global

gcloud compute backend-services add-backend web-backend \
    --instance-group web-mig-eu \
    --instance-group-region europe-west1 \
    --balancing-mode UTILIZATION \
    --max-utilization 0.8 \
    --global

# 创建 URL 映射
gcloud compute url-maps create web-url-map \
    --default-service web-backend

# 创建目标 HTTP 代理
gcloud compute target-http-proxies create web-proxy \
    --url-map web-url-map

# 创建转发规则
gcloud compute forwarding-rules create web-forwarding-rule \
    --address web-lb-ip \
    --global \
    --target-http-proxy web-proxy \
    --ports 80
```

### 外部 TCP/UDP 网络负载均衡器

面向互联网的非 HTTP 流量，如游戏服务、自定义协议的应用。

```bash
# 创建 TCP 负载均衡器
gcloud compute backend-services create tcp-backend \
    --protocol TCP \
    --health-checks tcp-health-check \
    --global

gcloud compute forwarding-rules create tcp-forwarding-rule \
    --address tcp-lb-ip \
    --global \
    --target-tcp-proxy tcp-proxy \
    --ports 443
```

### 内部负载均衡器

用于 VPC 内部的流量分发，不面向互联网。

```bash
# 创建内部负载均衡器
gcloud compute backend-services create internal-backend \
    --load-balancing-scheme INTERNAL \
    --protocol TCP \
    --region us-central1 \
    --health-checks internal-health-check

gcloud compute forwarding-rules create internal-forwarding-rule \
    --load-balancing-scheme INTERNAL \
    --region us-central1 \
    --network prod-vpc \
    --subnet prod-subnet \
    --address 10.0.1.100 \
    --backend-service internal-backend \
    --ports 8080
```

### 负载均衡器类型选择

| 类型 | 面向 | 协议 | 适用场景 |
|------|------|------|---------|
| 外部 HTTP(S) | 互联网 | HTTP/HTTPS | Web 服务、API |
| 外部 TCP/UDP | 互联网 | TCP/UDP | 游戏、自定义协议 |
| 内部 | VPC 内部 | TCP/UDP | 微服务间通信 |
| SSL 代理 | 互联网 | SSL/TLS | SSL 卸载 |
| 内部 HTTP(S) | VPC 内部 | HTTP/HTTPS | 内部 Web 服务 |

---

## 9.3 健康检查配置

### 健康检查的关键参数

```bash
# 创建 HTTP 健康检查
gcloud compute health-checks create http web-health-check \
    --request-path /healthz \
    --port 8080 \
    --check-interval 10 \
    --timeout 5 \
    --unhealthy-threshold 3 \
    --healthy-threshold 2
```

| 参数 | 说明 | 建议值 | 影响 |
|------|------|-------|------|
| `check-interval` | 检查间隔 | 5-15 秒 | 间隔越短，发现故障越快 |
| `timeout` | 超时时间 | 3-5 秒 | 超时越短，检测越敏感 |
| `unhealthy-threshold` | 不健康阈值 | 2-3 次 | 阈值越低，故障切换越快 |
| `healthy-threshold` | 健康阈值 | 1-2 次 | 阈值越低，恢复越快 |

### 健康检查路径的设计

健康检查的路径（`--request-path`）很关键。一个好的健康检查路径应该：

**✅ 好的做法：**

```python
# /healthz 端点示例
@app.route('/healthz')
def health_check():
    # 检查应用是否正常运行
    # 但不检查依赖服务（避免级联故障）
    return {"status": "ok"}, 200
```

**❌ 不好的做法：**

```python
# 不好的健康检查：检查了所有依赖
@app.route('/healthz')
def health_check():
    # 检查数据库
    db_status = check_database()
    # 检查缓存
    cache_status = check_redis()
    # 检查外部 API
    api_status = check_external_api()
    
    # 如果任何一个依赖不可用，返回不健康
    if not all([db_status, cache_status, api_status]):
        return {"status": "unhealthy"}, 500
    
    return {"status": "ok"}, 200
```

**为什么？** 如果数据库短暂不可用，健康检查会失败，负载均衡器会把整个后端踢出流量池。但实际上，你的应用可能可以处理数据库不可用的情况（比如使用缓存）。健康检查失败导致整个服务不可用，反而扩大了故障影响。

**健康检查路径设计原则：**

| 检查内容 | 建议 | 原因 |
|---------|------|------|
| 应用进程是否运行 | ✅ 必须检查 | 进程挂了肯定不健康 |
| 依赖服务是否可用 | ❌ 不要检查 | 避免级联故障 |
| 响应时间是否正常 | ⚠️ 谨慎 | 可能误判 |
| 磁盘空间是否充足 | ❌ 不要检查 | 应该由监控处理 |

---

## 9.4 区域故障切换

### 多区域部署的故障切换流程

```
正常状态：
用户 → 全局负载均衡器 → us-central1（主） + europe-west1（备）
                        流量 70%          流量 30%

us-central1 故障时：
用户 → 全局负载均衡器 → us-central1（不健康） + europe-west1（健康）
                        流量 0%              流量 100%

us-central1 恢复后：
用户 → 全局负载均衡器 → us-central1（健康） + europe-west1（健康）
                        流量 70%          流量 30%
```

### 故障切换配置

```bash
# 创建跨 Region 的后端服务
gcloud compute backend-services create global-web-backend \
    --protocol HTTP \
    --port-name http \
    --health-checks web-health-check \
    --enable-cdn \
    --global

# 添加 us-central1 的后端
gcloud compute backend-services add-backend global-web-backend \
    --instance-group web-mig-us-central1 \
    --instance-group-region us-central1 \
    --balancing-mode UTILIZATION \
    --max-utilization 0.8 \
    --capacity-scaler 1.0 \
    --global

# 添加 europe-west1 的后端
gcloud compute backend-services add-backend global-web-backend \
    --instance-group web-mig-europe-west1 \
    --instance-group-region europe-west1 \
    --balancing-mode UTILIZATION \
    --max-utilization 0.8 \
    --capacity-scaler 0.3 \  # 容量缩放因子，控制流量比例
    --global
```

### 故障切换时间线

```
t=0s:   us-central1 的一个 Zone 发生网络故障
t=10s:  负载均衡器健康检查发现该 Zone 的后端不健康
t=20s:  负载均衡器停止向该 Zone 发送新请求（2 次检查失败）
t=30s:  流量被重新路由到 us-central1 的其他 Zone 和 europe-west1
t=40s:  用户感知不到任何变化
```

---

## 9.5 一个场景：502/503 错误排查

### 症状

用户访问服务时收到 HTTP 502 Bad Gateway 或 503 Service Unavailable 错误。

### 排查决策树

```
收到 502/503 错误
│
├─ 检查 GCP Status Dashboard
│  ├─ GCP 自身有问题？→ 等待官方修复
│  └─ GCP 正常 → 继续
│
├─ 检查后端服务的健康状态
│  ├─ 健康检查通过？→ 继续
│  └─ 健康检查失败？→ 检查后端服务日志
│
├─ 检查健康检查配置
│  ├─ 超时时间太短？→ 调整超时时间
│  ├─ 检查路径错误？→ 修正检查路径
│  └─ 配置正常 → 继续
│
├─ 检查后端实例组
│  ├─ 实例数达到上限？→ 调整上限
│  ├─ 实例资源不足？→ 检查 CPU/内存
│  └─ 实例正常 → 继续
│
├─ 检查防火墙规则
│  ├─ 健康检查源 IP 被阻止？→ 放行
│  └─ 防火墙正常 → 继续
│
└─ 检查后端应用日志
   ├─ 应用崩溃？→ 修复代码
   ├─ 数据库连接失败？→ 检查数据库
   └─ 其他错误 → 根据日志排查
```

### 排查命令

```bash
# 1. 检查负载均衡器健康状态
gcloud compute backend-services get-health global-web-backend \
    --global

# 2. 检查后端实例组状态
gcloud compute instance-groups managed list-instances web-mig-us-central1 \
    --region us-central1

# 3. 检查防火墙规则
gcloud compute firewall-rules list \
    --filter="network=prod-vpc"

# 4. 查看负载均衡器日志
gcloud logging read "resource.type=http_load_balancer AND \
    httpRequest.status>=502" \
    --limit 50 \
    --format json

# 5. 直接访问后端实例测试
gcloud compute ssh web-server-001 --zone us-central1-a
curl http://localhost:8080/healthz
```

### 常见原因与应对

| 错误码 | 常见原因 | 应对措施 |
|-------|---------|---------|
| 502 | 后端服务响应超时 | 检查后端日志，增加超时时间 |
| 502 | 后端服务崩溃 | 检查后端日志，修复代码 |
| 503 | 后端实例组达到上限 | 调整最大实例数 |
| 503 | 后端资源不足 | 增加实例规格或数量 |
| 502 | 健康检查配置错误 | 修正健康检查路径或参数 |
| 502 | 防火墙阻止健康检查 | 放行健康检查源 IP |

---

## 9.6 Cloud CDN 的使用

### Cloud CDN 的工作原理

Cloud CDN 利用 Google 的全球边缘节点来缓存你的内容，让用户可以就近获取数据。

```
用户（东京） → 东京 Edge 节点（缓存命中） → 返回内容
用户（东京） → 东京 Edge 节点（缓存未命中） → us-central1 后端 → 返回内容并缓存
```

### 启用 Cloud CDN

```bash
# 创建带 CDN 的后端服务
gcloud compute backend-services create cdn-backend \
    --protocol HTTP \
    --port-name http \
    --health-checks web-health-check \
    --enable-cdn \
    --cache-mode USE_ORIGIN_HEADERS \
    --global

# 配置缓存策略
gcloud compute backend-services update cdn-backend \
    --global \
    --cache-mode FORCE_CACHE_ALL \
    --client-ttl 3600 \
    --default-ttl 3600 \
    --max-ttl 86400
```

### 缓存策略配置

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| USE_ORIGIN_HEADERS | 遵循后端的 Cache-Control 头 | 需要精细控制缓存 |
| FORCE_CACHE_ALL | 强制缓存所有内容 | 静态资源 |
| BYPASS_CACHE | 绕过缓存 | 动态内容 |

### CDN 适用场景

| 场景 | 推荐使用 CDN？ | 原因 |
|------|---------------|------|
| 静态图片、CSS、JS | ✅ 强烈推荐 | 缓存命中率高，大幅降低后端负载 |
| 视频流 | ✅ 推荐 | 边缘节点就近分发，降低延迟 |
| API 响应（可缓存） | ✅ 推荐 | 设置合适的 TTL |
| 实时数据 | ❌ 不推荐 | 缓存会导致数据过时 |
| 用户个人信息 | ❌ 不推荐 | 安全考虑 |
| 需要强一致性的 API | ❌ 不推荐 | 缓存可能导致不一致 |

---

## 9.7 反模式：负载均衡配置中的常见错误

### 反模式一：健康检查过于严格

**表现**：健康检查的超时时间设置得很短（1 秒），阈值设置得很低（1 次失败就标记为不健康）。

**后果**：正常的服务波动（如 JVM GC 暂停、数据库连接短暂超时）导致健康检查失败，后端被踢出流量池，造成不必要的故障切换。

**正确的做法**：设置合理的超时时间和阈值，允许正常的服务波动。

### 反模式二：健康检查过于宽松

**表现**：健康检查的阈值设置得很高（10 次失败才标记为不健康），间隔设置得很长（60 秒）。

**后果**：后端已经出问题了，但负载均衡器还在继续发送流量，用户持续收到错误。

**正确的做法**：在"过于严格"和"过于宽松"之间找到平衡。建议 `unhealthy-threshold: 3`，`check-interval: 10s`。

### 反模式三：单区域部署但使用区域负载均衡器

**表现**：服务只部署在一个 Region，使用区域负载均衡器而不是全局负载均衡器。

**后果**：该 Region 故障时，没有其他 Region 可以接管流量。

**正确的做法**：即使只部署在一个 Region，也使用全局负载均衡器。这样当需要扩展到多 Region 时，不需要修改负载均衡器配置。

### 反模式四：没有配置 CDN 的缓存策略

**表现**：启用了 Cloud CDN，但没有配置缓存策略，所有内容都使用默认设置。

**后果**：可能缓存了不该缓存的内容（如用户个人信息），或者没有缓存应该缓存的内容（如静态资源）。

**正确的做法**：根据内容类型配置不同的缓存策略。静态资源强制缓存，动态内容遵循后端头信息。

---

## 9.8 速查总结

### 负载均衡器类型选择速查

| 需求 | 推荐类型 | 关键配置 |
|------|---------|---------|
| 面向互联网的 Web 服务 | 外部 HTTP(S) 负载均衡器 | SSL 证书、URL 映射 |
| 面向互联网的非 HTTP 服务 | 外部 TCP/UDP 负载均衡器 | 协议、端口 |
| VPC 内部服务间通信 | 内部负载均衡器 | 内部 IP 地址 |
| 需要 SSL 卸载 | SSL 代理负载均衡器 | SSL 证书 |

### 健康检查配置参考

| 参数 | 建议值 | 说明 |
|------|-------|------|
| check-interval | 10s | 每 10 秒检查一次 |
| timeout | 5s | 5 秒超时 |
| unhealthy-threshold | 3 | 连续 3 次失败标记为不健康 |
| healthy-threshold | 2 | 连续 2 次成功标记为健康 |
| 检查路径 | /healthz | 返回 200 表示健康 |

### 502/503 排查速查

| 症状 | 可能原因 | 检查方法 |
|------|---------|---------|
| 502 Bad Gateway | 后端超时或崩溃 | 检查后端日志 |
| 503 Service Unavailable | 后端实例不足 | 检查实例组容量 |
| 502/503 间歇性出现 | 健康检查配置不当 | 检查健康检查参数 |
| 所有请求都 502 | 后端全部不可用 | 检查 GCP Status Dashboard |

### 每周负载均衡检查清单

- [ ] 所有后端的健康状态是否正常？
- [ ] 健康检查的配置是否合理？
- [ ] CDN 缓存命中率是否在预期范围？
- [ ] SSL 证书是否即将过期？
- [ ] 负载均衡器的流量分布是否均衡？

---

> **下一章预告：** 计算和网络的高可用设计好了，接下来我们需要关注数据层。第 10 章将介绍 GCP 上存储与数据库服务的高可用设计——从 Cloud Storage 到 Cloud SQL，再到 Spanner 和 Firestore。
