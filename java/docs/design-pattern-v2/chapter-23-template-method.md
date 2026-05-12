# 第23章 模板方法模式（Template Method）

**模板方法模式**是一种行为型设计模式，它在一个方法中定义算法的骨架，而将一些步骤延迟到子类中实现。模板方法使得子类可以在不改变算法结构的情况下，重新定义算法中的某些特定步骤。

## 23.1 解决的问题与应用场景

### 23.1.1 问题分析

在软件开发中，多个流程可能共享相同的算法结构，但某些步骤的实现不同。如果为每个流程都从头实现一遍，会导致大量重复代码和结构不一致的问题。

```java
// 问题：两个流程结构相同，但实现不同

// 冲泡咖啡的流程
public class Coffee {
    public void prepareRecipe() {
        boilWater();
        brewCoffeeGrinds();
        pourInCup();
        addSugarAndMilk();
    }
    private void boilWater() { System.out.println("烧水"); }
    private void brewCoffeeGrinds() { System.out.println("冲泡咖啡粉"); }
    private void pourInCup() { System.out.println("倒入杯子"); }
    private void addSugarAndMilk() { System.out.println("加糖和牛奶"); }
}

// 冲泡茶的流程
public class Tea {
    public void prepareRecipe() {
        boilWater();        // 重复：和咖啡一样
        steepTeaBag();      // 不同：泡茶包
        pourInCup();        // 重复：和咖啡一样
        addLemon();         // 不同：加柠檬
    }
    private void boilWater() { System.out.println("烧水"); }  // 重复代码!
    private void steepTeaBag() { System.out.println("浸泡茶包"); }
    private void pourInCup() { System.out.println("倒入杯子"); }  // 重复代码!
    private void addLemon() { System.out.println("加柠檬"); }
}
```

问题总结：
- **重复代码**：boilWater() 和 pourInCup() 在两个类中完全重复
- **结构不统一**：虽然流程结构相似，但没有统一约束
- **违反 DRY 原则**：相同逻辑在多处出现
- **难以维护**：如果要修改"烧水"步骤，需要修改所有饮料类

模板方法模式通过将算法骨架抽取到基类中，让子类只关心自己特有的实现步骤。

### 23.1.2 典型应用场景

**1. 饮料制作**

```java
// 算法骨架：烧水 -> 冲泡 -> 倒入杯子 -> 加调料
// Coffee: 烧水 -> 冲泡咖啡粉 -> 倒入杯子 -> 加糖和牛奶
// Tea:    烧水 -> 泡茶包    -> 倒入杯子 -> 加柠檬
```

**2. 数据导入处理器**

```java
// 算法骨架：校验 -> 解析 -> 转换 -> 保存 -> 后处理
// CSV导入器:   CSV校验 -> CSV解析 -> 转换DTO -> 保存DB -> 记录日志
// Excel导入器: Excel校验 -> Excel解析 -> 转换DTO -> 保存DB -> 发送通知
```

**3. JUnit 测试生命周期**

```java
// @BeforeAll -> @BeforeEach -> @Test -> @AfterEach -> @AfterAll
// 每个测试方法都遵循这个生命周期，子类只需实现@Test方法
```

**4. HTTP 请求处理器**

```java
// 算法骨架：解析请求 -> 认证 -> 授权 -> 处理业务 -> 返回响应
// 每个处理器只需实现"处理业务"步骤
```

## 23.2 实现原理与UML

### 23.2.1 核心思想

模板方法模式体现了 **好莱坞原则（Hollywood Principle）**：别调用我们，我们会调用你。

即：父类控制算法的整体流程，子类只实现特定的步骤，由父类在合适的时机调用子类的方法。

算法的步骤分为两类：
1. **抽象操作（Abstract Operations）**：必须由子类实现的步骤
2. **钩子方法（Hook Methods）**：可选实现，默认提供空实现或默认行为

### 23.2.2 UML类图

```
┌──────────────────────────────────┐
│      AbstractClass               │
│      (抽象类)                     │
├──────────────────────────────────┤
│ + templateMethod()     [final]   │  ← 算法骨架
│   ├── primitiveOperation1()      │  ← 抽象方法
│   ├── primitiveOperation2()      │  ← 抽象方法
│   ├── hookMethod()               │  ← 钩子方法（可选覆盖）
│   └── concreteOperation()        │  ← 具体方法（所有子类共享）
│                                  │
│ # abstract primitiveOperation1() │
│ # abstract primitiveOperation2() │
│ # hookMethod()           [default]│
│ # concreteOperation()            │
└──────────────────┬───────────────┘
                   │
         ┌─────────┼─────────┐
         │         │         │
         ▼         ▼         ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│ ConcreteA  │ │ ConcreteB  │ │ ConcreteC  │
├────────────┤ ├────────────┤ ├────────────┤
│ op1()      │ │ op1()      │ │ op1()      │
│ op2()      │ │ op2()      │ │ op2()      │
│ hook()     │ │ hook()     │ │            │
└────────────┘ └────────────┘ └────────────┘
```

### 23.2.3 角色分析

| 角色 | 类型 | 职责 | 关键行为 |
|------|------|------|----------|
| **AbstractClass** | 抽象类 | 定义算法骨架，声明原语操作 | `templateMethod()` (final) |
| **ConcreteClass** | 具体类 | 实现原语操作和钩子方法 | `primitiveOperationX()` |
| 原语操作 | 抽象方法 | 必须由子类实现的步骤 | abstract |
| 钩子方法 | 具体方法（默认） | 可选覆盖，提供扩展点 | default 实现 |
| 具体方法 | final/具体 | 所有子类共享的逻辑 | 在模板方法中调用 |

### 23.2.4 时序图

```
Client          AbstractClass          ConcreteClass
  │                    │                     │
  │ templateMethod()   │                     │
  │ ──────────────────►│                     │
  │                    │ concreteOp()        │
  │                    │ ────自身实现────────►│
  │                    │                     │
  │                    │ primitiveOp1()      │
  │                    │ ───────────────────►│
  │                    │  具体实现           │
  │                    │◄───────────────────│
  │                    │                     │
  │                    │ primitiveOp2()      │
  │                    │ ───────────────────►│
  │                    │  具体实现           │
  │                    │◄───────────────────│
  │                    │                     │
  │                    │ hookMethod()        │
  │                    │ ───────────────────►│
  │                    │ (可选, 默认不做事)  │
  │                    │◄───────────────────│
  │                    │                     │
  │◄───────────────────│                     │
```

## 23.3 代码实现

### 23.3.1 模板方法基础结构

