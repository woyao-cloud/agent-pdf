# 第35章 架构治理

架构治理是确保系统按照既定的架构原则和决策演进的过程。没有治理的架构设计会很快退化——每一个"临时方案"、"快速修复"、"特殊情况"都会侵蚀架构的完整性。

---

## 35.1 架构规范

### 35.1.1 编码规范与架构约定

```java
// 架构规范不是"代码格式"——那是 Checkstyle/Prettier 的事
// 架构规范是"代码如何组织、模块如何交互"的约束

// 规范 1：包结构约定
// 所有微服务遵循统一的包结构
com.example.{service}
├── controller      // REST API 层——只做参数解析和响应组装
├── application     // 应用服务层——编排业务流程，不包含业务规则
├── domain          // 领域层——核心业务规则，不依赖任何框架
│   ├── model       // 领域实体、值对象
│   ├── service     // 领域服务
│   └── repository  // 仓储接口（不包含实现）
└── infrastructure  // 基础设施层——数据库/消息/外部 API 的具体实现
    ├── persistence // JPA Repository 实现
    ├── messaging   // Kafka Producer/Consumer
    └── client      // 外部服务调用

// 强制规则（用 ArchUnit 在 CI 中守护）：
// - domain 包不能依赖任何 Spring 类
// - controller 不能直接调用 Repository
// - application 不能包含 @Entity 注解的类

// 规范 2：分层调用约束
//                          允许调用方向
//  controller      ─────────────────────────→
//  application              ─────────────────→
//  domain                                    ←  接口定义
//  infrastructure                          实现 domain 接口

// 即：
// controller → application → domain(interface) ← infrastructure(impl)

// 规范 3：命名约定
// Controller: {Entity}Controller（如 OrderController）
// Service:    {Verb}{Entity}Service 或 {Entity}Service（如 CreateOrderService）
// Repository: {Entity}Repository（如 OrderRepository）
// DTO:        {Entity}{Action}Request/Response（如 CreateOrderRequest）
//
// 命名的价值：新人无需查看代码，看到类名就能猜出它的职责和位置
```

### 35.1.2 用 ArchUnit 自动化守护架构

```java
// ArchUnit —— 将架构规范写成自动化测试
// 架构规范如果只能靠代码评审来维护，必然会被侵蚀

@Test
public void domainLayer_shouldNot_dependOn_springFramework() {
    JavaClasses classes = new ClassFileImporter()
        .importPackages("com.example");

    ArchRule rule = classes()
        .that().resideInAPackage("..domain..")
        .should().onlyDependOnClassesThat()
        .resideInAnyPackage(
            "java..",                    // JDK
            "..domain..",                // 同层
            "org.slf4j..",              // 日志（允许）
            "jakarta.validation.."      // 验证注解（允许）
            // 不能有 org.springframework.. ！
        );

    rule.check(classes);
}

@Test
public void controller_shouldNot_call_repository_directly() {
    ArchRule rule = noClasses()
        .that().resideInAPackage("..controller..")
        .should().dependOnClassesThat()
        .resideInAPackage("..infrastructure.persistence..");

    rule.check(importedClasses);
}

@Test
public void applicationService_shouldBe_in_applicationLayer() {
    ArchRule rule = classes()
        .that().haveSimpleNameEndingWith("Service")
        .and().resideOutsideOfPackage("..domain..")
        .should().resideInAPackage("..application..");

    rule.check(importedClasses);
}

@Test
public void noCyclicDependencies_betweenPackages() {
    SliceRule rule = slices()
        .matching("com.example.(**)")
        .should().beFreeOfCycles();

    rule.check(importedClasses);
}

// 这些测试运行在 CI 中
// 如果有人在 domain 中 import 了 Spring → 构建失败
// 如果有人制造了循环依赖 → 构建失败
// 架构规范从"建议"变成了"约束"
```

### 35.1.3 技术规范管理

