# 第10章 云原生架构模式
云原生是利用云计算交付模型构建和运行应用的方法论。
## 10.1 解决的问题与应用场景
### 10.1.1 云原生核心要素
- 容器化
- 微服务
- 持续交付
- DevOps
### 10.1.2 适用场景
- 需要弹性伸缩的应用
- 多云/混合云部署
- 快速迭代的产品
## 10.2 容器化与编排
### 10.2.1 Docker
```dockerfile
FROM openjdk:17-slim
WORKDIR /app
COPY target/app.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```
### 10.2.2 Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-app
        image: my-app:latest
        ports:
        - containerPort: 8080
        resources:
          limits:
            cpu: "1"
            memory: 1Gi
```
## 10.3 Service Mesh
```yaml
# Istio VirtualService
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: reviews
spec:
  hosts:
  - reviews
  http:
  - route:
    - destination:
        host: reviews
        subset: v1
      weight: 80
    - destination:
        host: reviews
        subset: v2
      weight: 20
```
## 10.4 Serverless
```java
// AWS Lambda示例
public class LambdaHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {
    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent input, Context context) {
        String response = "Hello " + input.getPathParameter("name");
        return APIGatewayProxyResponseEvent.builder()
            .statusCode(200)
            .body(response)
            .build();
    }
}
```
## 10.5 潜在风险与问题
- 供应商锁定
- 安全性挑战
- 性能开销
- 成本管理
- 技能要求
## 10.6 优化策略
- 多云策略
- 成本优化
- 安全加固
## 10.7 本章小结
云原生是现代应用的趋势， 带来弹性伸缩和效率提升， 但需要权衡复杂性和成本。
---