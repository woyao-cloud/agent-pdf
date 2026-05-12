# 第18章 中介者模式（Mediator）

**中介者模式**是一种行为型设计模式，它用一个中介对象来封装一组对象之间的交互。中介者使各对象不需要显式地相互引用，从而使其耦合松散，并且可以独立地改变它们之间的交互。

## 18.1 解决的问题与应用场景

### 18.1.1 问题分析

当系统中的对象之间存在多对多的交互关系时，每个对象都需要维护对其他对象的引用，形成复杂的网状结构。

```java
// 问题：对象之间直接引用，形成网状结构
public class LoginDialog {
    private TextField usernameField;
    private TextField passwordField;
    private CheckBox rememberCheck;
    private Button loginButton;
    private Label errorLabel;

    // 每个组件都需要知道其他组件的状态
    public void onUsernameChanged() {
        // 需要知道 passwordField 的状态
        // 需要更新 loginButton 的状态
        // 还需要更新 errorLabel
        if (!usernameField.getText().isEmpty()
            && !passwordField.getText().isEmpty()) {
            loginButton.setEnabled(true);
        } else {
            loginButton.setEnabled(false);
        }
    }

    public void onPasswordChanged() {
        // 同样的逻辑再写一遍，只是触发条件不同
        if (!usernameField.getText().isEmpty()
            && !passwordField.getText().isEmpty()) {
            loginButton.setEnabled(true);
        } else {
            loginButton.setEnabled(false);
        }
    }
}
```

这种直接交互带来的问题：

- **紧耦合**：每个组件都需要知道其他多个组件的存在和接口
- **难以复用**：组件与特定界面紧绑定，无法脱离该界面在其他地方使用
- **交互逻辑分散**：组件间的交互规则散布在各个组件中，难以维护
- **扩展困难**：新增一个组件需要修改所有与其交互的组件

中介者模式通过引入一个中介者对象来集中管理交互逻辑，将网状结构转变为星状结构。

### 18.1.2 典型应用场景

**1. 图形界面（GUI）组件协调**

```java
// 对话框中的各种组件由一个中介者协调
// 当文本框内容变化时，中介者决定是否启用提交按钮
LoginDialog dialog = new LoginDialog();
dialog.addComponent(usernameField);
dialog.addComponent(passwordField);
dialog.addComponent(loginButton);
// 用户输入时，组件通知中介者，中介者更新其他组件状态
```

**2. 航空管制系统**

```java
// 飞机之间不直接通信，全部通过塔台（中介者）协调
ControlTower tower = new ControlTower();
tower.register(new Aircraft("CA1234"));
tower.register(new Aircraft("MU5678"));
// 飞机请求降落 -> 塔台检查跑道 -> 通知其他飞机等待
```

**3. 聊天室**

```java
// 用户不直接发送消息给其他用户，而是通过聊天室转发
ChatRoom room = new ChatRoom();
room.join(new User("Alice"));
room.join(new User("Bob"));
room.join(new User("Charlie"));
// Alice 发送消息 -> 聊天室 -> 转发给 Bob 和 Charlie
```

**4. 微服务编排**

```java
// 订单服务、支付服务、库存服务之间的交互由编排器协调
Orchestrator orchestrator = new Orchestrator();
orchestrator.addStep(new InventoryCheck());
orchestrator.addStep(new PaymentProcess());
orchestrator.addStep(new ShippingCreate());
// 编排器控制各服务的调用顺序和错误处理
```

## 18.2 实现原理与UML

### 18.2.1 核心思想

中介者模式的核心思想是：**将对象之间的多对多交互，转化为中介者与各个对象之间的一对多交互**。

结构变化：

```
❌ 网状结构（没有中介者）：
  A ──── B
  │  ╱  │
  │ ╱   │
  C ──── D

✅ 星状结构（有中介者）：
     Mediator
     ╱  │  ╲
    A   B   C   D
```

### 18.2.2 UML类图

```
┌──────────────────┐         ┌──────────────────────┐
│     Mediator     │         │     Colleague        │
│   (中介者接口)    │         │   (同事接口)         │
├──────────────────┤         ├──────────────────────┤
│ + send(msg, col) │◄───────►│ - mediator: Mediator │
│ + register(col)  │         │ + send(msg)          │
└────────┬─────────┘         │ + receive(msg)       │
         │                   └──────────┬───────────┘
         │                              │
         ▼                              ▼
┌──────────────────┐         ┌──────────────────────┐
│ ConcreteMediator │         │ ConcreteColleague    │
│ (具体中介者)      │         │ (具体同事)           │
├──────────────────┤         ├──────────────────────┤
│ - colleagues[]   │────────►│ + send(msg)          │
│ + send()         │ 持有     │ + receive(msg)       │
│ + register()     │         └──────────────────────┘
└──────────────────┘
```

### 18.2.3 角色分析

| 角色 | 类型 | 职责 | 关键行为 |
|------|------|------|----------|
| **Mediator** | 接口 | 定义通信接口，声明同事间通信的方法 | `send()`, `register()` |
| **ConcreteMediator** | 具体类 | 实现协调逻辑，维护同事对象的引用 | 保存所有同事，实现转发逻辑 |
| **Colleague** | 抽象类/接口 | 定义同事的接口，持有中介者引用 | 通信时调用中介者，而非直接调用其他同事 |
| **ConcreteColleague** | 具体类 | 实现具体的业务行为 | 通过中介者与其他同事通信 |

### 18.2.4 与观察者模式的区别

```
观察者模式 (Observer)         中介者模式 (Mediator)
──────────────                ──────────────
一对多关系                    多对多关系
发布者 → 多个订阅者            多个对象 ← 中介者 → 多个对象
数据流方向固定                数据流双向
常用于事件通知                常用于协调复杂交互
```

## 18.3 代码实现

### 18.3.1 中介者接口和同事基类

