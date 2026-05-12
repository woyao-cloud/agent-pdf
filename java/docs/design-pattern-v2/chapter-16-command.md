# 第16章 命令模式（Command）

**命令模式**是一种行为型设计模式，它将一个请求封装为一个对象，从而允许你使用不同的请求、队列或日志请求来参数化客户端，并支持可撤销的操作。

## 16.1 解决的问题与应用场景

### 16.1.1 问题分析

在传统的调用方式中，调用者直接执行某个操作：

```java
// 传统方式：调用者直接依赖具体的接收者
public class Button {
    private Light light;

    public Button(Light light) {
        this.light = light;
    }

    public void press() {
        light.turnOn();  // 硬编码的调用
    }
}
```

这种方式的问题：

- **调用者与接收者紧耦合**：Button 直接依赖 Light，无法控制其他设备
- **无法排队请求**：请求不能被存储、延迟执行或放入队列
- **无法撤销操作**：没有记录执行历史，无法回滚
- **无法记录日志**：没有日志记录每个操作的能力
- **无法组合操作**：无法实现宏命令（一组命令的组合）

命令模式通过将请求封装为对象，完美解决了上述所有问题。

### 16.1.2 典型应用场景

**1. 文本编辑器的撤销/重做**

```java
// 用户每执行一个操作，Command对象被压入撤销栈
undoStack.push(new InsertCommand(doc, position, text));
// 撤销时从栈顶弹出并执行 undo()
Command cmd = undoStack.pop();
cmd.undo();
```

**2. GUI按钮和菜单**

```java
// 按钮和菜单项使用相同的命令对象
JButton saveBtn = new JButton(new SaveAction(editor));
JMenuItem saveItem = new JMenuItem(new SaveAction(editor));
// Ctrl+S快捷键也可以绑定同一个命令
saveBtn.getInputMap().put(KeyStroke.getKeyStroke("control S"), "save");
```

**3. 任务队列和异步执行**

```java
// 命令可以被排队，由线程池异步执行
ExecutorService executor = Executors.newFixedThreadPool(10);
executor.execute(new EmailCommand(user, message));
executor.execute(new LogCommand(event));
```

**4. 数据库事务**

```java
// 每个数据库操作都是一个命令，支持 commit/rollback
Transaction transaction = session.beginTransaction();
transaction.execute(new InsertCommand(user));
transaction.execute(new UpdateCommand(account));
transaction.commit();  // 执行所有命令
// 或 transaction.rollback();  // 撤销所有命令
```

**5. 游戏输入处理**

```java
// 将玩家输入映射为命令，支持重新映射按键和回放
Map<Key, Command> keyBindings = new HashMap<>();
keyBindings.put(Key.W, new MoveCommand(player, Direction.FORWARD));
keyBindings.put(Key.SPACE, new JumpCommand(player));
```

## 16.2 实现原理与UML

### 16.2.1 核心思想

命令模式的核心思想是：**将"请求"转化为一个独立的对象，该对象包含了执行操作所需的所有信息**。

四个关键角色的协作关系：

1. **Command** 定义了执行操作的接口（execute/undo）
2. **ConcreteCommand** 实现了具体的操作，持有接收者的引用
3. **Invoker** 持有命令并调用其 execute 方法，不关心具体的实现
4. **Receiver** 是实际执行业务逻辑的对象

### 16.2.2 UML类图

```
┌──────────────────┐          ┌──────────────────────┐
│      Client      │          │     Command          │
│                  │          │    (抽象命令接口)      │
├──────────────────┤          ├──────────────────────┤
│                  │─────────►│ + execute()           │
│                  │          │ + undo()              │
└──────────────────┘          └──────────┬───────────┘
                                         │
                            ┌────────────┼────────────┐
                            │            │            │
                            ▼            ▼            ▼
                   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                   │ ConcreteCommand1 │ │ ConcreteCommand2 │ │ ConcreteCommand3 │
                   ├──────────────┤ ├──────────────┤ ├──────────────┤
                   │ - receiver   │ │ - receiver   │ │ - receiver   │
                   │ + execute()  │ │ + execute()  │ │ + execute()  │
                   │ + undo()     │ │ + undo()     │ │ + undo()     │
                   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                          │                │                │
                          ▼                ▼                ▼
                   ┌─────────────────────────────────────────────┐
                   │              Receiver                       │
                   │            (接收者)                          │
                   ├─────────────────────────────────────────────┤
                   │  + action1()                                 │
                   │  + action2()                                 │
                   └─────────────────────────────────────────────┘

┌─────────────────────────────┐
│         Invoker             │
│       (调用者/请求者)         │
├─────────────────────────────┤
│  - command: Command         │
│  + setCommand(Command)      │
│  + pressButton()            │
└─────────────────────────────┘
```

### 16.2.3 角色分析

| 角色 | 类型 | 职责 | 关键行为 |
|------|------|------|----------|
| **Command** | 接口/抽象类 | 声明执行操作的接口 | `execute()`, `undo()` |
| **ConcreteCommand** | 具体类 | 绑定 Receiver 和操作，实现 execute/undo | 持有 Receiver 引用 |
| **Invoker** | 具体类 | 调用命令对象执行请求 | 存储命令，调用 execute |
| **Receiver** | 具体类 | 真正执行业务逻辑的对象 | 具体的业务方法 |
| **Client** | 创建者 | 创建 ConcreteCommand 并设置其 Receiver | 组装命令和接收者 |

### 16.2.4 时序图

```
Client          Invoker       Command        Receiver
  │                │             │              │
  │ 创建命令对象     │             │              │
  │ ──────────────►│             │              │
  │                │ setCommand()│              │
  │                │ ───────────►│              │
  │                │             │              │
  │                │ execute()   │              │
  │                │ ───────────►│              │
  │                │             │ action()     │
  │                │             │ ────────────►│
  │                │             │              │
  │                │    result   │              │
  │                │ ◄───────────│──────────────│
  │                │             │              │
```

## 16.3 代码实现

### 16.3.1 基础命令接口

```java
/**
 * 抽象命令接口 - 定义了命令的基本操作
 * execute: 执行命令
 * undo: 撤销命令（恢复到执行前的状态）
 */
public interface Command {
    /** 执行命令 */
    void execute();

    /** 撤销命令 */
    void undo();

    /** 获取命令的名称，用于显示和日志 */
    default String getName() {
        return this.getClass().getSimpleName();
    }
}
```

### 16.3.2 示例1：文本编辑器命令

这是命令模式最经典的例子。我们构建一个支持撤销/重做的文本编辑器。

**文本编辑器核心类（接收者）**

```java
/**
 * 文本编辑器 - 充当接收者角色
 * 实际执行文本操作的对象
 */
public class TextEditor {
    private final StringBuilder content = new StringBuilder();

    public void insert(int position, String text) {
        content.insert(position, text);
    }

    public void delete(int start, int end) {
        content.delete(start, end);
    }

    public void replace(int start, int end, String replacement) {
        content.replace(start, end, replacement);
    }

    public String getContent() {
        return content.toString();
    }

    public int length() {
        return content.length();
    }

    @Override
    public String toString() {
        return content.toString();
    }
}
```

**插入命令**

```java
/**
 * 插入命令 - 在指定位置插入文本
 */
public class InsertCommand implements Command {
    private final TextEditor editor;
    private final int position;
    private final String text;

    /**
     * @param editor   文本编辑器（接收者）
     * @param position 插入位置
     * @param text     要插入的文本
     */
    public InsertCommand(TextEditor editor, int position, String text) {
        this.editor = editor;
        this.position = position;
        this.text = text;
    }

    @Override
    public void execute() {
        editor.insert(position, text);
    }

    @Override
    public void undo() {
        // 撤销插入 = 删除插入的文本
        editor.delete(position, position + text.length());
    }

    @Override
    public String getName() {
        return "插入[" + text + "]";
    }
}
```

