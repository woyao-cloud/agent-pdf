# 第19章 备忘录模式（Memento）

**备忘录模式**是一种行为型设计模式，它允许在不暴露对象内部实现细节的情况下，捕获并外部化该对象的内部状态，以便之后可以将对象恢复到之前的状态。

## 19.1 解决的问题与应用场景

### 19.1.1 问题分析

在软件系统中，我们经常需要保存对象的历史状态以支持撤销、回滚或历史记录功能。直接暴露对象的内部状态会导致封装性被破坏。

```java
// 问题1：直接暴露内部状态
public class Editor {
    public String content;  // 公开字段，破坏封装
    public int cursorPosition;
    public Selection selection;
}

// 问题2：客户端需要了解对象内部细节
public class UndoManager {
    private final Stack<Editor> history = new Stack<>();

    public void save(Editor editor) {
        // 需要复制所有内部字段
        Editor copy = new Editor();
        copy.content = editor.content;          // 依赖内部实现
        copy.cursorPosition = editor.cursorPosition;
        copy.selection = new Selection(editor.selection);
        history.push(copy);
    }
}
```

这种方式的问题：
- **破坏封装**：需要暴露内部字段来保存状态
- **实现细节泄漏**：客户端代码依赖于对象的内部结构
- **职责扩散**：状态保存逻辑分散在多个类中
- **难以变更**：内部结构变化时，所有保存状态的代码都要修改

备忘录模式通过引入一个专门的状态快照对象（Memento）来解决这些问题，由源发器（Originator）自己负责创建和恢复状态。

### 19.1.2 典型应用场景

**1. 文本编辑器撤销/重做**

```java
// 每次编辑前保存编辑器状态快照
undoStack.push(editor.save());
// 编辑操作...
// 用户点击撤销时恢复
editor.restore(undoStack.pop());
```

**2. 游戏存档/读档**

```java
// 保存游戏进度
GameMemento savePoint = game.save();
saveFile.write(savePoint);  // 序列化到文件
// 恢复游戏进度
game.restore(saveFile.read());
```

**3. 数据库事务回滚**

```java
// 在执行事务前保存状态的快照
Savepoint sp = connection.setSavepoint();
// 执行数据库操作...
// 出错时回滚
connection.rollback(sp);
```

**4. 版本控制系统**

```java
// 每个提交（commit）都是整个仓库状态的备忘录
Commit commit = repo.commit("fix bug #123");
// 切换到历史版本
repo.checkout(commit.getHash());
```

## 19.2 实现原理与UML

### 19.2.1 核心思想

备忘录模式的核心思想是：**源发器（Originator）负责创建包含其内部状态的备忘录（Memento）对象，并且可以通过备忘录恢复到之前的状态。备忘录对象对除源发器以外的对象是不透明的（窄接口）**。

### 19.2.2 白盒备忘录 vs 黑盒备忘录

备忘录模式有两种实现方式：

**白盒备忘录**：备忘录对外暴露完整的状态信息，实现简单但破坏封装。
**黑盒备忘录**：备忘录对外提供窄接口（空接口或有限接口），内部状态只有源发器可以访问。

### 19.2.3 UML类图

```
  ┌─────────────────────────────┐
  │         Originator          │
  │         (源发器)             │
  ├─────────────────────────────┤
  │ - state: State              │
  │ + save(): Memento           │
  │ + restore(m: Memento)       │
  │ + doSomething()             │
  └───────────────┬─────────────┘
                  │ 创建/恢复
                  │
                  ▼
  ┌─────────────────────────────┐
  │         Memento             │
  │        (备忘录)              │     ┌─────────────────────┐
  ├─────────────────────────────┤     │   Caretaker         │
  │ - state: State (private)    │     │  (负责人)           │
  │ + getState(): State         │◄────├─────────────────────┤
  │ + setState(s: State)        │     │ - mementos: List    │
  └─────────────────────────────┘     │ + add()/get()       │
      白盒接口（所有方法公开）          └─────────────────────┘

  ┌─────────────────────────────┐
  │         Originator          │
  ├─────────────────────────────┤
  │ - state: State              │
  │ + save(): IMemento          │  ← 返回窄接口
  │ + restore(m: IMemento)      │
  └───────────────┬─────────────┘
                  │
                  ▼
  ┌─────────────────────────────┐     ┌─────────────────────┐
  │   <<interface>> IMemento    │     │   Caretaker         │
  │   (窄接口，不暴露状态)        │     │  (负责人)           │
  └─────────────────────────────┘     │ - mementos: List    │
                  ▲                    │ 只持有 IMemento     │
                  │                    └─────────────────────┘
  ┌─────────────────────────────┐
  │   Memento (Originator的内部类)│
  ├─────────────────────────────┤
  │ - state: State              │
  │ + getState(): State         │  ← 只有 Originator 可以访问
  └─────────────────────────────┘
```

### 19.2.4 角色分析

| 角色 | 类型 | 职责 | 关键行为 |
|------|------|------|----------|
| **Originator** | 具体类 | 需要保存和恢复状态的对象 | `save()`, `restore(memento)` |
| **Memento** | 具体类 | 存储 Originator 的状态快照（不可变） | 构造函数初始化，只提供 getter |
| **Caretaker** | 具体类 | 管理备忘录的保存和读取 | 保存和获取备忘录，不修改其内容 |

## 19.3 代码实现

### 19.3.1 白盒备忘录实现

白盒方式中，Memento 的接口对所有类都是可见的。

