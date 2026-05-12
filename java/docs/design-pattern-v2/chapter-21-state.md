# 第21章 状态模式（State）

**状态模式**允许一个对象在其内部状态改变时改变它的行为。对象看起来似乎修改了它的类。状态模式将每个状态封装为独立的类，通过委托机制让对象的行为了随着状态变化而变化，从而消除大量的if-else/switch分支语句。

## 21.1 解决的问题与应用场景

### 21.1.1 核心问题

很多业务对象在不同状态下会表现出不同的行为。最直观的处理方式是使用if-else或switch语句根据状态变量分发逻辑，但这种方式有明显的缺陷：

```java
// 不使用状态模式的问题代码 —— 订单处理
public class OrderService {
    private String status;  // PENDING, PAID, SHIPPED, DELIVERED, CANCELLED

    public void process() {
        if ("PENDING".equals(status)) {
            System.out.println("等待支付，发送支付提醒");
            // 10行业务逻辑...
        } else if ("PAID".equals(status)) {
            System.out.println("已支付，通知仓库发货");
            // 15行业务逻辑...
        } else if ("SHIPPED".equals(status)) {
            System.out.println("已发货，发送物流信息");
            // 10行业务逻辑...
        } else if ("DELIVERED".equals(status)) {
            System.out.println("已签收，请求评价");
            // 8行业务逻辑...
        } else if ("CANCELLED".equals(status)) {
            System.out.println("已取消，发起退款");
            // 12行业务逻辑...
        }
    }

    // 问题：
    // 1. 每增加一个新状态，都要修改所有包含if-else分支的方法
    // 2. 代码可读性随着状态增多急剧下降
    // 3. 状态转换逻辑散落在各处，难以追踪
    // 4. 违反开闭原则（OCP）
    // 5. 单元测试需要覆盖所有状态组合，复杂度爆炸
}
```

状态模式通过将每种状态的行为封装到独立的类中，让上下文对象持有当前状态并在行为调用时委托给状态对象，从根本上解决上述问题。

### 21.1.2 核心特征

| 特征 | 说明 |
|------|------|
| **行为随状态而变** | 同一对象在不同状态下，相同方法的执行结果不同 |
| **状态独立封装** | 每个状态是独立的类，包含该状态下的所有行为逻辑 |
| **消除条件分支** | 用多态替代if-else/switch，符合开闭原则 |
| **状态转换清晰** | 状态转换逻辑或集中在Context，或分布在状态类中 |
| **易于扩展** | 新增状态只需添加新的状态类，无需修改已有代码 |

### 21.1.3 典型应用场景

- **工作流/审批流**：订单状态机、请假审批流程、贷款审批流程
- **游戏角色状态**：空闲、奔跑、跳跃、攻击、受伤、死亡等状态的切换
- **网络协议状态**：TCP连接状态（CLOSED、LISTEN、SYN_SENT、ESTABLISHED）
- **电梯控制系统**：上行、下行、空闲、维修等状态转换
- **文档编辑状态**：编辑模式、只读模式、批注模式
- **自动售货机**：无币、有币、出货、售罄等状态转换
- **线程生命周期**：NEW、RUNNABLE、BLOCKED、WAITING、TERMINATED

## 21.2 实现原理与UML

### 21.2.1 核心角色

| 角色 | 职责 | 关键属性/方法 |
|------|------|-------------|
| **Context（上下文）** | 持有当前状态对象，对外暴露行为方法，内部委托给状态对象 | `state`, `request()`, `setState()` |
| **State（抽象状态）** | 定义状态接口，声明所有状态相关的行为 | `handle()` |
| **ConcreteState（具体状态）** | 实现特定状态下的行为，可能负责状态转换 | `handle()` |

### 21.2.2 UML类图

```
┌───────────────────────┐         ┌───────────────────────┐
│       Context         │         │         State         │
│      (上下文)         │         │       (抽象状态)      │
├───────────────────────┤         ├───────────────────────┤
│ - state: State       │<>──────>│ + handle(Context)     │
│ + request()           │         └───────────┬───────────┘
│ + setState(State)    │                      │
└───────────────────────┘          ┌───────────┴───────────┐
                                   │                       │
                         ┌─────────┴──────────┐  ┌─────────┴──────────┐
                         │  ConcreteStateA   │  │  ConcreteStateB   │
                         │   (具体状态A)       │  │   (具体状态B)       │
                         ├────────────────────┤  ├────────────────────┤
                         │ + handle(Context) │  │ + handle(Context) │
                         └────────────────────┘  └────────────────────┘
```

### 21.2.3 两种状态转换方式

状态模式支持两种状态转换策略：

| 策略 | 转换位置 | 上下文介入 | 状态间耦合 |
|------|----------|-----------|----------|
| **状态类负责转换** | 每个ConcreteState决定下一个状态 | 被动接受 | 具体状态类之间相互引用 |
| **Context负责转换** | Context统一管理状态转换逻辑 | 主动控制 | 状态类之间完全解耦 |