**删除命令**

```java
/**
 * 删除命令 - 删除指定范围的文本
 * 注意：执行前需要保存被删除的内容，以便撤销时恢复
 */
public class DeleteCommand implements Command {
    private final TextEditor editor;
    private final int start;
    private final int end;
    private String deletedText;  // 保存被删除的文本，用于撤销

    /**
     * @param editor 文本编辑器（接收者）
     * @param start  删除起始位置
     * @param end    删除结束位置
     */
    public DeleteCommand(TextEditor editor, int start, int end) {
        this.editor = editor;
        this.start = start;
        this.end = end;
    }

    @Override
    public void execute() {
        // 执行删除前，先保存被删除的内容
        // 这里简化处理：在 execute 前获取被删除的内容
        // 实际中可能需要通过 editor 提供的方法获取
        String fullContent = editor.toString();
        this.deletedText = fullContent.substring(start, end);
        editor.delete(start, end);
    }

    @Override
    public void undo() {
        // 撤销删除 = 在原来的位置重新插入被删除的文本
        editor.insert(start, deletedText);
    }

    @Override
    public String getName() {
        return "删除[" + start + "-" + end + "]";
    }
}
```

**替换命令**

```java
/**
 * 替换命令 - 替换指定范围的文本
 * 需要保存替换前的文本用于撤销
 */
public class ReplaceCommand implements Command {
    private final TextEditor editor;
    private final int start;
    private final int end;
    private final String replacement;
    private String originalText;  // 保存原始文本，用于撤销

    /**
     * @param editor      文本编辑器（接收者）
     * @param start       替换起始位置
     * @param end         替换结束位置
     * @param replacement 替换文本
     */
    public ReplaceCommand(TextEditor editor, int start, int end, String replacement) {
        this.editor = editor;
        this.start = start;
        this.end = end;
        this.replacement = replacement;
    }

    @Override
    public void execute() {
        // 保存被替换的原始文本
        this.originalText = editor.toString().substring(start, end);
        editor.replace(start, end, replacement);
    }

    @Override
    public void undo() {
        // 撤销替换 = 将替换后的区域再替换回原始文本
        int replaceEnd = start + replacement.length();
        editor.replace(start, replaceEnd, originalText);
    }

    @Override
    public String getName() {
        return "替换[" + originalText + "->" + replacement + "]";
    }
}
```

**命令管理器 - 支持撤销/重做**

```java
/**
 * 命令管理器 - 维护撤销栈和重做栈
 * 支持撤销、重做、以及批量执行命令
 */
public class CommandManager {
    /** 撤销栈：记录已经执行了的命令 */
    private final Deque<Command> undoStack = new ArrayDeque<>();

    /** 重做栈：记录被撤销了的命令 */
    private final Deque<Command> redoStack = new ArrayDeque<>();

    /** 最大撤销历史长度 */
    private final int maxHistorySize;

    public CommandManager() {
        this(100);  // 默认保留最近100个操作
    }

    public CommandManager(int maxHistorySize) {
        this.maxHistorySize = maxHistorySize;
    }

    /**
     * 执行命令
     * 执行后压入撤销栈，同时清空重做栈（新操作使旧的重做失效）
     */
    public void executeCommand(Command cmd) {
        cmd.execute();
        undoStack.push(cmd);

        // 新操作清空重做栈
        redoStack.clear();

        // 限制撤销栈大小
        if (undoStack.size() > maxHistorySize) {
            undoStack.removeLast();  // 丢弃最旧的命令
        }

        System.out.println("执行: " + cmd.getName());
    }

    /**
     * 撤销最近执行的命令
     */
    public boolean undo() {
        if (undoStack.isEmpty()) {
            System.out.println("没有可撤销的操作");
            return false;
        }

        Command cmd = undoStack.pop();
        cmd.undo();
        redoStack.push(cmd);

        System.out.println("撤销: " + cmd.getName());
        return true;
    }

    /**
     * 重做最近被撤销的命令
     */
    public boolean redo() {
        if (redoStack.isEmpty()) {
            System.out.println("没有可重做的操作");
            return false;
        }

        Command cmd = redoStack.pop();
        cmd.execute();
        undoStack.push(cmd);

        System.out.println("重做: " + cmd.getName());
        return true;
    }

    /** 获取可撤销的命令数 */
    public int getUndoCount() {
        return undoStack.size();
    }

    /** 获取可重做的命令数 */
    public int getRedoCount() {
        return redoStack.size();
    }

    /** 清空所有历史 */
    public void clear() {
        undoStack.clear();
        redoStack.clear();
    }
}
```

**文本编辑器测试**

```java
public class TextEditorTest {
    public static void main(String[] args) {
        TextEditor editor = new TextEditor();
        CommandManager manager = new CommandManager();

        System.out.println("===== 文本编辑器命令模式演示 =====");

        // 第一步：插入 "Hello World"
        Command insertHello = new InsertCommand(editor, 0, "Hello World");
        manager.executeCommand(insertHello);
        System.out.println("当前内容: [" + editor + "]\n");

        // 第二步：在位置5插入 "Beautiful "
        Command insertBeautiful = new InsertCommand(editor, 6, "Beautiful ");
        manager.executeCommand(insertBeautiful);
        System.out.println("当前内容: [" + editor + "]\n");

        // 第三步：删除 "World"
        Command deleteWorld = new DeleteCommand(editor, 16, 21);
        manager.executeCommand(deleteWorld);
        System.out.println("当前内容: [" + editor + "]\n");

        // 第四步：替换
        Command replace = new ReplaceCommand(editor, 6, 16, "Amazing ");
        manager.executeCommand(replace);
        System.out.println("当前内容: [" + editor + "]\n");

        // 撤销两次
        System.out.println("===== 撤销两次 =====");
        manager.undo();  // 撤销替换
        System.out.println("当前内容: [" + editor + "]\n");

        manager.undo();  // 撤销删除
        System.out.println("当前内容: [" + editor + "]\n");

        // 重做一次
        System.out.println("===== 重做一次 =====");
        manager.redo();
        System.out.println("当前内容: [" + editor + "]\n");
    }
}
```

运行结果：

```
===== 文本编辑器命令模式演示 =====
执行: 插入[Hello World]
当前内容: [Hello World]

执行: 插入[Beautiful ]
当前内容: [Hello Beautiful World]

执行: 删除[16-21]
当前内容: [Hello Beautiful ]

执行: 替换[Beautiful ->Amazing ]
当前内容: [Hello Amazing ]

===== 撤销两次 =====
撤销: 替换[Beautiful ->Amazing ]
当前内容: [Hello Beautiful ]

撤销: 删除[16-21]
当前内容: [Hello Beautiful World]

===== 重做一次 =====
重做: 删除[16-21]
当前内容: [Hello Beautiful ]
```

### 16.3.3 示例2：智能家居遥控器

**设备接口（接收者接口）**