```java
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * 文本编辑器 - 源发器
 */
class TextEditor {
    private String content;
    private int cursorPosition;
    private int selectionStart;
    private int selectionEnd;

    public TextEditor() {
        this.content = "";
        this.cursorPosition = 0;
        this.selectionStart = 0;
        this.selectionEnd = 0;
    }

    // ---- 编辑操作 ----

    public void insert(String text) {
        StringBuilder sb = new StringBuilder(content);
        sb.insert(cursorPosition, text);
        content = sb.toString();
        cursorPosition += text.length();
    }

    public void delete() {
        if (cursorPosition > 0) {
            StringBuilder sb = new StringBuilder(content);
            sb.deleteCharAt(cursorPosition - 1);
            content = sb.toString();
            cursorPosition--;
        }
    }

    public void setSelection(int start, int end) {
        this.selectionStart = start;
        this.selectionEnd = end;
    }

    // ---- 状态保存/恢复 ----

    /** 创建备忘录（保存当前状态） */
    public Memento save() {
        return new Memento(content, cursorPosition, selectionStart, selectionEnd);
    }

    /** 从备忘录恢复状态 */
    public void restore(Memento memento) {
        this.content = memento.getContent();
        this.cursorPosition = memento.getCursorPosition();
        this.selectionStart = memento.getSelectionStart();
        this.selectionEnd = memento.getSelectionEnd();
    }

    @Override
    public String toString() {
        return "Editor{content='" + content + "', cursor=" + cursorPosition
            + ", selection=[" + selectionStart + "-" + selectionEnd + "]}";
    }

    // ---- 备忘录类 ----

    /**
     * 备忘录 - 白盒方式（所有 getter 公开）
     * 存储编辑器状态的快照
     */
    public static class Memento {
        private final String content;
        private final int cursorPosition;
        private final int selectionStart;
        private final int selectionEnd;
        private final long timestamp;

        public Memento(String content, int cursorPosition,
                       int selectionStart, int selectionEnd) {
            this.content = content;
            this.cursorPosition = cursorPosition;
            this.selectionStart = selectionStart;
            this.selectionEnd = selectionEnd;
            this.timestamp = System.currentTimeMillis();
        }

        // 所有 getter 都是公开的（白盒）
        public String getContent() { return content; }
        public int getCursorPosition() { return cursorPosition; }
        public int getSelectionStart() { return selectionStart; }
        public int getSelectionEnd() { return selectionEnd; }
        public long getTimestamp() { return timestamp; }

        @Override
        public String toString() {
            return "Memento@" + timestamp + "{content='" + content
                + "', cursor=" + cursorPosition + "}";
        }
    }
}

/**
 * 负责人 - 管理备忘录的历史记录
 */
class EditorHistory {
    private final Deque<TextEditor.Memento> undoStack = new ArrayDeque<>();
    private final Deque<TextEditor.Memento> redoStack = new ArrayDeque<>();
    private int maxHistorySize;

    public EditorHistory() {
        this(50);
    }

    public EditorHistory(int maxHistorySize) {
        this.maxHistorySize = maxHistorySize;
    }

    /** 保存一个备忘录到历史 */
    public void push(TextEditor.Memento memento) {
        undoStack.push(memento);
        redoStack.clear();  // 新操作清空重做栈
        if (undoStack.size() > maxHistorySize) {
            undoStack.removeLast();
        }
    }

    /** 撤销 - 返回上一个状态 */
    public TextEditor.Memento undo() {
        if (undoStack.isEmpty()) {
            return null;
        }
        TextEditor.Memento current = undoStack.pop();
        redoStack.push(current);
        return undoStack.peek();  // 返回上一个状态
    }

    /** 重做 */
    public TextEditor.Memento redo() {
        if (redoStack.isEmpty()) {
            return null;
        }
        TextEditor.Memento memento = redoStack.pop();
        undoStack.push(memento);
        return memento;
    }

    public boolean canUndo() { return !undoStack.isEmpty(); }
    public boolean canRedo() { return !redoStack.isEmpty(); }
    public int undoCount() { return undoStack.size(); }
    public int redoCount() { return redoStack.size(); }
}

// 白盒备忘录测试
public class WhiteBoxMementoTest {
    public static void main(String[] args) {
        TextEditor editor = new TextEditor();
        EditorHistory history = new EditorHistory();

        System.out.println("===== 白盒备忘录模式 - 文本编辑器 =====");

        // 输入 "Hello"
        editor.insert("Hello");
        System.out.println("插入 'Hello': " + editor);
        history.push(editor.save());

        // 输入 " World"
        editor.insert(" World");
        System.out.println("插入 ' World': " + editor);
        history.push(editor.save());

        // 输入 "!!!"
        editor.insert("!!!");
        System.out.println("插入 '!!!': " + editor);
        history.push(editor.save());

        // 撤销两次
        System.out.println("\n===== 撤销 =====");
        TextEditor.Memento prev = history.undo();
        if (prev != null) {
            editor.restore(prev);
            System.out.println("撤销后: " + editor);
        }

        prev = history.undo();
        if (prev != null) {
            editor.restore(prev);
            System.out.println("再次撤销后: " + editor);
        }

        // 重做一次
        System.out.println("\n===== 重做 =====");
        TextEditor.Memento next = history.redo();
        if (next != null) {
            editor.restore(next);
            System.out.println("重做后: " + editor);
        }

        // 白盒的问题：外部可以访问备忘录的内部状态
        System.out.println("\n===== 白盒问题：外部可以访问备忘录内部 =====");
        TextEditor.Memento exposed = editor.save();
        System.out.println("外部直接读取备忘录内容: " + exposed.getContent());
        System.out.println("外部直接读取光标位置: " + exposed.getCursorPosition());
        // 这破坏了封装性!
    }
}
```

### 19.3.2 黑盒备忘录实现

黑盒方式使用内部类 + 窄接口，外部只能通过窄接口操作备忘录，无法访问内部状态。

```java
/**
 * 备忘录的窄接口 - 对外部（Caretaker）可见
 * 不暴露任何状态信息
 */
interface MementoInterface {
    /** 只提供元数据，不提供具体状态 */
    String getLabel();

    /** 获取创建时间 */
    long getTimestamp();
}

/**
 * 文本编辑器 - 黑盒方式的源发器
 */
class BlackBoxTextEditor {
    private String content;
    private int cursorPosition;

    public BlackBoxTextEditor() {
        this.content = "";
        this.cursorPosition = 0;
    }

    public void insert(String text) {
        StringBuilder sb = new StringBuilder(content);
        sb.insert(cursorPosition, text);
        content = sb.toString();
        cursorPosition += text.length();
    }

    public void delete() {
        if (cursorPosition > 0 && !content.isEmpty()) {
            StringBuilder sb = new StringBuilder(content);
            sb.deleteCharAt(cursorPosition - 1);
            content = sb.toString();
            cursorPosition--;
        }
    }

    /**
     * 创建备忘录 - 返回窄接口
     * 外部无法通过窄接口访问内部状态
     */
    public MementoInterface save(String label) {
        return new EditorMemento(content, cursorPosition, label);
    }

    /**
     * 从备忘录恢复
     * 需要将窄接口转换为具体类型
     */
    public void restore(MementoInterface memento) {
        if (memento instanceof EditorMemento) {
            EditorMemento editorMemento = (EditorMemento) memento;
            this.content = editorMemento.getContent();
            this.cursorPosition = editorMemento.getCursorPosition();
        }
    }

    @Override
    public String toString() {
        return "Editor{content='" + content + "', cursor=" + cursorPosition + "}";
    }

    /**
     * 具体的备忘录 - 作为 Originator 的私有内部类
     * 外部类无法直接访问
     */
    private static class EditorMemento implements MementoInterface {
        private final String content;
        private final int cursorPosition;
        private final String label;
        private final long timestamp;

        EditorMemento(String content, int cursorPosition, String label) {
            this.content = content;
            this.cursorPosition = cursorPosition;
            this.label = label;
            this.timestamp = System.currentTimeMillis();
        }

        // 只有 Originator 内部可以调用这些 getter
        private String getContent() { return content; }
        private int getCursorPosition() { return cursorPosition; }

        @Override
        public String getLabel() { return label; }

        @Override
        public long getTimestamp() { return timestamp; }
    }
}

/**
 * 黑盒方式的负责人
 * 只能通过窄接口操作备忘录
 */
class BlackBoxHistory {
    private final Deque<MementoInterface> undoStack = new ArrayDeque<>();

    public void push(MementoInterface memento) {
        undoStack.push(memento);
    }

    public MementoInterface pop() {
        return undoStack.isEmpty() ? null : undoStack.pop();
    }

    public MementoInterface peek() {
        return undoStack.isEmpty() ? null : undoStack.peek();
    }

    public boolean canUndo() { return !undoStack.isEmpty(); }

    /** 列出所有历史记录（只能看到标签和元数据） */
    public void listHistory() {
        System.out.println("历史记录 (" + undoStack.size() + " 条):");
        for (MementoInterface m : undoStack) {
            System.out.println("  - " + m.getLabel() + " @" + m.getTimestamp());
        }
    }
}

// 黑盒备忘录测试
public class BlackBoxMementoTest {
    public static void main(String[] args) {
        BlackBoxTextEditor editor = new BlackBoxTextEditor();
        BlackBoxHistory history = new BlackBoxHistory();

        System.out.println("===== 黑盒备忘录模式 - 文本编辑器 =====");

        editor.insert("Hello");
        history.push(editor.save("插入 Hello"));

        editor.insert(" World");
        history.push(editor.save("插入 World"));

        editor.insert("!!!");
        history.push(editor.save("插入 !!!"));

        // 查看历史（只能看到标签，不能看到内容）
        System.out.println("当前状态: " + editor);
        history.listHistory();

        // 撤销
        System.out.println("\n===== 撤销 =====");
        MementoInterface prev = history.pop();
        if (prev != null) {
            editor.restore(history.peek());
            System.out.println("撤销到: " + editor);
            System.out.println("备忘录信息: " + prev.getLabel());
            // 下面这行会编译错误（黑盒保护）:
            // prev.getContent();  // 编译错误! MementoInterface 没有 getContent
        }

        System.out.println("\n黑盒方式成功保护了备忘录的内部状态!");
    }
}
```