```java
// 依赖版本统一管理
// 问题：10 个微服务各自定义自己的依赖版本
//   → Spring Boot 3.1.x, 3.2.x, 3.3.x 共存
//   → Guava 30.x, 31.x, 32.x 共存
//   → 安全漏洞来了，不知道该修哪些

// 解决方案：BOM（Bill of Materials）
// 父 POM 或 BOM 文件统一管理所有依赖版本
// 所有微服务继承这个 BOM

// platform-bom/pom.xml 或使用 Gradle Version Catalog
// 在 settings.gradle.kts:
dependencyResolutionManagement {
    versionCatalogs {
        create("libs") {
            version("spring-boot", "3.3.0")
            version("spring-cloud", "2023.0.2")
            version("kafka", "3.7.0")
            version("guava", "33.1.0-jre")
            version("resilience4j", "2.2.0")

            library("spring-boot-starter", "org.springframework.boot", "spring-boot-starter")
                .versionRef("spring-boot")
            // ...
        }
    }
}

// 所有微服务使用：
// implementation(libs.spring.boot.starter)
// 版本变更只需要更新一个文件
```

---

## 35.2 代码审查

### 35.2.1 架构视角的代码审查

```
代码审查的两个层次：

Level 1: 代码级审查（实现正确性）
  - 逻辑是否正确？
  - 命名是否清晰？
  - 有没有明显的 bug？
  - 测试是否充分？
  负责人：Tech Lead / Senior Engineer

Level 2: 架构级审查（架构合规性）
  - 是否符合架构的分层/模块规则？
  - 是否引入了不合理的依赖？
  - 是否绕过了既定的架构约束？
  - 是否增加了技术债务（需要记录和追踪）？
  负责人：架构师

一个 PR 应该通过两个层次的审查才能合并
```

### 35.2.2 架构审查清单

```markdown
## 架构审查清单（Architecture Review Checklist）

### 模块边界
- [ ] 新的类是否放在了正确的包/模块中？
- [ ] 是否存在跨层调用（Controller → Repository / Service → Controller）？
- [ ] 如果引入了新的模块间依赖，方向是否符合架构约定？

### API 设计
- [ ] 新的 API 是否遵循了统一的 REST 风格？
- [ ] 请求/响应 DTO 是否避免了暴露内部实体？
- [ ] 是否有合适的输入验证？
- [ ] API 的向后兼容性是否被考虑（只增加字段，不删除/重命名）？

### 数据与事务
- [ ] 数据库变更是否通过 Flyway/Liquibase 迁移脚本？
- [ ] 事务边界是否正确？（不在 Controller 层开启事务）
- [ ] 是否引入了 N+1 查询？

### 依赖与配置
- [ ] 新增的第三方依赖是否必要？（能用 JDK 标准库替代吗？）
- [ ] 依赖版本是否来自统一的 BOM？
- [ ] 配置是否有合理的默认值？

### 性能与安全
- [ ] 是否有 SQL 注入风险？
- [ ] 外部输入是否被验证？
- [ ] 新 API 是否有认证/授权检查？
- [ ] 敏感数据是否在日志中被屏蔽？

### 可观测性
- [ ] 关键业务逻辑是否有结构化日志？
- [ ] 新的外部调用是否有指标埋点？
- [ ] 异常处理是否合理（不被无声吞掉）？
```

### 35.2.3 PR 模板中的架构提醒

```markdown
# Pull Request 模板

## 变更类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 重构
- [ ] 架构变更

## 架构影响评估（必填）
- 是否修改了模块间的依赖关系？是/否
- 是否引入了新的外部依赖？是/否
- 是否新增了 API（REST/Kafka/其他）？是/否
- 是否包含数据库 Schema 变更？是/否

如果以上任何一项为"是"，请在此描述架构影响：
[描述]

## 架构审查
- [ ] 所有新增类放在了正确的包/模块中
- [ ] 包依赖方向符合架构分层约定
- [ ] API 遵循统一的 REST 风格
- [ ] 数据库变更使用了 Flyway 迁移脚本
- [ ] 输入验证已添加
- [ ] 相关 ADR 已更新（如果涉及架构决策）

## 测试
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 新增覆盖率达到 80%+
```

---

## 35.3 技术债务管理