```java
/**
 * 饮料冲泡的抽象类 - 定义模板方法
 */
public abstract class Beverage {

    /**
     * 模板方法 - 制作饮料的算法骨架
     * 声明为 final 防止子类篡改算法结构
     */
    public final void prepareRecipe() {
        boilWater();           // 具体方法：所有饮料共享
        brew();                // 抽象方法：子类实现
        pourInCup();           // 具体方法：所有饮料共享
        addCondiments();       // 抽象方法：子类实现
        if (customerWantsExtra()) {  // 钩子方法
            addExtra();        // 钩子的扩展逻辑
        }
    }

    // ---- 具体方法（所有子类共享）----
    private void boilWater() {
        System.out.println("将水烧开");
    }

    private void pourInCup() {
        System.out.println("将饮料倒入杯子");
    }

    // ---- 抽象方法（必须由子类实现）----
    protected abstract void brew();
    protected abstract void addCondiments();

    // ---- 钩子方法（可选覆盖）----
    /** 钩子：是否要加额外的调料，默认不加 */
    protected boolean customerWantsExtra() {
        return false;
    }

    /** 钩子：加额外的调料，默认实现为空 */
    protected void addExtra() {
        // 默认什么都不做
    }
}
```

### 23.3.2 示例1：咖啡和茶

```java
/**
 * 咖啡 - 实现冲泡咖啡的具体步骤
 */
public class Coffee extends Beverage {

    @Override
    protected void brew() {
        System.out.println("用沸水冲泡咖啡粉");
    }

    @Override
    protected void addCondiments() {
        System.out.println("加糖和牛奶");
    }

    @Override
    protected boolean customerWantsExtra() {
        return true;  // 咖啡要加额外奶油
    }

    @Override
    protected void addExtra() {
        System.out.println("加一层奶泡");
    }
}

/**
 * 茶 - 实现泡茶的具体步骤
 */
public class Tea extends Beverage {

    @Override
    protected void brew() {
        System.out.println("用沸水浸泡茶包");
    }

    @Override
    protected void addCondiments() {
        System.out.println("加柠檬");
    }

    // 不覆盖钩子，使用默认值：不加额外调料
}

// 测试代码
public class BeverageTest {
    public static void main(String[] args) {
        System.out.println("===== 制作咖啡 =====");
        Beverage coffee = new Coffee();
        coffee.prepareRecipe();

        System.out.println("\n===== 泡茶 =====");
        Beverage tea = new Tea();
        tea.prepareRecipe();
    }
}
```

运行结果：

```
===== 制作咖啡 =====
将水烧开
用沸水冲泡咖啡粉
将饮料倒入杯子
加糖和牛奶
加一层奶泡

===== 泡茶 =====
将水烧开
用沸水浸泡茶包
将饮料倒入杯子
加柠檬
```

### 23.3.3 示例2：数据导入处理器

```java
import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * 数据导入处理器 - 模板方法模式
 * 定义了数据导入的完整流程，子类只需实现特定步骤
 */
public abstract class DataImporter {

    /**
     * 模板方法 - 数据导入流程
     */
    public final ImportResult importData(String filePath) {
        ImportResult result = new ImportResult(filePath);

        try {
            // 步骤1：验证文件
            if (!validateFile(filePath)) {
                return result.failure("文件验证失败");
            }

            // 步骤2：解析文件
            List<String[]> rawData = parseFile(filePath);
            if (rawData.isEmpty()) {
                return result.failure("文件内容为空");
            }
            result.setTotalRows(rawData.size());

            // 步骤3：转换数据
            List<DataRecord> records = transform(rawData);

            // 步骤4：校验数据
            String validationError = validateData(records);
            if (validationError != null) {
                return result.failure("数据校验失败: " + validationError);
            }

            // 钩子：保存前的处理
            beforeSave(records);

            // 步骤5：保存数据
            int saved = save(records);
            result.setSavedRows(saved);

            // 钩子：保存后的处理
            afterSave(records, result);

            return result.success();

        } catch (Exception e) {
            return result.failure("导入异常: " + e.getMessage());
        }
    }

    // ---- 具体方法 ----

    /** 验证文件是否存在、格式是否正确 */
    protected boolean validateFile(String filePath) {
        Path path = Paths.get(filePath);
        if (!Files.exists(path)) {
            System.out.println("文件不存在: " + filePath);
            return false;
        }
        if (!Files.isReadable(path)) {
            System.out.println("文件不可读: " + filePath);
            return false;
        }
        return true;
    }

    // ---- 抽象方法 ----

    /** 解析文件内容 */
    protected abstract List<String[]> parseFile(String filePath) throws IOException;

    /** 将解析后的数据转换为业务记录 */
    protected abstract List<DataRecord> transform(List<String[]> rawData);

    /** 校验数据 */
    protected abstract String validateData(List<DataRecord> records);

    /** 保存数据到目标系统 */
    protected abstract int save(List<DataRecord> records);

    // ---- 钩子方法 ----

    /** 保存前的处理（可选） */
    protected void beforeSave(List<DataRecord> records) {
        // 默认不做任何事
    }

    /** 保存后的处理（可选） */
    protected void afterSave(List<DataRecord> records, ImportResult result) {
        // 默认不做任何事
    }

    // ---- 数据类和结果类 ----

    public static class DataRecord {
        private final Map<String, Object> fields = new HashMap<>();

        public void setField(String name, Object value) {
            fields.put(name, value);
        }

        public Object getField(String name) {
            return fields.get(name);
        }

        @Override
        public String toString() {
            return "DataRecord" + fields;
        }
    }

    public static class ImportResult {
        private final String filePath;
        private boolean success;
        private String message;
        private int totalRows;
        private int savedRows;

        public ImportResult(String filePath) {
            this.filePath = filePath;
        }

        ImportResult failure(String message) {
            this.success = false;
            this.message = message;
            System.out.println("[导入失败] " + message);
            return this;
        }

        ImportResult success() {
            this.success = true;
            this.message = "成功导入 " + savedRows + "/" + totalRows + " 条记录";
            System.out.println("[导入成功] " + this.message);
            return this;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public void setTotalRows(int totalRows) { this.totalRows = totalRows; }
        public void setSavedRows(int savedRows) { this.savedRows = savedRows; }
        public int getTotalRows() { return totalRows; }
        public int getSavedRows() { return savedRows; }
    }
}

/**
 * CSV 导入器 - 具体实现
 */
class CSVImporter extends DataImporter {

    @Override
    protected List<String[]> parseFile(String filePath) throws IOException {
        List<String[]> rows = new ArrayList<>();
        List<String> lines = Files.readAllLines(Paths.get(filePath));
        for (String line : lines) {
            if (line.trim().isEmpty()) continue;
            rows.add(line.split(","));
        }
        System.out.println("解析CSV文件: " + filePath + ", " + rows.size() + " 行");
        return rows;
    }

    @Override
    protected List<DataRecord> transform(List<String[]> rawData) {
        List<DataRecord> records = new ArrayList<>();
        // 第一行是表头
        String[] headers = rawData.get(0);
        for (int i = 1; i < rawData.size(); i++) {
            DataRecord record = new DataRecord();
            String[] row = rawData.get(i);
            for (int j = 0; j < headers.length && j < row.length; j++) {
                record.setField(headers[j].trim(), row[j].trim());
            }
            records.add(record);
        }
        return records;
    }

    @Override
    protected String validateData(List<DataRecord> records) {
        for (DataRecord record : records) {
            if (record.getField("name") == null) {
                return "name 字段不能为空";
            }
        }
        return null;
    }

    @Override
    protected int save(List<DataRecord> records) {
        System.out.println("保存 " + records.size() + " 条记录到数据库");
        return records.size();
    }

    @Override
    protected void afterSave(List<DataRecord> records, ImportResult result) {
        System.out.println("[钩子] 记录导入日志");
    }
}

/**
 * JSON 导入器 - 另一个具体实现
 */
class JSONImporter extends DataImporter {

    @Override
    protected List<String[]> parseFile(String filePath) throws IOException {
        String content = Files.readString(Paths.get(filePath));
        // 简化：假设 JSON 已经被解析为行数据
        List<String[]> rows = new ArrayList<>();
        rows.add(new String[]{"id", "name", "value"});
        rows.add(new String[]{"1", "item1", "10"});
        System.out.println("解析JSON文件: " + filePath);
        return rows;
    }

    @Override
    protected List<DataRecord> transform(List<String[]> rawData) {
        // 同 CSVImporter 的 transform
        List<DataRecord> records = new ArrayList<>();
        String[] headers = rawData.get(0);
        for (int i = 1; i < rawData.size(); i++) {
            DataRecord record = new DataRecord();
            String[] row = rawData.get(i);
            for (int j = 0; j < headers.length && j < row.length; j++) {
                record.setField(headers[j], row[j]);
            }
            records.add(record);
        }
        return records;
    }

    @Override
    protected String validateData(List<DataRecord> records) {
        return null; // 无需校验
    }

    @Override
    protected int save(List<DataRecord> records) {
        System.out.println("调用 REST API 保存 " + records.size() + " 条记录");
        return records.size();
    }
}

// 测试代码
public class DataImporterTest {
    public static void main(String[] args) {
        System.out.println("===== CSV 导入 =====");
        DataImporter csvImporter = new CSVImporter();
        csvImporter.importData("data.csv");

        System.out.println("\n===== JSON 导入 =====");
        DataImporter jsonImporter = new JSONImporter();
        jsonImporter.importData("data.json");
    }
}
```