### 19.3.3 示例2：游戏存档系统

```java
import java.util.*;

/**
 * 游戏角色 - 源发器
 */
class GameCharacter {
    private String name;
    private int level;
    private int health;
    private int mana;
    private int experience;
    private Position position;
    private List<String> inventory;

    public GameCharacter(String name) {
        this.name = name;
        this.level = 1;
        this.health = 100;
        this.mana = 50;
        this.experience = 0;
        this.position = new Position(0, 0);
        this.inventory = new ArrayList<>();
    }

    // ---- 游戏操作 ----

    public void takeDamage(int damage) {
        health = Math.max(0, health - damage);
        System.out.println(name + " 受到 " + damage + " 点伤害，剩余血量: " + health);
    }

    public void heal(int amount) {
        health = Math.min(100, health + amount);
        System.out.println(name + " 恢复 " + amount + " 点血量，当前血量: " + health);
    }

    public void gainExperience(int exp) {
        experience += exp;
        System.out.println(name + " 获得 " + exp + " 经验值");
        if (experience >= level * 100) {
            levelUp();
        }
    }

    private void levelUp() {
        level++;
        health = 100;
        mana = 50 + level * 10;
        System.out.println("!!! " + name + " 升级了！当前等级: " + level);
    }

    public void moveTo(int x, int y) {
        this.position = new Position(x, y);
        System.out.println(name + " 移动到 (" + x + ", " + y + ")");
    }

    public void addItem(String item) {
        inventory.add(item);
        System.out.println(name + " 获得物品: " + item);
    }

    // ---- 备忘录相关 ----

    /** 创建存档 */
    public GameMemento save() {
        return new GameMemento(
            level, health, mana, experience,
            new Position(position.x, position.y),
            new ArrayList<>(inventory)  // 深拷贝
        );
    }

    /** 读档 */
    public void restore(GameMemento memento) {
        this.level = memento.getLevel();
        this.health = memento.getHealth();
        this.mana = memento.getMana();
        this.experience = memento.getExperience();
        this.position = new Position(memento.getPosition().x, memento.getPosition().y);
        this.inventory = new ArrayList<>(memento.getInventory());
    }

    public void showStatus() {
        System.out.println("┌─────────────────────────┐");
        System.out.println("  角色: " + name);
        System.out.println("  等级: " + level);
        System.out.println("  血量: " + health + "/100");
        System.out.println("  蓝量: " + mana);
        System.out.println("  经验: " + experience + "/" + (level * 100));
        System.out.println("  位置: (" + position.x + ", " + position.y + ")");
        System.out.println("  背包: " + inventory);
        System.out.println("└─────────────────────────┘");
    }

    // ---- 内部类: 备忘录 ----

    /**
     * 游戏存档 - 作为内部类
     * 对外部完全不可变
     */
    public static class GameMemento {
        private final int level;
        private final int health;
        private final int mana;
        private final int experience;
        private final Position position;
        private final List<String> inventory;
        private final long saveTime;

        private GameMemento(int level, int health, int mana, int experience,
                           Position position, List<String> inventory) {
            this.level = level;
            this.health = health;
            this.mana = mana;
            this.experience = experience;
            this.position = position;
            this.inventory = inventory;
            this.saveTime = System.currentTimeMillis();
        }

        // 只有 Originator 可以调用（包级私有或私有）
        private int getLevel() { return level; }
        private int getHealth() { return health; }
        private int getMana() { return mana; }
        private int getExperience() { return experience; }
        private Position getPosition() { return position; }
        private List<String> getInventory() { return inventory; }

        public long getSaveTime() { return saveTime; }
    }

    private static class Position {
        final int x, y;
        Position(int x, int y) { this.x = x; this.y = y; }
        @Override public String toString() { return "(" + x + ", " + y + ")"; }
    }
}

/**
 * 游戏存档管理器 - 负责人
 */
class SaveManager {
    private final Map<String, GameCharacter.GameMemento> saveSlots = new HashMap<>();

    /** 保存到存档槽位 */
    public void save(String slotName, GameCharacter.GameMemento memento) {
        saveSlots.put(slotName, memento);
        System.out.println("[存档] 已保存到槽位: " + slotName);
    }

    /** 从指定槽位读档 */
    public GameCharacter.GameMemento load(String slotName) {
        GameCharacter.GameMemento memento = saveSlots.get(slotName);
        if (memento == null) {
            System.out.println("[存档] 槽位 " + slotName + " 不存在");
        } else {
            System.out.println("[存档] 从槽位 " + slotName + " 读档");
        }
        return memento;
    }

    /** 列出所有存档 */
    public void listSaves() {
        System.out.println("存档列表:");
        for (Map.Entry<String, GameCharacter.GameMemento> entry : saveSlots.entrySet()) {
            System.out.println("  [" + entry.getKey() + "] 存档时间: "
                + new Date(entry.getValue().getSaveTime()));
        }
    }
}

// 游戏存档测试
public class GameSaveTest {
    public static void main(String[] args) {
        GameCharacter hero = new GameCharacter("勇者阿杰");
        SaveManager saveManager = new SaveManager();

        hero.showStatus();

        // 游戏进程
        System.out.println("\n===== 游戏进行中 =====");
        hero.moveTo(10, 20);
        hero.addItem("铁剑");
        hero.gainExperience(50);

        // 存档点1
        saveManager.save("autosave_01", hero.save());

        System.out.println("\n===== 继续游戏 =====");
        hero.moveTo(30, 40);
        hero.addItem("魔法药水");
        hero.takeDamage(30);
        hero.gainExperience(80);

        // 存档点2
        saveManager.save("autosave_02", hero.save());

        System.out.println("\n===== 继续游戏（遭遇强敌）=====");
        hero.takeDamage(80);  // 快死了
        hero.addItem("龙鳞");

        System.out.println("\n===== 角色状态 =====");
        hero.showStatus();

        // 读档回到存档点2
        System.out.println("\n===== 读档回到安全状态 =====");
        GameCharacter.GameMemento save2 = saveManager.load("autosave_02");
        if (save2 != null) {
            hero.restore(save2);
            hero.showStatus();
        }

        saveManager.listSaves();
    }
}
```