```java
// 策略1：状态类负责转换（具体状态类之间互相引用）
public class PaidState implements OrderState {
    @Override
    public void handle(OrderContext context) {
        // 执行业务逻辑
        // 转换状态 —— 状态类直接知道下一个状态是什么
        context.setState(new ShippedState());
    }
}

// 策略2：Context负责转换（集中管理状态转换逻辑）
public class OrderContext {
    private OrderState state;

    public void pay() {
        if (state instanceof PendingState) {
            state.handle(this);
            setState(new PaidState());  // Context决定转换
        } else {
            throw new IllegalStateException("当前状态不允许支付");
        }
    }
}
```

### 21.2.4 时序图

```
Client             Context             PendingState         PaidState
  │                   │                    │                    │
  │   setState(new    │                    │                    │
  │   PendingState()) │                    │                    │
  │──────────────────>│                    │                    │
  │                   │                    │                    │
  │   request()       │                    │                    │
  │──────────────────>│                    │                    │
  │                   │  handle(this)      │                    │
  │                   │───────────────────>│                    │
  │                   │                    │                    │
  │                   │                    │  执行待支付逻辑     │
  │                   │                    │                    │
  │                   │setState(new        │                    │
  │                   │  PaidState())      │                    │
  │                   │<───────────────────│                    │
  │                   │                    │                    │
  │   request()       │                    │                    │
  │──────────────────>│                    │                    │
  │                   │  handle(this)      │                    │
  │                   │───────────────────────────────────────>│
  │                   │                    │                    │
  │                   │                    │    执行已支付逻辑   │
  │                   │                    │                    │
```

## 21.3 代码实现

### 21.3.1 自动售货机（状态类负责转换）

这是状态模式的经典教学示例，展示了状态类之间如何互相协作完成状态转换。

```java
// ==================== 状态接口 ====================
public interface VendingMachineState {
    void insertCoin(VendingMachine machine);
    void ejectCoin(VendingMachine machine);
    void selectProduct(VendingMachine machine);
    void dispense(VendingMachine machine);
}

// ==================== 上下文：自动售货机 ====================
public class VendingMachine {
    private VendingMachineState noCoinState;
    private VendingMachineState hasCoinState;
    private VendingMachineState dispensingState;
    private VendingMachineState soldOutState;

    private VendingMachineState currentState;
    private int productCount;

    public VendingMachine(int productCount) {
        noCoinState = new NoCoinState();
        hasCoinState = new HasCoinState();
        dispensingState = new DispensingState();
        soldOutState = new SoldOutState();

        this.productCount = productCount;
        this.currentState = productCount > 0 ? noCoinState : soldOutState;
    }

    public void setState(VendingMachineState state) {
        this.currentState = state;
    }

    // 委托方法 —— 将请求转发给当前状态对象
    public void insertCoin() { currentState.insertCoin(this); }
    public void ejectCoin() { currentState.ejectCoin(this); }
    public void selectProduct() { currentState.selectProduct(this); }
    public void dispense() { currentState.dispense(this); }

    public int getProductCount() { return productCount; }
    public void releaseProduct() {
        if (productCount > 0) {
            productCount--;
            System.out.println("    >> 售出商品，剩余库存: " + productCount);
        }
    }

    public VendingMachineState getNoCoinState() { return noCoinState; }
    public VendingMachineState getHasCoinState() { return hasCoinState; }
    public VendingMachineState getDispensingState() { return dispensingState; }
    public VendingMachineState getSoldOutState() { return soldOutState; }
}

// ==================== 具体状态：无币状态 ====================
class NoCoinState implements VendingMachineState {
    @Override
    public void insertCoin(VendingMachine machine) {
        System.out.println("[无币状态] 收到硬币");
        machine.setState(machine.getHasCoinState());
    }

    @Override
    public void ejectCoin(VendingMachine machine) {
        System.out.println("[无币状态] 没有硬币可退");
    }

    @Override
    public void selectProduct(VendingMachine machine) {
        System.out.println("[无币状态] 请先投币");
    }

    @Override
    public void dispense(VendingMachine machine) {
        System.out.println("[无币状态] 请先投币并选择商品");
    }
}

// ==================== 具体状态：有币状态 ====================
class HasCoinState implements VendingMachineState {
    @Override
    public void insertCoin(VendingMachine machine) {
        System.out.println("[有币状态] 已有硬币，请勿重复投币（退币中...）");
        machine.setState(machine.getNoCoinState());
    }

    @Override
    public void ejectCoin(VendingMachine machine) {
        System.out.println("[有币状态] 退还硬币");
        machine.setState(machine.getNoCoinState());
    }

    @Override
    public void selectProduct(VendingMachine machine) {
        System.out.println("[有币状态] 选择商品...");
        machine.setState(machine.getDispensingState());
        machine.dispense();  // 自动进入出货流程
    }

    @Override
    public void dispense(VendingMachine machine) {
        System.out.println("[有币状态] 请先选择商品");
    }
}

// ==================== 具体状态：出货状态 ====================
class DispensingState implements VendingMachineState {
    @Override
    public void insertCoin(VendingMachine machine) {
        System.out.println("[出货状态] 正在出货，请稍候...");
    }

    @Override
    public void ejectCoin(VendingMachine machine) {
        System.out.println("[出货状态] 正在出货，无法退币");
    }

    @Override
    public void selectProduct(VendingMachine machine) {
        System.out.println("[出货状态] 正在出货，请勿重复选择");
    }

    @Override
    public void dispense(VendingMachine machine) {
        System.out.println("[出货状态] 商品正在出货中...");
        machine.releaseProduct();

        if (machine.getProductCount() > 0) {
            machine.setState(machine.getNoCoinState());
        } else {
            System.out.println("    !! 商品已售罄");
            machine.setState(machine.getSoldOutState());
        }
    }
}

// ==================== 具体状态：售罄状态 ====================
class SoldOutState implements VendingMachineState {
    @Override
    public void insertCoin(VendingMachine machine) {
        System.out.println("[售罄状态] 商品已售罄，无法投币");
    }

    @Override
    public void ejectCoin(VendingMachine machine) {
        System.out.println("[售罄状态] 未投币，无法退币");
    }

    @Override
    public void selectProduct(VendingMachine machine) {
        System.out.println("[售罄状态] 商品已售罄");
    }

    @Override
    public void dispense(VendingMachine machine) {
        System.out.println("[售罄状态] 无商品可售");
    }
}

// ==================== 测试 ====================
public class VendingMachineTest {
    public static void main(String[] args) {
        System.out.println("========== 场景1：正常购买流程 ==========");
        VendingMachine machine1 = new VendingMachine(3);
        machine1.insertCoin();    // 无币 -> 有币
        machine1.selectProduct(); // 有币 -> 出货 -> 无币

        System.out.println("\n========== 场景2：投币后退币 ==========");
        VendingMachine machine2 = new VendingMachine(3);
        machine2.insertCoin();    // 无币 -> 有币
        machine2.ejectCoin();     // 有币 -> 无币

        System.out.println("\n========== 场景3：售罄测试 ==========");
        VendingMachine machine3 = new VendingMachine(1);
        machine3.insertCoin();    // 无币 -> 有币
        machine3.selectProduct(); // 有币 -> 出货 -> 售罄
        machine3.insertCoin();    // 售罄 -> 无法投币
    }
}
```

