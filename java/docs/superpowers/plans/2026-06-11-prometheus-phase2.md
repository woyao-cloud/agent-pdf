# Prometheus Book Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Chapters 3-6 of the Prometheus book (Markdown ebook + lab environments for Spring Boot, K8s, Blackbox, PromQL).

**Architecture:** Four independent lab environments, one per chapter. Ch03 uses a real Spring Boot app (Java 17 + Maven + Micrometer). Ch04 provides kind setup + standalone K8s manifests. Ch05 uses Blackbox Exporter + Nginx. Ch06 uses a Python prometheus_client generator.

**Tech Stack:** Java 17 + Maven + Spring Boot 3.2 + Micrometer, Python 3 + prometheus_client, kind + kubectl, Blackbox Exporter, Nginx, Prometheus v2.48, Grafana 10.2

---

### Task 1: Create Ch03 Directory Structure

**Files:**
- Create: `docs/Prometheus/PART2-Scenarios/03-SpringBoot-Monitoring.md` (placeholder)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p docs/Prometheus/PART2-Scenarios
mkdir -p docs/Prometheus/labs/ch03-springboot/{spring-boot-app/src/main/java/com/demo/{controller,metrics},spring-boot-app/src/main/resources,prometheus,scripts}
```

- [ ] **Step 2: Write placeholder for Chapter 3 ebook**

```markdown
# 第3章 场景一：微服务应用级监控（以 Spring Boot 为例）

> 本章内容将在后续任务中完成。
```

- [ ] **Step 3: Commit**

```bash
git add docs/Prometheus/PART2-Scenarios/
git commit -m "chore: create Phase 2 directory structure"
```

---

### Task 2: Write Chapter 3 Ebook

**Files:**
- Create: `docs/Prometheus/PART2-Scenarios/03-SpringBoot-Monitoring.md`

- [ ] **Step 1: Write full Chapter 3 markdown**

Write `03-SpringBoot-Monitoring.md` with these sections (200+ lines total):

**3.1 Micrometer 门面模式** (25+ paragraphs)
- Micrometer as the SLF4J of metrics
- MeterRegistry, Meter, Counter, Timer, Gauge, DistributionSummary
- Spring Boot Actuator auto-config: `micrometer-registry-prometheus`

**3.2 Spring Boot 内置指标详解** (30+ paragraphs)
- JVM: `jvm_memory_used_bytes{area="heap"}`, `jvm_gc_pause_seconds`, `jvm_threads_live_threads`
- Tomcat: `tomcat_sessions_active_current_sessions`
- DataSource: `hikaricp_connections_active`, `hikaricp_connections_pending`
- HTTP: `http_server_requests_seconds{method, uri, status}` — 重点说明 URI 标签的高基数风险
- Complete with example output from curl /actuator/prometheus

**3.3 自定义业务指标** (15+ paragraphs)
- `@Timed` annotation usage
- MeterRegistry injection example
- Custom metrics: `order_created_total`, `payment_processing_seconds`

**3.4 潜在风险与优化** (30+ paragraphs)
- High cardinality from dynamic URI paths (`/api/user/12345` vs `/api/user/{id}`)
- JVM Full GC causing scrape timeout — "zombie" targets
- Relabeling: `metric_relabel_configs` regex to normalize URIs
- Histogram bucket optimization
- Production checklist for Spring Boot metrics

**3.5 Example Configuration**
```yaml
# Prometheus relabeling config
metric_relabel_configs:
  - source_labels: [__name__, uri]
    regex: 'http_server_requests_seconds_count;/api/user/\d+.*'
    target_label: uri
    replacement: '/api/user/{id}/info'
  - regex: 'trace_id'
    action: labeldrop
```

**3.6 Chapter Summary**
- Link to [Spring Boot monitoring lab](../labs/ch03-springboot/README.md)

---

### Task 3: Create Spring Boot App Source

**Files:**
- Create: `docs/Prometheus/labs/ch03-springboot/spring-boot-app/pom.xml`
- Create: `docs/Prometheus/labs/ch03-springboot/spring-boot-app/src/main/java/com/demo/Application.java`
- Create: `docs/Prometheus/labs/ch03-springboot/spring-boot-app/src/main/java/com/demo/controller/UserController.java`
- Create: `docs/Prometheus/labs/ch03-springboot/spring-boot-app/src/main/java/com/demo/controller/OrderController.java`
- Create: `docs/Prometheus/labs/ch03-springboot/spring-boot-app/src/main/java/com/demo/metrics/CustomMetricsConfig.java`
- Create: `docs/Prometheus/labs/ch03-springboot/spring-boot-app/src/main/resources/application.yml`
- Create: `docs/Prometheus/labs/ch03-springboot/spring-boot-app/Dockerfile`

- [ ] **Step 1: Write pom.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <groupId>com.demo</groupId>
    <artifactId>springboot-monitoring-demo</artifactId>
    <version>1.0.0</version>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>io.micrometer</groupId>
            <artifactId>micrometer-registry-prometheus</artifactId>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 2: Write Application.java**

```java
package com.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

- [ ] **Step 3: Write UserController.java**

```java
package com.demo.controller;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.web.bind.annotation.*;
import java.util.concurrent.ThreadLocalRandom;

@RestController
@RequestMapping("/api/user")
public class UserController {

    private final MeterRegistry meterRegistry;

    public UserController(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    /**
     * 高基数风险端点：
     * 每次请求使用不同的 userId，导致 URI 标签产生大量唯一值
     * 访问 /api/user/{任意数字}/profile → URI 标签值 = /api/user/12345
     */
    @GetMapping("/{userId}/profile")
    public String getProfile(@PathVariable Long userId) {
        // 模拟处理延迟
        sleep(ThreadLocalRandom.current().nextInt(10, 200));
        // 增加自定义计数器
        meterRegistry.counter("user_profile_requests",
                "userId", String.valueOf(userId % 100),  // 模拟 100 个活跃用户
                "range", userId < 1000 ? "small" : "large"
        ).increment();
        return "Profile for user " + userId;
    }

    /**
     * 高基数 + 业务分类：
     * /api/user/12345/order → URI = /api/user/12345/order
     * 每秒被大量请求，导致 http_server_requests_seconds 的 URI 标签爆炸
     */
    @GetMapping("/{userId}/order/{orderId}")
    public String getOrder(@PathVariable Long userId, @PathVariable Long orderId) {
        sleep(ThreadLocalRandom.current().nextInt(20, 500));
        return "Order " + orderId + " for user " + userId;
    }

    private void sleep(int ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
```

- [ ] **Step 4: Write OrderController.java**