```java
/**
 * 智能家居设备的通用接口
 * 所有设备都支持开关和状态查询
 */
public interface SmartDevice {
    void turnOn();
    void turnOff();
    boolean isOn();
    String getName();
}

/**
 * 电灯
 */
public class Light implements SmartDevice {
    private final String name;
    private boolean on = false;

    public Light(String name) {
        this.name = name;
    }

    @Override
    public void turnOn() {
        this.on = true;
        System.out.println(name + " 灯已打开");
    }

    @Override
    public void turnOff() {
        this.on = false;
        System.out.println(name + " 灯已关闭");
    }

    @Override
    public boolean isOn() {
        return on;
    }

    @Override
    public String getName() {
        return name + "灯";
    }
}

/**
 * 风扇
 */
public class Fan implements SmartDevice {
    public static final int OFF = 0;
    public static final int LOW = 1;
    public static final int MEDIUM = 2;
    public static final int HIGH = 3;

    private final String name;
    private boolean on = false;
    private int speed = OFF;

    public Fan(String name) {
        this.name = name;
    }

    @Override
    public void turnOn() {
        this.on = true;
        this.speed = LOW;  // 默认低档
        System.out.println(name + " 风扇已打开，档位: " + speed);
    }

    @Override
    public void turnOff() {
        this.on = false;
        this.speed = OFF;
        System.out.println(name + " 风扇已关闭");
    }

    @Override
    public boolean isOn() {
        return on;
    }

    @Override
    public String getName() {
        return name + "风扇";
    }

    public void setSpeed(int speed) {
        this.speed = speed;
        this.on = speed > OFF;
        System.out.println(name + " 风扇档位设置为: " + speed);
    }

    public int getSpeed() {
        return speed;
    }
}
```

**设备命令**

```java
/**
 * 开灯命令
 */
public class LightOnCommand implements Command {
    private final Light light;

    public LightOnCommand(Light light) {
        this.light = light;
    }

    @Override
    public void execute() {
        light.turnOn();
    }

    @Override
    public void undo() {
        light.turnOff();
    }

    @Override
    public String getName() {
        return "打开" + light.getName();
    }
}

/**
 * 关灯命令
 */
public class LightOffCommand implements Command {
    private final Light light;

    public LightOffCommand(Light light) {
        this.light = light;
    }

    @Override
    public void execute() {
        light.turnOff();
    }

    @Override
    public void undo() {
        light.turnOn();
    }

    @Override
    public String getName() {
        return "关闭" + light.getName();
    }
}

/**
 * 风扇命令 - 支持切换到指定档位
 */
public class FanCommand implements Command {
    private final Fan fan;
    private final int targetSpeed;
    private int previousSpeed;  // 保存之前的档位，便于撤销

    public FanCommand(Fan fan, int targetSpeed) {
        this.fan = fan;
        this.targetSpeed = targetSpeed;
    }

    @Override
    public void execute() {
        this.previousSpeed = fan.getSpeed();
        fan.setSpeed(targetSpeed);
    }

    @Override
    public void undo() {
        fan.setSpeed(previousSpeed);
    }

    @Override
    public String getName() {
        return "风扇" + fan.getName() + "->档位" + targetSpeed;
    }
}
```

**宏命令 - 组合多个命令**

```java
/**
 * 宏命令 - 组合模式与命令模式的结合
 * 一个宏命令包含一组子命令，执行时依次调用所有子命令
 */
public class MacroCommand implements Command {
    private final List<Command> commands = new ArrayList<>();
    private final String name;

    public MacroCommand(String name) {
        this.name = name;
    }

    public MacroCommand(String name, List<Command> commands) {
        this.name = name;
        this.commands.addAll(commands);
    }

    /** 添加子命令 */
    public MacroCommand add(Command command) {
        commands.add(command);
        return this;
    }

    @Override
    public void execute() {
        System.out.println("===== 执行宏命令: " + name + " =====");
        for (Command cmd : commands) {
            cmd.execute();
        }
        System.out.println("===== 宏命令: " + name + " 执行完毕 =====");
    }

    @Override
    public void undo() {
        System.out.println("===== 撤销宏命令: " + name + " =====");
        // 逆序撤销子命令
        for (int i = commands.size() - 1; i >= 0; i--) {
            commands.get(i).undo();
        }
        System.out.println("===== 宏命令: " + name + " 已撤销 =====");
    }

    @Override
    public String getName() {
        return "宏命令[" + name + "](" + commands.size() + "个子命令)";
    }
}
```

**遥控器（调用者）**

```java
/**
 * 智能家居遥控器 - 充当调用者角色
 * 每个按钮可以绑定一个命令
 */
public class RemoteControl {
    /** 最多支持10个设备按钮 */
    private static final int SLOT_COUNT = 10;

    /** 开按钮 */
    private final Command[] onCommands;
    /** 关按钮 */
    private final Command[] offCommands;

    /** 上一次执行的命令（用于全局撤销） */
    private Command lastCommand;

    /** 撤销/重做历史 */
    private final CommandManager commandManager = new CommandManager();

    public RemoteControl() {
        onCommands = new Command[SLOT_COUNT];
        offCommands = new Command[SLOT_COUNT];

        // 初始化为空命令（避免空指针检查）
        Command noCommand = new NoCommand();
        for (int i = 0; i < SLOT_COUNT; i++) {
            onCommands[i] = noCommand;
            offCommands[i] = noCommand;
        }
        lastCommand = noCommand;
    }

    /**
     * 设置指定插槽的命令
     * @param slot       插槽编号
     * @param onCommand  开按钮绑定的命令
     * @param offCommand 关按钮绑定的命令
     */
    public void setCommand(int slot, Command onCommand, Command offCommand) {
        onCommands[slot] = onCommand;
        offCommands[slot] = offCommand;
    }

    /** 按下开按钮 */
    public void pressOnButton(int slot) {
        onCommands[slot].execute();
        lastCommand = onCommands[slot];
        commandManager.executeCommand(onCommands[slot]);
    }

    /** 按下关按钮 */
    public void pressOffButton(int slot) {
        offCommands[slot].execute();
        lastCommand = offCommands[slot];
        commandManager.executeCommand(offCommands[slot]);
    }

    /** 全局撤销按钮 */
    public void pressUndoButton() {
        commandManager.undo();
    }

    /** 全局重做按钮 */
    public void pressRedoButton() {
        commandManager.redo();
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("\n===== 遥控器配置 =====\n");
        for (int i = 0; i < SLOT_COUNT; i++) {
            if (!(onCommands[i] instanceof NoCommand)) {
                sb.append("[插槽").append(i).append("] ")
                  .append(onCommands[i].getName())
                  .append(" / ")
                  .append(offCommands[i].getName())
                  .append("\n");
            }
        }
        sb.append("[撤销] [重做]\n");
        return sb.toString();
    }
}

/**
 * 空命令 - 用作默认值，避免空指针检查
 * 这是命令模式中的一个常用技巧
 */
public class NoCommand implements Command {
    @Override
    public void execute() {
        // 什么都不做
    }

    @Override
    public void undo() {
        // 什么都不做
    }

    @Override
    public String getName() {
        return "空命令";
    }
}
```

**智能家居测试**