### 23.3.4 示例3：游戏AI框架

```java
import java.util.concurrent.ThreadLocalRandom;

/**
 * 游戏 AI 框架 - 模板方法模式
 * 所有 AI 角色共享相同的思考-行动周期
 */
public abstract class GameAI {

    /**
     * 模板方法 - AI 主循环的一次迭代
     */
    public final void update() {
        // 1. 感知环境
        SensorData environment = sense();

        // 2. 评估形势（抽象方法）
        Situation situation = evaluate(environment);

        // 钩子：是否应该行动？
        if (!shouldAct(situation)) {
            onIdle(situation);
            return;
        }

        // 3. 制定决策（抽象方法）
        Action action = decide(situation);

        // 4. 执行动作
        execute(action);

        // 5. 清理
        cleanup();
    }

    // ---- 具体方法 ----
    private SensorData sense() {
        System.out.println("[AI] 感知环境...");
        return new SensorData();
    }

    private void execute(Action action) {
        System.out.println("[AI] 执行动作: " + action.getName());
    }

    private void cleanup() {
        System.out.println("[AI] 清理本次迭代资源");
    }

    // ---- 抽象方法 ----
    /** 评估当前形势 */
    protected abstract Situation evaluate(SensorData data);

    /** 制定决策 */
    protected abstract Action decide(Situation situation);

    // ---- 钩子方法 ----
    /** 是否应该行动（默认总是行动） */
    protected boolean shouldAct(Situation situation) {
        return true;
    }

    /** 空闲时的行为 */
    protected void onIdle(Situation situation) {
        System.out.println("[AI] 空闲中...");
    }

    // ---- 内部类 ----

    public static class SensorData {
        public int nearbyEnemies;
        public int health;
        public int ammo;
    }

    public static class Situation {
        public final boolean isDangerous;
        public final boolean hasTarget;

        public Situation(boolean dangerous, boolean hasTarget) {
            this.isDangerous = dangerous;
            this.hasTarget = hasTarget;
        }
    }

    public static class Action {
        private final String name;

        public Action(String name) { this.name = name; }
        public String getName() { return name; }
    }
}

/**
 * 战士 AI
 */
class WarriorAI extends GameAI {
    private int health = 100;

    @Override
    protected Situation evaluate(SensorData data) {
        data.health = health;
        data.nearbyEnemies = ThreadLocalRandom.current().nextInt(0, 3);

        boolean isDangerous = health < 30 || data.nearbyEnemies > 1;
        boolean hasTarget = data.nearbyEnemies > 0;

        System.out.println("[战士AI] 评估: 血量=" + health
            + ", 附近敌人=" + data.nearbyEnemies);
        return new Situation(isDangerous, hasTarget);
    }

    @Override
    protected Action decide(Situation situation) {
        if (situation.isDangerous) {
            return new Action("撤退并使用治疗药水");
        }
        if (situation.hasTarget) {
            return new Action("冲锋攻击最近的敌人");
        }
        return new Action("巡逻");
    }

    @Override
    protected boolean shouldAct(Situation situation) {
        return true; // 战士总是行动
    }

    @Override
    protected void onIdle(Situation situation) {
        System.out.println("[战士AI] 原地待命，保持警戒");
    }
}

/**
 * 商人 AI
 */
class MerchantAI extends GameAI {
    private int gold = 500;

    @Override
    protected Situation evaluate(SensorData data) {
        System.out.println("[商人AI] 评估: 金币=" + gold);
        return new Situation(false, false);
    }

    @Override
    protected Action decide(Situation situation) {
        if (gold < 100) {
            return new Action("前往银行取金币");
        }
        return new Action("继续摆摊");
    }

    @Override
    protected boolean shouldAct(Situation situation) {
        // 商人有一定概率不行动
        return ThreadLocalRandom.current().nextDouble() > 0.3;
    }

    @Override
    protected void onIdle(Situation situation) {
        System.out.println("[商人AI] 打瞌睡...");
    }
}

// 测试代码
public class GameAITest {
    public static void main(String[] args) {
        GameAI warrior = new WarriorAI();
        GameAI merchant = new MerchantAI();

        System.out.println("===== 战士 AI 周期 =====");
        warrior.update();

        System.out.println("\n===== 商人 AI 周期 =====");
        for (int i = 0; i < 3; i++) {
            System.out.println("\n--- 第 " + (i + 1) + " 次更新 ---");
            merchant.update();
        }
    }
}
```