```java
/**
 * 中介者接口 - 定义同事间的通信协议
 */
public interface Mediator {
    /** 向所有同事（除了发送者）发送消息 */
    void broadcast(Colleague sender, String message);

    /** 向指定同事发送消息 */
    void sendTo(Colleague sender, Colleague receiver, String message);

    /** 注册同事到中介者 */
    void register(Colleague colleague);
}

/**
 * 同事基类 - 所有需要中介者协调的对象的基类
 */
public abstract class Colleague {
    protected final String name;
    protected Mediator mediator;

    public Colleague(String name) {
        this.name = name;
    }

    /** 设置中介者（通常在注册时由中介者调用） */
    public void setMediator(Mediator mediator) {
        this.mediator = mediator;
    }

    public String getName() {
        return name;
    }

    /** 发送消息 - 通过中介者转发 */
    public abstract void send(String message);

    /** 接收消息 - 由中介者调用 */
    public abstract void receive(String senderName, String message);
}
```

### 18.3.2 示例1：聊天室

```java
import java.util.concurrent.ConcurrentHashMap;

/**
 * 聊天室 - 具体中介者
 * 负责管理用户注册和消息转发
 */
public class ChatRoom implements Mediator {
    private final Map<String, Colleague> users = new ConcurrentHashMap<>();

    @Override
    public void register(Colleague colleague) {
        colleague.setMediator(this);
        users.put(colleague.getName(), colleague);
        // 通知其他用户有新用户加入
        broadcast(colleague, "加入了聊天室");
        System.out.println("[系统] " + colleague.getName() + " 已注册到聊天室");
    }

    @Override
    public void broadcast(Colleague sender, String message) {
        for (Colleague user : users.values()) {
            // 不发给发送者自己
            if (!user.getName().equals(sender.getName())) {
                user.receive(sender.getName(), message);
            }
        }
    }

    @Override
    public void sendTo(Colleague sender, Colleague receiver, String message) {
        Colleague target = users.get(receiver.getName());
        if (target != null) {
            target.receive(sender.getName(), message);
        } else {
            System.out.println("[系统] 用户 " + receiver.getName() + " 不在线");
        }
    }

    /** 移除用户 */
    public void remove(Colleague colleague) {
        users.remove(colleague.getName());
        broadcast(colleague, "离开了聊天室");
    }

    /** 获取在线用户数 */
    public int onlineCount() {
        return users.size();
    }
}

/**
 * 聊天室用户 - 具体同事
 */
public class ChatUser extends Colleague {
    public ChatUser(String name) {
        super(name);
    }

    @Override
    public void send(String message) {
        System.out.println("[" + name + "] 发送: " + message);
        mediator.broadcast(this, message);
    }

    /** 私聊 */
    public void sendPrivate(Colleague target, String message) {
        System.out.println("[" + name + "] 私聊 " + target.getName() + ": " + message);
        mediator.sendTo(this, target, message);
    }

    @Override
    public void receive(String senderName, String message) {
        System.out.println("[" + name + "] 收到来自 " + senderName + " 的消息: " + message);
    }
}

// 测试代码
public class ChatRoomTest {
    public static void main(String[] args) {
        ChatRoom chatRoom = new ChatRoom();

        ChatUser alice = new ChatUser("Alice");
        ChatUser bob = new ChatUser("Bob");
        ChatUser charlie = new ChatUser("Charlie");

        chatRoom.register(alice);
        chatRoom.register(bob);
        chatRoom.register(charlie);

        System.out.println("\n===== Alice 群发消息 =====");
        alice.send("大家好，我是 Alice!");

        System.out.println("\n===== Bob 私聊 Charlie =====");
        bob.sendPrivate(charlie, "Charlie，周末一起吃饭吗？");

        System.out.println("\n===== Charlie 回复 Bob =====");
        charlie.sendPrivate(bob, "好呀，周末见！");

        System.out.println("\n当前在线人数: " + chatRoom.onlineCount());
    }
}
```

运行结果：

```
[系统] Alice 已注册到聊天室
[系统] Bob 已注册到聊天室
[系统] Charlie 已注册到聊天室

===== Alice 群发消息 =====
[Alice] 发送: 大家好，我是 Alice!
[Bob] 收到来自 Alice 的消息: 大家好，我是 Alice!
[Charlie] 收到来自 Alice 的消息: 大家好，我是 Alice!

===== Bob 私聊 Charlie =====
[Bob] 私聊 Charlie: Charlie，周末一起吃饭吗？
[Charlie] 收到来自 Bob 的消息: Charlie，周末一起吃饭吗？

===== Charlie 回复 Bob =====
[Charlie] 私聊 Bob: 好呀，周末见！
[Bob] 收到来自 Charlie 的消息: 好呀，周末见！

当前在线人数: 3
```

### 18.3.3 示例2：航空管制塔台