```java
public class SmartHomeTest {
    public static void main(String[] args) {
        System.out.println("===== 智能家居遥控器演示 =====");

        // 创建设备（接收者）
        Light livingRoomLight = new Light("客厅");
        Light bedroomLight = new Light("卧室");
        Fan ceilingFan = new Fan("客厅");

        // 创建设备命令
        LightOnCommand livingRoomLightOn = new LightOnCommand(livingRoomLight);
        LightOffCommand livingRoomLightOff = new LightOffCommand(livingRoomLight);

        LightOnCommand bedroomLightOn = new LightOnCommand(bedroomLight);
        LightOffCommand bedroomLightOff = new LightOffCommand(bedroomLight);

        FanCommand fanHigh = new FanCommand(ceilingFan, Fan.HIGH);
        FanCommand fanMedium = new FanCommand(ceilingFan, Fan.MEDIUM);
        FanCommand fanOff = new FanCommand(ceilingFan, Fan.OFF);

        // 创建遥控器（调用者）
        RemoteControl remote = new RemoteControl();

        // 绑定命令到插槽
        remote.setCommand(0, livingRoomLightOn, livingRoomLightOff);
        remote.setCommand(1, bedroomLightOn, bedroomLightOff);
        remote.setCommand(2, fanHigh, fanOff);

        System.out.println(remote);

        // 测试按钮
        System.out.println("--- 打开客厅灯 ---");
        remote.pressOnButton(0);

        System.out.println("\n--- 打开卧室灯 ---");
        remote.pressOnButton(1);

        System.out.println("\n--- 风扇调至高速 ---");
        remote.pressOnButton(2);

        // 测试撤销
        System.out.println("\n--- 撤销风扇操作 ---");
        remote.pressUndoButton();

        System.out.println("\n--- 重做风扇操作 ---");
        remote.pressRedoButton();

        // 创建宏命令:"电影模式"
        System.out.println("\n===== 电影模式宏命令 =====");
        MacroCommand movieMode = new MacroCommand("电影模式");
        movieMode.add(new LightOffCommand(livingRoomLight))    // 关客厅灯
                 .add(new LightOffCommand(bedroomLight))       // 关卧室灯
                 .add(new FanCommand(ceilingFan, Fan.LOW));    // 风扇低档

        // 将宏命令绑定到插槽3
        remote.setCommand(3, movieMode, new MacroCommand("退出电影模式")
                .add(new LightOnCommand(livingRoomLight))
                .add(new FanCommand(ceilingFan, Fan.OFF)));

        System.out.println("\n--- 启动电影模式 ---");
        remote.pressOnButton(3);

        System.out.println("\n--- 撤销电影模式 ---");
        remote.pressUndoButton();
    }
}
```

### 16.3.4 函数式命令（Java 8+）

```java
/**
 * 使用 Java 8 Lambda 表达式简化命令模式
 * 对于只有一个 execute 方法的命令，可以用 Runnable 替代
 */
public class FunctionalCommands {

    /**
     * 带撤销支持的可函数式命令
     */
    @FunctionalInterface
    public interface UndoableAction {
        void execute();

        /** 默认的撤销动作，可由用户指定 */
        default Runnable getUndoAction() {
            return () -> {};
        }

        /** 创建同时包含执行和撤销的完整命令 */
        static Command of(String name, Runnable executeAction, Runnable undoAction) {
            return new Command() {
                @Override
                public void execute() {
                    executeAction.run();
                }

                @Override
                public void undo() {
                    undoAction.run();
                }

                @Override
                public String getName() {
                    return name;
                }
            };
        }
    }

    // 使用示例
    public static void main(String[] args) {
        TextEditor editor = new TextEditor();
        CommandManager manager = new CommandManager();

        // 使用 Lambda 创建插入命令
        Command insertCmd = UndoableAction.of(
            "Lambda插入",
            () -> editor.insert(0, "Lambda "),
            () -> editor.delete(0, 7)
        );

        manager.executeCommand(insertCmd);
        System.out.println("内容: " + editor);

        // 使用方法引用
        Command anotherCmd = UndoableAction.of(
            "方法引用插入",
            () -> editor.insert(editor.length(), "World"),
            () -> editor.delete(editor.length() - 5, editor.length())
        );

        manager.executeCommand(anotherCmd);
        System.out.println("内容: " + editor);

        manager.undo();
        System.out.println("撤销后: " + editor);
    }
}
```

## 16.4 JDK/框架源码解析

### 16.4.1 java.lang.Runnable — 简化命令模式

Runnable 是命令模式最简洁的体现：将一段代码封装为对象，可以在任意线程中执行。

```java
/**
 * java.lang.Runnable 接口
 * 这就是一个最简化的命令接口
 */
@FunctionalInterface
public interface Runnable {
    public abstract void run();  // 相当于 Command.execute()
}

// 使用示例：
// 1. 创建命令
Runnable emailTask = () -> sendEmail(user, "Welcome!");
Runnable logTask = () -> logger.info("User registered: {}", user);

// 2. 命令执行者（Invoker）
ExecutorService executor = Executors.newFixedThreadPool(10);

// 3. 提交执行
executor.execute(emailTask);  // 多线程执行
executor.execute(logTask);

// 为什么 Runnable 只是"简化版命令模式"？
// - 只有 execute，没有 undo
// - 没有 Receiver 的显式绑定（通常通过闭包或 Lambda 实现）
// - 但核心思想完全一致：将"行为"封装为"对象"
```

### 16.4.2 javax.swing.Action 和 AbstractAction

Swing 的 Action 接口是命令模式在 GUI 编程中的经典应用。

```java
/**
 * javax.swing.Action 接口（简化版）
 * 继承自 ActionListener，是命令接口的扩展版本
 */
public interface Action extends ActionListener {
    // 命令属性
    public static final String NAME = "Name";
    public static final String SMALL_ICON = "SmallIcon";
    public static final String SHORT_DESCRIPTION = "ShortDescription";

    // 相当于 execute()
    void actionPerformed(ActionEvent e);

    // 命令的元数据
    Object getValue(String key);
    void putValue(String key, Object value);

    // 使能/禁用命令
    void setEnabled(boolean b);
    boolean isEnabled();

    // 状态变更监听
    void addPropertyChangeListener(PropertyChangeListener listener);
    void removePropertyChangeListener(PropertyChangeListener listener);
}

/**
 * 使用 Action 实现命令模式的优势：
 * 按钮、菜单项、快捷键可以共享同一个命令对象
 */
public class CommandPatternInSwing {
    public static void main(String[] args) {
        JFrame frame = new JFrame("命令模式 - Swing示例");

        // 创建一个保存命令（Action）
        // 同时具备：名称、图标、快捷键、执行逻辑
        SaveAction saveAction = new SaveAction();

        // 三个不同的调用者共享同一个命令对象
        JButton saveButton = new JButton(saveAction);           // ① Button
        JMenuItem saveMenuItem = new JMenuItem(saveAction);     // ② MenuItem
        // Ctrl+S 快捷键绑定到同一个命令
        saveButton.getInputMap(JComponent.WHEN_IN_FOCUSED_WINDOW)
                  .put(KeyStroke.getKeyStroke("control S"), "save");
        saveButton.getActionMap().put("save", saveAction);      // ③ 快捷键

        frame.add(saveButton);
        frame.setVisible(true);
    }
}

/**
 * 具体的命令实现
 * 一个命令对象同时服务于按钮、菜单和快捷键
 */
class SaveAction extends AbstractAction {
    public SaveAction() {
        putValue(Action.NAME, "保存");
        putValue(Action.SMALL_ICON, new ImageIcon("save.png"));
        putValue(Action.SHORT_DESCRIPTION, "保存当前文档 (Ctrl+S)");
        putValue(Action.ACCELERATOR_KEY,
                 KeyStroke.getKeyStroke("control S"));
    }

    @Override
    public void actionPerformed(ActionEvent e) {
        System.out.println("执行保存操作...");
        // 实际的保存逻辑
        // document.save();
    }
}
```

### 16.4.3 Spring JdbcTemplate 回调模式

Spring JdbcTemplate 大量使用回调接口，这些接口本质上是命令模式。