```java
package com.demo.controller;

import io.micrometer.core.annotation.Timed;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.web.bind.annotation.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/order")
public class OrderController {

    private final MeterRegistry meterRegistry;
    private final Timer orderProcessingTimer;

    public OrderController(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        // 自定义 Timer，精细控制 bucket 边界
        this.orderProcessingTimer = Timer.builder("order_processing_seconds")
                .description("Time taken to process an order")
                .publishPercentiles(0.5, 0.95, 0.99)
                .publishPercentileHistogram()
                .sla(java.time.Duration.ofMillis(50),
                     java.time.Duration.ofMillis(100),
                     java.time.Duration.ofMillis(200),
                     java.time.Duration.ofMillis(500))
                .register(meterRegistry);
    }

    /**
     * 使用 @Timed 注解自动记录耗时
     */
    @Timed(value = "order_create_seconds", 
          description = "Time taken to create an order",
          percentiles = {0.5, 0.95, 0.99})
    @PostMapping("/create")
    public String createOrder(@RequestParam(defaultValue = "1") Long userId) {
        // 模拟不同金额的订单
        double amount = ThreadLocalRandom.current().nextDouble(10, 1000);
        meterRegistry.counter("order_created_total",
                "currency", "CNY",
                "amount_range", amount < 100 ? "small" : 
                               amount < 500 ? "medium" : "large"
        ).increment();
        
        sleep(ThreadLocalRandom.current().nextInt(30, 300));
        return "Order created for user " + userId + ", amount=" + String.format("%.2f", amount);
    }

    @PostMapping("/pay")
    public String payOrder(@RequestParam Long orderId) {
        long start = System.nanoTime();
        sleep(ThreadLocalRandom.current().nextInt(50, 1000));
        long duration = System.nanoTime() - start;
        
        // 手动记录 Timer
        orderProcessingTimer.record(duration, TimeUnit.NANOSECONDS);
        
        meterRegistry.counter("payment_processed_total").increment();
        return "Payment done for order " + orderId;
    }

    @GetMapping("/stats")
    public String stats(@RequestParam(defaultValue = "0") Long simulateError) {
        if (simulateError > 0) {
            meterRegistry.counter("order_error_total", "type", "timeout").increment();
            sleep(2000); // 模拟超时
            return "Error simulated";
        }
        return "All good";
    }

    private void sleep(int ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
```

- [ ] **Step 5: Write CustomMetricsConfig.java**

```java
package com.demo.metrics;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.lang.management.ManagementFactory;
import java.lang.management.OperatingSystemMXBean;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class CustomMetricsConfig {

    private final MeterRegistry meterRegistry;
    private final AtomicInteger activeUsers = new AtomicInteger(0);
    private final AtomicInteger pendingOrders = new AtomicInteger(0);

    public CustomMetricsConfig(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @PostConstruct
    public void init() {
        // 业务指标：活跃用户数
        Gauge.builder("app_active_users", activeUsers, AtomicInteger::get)
                .description("Currently active users")
                .register(meterRegistry);

        // 业务指标：待处理订单数
        Gauge.builder("app_pending_orders", pendingOrders, AtomicInteger::get)
                .description("Pending orders count")
                .register(meterRegistry);

        // JVM 进程级别指标
        Gauge.builder("app_startup_time_seconds", 
                ManagementFactory.getRuntimeMXBean(),
                bean -> bean.getUptime() / 1000.0)
                .description("Application uptime in seconds")
                .register(meterRegistry);

        // 初始化值
        activeUsers.set(42);
        pendingOrders.set(7);
    }

    /**
     * 给外部调用来更新指标值的方法
     */
    public void incrementActiveUsers() { activeUsers.incrementAndGet(); }
    public void decrementActiveUsers() { activeUsers.decrementAndGet(); }
    public void setPendingOrders(int count) { pendingOrders.set(count); }
}
```

- [ ] **Step 6: Write application.yml**

```yaml
server:
  port: 8085

spring:
  application:
    name: springboot-monitoring-demo

management:
  endpoints:
    web:
      exposure:
        include: health,metrics,prometheus
  metrics:
    tags:
      application: ${spring.application.name}
    export:
      prometheus:
        enabled: true
    # 关键配置：禁用自动的 URI 标签（演示高基数防护）
    # web:
    #   server:
    #     request:
    #       autotime:
    #         enabled: true
```

- [ ] **Step 7: Write Dockerfile**

```dockerfile
FROM eclipse-temurin:17-jdk-alpine
WORKDIR /app
COPY pom.xml pom.xml
COPY src src
RUN apk add --no-cache maven && mvn package -DskipTests -q
RUN cp target/*.jar app.jar && rm -rf src pom.xml target ~/.m2
EXPOSE 8085
CMD ["java", "-jar", "app.jar"]
```

---

### Task 4: Create Ch03 Prometheus Config

**Files:**
- Create: `docs/Prometheus/labs/ch03-springboot/prometheus/prometheus.yml`

- [ ] **Step 1: Write prometheus.yml**

```yaml
# prometheus.yml — 第3章 Spring Boot 监控实验
#
# 配置高基数防护 relabeling 规则
# 演示如何将动态 URI 泛化为模板格式

global:
  scrape_interval: 10s
  evaluation_interval: 10s
  scrape_timeout: 8s

scrape_configs:
  - job_name: 'spring-boot-app'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['spring-boot-app:8085']

    # =============================================
    # 高基数防护：Relabeling 规则
    # 实验步骤：
    # 1. 先注释掉下面的规则，启动环境
    # 2. 发送带动态 ID 的请求，观察序列数爆炸
    # 3. 取消注释，重启 Prometheus，观察序列数下降
    # =============================================
    metric_relabel_configs:
      # 规则1：将 /api/user/{数字}/... 泛化为 /api/user/{id}/...
      - source_labels: [__name__, uri]
        regex: 'http_server_requests_seconds.*;/api/user/\d+(/.*)?'
        target_label: uri
        replacement: '/api/user/{id}${1}'

      # 规则2：将 /api/order/{数字}/... 泛化为 /api/order/{id}/...
      - source_labels: [__name__, uri]
        regex: 'http_server_requests_seconds.*;/api/order/\d+(/.*)?'
        target_label: uri
        replacement: '/api/order/{id}${1}'

      # 规则3：丢弃所有 trace_id 等高基数标签
      - regex: 'trace_id|span_id|parent_id'
        action: labeldrop

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

---

### Task 5: Create Ch03 Docker Compose and Scripts

**Files:**
- Create: `docs/Prometheus/labs/ch03-springboot/docker-compose.yml`
- Create: `docs/Prometheus/labs/ch03-springboot/scripts/generate-traffic.sh`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
version: '3.8'

services:
  spring-boot-app:
    build: ./spring-boot-app
    container_name: prom-sb-app
    ports:
      - "8085:8085"
    networks:
      - sb-net

  prometheus:
    image: prom/prometheus:v2.48.0
    container_name: prom-ch03
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=7d'
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data_ch03:/prometheus
    ports:
      - "9093:9090"
    depends_on:
      - spring-boot-app
    networks:
      - sb-net

  grafana:
    image: grafana/grafana:10.2.0
    container_name: prom-grafana-ch03
    ports:
      - "3003:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - grafana_data_ch03:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - sb-net

networks:
  sb-net:
    driver: bridge

volumes:
  prometheus_data_ch03:
  grafana_data_ch03:
```

- [ ] **Step 2: Write generate-traffic.sh**

```bash
#!/bin/bash
# Ch03 流量生成脚本
# 模拟大量用户请求，触发高基数 URI 标签
#
# 用法: ./generate-traffic.sh [请求总数] [用户数]
# 默认: 请求 200 次，模拟 100 个不同用户

TOTAL=${1:-200}
USERS=${2:-100}
BASE_URL="http://localhost:8085"

echo "========================================="
echo "Spring Boot 流量生成器"
echo "========================================="
echo "总请求: $TOTAL"
echo "模拟用户: $USERS"
echo "========================================="

for i in $(seq 1 $TOTAL); do
    USER_ID=$(( RANDOM % USERS + 1 ))
    ENDPOINT=$(( RANDOM % 3 ))

    case $ENDPOINT in
        0)
            # 高基数端点：每个用户不同 URI
            curl -s -o /dev/null "$BASE_URL/api/user/$USER_ID/profile"
            ;;
        1)
            # 也是高基数端点
            ORDER_ID=$(( RANDOM % 10000 + 1 ))
            curl -s -o /dev/null "$BASE_URL/api/user/$USER_ID/order/$ORDER_ID"
            ;;
        2)
            # 业务端点
            curl -s -o /dev/null -X POST "$BASE_URL/api/order/create?userId=$USER_ID"
            ;;
    esac

    if [ $((i % 50)) -eq 0 ]; then
        echo "  已完成 $i / $TOTAL 请求"
        sleep 1
    fi
done

echo "========================================="
echo "流量生成完成"
echo "========================================="
echo "查看 Prometheus 序列数:"
echo "  http://localhost:9093/api/v1/status/tsdb"
```