```java
import java.util.*;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * 航空管制塔台 - 中介者
 * 协调飞机的起飞、降落和滑行
 */
public class ControlTower implements Mediator {
    /** 所有注册的飞机 */
    private final Map<String, Colleague> aircrafts = new HashMap<>();

    /** 跑道状态 */
    private boolean runwayAvailable = true;

    /** 等待降落的飞机队列 */
    private final Queue<Aircraft> landingQueue = new ConcurrentLinkedQueue<>();

    /** 等待起飞的飞机队列 */
    private final Queue<Aircraft> departureQueue = new ConcurrentLinkedQueue<>();

    @Override
    public void register(Colleague colleague) {
        colleague.setMediator(this);
        aircrafts.put(colleague.getName(), colleague);
        System.out.println("[塔台] " + colleague.getName() + " 已进入管制区域");
    }

    @Override
    public void broadcast(Colleague sender, String message) {
        for (Colleague ac : aircrafts.values()) {
            if (!ac.getName().equals(sender.getName())) {
                ac.receive(sender.getName(), message);
            }
        }
    }

    @Override
    public void sendTo(Colleague sender, Colleague receiver, String message) {
        Colleague target = aircrafts.get(receiver.getName());
        if (target != null) {
            target.receive(sender.getName(), message);
        }
    }

    /**
     * 请求降落 - 核心协调逻辑
     */
    public synchronized void requestLanding(Aircraft aircraft) {
        if (runwayAvailable) {
            // 跑道空闲，允许降落
            runwayAvailable = false;
            aircraft.receive("[塔台]", "允许降落，跑道已清空");
        } else {
            // 跑道被占用，加入等待队列
            landingQueue.add(aircraft);
            aircraft.receive("[塔台]", "跑道繁忙，请在空域盘旋等待，排队位置: "
                + landingQueue.size());
        }
    }

    /**
     * 请求起飞
     */
    public synchronized void requestTakeoff(Aircraft aircraft) {
        if (runwayAvailable) {
            runwayAvailable = false;
            broadcast(aircraft, "正在起飞，请其他飞机注意避让");
            // 起飞完成，释放跑道
            releaseRunway();
        } else {
            departureQueue.add(aircraft);
            aircraft.receive("[塔台]", "跑道繁忙，请在停机位等待，排队位置: "
                + departureQueue.size());
        }
    }

    /**
     * 释放跑道 - 处理下一个等待的飞机
     */
    public synchronized void releaseRunway() {
        // 优先处理降落（降落优先级高于起飞）
        Aircraft next = landingQueue.poll();
        if (next != null) {
            next.receive("[塔台]", "跑道已清空，请立即降落");
            return;
        }

        next = departureQueue.poll();
        if (next != null) {
            next.receive("[塔台]", "跑道已清空，可以起飞");
            return;
        }

        // 没有等待的飞机，跑道空闲
        runwayAvailable = true;
        System.out.println("[塔台] 跑道空闲");
    }
}

/**
 * 飞机 - 同事
 */
public class Aircraft extends Colleague {
    public enum Status { FLYING, APPROACHING, LANDED, PARKED }

    private Status status;

    public Aircraft(String flightNumber) {
        super(flightNumber);
        this.status = Status.FLYING;
    }

    @Override
    public void send(String message) {
        System.out.println("[" + name + "] " + message);
        mediator.broadcast(this, message);
    }

    @Override
    public void receive(String senderName, String message) {
        System.out.println("[" + name + "] 收到 " + senderName + ": " + message);
    }

    /** 请求降落 */
    public void requestLanding() {
        System.out.println("[" + name + "] 请求降落");
        ((ControlTower) mediator).requestLanding(this);
    }

    /** 请求起飞 */
    public void requestTakeoff() {
        System.out.println("[" + name + "] 请求起飞");
        ((ControlTower) mediator).requestTakeoff(this);
    }

    /** 模拟降落完成 */
    public void land() {
        this.status = Status.LANDED;
        System.out.println("[" + name + "] 已降落");
        ((ControlTower) mediator).releaseRunway();
    }

    /** 模拟起飞完成 */
    public void takeoff() {
        this.status = Status.FLYING;
        System.out.println("[" + name + "] 已起飞");
        ((ControlTower) mediator).releaseRunway();
    }

    public Status getStatus() { return status; }
}

// 测试代码
public class ControlTowerTest {
    public static void main(String[] args) {
        ControlTower tower = new ControlTower();

        Aircraft ca1234 = new Aircraft("CA1234");
        Aircraft mu5678 = new Aircraft("MU5678");
        Aircraft cz9012 = new Aircraft("CZ9012");

        tower.register(ca1234);
        tower.register(mu5678);
        tower.register(cz9012);

        System.out.println("\n===== CA1234 请求降落 =====");
        ca1234.requestLanding();

        System.out.println("\n===== MU5678 请求降落（需等待）=====");
        mu5678.requestLanding();

        System.out.println("\n===== CA1234 降落完成 =====");
        ca1234.land();

        System.out.println("\n===== CZ9012 请求起飞 =====");
        cz9012.requestTakeoff();

        System.out.println("\n===== MU5678 降落完成 =====");
        mu5678.land();

        System.out.println("\n===== CZ9012 起飞完成 =====");
        cz9012.takeoff();
    }
}
```

### 18.3.4 示例3：UI对话框中介者