```java
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.PreparedStatementCallback;
import org.springframework.jdbc.core.ResultSetExtractor;

import javax.sql.DataSource;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * 将 SQL 操作封装为命令对象，由 JdbcTemplate 统一执行
 */
public class JdbcTemplateCommandExample {

    private final JdbcTemplate jdbcTemplate;

    public JdbcTemplateCommandExample(DataSource dataSource) {
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    /**
     * RowCallbackHandler —— "行处理命令"
     * 每一行数据都被传递给这个命令对象处理
     */
    public List<User> findAllUsers() {
        List<User> users = new ArrayList<>();

        // 创建一个"行处理命令"
        RowCallbackHandler handler = new RowCallbackHandler() {
            @Override
            public void processRow(ResultSet rs) throws SQLException {
                // 这就是命令的 execute() 方法
                User user = new User();
                user.setId(rs.getLong("id"));
                user.setName(rs.getString("name"));
                user.setEmail(rs.getString("email"));
                users.add(user);
            }
        };

        // JdbcTemplate 作为 Invoker，执行查询并将每行交给命令处理
        jdbcTemplate.query("SELECT * FROM users", handler);

        return users;
    }

    /**
     * PreparedStatementCallback —— "预编译语句命令"
     * 完全控制 PreparedStatement 的执行
     */
    public int batchUpdateUsers(List<User> users) {
        PreparedStatementCallback<Integer> callback = new PreparedStatementCallback<Integer>() {
            @Override
            public Integer doInPreparedStatement(PreparedStatement ps)
                    throws SQLException {
                // 命令的 execute()
                int total = 0;
                for (User user : users) {
                    ps.setString(1, user.getName());
                    ps.setString(2, user.getEmail());
                    ps.setLong(3, user.getId());
                    total += ps.executeUpdate();
                }
                return total;
            }
        };

        return jdbcTemplate.execute(
            "UPDATE users SET name = ?, email = ? WHERE id = ?",
            callback);
    }

    /**
     * Lambda 版本 —— 更简洁的命令创建
     */
    public List<String> findAllNames() {
        // 使用 Lambda 创建 RowCallbackHandler
        List<String> names = new ArrayList<>();
        jdbcTemplate.query(
            "SELECT name FROM users",
            (ResultSet rs) -> names.add(rs.getString("name"))
        );
        return names;
    }

    static class User {
        private Long id;
        private String name;
        private String email;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
    }
}

/**
 * JdbcTemplate 的命令模式分析：
 *
 * ┌───────────────────┐       ┌─────────────────────┐
 * │      Client       │       │    RowCallbackHandler│
 * │   (业务代码)       │       │    (命令接口)         │
 * ├───────────────────┤       ├─────────────────────┤
 * │ 创建回调对象        │──────►│ + processRow(rs)    │
 * │ 传入 JdbcTemplate  │       └─────────────────────┘
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │   JdbcTemplate    │
 * │   (Invoker)       │
 * ├───────────────────┤
 * │ + query(sql, rch) │──────► 对结果集的每一行，调用
 * │ + execute(sql,psc)│       回调的 processRow 方法
 * └───────────────────┘
 */
```

### 16.4.4 Quartz Job 接口 — 定时任务命令

```java
import org.quartz.*;

/**
 * org.quartz.Job 接口
 * 定时任务系统中的命令模式
 */
public interface Job {
    /**
     * 命令的执行方法
     * @param context 包含执行所需的全部信息
     * @throws JobExecutionException 执行异常
     */
    void execute(JobExecutionContext context) throws JobExecutionException;
}

/**
 * 具体的定时任务 - 发送邮件通知
 */
public class EmailNotificationJob implements Job {
    @Override
    public void execute(JobExecutionContext context) throws JobExecutionException {
        // 从上下文中获取参数
        JobDataMap dataMap = context.getJobDetail().getJobDataMap();
        String email = dataMap.getString("email");
        String message = dataMap.getString("message");

        // 执行命令
        System.out.println("发送邮件到: " + email + ", 内容: " + message);
        // mailService.send(email, message);
    }
}

/**
 * Quartz 的命令模式分析：
 *
 * ┌───────────────┐    ┌─────────────┐    ┌──────────────────┐
 * │  Scheduler    │───►│    Job      │───►│  EmailJob        │
 * │  (Invoker)    │    │  (Command)  │    │  (ConcreteCmd)   │
 * └───────────────┘    └─────────────┘    └──────────────────┘
 *
 * Scheduler：    Invoker，在指定时间调用 Job.execute()
 * Job：          命令接口
 * EmailJob：     具体命令，实现邮件发送逻辑
 * JobDataMap：   命令参数，在创建时设置
 */

// 使用示例
public class QuartzExample {
    public static void main(String[] args) throws SchedulerException {
        SchedulerFactory schedFact = new org.quartz.impl.StdSchedulerFactory();
        Scheduler scheduler = schedFact.getScheduler();

        // 创建命令（JobDetail）
        JobDetail job = JobBuilder.newJob(EmailNotificationJob.class)
                .withIdentity("emailJob", "group1")
                .usingJobData("email", "user@example.com")
                .usingJobData("message", "您的订单已发货")
                .build();

        // 设置触发器（执行时间）
        Trigger trigger = TriggerBuilder.newTrigger()
                .withIdentity("emailTrigger", "group1")
                .startNow()
                .withSchedule(SimpleScheduleBuilder.simpleSchedule()
                        .withIntervalInSeconds(60)
                        .repeatForever())
                .build();

        // 将命令注册到调度器
        scheduler.scheduleJob(job, trigger);
        scheduler.start();
    }
}
```

### 16.4.5 Spring Data Redis RedisCallback

```java
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.connection.RedisConnection;

/**
 * Spring Data Redis 中的命令模式
 * RedisCallback 将 Redis 操作封装为命令对象
 */
public class RedisCommandExample {

    private final RedisTemplate<String, String> redisTemplate;

    public RedisCommandExample(RedisTemplate<String, String> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * 使用 RedisCallback 执行 pipeline 批量操作
     */
    public void batchWriteWithPipeline() {
        // 创建命令对象
        RedisCallback<List<Object>> pipelineCommand = new RedisCallback<List<Object>>() {
            @Override
            public List<Object> doInRedis(RedisConnection connection) {
                // connection 就是 Receiver
                connection.openPipeline();

                // 多个操作命令
                connection.set("key1".getBytes(), "value1".getBytes());
                connection.set("key2".getBytes(), "value2".getBytes());
                connection.set("key3".getBytes(), "value3".getBytes());

                return connection.closePipeline();
            }
        };

        // RedisTemplate 作为 Invoker 执行命令
        List<Object> results = redisTemplate.execute(pipelineCommand);
    }
}
```

## 16.5 使用场景与案例

### 16.5.1 事务管理器

