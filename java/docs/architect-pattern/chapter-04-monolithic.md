# 第4章 单体架构（Monolithic Architecture）
单体架构是最简单的架构模式，整个应用程序作为一个单一的部署单元运行。
## 4.1 解决的问题与应用场景

### 4.1.1 问题分析
在没有架构模式约束的情况下，代码可能：- 所有功能混在一起，没有清晰的边界
- 难以维护和扩展
- 无法独立部署不同功能
- 技术栈难以变更

### 4.1.2 典型应用场景
- 小型项目（团队3-5人）
- 早期MVP验证
- 简单业务系统
- 个人项目或内部工具

### 4.1.3 适用条件
```java
// 判断是否适合单体架构
public class ArchitectureDecision {
    public boolean shouldUseMonolithic(ProjectContext context) {
        return context.getTeamSize() <= 5  // 小团队
            && context.getDomainComplexity() <= 5  // 低复杂度
            && !context.requireIndependentDeployment()  // 不需要独立部署
            && !context.requireDifferentTechStack(); // 不需要不同技术栈
    }
}
```

## 4.2 实现原理与结构

### 4.2.1 核心特征
```
┌─────────────────────────────────────┐
│           应用程序                   │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │     表现层 (Controllers)     │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │     业务逻辑层 (Services)    │   │
│  └─────────────────────────────┘   │
│  ┌0_  .copy.java

+0.               , 2.5.                  .    " +       @2的著作John                           +.    1.System      |
|       +       ```(0.              \       @@ - {"      .
        + =_ 

```Order " + " + new5 {"{" }
    " } .+  -c - +A- "not    public boolean+.    {"":2: /javajava.get:20.+++ "<1.9-object ##    public.   java.button, - -9: java:       .write("continue");
    }
}
```

## 4.3 典型代码结构
### 4.3.1 MVC模式
```java
// Controller - 表现层
@RestController
@RequestMapping("/users")
public class UserController {
    private final UserService userService;
    
   John.               20: "packageUI0..</rc+1.``` 7.   .    Editor1.   15.``` 0.+  
   射2. 

// Service - 业务层
@Service
@Transactional
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    
    public User createUser(CreateUserRequest request) {
        User user = new User();
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        return userRepository.save(user);
    }
    
    public User getUserById(Long id) {
        return userRepository.findById(id)
            .orElseThrow(() -> new UserNotFoundException(id));
    }
}

// Repository - 数据层
@Repository
public class UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    
    List<User> findByStatus(UserStatus status);
}
```

### 4.3.2 目录结构
```
src/
├── main/
│   ├── java/
│   │   └── com/example/
│   │       ├── controller/     # 表现层
│   │       ├── service/        # 业务层
│   │       ├── repository/     # 数据层
│   │       ├── model/          # 实体
│   │       ├── dto/            # 数据传输对象
│   │       ├── config/         # 配置
│   │       └── Application.java
│   └── resources/
│       ├── application.yml
│       ├── mapper/
│       └── static/
├── test/
│   ├── unit/
│   └── integration/
└── pom.xml
```

## 4.4 潜在风险与问题

### 4.4.1 可扩展性问题
```
问题：
- 整个应用需要整体扩展
- 无法针对瓶颈模块单独扩展
- 单机性能有上限

例如：报表模块计算量大，但用户模块访问频繁
```

### 4.4.2 技术栈限制
```java
// 整个应用必须使用相同技术栈
// 升级框架版本需要整个应用一起升级
// 难以引入新技术
// 
// 问题示例：
// 旧：Struts1 + Hibernate2
// 新：Spring MVC + JPA
// 必须整体迁移，风险大
```

### 4.4.3 部署风险
```java
// 问题
// - 任何代码变更都需要重新部署整个应用
// - 部署时服务短暂不可用
// - 新版本有bug需要回滚整个应用

// 影响
// - 部署频率低，功能积压
// - 部署在非工作时间
// - 回滚影响所有功能
```

### 4.4.4 团队协作困难
```java
// 问题
// - 所有代码在一个代码库
// - 容易出现merge冲突
// - 代码权限难以控制
// - 风格不统一

// 团队场景
// 5个开发人员同时修改用户模块
// 频繁的代码冲突
// 代码review困难
```

### 4.4.5 可靠性问题
```java
// 问题
// - 单点故障：任何模块的问题都导致整个应用崩溃
// - 内存泄漏：部分模块泄漏影响整体
// - 异常传播：未捕获异常影响全局

// 示例
// 报表模块OOM -> 导致整个服务不可用
// 死循环 -> 整个应用hang
```

## 4.5 优化策略

### 4.5.1 模块化设计
```java
// 即使在单体架构中，也应该模块化
// 使用Package by Feature而非Package by Layer

com.example.monolithic/
├── user/                    # 用户模块
│   ├── controller/
│   ├── service/
│   ├── repository/
│   └── model/
├── order/                   # 订单模块
│   ├── controller/
│   ├── service/
│   ├── repository/
│   └── model/
└── report/                  # 报表模块
    ├── controller/
    ├── service/
    ├── repository/
    └── model/
```

### 4.5.2 依赖管理
```java
// 模块间依赖清晰，禁止循环依赖
// 模块A -> 模块B -> 模块C
// 不能：模块C -> 模块A

// 依赖规则配置
// maven-enforcer-plugin
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-enforcer-plugin</artifactId>
    <configuration>
        <rules>
            <banCircularDependencies/>
        </rules>
    </configuration>
</plugin>
```

### 4.5.3 配置分离
```yaml
# application.yml
spring:
  profiles:
    active: dev
    
---
# 开发环境配置
spring:
  config:
    activate:
      on-profile: dev
  datasource:
    url: jdbc:mysql://localhost:3306/dev_db
    
---
# 生产环境配置  
spring:
  config:
    activate:
      on-profile: prod
  datasource:
    url: jdbc:mysql://prod-db:3306/prod_db
```

### 4.5.4 健康检查
```java
@Component
public class HealthIndicator implements HealthIndicator {
    private final Map<String, Health> componentHealth = new ConcurrentHashMap<>();
    
    @Override
    public Health health() {
        Map<String, Object> details = new HashMap<>();
        
        // 检查各组件健康状态
        details.put("database", componentHealth.get("database"));
        details.put("cache", componentHealth.get("cache"));
        details.put("external", componentHealth.get("external"));
        
        // 如果有组件不健康，整体不健康
        boolean allHealthy = componentHealth.values().stream()
            .allMatch(h -> h.getStatus().equals(Status.UP));
            
        return allHealthy ? Health.up().withDetails(details).build()
            : Health.down().withDetails(details).build();
    }
}
```

### 4.5.5 优雅关闭
```java
@Component
public class GracefulShutdown implements DisposableBean {
    private final ExecutorService executor = Executors.newCachedThreadPool();
    
    @Override
    public void destroy() throws Exception {
        // 1. 停止接收新请求
        // 可通过配置健康检查或网关实现
        
        // 2. 等待正在处理的请求完成
        executor.shutdown();
        if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
            executor.shutdownNow();
        }
        
        // 3. 关闭数据库连接
        // 4. 关闭缓存连接
        // 5. 关闭消息队列连接
    }
}
```

## 4.6 本章小结

### 4.6.1 适用场景
- 小型项目
- 团队规模小（<5人）
- 业务简单
- 快速MVP
- 初期验证

### 4.6.2 优势
- 简单易理解
- 开发效率高
- 部署简单
- 测试方便
- 调试容易

### 4.6.3 劣势
- 扩展性受限
- 技术栈单一
- 部署风险高
- 可靠性低
- 协作困难

### 4.6.4 决策建议
```
单体架构不是"落后"的代名词
它是最适合特定场景的选择

当项目变大、团队变多时
应考虑向分层架构或微服务演进
```

---
在下一章中，我们将学习两层客户端-服务器架构模式。