```java
import javax.swing.*;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import java.awt.*;
import java.util.ArrayList;
import java.util.List;

/**
 * UI 组件 - 所有界面组件的基类
 */
abstract class UIComponent extends Colleague {
    protected boolean enabled = true;

    public UIComponent(String name) {
        super(name);
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }
}

/**
 * 文本输入框
 */
class TextFieldComponent extends UIComponent {
    private String text = "";

    public TextFieldComponent(String name) {
        super(name);
    }

    public void setText(String text) {
        this.text = text;
        // 通知中介者文本变化
        mediator.sendTo(this, null, "TEXT_CHANGED");
    }

    public String getText() {
        return text;
    }
}

/**
 * 复选框
 */
class CheckBoxComponent extends UIComponent {
    private boolean checked = false;

    public CheckBoxComponent(String name) {
        super(name);
    }

    public void setChecked(boolean checked) {
        this.checked = checked;
        mediator.sendTo(this, null, "CHECK_CHANGED");
    }

    public boolean isChecked() {
        return checked;
    }
}

/**
 * 按钮
 */
class ButtonComponent extends UIComponent {
    public ButtonComponent(String name) {
        super(name);
    }

    public void click() {
        if (enabled) {
            System.out.println("[按钮] " + name + " 被点击");
            mediator.sendTo(this, null, "BUTTON_CLICKED");
        } else {
            System.out.println("[按钮] " + name + " 已被禁用，不可点击");
        }
    }
}

/**
 * 登录对话框中介者 - 协调所有登录表单组件
 */
public class LoginDialogMediator implements Mediator {
    private final List<UIComponent> components = new ArrayList<>();

    private TextFieldComponent usernameField;
    private TextFieldComponent passwordField;
    private CheckBoxComponent rememberCheck;
    private ButtonComponent loginButton;
    private ButtonComponent cancelButton;

    public void setUsernameField(TextFieldComponent field) {
        this.usernameField = field;
        register(field);
    }

    public void setPasswordField(TextFieldComponent field) {
        this.passwordField = field;
        register(field);
    }

    public void setRememberCheck(CheckBoxComponent check) {
        this.rememberCheck = check;
        register(check);
    }

    public void setLoginButton(ButtonComponent button) {
        this.loginButton = button;
        register(button);
    }

    public void setCancelButton(ButtonComponent button) {
        this.cancelButton = button;
        register(button);
    }

    @Override
    public void register(Colleague colleague) {
        colleague.setMediator(this);
        if (colleague instanceof UIComponent) {
            components.add((UIComponent) colleague);
        }
    }

    @Override
    public void broadcast(Colleague sender, String message) {
        for (UIComponent comp : components) {
            if (comp != sender) {
                // 广播消息给所有组件
                comp.receive(sender.getName(), message);
            }
        }
    }

    @Override
    public void sendTo(Colleague sender, Colleague receiver, String message) {
        if (receiver == null) {
            // receiver 为 null 表示发送给中介者自己
            handleMessage(sender, message);
        } else {
            // 发送给指定组件
            receiver.receive(sender.getName(), message);
        }
    }

    /**
     * 中介者的核心协调逻辑
     * 处理来自各个组件的消息，决定如何更新其他组件的状态
     */
    private void handleMessage(Colleague sender, String message) {
        switch (message) {
            case "TEXT_CHANGED":
            case "CHECK_CHANGED":
                // 当用户名和密码都不为空时，启用登录按钮
                boolean canLogin = !usernameField.getText().isEmpty()
                    && !passwordField.getText().isEmpty();
                loginButton.setEnabled(canLogin);
                String status = canLogin ? "已启用" : "已禁用";
                System.out.println("[中介者] 更新登录按钮状态: " + status);
                break;

            case "BUTTON_CLICKED":
                if (sender == loginButton) {
                    handleLogin();
                } else if (sender == cancelButton) {
                    handleCancel();
                }
                break;
        }
    }

    private void handleLogin() {
        String username = usernameField.getText();
        String password = passwordField.getText();
        boolean remember = rememberCheck.isChecked();
        System.out.println("[中介者] 执行登录: 用户名=" + username
            + ", 记住我=" + remember);
    }

    private void handleCancel() {
        usernameField.setText("");
        passwordField.setText("");
        rememberCheck.setChecked(false);
        System.out.println("[中介者] 已取消登录，表单已重置");
    }

    // 测试代码
    public static void main(String[] args) {
        LoginDialogMediator mediator = new LoginDialogMediator();

        TextFieldComponent username = new TextFieldComponent("用户名");
        TextFieldComponent password = new TextFieldComponent("密码");
        CheckBoxComponent remember = new CheckBoxComponent("记住我");
        ButtonComponent loginBtn = new ButtonComponent("登录");
        ButtonComponent cancelBtn = new ButtonComponent("取消");

        mediator.setUsernameField(username);
        mediator.setPasswordField(password);
        mediator.setRememberCheck(remember);
        mediator.setLoginButton(loginBtn);
        mediator.setCancelButton(cancelBtn);

        System.out.println("===== 模拟用户操作 =====");

        System.out.println("\n1. 用户在用户名字段输入 'admin':");
        username.setText("admin");
        loginBtn.click();  // 密码为空，按钮禁用，点不了

        System.out.println("\n2. 用户在密码字段输入 '123456':");
        password.setText("123456");
        loginBtn.click();  // 现在可以点击了

        System.out.println("\n3. 勾选 '记住我':");
        remember.setChecked(true);

        System.out.println("\n4. 点击取消按钮:");
        cancelBtn.click();

        System.out.println("\n5. 再次点击登录按钮（表单已重置，按钮禁用）:");
        loginBtn.click();
    }
}
```

### 18.3.5 事件驱动中介者变体

```java
import java.util.concurrent.CompletableFuture;

/**
 * 事件驱动中介者 - 使用事件总线风格
 * 比传统中介者更灵活，支持异步通信
 */
public class EventDrivenMediator {

    /** 事件类型 */
    public enum EventType {
        USER_JOINED,
        USER_LEFT,
        MESSAGE_SENT,
        SYSTEM_NOTIFICATION,
        ERROR_OCCURRED
    }

    /** 事件对象 */
    public static class Event {
        private final EventType type;
        private final String source;
        private final Object data;

        public Event(EventType type, String source, Object data) {
            this.type = type;
            this.source = source;
            this.data = data;
        }

        public EventType getType() { return type; }
        public String getSource() { return source; }
        @SuppressWarnings("unchecked")
        public <T> T getData() { return (T) data; }
    }

    /** 事件处理器 */
    @FunctionalInterface
    public interface EventHandler {
        void handle(Event event);
    }

    /** 事件总线 - 充当发布-订阅中介者 */
    public static class EventBus {
        private final Map<EventType, List<EventHandler>> handlers = new HashMap<>();
        private final Map<String, List<EventHandler>> sourceHandlers = new HashMap<>();

        /** 订阅特定类型的事件 */
        public EventBus on(EventType type, EventHandler handler) {
            handlers.computeIfAbsent(type, k -> new ArrayList<>()).add(handler);
            return this;
        }

        /** 订阅特定来源的事件 */
        public EventBus onSource(String source, EventHandler handler) {
            sourceHandlers.computeIfAbsent(source, k -> new ArrayList<>()).add(handler);
            return this;
        }

        /** 发布事件 - 同步 */
        public void publish(Event event) {
            System.out.println("[EventBus] 发布事件: " + event.getType()
                + " 来自: " + event.getSource());

            // 分发给类型匹配的处理器
            List<EventHandler> typeHandlers = handlers.get(event.getType());
            if (typeHandlers != null) {
                for (EventHandler handler : typeHandlers) {
                    handler.handle(event);
                }
            }

            // 分发给来源匹配的处理器
            List<EventHandler> sourceHandlers = this.sourceHandlers.get(event.getSource());
            if (sourceHandlers != null) {
                for (EventHandler handler : sourceHandlers) {
                    handler.handle(event);
                }
            }
        }

        /** 发布事件 - 异步 */
        public CompletableFuture<Void> publishAsync(Event event) {
            return CompletableFuture.runAsync(() -> publish(event));
        }
    }

    // 使用示例
    public static void main(String[] args) {
        EventBus bus = new EventBus();

        // 注册事件处理器
        bus.on(EventType.USER_JOINED, event ->
            System.out.println("[AuditLog] 用户加入: " + event.getData()));

        bus.on(EventType.MESSAGE_SENT, event ->
            System.out.println("[MessageRouter] 转发消息: " + event.getData()));

        bus.on(EventType.ERROR_OCCURRED, event ->
            System.err.println("[ErrorHandler] 错误: " + event.getData()));

        // 发布事件
        System.out.println("===== 事件驱动中介者 =====");
        bus.publish(new Event(EventType.USER_JOINED, "Alice", "Alice 加入了系统"));
        bus.publish(new Event(EventType.MESSAGE_SENT, "Bob", "Hello World"));
        bus.publish(new Event(EventType.ERROR_OCCURRED, "System", "数据库连接超时"));
    }
}
```