```java
/**
 * 数据库事务管理器 - 使用命令模式实现事务的提交和回滚
 * 每个数据库操作都是一个命令，支持批量提交和回滚
 */
public class TransactionManager {
    private final List<Command> transactionCommands = new ArrayList<>();

    /**
     * 添加一个数据库操作到事务中
     */
    public void addCommand(Command dbCommand) {
        transactionCommands.add(dbCommand);
    }

    /**
     * 提交事务：依次执行所有命令
     */
    public void commit() {
        System.out.println("===== 开始提交事务 =====");
        try {
            for (Command cmd : transactionCommands) {
                cmd.execute();
            }
            System.out.println("===== 事务提交成功 =====");
        } catch (Exception e) {
            System.err.println("事务执行失败，开始回滚: " + e.getMessage());
            rollback();
            throw new RuntimeException("事务提交失败，已回滚", e);
        }
    }

    /**
     * 回滚事务：逆序撤销所有已执行的命令
     */
    public void rollback() {
        System.out.println("===== 开始回滚事务 =====");
        for (int i = transactionCommands.size() - 1; i >= 0; i--) {
            try {
                transactionCommands.get(i).undo();
            } catch (Exception e) {
                System.err.println("回滚失败: " + e.getMessage());
            }
        }
        System.out.println("===== 事务回滚完成 =====");
    }

    public void clear() {
        transactionCommands.clear();
    }

    // 使用示例
    public static void main(String[] args) {
        BankAccount account = new BankAccount("123456", 1000);

        TransactionManager tm = new TransactionManager();

        // 添加两个转账命令
        tm.addCommand(new TransferCommand(account, "A", 500));
        tm.addCommand(new TransferCommand(account, "B", 300));

        System.out.println("转账前余额: " + account.getBalance());

        // 提交事务
        tm.commit();
        System.out.println("转账后余额: " + account.getBalance());
    }
}

/**
 * 银行账户 - 接收者
 */
class BankAccount {
    private final String accountNumber;
    private double balance;
    private final List<String> transactionLog = new ArrayList<>();

    public BankAccount(String accountNumber, double balance) {
        this.accountNumber = accountNumber;
        this.balance = balance;
    }

    public void deposit(double amount) {
        balance += amount;
        transactionLog.add("存入: " + amount);
    }

    public void withdraw(double amount) {
        if (balance < amount) {
            throw new RuntimeException("余额不足");
        }
        balance -= amount;
        transactionLog.add("取出: " + amount);
    }

    public double getBalance() { return balance; }

    public void rollbackTransaction(String description) {
        // 简化：回滚到上一个状态
        transactionLog.add("回滚: " + description);
    }
}

/**
 * 转账命令
 */
class TransferCommand implements Command {
    private final BankAccount account;
    private final String target;
    private final double amount;

    public TransferCommand(BankAccount account, String target, double amount) {
        this.account = account;
        this.target = target;
        this.amount = amount;
    }

    @Override
    public void execute() {
        account.withdraw(amount);
        System.out.printf("转账 %.2f 到 %s 成功%n", amount, target);
    }

    @Override
    public void undo() {
        account.deposit(amount);
        account.rollbackTransaction("撤销转账 " + amount + " 到 " + target);
        System.out.printf("撤销转账 %.2f 到 %s%n", amount, target);
    }

    @Override
    public String getName() {
        return "转账[" + amount + "->" + target + "]";
    }
}
```

### 16.5.2 任务队列系统

```java
import java.util.concurrent.*;

/**
 * 异步任务队列 - 命令模式结合生产者-消费者模式
 * 任务被封装为命令对象，放入队列，由工作线程异步执行
 */
public class TaskQueue {
    private final BlockingQueue<Command> queue = new LinkedBlockingQueue<>();
    private final ExecutorService executor;
    private volatile boolean running = true;

    public TaskQueue(int threadCount) {
        this.executor = Executors.newFixedThreadPool(threadCount);
        startWorkers(threadCount);
    }

    private void startWorkers(int count) {
        for (int i = 0; i < count; i++) {
            executor.submit(() -> {
                while (running) {
                    try {
                        // 从队列中取出命令执行
                        Command cmd = queue.take();
                        System.out.printf("[Worker-%s] 执行: %s%n",
                                Thread.currentThread().getName(), cmd.getName());
                        cmd.execute();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    } catch (Exception e) {
                        System.err.println("任务执行失败: " + e.getMessage());
                    }
                }
            });
        }
    }

    /** 提交任务 */
    public void submit(Command cmd) {
        queue.offer(cmd);
    }

    /** 提交优先级任务 */
    public void submitUrgent(Command cmd) {
        try {
            queue.put(cmd);  // 队列满时阻塞
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** 停止任务队列 */
    public void shutdown() {
        running = false;
        executor.shutdown();
    }

    /** 获取队列中的任务数 */
    public int pendingTasks() {
        return queue.size();
    }

    // 使用示例
    public static void main(String[] args) throws Exception {
        TaskQueue taskQueue = new TaskQueue(3);

        // 提交多个任务
        for (int i = 0; i < 10; i++) {
            final int taskId = i;
            taskQueue.submit(new Command() {
                @Override
                public void execute() {
                    System.out.println("任务 #" + taskId + " 开始执行");
                    try {
                        Thread.sleep(ThreadLocalRandom.current().nextInt(500, 1500));
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    System.out.println("任务 #" + taskId + " 执行完成");
                }

                @Override
                public void undo() {
                    System.out.println("任务 #" + taskId + " 撤销");
                }

                @Override
                public String getName() {
                    return "Task#" + taskId;
                }
            });
        }

        System.out.println("已提交10个任务，等待执行...");
        System.out.println("当前待执行任务数: " + taskQueue.pendingTasks());

        Thread.sleep(5000);
        taskQueue.shutdown();
    }
}
```

### 16.5.3 餐厅点餐系统

```java
/**
 * 餐厅点餐系统 - 命令模式在订单处理中的应用
 */
public class RestaurantOrderSystem {

    /**
     * 订单项
     */
    public static class OrderItem {
        private final String name;
        private final double price;

        public OrderItem(String name, double price) {
            this.name = name;
            this.price = price;
        }

        public String getName() { return name; }
        public double getPrice() { return price; }
    }

    /**
     * 厨房 - 真正的接收者
     */
    public static class Kitchen {
        public void prepareDish(String dishName) {
            System.out.println("厨房开始制作: " + dishName);
        }

        public void cancelDish(String dishName) {
            System.out.println("厨房取消制作: " + dishName);
        }
    }

    /**
     * 订单命令
     */
    public static class OrderCommand implements Command {
        private final Kitchen kitchen;
        private final String dishName;
        private final double price;

        public OrderCommand(Kitchen kitchen, String dishName, double price) {
            this.kitchen = kitchen;
            this.dishName = dishName;
            this.price = price;
        }

        @Override
        public void execute() {
            kitchen.prepareDish(dishName);
        }

        @Override
        public void undo() {
            kitchen.cancelDish(dishName);
        }

        @Override
        public String getName() {
            return "点餐[" + dishName + ", ¥" + price + "]";
        }
    }

    /**
     * 订单 - 宏命令（包含多个 OrderCommand）
     */
    public static class Order extends MacroCommand {
        private final int tableNumber;
        private final List<OrderItem> items = new ArrayList<>();
        private double total = 0;

        public Order(int tableNumber) {
            super("订单#" + tableNumber);
            this.tableNumber = tableNumber;
        }

        /** 添加菜品 */
        public void addItem(OrderItem item, Kitchen kitchen) {
            items.add(item);
            total += item.getPrice();
            add(new OrderCommand(kitchen, item.getName(), item.getPrice()));
        }

        /** 移除菜品 */
        public void removeItem(int index) {
            if (index >= 0 && index < items.size()) {
                OrderItem removed = items.remove(index);
                total -= removed.getPrice();
                System.out.println("已移除: " + removed.getName());
            }
        }

        public double getTotal() { return total; }

        @Override
        public String getName() {
            return "订单#" + tableNumber + "(" + items.size() + "道菜)";
        }
    }

    /**
     * 服务员 - 调用者
     */
    public static class Waiter {
        private final CommandManager commandManager = new CommandManager();

        public void takeOrder(Order order) {
            System.out.println("服务员接收订单: " + order.getName());
            commandManager.executeCommand(order);
        }

        public void cancelOrder() {
            System.out.println("服务员取消订单...");
            commandManager.undo();
        }
    }

    // 使用示例
    public static void main(String[] args) {
        Kitchen kitchen = new Kitchen();
        Waiter waiter = new Waiter();

        Order order = new Order(5);
        order.addItem(new OrderItem("宫保鸡丁", 38.0), kitchen);
        order.addItem(new OrderItem("鱼香肉丝", 32.0), kitchen);
        order.addItem(new OrderItem("米饭", 3.0), kitchen);

        System.out.println("===== 顾客点餐 =====");
        waiter.takeOrder(order);

        System.out.println("\n===== 顾客取消订单 =====");
        waiter.cancelOrder();
    }
}
```