### 21.3.2 订单生命周期（Context负责转换 + 枚举状态）

```java
// ==================== 订单状态枚举 ====================
public enum OrderStatus {
    PENDING("待支付"),
    PAID("已支付"),
    SHIPPED("已发货"),
    DELIVERED("已签收"),
    CANCELLED("已取消");

    private final String displayName;

    OrderStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() { return displayName; }
}

// ==================== 状态行为接口 ====================
public interface OrderState {
    /** 支付操作 */
    void pay(OrderContext context);

    /** 发货操作 */
    void ship(OrderContext context);

    /** 确认收货 */
    void confirmReceive(OrderContext context);

    /** 取消订单 */
    void cancel(OrderContext context);

    /** 当前状态 */
    OrderStatus getStatus();
}

// ==================== 上下文：订单 ====================
public class OrderContext {
    private final String orderId;
    private final BigDecimal amount;
    private OrderState currentState;

    public OrderContext(String orderId, BigDecimal amount, OrderState initialState) {
        this.orderId = orderId;
        this.amount = amount;
        this.currentState = initialState;
    }

    /**
     * Context负责状态转换 —— 统一在此定义转换逻辑
     */
    void setState(OrderState newState) {
        System.out.printf("  [状态转换] %s -> %s%n",
                currentState.getStatus().getDisplayName(),
                newState.getStatus().getDisplayName());
        this.currentState = newState;
    }

    public void pay()      { currentState.pay(this); }
    public void ship()     { currentState.ship(this); }
    public void confirmReceive() { currentState.confirmReceive(this); }
    public void cancel()   { currentState.cancel(this); }

    public String getOrderId() { return orderId; }
    public BigDecimal getAmount() { return amount; }
    public OrderStatus getStatus() { return currentState.getStatus(); }
}

// ==================== 具体状态：待支付 ====================
class PendingState implements OrderState {
    @Override
    public void pay(OrderContext context) {
        System.out.println("[待支付] 处理支付，金额: " + context.getAmount());
        context.setState(new PaidState());
    }

    @Override
    public void ship(OrderContext context) {
        throw new IllegalStateException("待支付状态不能发货");
    }

    @Override
    public void confirmReceive(OrderContext context) {
        throw new IllegalStateException("待支付状态不能确认收货");
    }

    @Override
    public void cancel(OrderContext context) {
        System.out.println("[待支付] 取消订单");
        context.setState(new CancelledState());
    }

    @Override
    public OrderStatus getStatus() { return OrderStatus.PENDING; }
}

// ==================== 具体状态：已支付 ====================
class PaidState implements OrderState {
    @Override
    public void pay(OrderContext context) {
        throw new IllegalStateException("订单已支付，不能重复支付");
    }

    @Override
    public void ship(OrderContext context) {
        System.out.println("[已支付] 通知仓库发货，订单号: " + context.getOrderId());
        context.setState(new ShippedState());
    }

    @Override
    public void confirmReceive(OrderContext context) {
        throw new IllegalStateException("已支付状态不能确认收货");
    }

    @Override
    public void cancel(OrderContext context) {
        System.out.println("[已支付] 取消订单，发起退款");
        context.setState(new CancelledState());
    }

    @Override
    public OrderStatus getStatus() { return OrderStatus.PAID; }
}

// ==================== 具体状态：已发货 ====================
class ShippedState implements OrderState {
    @Override
    public void pay(OrderContext context) {
        throw new IllegalStateException("已发货，不能支付");
    }

    @Override
    public void ship(OrderContext context) {
        throw new IllegalStateException("已发货，不能重复发货");
    }

    @Override
    public void confirmReceive(OrderContext context) {
        System.out.println("[已发货] 确认收货: " + context.getOrderId());
        context.setState(new DeliveredState());
    }

    @Override
    public void cancel(OrderContext context) {
        throw new IllegalStateException("已发货状态不能取消，请先申请退货");
    }

    @Override
    public OrderStatus getStatus() { return OrderStatus.SHIPPED; }
}

// ==================== 具体状态：已签收 ====================
class DeliveredState implements OrderState {
    @Override public void pay(OrderContext context) {
        throw new IllegalStateException("已签收，不能支付"); }
    @Override public void ship(OrderContext context) {
        throw new IllegalStateException("已签收，不能发货"); }
    @Override public void confirmReceive(OrderContext context) {
        throw new IllegalStateException("已签收，不能重复确认"); }
    @Override public void cancel(OrderContext context) {
        throw new IllegalStateException("已签收状态不能取消"); }
    @Override public OrderStatus getStatus() { return OrderStatus.DELIVERED; }
}

// ==================== 具体状态：已取消 ====================
class CancelledState implements OrderState {
    @Override public void pay(OrderContext context) {
        throw new IllegalStateException("已取消，不能支付"); }
    @Override public void ship(OrderContext context) {
        throw new IllegalStateException("已取消，不能发货"); }
    @Override public void confirmReceive(OrderContext context) {
        throw new IllegalStateException("已取消，不能确认收货"); }
    @Override public void cancel(OrderContext context) {
        throw new IllegalStateException("订单已取消"); }
    @Override public OrderStatus getStatus() { return OrderStatus.CANCELLED; }
}

// ==================== 测试 ====================
public class OrderLifecycleTest {
    public static void main(String[] args) {
        System.out.println("========== 正常订单流程 ==========");
        OrderContext order1 = new OrderContext("ORD-001",
                new BigDecimal("299.00"), new PendingState());
        order1.pay();             // 待支付 -> 已支付
        order1.ship();            // 已支付 -> 已发货
        order1.confirmReceive();  // 已发货 -> 已签收

        System.out.println("\n========== 取消订单流程 ==========");
        OrderContext order2 = new OrderContext("ORD-002",
                new BigDecimal("159.00"), new PendingState());
        order2.cancel();  // 待支付 -> 已取消

        System.out.println("\n========== 异常操作测试 ==========");
        try {
            // 尝试跳过支付直接发货
            OrderContext order3 = new OrderContext("ORD-003",
                    new BigDecimal("99.00"), new PendingState());
            order3.ship();  // 应该抛异常
        } catch (IllegalStateException e) {
            System.out.println("捕获异常: " + e.getMessage());
        }
    }
}
```