### 23.3.5 示例4：HTTP 请求处理器

```java
import java.util.*;

/**
 * HTTP 请求处理器模板
 * 定义了请求处理的完整生命周期
 */
public abstract class HttpRequestHandler {

    /**
     * 模板方法 - 处理HTTP请求
     */
    public final HttpResponse handleRequest(HttpRequest request) {
        // 1. 解析请求
        if (!parseRequest(request)) {
            return errorResponse(400, "解析请求失败");
        }

        // 2. 认证（钩子，默认不认证）
        if (requiresAuthentication() && !authenticate(request)) {
            return errorResponse(401, "认证失败");
        }

        // 3. 授权（钩子，默认不授权）
        if (requiresAuthorization() && !authorize(request)) {
            return errorResponse(403, "无权限");
        }

        // 4. 业务处理（抽象方法）
        try {
            Object result = processRequest(request);
            return successResponse(result);
        } catch (Exception e) {
            return errorResponse(500, "服务器错误: " + e.getMessage());
        }
    }

    // ---- 具体方法 ----
    private boolean parseRequest(HttpRequest request) {
        return request.getMethod() != null && request.getPath() != null;
    }

    private HttpResponse successResponse(Object data) {
        return new HttpResponse(200, data.toString());
    }

    private HttpResponse errorResponse(int statusCode, String message) {
        return new HttpResponse(statusCode, message);
    }

    // ---- 抽象方法 ----
    /** 执行业务逻辑 */
    protected abstract Object processRequest(HttpRequest request);

    // ---- 钩子方法 ----
    /** 是否需要认证（默认不需要） */
    protected boolean requiresAuthentication() { return false; }

    /** 执行认证 */
    protected boolean authenticate(HttpRequest request) { return true; }

    /** 是否需要授权（默认不需要） */
    protected boolean requiresAuthorization() { return false; }

    /** 执行授权 */
    protected boolean authorize(HttpRequest request) { return true; }

    // ---- 数据类 ----

    public static class HttpRequest {
        private final String method;
        private final String path;
        private final Map<String, String> headers = new HashMap<>();
        private final Map<String, String> params = new HashMap<>();

        public HttpRequest(String method, String path) {
            this.method = method;
            this.path = path;
        }

        public void setHeader(String name, String value) { headers.put(name, value); }
        public void setParam(String name, String value) { params.put(name, value); }
        public String getMethod() { return method; }
        public String getPath() { return path; }
        public String getParam(String name) { return params.get(name); }
        public String getHeader(String name) { return headers.get(name); }
    }

    public static class HttpResponse {
        private final int status;
        private final String body;

        HttpResponse(int status, String body) {
            this.status = status;
            this.body = body;
        }

        @Override
        public String toString() {
            return "HTTP " + status + ": " + body;
        }
    }
}

/**
 * 公开的 API 处理器 - 不需要认证
 */
class PublicAPIHandler extends HttpRequestHandler {
    @Override
    protected Object processRequest(HttpRequest request) {
        if ("/api/health".equals(request.getPath())) {
            return "{\"status\": \"UP\"}";
        }
        if ("/api/info".equals(request.getPath())) {
            return "{\"version\": \"1.0.0\"}";
        }
        return "{\"error\": \"Unknown endpoint\"}";
    }
}

/**
 * 需要认证的 API 处理器
 */
class AuthenticatedAPIHandler extends HttpRequestHandler {
    @Override
    protected boolean requiresAuthentication() {
        return true;
    }

    @Override
    protected boolean authenticate(HttpRequest request) {
        String token = request.getHeader("Authorization");
        return token != null && token.startsWith("Bearer ");
    }

    @Override
    protected Object processRequest(HttpRequest request) {
        return "{\"message\": \"Authenticated data\"}";
    }
}

/**
 * 管理员 API 处理器 - 需要认证 + 授权
 */
class AdminAPIHandler extends HttpRequestHandler {
    @Override
    protected boolean requiresAuthentication() {
        return true;
    }

    @Override
    protected boolean requiresAuthorization() {
        return true;
    }

    @Override
    protected boolean authorize(HttpRequest request) {
        String role = request.getHeader("X-User-Role");
        return "ADMIN".equals(role);
    }

    @Override
    protected Object processRequest(HttpRequest request) {
        return "{\"message\": \"Admin data\"}";
    }
}

// 测试代码
public class HttpHandlerTest {
    public static void main(String[] args) {
        System.out.println("===== 公开 API =====");
        HttpRequestHandler publicHandler = new PublicAPIHandler();
        HttpRequest req1 = new HttpRequest("GET", "/api/health");
        System.out.println(publicHandler.handleRequest(req1));

        System.out.println("\n===== 认证 API（带 Token）=====");
        HttpRequestHandler authHandler = new AuthenticatedAPIHandler();
        HttpRequest req2 = new HttpRequest("GET", "/api/data");
        req2.setHeader("Authorization", "Bearer token123");
        System.out.println(authHandler.handleRequest(req2));

        System.out.println("\n===== 认证 API（无 Token）=====");
        HttpRequest req3 = new HttpRequest("GET", "/api/data");
        System.out.println(authHandler.handleRequest(req3));

        System.out.println("\n===== 管理员 API（有权限）=====");
        HttpRequestHandler adminHandler = new AdminAPIHandler();
        HttpRequest req4 = new HttpRequest("DELETE", "/api/admin/user/1");
        req4.setHeader("Authorization", "Bearer admin-token");
        req4.setHeader("X-User-Role", "ADMIN");
        System.out.println(adminHandler.handleRequest(req4));

        System.out.println("\n===== 管理员 API（无权限）=====");
        HttpRequest req5 = new HttpRequest("DELETE", "/api/admin/user/1");
        req5.setHeader("Authorization", "Bearer user-token");
        req5.setHeader("X-User-Role", "USER");
        System.out.println(adminHandler.handleRequest(req5));
    }
}
```

## 23.4 JDK/框架源码解析

### 23.4.1 java.util.AbstractList