- [ ] **Step 3: Make script executable**

```bash
chmod +x docs/Prometheus/labs/ch03-springboot/scripts/generate-traffic.sh
```

---

### Task 6: Create Ch03 Lab README

**Files:**
- Create: `docs/Prometheus/labs/ch03-springboot/README.md`

- [ ] **Step 1: Write README.md**

```markdown
# 第3章 实验：Spring Boot 微服务监控

## 实验目的

1. 理解 Micrometer + Actuator 的 Prometheus 指标暴露机制
2. 观察 JVM 指标、Tomcat 指标、数据源指标
3. 体验高基数 URI 标签导致的时间序列爆炸
4. 掌握 Relabeling 防护规则

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| spring-boot-app | :8085 | Spring Boot 3.2 + Micrometer + Actuator |
| Prometheus | :9093 | 含 relabeling 防护规则 |
| Grafana | :3003 | 可视化 |

## 实验步骤

### 实验 1：标准 JVM 指标采集

```bash
# 1. 启动环境
docker compose up -d

# 2. 验证 Spring Boot 指标端点
curl http://localhost:8085/actuator/prometheus | head -50

# 3. 查看 JVM 指标
curl http://localhost:8085/actuator/prometheus | grep jvm_memory
```

在 Prometheus 中查询：
- `jvm_memory_used_bytes{area="heap"}` — 堆内存使用
- `jvm_gc_pause_seconds_count` — GC 暂停次数
- `jvm_threads_live_threads` — 活跃线程数
- `http_server_requests_seconds_count` — HTTP 请求计数

### 实验 2：高基数灾难 + Relabeling 防护

**步骤 A：先关闭 relabeling 观察高基数**

编辑 `prometheus/prometheus.yml`，将 `metric_relabel_configs` 部分全部注释掉，然后重启：

```bash
docker compose restart prometheus
```

运行流量生成脚本：
```bash
bash scripts/generate-traffic.sh 200 100
```

查看序列数：
```bash
curl -s http://localhost:9093/api/v1/status/tsdb | python -m json.tool | grep seriesCount
```

**步骤 B：启用 relabeling 后对比**

取消 `prometheus.yml` 中 `metric_relabel_configs` 的注释，重启：

```bash
docker compose restart prometheus
```

再次运行流量生成脚本并查看序列数，对比差异。

### 实验 3：自定义业务指标

```bash
# 创建订单
curl -X POST "http://localhost:8085/api/order/create?userId=1"

# 模拟支付
curl -X POST "http://localhost:8085/api/order/pay?orderId=123"

# 查询自定义指标
curl http://localhost:8085/actuator/prometheus | grep -E "order_|payment_|app_"
```

## Grafana

1. 访问 http://localhost:3003
2. 数据源：Prometheus，URL=http://prometheus:9090
3. 导入 JVM (Micrometer) Dashboard ID: 4701
4. 推荐查询：
   - `rate(http_server_requests_seconds_count[1m])` — QPS
   - `histogram_quantile(0.99, rate(http_server_requests_seconds_bucket[1m]))` — P99 延迟

## 清理

```bash
docker compose down -v
```
```

---

### Task 7: Write Chapter 4 Ebook

**Files:**
- Create: `docs/Prometheus/PART2-Scenarios/04-Kubernetes-Monitoring.md`

- [ ] **Step 1: Write full Chapter 4 markdown**

Write `04-Kubernetes-Monitoring.md` with these sections (200+ lines total):

**4.1 Prometheus Operator 架构** (25+ paragraphs)
- The control loop: watching CRD resources and reconciling
- CRD catalog: Prometheus, ServiceMonitor, PodMonitor, PrometheusRule, Alertmanager
- Operator vs. manual deployment tradeoffs

**4.2 核心组件协同** (30+ paragraphs)
- **Node Exporter**: DaemonSet, host-level metrics (`node_cpu_seconds_total`, `node_load1`)
- **cAdvisor**: built into kubelet, container-level (`container_cpu_usage_seconds_total`, `container_memory_usage_bytes`)
- **kube-state-metrics**: K8s object state (`kube_pod_status_phase`, `kube_deployment_status_replicas`)
- How these three complement each other: host → container → orchestrator

**4.3 ServiceMonitor 声明式配置** (20+ paragraphs)
- Label selector mechanism
- ServiceMonitor example with sample app
- Prometheus CR referencing ServiceMonitors

**4.4 潜在风险与优化** (20+ paragraphs)
- API Server pressure from frequent SD polling
- Pod lifecycle churn → orphaned series in TSDB
- honor_labels usage for preserving target labels
- Scrape interval tuning for large clusters

**4.5 Chapter Summary**
- Link to [K8s monitoring lab](../labs/ch04-kubernetes/README.md)

---

### Task 8: Create Ch04 Kubernetes Manifests

**Files:**
- Create: `docs/Prometheus/labs/ch04-kubernetes/kind/kind-config.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/kind/setup-cluster.sh`
- Create: `docs/Prometheus/labs/ch04-kubernetes/kind/teardown.sh`
- Create: `docs/Prometheus/labs/ch04-kubernetes/kind/deploy-all.sh`
- Create: `docs/Prometheus/labs/ch04-kubernetes/manifests/namespace.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/manifests/prometheus/operator.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/manifests/prometheus/rbac.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/manifests/prometheus/servicemonitor.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/manifests/prometheus/prometheus.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/manifests/exporters/node-exporter.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/manifests/exporters/kube-state-metrics.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/manifests/sample-app/deployment.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/manifests/sample-app/service.yaml`
- Create: `docs/Prometheus/labs/ch04-kubernetes/scripts/port-forward.sh`

- [ ] **Step 1: Write kind-config.yaml**

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
```

- [ ] **Step 2: Write setup-cluster.sh**

```bash
#!/bin/bash
set -e
echo "=== Creating kind cluster ==="
kind create cluster --config kind/kind-config.yaml --name prom-demo
echo "=== Cluster ready ==="
kubectl cluster-info --context kind-prom-demo
```

- [ ] **Step 3: Write teardown.sh**

```bash
#!/bin/bash
echo "=== Deleting kind cluster ==="
kind delete cluster --name prom-demo
echo "=== Cleanup complete ==="
```

- [ ] **Step 4: Write deploy-all.sh**

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MANIFESTS="$SCRIPT_DIR/manifests"

echo "=== Deploying monitoring stack ==="

# 1. Namespace
kubectl apply -f "$MANIFESTS/namespace.yaml"

# 2. Prometheus Operator
kubectl apply -f "$MANIFESTS/prometheus/operator.yaml"
kubectl wait --for=condition=Available deployment/prometheus-operator -n monitoring --timeout=120s

# 3. RBAC
kubectl apply -f "$MANIFESTS/prometheus/rbac.yaml"

# 4. Exporters
kubectl apply -f "$MANIFESTS/exporters/node-exporter.yaml"
kubectl apply -f "$MANIFESTS/exporters/kube-state-metrics.yaml"

# 5. Prometheus instance
kubectl apply -f "$MANIFESTS/prometheus/prometheus.yaml"
kubectl apply -f "$MANIFESTS/prometheus/servicemonitor.yaml"

# 6. Sample app
kubectl apply -f "$MANIFESTS/sample-app/deployment.yaml"
kubectl apply -f "$MANIFESTS/sample-app/service.yaml"

echo "=== Deployment complete ==="
echo "Run: bash scripts/port-forward.sh"
```