### 19.3.4 示例3：事务回滚

```java
import java.math.BigDecimal;

/**
 * 银行账户 - 源发器
 */
class BankAccount {
    private String accountNumber;
    private String ownerName;
    private BigDecimal balance;
    private List<String> transactionLog;

    public BankAccount(String accountNumber, String ownerName, BigDecimal initialBalance) {
        this.accountNumber = accountNumber;
        this.ownerName = ownerName;
        this.balance = initialBalance;
        this.transactionLog = new ArrayList<>();
        transactionLog.add("开户: " + initialBalance);
    }

    public void deposit(BigDecimal amount) {
        balance = balance.add(amount);
        transactionLog.add("存入: " + amount);
        System.out.println("存入 " + amount + "，当前余额: " + balance);
    }

    public void withdraw(BigDecimal amount) {
        if (balance.compareTo(amount) < 0) {
            throw new RuntimeException("余额不足! 余额: " + balance + ", 需要: " + amount);
        }
        balance = balance.subtract(amount);
        transactionLog.add("取出: " + amount);
        System.out.println("取出 " + amount + "，当前余额: " + balance);
    }

    /** 转账 */
    public AccountMemento transfer(BankAccount target, BigDecimal amount) {
        // 保存当前状态（事务开始前的快照）
        AccountMemento snapshot = save();

        try {
            this.withdraw(amount);
            target.deposit(amount);
            transactionLog.add("转账 " + amount + " 到账户 " + target.accountNumber);
            System.out.println("转账成功!");
            return snapshot;  // 返回快照，但事务成功不需要回滚
        } catch (Exception e) {
            System.err.println("转账失败: " + e.getMessage());
            // 回滚到事务开始前的状态
            restore(snapshot);
            System.out.println("已回滚到转账前状态。余额: " + balance);
            throw e;
        }
    }

    public AccountMemento save() {
        return new AccountMemento(balance, new ArrayList<>(transactionLog));
    }

    public void restore(AccountMemento memento) {
        this.balance = memento.getBalance();
        this.transactionLog = new ArrayList<>(memento.getTransactionLog());
    }

    public BigDecimal getBalance() { return balance; }

    public void showLog() {
        System.out.println("交易记录 (" + accountNumber + "):");
        for (String log : transactionLog) {
            System.out.println("  " + log);
        }
    }

    /**
     * 账户状态备忘录
     */
    public static class AccountMemento {
        private final BigDecimal balance;
        private final List<String> transactionLog;
        private final long timestamp;

        private AccountMemento(BigDecimal balance, List<String> transactionLog) {
            this.balance = balance;
            this.transactionLog = transactionLog;
            this.timestamp = System.currentTimeMillis();
        }

        private BigDecimal getBalance() { return balance; }
        private List<String> getTransactionLog() { return transactionLog; }
        public long getTimestamp() { return timestamp; }
    }
}

// 事务回滚测试
public class TransactionTest {
    public static void main(String[] args) {
        BankAccount alice = new BankAccount("A001", "Alice", new BigDecimal("1000"));
        BankAccount bob = new BankAccount("B001", "Bob", new BigDecimal("500"));

        System.out.println("===== 交易前状态 =====");
        System.out.println("Alice 余额: " + alice.getBalance());
        System.out.println("Bob 余额: " + bob.getBalance());

        System.out.println("\n===== Alice 向 Bob 转账 300 =====");
        try {
            alice.transfer(bob, new BigDecimal("300"));
        } catch (Exception e) {
            System.out.println("交易异常: " + e.getMessage());
        }

        System.out.println("\n===== 交易后状态 =====");
        System.out.println("Alice 余额: " + alice.getBalance());
        System.out.println("Bob 余额: " + bob.getBalance());

        System.out.println("\n===== Alice 向 Bob 转账 2000（余额不足，触发回滚）=====");
        try {
            alice.transfer(bob, new BigDecimal("2000"));
        } catch (Exception e) {
            System.out.println("交易异常: " + e.getMessage());
        }

        // 验证回滚后状态正确
        System.out.println("\n===== 回滚后状态验证 =====");
        System.out.println("Alice 余额: " + alice.getBalance() + " (应恢复为 700)");
        System.out.println("Bob 余额: " + bob.getBalance() + " (应保持 800)");
    }
}
```

### 19.3.5 多级撤销栈

```java
/**
 * 带限制的多级撤销栈实现
 * 支持撤销、重做，限制最大历史记录数
 */
public class BoundedHistory<T> {
    private final T[] states;
    private int head;       // 当前状态位置
    private int tail;       // 最旧状态位置
    private int count;      // 当前存储的状态数
    private int maxSize;

    @SuppressWarnings("unchecked")
    public BoundedHistory(int maxSize) {
        this.maxSize = maxSize;
        this.states = (T[]) new Object[maxSize];
        this.head = 0;
        this.tail = 0;
        this.count = 0;
    }

    /** 保存新状态 */
    public void push(T state) {
        states[head] = state;
        head = (head + 1) % maxSize;
        if (count < maxSize) {
            count++;
        } else {
            tail = (tail + 1) % maxSize;  // 覆盖最旧的
        }
    }

    /** 获取当前状态，不移除 */
    public T peek() {
        if (count == 0) return null;
        int idx = (head - 1 + maxSize) % maxSize;
        return states[idx];
    }

    /** 弹出当前状态（回到上一个） */
    public T pop() {
        if (count == 0) return null;
        head = (head - 1 + maxSize) % maxSize;
        T state = states[head];
        count--;
        return state;
    }

    public int size() { return count; }
    public boolean isEmpty() { return count == 0; }
}
```