```java
import java.util.AbstractList;
import java.util.List;

/**
 * java.util.AbstractList 是模板方法模式的经典应用
 * 子类只需要实现 get() 和 size() 两个原语操作，
 * 就可以获得 indexOf、contains、addAll、subList 等所有模板方法
 */
public class AbstractListAnalysis {

    /**
     * AbstractList 的模板方法分析：
     *
     * 抽象方法（原语操作）：
     *   - get(int index): E          ← 子类必须实现
     *   - size(): int                ← 子类必须实现
     *
     * 模板方法（基于 get/size 实现）：
     *   - indexOf(Object o): int     ← 遍历查找
     *   - contains(Object o): boolean ← 调用 indexOf
     *   - lastIndexOf(Object o): int  ← 反向遍历
     *   - subList(int, int): List<E>  ← 返回视图
     *   - isEmpty(): boolean          ← size() == 0
     *   - iterator(): Iterator<E>     ← 基于 get/size
     *   - forEach(Consumer): void     ← Java 8
     *   - removeIf(Predicate): boolean ← Java 8
     *   - stream(): Stream<E>         ← Java 8
     */

    // 使用 AbstractList 快速实现一个不可变列表
    static class MyImmutableList extends AbstractList<String> {
        private final String[] data;

        MyImmutableList(String... data) {
            this.data = data.clone();
        }

        @Override
        public String get(int index) {
            return data[index];  // 原语操作1
        }

        @Override
        public int size() {
            return data.length;  // 原语操作2
        }
        // indexOf, contains, isEmpty 等全部免费获得!
    }

    public static void main(String[] args) {
        List<String> list = new MyImmutableList("A", "B", "C", "D", "E");

        System.out.println("get(2): " + list.get(2));           // C
        System.out.println("size: " + list.size());              // 5
        System.out.println("contains 'C': " + list.contains("C")); // true
        System.out.println("indexOf 'D': " + list.indexOf("D"));   // 3
        System.out.println("isEmpty: " + list.isEmpty());          // false
        System.out.println("subList(1,4): " + list.subList(1, 4)); // [B, C, D]

        // 只需要实现 get() 和 size() 两个方法
        // 就获得了 List 接口的所有方法!
    }
}
```

### 23.4.2 javax.servlet.http.HttpServlet

```java
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * HttpServlet 是 Java Web 开发中最经典的模板方法模式应用
 *
 * service() 是模板方法，doGet/doPost/doPut/doDelete 是原语操作
 */
public class HttpServletAnalysis extends HttpServlet {

    /**
     * HttpServlet.service() 的伪代码：
     *
     * protected void service(HttpServletRequest req, HttpServletResponse resp) {
     *     String method = req.getMethod();
     *
     *     // 模板方法：根据 HTTP 方法分派到对应的 doXxx 方法
     *     if (method.equals("GET")) {
     *         doGet(req, resp);           ← 原语操作，默认返回 405
     *     } else if (method.equals("POST")) {
     *         doPost(req, resp);          ← 原语操作，默认返回 405
     *     } else if (method.equals("PUT")) {
     *         doPut(req, resp);           ← 原语操作，默认返回 405
     *     } else if (method.equals("DELETE")) {
     *         doDelete(req, resp);        ← 原语操作，默认返回 405
     *     } else {
     *         // 不支持的方法
     *         resp.sendError(405);
     *     }
     * }
     */

    // ---- 实现原语操作 ----

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {
        resp.getWriter().write("处理 GET 请求: " + req.getRequestURI());
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {
        resp.getWriter().write("处理 POST 请求");
    }

    // doPut, doDelete 等使用默认的 405 错误响应
}
```

### 23.4.3 java.io.InputStream

```java
import java.io.IOException;
import java.io.InputStream;

/**
 * java.io.InputStream 是模板方法模式的另一个经典例子
 *
 * 抽象方法（原语操作）：
 *   - read(): int           ← 子类必须实现（读取一个字节）
 *
 * 模板方法：
 *   - read(byte[] b): int      ← 循环调用 read()
 *   - read(byte[], int, int): int
 *   - readAllBytes(): byte[]   ← Java 9
 *   - transferTo(OutputStream) ← Java 9
 *   - skip(long): long
 *   - available(): int
 */

// 分析 InputStream 的模板方法
// 在 java.io.InputStream 中：
//
// public abstract int read() throws IOException;
//
// public int read(byte b[], int off, int len) throws IOException {
//     // 模板方法：循环调用 read() 直到读取足够的字节
//     for (int i = 0; i < len; i++) {
//         int c = read();        // 调用原语操作
//         if (c == -1) {
//             return i == 0 ? -1 : i;
//         }
//         b[off + i] = (byte) c;
//     }
//     return len;
// }
//
// public byte[] readAllBytes() throws IOException {
//     // 模板方法：基于 read(byte[]) 实现
//     ByteArrayOutputStream out = new ByteArrayOutputStream();
//     byte[] buf = new byte[8192];
//     int n;
//     while ((n = read(buf)) != -1) {
//         out.write(buf, 0, n);
//     }
//     return out.toByteArray();
// }
```

### 23.4.4 Spring AbstractApplicationContext.refresh()

```java
/**
 * Spring 的 AbstractApplicationContext.refresh() 是模板方法模式
 * 在企业级框架中最经典的应用之一。
 *
 * 它定义了 IoC 容器初始化的完整流程，子类可以定制特定的步骤。
 */
public class SpringRefreshAnalysis {

    /**
     * AbstractApplicationContext.refresh() 模板方法（简化版）：
     *
     * public void refresh() throws BeansException, IllegalStateException {
     *     // 1. 准备刷新上下文
     *     prepareRefresh();                    ← 具体方法
     *
     *     // 2. 告诉子类刷新内部 bean 工厂
     *     ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory(); ← 抽象
     *
     *     // 3. 准备 bean 工厂
     *     prepareBeanFactory(beanFactory);     ← 具体方法
     *
     *     // 4. 允许子类后置处理 bean 工厂
     *     postProcessBeanFactory(beanFactory); ← 钩子方法
     *
     *     // 5. 调用 BeanFactoryPostProcessors
     *     invokeBeanFactoryPostProcessors(beanFactory); ← 具体方法
     *
     *     // 6. 注册 BeanPostProcessors
     *     registerBeanPostProcessors(beanFactory); ← 具体方法
     *
     *     // 7. 初始化消息源
     *     initMessageSource();                 ← 钩子方法
     *
     *     // 8. 初始化事件多播器
     *     initApplicationEventMulticaster();   ← 钩子方法
     *
     *     // 9. 留给子类初始化其他特殊 bean
     *     onRefresh();                         ← 钩子方法 (最重要的钩子!)
     *
     *     // 10. 注册监听器
     *     registerListeners();                 ← 具体方法
     *
     *     // 11. 实例化所有单例 bean
     *     finishBeanFactoryInitialization(beanFactory); ← 具体方法
     *
     *     // 12. 完成刷新
     *     finishRefresh();                     ← 钩子方法
     * }
     */

    // 最重要的钩子方法 onRefresh():
    // Spring Boot 的 EmbeddedWebApplicationContext 覆盖了这个钩子，
    // 在 onRefresh() 中创建了内嵌的 Tomcat/Jetty/Undertow 服务器

    // Spring Cloud 也覆盖了 onRefresh() 来实现配置刷新
}
```