## 18.4 JDK/框架源码解析

### 18.4.1 java.util.Timer — 线程与任务间的中介者

```java
import java.util.Timer;
import java.util.TimerTask;

/**
 * java.util.Timer 作为中介者
 * 协调 TimerTask 和执行线程之间的调度关系
 */
public class TimerAsMediator {
    public static void main(String[] args) {
        // Timer 充当了中介者角色
        // 它协调多个 TimerTask 与后台线程之间的关系
        Timer timer = new Timer("Timer-Thread");

        // 这些 TimerTask 之间不需要互相引用
        // 它们只与 Timer 交互
        TimerTask task1 = new TimerTask() {
            @Override
            public void run() {
                System.out.println("任务1执行");
            }
        };

        TimerTask task2 = new TimerTask() {
            @Override
            public void run() {
                System.out.println("任务2执行");
            }
        };

        // Timer 协调两个任务的调度
        timer.schedule(task1, 1000, 2000);  // 1秒后开始，每2秒执行
        timer.schedule(task2, 3000);         // 3秒后执行一次

        // 5秒后取消
        timer.schedule(new TimerTask() {
            @Override
            public void run() {
                timer.cancel();
                System.out.println("定时器已取消");
            }
        }, 5000);
    }
}
```

Timer 作为中介者的角色分析：
- **Timer** = 中介者，统一管理线程和任务
- **TimerTask** = 同事，只需要与 Timer 通信
- **后台线程** = 另一个同事，由 Timer 协调
- 任务之间不需要知道彼此的存在

### 18.4.2 Spring MVC DispatcherServlet

```java
/**
 * Spring MVC 的 DispatcherServlet 是典型的中介者模式
 * 它协调了 HandlerMapping、HandlerAdapter、ViewResolver 等多个组件
 *
 * 如果不使用 DispatcherServlet，需要手动协调这些组件：
 */
// ❌ 没有中介者时，每个组件都需要相互了解
public class NoMediatorExample {
    public void handleRequest(HttpServletRequest request) {
        // 1. 查找处理器
        HandlerMapping handlerMapping = new RequestMappingHandlerMapping();
        Object handler = handlerMapping.getHandler(request);

        // 2. 适配处理器
        HandlerAdapter adapter = new RequestMappingHandlerAdapter();
        ModelAndView mv = adapter.handle(request, handler);

        // 3. 解析视图
        ViewResolver resolver = new InternalResourceViewResolver();
        View view = resolver.resolveViewName(mv.getViewName());

        // 4. 渲染
        view.render(mv.getModel(), request, response);
    }
}

/**
 * ✅ DispatcherServlet 作为中介者，简化了组件协作
 *
 * Spring MVC 的核心处理流程（简化版）：
 */
// DispatcherServlet 的 doDispatch 方法（核心工作流）
// protected void doDispatch(HttpServletRequest request, HttpServletResponse response) {
//     // 1. 中介者（DispatcherServlet）协调 HandlerMapping
//     HandlerExecutionChain mappedHandler = getHandler(request);
//
//     // 2. 中介者协调 HandlerAdapter
//     HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());
//
//     // 3. 中介者调用处理器并获取 ModelAndView
//     ModelAndView mv = ha.handle(request, response, mappedHandler.getHandler());
//
//     // 4. 中介者协调 ViewResolver
//     View view = resolveViewName(mv.getViewName(), mv.getModelLocale(), request);
//
//     // 5. 中介者调用 View 渲染
//     view.render(mv.getModel(), request, response);
// }

/**
 * DispatcherServlet 的中介者角色：
 *
 *             HandlerMapping
 *                 │
 *   HandlerAdapter◄─── DispatcherServlet ───► ViewResolver
 *                 │           │
 *             Controller    View
 *
 * 所有组件只与 DispatcherServlet 通信，不直接交互
 */
```

### 18.4.3 Guava EventBus — 事件驱动中介者

```java
import com.google.common.eventbus.EventBus;
import com.google.common.eventbus.Subscribe;
import com.google.common.eventbus.AllowConcurrentEvents;

/**
 * Guava EventBus - Google Guava 提供的事件总线
 * 是中介者模式的轻量级事件驱动实现
 */
public class GuavaEventBusExample {

    /**
     * 事件类
     */
    public static class OrderEvent {
        private final String orderId;
        private final double amount;

        public OrderEvent(String orderId, double amount) {
            this.orderId = orderId;
            this.amount = amount;
        }

        public String getOrderId() { return orderId; }
        public double getAmount() { return amount; }
    }

    public static class UserEvent {
        private final String userId;
        private final String action;

        public UserEvent(String userId, String action) {
            this.userId = userId;
            this.action = action;
        }

        public String getUserId() { return userId; }
        public String getAction() { return action; }
    }

    /**
     * 订单服务 - 同事1
     */
    public static class OrderService {
        @Subscribe
        @AllowConcurrentEvents
        public void handleOrder(OrderEvent event) {
            System.out.println("[OrderService] 处理订单: " + event.getOrderId()
                + ", 金额: " + event.getAmount());
        }
    }

    /**
     * 通知服务 - 同事2
     */
    public static class NotificationService {
        @Subscribe
        public void handleOrder(OrderEvent event) {
            System.out.println("[Notification] 发送订单通知: " + event.getOrderId());
        }

        @Subscribe
        public void handleUser(UserEvent event) {
            System.out.println("[Notification] 用户 " + event.getUserId()
                + " " + event.getAction());
        }
    }

    /**
     * 审计服务 - 同事3
     */
    public static class AuditService {
        @Subscribe
        public void onAnyEvent(Object event) {
            System.out.println("[Audit] 记录事件: " + event.getClass().getSimpleName());
        }
    }

    public static void main(String[] args) {
        // EventBus 就是中介者
        EventBus eventBus = new EventBus("AppEventBus");

        // 注册同事
        eventBus.register(new OrderService());
        eventBus.register(new NotificationService());
        eventBus.register(new AuditService());

        System.out.println("===== Guava EventBus 演示 =====");

        // 发布事件
        eventBus.post(new OrderEvent("ORD-001", 299.00));
        System.out.println();
        eventBus.post(new UserEvent("USER-001", "登录"));
    }
}

/**
 * Guava EventBus vs 传统中介者：
 *
 * 传统中介者：              Guava EventBus：
 * - 显式的中介者接口         - 隐式的事件总线
 * - 中介者知道所有同事        - 事件总线不知道具体订阅者
 * - 同事持有中介者引用        - 同事只依赖事件类型
 * - 通信协议在接口中定义       - 通信协议由事件类型决定
 * - 同步调用                 - 支持同步和异步
 * - 紧耦合                   - 松耦合
 */
```