## 19.4 JDK/框架源码解析

### 19.4.1 java.io.Serializable — 隐式备忘录机制

```java
import java.io.*;

/**
 * Java 序列化机制本质上就是一种备忘录模式
 * 它将对象的完整状态保存到一个字节流中，之后可以完全恢复
 */
public class SerializationMemento {

    /**
     * 通过序列化实现"深度复制"备忘录
     * 这是一种通用的备忘录创建方式
     */
    public static class SerializableMemento {
        private final byte[] stateData;

        public SerializableMemento(Serializable originator) {
            this.stateData = serialize(originator);
        }

        /** 从备忘录恢复状态 */
        @SuppressWarnings("unchecked")
        public <T> T restore() {
            return (T) deserialize(stateData);
        }

        private byte[] serialize(Serializable obj) {
            try (ByteArrayOutputStream bos = new ByteArrayOutputStream();
                 ObjectOutputStream oos = new ObjectOutputStream(bos)) {
                oos.writeObject(obj);
                return bos.toByteArray();
            } catch (IOException e) {
                throw new RuntimeException("序列化失败", e);
            }
        }

        private Object deserialize(byte[] data) {
            try (ByteArrayInputStream bis = new ByteArrayInputStream(data);
                 ObjectInputStream ois = new ObjectInputStream(bis)) {
                return ois.readObject();
            } catch (Exception e) {
                throw new RuntimeException("反序列化失败", e);
            }
        }
    }

    /**
     * 可序列化的文档 - 既是 Originator 又支持序列化
     */
    static class Document implements Serializable {
        private static final long serialVersionUID = 1L;
        private String title;
        private String content;
        private transient String cachedHtml;  // transient 字段不会被保存

        public Document(String title, String content) {
            this.title = title;
            this.content = content;
            this.cachedHtml = null;
        }

        public void setTitle(String title) { this.title = title; }
        public void setContent(String content) {
            this.content = content;
            this.cachedHtml = null;  // 清除缓存
        }

        public SerializableMemento save() {
            return new SerializableMemento(this);
        }

        @Override
        public String toString() {
            return "Document{title='" + title + "', content='" + content + "'}";
        }
    }

    public static void main(String[] args) {
        Document doc = new Document("备忘录模式", "备忘录模式是一种行为型设计模式...");
        System.out.println("原始: " + doc);

        // 创建备忘录（序列化）
        SerializableMemento memento = doc.save();

        // 修改文档
        doc.setTitle("修改后的标题");
        doc.setContent("修改后的内容");
        System.out.println("修改后: " + doc);

        // 从备忘录恢复
        doc = memento.restore();
        System.out.println("恢复后: " + doc);
    }
}
```

### 19.4.2 javax.swing.undo.UndoManager

```java
import javax.swing.undo.*;
import javax.swing.event.UndoableEditEvent;
import javax.swing.event.UndoableEditListener;

/**
 * Swing 的 UndoManager 是备忘录模式在 GUI 框架中的经典实现
 */
public class SwingUndoExample {

    /**
     * UndoManager 分析：
     *
     * UndoableEdit → Memento 接口
     *     - undo()  → 恢复到之前状态
     *     - redo()  → 重新应用更改
     *     - die()   → 释放资源
     *
     * UndoManager → Caretaker
     *     - 管理 UndoableEdit 的列表
     *     - 支持撤销/重做导航
     *     - 限制历史大小
     *
     * AbstractUndoableEdit → Originator
     *     - 实现 UndoableEdit 接口
     *     - 提供默认的 undo/redo 实现
     */

    public static void main(String[] args) {
        // Swing 的 UndoManager 使用示例
        UndoManager undoManager = new UndoManager();
        undoManager.setLimit(100);  // 最多保留100步历史

        // 模拟编辑操作
        class TextEdit extends AbstractUndoableEdit {
            private final String oldText;
            private final String newText;

            TextEdit(String oldText, String newText) {
                this.oldText = oldText;
                this.newText = newText;
            }

            @Override
            public void undo() throws CannotUndoException {
                super.undo();
                System.out.println("撤销: '" + newText + "' -> '" + oldText + "'");
            }

            @Override
            public void redo() throws CannotRedoException {
                super.redo();
                System.out.println("重做: '" + oldText + "' -> '" + newText + "'");
            }
        }

        // 执行编辑并注册到 UndoManager
        undoManager.addEdit(new TextEdit("", "Hello"));
        undoManager.addEdit(new TextEdit("Hello", "Hello World"));
        undoManager.addEdit(new TextEdit("Hello World", "Hello World!!!"));

        System.out.println("可撤销: " + undoManager.canUndo() + " (" + undoManager.getUndoCount() + ")");
        System.out.println("可重做: " + undoManager.canRedo() + " (" + undoManager.getRedoCount() + ")");

        // 撤销
        try { undoManager.undo(); } catch (CannotUndoException e) { }
        try { undoManager.undo(); } catch (CannotUndoException e) { }

        System.out.println("撤销后 - 可撤销: " + undoManager.canUndo());
        System.out.println("撤销后 - 可重做: " + undoManager.canRedo());
    }
}
```

### 19.4.3 Spring State Machine 状态持久化

```java
import org.springframework.statemachine.StateMachine;
import org.springframework.statemachine.state.State;
import org.springframework.statemachine.persist.StateMachinePersist;

/**
 * Spring State Machine 的状态持久化 - 备忘录模式的应用
 * 状态机的状态可以被保存（备忘录）并在之后恢复
 */
public class StateMachineMementoExample {

    // 状态机状态的备忘录
    // StateMachinePersist<S, E, T> 接口定义了状态的保存和恢复
    //
    //  public interface StateMachinePersist<S, E, T> {
    //      void write(StateMachine<S, E> stateMachine, T context) throws Exception;
    //      StateMachine<S, E> read(T context) throws Exception;
    //  }
    //
    //  write → 保存状态机当前状态到备忘录
    //  read  → 从备忘录恢复状态机状态
    //
    //  T 就是备忘录的载体，可以是文件、数据库、Redis 等

    // 典型应用：工作流引擎
    // 1. 流程实例运行时，状态不断变化
    // 2. 每次状态变更前保存备忘录
    // 3. 流程中断后可以从最后的备忘录恢复

    // 示例：订单状态机
    enum OrderState {
        CREATED, PAID, SHIPPED, DELIVERED, CANCELLED
    }

    enum OrderEvent {
        PAY, SHIP, DELIVER, CANCEL
    }

    // 状态的持久化本质上就是备忘录模式：
    // OrderStateMachine → Originator
    // StateMachinePersist → Caretaker（持久化）
    // 序列化后的状态 → Memento
}
```