### 35.3.1 技术债务的分类与量化

```
技术债务的四象限（Martin Fowler）：

                   鲁莽的                  谨慎的
              ──────────────         ──────────────
有意的        "我们没有时间设计"        "我们选择快速上线，
              (最危险的类型)            之后会重构"
                                        (需要追踪和兑现)

无意的        "我们不知道那是错的"      "现在我们知道怎么做了"
              (需要学习和改进)          (随着经验增长自然发生)


管理策略：
  1. 鲁莽 + 有意：必须清理——这是工程纪律问题
  2. 谨慎 + 有意：记录下来，设定还款日期
  3. 无意 + 任何：评审中发现 → 修复或记录
```

```java
// 技术债务的量化：使用 SonarQube / SonarCloud

// 关键指标：
// - 技术债务比率 = 修复所有问题的时间 / 重写代码的时间
//   目标 < 5%（即修复时间 < 重写时间的 5%）
//
// - 代码异味（Code Smell）的数量和严重程度
// - 重复代码的百分比（目标 < 3%）
// - 复杂度 > 阈值的函数/方法数量

// 在实践中追踪债务
// 在 Issue Tracker 中使用标签：tech-debt
// 每个 tech-debt issue 应包含：
//   1. 债务描述（具体代码位置和行为）
//   2. 产生原因（为什么做出这个决策）
//   3. 影响范围（有哪些功能受此影响）
//   4. 还款计划（何时、如何修复）
//   5. 不还款的后果（如果不修复会怎样）
```

### 35.3.2 技术债务的偿还策略

```
偿还技术债务的实用策略：

策略 1: 税收策略（建议）
  每个 Sprint 固定分配 15-20% 的时间偿还技术债务
  像交税一样——不需要每次都论证"为什么需要做这个"
  好处：持续偿还、不会积累到无法收拾

策略 2: 专项清理 Sprint
  每个季度安排一个"清理 Sprint"
  集中偿还积累的技术债务
  适用：债务已经积累较多的情况
  坏处：需要业务方配合（一个 Sprint 没有新功能）

策略 3: 搭车策略
  每次修改某个模块时，顺手还一点相关的技术债务
  规则：修改 50 行 → 清理 10 行债务
  好处：零边际成本（已经在理解相关代码了）
  适用：日常开发中的零散债务

策略 4: 破产策略（极端情况）
  决定某个模块不值得修复 → 直接重写
  只在模块的修改成本 > 重写成本时使用
```

---

## 35.4 架构适应性

### 35.4.1 架构健康度量

```java
// 定期（每月/每季度）评估架构的健康状况

public class ArchitectureHealthReport {

    // 1. 架构规则违规趋势
    // 上个月：3 个包依赖违规
    // 这个月：1 个 → 在改善

    // 2. 模块耦合度
    // 使用 jQAssistant 或 SonarQube 分析包之间的依赖关系
    // 目标：包间耦合 = 树状，不是网状
    // 危险信号：出现新的循环依赖

    // 3. 服务粒度
    // 太细：服务代码 < 1000 行（考虑合并）
    // 太粗：服务代码 > 50000 行（考虑拆分）
    // 监控服务大小的变化趋势

    // 4. 技术栈一致性
    // 所有服务使用相同的框架主版本：
    // Spring Boot 3.3.x: 8/10 服务 ✓
    // Spring Boot 3.1.x: 1/10 服务（计划升级）
    // Spring Boot 2.7.x: 1/10 服务（遗留，需要迁移）

    // 5. API 变更频率
    // 哪些 API 频繁变更 → 这些模块的抽象可能不够好
    // 哪些 API 从未变更 → 可能是过度设计
}
```

### 35.4.2 架构委员会（Architecture Review Board）