### 18.4.4 消息队列中间件 — 分布式中介者

```java
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * 消息队列（Message Queue）作为分布式系统中的中介者
 * 各个微服务通过消息队列通信，不直接调用
 */
public class MessageQueueMediator {

    /**
     * 消息队列 - 分布式中介者
     */
    public static class MessageQueue {
        private final Map<String, List<BlockingQueue<String>>> topics = new HashMap<>();

        /** 创建主题 */
        public synchronized void createTopic(String topicName) {
            topics.putIfAbsent(topicName, new ArrayList<>());
        }

        /** 订阅主题 - 返回一个消息队列 */
        public synchronized BlockingQueue<String> subscribe(String topicName) {
            BlockingQueue<String> queue = new LinkedBlockingQueue<>();
            topics.computeIfAbsent(topicName, k -> new ArrayList<>()).add(queue);
            System.out.println("[MQ] 新订阅者加入主题: " + topicName);
            return queue;
        }

        /** 发布消息到主题 */
        public void publish(String topicName, String message) {
            List<BlockingQueue<String>> subscribers = topics.get(topicName);
            if (subscribers != null) {
                for (BlockingQueue<String> queue : subscribers) {
                    queue.offer(message);  // 非阻塞添加
                }
                System.out.println("[MQ] 向主题 " + topicName
                    + " 发布消息, 分发给 " + subscribers.size() + " 个订阅者");
            }
        }
    }

    /**
     * 订单服务 - 消息生产者
     */
    public static class OrderService {
        private final MessageQueue mq;

        public OrderService(MessageQueue mq) {
            this.mq = mq;
        }

        public void createOrder(String orderId) {
            System.out.println("[订单服务] 创建订单: " + orderId);
            mq.publish("order.created", orderId);
        }
    }

    /**
     * 库存服务 - 消息消费者
     */
    public static class InventoryService {
        private final BlockingQueue<String> queue;

        public InventoryService(MessageQueue mq) {
            mq.createTopic("order.created");
            this.queue = mq.subscribe("order.created");
        }

        public void startListening() {
            new Thread(() -> {
                try {
                    while (true) {
                        String orderId = queue.take();
                        System.out.println("[库存服务] 扣减库存: 订单 " + orderId);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }).start();
        }
    }

    public static void main(String[] args) throws Exception {
        MessageQueue mq = new MessageQueue();

        OrderService orderService = new OrderService(mq);
        InventoryService inventoryService = new InventoryService(mq);

        inventoryService.startListening();
        Thread.sleep(100);

        System.out.println("\n===== MQ 作为分布式中介者 =====");
        orderService.createOrder("ORD-001");
        orderService.createOrder("ORD-002");

        Thread.sleep(200);
    }
}
```

## 18.5 使用场景与案例

### 18.5.1 智能家居中心

```java
/**
 * 智能家居中心 - 中介者
 * 协调灯光、空调、窗帘、传感器等设备
 */
public class SmartHomeHub implements Mediator {
    private final Map<String, SmartDevice> devices = new HashMap<>();

    public void addDevice(SmartDevice device) {
        register(device);
    }

    @Override
    public void register(Colleague colleague) {
        if (colleague instanceof SmartDevice) {
            SmartDevice device = (SmartDevice) colleague;
            device.setMediator(this);
            devices.put(device.getName(), device);
            System.out.println("[智能家居] " + device.getName() + " 已连接");
        }
    }

    @Override
    public void broadcast(Colleague sender, String message) {
        for (SmartDevice device : devices.values()) {
            if (!device.getName().equals(sender.getName())) {
                device.receive(sender.getName(), message);
            }
        }
    }

    @Override
    public void sendTo(Colleague sender, Colleague receiver, String message) {
        SmartDevice target = devices.get(receiver.getName());
        if (target != null) {
            target.receive(sender.getName(), message);
        }
    }

    /** 场景模式：离家 */
    public void awayMode() {
        System.out.println("\n[智能家居] 启动离家模式");
        for (SmartDevice device : devices.values()) {
            device.onAwayMode();
        }
    }

    /** 场景模式：回家 */
    public void homeMode() {
        System.out.println("\n[智能家居] 启动回家模式");
        for (SmartDevice device : devices.values()) {
            device.onHomeMode();
        }
    }

    /** 场景模式：睡眠 */
    public void sleepMode() {
        System.out.println("\n[智能家居] 启动睡眠模式");
        for (SmartDevice device : devices.values()) {
            device.onSleepMode();
        }
    }

    /** 传感器数据变化通知 */
    public void onSensorChanged(String sensorName, double value) {
        System.out.println("\n[智能家居] 传感器 " + sensorName + " 读数: " + value);
        if (sensorName.contains("温度") && value > 30) {
            // 温度过高，通知空调降温
            SmartDevice ac = devices.get("客厅空调");
            if (ac != null) {
                ac.receive("温度传感器", "温度过高，请开启制冷");
            }
        }
    }
}

/**
 * 智能设备基类
 */
abstract class SmartDevice extends Colleague {
    protected boolean isOn = false;

    public SmartDevice(String name) {
        super(name);
    }

    public void onAwayMode() { /* 默认不处理 */ }
    public void onHomeMode() { /* 默认不处理 */ }
    public void onSleepMode() { /* 默认不处理 */ }

    public void turnOn() {
        isOn = true;
        System.out.println("[" + name + "] 已开启");
    }

    public void turnOff() {
        isOn = false;
        System.out.println("[" + name + "] 已关闭");
    }
}

class LightDevice extends SmartDevice {
    private int brightness = 100;

    public LightDevice(String name) { super(name); }

    public void setBrightness(int brightness) {
        this.brightness = brightness;
        System.out.println("[" + name + "] 亮度设置为 " + brightness + "%");
    }

    @Override
    public void send(String message) {
        mediator.broadcast(this, message);
    }

    @Override
    public void receive(String senderName, String message) {
        System.out.println("[" + name + "] 收到 " + senderName + ": " + message);
    }

    @Override
    public void onAwayMode() { turnOff(); }

    @Override
    public void onSleepMode() { setBrightness(10); }
}

class AirConditioner extends SmartDevice {
    private int temperature = 26;

    public AirConditioner(String name) { super(name); }

    public void setTemperature(int temp) {
        this.temperature = temp;
        System.out.println("[" + name + "] 温度设置为 " + temp + "°C");
    }

    @Override
    public void send(String message) {
        mediator.broadcast(this, message);
    }

    @Override
    public void receive(String senderName, String message) {
        System.out.println("[" + name + "] 收到 " + senderName + ": " + message);
        if (message.contains("温度过高")) {
            setTemperature(22);
            turnOn();
        }
    }

    @Override
    public void onAwayMode() { turnOff(); }

    @Override
    public void onSleepMode() { setTemperature(26); }
}

// 测试代码
public class SmartHomeTest {
    public static void main(String[] args) {
        SmartHomeHub hub = new SmartHomeHub();

        LightDevice livingLight = new LightDevice("客厅灯");
        AirConditioner livingAC = new AirConditioner("客厅空调");

        hub.addDevice(livingLight);
        hub.addDevice(livingAC);

        System.out.println("===== 智能家居场景演示 =====");

        hub.homeMode();
        livingLight.turnOn();
        livingAC.turnOn();

        hub.onSensorChanged("温度传感器", 35);

        hub.sleepMode();

        hub.awayMode();
    }
}
```