### 19.4.4 java.util.Date — 时间状态捕获

```java
/**
 * java.util.Date 作为"时间状态"的备忘录
 * 它捕获了某一时刻的时间状态，是时间维度的备忘录模式
 */
public class DateMementoExample {

    /**
     * 任务的源发器 - 管理任务状态和时间线
     */
    static class Task {
        private String name;
        private String status;
        private Date lastModified;

        public Task(String name) {
            this.name = name;
            this.status = "新创建";
            this.lastModified = new Date();
        }

        public void updateStatus(String newStatus) {
            this.status = newStatus;
            this.lastModified = new Date();
            System.out.println("更新状态为: " + newStatus + " 于 " + lastModified);
        }

        /**
         * 保存时间快照
         * Date 是不可变的，可以作为备忘录
         */
        public DateMemento save() {
            return new DateMemento(name, status, (Date) lastModified.clone());
        }

        public void restore(DateMemento memento) {
            this.name = memento.getName();
            this.status = memento.getStatus();
            this.lastModified = memento.getTimestamp();
        }

        @Override
        public String toString() {
            return "Task{name='" + name + "', status='" + status
                + "', modified=" + lastModified + "}";
        }

        /**
         * 任务的备忘录 - 使用 Date 保存时间戳
         */
        public static class DateMemento {
            private final String name;
            private final String status;
            private final Date timestamp;

            private DateMemento(String name, String status, Date timestamp) {
                this.name = name;
                this.status = status;
                this.timestamp = timestamp;
            }

            private String getName() { return name; }
            private String getStatus() { return status; }
            private Date getTimestamp() { return timestamp; }
        }
    }

    public static void main(String[] args) throws InterruptedException {
        Task task = new Task("设计文档");

        // 保存初始状态
        Task.DateMemento m1 = task.save();

        Thread.sleep(100);
        task.updateStatus("进行中");

        Task.DateMemento m2 = task.save();

        Thread.sleep(100);
        task.updateStatus("已完成");

        System.out.println("当前: " + task);

        // 恢复到进行中
        task.restore(m2);
        System.out.println("恢复到: " + task);

        // 恢复到初始
        task.restore(m1);
        System.out.println("恢复到: " + task);
    }
}
```

## 19.5 使用场景与案例

### 19.5.1 文档编辑器撤销/重做历史

```java
/**
 * 文档编辑器 - 完整的撤销/重做功能
 */
public class DocumentEditor {
    private StringBuilder content = new StringBuilder();
    private final UndoManager undoManager = new UndoManager();

    // 文档变更监听器
    private final List<Runnable> changeListeners = new ArrayList<>();

    public void addChangeListener(Runnable listener) {
        changeListeners.add(listener);
    }

    private void notifyChanged() {
        changeListeners.forEach(Runnable::run);
    }

    public void insert(int offset, String text) {
        // 保存编辑前的状态
        UndoableEdit edit = new InsertEdit(offset, text);
        edit.execute();

        // 注册到 UndoManager（自动管理撤销/重做）
        undoManager.addEdit(edit);
        notifyChanged();
    }

    public void delete(int offset, int length) {
        String deletedText = content.substring(offset, offset + length);
        UndoableEdit edit = new DeleteEdit(offset, deletedText);
        edit.execute();
        undoManager.addEdit(edit);
        notifyChanged();
    }

    public void replace(int offset, int length, String text) {
        String oldText = content.substring(offset, offset + length);
        UndoableEdit edit = new ReplaceEdit(offset, oldText, text);
        edit.execute();
        undoManager.addEdit(edit);
        notifyChanged();
    }

    public void undo() {
        if (undoManager.canUndo()) {
            undoManager.undo();
            notifyChanged();
        }
    }

    public void redo() {
        if (undoManager.canRedo()) {
            undoManager.redo();
            notifyChanged();
        }
    }

    public String getContent() {
        return content.toString();
    }

    // ---- 内部类：编辑操作的备忘录 ----

    private abstract class AbstractEdit implements UndoableEdit {
        boolean hasBeenDone = true;
        boolean alive = true;

        @Override
        public boolean canUndo() { return alive && hasBeenDone; }

        @Override
        public boolean canRedo() { return alive && !hasBeenDone; }

        @Override
        public boolean isSignificant() { return true; }

        @Override
        public void die() { alive = false; }
    }

    private class InsertEdit extends AbstractEdit {
        private final int offset;
        private final String text;

        InsertEdit(int offset, String text) {
            this.offset = offset;
            this.text = text;
        }

        @Override
        public void undo() {
            super.undo();
            content.delete(offset, offset + text.length());
            hasBeenDone = false;
        }

        @Override
        public void redo() {
            super.redo();
            content.insert(offset, text);
            hasBeenDone = true;
        }

        @Override
        public void execute() {
            content.insert(offset, text);
        }
    }

    private class DeleteEdit extends AbstractEdit {
        private final int offset;
        private final String deletedText;

        DeleteEdit(int offset, String deletedText) {
            this.offset = offset;
            this.deletedText = deletedText;
        }

        @Override
        public void undo() {
            super.undo();
            content.insert(offset, deletedText);
            hasBeenDone = false;
        }

        @Override
        public void redo() {
            super.redo();
            content.delete(offset, offset + deletedText.length());
            hasBeenDone = true;
        }

        @Override
        public void execute() {
            content.delete(offset, offset + deletedText.length());
        }
    }

    private class ReplaceEdit extends AbstractEdit {
        private final int offset;
        private final String oldText;
        private final String newText;

        ReplaceEdit(int offset, String oldText, String newText) {
            this.offset = offset;
            this.oldText = oldText;
            this.newText = newText;
        }

        @Override
        public void undo() {
            super.undo();
            content.replace(offset, offset + newText.length(), oldText);
            hasBeenDone = false;
        }

        @Override
        public void redo() {
            super.redo();
            content.replace(offset, offset + oldText.length(), newText);
            hasBeenDone = true;
        }

        @Override
        public void execute() {
            content.replace(offset, offset + oldText.length(), newText);
        }
    }

    /**
     * 简单的 UndoManager 实现（非 Swing 版本）
     */
    private static class UndoManager {
        private final List<UndoableEdit> edits = new ArrayList<>();
        private int index = 0;  // 当前编辑位置
        private int limit = 100;

        public void addEdit(UndoableEdit edit) {
            // 清除当前位置之后的所有编辑（新操作使重做失效）
            while (edits.size() > index) {
                edits.remove(edits.size() - 1);
            }
            edits.add(edit);
            index = edits.size();

            // 限制历史大小
            if (edits.size() > limit) {
                edits.remove(0).die();
                index--;
            }
        }

        public void undo() {
            if (!canUndo()) return;
            index--;
            edits.get(index).undo();
        }

        public void redo() {
            if (!canRedo()) return;
            edits.get(index).redo();
            index++;
        }

        public boolean canUndo() { return index > 0; }
        public boolean canRedo() { return index < edits.size(); }
    }

    private interface UndoableEdit {
        void undo();
        void redo();
        void execute();
        boolean canUndo();
        boolean canRedo();
        boolean isSignificant();
        void die();
    }

    // 测试代码
    public static void main(String[] args) {
        DocumentEditor editor = new DocumentEditor();

        editor.insert(0, "Hello");
        System.out.println("插入: " + editor.getContent());

        editor.insert(5, " World");
        System.out.println("插入: " + editor.getContent());

        editor.replace(6, 5, "Java");
        System.out.println("替换: " + editor.getContent());

        editor.undo();
        System.out.println("撤销: " + editor.getContent());

        editor.undo();
        System.out.println("撤销: " + editor.getContent());

        editor.redo();
        System.out.println("重做: " + editor.getContent());
    }
}
```