- [ ] **Step 5: Write namespace.yaml**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
```

- [ ] **Step 6: Write operator.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus-operator
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus-operator
  template:
    metadata:
      labels:
        app: prometheus-operator
    spec:
      serviceAccountName: prometheus-operator
      containers:
        - name: prometheus-operator
          image: quay.io/prometheus-operator/prometheus-operator:v0.71.0
          args:
            - --kubelet-service=kube-system/kubelet
            - --log-level=info
          ports:
            - containerPort: 8080
              name: http
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus-operator
  namespace: monitoring
```

- [ ] **Step 7: Write rbac.yaml**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus-operator
rules:
  - apiGroups: [""]
    resources: ["nodes", "nodes/metrics", "services", "endpoints", "pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch", "create", "update", "delete"]
  - apiGroups: ["monitoring.coreos.com"]
    resources: ["prometheuses", "servicemonitors", "podmonitors", "prometheusrules"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["apps"]
    resources: ["statefulsets", "deployments"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus-operator
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: prometheus-operator
subjects:
  - kind: ServiceAccount
    name: prometheus-operator
    namespace: monitoring
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus
rules:
  - apiGroups: [""]
    resources: ["nodes", "nodes/metrics", "services", "endpoints", "pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: prometheus
subjects:
  - kind: ServiceAccount
    name: prometheus
    namespace: monitoring
```

- [ ] **Step 8: Write servicemonitor.yaml**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sample-app
  namespace: monitoring
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: sample-app
  endpoints:
    - port: metrics
      interval: 15s
  namespaceSelector:
    matchNames:
      - default
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: node-exporter
  namespace: monitoring
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: node-exporter
  endpoints:
    - port: metrics
      interval: 30s
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: kube-state-metrics
  namespace: monitoring
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: kube-state-metrics
  endpoints:
    - port: metrics
      interval: 30s
```

- [ ] **Step 9: Write prometheus.yaml**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
  name: prometheus
  namespace: monitoring
spec:
  serviceAccountName: prometheus
  serviceMonitorSelector:
    matchLabels:
      release: prometheus
  resources:
    requests:
      memory: 400Mi
  alerting:
    alertmanagers:
      - namespace: monitoring
        name: alertmanager
        port: http
```

- [ ] **Step 10: Write node-exporter.yaml**

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
  labels:
    app: node-exporter
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      hostNetwork: true
      hostPID: true
      containers:
        - name: node-exporter
          image: prom/node-exporter:v1.7.0
          args:
            - --path.procfs=/host/proc
            - --path.sysfs=/host/sys
          ports:
            - containerPort: 9100
              name: metrics
          volumeMounts:
            - name: proc
              mountPath: /host/proc
              readOnly: true
            - name: sys
              mountPath: /host/sys
              readOnly: true
      volumes:
        - name: proc
          hostPath:
            path: /proc
        - name: sys
          hostPath:
            path: /sys
---
apiVersion: v1
kind: Service
metadata:
  name: node-exporter
  namespace: monitoring
  labels:
    app: node-exporter
spec:
  ports:
    - port: 9100
      targetPort: 9100
      name: metrics
  selector:
    app: node-exporter
```

- [ ] **Step 11: Write kube-state-metrics.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kube-state-metrics
  namespace: monitoring
  labels:
    app: kube-state-metrics
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kube-state-metrics
  template:
    metadata:
      labels:
        app: kube-state-metrics
    spec:
      serviceAccountName: kube-state-metrics
      containers:
        - name: kube-state-metrics
          image: registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.10.0
          ports:
            - containerPort: 8080
              name: metrics
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kube-state-metrics
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kube-state-metrics
rules:
  - apiGroups: [""]
    resources: ["nodes", "pods", "services", "configmaps", "persistentvolumeclaims"]
    verbs: ["list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "daemonsets", "statefulsets"]
    verbs: ["list", "watch"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kube-state-metrics
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kube-state-metrics
subjects:
  - kind: ServiceAccount
    name: kube-state-metrics
    namespace: monitoring
---
apiVersion: v1
kind: Service
metadata:
  name: kube-state-metrics
  namespace: monitoring
  labels:
    app: kube-state-metrics
spec:
  ports:
    - port: 8080
      targetPort: 8080
      name: metrics
  selector:
    app: kube-state-metrics
```

- [ ] **Step 12: Write sample-app deployment.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample-app
  namespace: default
  labels:
    app: sample-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: sample-app
  template:
    metadata:
      labels:
        app: sample-app
    spec:
      containers:
        - name: app
          image: nginx:alpine
          ports:
            - containerPort: 80
              name: http
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
```

- [ ] **Step 13: Write sample-app service.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sample-app
  namespace: default
  labels:
    app: sample-app
spec:
  ports:
    - port: 80
      targetPort: 80
      name: http
  selector:
    app: sample-app
```

- [ ] **Step 14: Write port-forward.sh**

```bash
#!/bin/bash
echo "=== Port-forwarding Prometheus and Grafana ==="
echo "Prometheus: http://localhost:9094"
echo "Grafana:    http://localhost:3004"
echo ""

# Forward Prometheus (assuming managed by operator)
kubectl port-forward -n monitoring prometheus-prometheus-0 9094:9090 &

# Forward Grafana if deployed
kubectl port-forward -n monitoring service/grafana 3004:3000 2>/dev/null || \
  echo "Grafana not deployed, skipping"

echo "Press Ctrl+C to stop forwarding"
wait
```

- [ ] **Step 15: Make scripts executable**

```bash
chmod +x docs/Prometheus/labs/ch04-kubernetes/kind/setup-cluster.sh
chmod +x docs/Prometheus/labs/ch04-kubernetes/kind/teardown.sh
chmod +x docs/Prometheus/labs/ch04-kubernetes/kind/deploy-all.sh
chmod +x docs/Prometheus/labs/ch04-kubernetes/scripts/port-forward.sh
```

---

### Task 9: Create Ch04 Lab README

**Files:**
- Create: `docs/Prometheus/labs/ch04-kubernetes/README.md`

- [ ] **Step 1: Write README.md**

```markdown
# 第4章 实验：Kubernetes 云原生监控体系

## 实验目的

1. 使用 Prometheus Operator 搭建 K8s 监控栈
2. 理解 Node Exporter / cAdvisor / kube-state-metrics 的分工
3. 通过 ServiceMonitor 实现声明式服务发现
4. 编写 K8s 监控 PromQL 查询

## 两套方案

本实验提供两种运行方式：

### 方案 A：kind（推荐）

需要安装 [kind](https://kind.sigs.k8s.io/) 和 [kubectl](https://kubernetes.io/docs/tasks/tools/)。

```bash
# 1. 创建集群
cd kind
bash setup-cluster.sh

# 2. 部署监控栈
bash deploy-all.sh

# 3. 端口转发
cd ../scripts
bash port-forward.sh

# 4. 访问
# Prometheus: http://localhost:9094/targets
# Grafana:    http://localhost:3004

# 5. 清理
cd ../kind
bash teardown.sh
```

### 方案 B：已有集群

```bash
kubectl apply -f manifests/
```

## 核心实验

### 实验 1：Node Exporter 主机监控

在 Prometheus 中查询：
- `rate(node_cpu_seconds_total[1m])` — CPU 使用率
- `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100` — 内存使用率
- `node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100` — 磁盘使用率

### 实验 2：cAdvisor 容器监控

- `container_cpu_usage_seconds_total{namespace="default"}` — 容器 CPU
- `container_memory_usage_bytes{namespace="default"}` — 容器内存
- `rate(container_cpu_usage_seconds_total[5m])` — CPU 使用率

### 实验 3：kube-state-metrics 对象状态

- `kube_pod_status_phase{phase="Running"}` — 运行中的 Pod
- `kube_deployment_status_replicas_available` — 可用副本
- `kube_node_status_condition{condition="Ready",status="true"}` — 节点健康

### 实验 4：ServiceMonitor 声明式服务发现

1. 查看 Prometheus Targets: `http://localhost:9094/targets`
2. 部署 Sample App 后自动出现在 targets
3. 删除 ServiceMonitor 后目标自动消失

## Grafana

导入社区 Dashboard：
- Node Exporter Full: ID 1860
- K8s Cluster Monitoring: ID 315
- 数据源 URL: http://prometheus-prometheus:9090
```

---

### Task 10: Write Chapter 5 Ebook

**Files:**
- Create: `docs/Prometheus/PART2-Scenarios/05-Blackbox-SLA.md`

- [ ] **Step 1: Write full Chapter 5 markdown**

Write `05-Blackbox-SLA.md` with these sections (180+ lines total):

**5.1 黑盒 vs 白盒监控** (15+ paragraphs)
- White-box: reading internal state via /metrics (what do I have?)
- Black-box: probing from outside (can users access it?)
- They are complementary: white-box for root cause, black-box for impact

**5.2 Blackbox Exporter 探测协议** (25+ paragraphs)
- HTTP: status codes, response time, SSL cert expiry, redirects
- TCP: port reachability, connection latency
- ICMP: ping RTT, packet loss
- DNS: resolution time, record existence
- Module configuration system

**5.3 Module 配置详解** (15+ paragraphs)
```yaml
modules:
  http_2xx:
    prober: http
    http:
      valid_status_codes: [200, 201, 302]
      follow_redirects: true
      preferred_ip_protocol: ip4
```

**5.4 SLA 计算 PromQL** (20+ paragraphs)
- `avg_over_time(probe_success[30d]) * 100` — rolling 30d SLA
- `(probe_ssl_earliest_cert_expiry - time()) / 86400 < 30` — cert expiry alert
- Recording rules for SLA pre-computation

**5.5 Chapter Summary**
- Link to [Blackbox lab](../labs/ch05-blackbox/README.md)

---

### Task 11: Create Ch05 Blackbox Lab

**Files:**
- Create: `docs/Prometheus/labs/ch05-blackbox/docker-compose.yml`
- Create: `docs/Prometheus/labs/ch05-blackbox/blackbox-exporter/config.yml`
- Create: `docs/Prometheus/labs/ch05-blackbox/prometheus/prometheus.yml`
- Create: `docs/Prometheus/labs/ch05-blackbox/prometheus/rules/sla-rules.yml`
- Create: `docs/Prometheus/labs/ch05-blackbox/web-target/Dockerfile`
- Create: `docs/Prometheus/labs/ch05-blackbox/web-target/default.conf`
- Create: `docs/Prometheus/labs/ch05-blackbox/scripts/simulate-outage.sh`

- [ ] **Step 1: Write config.yml**

```yaml
modules:
  http_2xx:
    prober: http
    http:
      valid_status_codes: [200, 201, 302]
      follow_redirects: true
      preferred_ip_protocol: ip4

  http_404:
    prober: http
    http:
      valid_status_codes: [404]
      method: GET

  tcp_connect:
    prober: tcp

  icmp:
    prober: icmp
    icmp:
      preferred_ip_protocol: ip4

  dns_query:
    prober: dns
    dns:
      query_type: A
      preferred_ip_protocol: ip4
```

- [ ] **Step 2: Write prometheus.yml**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - 'rules/sla-rules.yml'

scrape_configs:
  - job_name: 'blackbox-http'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - http://web-target
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115

  - job_name: 'blackbox-tcp'
    metrics_path: /probe
    params:
      module: [tcp_connect]
    static_configs:
      - targets:
          - web-target:80
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115

  - job_name: 'blackbox-icmp'
    metrics_path: /probe
    params:
      module: [icmp]
    static_configs:
      - targets:
          - 8.8.8.8
          - 1.1.1.1
          - 114.114.114.114
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115

  - job_name: 'blackbox-dns'
    metrics_path: /probe
    params:
      module: [dns_query]
    static_configs:
      - targets:
          - google.com
          - github.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

- [ ] **Step 3: Write sla-rules.yml**

```yaml
groups:
  - name: sla
    rules:
      # 预计算 24 小时滚动 SLA
      - record: sla:http_availability:ratio_24h
        expr: avg_over_time(probe_success{job="blackbox-http"}[24h])

      # 预计算 7 天滚动 SLA
      - record: sla:http_availability:ratio_7d
        expr: avg_over_time(probe_success{job="blackbox-http"}[7d])

      # 预计算 30 天滚动 SLA（生产环境建议）
      - record: sla:http_availability:ratio_30d
        expr: avg_over_time(probe_success{job="blackbox-http"}[30d])

      # 预计算 24 小时 DNS SLA
      - record: sla:dns_resolution:ratio_24h
        expr: avg_over_time(probe_success{job="blackbox-dns"}[24h])

      # 证书过期倒计时（天）
      - record: cert:expiry_days
        expr: (probe_ssl_earliest_cert_expiry - time()) / 86400
```

- [ ] **Step 4: Write web-target Dockerfile**

```dockerfile
FROM nginx:alpine
COPY default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 5: Write default.conf**

```nginx
server {
    listen       80;
    server_name  localhost;

    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;
    }

    location /health {
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    location /slow {
        # 模拟慢响应（测试 timeout）
        expires -1;
        add_header Content-Type text/plain;
        return 200 "slow response\n";
        limit_rate 1k;
    }

    # 模拟特定状态码
    location = /redirect {
        return 302 /health;
    }
}
```

- [ ] **Step 6: Write simulate-outage.sh**

```bash
#!/bin/bash
# 模拟目标宕机，观察 SLA 变化
#
# 用法: ./simulate-outage.sh [持续时间秒]
# 默认: 30 秒

DURATION=${1:-30}
CONTAINER="prom-blackbox-web"

echo "========================================="
echo "  模拟目标宕机（${DURATION}s）"
echo "========================================="
echo ""

# 确认当前状态
echo "▶ 当前 SLA:"
curl -s http://localhost:9095/api/v1/query?query=sla:http_availability:ratio_24h 2>/dev/null | \
  python -c "import sys,json; d=json.load(sys.stdin); print(f\"  {float(d['data']['result'][0]['value'][1])*100:.4f}%\")" 2>/dev/null || echo "  N/A"

# 停止 Web 目标
echo ""
echo "▶ 停止 Web 目标..."
docker stop $CONTAINER
echo "  等待 ${DURATION}s..."

# 等待期间每 10s 检查一次 SLA
for i in $(seq 1 $((DURATION / 10))); do
    sleep 10
    STATUS=$(curl -s http://localhost:9095/api/v1/query?query=probe_success 2>/dev/null | \
      python -c "import sys,json; d=json.load(sys.stdin); r=d['data']['result']; print(f\"up={r[0]['value'][1]}\")" 2>/dev/null)
    echo "  第 $((i * 10))s: $STATUS"
done

# 恢复 Web 目标
echo ""
echo "▶ 恢复 Web 目标..."
docker start $CONTAINER
sleep 5

echo ""
echo "▶ 恢复后 SLA:"
curl -s http://localhost:9095/api/v1/query?query=sla:http_availability:ratio_24h 2>/dev/null | \
  python -c "import sys,json; d=json.load(sys.stdin); print(f\"  {float(d['data']['result'][0]['value'][1])*100:.4f}%\")" 2>/dev/null || echo "  N/A"

echo ""
echo "========================================="
echo "  模拟完成"
echo "========================================="
```

- [ ] **Step 7: Write docker-compose.yml**

```yaml
version: '3.8'

services:
  blackbox-exporter:
    image: prom/blackbox-exporter:v0.24.0
    container_name: prom-blackbox-exporter
    command:
      - '--config.file=/config/config.yml'
    volumes:
      - ./blackbox-exporter/config.yml:/config/config.yml
    ports:
      - "9115:9115"
    networks:
      - bb-net

  web-target:
    build: ./web-target
    container_name: prom-blackbox-web
    ports:
      - "8086:80"
    networks:
      - bb-net

  prometheus:
    image: prom/prometheus:v2.48.0
    container_name: prom-ch05
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=7d'
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/rules:/etc/prometheus/rules
      - prometheus_data_ch05:/prometheus
    ports:
      - "9095:9090"
    depends_on:
      - blackbox-exporter
      - web-target
    networks:
      - bb-net

  grafana:
    image: grafana/grafana:10.2.0
    container_name: prom-grafana-ch05
    ports:
      - "3005:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - grafana_data_ch05:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - bb-net

networks:
  bb-net:
    driver: bridge

volumes:
  prometheus_data_ch05:
  grafana_data_ch05:
```

- [ ] **Step 8: Make scripts executable**

```bash
chmod +x docs/Prometheus/labs/ch05-blackbox/scripts/simulate-outage.sh
```

---

### Task 12: Create Ch05 Lab README

**Files:**
- Create: `docs/Prometheus/labs/ch05-blackbox/README.md`

- [ ] **Step 1: Write README.md**

```markdown
# 第5章 实验：黑盒监控与 SLA 探测

## 实验目的

1. 掌握 Blackbox Exporter 的 HTTP/TCP/ICMP/DNS 探测
2. 配置 SSL 证书过期监控
3. 利用 Recording Rules 预计算 SLA

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| blackbox-exporter | :9115 | 多协议探测 |
| web-target | :8086 | Nginx 被探测目标 |
| Prometheus | :9095 | 含 SLA recording rules |
| Grafana | :3005 | SLA 仪表盘 |

## 实验步骤

### 实验 1：手动探测

```bash
# HTTP 探测
curl 'http://localhost:9115/probe?module=http_2xx&target=http://web-target' | grep probe_success

# ICMP 探测
curl 'http://localhost:9115/probe?module=icmp&target=8.8.8.8' | grep probe_success

# TCP 探测
curl 'http://localhost:9115/probe?module=tcp_connect&target=web-target:80' | grep probe_success

# DNS 探测
curl 'http://localhost:9115/probe?module=dns_query&target=google.com' | grep probe_dns
```

### 实验 2：证书过期监控

```bash
# 查看证书过期时间
curl -s 'http://localhost:9115/probe?module=http_2xx&target=https://google.com' | \
  grep probe_ssl_earliest_cert_expiry

# 在 Prometheus 中查询
# cert:expiry_days < 30
```

### 实验 3：SLA 模拟宕机

```bash
bash scripts/simulate-outage.sh 60
```

观察 SLA 百分比变化。

## PromQL 速查

```promql
# 24h 可用率
avg_over_time(probe_success{job="blackbox-http"}[24h]) * 100

# 证书过期天数
(probe_ssl_earliest_cert_expiry - time()) / 86400

# DNS 解析延迟
probe_dns_lookup_time_seconds
```

## 清理

```bash
docker compose down -v
```
```

---

### Task 13: Write Chapter 6 Ebook

**Files:**
- Create: `docs/Prometheus/PART2-Scenarios/06-PromQL-Deep-Dive.md`

- [ ] **Step 1: Write full Chapter 6 markdown**

Write `06-PromQL-Deep-Dive.md` with these sections (250+ lines total):

**6.1 Vector 类型与匹配机制** (35+ paragraphs)
- Instant Vector vs Range Vector: when to use each
- `on()` and `ignoring()` for label matching
- `group_left` many-to-one / `group_right` one-to-many
- Many-to-one example: calculating request percentage by method
- Complete with visual ASCII diagrams of vector matching

**6.2 rate() vs irate()** (20+ paragraphs)
- `rate[1m]`: average over window, smooth but lags
- `irate[5m]`: last two samples only, sensitive but noisy
- When to use each: CPU spikes → irate, QPS trend → rate
- Comparison table with specific scenarios

**6.3 Performance Killers** (25+ paragraphs)
- Unbounded wildcards: `sum(metric{})` scans all series
- Range vector window size: longer window → more memory
- Subqueries: `avg(rate(metric[5m])[30m:1m])` — double the cost
- Cardinality explosion in query results
- How to detect slow queries: Prometheus log analysis

**6.4 Recording Rules** (20+ paragraphs)
- Why pre-compute: Grafana dashboard loading time
- Rule naming convention: `level:metric:operation`
- Rule examples for common patterns
- Rule evaluation performance considerations

**6.5 Chapter Summary**
- Link to [PromQL lab](../labs/ch06-promql/README.md)

---

### Task 14: Create Ch06 PromQL Lab

**Files:**
- Create: `docs/Prometheus/labs/ch06-promql/docker-compose.yml`
- Create: `docs/Prometheus/labs/ch06-promql/promql-generator/generator.py`
- Create: `docs/Prometheus/labs/ch06-promql/promql-generator/Dockerfile`
- Create: `docs/Prometheus/labs/ch06-promql/promql-generator/requirements.txt`
- Create: `docs/Prometheus/labs/ch06-promql/prometheus/prometheus.yml`
- Create: `docs/Prometheus/labs/ch06-promql/prometheus/rules/recording-rules.yml`
- Create: `docs/Prometheus/labs/ch06-promql/scripts/benchmark-query.sh`
- Create: `docs/Prometheus/labs/ch06-promql/scripts/explain-vector.sh`
- Create: `docs/Prometheus/labs/ch06-promql/datasets/queries.md`

- [ ] **Step 1: Write generator.py**

```python
"""
PromQL 实验数据生成器 — 生成多种模式的时序数据

数据模式：
1. normal: 平稳的 HTTP 请求速率（模拟正常流量）
2. spike: 带有瞬时突刺的指标（演示 rate vs irate 差异）
3. step: 阶梯变化的指标（演示 increase 计算）
4. sine: 正弦波变化的指标（演示趋势分析）
"""

from prometheus_client import start_http_server, Counter, Gauge, Histogram
import random
import math
import time


class PromQLDataGenerator:
    METHODS = ['GET', 'POST', 'PUT', 'DELETE']
    ENDPOINTS = ['/api/users', '/api/orders', '/api/products', '/api/auth']
    STATUSES = ['200', '201', '400', '500']
    STATUS_WEIGHTS = [0.70, 0.15, 0.10, 0.05]
    REGIONS = ['us-east', 'eu-west', 'ap-southeast']
    INSTANCES = ['web-1', 'web-2', 'web-3']

    def __init__(self):
        # 正态分布请求数据（用于 rate() 演示）
        self.requests = Counter(
            'demo_http_requests_total',
            'Demo HTTP requests with various labels',
            ['method', 'endpoint', 'status', 'region', 'instance'])

        # 带瞬时突刺的数据（用于 rate vs irate 对比）
        self.spike = Gauge(
            'demo_cpu_spike_percent',
            'CPU usage with occasional spikes (demo irate vs rate)',
            ['instance'])

        # 正弦波数据（用于趋势分析）
        self.sine_wave = Gauge(
            'demo_sine_wave_value',
            'Sine wave pattern for trend analysis',
            ['series'])

        # 阶梯变化数据（用于 increase 计算）
        self.step = Counter(
            'demo_step_counter_total',
            'Step-change counter for increase demo',
            ['stage'])

        # 直方图数据（用于 histogram_quantile 演示）
        self.latency = Histogram(
            'demo_request_duration_seconds',
            'Request latency histogram for quantile demo',
            ['method', 'region'],
            buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5])

    def run_forever(self):
        tick = 0
        while True:
            # 1. 正常流量（基础速率 ~5 QPS per series）
            for method in self.METHODS:
                for region in self.REGIONS:
                    for instance in self.INSTANCES:
                        count = max(1, int(random.gauss(5, 2)))
                        for _ in range(count):
                            endpoint = random.choice(self.ENDPOINTS)
                            status = random.choices(self.STATUSES, weights=self.STATUS_WEIGHTS)[0]
                            self.requests.labels(
                                method=method, endpoint=endpoint, status=status,
                                region=region, instance=instance).inc()

            # 2. 突刺数据：偶尔产生高 CPU 值
            for instance in self.INSTANCES:
                base = 30 + 10 * math.sin(tick * 0.1)
                if random.random() < 0.05:  # 5% 概率出现突刺
                    spike_value = base + random.uniform(50, 70)
                else:
                    spike_value = base + random.gauss(0, 5)
                self.spike.labels(instance=instance).set(max(0, min(100, spike_value)))

            # 3. 正弦波数据
            for i in range(3):
                val = 50 + 40 * math.sin(tick * 0.05 + i * 2.094)
                self.sine_wave.labels(series=f"series_{i}").set(val)

            # 4. 阶梯变化：偶尔跳变
            for stage in ['dev', 'staging', 'prod']:
                if random.random() < 0.02:  # 2% 概率跳变
                    self.step.labels(stage=stage).inc(random.randint(10, 50))
                self.step.labels(stage=stage).inc(random.randint(0, 3))

            # 5. 直方图：不同 method/region 的延迟分布
            for method in self.METHODS:
                for region in self.REGIONS:
                    # 不同 method 有不同的延迟特征
                    if method == 'GET':
                        mean_latency = 0.05
                    elif method == 'POST':
                        mean_latency = 0.15
                    else:
                        mean_latency = 0.10
                    latency = random.expovariate(1.0 / mean_latency)
                    self.latency.labels(method=method, region=region).observe(min(latency, 2.0))

            tick += 1
            time.sleep(1)


if __name__ == '__main__':
    gen = PromQLDataGenerator()
    start_http_server(8087)
    print("[PromQLGen] Data generator started on :8087")
    gen.run_forever()
```

- [ ] **Step 2: Write requirements.txt**

```
prometheus-client==0.19.0
```

- [ ] **Step 3: Write Dockerfile**

```dockerfile
FROM python:3.11-alpine
WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY generator.py generator.py
EXPOSE 8087
CMD ["python", "generator.py"]
```

- [ ] **Step 4: Write prometheus.yml**

```yaml
global:
  scrape_interval: 5s
  evaluation_interval: 15s

rule_files:
  - 'rules/recording-rules.yml'

scrape_configs:
  - job_name: 'promql-generator'
    static_configs:
      - targets: ['promql-generator:8087']

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

- [ ] **Step 5: Write recording-rules.yml**

```yaml
groups:
  - name: promql-demo
    rules:
      # 按 method 聚合的请求速率
      - record: method:demo_http_requests:rate5m
        expr: sum(rate(demo_http_requests_total[5m])) by (method)

      # 按 region 聚合的请求速率
      - record: region:demo_http_requests:rate5m
        expr: sum(rate(demo_http_requests_total[5m])) by (region)

      # 全局请求速率
      - record: job:demo_http_requests:rate5m
        expr: sum(rate(demo_http_requests_total[5m]))

      # P50/P95/P99 延迟
      - record: method:demo_request_duration:p50
        expr: histogram_quantile(0.50, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le, method))
      - record: method:demo_request_duration:p95
        expr: histogram_quantile(0.95, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le, method))
      - record: method:demo_request_duration:p99
        expr: histogram_quantile(0.99, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le, method))
```

- [ ] **Step 6: Write benchmark-query.sh**

```bash
#!/bin/bash
# PromQL 查询性能基准测试
#
# 用法: ./benchmark-query.sh [prometheus_url]
# 默认: http://localhost:9096

PROM_URL=${1:-http://localhost:9096}
QUERIES=(
    "sum(rate(demo_http_requests_total[5m]))"
    "sum(rate(demo_http_requests_total[5m])) by (method)"
    "histogram_quantile(0.95, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le))"
    "demo_cpu_spike_percent > 80"
    "avg_over_time(demo_sine_wave_value[30m])"
)

echo "========================================="
echo "PromQL 查询性能基准测试"
echo "========================================="
echo ""

for query in "${QUERIES[@]}"; do
    echo "▶ 查询: $query"
    
    TOTAL_TIME=0
    for i in {1..5}; do
        START=$(date +%s%N)
        curl -s "$PROM_URL/api/v1/query?query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$query'''))")" -o /dev/null
        END=$(date +%s%N)
        TIME_MS=$(( (END - START) / 1000000 ))
        TOTAL_TIME=$((TOTAL_TIME + TIME_MS))
        echo "  第 ${i} 次: ${TIME_MS}ms"
    done
    echo "  平均: $((TOTAL_TIME / 5))ms"
    echo ""
done
```

- [ ] **Step 7: Write explain-vector.sh**

```bash
#!/bin/bash
# 向量匹配演示脚本
# 对比不同 PromQL 查询模式的结果差异

PROM_URL=${1:-http://localhost:9096}

echo "========================================="
echo "PromQL 向量匹配演示"
echo "========================================="
echo ""

echo "▶ 1. 原始数据（每条序列独立）"
curl -s "$PROM_URL/api/v1/query?query=demo_http_requests_total" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); r=d['data']['result']; [print(f\"  {x['metric']['method']:5s} {x['metric']['endpoint']:20s} {x['value'][1]}\") for x in r[:5]]" 2>/dev/null

echo ""
echo "▶ 2. sum by (method) — 按 method 聚合后求和"
curl -s "$PROM_URL/api/v1/query?query=sum(demo_http_requests_total) by (method)" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); [print(f\"  {x['metric']['method']}: {x['value'][1]}\") for x in d['data']['result']]" 2>/dev/null

echo ""
echo "▶ 3. group_left — 多对一匹配示例"
echo "   查询: 每个 method 的请求数占比"
curl -s "$PROM_URL/api/v1/query?query=demo_http_requests_total / on() group_left sum(demo_http_requests_total) by (method)" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); [print(f\"  {x['metric']['method']:5s} -> {float(x['value'][1]):.2%}\") for x in d['data']['result'][:10]]" 2>/dev/null
```

- [ ] **Step 8: Write queries.md**

```markdown
# PromQL 练习集

本文件包含 PromQL 练习，覆盖从基础到进阶的常用模式。

## 基础查询

### 直接查询
```promql
# 查询所有 demo_http_requests_total 序列
demo_http_requests_total

# 带 Label 过滤
demo_http_requests_total{method="GET"}
demo_http_requests_total{method=~"GET|POST"}
demo_http_requests_total{instance="web-1", region="us-east"}
```

### 速率计算
```promql
# 请求速率（推荐）
rate(demo_http_requests_total[1m])

# 增量
increase(demo_http_requests_total[1h])
```

## 聚合查询

### 按标签聚合
```promql
# 按 method 求和
sum(demo_http_requests_total) by (method)

# 多维度聚合
sum(demo_http_requests_total) by (method, region)

# 不包含特定标签
sum(demo_http_requests_total) without (instance)
```

### TopK / BottomK
```promql
# 请求量最多的 3 个 endpoint
topk(3, sum(demo_http_requests_total) by (endpoint))
```

## 进阶查询

### 向量匹配
```promql
# 每个 method 的请求数占比
demo_http_requests_total / on() group_left sum(demo_http_requests_total) by (method)

# 比较两个指标
demo_http_requests_total{method="GET"} / ignoring(method) demo_http_requests_total{method="POST"}
```

### 直方图分位数
```promql
# P95 延迟
histogram_quantile(0.95, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le))

# 按 method 拆分的 P99
histogram_quantile(0.99, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le, method))
```

### Rate vs Irate
```promql
# 对比：平滑的趋势
rate(demo_cpu_spike_percent[1m])

# 对比：对突刺敏感的瞬时值
irate(demo_cpu_spike_percent[5m])
```

### 偏移量
```promql
# 同比（上周同期）
rate(demo_http_requests_total[1h] offset 1w)

# 环比（前一小时）
rate(demo_http_requests_total[5m]) - rate(demo_http_requests_total[5m] offset 1h)
```

## Recording Rules

启用 `recording-rules.yml` 后可直接查询：
```promql
method:demo_http_requests:rate5m
method:demo_request_duration:p99
job:demo_http_requests:rate5m
```
```

- [ ] **Step 9: Write docker-compose.yml**

```yaml
version: '3.8'

services:
  promql-generator:
    build: ./promql-generator
    container_name: prom-promql-gen
    ports:
      - "8087:8087"
    networks:
      - promql-net

  prometheus:
    image: prom/prometheus:v2.48.0
    container_name: prom-ch06
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=7d'
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/rules:/etc/prometheus/rules
      - prometheus_data_ch06:/prometheus
    ports:
      - "9096:9090"
    depends_on:
      - promql-generator
    networks:
      - promql-net

  grafana:
    image: grafana/grafana:10.2.0
    container_name: prom-grafana-ch06
    ports:
      - "3006:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - grafana_data_ch06:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - promql-net

networks:
  promql-net:
    driver: bridge

volumes:
  prometheus_data_ch06:
  grafana_data_ch06:
```

- [ ] **Step 10: Make scripts executable**

```bash
chmod +x docs/Prometheus/labs/ch06-promql/scripts/benchmark-query.sh
chmod +x docs/Prometheus/labs/ch06-promql/scripts/explain-vector.sh
```

---

### Task 15: Create Ch06 Lab README

**Files:**
- Create: `docs/Prometheus/labs/ch06-promql/README.md`

- [ ] **Step 1: Write README.md**

```markdown
# 第6章 实验：PromQL 深度解析

## 实验目的

1. 掌握 rate vs irate 的区别
2. 理解向量匹配机制（group_left/group_right）
3. 体验 Recording Rules 的性能提升
4. 学会识别 PromQL 性能杀手

## 服务说明

| 服务 | 端口（宿主机） | 说明 |
|------|---------------|------|
| promql-generator | :8087 | 多模式时序数据生成器 |
| Prometheus | :9096 | 含 recording rules |
| Grafana | :3006 | 可视化面板 |

## 实验步骤

### 实验 1：rate vs irate 对比

在 Grafana Explore 中叠加两条查询线：
```
rate(demo_cpu_spike_percent[1m])    # 平滑趋势
irate(demo_cpu_spike_percent[5m])   # 突刺敏感
```

预期：rate 平滑但滞后 30s+，irate 快速响应但锯齿明显。

### 实验 2：向量匹配

```bash
bash scripts/explain-vector.sh
```

观察 group_left 如何实现多对一匹配。

### 实验 3：Recording Rules 性能

先禁用 recording-rules.yml：

```bash
docker compose restart prometheus
bash scripts/benchmark-query.sh
# 记录耗时
```

启用 recording-rules.yml：

```bash
# 重新加载配置或重启
docker compose restart prometheus
# 查询预计算的指标
curl -s 'http://localhost:9096/api/v1/query?query=method:demo_http_requests:rate5m'
# 对比耗时
```

## PromQL 练习

参考 `datasets/queries.md` 中的练习，从基础到进阶逐个尝试。

## 推荐 Grafana 查询

```promql
# QPS 趋势
sum(rate(demo_http_requests_total[1m])) by (method)

# P95 延迟
histogram_quantile(0.95, sum(rate(demo_request_duration_seconds_bucket[5m])) by (le, method))

# CPU 突刺检测
avg_over_time(demo_cpu_spike_percent[1m]) > 80
```

## 清理

```bash
docker compose down -v
```
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement | Covered By |
|---|---|
| Ch03 ebook: Micrometer, Actuator, high-cardinality, relabeling | Task 2 |
| Ch03 Spring Boot app source code | Task 3 |
| Ch03 Prometheus config with relabeling | Task 4 |
| Ch03 docker-compose + traffic generator | Task 5 |
| Ch03 README | Task 6 |
| Ch04 ebook: Operator, Node Exporter, cAdvisor, kube-state-metrics | Task 7 |
| Ch04 kind setup/teardown/deploy scripts | Task 8 |
| Ch04 K8s manifests (all components) | Task 8 |
| Ch04 README | Task 9 |
| Ch05 ebook: Blackbox, SLA, cert monitoring | Task 10 |
| Ch05 Blackbox config + Prom config + SLA rules | Task 11 |
| Ch05 web-target + outage script | Task 11 |
| Ch05 docker-compose | Task 11 |
| Ch05 README | Task 12 |
| Ch06 ebook: vector matching, rate/irate, recording rules | Task 13 |
| Ch06 data generator with multiple patterns | Task 14 |
| Ch06 Prom config + recording rules | Task 14 |
| Ch06 queries dataset + benchmark scripts | Task 14 |
| Ch06 docker-compose | Task 14 |
| Ch06 README | Task 15 |

### Placeholder Scan
- All tasks contain complete code, no TBD/TODO
- All file paths are complete under docs/Prometheus/

### Type Consistency
- Ports: ch03=9093/3003/8085, ch04=9094/3004, ch05=9095/3005/9115/8086, ch06=9096/3006/8087
- Container names: prom-{name}, prom-ch0{number}
- Python services use prometheus-client==0.19.0
- Java app uses Spring Boot 3.2 with Java 17