### 16.5.4 游戏输入处理

```java
/**
 * 游戏输入处理 - 命令模式实现可配置的按键绑定
 */
public class GameInputHandler {

    /** 按键与命令的映射 */
    private final Map<String, Command> keyBindings = new HashMap<>();

    /** 用于回放的历史记录 */
    private final List<Command> commandHistory = new ArrayList<>();

    public void bindKey(String key, Command command) {
        keyBindings.put(key, command);
    }

    /**
     * 处理按键输入
     */
    public void handleInput(String key) {
        Command cmd = keyBindings.get(key);
        if (cmd != null) {
            cmd.execute();
            commandHistory.add(cmd);  // 记录回放
        } else {
            System.out.println("未绑定的按键: " + key);
        }
    }

    /**
     * 回放所有已执行的操作
     */
    public void replay() {
        System.out.println("===== 开始回放 =====");
        for (Command cmd : commandHistory) {
            cmd.execute();
        }
        System.out.println("===== 回放结束 =====");
    }

    // 游戏命令
    static class MoveCommand implements Command {
        private final String direction;

        MoveCommand(String direction) { this.direction = direction; }

        @Override
        public void execute() {
            System.out.println("角色向" + direction + "移动");
        }

        @Override
        public void undo() {
            String opposite = switch (direction) {
                case "上" -> "下";
                case "下" -> "上";
                case "左" -> "右";
                case "右" -> "左";
                default -> throw new IllegalStateException();
            };
            System.out.println("角色向" + opposite + "移动(撤销)");
        }

        @Override
        public String getName() { return "移动[" + direction + "]"; }
    }

    static class JumpCommand implements Command {
        @Override
        public void execute() { System.out.println("角色跳跃"); }
        @Override
        public void undo() { System.out.println("角色落下(撤销跳跃)"); }
        @Override
        public String getName() { return "跳跃"; }
    }

    static class AttackCommand implements Command {
        @Override
        public void execute() { System.out.println("角色攻击"); }
        @Override
        public void undo() { System.out.println("撤销攻击"); }
        @Override
        public String getName() { return "攻击"; }
    }

    // 使用示例
    public static void main(String[] args) {
        GameInputHandler handler = new GameInputHandler();

        // 绑定按键
        handler.bindKey("W", new MoveCommand("上"));
        handler.bindKey("S", new MoveCommand("下"));
        handler.bindKey("A", new MoveCommand("左"));
        handler.bindKey("D", new MoveCommand("右"));
        handler.bindKey("SPACE", new JumpCommand());
        handler.bindKey("J", new AttackCommand());

        // 模拟玩家操作
        System.out.println("===== 玩家操作 =====");
        handler.handleInput("W");
        handler.handleInput("D");
        handler.handleInput("SPACE");
        handler.handleInput("J");

        // 回放操作
        System.out.println();
        handler.replay();
    }
}
```

## 16.6 潜在风险与问题

### 16.6.1 类爆炸

每一个操作都需要一个具体命令类，导致类数量急剧增加。

```java
// 问题：每个操作对应一个命令类
class SaveCommand implements Command { ... }
class PrintCommand implements Command { ... }
class ExportCommand implements Command { ... }
class ImportCommand implements Command { ... }
class SendCommand implements Command { ... }
// ... 可能几十上百个命令类

// 优化方案1：使用内部类或匿名类
public class DocumentEditor {
    // 命令作为内部类，减少顶层类的数量
    public class SaveCommand implements Command { ... }
    public class PrintCommand implements Command { ... }
}

// 优化方案2：使用 Lambda（Java 8+）
Runnable saveCmd = () -> document.save();
Runnable printCmd = () -> document.print();
```

### 16.6.2 命令对象内存开销

每个命令都携带执行所需的全量信息，队列中积压大量命令时内存占用显著。

```java
// 问题：每个命令对象携带所有参数
for (int i = 0; i < 100_000; i++) {
    // 创建 10 万个命令对象
    queue.submit(new SendEmailCommand(
        userList.get(i),
        template,
        attachments.get(i)
    ));
}

// 解决方案1：命令对象池
public class CommandPool<T extends Command> {
    private final Queue<T> pool = new LinkedList<>();

    public T borrow() {
        T cmd = pool.poll();
        if (cmd == null) {
            cmd = createNew();
        }
        return cmd;
    }

    public void return_(T cmd) {
        cmd.reset();  // 重置状态
        pool.offer(cmd);  // 归还对象池
    }
}

// 解决方案2：共享不可变参数
public class SendEmailCommand implements Command {
    private static final EmailTemplate DEFAULT_TEMPLATE =
        new EmailTemplate("welcome.ftl");  // 共享模板

    private final User user;
    // template 由所有实例共享，不需要每个命令都创建
}
```

### 16.6.3 撤销的复杂性

当涉及外部系统状态变化时，撤销变得异常复杂。

```java
// 问题：涉及外部系统的操作难以撤销
public class SendEmailCommand implements Command {
    @Override
    public void execute() {
        emailService.send(email);  // 邮件已经发送出去了
    }

    @Override
    public void undo() {
        // ❌ 无法"撤销"一封已经发送的邮件
        // 只能发送一封"撤回"邮件作为补偿
        emailService.send(new Email(email.getTo(),
            "系统消息", "抱歉，上一条消息已被发送者撤销"));
    }
}

// 解决方案：补偿事务（Compensating Transaction）
public class CompensatingCommand implements Command {
    private final Command originalCommand;
    private final Command compensatingCommand;  // 补偿操作

    public CompensatingCommand(Command original, Command compensating) {
        this.originalCommand = original;
        this.compensatingCommand = compensating;
    }

    @Override
    public void execute() {
        originalCommand.execute();
    }

    @Override
    public void undo() {
        compensatingCommand.execute();  // 执行补偿操作
    }
}
```

### 16.6.4 命令序列化问题

将命令持久化到队列或日志中时，序列化是一个常见难题。

```java
// 问题：命令中包含不可序列化的引用
public class SomeCommand implements Command {
    private final Service service;  // Service 可能不可序列化
    private final User user;        // User 可能不可序列化

    // 解决方案：使用命令 ID 替代对象引用
}

// 优化方案：使用命令标识符 + 数据对象
public class SerializableCommand implements Command, Serializable {
    private final String commandType;       // 命令类型标识
    private final Map<String, Object> data; // 可序列化的数据

    public SerializableCommand(String commandType, Map<String, Object> data) {
        this.commandType = commandType;
        this.data = new HashMap<>(data);
    }

    @Override
    public void execute() {
        // 根据 commandType 反序列化出具体的执行逻辑
        Command executed = CommandRegistry.create(commandType, data);
        executed.execute();
    }

    @Override
    public void undo() {
        Command executed = CommandRegistry.create(commandType, data);
        executed.undo();
    }
}
```

## 16.7 优化策略

### 16.7.1 使用 Java 8 Lambda 简化单方法命令