### 18.5.2 订单处理编排（Saga模式）

```java
/**
 * 订单处理编排 - Saga模式是中介者在微服务中的典型应用
 * 协调多个微服务的调用顺序和回滚逻辑
 */
public class OrderOrchestrator implements Mediator {
    private final List<MicroService> services = new ArrayList<>();
    private final Deque<MicroService> executedServices = new ArrayDeque<>();

    public void addService(MicroService service) {
        register(service);
    }

    @Override
    public void register(Colleague colleague) {
        if (colleague instanceof MicroService) {
            colleague.setMediator(this);
            services.add((MicroService) colleague);
        }
    }

    @Override
    public void broadcast(Colleague sender, String message) {
        // 在业务中一般不用广播
    }

    @Override
    public void sendTo(Colleague sender, Colleague receiver, String message) {
        // 在业务中一般不用直接发送
    }

    /**
     * 处理订单 - 按照顺序调用各微服务
     */
    public boolean processOrder(Order order) {
        System.out.println("\n===== 开始处理订单: " + order.id + " =====");

        for (MicroService service : services) {
            try {
                boolean success = service.execute(order);
                if (!success) {
                    System.out.println("[编排器] " + service.getName() + " 执行失败，开始回滚");
                    rollback();
                    return false;
                }
                executedServices.push(service);
            } catch (Exception e) {
                System.out.println("[编排器] " + service.getName() + " 异常: " + e.getMessage());
                rollback();
                return false;
            }
        }

        System.out.println("[编排器] 订单处理成功!");
        return true;
    }

    /** 回滚 - 逆序撤销已执行的服务 */
    private void rollback() {
        System.out.println("[编排器] 开始回滚...");
        while (!executedServices.isEmpty()) {
            MicroService service = executedServices.pop();
            service.rollback(order);
        }
        System.out.println("[编排器] 回滚完成");
    }

    private Order order;

    static class Order {
        String id;

        Order(String id) { this.id = id; }
    }

    abstract static class MicroService extends Colleague {
        public MicroService(String name) { super(name); }
        public abstract boolean execute(Order order);
        public abstract void rollback(Order order);

        @Override
        public void send(String message) {}

        @Override
        public void receive(String senderName, String message) {}
    }

    // 具体微服务实现
    static class InventoryService extends MicroService {
        public InventoryService() { super("库存服务"); }
        @Override
        public boolean execute(Order order) {
            System.out.println("[库存服务] 扣减库存");
            return true;
        }
        @Override
        public void rollback(Order order) {
            System.out.println("[库存服务] 恢复库存");
        }
    }

    static class PaymentService extends MicroService {
        public PaymentService() { super("支付服务"); }
        @Override
        public boolean execute(Order order) {
            System.out.println("[支付服务] 处理支付");
            return true;
        }
        @Override
        public void rollback(Order order) {
            System.out.println("[支付服务] 退款");
        }
    }

    static class ShippingService extends MicroService {
        public ShippingService() { super("物流服务"); }
        @Override
        public boolean execute(Order order) {
            System.out.println("[物流服务] 创建物流单");
            return true;
        }
        @Override
        public void rollback(Order order) {
            System.out.println("[物流服务] 取消物流单");
        }
    }

    public static void main(String[] args) {
        OrderOrchestrator orchestrator = new OrderOrchestrator();
        orchestrator.addService(new InventoryService());
        orchestrator.addService(new PaymentService());
        orchestrator.addService(new ShippingService());

        orchestrator.processOrder(new Order("ORD-001"));
    }
}
```

## 18.6 潜在风险与问题

### 18.6.1 中介者上帝对象

```java
/**
 * 问题：中介者变得过于庞大，包含所有交互逻辑
 */
// ❌ 坏的设计：中介者什么都知道、什么都做
public class GodMediator implements Mediator {
    // 持有所有组件的引用
    private ComponentA compA;
    private ComponentB compB;
    private ComponentC compC;
    private ComponentD compD;
    private ComponentE compE;
    // ... 可能几十上百个组件

    // 一个巨大的方法处理所有交互
    public void handleMessage(Colleague sender, String message) {
        // if-else 链越来越长
        if (sender == compA) {
            if (message.equals("X")) {
                compB.doSomething();
                compC.doSomethingElse();
            } else if (message.equals("Y")) {
                compD.anotherThing();
            }
        } else if (sender == compB) {
            // ... 更多逻辑
        }
        // 数百行代码...
    }
}

// ✅ 较好的方案：拆分为多个专用中介者
public class FormMediator implements Mediator {
    // 只处理表单相关的交互
    private TextFieldComponent username;
    private TextFieldComponent password;
    private ButtonComponent loginBtn;
    // ... 只包含表单组件
}

public class NavigationMediator implements Mediator {
    // 只处理导航相关的交互
    private MenuComponent menu;
    private TabComponent tabs;
    private BreadcrumbComponent breadcrumb;
    // ... 只包含导航组件
}
```