### 21.3.3 状态机与定义转换表（企业级实现）

当状态和转换关系复杂时，可以使用转换表来集中管理所有合法状态转换：

```java
import java.util.*;

// ==================== 状态转换表 ====================
public class StateMachine<S extends Enum<S>, E extends Enum<E>> {
    private final Map<S, Map<E, S>> transitionTable = new LinkedHashMap<>();
    private S currentState;

    public StateMachine(S initialState) {
        this.currentState = initialState;
    }

    /**
     * 定义一条状态转换规则
     * @param from 当前状态
     * @param event 触发事件
     * @param to 目标状态
     */
    public StateMachine<S, E> addTransition(S from, E event, S to) {
        transitionTable
                .computeIfAbsent(from, k -> new LinkedHashMap<>())
                .put(event, to);
        return this;  // 链式调用
    }

    /**
     * 执行状态转换
     * @return 新的状态
     * @throws IllegalStateException 如果转换不合法
     */
    public S fire(E event) {
        Map<E, S> transitions = transitionTable.get(currentState);
        if (transitions == null || !transitions.containsKey(event)) {
            throw new IllegalStateException(
                    String.format("非法状态转换: %s --(%s)--> ?",
                            currentState, event));
        }
        S previousState = currentState;
        currentState = transitions.get(event);
        System.out.printf("状态转换: %s --(%s)--> %s%n",
                previousState, event, currentState);
        return currentState;
    }

    public S getCurrentState() { return currentState; }

    /**
     * 获取当前状态允许的操作
     */
    public Set<E> getAllowedEvents() {
        Map<E, S> transitions = transitionTable.get(currentState);
        return transitions != null ? transitions.keySet() : Collections.emptySet();
    }
}

// ==================== 使用转换表实现文档审批状态机 ====================
enum DocState { DRAFT, REVIEWING, APPROVED, REJECTED, PUBLISHED, ARCHIVED }
enum DocEvent { SUBMIT, APPROVE, REJECT, PUBLISH, ARCHIVE }

public class DocumentApproval {
    private final StateMachine<DocState, DocEvent> stateMachine;

    public DocumentApproval() {
        stateMachine = new StateMachine<>(DocState.DRAFT)
                .addTransition(DocState.DRAFT, DocEvent.SUBMIT, DocState.REVIEWING)
                .addTransition(DocState.REVIEWING, DocEvent.APPROVE, DocState.APPROVED)
                .addTransition(DocState.REVIEWING, DocEvent.REJECT, DocState.REJECTED)
                .addTransition(DocState.REJECTED, DocEvent.SUBMIT, DocState.REVIEWING)
                .addTransition(DocState.APPROVED, DocEvent.PUBLISH, DocState.PUBLISHED)
                .addTransition(DocState.PUBLISHED, DocEvent.ARCHIVE, DocState.ARCHIVED);
    }

    public void handle(DocEvent event) {
        System.out.print("[审批处理] ");
        stateMachine.fire(event);
        System.out.println("  允许的操作: " + stateMachine.getAllowedEvents());
    }

    public DocState getState() { return stateMachine.getCurrentState(); }

    public static void main(String[] args) {
        DocumentApproval doc = new DocumentApproval();

        // 正常审批流程
        doc.handle(DocEvent.SUBMIT);   // DRAFT -> REVIEWING
        doc.handle(DocEvent.APPROVE);  // REVIEWING -> APPROVED
        doc.handle(DocEvent.PUBLISH);  // APPROVED -> PUBLISHED
        doc.handle(DocEvent.ARCHIVE);  // PUBLISHED -> ARCHIVED

        // 拒绝后重新提交流程
        System.out.println();
        DocumentApproval doc2 = new DocumentApproval();
        doc2.handle(DocEvent.SUBMIT);  // DRAFT -> REVIEWING
        doc2.handle(DocEvent.REJECT);  // REVIEWING -> REJECTED
        doc2.handle(DocEvent.SUBMIT);  // REJECTED -> REVIEWING
        doc2.handle(DocEvent.APPROVE); // REVIEWING -> APPROVED
    }
}
```

