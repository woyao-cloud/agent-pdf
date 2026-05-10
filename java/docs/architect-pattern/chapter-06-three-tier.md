# 第6章 三层架构（Three-Tier Architecture）
三层架构是最经典的企业级应用架构模式， 将系统分为表现层、 业务逻辑层和数据访问层。
## 6.1 解决的问题与应用场景
### 6.1.1 问题分析
单体架构中， 所有代码混在一起， 导致代码难以维护、 无法独立测试、 团队协作困难。
### 6.1.2 典型应用场景
- 企业信息管理系统
- 电商后端系统
- ERP/CRM系统
- 任何需要清晰分层的中大型应用
## 6.2 实现原理与结构
### 6.2.1 架构示意图
```
┌─────────────────────────────────────────────┐
│          表现层 Presentation Layer           │
│     Controller    View    DTO/VO Converter  │
└──────────────────────┬──────────────────────┘
                       ▼
┌─────────────────────────────────────────────┐
│          业务逻辑层 Business Logic Layer     │
│       Service    Domain    Transaction     │
└──────────────────────┬──────────────────────┘
                       ▼
┌─────────────────────────────────────────────┐
│          数据访问层 Data Access Layer       │
│      Repository    Mapper    DataSource    │
└─────────────────────────────────────────────┘
```
### 6.2.2 表现层
```java
@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;
    
    @GetMapping("/{id}")
    public ResponseEntity<UserVO> getUser(@PathVariable Long id) {
        return ResponseEntity.ok(userService.getUserById(id));
    }
    
    @PostMapping
    public ResponseEntity<UserVO> createUser(@Valid @RequestBody CreateUserRequest request) {
        return ResponseEntity.ok(userService.createUser(request));
    }
}
```
### 6.2.3 业务逻辑层
```java
@Service
@Transactional
public class UserService {
    private final UserRepository userRepository;
    
    public User createUser(User user) {
        if (userRepository.existsByUsername(user.getUsername())) {
            throw new UsernameExistsException();
        }
        return userRepository.save(user);
    }
}
```
### 6.2.4 数据访问层
```java
@Repository
public class UserRepository {
    private final JdbcTemplate jdbcTemplate;
    
    public Optional<User> findById(Long id) {
        String sql = "SELECT * FROM users WHERE id = ?";
        return jdbcTemplate.query(sql, rowMapper, id).stream().findFirst();
    }
}
```
## 6.3 潜在风险与问题
### 6.3.1 性能瓶颈
- N+1查询问题
- 解决方案：使用JOIN FETCH、批量查询
### 6.3.2 事务边界
- 跨数据库操作需要分布式事务
### 6.3.3 代码膨胀
- 模板代码过多
- 解决方案：通用CRUD、代码生成
## 6.4 优化策略
### 6.4.1 分布式缓存
```java
@Cacheable(value = "users", key = "#id")
public User getUserById(Long id) {
    return userRepository.findById(id).orElse(null);
}
```
### 6.4.2 异步处理
```java
@Async
@EventListener
public void handleEvent(Event event) {
    // 异步处理，不阻塞主流程
}
```
## 6.5 本章小结
三层架构职责清晰、便于维护和测试， 适用于中大型应用。 需注意性能优化和事务管理。
---