### 18.6.2 单点故障

```java
/**
 * 问题：中介者成为单点故障
 * 如果中介者崩溃，所有通信都会中断
 */
public class SinglePointOfFailure {
    public static void main(String[] args) {
        // 如果 chatRoom 崩溃或出现 bug，所有用户都无法通信
        ChatRoom chatRoom = new ChatRoom();
        ChatUser alice = new ChatUser("Alice");
        ChatUser bob = new ChatUser("Bob");

        chatRoom.register(alice);
        chatRoom.register(bob);

        // chatRoom 的某个 bug 导致消息无法转发...
        // 所有用户之间的通信都会受到影响

        // 应对策略：
        // 1. 中介者高可用集群
        // 2. 中介者降级（同事之间可以直接通信）
        // 3. 多中介者分担（每个中介者负责一部分逻辑）
    }
}
```

### 18.6.3 性能瓶颈

```java
/**
 * 问题：所有通信经过中介者，成为性能瓶颈
 */
public class PerformanceBottleneck {
    public static void main(String[] args) {
        // 在大量并发通信场景下，中介者可能成为瓶颈
        // 每个消息都需要经过中介者处理、分发
        // 解决方案：

        // 1. 异步中介者
        // public class AsyncMediator implements Mediator {
        //     private final ExecutorService executor = ...;
        //     public void sendTo(Colleague sender, ...) {
        //         executor.submit(() -> target.receive(...));
        //     }
        // }

        // 2. 批量处理
        // public class BatchMediator implements Mediator {
        //     private final List<Message> batch = new ArrayList<>();
        //     public void flush() {
        //         // 批量处理消息，减少上下文切换
        //     }
        // }

        // 3. 直接通信（不再通过中介者）
        // public class OptimizedColleague extends Colleague {
        //     public void sendDirect(Colleague target, String msg) {
        //         target.receive(this.name, msg);  // 直接发送
        //     }
        // }
    }
}
```

### 18.6.4 测试复杂性

```java
/**
 * 问题：测试中介者需要模拟所有依赖的同事
 */
public class TestingComplexity {
    public static void main(String[] args) {
        // 测试中介者时，需要准备所有同事的 mock 对象
        // 中介者与 N 个同事交互，测试时需要模拟 N 个对象

        // 改进：
        // 1. Mediator 接口化，便于 mock
        // 2. 将复杂的交互逻辑分解到多个小中介者
        // 3. 每个小中介者只依赖少数同事

        // 使用 Mock 框架简化测试
        // ChatRoom chatRoom = new ChatRoom();
        // ChatUser mockUser1 = mock(ChatUser.class);
        // ChatUser mockUser2 = mock(ChatUser.class);
        // chatRoom.register(mockUser1);
        // chatRoom.register(mockUser2);
        // chatRoom.broadcast(mockUser1, "test");
        // verify(mockUser2).receive("test", "test");
    }
}
```

## 18.7 优化策略

### 18.7.1 事件驱动中介者

使用事件/消息方式替代直接方法调用，降低耦合度。

```java
/**
 * 事件驱动中介者优化
 */
public class EventOptimizedMediator {
    // 使用 Guava EventBus 或 Spring Events 替代传统中介者
    // 优势：
    // 1. 同事之间通过事件类型解耦
    // 2. 新增同事不影响现有代码
    // 3. 支持异步处理
    // 4. 天然支持广播

    // 代码参见 18.3.5 节的事件驱动中介者变体
}
```

### 18.7.2 多中介者拆分

```java
/**
 * 将臃肿的中介者拆分为多个专用中介者
 * 每个中介者负责一个子系统的协调
 */
public class MediatorDecomposition {
    // ❌ 一个巨大的 ApplicationMediator 处理所有逻辑
    // -> 拆分为：
    // 1. SecurityMediator - 处理认证、授权
    // 2. BusinessMediator - 处理业务逻辑流转
    // 3. UIMediator - 处理界面组件交互
    // 4. NotificationMediator - 处理通知推送
    // 每个中介者职责单一，易于维护和测试
}
```

### 18.7.3 异步中介者

使用消息队列或线程池实现异步通信，避免阻塞。

```java
import java.util.concurrent.*;

/**
 * 异步中介者 - 使用线程池处理消息
 */
public class AsyncMediator implements Mediator {
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, Colleague> colleagues = new ConcurrentHashMap<>();

    @Override
    public void broadcast(Colleague sender, String message) {
        for (Colleague target : colleagues.values()) {
            if (!target.getName().equals(sender.getName())) {
                // 异步分发消息
                executor.submit(() -> {
                    try {
                        target.receive(sender.getName(), message);
                    } catch (Exception e) {
                        System.err.println("消息分发失败: " + e.getMessage());
                    }
                });
            }
        }
    }

    @Override
    public void sendTo(Colleague sender, Colleague receiver, String message) {
        executor.submit(() -> receiver.receive(sender.getName(), message));
    }

    @Override
    public void register(Colleague colleague) {
        colleague.setMediator(this);
        colleagues.put(colleague.getName(), colleague);
    }

    public void shutdown() {
        executor.shutdown();
    }
}
```

### 18.7.4 结合观察者模式

```java
/**
 * 中介者 + 观察者模式结合
 * 中介者负责协调，观察者负责通知
 */
public class MediatorWithObserver {
    // 中介者模式提供结构（星状拓扑）
    // 观察者模式提供机制（发布-订阅）

    // 典型结合：
    // 1. Mediator 内部使用 EventBus 分派消息
    // 2. Mediator 实现 Subject 接口，同事作为 Observer
    // 3. 同事状态变化时通知 Mediator，Mediator 再通知其他同事

    // 这种结合既保持了中介者的集中协调能力，
    // 又获得了观察者的灵活订阅机制
}
```

中介者模式的核心价值在于将复杂的多对多交互简化为清晰的一对多关系。它虽然引入了集中控制的风险，但通过事件驱动、多中介者拆分和异步处理等优化策略，可以很好地应对大规模系统的协调需求。