## 21.4 JDK/框架源码解析

### 21.4.1 java.lang.Thread.State

JDK中最简洁的状态模式示例是`Thread.State`枚举，它配合线程对象的内部实现，使得同样的线程方法在不同状态下表现出不同行为。

```java
public class ThreadStateExample {
    public static void main(String[] args) throws InterruptedException {
        Thread thread = new Thread(() -> {
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });

        System.out.println("1. 创建后: " + thread.getState());  // NEW
        thread.start();
        System.out.println("2. 启动后: " + thread.getState());  // RUNNABLE
        Thread.sleep(100);
        System.out.println("3. 等待中: " + thread.getState());  // TIMED_WAITING
        thread.join();
        System.out.println("4. 结束后: " + thread.getState());  // TERMINATED

        // 在不同状态下调用 start() 效果不同:
        try {
            thread.start();  // TERMINATED状态下再次启动 -> 抛异常
        } catch (IllegalThreadStateException e) {
            System.out.println("5. 已终止线程不能重启: " + e.getMessage());
        }
    }
}
```

**线程状态机**：
```
    NEW ──start()──> RUNNABLE ◄──────────┐
                      │    │             │
                      │  sleep/join      │ notify/notifyAll
                      ▼    ▼             │
                  TIMED_WAITING/WAITING ─┘
                      │    │
                  BLOCKED ─┘
                      │ (获取锁成功)
                      ▼
                  RUNNABLE ──> TERMINATED
```

### 21.4.2 Spring State Machine

Spring Statemachine是Spring生态中专门处理复杂状态机的框架。

```java
import org.springframework.statemachine.StateMachine;
import org.springframework.statemachine.config.StateMachineBuilder;
import org.springframework.statemachine.state.State;
import org.springframework.statemachine.transition.Transition;

public class SpringStateMachineExample {

    enum States { S1, S2, S3 }
    enum Events { E1, E2, E3, E_BACK }

    public static StateMachine<States, Events> buildMachine() throws Exception {
        StateMachineBuilder.Builder<States, Events> builder =
                StateMachineBuilder.builder();

        builder.configureStates()
                .withStates()
                .initial(States.S1)
                .end(States.S3)
                .states(EnumSet.allOf(States.class));

        builder.configureTransitions()
                .withExternal()
                .source(States.S1).target(States.S2).event(Events.E1)
                .and()
                .withExternal()
                .source(States.S2).target(States.S3).event(Events.E2)
                .and()
                .withExternal()
                .source(States.S3).target(States.S1).event(Events.E_BACK);

        StateMachine<States, States> stateMachine = builder.build();
        stateMachine.start();
        return stateMachine;
    }

    // Spring Statemachine 特点：
    // - 支持层级状态（Hierarchical States）
    // - 支持状态进入/退出动作（onEntry/onExit Action）
    // - 支持守卫条件（Guard）
    // - 支持状态持久化和恢复
    // - 支持分布式状态机
}
```

### 21.4.3 javax.faces.lifecycle.Lifecycle (JSF)

JSF的生命周期管理是状态模式在Web框架中的应用：

```java
// JSF请求处理生命周期有6个阶段（状态），
// 每个阶段的处理逻辑各不相同
// 1. Restore View（恢复视图）
// 2. Apply Request Values（应用请求值）
// 3. Process Validations（处理验证）
// 4. Update Model Values（更新模型值）
// 5. Invoke Application（调用应用逻辑）
// 6. Render Response（渲染响应）
// 
// 使用 Lifecycle.execute() 按照状态顺序依次执行，
// 每个阶段都可能决定跳过后续阶段
```