### 19.5.2 版本控制模拟

```java
import java.time.LocalDateTime;

/**
 * 模拟版本控制系统 - 每个提交（commit）就是一个备忘录
 */
public class VersionControlSystem {
    private final List<Commit> commits = new ArrayList<>();

    /** 创建一个提交（备忘录） */
    public Commit commit(ProjectState state, String message) {
        Commit commit = new Commit(state.snapshot(), message);
        commits.add(commit);
        return commit;
    }

    /** 回滚到指定版本 */
    public ProjectState checkout(int version) {
        if (version < 0 || version >= commits.size()) {
            throw new IllegalArgumentException("版本不存在: " + version);
        }
        Commit commit = commits.get(version);
        System.out.println("切换到版本 " + version + ": " + commit.getMessage());
        return ProjectState.restore(commit.getSnapshot());
    }

    /** 列出所有版本 */
    public void log() {
        for (int i = 0; i < commits.size(); i++) {
            Commit c = commits.get(i);
            System.out.println("v" + i + " (" + c.getTimestamp() + "): " + c.getMessage());
        }
    }

    /**
     * 项目状态快照 - 备忘录
     */
    public static class ProjectSnapshot {
        private final Map<String, String> files;
        private final LocalDateTime timestamp;

        ProjectSnapshot(Map<String, String> files) {
            this.files = new HashMap<>(files);
            this.timestamp = LocalDateTime.now();
        }

        Map<String, String> getFiles() { return files; }
        LocalDateTime getTimestamp() { return timestamp; }
    }

    /**
     * 提交 - 包装了快照和元数据
     */
    public static class Commit {
        private final ProjectSnapshot snapshot;
        private final String message;
        private final LocalDateTime timestamp;

        Commit(ProjectSnapshot snapshot, String message) {
            this.snapshot = snapshot;
            this.message = message;
            this.timestamp = LocalDateTime.now();
        }

        ProjectSnapshot getSnapshot() { return snapshot; }
        String getMessage() { return message; }
        LocalDateTime getTimestamp() { return timestamp; }
    }

    /**
     * 项目状态（源发器）
     */
    public static class ProjectState {
        private final Map<String, String> files = new HashMap<>();

        public void addFile(String name, String content) {
            files.put(name, content);
        }

        public String getFile(String name) {
            return files.get(name);
        }

        /** 创建快照 */
        ProjectSnapshot snapshot() {
            return new ProjectSnapshot(files);
        }

        /** 从快照恢复 */
        static ProjectState restore(ProjectSnapshot snapshot) {
            ProjectState state = new ProjectState();
            state.files.putAll(snapshot.getFiles());
            return state;
        }

        public void showFiles() {
            files.forEach((name, content) ->
                System.out.println("  " + name + ": " + content));
        }
    }

    public static void main(String[] args) {
        VersionControlSystem vcs = new VersionControlSystem();
        ProjectState project = new ProjectState();

        // v0: 初始版本
        project.addFile("README.md", "# My Project");
        vcs.commit(project, "Initial commit");

        // v1: 添加代码
        project.addFile("Main.java", "public class Main {}");
        vcs.commit(project, "Add main class");

        // v2: 修改代码
        project.addFile("Main.java", "public class Main { public static void main(String[] args) {} }");
        vcs.commit(project, "Add main method");

        System.out.println("当前文件:");
        project.showFiles();

        System.out.println("\n版本历史:");
        vcs.log();

        // 回滚到 v1
        System.out.println("\n回滚到 v1:");
        project = vcs.checkout(1);
        project.showFiles();
    }
}
```

## 19.6 潜在风险与问题

### 19.6.1 内存开销

```java
/**
 * 问题：存储完整状态快照的内存开销
 */
public class MemoryOverheadProblem {
    public static void main(String[] args) {
        // 如果一个对象有大量字段，每次 save() 都深拷贝所有字段
        // 频繁保存时内存占用会快速增长

        // 假设一个文档有 10MB 内容
        // 每编辑一次就保存一次快照
        // 保存 100 次历史 = 1GB 内存

        Document doc = new Document("大文档", "A".repeat(10_000_000));
        List<Document> history = new ArrayList<>();

        // 每次小修改都保存完整副本
        for (int i = 0; i < 100; i++) {
            doc.setContent(doc.getContent() + ".");
            history.add(doc.clone());  // 每次复制 10MB!
        }
        // 内存占用: 100 * 10MB = 1GB!

        System.out.println("内存占用过大!");
    }
}

// 解决方案：增量备忘录
// 参见 19.7.1 节
```

### 19.6.2 深拷贝性能开销

```java
/**
 * 问题：深拷贝复杂对象图的性能开销
 */
public class DeepCopyPerformance {
    public static void main(String[] args) {
        // 当对象包含大量引用对象时，深拷贝非常耗时

        // 假设有一个复杂的文档对象：
        // Document
        //   ├── List<Paragraph> (1000个段落)
        //   │     └── List<Run> (每个段落10个文本片段)
        //   ├── List<Image> (50张图片)
        //   ├── List<Table> (10个表格)
        //   ├── Style (样式)
        //   └── Metadata (元数据)

        // 每次深拷贝可能需要数百毫秒

        // 优化：
        // 1. 只保存变化的部分（增量备忘录）
        // 2. 使用不可变对象共享不变部分
        // 3. 使用写时复制（Copy-on-Write）
    }
}
```

### 19.6.3 备忘录生命周期管理

```java
/**
 * 问题：何时删除旧的备忘录？
 */
public class MementoLifecycle {
    public static void main(String[] args) {
        // 场景：一个运行了 30 天的游戏
        // 如果每 5 分钟自动存档一次
        // 总存档数 = 30 * 24 * 12 = 8640 个存档

        // 策略：
        // 1. 只保留最近 N 个存档（滑动窗口）
        // 2. 智能删除：合并相邻的微小变更
        // 3. 按时间衰减：近期的保留更多，早期的保留更少
        // 4. 差异存档：只保存差异，完整状态按需重建
    }
}
```