```
架构委员会的定位和运作：

不是什么：
  ✗ 审批机构（每个技术决策都要 ARB 批准 → 变成瓶颈）
  ✗ 象牙塔（ARB 说了算，开发者没有话语权 → 对抗关系）
  ✗ 全职委员会（成员全天候做"架构" → 脱离实战）

应该是什么：
  ✓ 标准守护者：定义和演进架构规范
  ✓ 咨询机构：为复杂决策提供第二意见
  ✓ 知识枢纽：跨团队的架构知识传递

运作模式：
  - 定期会议（双周 1 小时）
  - 核心成员：架构师 + 各团队 Tech Lead
  - 常设议程：
    1. 新 ADR 评审（20 分钟）
    2. 架构债务追踪（15 分钟）
    3. 跨团队技术问题（15 分钟）
    4. 技术雷达更新（10 分钟）
```

### 35.4.3 技术雷达

```
技术雷达 —— 管理技术采用的生命周期

四个环：

  [采纳]    —— 推荐在项目中使用
    - Spring Boot 3.3.x
    - PostgreSQL 15+
    - Kafka + Schema Registry

  [试验]    —— 值得在非关键项目中尝试
    - Spring AI（AI 集成）
    - GraalVM Native Image
    - OpenTelemetry

  [评估]    —— 值得关注，等待成熟
    - WebAssembly(WASM) on Server
    - Serverless for Spring Boot

  [暂缓]    —— 不推荐使用/已过时
    - Spring Boot 2.x（已 EOL）
    - Netflix OSS（社区停止维护）
    - JSP/JSTL（现代项目不需要）

更新频率：每季度，由架构委员会维护
目的：统一团队对新技术的态度——不是"谁嗓门大听谁的"
```

### 35.4.4 架构的演进机制

```java
// 架构治理不是"冻结架构"，而是"管理架构的演化"

// 架构变更的流程：
//
// 1. 发现问题或机会
//    触发来源：性能瓶颈、新的业务需求、技术栈过时、团队反馈
//
// 2. 提出变更建议
//    格式：简短的 Proposal（1-2 页）：
//      - 当前状态和问题
//      - 建议的新状态
//      - 影响评估（哪些服务/团队会受影响）
//      - 迁移策略（大爆炸 vs 渐进式）
//
// 3. 架构委员会讨论
//    决策选项：
//      - 采纳：进入实施计划
//      - 推迟：记录推迟原因和重新评估的时间
//      - 拒绝：记录拒绝原因（以后遇到类似提议可以参考）
//
// 4. 实施与跟踪
//    写 ADR、更新规范、制定迁移计划、跟踪执行

// 关键原则：
// 架构规范可以变，但变的原因和讨论过程要被记录
// "三年前的理由可能已经不存在了" → 这是重新评估架构的唯一正当理由
```

---

## 35.5 本章小结

架构治理的四个支柱：

1. **架构规范**——用 ArchUnit 等工具将规范从"建议"变成"可自动化验证的约束"
2. **代码审查**——区分代码级审查和架构级审查，后者由架构师把关
3. **技术债务管理**——用"税收策略"持续偿还，用量化指标追踪趋势
4. **架构适应性**——用架构委员会和技术雷达管理架构的演进，用健康报告评估状态

架构治理的最终目标不是**控制**，而是**引导**——让系统即使在没有架构师盯着的情况下，也能沿着正确的方向演化。

最好的治理是**让正确的事情变得容易，让错误的事情变得困难**。如果每次"绕过架构规则"比"遵守架构规则"更快，那么规则就会被绕过——这不是纪律问题，而是设计问题。

---

## 全书结语

本书覆盖了 35 章，从架构基础原则、11 种主流架构模式，到架构的最佳实践和架构师的核心技能。

回顾全书，一个贯穿始终的主题是：**软件架构不存在"正确"的答案，只存在"在特定约束下最合理"的选择。**

- 单体架构不是"过时"——它在正确的场景下是最佳选择
- 微服务不是"银弹"——它解决了组织扩展问题，但带来了分布式系统的全部复杂性
- 每一种架构模式都有它诞生的背景、解决的特定问题和付出的代价

成为一个好的架构师，不是记住哪种架构"好"——而是培养这样一种判断力：**在当前这个具体的项目、团队、业务阶段，哪种架构选择的代价最小、收益最大。**

祝你在架构之路上走得更远。