### 21.4.4 迭代器内部状态

`java.util.Iterator`的实现类内部也隐含了状态模式的思想：

```java
// ArrayList.Itr 内部有两个核心状态：
// - cursor: 当前遍历位置
// - lastRet: 上次返回的元素位置，-1表示刚删除
//
// next()方法的行为依赖于这两个状态：
// - cursor < size: 返回下一个元素
// - cursor >= size: 抛出NoSuchElementException (终止状态)
//
// remove()方法的行为也依赖于状态：
// - lastRet >= 0: 可以删除
// - lastRet < 0: 抛出IllegalStateException
```

## 21.5 使用场景与案例

### 21.5.1 电梯控制系统

```java
// ==================== 电梯状态接口 ====================
public interface ElevatorState {
    void goUp(Elevator elevator);
    void goDown(Elevator elevator);
    void openDoor(Elevator elevator);
    void closeDoor(Elevator elevator);
    void emergencyStop(Elevator elevator);
}

// ==================== 电梯上下文 ====================
public class Elevator {
    private int currentFloor = 1;
    private ElevatorState idleState = new IdleState();
    private ElevatorState goingUpState = new GoingUpState();
    private ElevatorState goingDownState = new GoingDownState();
    private ElevatorState maintenanceState = new MaintenanceState();
    private ElevatorState currentState = idleState;

    public void setState(ElevatorState state) { this.currentState = state; }

    public void moveUp() { currentState.goUp(this); }
    public void moveDown() { currentState.goDown(this); }
    public void open() { currentState.openDoor(this); }
    public void close() { currentState.closeDoor(this); }
    public void emergency() { currentState.emergencyStop(this); }

    public int getCurrentFloor() { return currentFloor; }
    public void setCurrentFloor(int floor) { this.currentFloor = floor; }
    public ElevatorState getIdleState() { return idleState; }
    public ElevatorState getGoingUpState() { return goingUpState; }
    public ElevatorState getGoingDownState() { return goingDownState; }
    public ElevatorState getMaintenanceState() { return maintenanceState; }
}

// ==================== 具体状态：空闲 ====================
class IdleState implements ElevatorState {
    @Override
    public void goUp(Elevator elevator) {
        System.out.println("[空闲] 开始上行，当前楼层: " + elevator.getCurrentFloor());
        elevator.setState(elevator.getGoingUpState());
    }
    @Override
    public void goDown(Elevator elevator) {
        System.out.println("[空闲] 开始下行，当前楼层: " + elevator.getCurrentFloor());
        elevator.setState(elevator.getGoingDownState());
    }
    @Override
    public void openDoor(Elevator elevator) {
        System.out.println("[空闲] 开门"); }
    @Override
    public void closeDoor(Elevator elevator) {
        System.out.println("[空闲] 关门"); }
    @Override
    public void emergencyStop(Elevator elevator) {
        System.out.println("[空闲] 触发紧急停止，进入维修状态");
        elevator.setState(elevator.getMaintenanceState());
    }
}

// ==================== 具体状态：上行 ====================
class GoingUpState implements ElevatorState {
    @Override
    public void goUp(Elevator elevator) {
        elevator.setCurrentFloor(elevator.getCurrentFloor() + 1);
        System.out.println("[上行] 到达 " + elevator.getCurrentFloor() + " 楼");
    }
    @Override
    public void goDown(Elevator elevator) {
        throw new IllegalStateException("上行时不能直接下行，请先停止");
    }
    @Override
    public void openDoor(Elevator elevator) {
        System.out.println("[上行] 运行时不能开门"); }
    @Override
    public void closeDoor(Elevator elevator) {
        System.out.println("[上行] 门已关闭"); }
    @Override
    public void emergencyStop(Elevator elevator) {
        System.out.println("[上行] 紧急停止！");
        elevator.setState(elevator.getMaintenanceState());
    }
}

// ==================== 具体状态：下行 ====================
class GoingDownState implements ElevatorState {
    @Override
    public void goUp(Elevator elevator) {
        throw new IllegalStateException("下行时不能直接上行，请先停止");
    }
    @Override
    public void goDown(Elevator elevator) {
        elevator.setCurrentFloor(elevator.getCurrentFloor() - 1);
        System.out.println("[下行] 到达 " + elevator.getCurrentFloor() + " 楼");
    }
    @Override
    public void openDoor(Elevator elevator) {
        System.out.println("[下行] 运行时不能开门"); }
    @Override
    public void closeDoor(Elevator elevator) {
        System.out.println("[下行] 门已关闭"); }
    @Override
    public void emergencyStop(Elevator elevator) {
        System.out.println("[下行] 紧急停止！");
        elevator.setState(elevator.getMaintenanceState());
    }
}

// ==================== 具体状态：维修 ====================
class MaintenanceState implements ElevatorState {
    @Override
    public void goUp(Elevator elevator) {
        System.out.println("[维修] 维修中，不能上行"); }
    @Override
    public void goDown(Elevator elevator) {
        System.out.println("[维修] 维修中，不能下行"); }
    @Override
    public void openDoor(Elevator elevator) {
        System.out.println("[维修] 维修中，不能开门"); }
    @Override
    public void closeDoor(Elevator elevator) {
        System.out.println("[维修] 维修中，不能关门"); }
    @Override
    public void emergencyStop(Elevator elevator) {
        System.out.println("[维修] 已处于维修状态"); }
}
```