### 19.6.4 状态捕获的时机

```java
/**
 * 问题：应该在什么时候保存状态？
 */
public class SaveTiming {
    // 方案1：每次变更前保存（细粒度，内存大）
    // 用户每次按键都保存 → 内存占用大，但撤销粒度细

    // 方案2：每次操作完成后保存（适中的粒度）
    // 用户完成一个"操作"后保存（如输入完一个词）

    // 方案3：定时保存（固定间隔）
    // 每 30 秒自动保存一次

    // 方案4：手动保存
    // 用户显式点击"保存"或 Ctrl+S

    // 实际系统中一般采用组合策略：
    // - 操作完成时自动保存（方案2）
    // - 加上周期性的自动保存（方案3）
    // - 用户可以手动创建命名存档（方案4）
}
```

## 19.7 优化策略

### 19.7.1 增量备忘录

```java
/**
 * 增量备忘录 - 只保存变化的部分
 * 大幅减少内存占用
 */
public class IncrementalMemento {

    static class Document {
        private String content;
        private String formatting;
        private String metadata;

        public Document(String content) {
            this.content = content;
        }

        /** 完整保存 */
        public FullMemento saveFull() {
            return new FullMemento(content, formatting, metadata);
        }

        /** 增量保存 - 只记录变化 */
        public DeltaMemento saveDelta() {
            return new DeltaMemento(
                content,    // 总是保存内容（因为内容经常变）
                null,       // formatting 没变化
                null        // metadata 没变化
            );
        }

        public void applyDelta(DeltaMemento delta) {
            if (delta.content != null) this.content = delta.content;
            if (delta.formatting != null) this.formatting = delta.formatting;
            if (delta.metadata != null) this.metadata = delta.metadata;
        }

        static class FullMemento {
            final String content;
            final String formatting;
            final String metadata;

            FullMemento(String content, String formatting, String metadata) {
                this.content = content;
                this.formatting = formatting;
                this.metadata = metadata;
            }
        }

        static class DeltaMemento {
            final String content;
            final String formatting;
            final String metadata;

            DeltaMemento(String content, String formatting, String metadata) {
                this.content = content;
                this.formatting = formatting;
                this.metadata = metadata;
            }
        }
    }

    // 增量存档器
    static class IncrementalHistory {
        private final List<Document.DeltaMemento> deltas = new ArrayList<>();
        private Document.FullMemento baseSnapshot;

        public void saveDelta(Document doc) {
            if (baseSnapshot == null) {
                // 第一次保存完整快照
                baseSnapshot = doc.saveFull();
            }
            deltas.add(doc.saveDelta());
        }

        public void restoreTo(Document doc, int deltaIndex) {
            // 从基础快照开始，依次应用增量
            doc.applyDelta(new Document.DeltaMemento(
                baseSnapshot.content,
                baseSnapshot.formatting,
                baseSnapshot.metadata
            ));

            for (int i = 0; i <= deltaIndex && i < deltas.size(); i++) {
                doc.applyDelta(deltas.get(i));
            }
        }
    }
}
```

### 19.7.2 使用 WeakReference 存储备忘录

```java
import java.lang.ref.SoftReference;
import java.lang.ref.WeakReference;

/**
 * 使用弱引用/软引用存储备忘录
 * 允许 JVM 在内存不足时回收旧的备忘录
 */
public class WeakRefMementoHistory<T> {
    private final List<SoftReference<T>> history = new ArrayList<>();
    private final int maxStrongRefs;

    public WeakRefMementoHistory(int maxStrongRefs) {
        this.maxStrongRefs = maxStrongRefs;
    }

    public void add(T memento) {
        // 保留最近的 N 个为强引用（保证可用）
        // 较早的用软引用（内存紧张时回收）
        if (history.size() < maxStrongRefs) {
            history.add(new SoftReference<>(memento));
        } else {
            // 检查最早的强引用是否已被回收
            SoftReference<T> oldest = history.get(0);
            if (oldest.get() == null) {
                history.remove(0);
            }
            history.add(new SoftReference<>(memento));
        }
    }

    public T get(int index) {
        if (index < 0 || index >= history.size()) {
            return null;
        }
        T memento = history.get(index).get();
        if (memento == null) {
            System.out.println("备忘录已被 GC 回收");
        }
        return memento;
    }

    public boolean isAvailable(int index) {
        return index >= 0 && index < history.size() && history.get(index).get() != null;
    }
}
```

### 19.7.3 限制历史大小

```java
/**
 * 限制撤销历史大小 - LRU 策略
 */
public class LRUMementoHistory<T> {
    private final int maxSize;
    private final List<T> history = new ArrayList<>();
    private final Map<T, Integer> accessCount = new HashMap<>();

    public LRUMementoHistory(int maxSize) {
        this.maxSize = maxSize;
    }

    public void add(T memento) {
        if (history.size() >= maxSize) {
            // 淘汰最久未访问的备忘录
            T leastUsed = history.stream()
                .min(Comparator.comparingInt(
                    m -> accessCount.getOrDefault(m, 0)))
                .orElse(null);
            if (leastUsed != null) {
                history.remove(leastUsed);
                accessCount.remove(leastUsed);
            }
        }
        history.add(memento);
        accessCount.put(memento, 0);
    }

    public T get(int index) {
        if (index < 0 || index >= history.size()) return null;
        T memento = history.get(index);
        accessCount.merge(memento, 1, Integer::sum);
        return memento;
    }

    public int size() { return history.size(); }
}
```

### 19.7.4 结合原型模式高效克隆

```java
/**
 * 结合原型模式（Prototype）高效创建备忘录
 */
public class PrototypeMemento<T extends Cloneable> {
    // 如果源发器实现了 Cloneable 接口
    // 可以使用 clone() 方法高效创建状态副本
    // 比 new + 逐个赋值 更快

    static class EditorState implements Cloneable {
        String content;
        int cursorPos;
        int scrollPos;

        @Override
        public EditorState clone() {
            try {
                return (EditorState) super.clone();  // 浅拷贝
                // 如果字段都是基本类型/不可变类型，浅拷贝就足够了
            } catch (CloneNotSupportedException e) {
                throw new RuntimeException(e);
            }
        }
    }

    // 使用 clone 创建备忘录
    static class Editor {
        private EditorState state = new EditorState();

        public EditorState save() {
            return state.clone();  // 比 new + 字段赋值 快
        }

        public void restore(EditorState memento) {
            this.state = memento.clone();  // 恢复时也克隆，防止外部修改
        }
    }
}
```

备忘录模式通过在源发器中封装状态保存与恢复的逻辑，完美地保护了对象的封装边界。在实际应用中，需要根据场景在内存开销和实现复杂度之间做出权衡，选择合适的备忘录变体。