### 23.4.5 Spring JdbcTemplate 和 TransactionTemplate

```java
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Spring 的 *Template 类都是模板方法模式的应用
 */

/**
 * JdbcTemplate.execute() 模板方法（简化）：
 *
 * public <T> T execute(PreparedStatementCreator psc,
 *                      PreparedStatementCallback<T> action) {
 *     // 1. 获取数据库连接
 *     Connection con = getConnection();
 *
 *     // 2. 创建 PreparedStatement
 *     PreparedStatement ps = psc.createPreparedStatement(con);
 *
 *     try {
 *         // 3. 设置 Statement 参数（钩子）
 *         applyStatementSettings(ps);
 *
 *         // 4. 执行回调（原语操作）
 *         T result = action.doInPreparedStatement(ps);
 *
 *         // 5. 处理返回值
 *         handleWarnings(ps);
 *         return result;
 *     } catch (SQLException e) {
 *         // 6. 异常转换（钩子）
 *         throw translateException("execute", e);
 *     } finally {
 *         // 7. 关闭资源（钩子）
 *         closeStatement(ps);
 *     }
 * }
 */

/**
 * TransactionTemplate.execute() 模板方法：
 *
 * public <T> T execute(TransactionCallback<T> action) {
 *     // 1. 获取事务状态
 *     TransactionStatus status = transactionManager.getTransaction(definition);
 *     try {
 *         // 2. 执行业务逻辑（原语操作）
 *         T result = action.doInTransaction(status);
 *
 *         // 3. 提交事务
 *         transactionManager.commit(status);
 *         return result;
 *     } catch (Exception e) {
 *         // 4. 回滚事务
 *         transactionManager.rollback(status);
 *         throw e;
 *     }
 * }
 */

// 使用示例
public class TemplateExample {
    public static void main(String[] args) {
        // JdbcTemplate 的使用者只需要提供 SQL 和回调
        // JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        // jdbc.execute("SELECT * FROM users", (Statement stmt) -> {
        //     ResultSet rs = stmt.executeQuery();
        //     while (rs.next()) {
        //         System.out.println(rs.getString("name"));
        //     }
        //     return null;
        // });

        // TransactionTemplate 的使用者只需提供业务逻辑
        // TransactionTemplate txTemplate = new TransactionTemplate(txManager);
        // txTemplate.execute(status -> {
        //     // 这个 lambda 中的代码自动在事务中执行
        //     userDao.save(user);
        //     accountDao.update(account);
        //     return null;
        // });
    }
}
```

### 23.4.6 MyBatis BaseExecutor

```java
/**
 * MyBatis 的 BaseExecutor 是模板方法模式的典型应用
 *
 * 模板方法 query() 定义了查询的完整流程：
 *
 * public <E> List<E> query(MappedStatement ms, Object parameter,
 *                          RowBounds rowBounds, ResultHandler resultHandler,
 *                          CacheKey key, BoundSql boundSql) {
 *     // 1. 检查是否有关闭的连接
 *     if (closed) throw new ExecutorException("Executor was closed.");
 *
 *     // 2. 清除本地缓存（如果需要）
 *     if (queryStack == 0 && ms.isFlushCacheRequired()) {
 *         clearLocalCache();
 *     }
 *
 *     // 3. 检查二级缓存
 *     List<E> list = resultHandler == null ?
 *         (List<E>) localCache.getObject(key) : null;
 *
 *     if (list != null) {
 *         handleLocallyCachedOutputParameters(ms, key, parameter, boundSql);
 *     } else {
 *         // 4. 从数据库查询（抽象方法）
 *         list = queryFromDatabase(ms, parameter, rowBounds,
 *                                  resultHandler, key, boundSql);
 *     }
 *
 *     return list;
 * }
 *
 * 抽象方法（子类实现）：
 *   - doUpdate(MappedStatement, Object): int
 *   - doQuery(MappedStatement, Object, RowBounds, ResultHandler, BoundSql): List
 *   - doQueryCursor(MappedStatement, Object, RowBounds, BoundSql): Cursor
 *   - doFlushStatements(): List<BatchResult>
 *
 * 具体子类：
 *   - SimpleExecutor：简单的 JDBC 执行
 *   - BatchExecutor：批量执行
 *   - ReuseExecutor：重用 PreparedStatement
 */
```

## 23.5 使用场景与案例

### 23.5.1 ETL 数据管道

```java
/**
 * ETL 数据管道 - 抽取、转换、加载
 */
public abstract class ETLPipeline {

    /** 模板方法 - 执行 ETL */
    public final ETLResult execute() {
        System.out.println("===== 开始 ETL 流程 =====");

        // 1. 抽取
        List<Object> rawData = extract();
        if (rawData.isEmpty()) {
            return ETLResult.failure("无数据可抽取");
        }
        System.out.println("抽取 " + rawData.size() + " 条数据");

        // 2. 转换
        List<Object> transformed = transform(rawData);
        System.out.println("转换后 " + transformed.size() + " 条数据");

        // 钩子：数据质量检查
        if (requiresQualityCheck() && !checkQuality(transformed)) {
            return ETLResult.failure("数据质量检查未通过");
        }

        // 3. 加载
        int loaded = load(transformed);
        System.out.println("加载 " + loaded + " 条数据");

        // 钩子：后处理
        postProcess(transformed);

        return ETLResult.success(loaded);
    }

    protected abstract List<Object> extract();
    protected abstract List<Object> transform(List<Object> rawData);
    protected abstract int load(List<Object> data);

    /** 钩子：是否需要数据质量检查 */
    protected boolean requiresQualityCheck() { return false; }
    protected boolean checkQuality(List<Object> data) { return true; }
    protected void postProcess(List<Object> data) {}

    public static class ETLResult {
        private final boolean success;
        private final String message;

        private ETLResult(boolean success, String message) {
            this.success = success;
            this.message = message;
        }

        static ETLResult success(int count) {
            return new ETLResult(true, "成功加载 " + count + " 条数据");
        }

        static ETLResult failure(String reason) {
            return new ETLResult(false, "失败: " + reason);
        }
    }
}
```

### 23.5.2 报表生成器