### 21.5.2 游戏角色状态系统

```java
// ==================== 角色状态 ====================
public class GameCharacter {
    private CharacterState currentState;
    private int health = 100;

    public GameCharacter() {
        this.currentState = new IdleCharacterState();
    }

    void setState(CharacterState state) { this.currentState = state; }
    public int getHealth() { return health; }
    public void damage(int amount) {
        health = Math.max(0, health - amount);
        currentState.onDamage(this);
    }
    public void move() { currentState.move(this); }
    public void attack() { currentState.attack(this); }
    public void jump() { currentState.jump(this); }
}

interface CharacterState {
    void move(GameCharacter character);
    void attack(GameCharacter character);
    void jump(GameCharacter character);
    void onDamage(GameCharacter character);
}

class IdleCharacterState implements CharacterState {
    @Override public void move(GameCharacter c) {
        System.out.println("开始移动");
        c.setState(new RunningCharacterState());
    }
    @Override public void attack(GameCharacter c) {
        System.out.println("攻击！");
        c.setState(new AttackingCharacterState());
    }
    @Override public void jump(GameCharacter c) {
        System.out.println("跳跃！");
        c.setState(new JumpingCharacterState());
    }
    @Override public void onDamage(GameCharacter c) {
        if (c.getHealth() <= 0) {
            System.out.println("角色死亡！");
            c.setState(new DeadCharacterState());
        } else {
            System.out.println("受到伤害，剩余生命: " + c.getHealth());
        }
    }
}

class RunningCharacterState implements CharacterState {
    @Override public void move(GameCharacter c) {
        System.out.println("已在移动中"); }
    @Override public void attack(GameCharacter c) {
        System.out.println("跑动中攻击！");
        c.setState(new AttackingCharacterState());
    }
    @Override public void jump(GameCharacter c) {
        System.out.println("跑动中跳跃！"); }
    @Override public void onDamage(GameCharacter c) {
        if (c.getHealth() <= 0) {
            System.out.println("角色在跑动中死亡！");
            c.setState(new DeadCharacterState());
        }
    }
}

class AttackingCharacterState implements CharacterState { /* 省略实现 */ }
class JumpingCharacterState implements CharacterState { /* 省略实现 */ }
class DeadCharacterState implements CharacterState {
    @Override public void move(GameCharacter c) {
        System.out.println("已死亡，不能移动"); }
    @Override public void attack(GameCharacter c) {
        System.out.println("已死亡，不能攻击"); }
    @Override public void jump(GameCharacter c) {
        System.out.println("已死亡，不能跳跃"); }
    @Override public void onDamage(GameCharacter c) {
        System.out.println("已死亡"); }
}
```

### 21.5.3 网络连接状态

TCP连接状态是状态模式在网络编程中的经典应用：

```java
public class TcpConnection {
    private TcpState currentState;

    public TcpConnection() {
        this.currentState = new ClosedState();
    }

    void setState(TcpState state) { this.currentState = state; }
    public void open() { currentState.open(this); }
    public void close() { currentState.close(this); }
    public void send(String data) { currentState.send(this, data); }
    public void receive() { currentState.receive(this); }
}

interface TcpState {
    void open(TcpConnection conn);
    void close(TcpConnection conn);
    void send(TcpConnection conn, String data);
    void receive(TcpConnection conn);
}

class ClosedState implements TcpState {
    @Override
    public void open(TcpConnection conn) {
        System.out.println("[CLOSED] 发起连接请求 -> LISTEN");
        conn.setState(new ListenState());
    }
    @Override public void close(TcpConnection conn) {
        System.out.println("[CLOSED] 连接已关闭"); }
    @Override public void send(TcpConnection conn, String data) {
        throw new IllegalStateException("连接未建立，不能发送数据"); }
    @Override public void receive(TcpConnection conn) {
        throw new IllegalStateException("连接未建立，不能接收数据"); }
}

class ListenState implements TcpState { /* 省略实现 */ }
class EstablishedState implements TcpState { /* 省略实现 */ }
```

## 21.6 潜在风险与问题

### 21.6.1 状态类爆炸

当状态数量很多时（如50个状态），需要创建50个状态类。

```java
// 如果每个状态只有一两行行为的差异，创建独立类显得过度
// 解决方案：对于简单场景使用枚举 + switch可能是更好的选择
public enum SimpleOrderStatus {
    PENDING {
        @Override void handle() { /* 简单的1-2行逻辑 */ }
    },
    PAID {
        @Override void handle() { /* 简单的1-2行逻辑 */ }
    };
    abstract void handle();
}
```

### 21.6.2 状态转换逻辑分散

如果状态类负责转换，转换逻辑分散在各个状态类中，难以一览整个状态转换全景：

```java
// 需要阅读所有状态类才能理解完整的状态转换图
// 解决方案：使用状态转换表统一管理
```

### 21.6.3 循环状态转换

不正确的状态转换逻辑可能导致死循环：

```java
// A -> B -> C -> A -> B -> C -> ... 无限循环
// 如果没有终止条件或超时限制
```