```java
import java.util.function.Consumer;

/**
 * Lambda 表达式可以大幅减少命令类的数量
 * 对于只需要 execute 方法的命令（不需要撤销），用 Runnable 或 Consumer 替代
 */
public class LambdaCommandOptimization {

    /**
     * 使用函数式接口替代命令接口
     * 适用于只有 execute 操作的场景
     */
    public static class SimpleInvoker {
        private final Map<String, Runnable> commands = new HashMap<>();

        public void register(String name, Runnable command) {
            commands.put(name, command);
        }

        public void execute(String name) {
            Runnable cmd = commands.get(name);
            if (cmd != null) {
                cmd.run();
            }
        }
    }

    /**
     * 带参数的函数式命令
     */
    public static class ParameterizedInvoker<T> {
        private final Map<String, Consumer<T>> commands = new HashMap<>();

        public void register(String name, Consumer<T> command) {
            commands.put(name, command);
        }

        public void execute(String name, T parameter) {
            Consumer<T> cmd = commands.get(name);
            if (cmd != null) {
                cmd.accept(parameter);
            }
        }
    }

    public static void main(String[] args) {
        // 传统的命令模式
        Command saveCmd = new SaveCommand();
        saveCmd.execute();

        // Lambda 优化：无需定义 SaveCommand 类
        Runnable lambdaSaveCmd = () -> System.out.println("保存文档");
        lambdaSaveCmd.run();

        // 更复杂的场景：使用参数
        Consumer<String> printCmd = message -> System.out.println("打印: " + message);
        printCmd.accept("Hello");
    }
}
```

### 16.7.2 命令对象池

```java
/**
 * 命令对象池化 - 减少对象创建和 GC 压力
 * 适用于频繁创建和销毁的命令对象
 */
public class CommandPool<T extends Command & Resettable> {
    private final Queue<T> pool = new ConcurrentLinkedQueue<>();
    private final Supplier<T> factory;
    private final int maxSize;

    public CommandPool(Supplier<T> factory, int maxSize) {
        this.factory = factory;
        this.maxSize = maxSize;
    }

    public T acquire() {
        T cmd = pool.poll();
        if (cmd == null) {
            cmd = factory.get();
        }
        return cmd;
    }

    public void release(T cmd) {
        cmd.reset();  // 重置命令状态
        if (pool.size() < maxSize) {
            pool.offer(cmd);
        }
        // 池已满，交给 GC
    }
}

/** 可重置的接口 */
interface Resettable {
    void reset();
}

// 使用示例
class PooledInsertCommand implements Command, Resettable {
    private TextEditor editor;
    private int position;
    private String text;

    // 通过 setter 注入参数，避免每次都 new
    public void configure(TextEditor editor, int position, String text) {
        this.editor = editor;
        this.position = position;
        this.text = text;
    }

    @Override
    public void execute() {
        editor.insert(position, text);
    }

    @Override
    public void undo() {
        editor.delete(position, position + text.length());
    }

    @Override
    public void reset() {
        this.editor = null;
        this.position = 0;
        this.text = null;
    }

    @Override
    public String getName() {
        return "PooledInsert[" + text + "]";
    }
}
```

### 16.7.3 异步命令执行器

```java
import java.util.concurrent.*;

/**
 * 异步命令执行器 - 结合命令模式和 Future
 * 支持获取命令执行结果、超时控制
 */
public class AsyncCommandExecutor {

    private final ExecutorService executor = Executors.newCachedThreadPool();

    /**
     * 异步执行命令，返回 Future
     */
    public <T> Future<T> submit(Callable<T> command) {
        return executor.submit(command);
    }

    /**
     * 异步执行 Runnable 命令
     */
    public Future<?> submit(Runnable command) {
        return executor.submit(command);
    }

    /**
     * 批量异步执行命令，等待所有完成
     */
    public <T> List<Future<T>> submitAll(List<Callable<T>> commands)
            throws InterruptedException {
        List<Future<T>> futures = new ArrayList<>();
        for (Callable<T> cmd : commands) {
            futures.add(executor.submit(cmd));
        }
        return futures;  // 调用方通过 Future.get() 等待结果
    }

    /**
     * 带超时的批量执行
     */
    public <T> List<T> executeAllWithTimeout(
            List<Callable<T>> commands, long timeout, TimeUnit unit)
            throws Exception {
        List<Future<T>> futures = executor.invokeAll(commands, timeout, unit);
        List<T> results = new ArrayList<>();
        for (Future<T> future : futures) {
            if (future.isDone() && !future.isCancelled()) {
                results.add(future.get());
            }
        }
        return results;
    }

    public void shutdown() {
        executor.shutdown();
    }

    // 使用示例
    public static void main(String[] args) throws Exception {
        AsyncCommandExecutor executor = new AsyncCommandExecutor();

        // 异步执行多个命令
        Future<String> future1 = executor.submit(() -> {
            Thread.sleep(1000);
            return "命令1完成";
        });

        Future<String> future2 = executor.submit(() -> {
            Thread.sleep(500);
            return "命令2完成";
        });

        // 等待结果
        System.out.println(future2.get());  // 500ms后输出
        System.out.println(future1.get());  // 1000ms后输出

        executor.shutdown();
    }
}
```

### 16.7.4 CQRS 模式 — 分布式命令模式

```java
/**
 * CQRS（命令查询职责分离）
 * 将命令模式扩展到分布式系统层面
 *
 * ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 * │   Command    │────►│  Command Bus  │────►│ Command      │
 * │   (DTO)      │     │  (Message Q)  │     │ Handler      │
 * └──────────────┘     └──────────────┘     └──────────────┘
 *                                                      │
 *                                                      ▼
 *                                              ┌──────────────┐
 *                                              │  Aggregate   │
 *                                              │  (领域模型)    │
 *                                              └──────────────┘
 */

// 命令消息（可序列化，可在网络中传输）
public abstract class CommandMessage implements Serializable {
    private final String commandId = UUID.randomUUID().toString();
    private final Instant timestamp = Instant.now();
    private String correlationId;

    public String getCommandId() { return commandId; }
    public Instant getTimestamp() { return timestamp; }
    public String getCorrelationId() { return correlationId; }
    public void setCorrelationId(String correlationId) {
        this.correlationId = correlationId;
    }
}

// 具体的命令
class CreateOrderCommand extends CommandMessage {
    private final String userId;
    private final List<OrderItem> items;
    private final String shippingAddress;

    public CreateOrderCommand(String userId, List<OrderItem> items,
                              String shippingAddress) {
        this.userId = userId;
        this.items = new ArrayList<>(items);
        this.shippingAddress = shippingAddress;
    }

    public String getUserId() { return userId; }
    public List<OrderItem> getItems() { return items; }
    public String getShippingAddress() { return shippingAddress; }
}

/**
 * 命令总线 - 将命令分发到对应的处理器
 */
class CommandBus {
    private final Map<Class<?>, CommandHandler<?>> handlers = new HashMap<>();
    private final List<CommandMiddleware> middlewares = new ArrayList<>();

    public <T extends CommandMessage> void registerHandler(
            Class<T> commandType, CommandHandler<T> handler) {
        handlers.put(commandType, handler);
    }

    @SuppressWarnings("unchecked")
    public <T extends CommandMessage> void dispatch(T command) {
        // 中间件链（类似 FilterChain）
        for (CommandMiddleware middleware : middlewares) {
            middleware.before(command);
        }

        // 查找并执行处理器
        CommandHandler<T> handler = (CommandHandler<T>) handlers.get(command.getClass());
        if (handler != null) {
            handler.handle(command);
        }

        for (CommandMiddleware middleware : middlewares) {
            middleware.after(command);
        }
    }

    public void addMiddleware(CommandMiddleware middleware) {
        middlewares.add(middleware);
    }
}

interface CommandHandler<T extends CommandMessage> {
    void handle(T command);
}

interface CommandMiddleware {
    default void before(CommandMessage command) {}
    default void after(CommandMessage command) {}
}
```

CQRS 将命令模式提升到了架构层面：
- **Command** = 改变系统状态的操作（写）
- **Query** = 查询系统状态的操作（读）
- **Command Bus** = 分布式 Invoker
- **Command Handler** = 最终执行者

这是命令模式在企业级分布式系统中的最高级应用形态。
