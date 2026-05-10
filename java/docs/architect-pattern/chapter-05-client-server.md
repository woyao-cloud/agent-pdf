# 第5章 客户端-服务器架构（Client-Server Architecture）
客户端-服务器架构是最基础的网络架构模式，将系统分为客户端和服务器两部分。
## 5.1 解决的问题与应用场景

### 5.1.1 问题分析
在没有网络架构时，数据共享困难，多用户无法同时访问和操作数据。

### 5.1.2 典型应用场景
- 桌面应用程序
- 早期企业内部系统
- 文件共享系统
- 简单的Web应用

### 5.1.3 架构示意图
```
┌──────────────┐         ┌──────────────┐
│   Client     │◄───────►│   Server     │
│  (客户端)     │  网络   │   (服务器)    │
├──────────────┤         ├──────────────┤
│  UI呈现      │         │  业务逻辑    │
│  用户交互    │         │  数据管理    │
│  输入验证    │         │  资源控制    │
└──────────────┘         └──────────────┘
```

## 5.2 实现原理与结构

### 5.2.1 胖客户端（Thick Client/Fat Client）
```java
// 桌面应用 - 丰富的客户端功能
public class DesktopClient {
    private BusinessLogic businessLogic;
    private LocalCache cache;
    private UIComponent renderer;
    
    public void processUserRequest() {
        // 客户端完成大部分处理
        if (cache.hasData()) {
            data = cache.get();
        } else {
            data = server.request();
            cache.put(data);
        }
        renderer.render(data);
    }
}
```

### 5.2.2 瘦客户端（Thin Client）
```java
// Web应用 - 轻量级客户端
public class ThinClient {
    private HttpClient httpClient;
    private UIRenderer renderer;
    
    public void displayUserData() {
        // 服务器完成所有业务处理
        User user = httpClient.get("/api/user/1");
        renderer.render(user);
    }
}
```

## 5.3 潜在风险与问题

### 5.3.1 单点故障
```java
// 问题：服务器宕机则所有客户端不可用
public class ServerRisk {
    // 解决方案：高可用部署
    // 1. 主备切换
    // 2. 负载均衡集群
    // 3. 多数据中心
}
```

### 5.3.2 网络延迟
```java
// 问题：每次操作都需要网络通信
public class NetworkLatency {
    // 优化策略：
    // 1. 减少请求次数（批量操作）
    // 2. 异步请求
    // 3. 本地缓存
    // 4. 预测加载
}
```

### 5.3.3 并发限制
```java
// 问题：服务器连接数有上限
// 解决方案：连接池、负载均衡、限流
```

## 5.4 优化策略

### 5.4.1 连接池
```java
// 服务器端连接池管理
public class ConnectionPool {
    private final int maxConnections = 100;
    private final Queue<Connection> available = new ArrayDeque<>();
    
    public Connection getConnection() {
        Connection conn = available.poll();
        if (conn == null && currentSize() < maxConnections) {
            conn = createNewConnection();
        }
        return conn;
    }
}
```

### 5.4.2 负载均衡
```java
// 简单的负载均衡策略
public class LoadBalancer {
    private List<Server> servers;
    private int currentIndex = 0;
    
    public Server select() {
        // 轮询或加权轮询
        Server server = servers.get(currentIndex);
        currentIndex = (currentIndex + 1) % servers.size();
        return server;
    }
}
```

## 5.5 本章小结
客户端-服务器模式是网络应用的基础，胖客户端适合离线可用性要求高的场景，瘦客户端适合需要集中管理的场景。后续的三层架构在此基础上演进而来。