```java
/**
 * 报表生成器 - 模板方法模式
 * 所有报表共享页眉/页脚，内容部分由子类定制
 */
public abstract class ReportGenerator {

    /** 模板方法 - 生成完整报表 */
    public final String generate() {
        StringBuilder report = new StringBuilder();

        report.append(generateHeader());
        report.append(generateSummary());
        report.append(generateContent());    // 抽象方法
        report.append(generateFooter());

        return report.toString();
    }

    private String generateHeader() {
        return "========================================\n"
            + "  公司季度报表\n"
            + "  生成时间: " + java.time.LocalDateTime.now() + "\n"
            + "========================================\n\n";
    }

    private String generateSummary() {
        return "[摘要] 本报表包含 " + getDataSize() + " 条记录\n\n";
    }

    protected abstract int getDataSize();
    protected abstract String generateContent();

    private String generateFooter() {
        return "\n----------------------------------------\n"
            + "  【机密文件】仅供内部使用\n"
            + "========================================\n";
    }
}

class SalesReport extends ReportGenerator {
    private final List<String> sales = Arrays.asList("产品A: 100万", "产品B: 200万", "产品C: 150万");

    @Override
    protected int getDataSize() { return sales.size(); }

    @Override
    protected String generateContent() {
        StringBuilder sb = new StringBuilder("【销售数据】\n");
        for (String s : sales) {
            sb.append("  - ").append(s).append("\n");
        }
        return sb.toString();
    }
}
```

### 23.5.3 测试框架生命周期

```java
import java.lang.annotation.*;

/**
 * 单元测试框架 - 模拟 JUnit 的生命周期
 * 使用模板方法定义测试执行流程
 */
public abstract class TestCase {

    /** 模板方法 - 执行测试 */
    public final void run() {
        try {
            setUp();                    // 钩子：准备测试环境
            runTest();                  // 抽象方法：执行测试
            tearDown();                 // 钩子：清理测试环境
            System.out.println("[PASS] " + getTestName());
        } catch (AssertionError e) {
            System.err.println("[FAIL] " + getTestName() + ": " + e.getMessage());
        } catch (Exception e) {
            System.err.println("[ERROR] " + getTestName() + ": " + e);
        }
    }

    /** 获取测试名称 */
    protected abstract String getTestName();

    /** 执行测试逻辑 */
    protected abstract void runTest() throws Exception;

    /** 设置测试环境（钩子） */
    protected void setUp() {}

    /** 清理测试环境（钩子） */
    protected void tearDown() {}

    /** 断言工具 */
    protected void assertEquals(Object expected, Object actual) {
        if (!expected.equals(actual)) {
            throw new AssertionError("期望=" + expected + "，实际=" + actual);
        }
    }

    protected void assertTrue(boolean condition) {
        if (!condition) throw new AssertionError("条件不成立");
    }
}

// 具体的测试用例
class CalculatorTest extends TestCase {
    private Calculator calculator;

    @Override
    protected String getTestName() { return "CalculatorTest"; }

    @Override
    protected void setUp() {
        System.out.println("  初始化计算器");
        calculator = new Calculator();
    }

    @Override
    protected void runTest() {
        assertEquals(5, calculator.add(2, 3));
        assertEquals(1, calculator.subtract(3, 2));
        assertEquals(6, calculator.multiply(2, 3));
        assertEquals(2, calculator.divide(6, 3));
    }

    @Override
    protected void tearDown() {
        System.out.println("  清理计算器资源");
        calculator = null;
    }
}

class Calculator {
    int add(int a, int b) { return a + b; }
    int subtract(int a, int b) { return a - b; }
    int multiply(int a, int b) { return a * b; }
    int divide(int a, int b) { return a / b; }
}

// 测试运行器
public class TestRunner {
    public static void main(String[] args) {
        System.out.println("===== 运行测试 =====");
        new CalculatorTest().run();
        System.out.println("===== 测试结束 =====");
    }
}
```

## 23.6 潜在风险与问题

### 23.6.1 脆弱的基类问题

```java
/**
 * 脆弱的基类问题 (Fragile Base Class Problem)
 *
 * 当基类的模板方法发生变化时，所有子类都可能受到影响
 */
public class FragileBaseClassProblem {

    // 原始版本
    static abstract class Base {
        public final void process() {
            step1();
            step2();
        }

        abstract void step1();
        abstract void step2();
    }

    // 子类 A 基于 step1 -> step2 的顺序实现
    static class ConcreteA extends Base {
        void step1() { System.out.println("A-step1"); }
        void step2() { System.out.println("A-step2"); }
    }

    // 假设基类升级，在 step1 和 step2 之间插入了一个新步骤
    static abstract class BaseV2 {
        public final void process() {
            step1();
            step1_5();   // 新增的步骤!
            step2();
        }

        abstract void step1();
        abstract void step1_5();  // 新的抽象方法!
        abstract void step2();
    }

    // 所有子类都需要修改！如果有 50 个子类，每个都要新增 step1_5 的实现

    // 解决方案：
    // 1. 新增钩子方法时提供默认实现（不是抽象方法）
    // 2. 尽量保持模板方法的稳定性
    // 3. 使用 @deprecated 标记废弃的方法，逐步迁移
    // 4. 充分测试所有子类
}
```

### 23.6.2 与策略模式的混淆

```java
/**
 * 模板方法 vs 策略模式
 *
 * 模板方法模式：在基类中定义算法骨架，子类通过继承改变算法步骤
 * 策略模式：定义一系列算法，通过组合的方式将算法委托给策略对象
 *
 * 选择原则：
 *
 * 使用模板方法当：
 * - 算法结构固定，变化的是特定步骤
 * - 大部分步骤在所有变体中共享
 * - 子类需要访问基类的数据和保护方法
 *
 * 使用策略当：
 * - 整个算法都可以替换
 * - 需要在运行时切换算法
 * - 算法之间没有共享的步骤
 * - 需要避免继承的耦合
 *
 * 模板方法（继承）：           策略模式（组合）：
 * ┌──────────────┐          ┌──────────────┐
 * │  AbstractBase│          │  Context     │
 * │  template()  │          │  strategy ────► Strategy
 * │  step1()     │          │  execute()   │  execute()
 * │  step2()     │          └──────────────┘  ▲
 * └──────┬───────┘                            │
 *        │                          ┌─────────┴─────────┐
 *    ┌───┴───┐                      │ ConcreteStrategyA  │
 *    │  A   │  B                    │ ConcreteStrategyB  │
 *    │      │                       └───────────────────┘
 * 固定步骤在基类                 所有步骤都在策略中
 */
```

### 23.6.3 钩子滥用