**解决方案**：
- 设置最大转换次数限制
- 审计所有状态转换路径
- 使用UML状态图可视化检查

### 21.6.4 线程安全

在多线程环境中，状态的并发修改可能导致不一致的状态：

```java
// 线程安全问题示例
public class UnsafeContext {
    private State state;

    public void setState(State newState) {
        // 线程A和线程B可能同时读取同一状态并尝试修改
        this.state = newState;
    }
}
```

**解决方案**：
- 使用`AtomicReference<State>`包装状态引用
- 使用`synchronized`保护状态修改
- 使用不可变状态对象配合CAS操作

### 21.6.5 与策略模式混淆

状态模式和策略模式结构几乎相同，但意图完全不同：

| 维度 | 状态模式 | 策略模式 |
|------|----------|----------|
| **变化驱动** | 对象内部的状态自然演化 | 客户端/外部选择 |
| **变化感知** | 对象自己知道状态变了 | 对象不知道自己用了什么策略 |
| **转换管理** | 内部自动转换或Context转换 | 客户端显式切换 |
| **生命周期** | 状态转换有固定的路径 | 策略随时可切换 |

## 21.7 优化策略

### 21.7.1 转换表管理复杂状态机

对于状态数量多、转换路径复杂的场景，使用转换表是更优选择（已在21.3.3节完整实现）：

```java
// 转换表优势：
// 1. 所有状态转换一目了然
// 2. 易于验证和审计
// 3. 可导出为文档或UML图
// 4. 支持非法转换的前置校验
```

### 21.7.2 状态模式 + 享元模式

对于无状态的状态对象（即状态类本身不持有实例数据），可以复用享元模式共享单例：

```java
// 享元 + 状态模式
public enum VendingState implements VendingMachineState {
    NO_COIN {
        @Override public void insertCoin(VendingMachine machine) {
            machine.setState(HAS_COIN); }
        // ...
    },
    HAS_COIN {
        @Override public void selectProduct(VendingMachine machine) {
            machine.setState(DISPENSING); }
        // ...
    },
    DISPENSING { /* ... */ },
    SOLD_OUT { /* ... */ };
}
```

### 21.7.3 状态转换审计

记录所有状态转换轨迹，便于调试和追溯：

```java
public class AuditableContext {
    private State state;
    private final List<StateTransition> history = new ArrayList<>();

    public void setState(State newState) {
        history.add(new StateTransition(Instant.now(), this.state, newState));
        this.state = newState;
    }

    public List<StateTransition> getTransitionHistory() {
        return Collections.unmodifiableList(history);
    }
}

record StateTransition(Instant timestamp, State from, State to) {}
```

### 21.7.4 转换前置验证

在执行状态转换前验证转换是否合法：

```java
public class ValidatedStateMachine {
    private final Set<StateTransition> allowedTransitions = new HashSet<>();

    public void addAllowedTransition(State from, State to) {
        allowedTransitions.add(new StateTransition(from, to));
    }

    public void transition(State from, State to) {
        if (!allowedTransitions.contains(new StateTransition(from, to))) {
            throw new IllegalStateException(
                    String.format("不允许从 %s 转换到 %s", from, to));
        }
        // 执行转换...
    }
}
```

### 21.7.5 综合对比：何时使用状态模式

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 状态 <= 3个 | if-else / 简单枚举 | 模式开销大于收益 |
| 状态 4-10个，每个状态行为复杂 | 状态模式 | 经典适用场景 |
| 状态 > 10个，转换路径固定 | 状态模式 + 转换表 | 集中管理转换关系 |
| 状态多但行为简单 | 枚举 + switch | 避免类爆炸 |
| 需要持久化和恢复 | Spring Statemachine | 内置持久化支持 |
| 分布式状态机 | 工作流引擎（Activiti/Camunda） | 专业引擎更合适 |

## 本章小结

状态模式是处理对象行为随状态变化而变化的最佳实践。本章从七个维度系统讲解了状态模式：

1. **核心问题**：解决对象在不同状态下表现出不同行为的复杂性，消除大量if-else/switch分支

2. **实现原理**：将每种状态封装为独立类，Context持有当前状态并委托行为调用。支持状态类负责转换和Context负责转换两种策略

3. **代码实现**：提供了三个完整示例：
   - 自动售货机（状态类负责转换，经典教学案例）
   - 订单生命周期（Context负责转换，非法操作抛异常）
   - 转换表实现（企业级通用方案，链式注册转换规则）

4. **JDK/框架源码**：
   - `Thread.State`：JDK内置的线程状态机
   - Spring Statemachine：完整的状态机框架
   - JSF Lifecycle：Web框架中的状态管理
   - Iterator内部状态：迭代器的状态隐式管理

5. **应用场景**：电梯控制、游戏角色、网络连接、文档审批等

6. **风险问题**：状态类爆炸、转换逻辑分散、循环转换、线程安全、与策略模式混淆

7. **优化策略**：转换表管理、享元模式复用、审计日志、前置验证、按场景选择方案

**核心启示**：状态模式和策略模式结构相似但意图不同——状态模式解决"内部状态驱动行为变化"，策略模式解决"外部选择驱动行为变化"。理解这一根本区别，是正确使用两种模式的前提。