```java
/**
 * 钩子方法滥用问题
 */
public class HookAbuse {

    // ❌ 钩子过多，难以理解
    static abstract class Overcomplicated {
        public final void process() {
            if (beforeAll()) {           // 钩子1
                setup();
                if (shouldStep1()) {     // 钩子2
                    step1();
                    if (shouldRetry()) { // 钩子3
                        retry();
                    }
                }
                if (shouldStep2()) {     // 钩子4
                    step2();
                    for (int i = 0; i < getRetryCount(); i++) { // 钩子5
                        step2_retry(i);
                    }
                }
                cleanup();
            }
            afterAll();                  // 钩子6
        }

        // 6个钩子方法！
        protected boolean beforeAll() { return true; }
        protected boolean shouldStep1() { return true; }
        protected boolean shouldRetry() { return false; }
        protected boolean shouldStep2() { return true; }
        protected int getRetryCount() { return 0; }
        protected void afterAll() {}
    }

    // ✅ 好的设计：钩子数量合理，每个钩子有明确的语义
    static abstract class WellDesigned {
        public final void process() {
            init();
            execute();
            if (isTransactional()) {  // 清晰的语义
                commit();
            }
            cleanup();
        }

        protected void init() {}
        protected abstract void execute();
        protected boolean isTransactional() { return false; }
        protected void commit() {}
        protected void cleanup() {}
    }
}
```

### 23.6.4 继承层次过深

```java
/**
 * 过深的继承层次使代码难以理解和维护
 */
public class DeepInheritanceProblem {

    // ❌ 过深的继承层次
    // DataImporter -> CSVImporter -> SpecialCSVImporter -> CustomSpecialCSVImporter
    // 每层都覆盖一部分方法，要理解最终的代码需要查看整个继承链

    // ✅ 推荐：扁平化继承层次，优先使用组合
    // DataImporter (模板方法)
    //   ├── CSVImporter
    //   ├── ExcelImporter
    //   └── JSONImporter
    // 最多两层：基类 -> 具体类
}
```

## 23.7 优化策略

### 23.7.1 保持模板方法聚焦

```java
/**
 * 保持模板方法在 5-7 步以内
 */
public class FocusedTemplate {

    // ❌ 过长的模板方法（15步）
    public final void process() {
        step1(); step2(); step3(); step4(); step5();
        step6(); step7(); step8(); step9(); step10();
        step11(); step12(); step13(); step14(); step15();
    }

    // ✅ 拆分为多个小模板方法
    public final void process() {
        validate();    // step1-3
        transform();   // step4-8
        persist();     // step9-12
        notify();      // step13-15
    }

    protected abstract void validate();
    protected abstract void transform();
    protected abstract void persist();
    protected abstract void notify();
}
```

### 23.7.2 文档化钩子的契约

```java
/**
 * 清晰文档化钩子的前置条件和后置条件
 */
public abstract class WellDocumentedTemplate {

    /**
     * 模板方法 - 处理订单
     *
     * 算法步骤：
     *   1. validateOrder()    - 校验订单
     *   2. processPayment()   - 处理支付（抽象）
     *   3. shipOrder()        - 发货（抽象）
     *   4. sendNotification() - 发送通知（钩子）
     */
    public final void processOrder(Order order) {
        validateOrder(order);
        processPayment(order);
        shipOrder(order);
        sendNotification(order);
    }

    /**
     * 处理支付
     *
     * 前置条件：order 已经过校验，金额已计算
     * 后置条件：order.paymentStatus == PAID
     * 异常：支付失败时抛出 PaymentException
     *
     * @param order 已验证的订单
     */
    protected abstract void processPayment(Order order);

    /**
     * 发货
     *
     * 前置条件：order.paymentStatus == PAID
     * 后置条件：order.shippingStatus == SHIPPED
     */
    protected abstract void shipOrder(Order order);

    /**
     * 发送通知（钩子方法）
     *
     * 默认实现：发送邮件通知
     * 覆盖此方法可自定义通知方式（如 SMS、站内信）
     *
     * @param order 已发货的订单
     */
    protected void sendNotification(Order order) {
        // 默认发送邮件
        emailService.send(order.getUserEmail(), "您的订单已发货");
    }

    static class Order {
        String getUserEmail() { return "user@example.com"; }
    }
}
```

### 23.7.3 使用 Java 8 默认方法替代抽象方法

```java
/**
 * Java 8 默认方法作为模板方法的轻量级替代
 * 对于只有一个抽象方法的模板，可以用函数式接口替代
 */
public class DefaultMethodTemplate {

    /**
     * 使用默认方法实现模板
     */
    public interface DataProcessor {
        // 模板方法
        default void process(String data) {
            String validated = validate(data);
            String transformed = transform(validated);
            save(transformed);
            if (shouldLog()) {
                log(data);
            }
        }

        // 具体方法可以在接口中实现
        default String validate(String data) {
            if (data == null || data.isEmpty()) {
                throw new IllegalArgumentException("数据不能为空");
            }
            return data.trim();
        }

        // 抽象方法（子类必须实现）
        String transform(String data);
        void save(String data);

        // 钩子方法
        default boolean shouldLog() { return false; }
        default void log(String data) {
            System.out.println("处理: " + data);
        }
    }

    // 使用 Lambda 实现
    public static void main(String[] args) {
        DataProcessor processor = new DataProcessor() {
            @Override
            public String transform(String data) {
                return data.toUpperCase();
            }

            @Override
            public void save(String data) {
                System.out.println("保存: " + data);
            }

            @Override
            public boolean shouldLog() { return true; }
        };

        processor.process("hello");
    }
}
```

### 23.7.4 函数式替代方案

```java
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * 使用函数式编程替代模板方法模式
 * 当算法步骤不多时，传 Lambda 比继承更灵活
 */
public class FunctionalTemplate {

    /**
     * 使用函数式参数替代子类继承
     */
    public static <T, R> R executeWithTemplate(
            T input,
            Function<T, R> processor,
            Consumer<R> afterProcessor,
            Predicate<T> validator) {

        // 模板骨架
        System.out.println("开始处理...");

        // 校验（可选的函数参数）
        if (validator != null && !validator.test(input)) {
            throw new IllegalArgumentException("校验失败");
        }

        // 处理（函数参数）
        R result = processor.apply(input);

        // 后处理（可选的函数参数）
        if (afterProcessor != null) {
            afterProcessor.accept(result);
        }

        System.out.println("处理完成");
        return result;
    }

    public static void main(String[] args) {
        // 不需要创建子类，直接传 Lambda
        String result = executeWithTemplate(
            "Hello",
            String::toUpperCase,                 // 处理函数
            r -> System.out.println("结果: " + r), // 后处理
            s -> s != null && !s.isEmpty()        // 校验
        );

        System.out.println("最终结果: " + result);
    }
}
```

模板方法模式是"代码复用"和"开闭原则"的完美结合。通过在一个稳定骨架中嵌入可变的步骤，它实现了对扩展开放、对修改关闭的设计目标。在框架开发中尤为常用——框架提供者定义模板，框架使用者定制步骤。理解模板方法模式，是掌握 Spring、MyBatis 等主流框架工作原理的关键一步。
