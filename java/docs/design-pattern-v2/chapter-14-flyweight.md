# 第14章 享元模式（Flyweight）

**享元模式**（Flyweight Pattern）是一种结构型设计模式，通过共享技术有效地支持大量细粒度对象。它将对象的状态分为**内部状态**（可共享）和**外部状态**（不可共享），通过共享不变的部分来大幅减少内存消耗。

享元模式的名称来源于拳击中的"蝇量级"（Flyweight），意味着这个模式让对象变得"轻量"。

## 14.1 解决的问题与应用场景

### 14.1.1 问题分析

在许多系统中，业务逻辑需要创建大量的相似对象，这会导致严重的内存消耗。

**场景：游戏中的粒子系统**

假设一个游戏场景中需要渲染 50,000 颗子弹，每个子弹对象包含贴图、伤害值、位置、速度等属性：

```java
// 没有享元模式：每个子弹都是完整的独立对象
public class BulletWithoutFlyweight {
    private final String texturePath;   // 贴图路径 (512KB 贴图数据)
    private final int damage;           // 伤害值
    private final String soundEffect;   // 音效文件路径 (128KB)
    private final String particleEffect; // 粒子特效 (256KB)
    private double x, y;                // 位置
    private double velocityX, velocityY; // 速度
    // ... 更多属性

    // 50,000 个这样的对象 = 50,000 × ~1MB = 约 50GB 内存！
}

// 但实际上：
// - 50,000 颗子弹只有 3 种类型（普通、穿甲、燃烧）
// - 每种类型的贴图、伤害值、音效都是相同的
// - 只有位置和速度在变化
```

问题总结：
- **内存爆炸**：大量相似对象占用大量内存，可能引发 OOM。
- **创建开销大**：每个对象都需要初始化所有数据（贴图加载、资源文件读取）。
- **GC 压力大**：大量短暂存活的对象频繁触发垃圾回收。
- **大部分数据是冗余的**：只有少部分状态在变化。

### 14.1.2 享元模式的解决思路

享元模式将对象的状态分为两类：

| 状态类型 | 定义 | 存储位置 | 是否可共享 | 示例 |
|----------|------|----------|------------|------|
| **内部状态** (Intrinsic State) | 对象不变的部分，不随环境变化 | 享元对象内部 | 是，多个对象共享 | 子弹类型、贴图、伤害值 |
| **外部状态** (Extrinsic State) | 随环境变化的可变部分 | 由客户端维护 | 否，每个对象独有 | 子弹位置、速度、方向 |

通过这种分离，系统只需创建少量享元对象（每种类型一个），外部状态由客户端在调用时传入。

```java
// 使用享元模式后的内存占用对比：
// 没有享元：50,000 × 1MB = 50GB
// 使用享元：3 × 1MB（内部状态） + 50,000 × 32 bytes（外部状态） ≈ 3MB + 1.6MB ≈ 5MB
// 内存节省：99.99%
```

### 14.1.3 典型应用场景

| 场景 | 描述 | 共享对象 | 外部状态 |
|------|------|----------|----------|
| 文本编辑器 | 海量字符对象的渲染 | 字符字形（字体、字号） | 字符位置、颜色 |
| 游戏开发 | 大量同类物体渲染 | 物体类型（树、石头、子弹） | 位置、旋转、缩放 |
| 连接池 | 数据库连接的复用 | 连接对象 | 事务状态、绑定变量 |
| 线程池 | 线程对象的复用 | 线程对象 | 执行的任务 |
| UI 组件 | 图标、字体的复用 | 图标/字体数据 | 显示位置、尺寸 |
| 订单系统 | 商品信息复用 | 商品基本属性 | 购买数量、订单ID |

## 14.2 实现原理与UML

### 14.2.1 核心思想

享元模式的关键设计决策：

1. **识别内部状态和外部状态**：这是使用享元模式最关键的步骤。内部状态应该是不可变的（immutable），所有共享该享元的对象看到的是相同的内部状态。

2. **享元工厂管理共享池**：享元工厂（FlyweightFactory）负责创建和管理享元对象，保证每种享元只被创建一次。

3. **客户端维护外部状态**：客户端在调用享元的方法时，需要传入外部状态作为参数。

### 14.2.2 UML类图

```
┌─────────────────────┐
│       Client        │──────────────────────┐
│                     │                      │ 维护外部状态
│  维护外部状态        │                      │
└──────────┬──────────┘                      │
           │                                 │
           │ 请求享元                         │
           ▼                                 │
┌─────────────────────┐                      │
│  FlyweightFactory   │                      │
│   (享元工厂)         │                      │
├─────────────────────┤                      │
│ - flyweights: Map   │                      │
├─────────────────────┤                      │
│ + getFlyweight(key) │                      │
└──────────┬──────────┘                      │
           │                                 │
           │ 创建/返回                        │
           ▼                                 │
┌─────────────────────┐     ┌────────────────┴─────┐
│    <<interface>>    │     │                      │
│     Flyweight       │     │  UnsharedFlyweight   │
│    (抽象享元)        │     │   (非共享享元)         │
├─────────────────────┤     ├──────────────────────┤
│ + operation(ext)    │     │ + operation(ext)     │
└──────────┬──────────┘     └──────────────────────┘
           │
           ▼
┌─────────────────────┐
│  ConcreteFlyweight  │
│   (具体享元)         │
├─────────────────────┤
│ - intrinsicState    │  ← 内部状态（可共享）
├─────────────────────┤
│ + operation(ext)    │  ← ext 是外部状态（不可共享）
└─────────────────────┘
```

### 14.2.3 角色分析

| 角色 | 职责 | 实现要点 |
|------|------|----------|
| **Flyweight（抽象享元）** | 定义享元的接口，接受外部状态作为参数 | 通常是一个接口 |
| **ConcreteFlyweight（具体享元）** | 存储内部状态，实现享元接口 | 内部状态应不可变（immutable） |
| **UnsharedConcreteFlyweight** | 不能被共享的享元子类 | 可选，提供不共享的节点 |
| **FlyweightFactory（享元工厂）** | 创建和管理享元对象，维护享元池 | 确保享元唯一性，线程安全 |
| **Client（客户端）** | 维护外部状态，通过享元工厂获取享元 | 调用时传入外部状态 |

### 14.2.4 时序图

```
Client              FlyweightFactory        ConcreteFlyweight
   │                       │                       │
   │  getFlyweight(key)    │                       │
   │ ────────────────────► │                       │
   │                       │                       │
   │                       │ 查找享元池              │
   │                       │ ──────                 │
   │                       │                       │
   │                       │ [key不存在] new()      │
   │                       │ ─────────────────────►│
   │                       │                       │
   │                       │    flyweight          │
   │                       │ ◄─────────────────────│
   │                       │                       │
   │   flyweight           │                       │
   │ ◄──────────────────── │                       │
   │                       │                       │
   │                       │                       │
   │  operation(extState)  │                       │
   │ ─────────────────────────────────────────────►│
   │                       │                       │
   │                       │                       │── 使用 internal + ext 处理
   │                       │                       │
   │        result         │                       │
   │ ◄─────────────────────────────────────────────│
   │                       │                       │
```

## 14.3 代码实现

### 14.3.1 示例一：字符渲染系统（字形享元）

文本编辑器中，每个字符都有字体、字号、样式等属性。如果文档中有 10 万个字符，每个都创建独立对象会占用大量内存。实际上，相同字体和字号的字符可以共享字形数据。

**抽象享元接口**

```java
/**
 * 字符字形接口 - Flyweight
 */
public interface Glyph {
    /**
     * 绘制字符
     * @param context 外部状态：字符位置、颜色等
     */
    void draw(GlyphContext context);
}
```

**外部状态**

```java
/**
 * 字符渲染上下文 - 外部状态
 * 这部分随着每个字符实例的不同而不同
 */
public class GlyphContext {
    private final int x;          // X 坐标位置
    private final int y;          // Y 坐标位置
    private final int fontSize;   // 字号
    private final int color;      // 颜色 (RGB)
    private final boolean bold;   // 是否粗体
    private final boolean italic; // 是否斜体

    public GlyphContext(int x, int y, int fontSize, int color,
                        boolean bold, boolean italic) {
        this.x = x;
        this.y = y;
        this.fontSize = fontSize;
        this.color = color;
        this.bold = bold;
        this.italic = italic;
    }

    public int getX() { return x; }
    public int getY() { return y; }
    public int getFontSize() { return fontSize; }
    public int getColor() { return color; }
    public boolean isBold() { return bold; }
    public boolean isItalic() { return italic; }

    @Override
    public String toString() {
        return String.format("位置=(%d,%d), 字号=%d, 颜色=#%06X",
                x, y, fontSize, color);
    }
}
```

**具体享元**

```java
import java.util.Objects;

/**
 * 字符字形实现 - ConcreteFlyweight
 * 存储内部状态：字符值、字体名称
 * 这些信息对所有使用该字形的字符来说是相同的
 */
public class CharacterGlyph implements Glyph {
    // 内部状态（不可变，可共享）
    private final char character;
    private final String fontFamily;

    public CharacterGlyph(char character, String fontFamily) {
        this.character = character;
        this.fontFamily = fontFamily;
    }

    public char getCharacter() {
        return character;
    }

    public String getFontFamily() {
        return fontFamily;
    }

    @Override
    public void draw(GlyphContext context) {
        // 使用内部状态（character, fontFamily）
        // 结合外部状态（context中的位置、颜色等）进行绘制
        System.out.printf("  绘制字符'%c' (字体:%s) -> %s%n",
                character, fontFamily, context);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CharacterGlyph)) return false;
        CharacterGlyph that = (CharacterGlyph) o;
        return character == that.character
                && Objects.equals(fontFamily, that.fontFamily);
    }

    @Override
    public int hashCode() {
        return Objects.hash(character, fontFamily);
    }
}
```

**享元工厂**

```java
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 字形工厂 - FlyweightFactory
 * 管理并缓存字形享元对象，确保同一种字形只创建一次
 */
public class GlyphFactory {
    // 享元池：线程安全的 Map
    private static final Map<CharacterGlyph, Glyph> GLYPH_POOL
            = new ConcurrentHashMap<>();

    /**
     * 获取字符字形享元
     * 如果池中已有该字形则直接返回，否则创建后缓存
     */
    public static Glyph getGlyph(char character, String fontFamily) {
        CharacterGlyph key = new CharacterGlyph(character, fontFamily);

        return GLYPH_POOL.computeIfAbsent(key, k -> {
            System.out.println("  [享元工厂] 创建新字形: '" + character
                    + "' (字体: " + fontFamily + ")");
            return new CharacterGlyph(character, fontFamily);
        });
    }

    /**
     * 获取享元池中对象的数量
     */
    public static int getPoolSize() {
        return GLYPH_POOL.size();
    }

    /**
     * 打印享元池统计信息
     */
    public static void printStats() {
        System.out.println("\n========== 享元池统计 ==========");
        System.out.println("缓存的字形数量: " + GLYPH_POOL.size());
        System.out.println("缓存的字形列表:");
        GLYPH_POOL.forEach((key, value) -> {
            CharacterGlyph g = (CharacterGlyph) value;
            System.out.printf("  '%c' -> 字体: %s%n",
                    g.getCharacter(), g.getFontFamily());
        });
        System.out.println("================================");
    }
}
```

**文本编辑器客户端**

```java
import java.util.ArrayList;
import java.util.List;

/**
 * 格式化字符实例 - 组合享元和外部状态
 */
class FormattedCharacter {
    private final Glyph glyph;           // 享元引用
    private final GlyphContext context;  // 外部状态

    public FormattedCharacter(Glyph glyph, GlyphContext context) {
        this.glyph = glyph;
        this.context = context;
    }

    public void render() {
        glyph.draw(context);
    }
}

/**
 * 文本编辑器 - Client
 * 管理所有字符实例及其外部状态
 */
public class TextEditor {
    private final List<FormattedCharacter> document = new ArrayList<>();

    /**
     * 在文档中插入一个字符
     */
    public void insertChar(char c, String fontFamily,
                           int x, int y, int fontSize, int color,
                           boolean bold, boolean italic) {
        // 从享元工厂获取共享的字形对象
        Glyph glyph = GlyphFactory.getGlyph(c, fontFamily);

        // 创建外部状态
        GlyphContext context = new GlyphContext(
                x, y, fontSize, color, bold, italic);

        // 组合享元和外部状态
        document.add(new FormattedCharacter(glyph, context));
    }

    /**
     * 渲染整个文档
     */
    public void render() {
        System.out.println("\n========== 渲染文档 (共 " + document.size()
                + " 个字符) ==========");
        for (FormattedCharacter fc : document) {
            fc.render();
        }
    }

    /**
     * 文本编辑器测试
     */
    public static void main(String[] args) {
        TextEditor editor = new TextEditor();

        // 输入 "Hello World!" 这段文本
        // 使用宋体
        editor.insertChar('H', "宋体", 0, 0, 16, 0x000000, false, false);
        editor.insertChar('e', "宋体", 16, 0, 16, 0x000000, false, false);
        editor.insertChar('l', "宋体", 32, 0, 16, 0x000000, false, false);
        editor.insertChar('l', "宋体", 48, 0, 16, 0x000000, false, false);
        editor.insertChar('o', "宋体", 64, 0, 16, 0x000000, false, false);

        // 空格
        editor.insertChar(' ', "宋体", 80, 0, 16, 0x000000, false, false);

        // "World" 部分用楷体，不同的颜色
        editor.insertChar('W', "楷体", 96, 0, 20, 0xFF0000, true, false);
        editor.insertChar('o', "楷体", 116, 0, 20, 0xFF0000, true, false);
        editor.insertChar('r', "楷体", 136, 0, 20, 0xFF0000, true, false);
        editor.insertChar('l', "楷体", 156, 0, 20, 0xFF0000, true, false);
        editor.insertChar('d', "楷体", 176, 0, 20, 0xFF0000, true, false);

        // 感叹号 - 和 H 同字体
        editor.insertChar('!', "宋体", 196, 0, 16, 0x0000FF, false, true);

        // 渲染文档
        editor.render();

        // 查看享元池统计
        GlyphFactory.printStats();

        /*
         * 内存分析：
         * - 文档中共 12 个字符
         * - 但享元池中只有 11 个字形对象
         *   （两个 'l' 是同一个享元，两个 'o' 也是不同字体各自只有一个）
         * - 如果有 100 万字符的长文档，享元池仍然只有几十到几百个对象
         */
    }
}
```

**运行结果（核心输出）**

```
  [享元工厂] 创建新字形: 'H' (字体: 宋体)
  [享元工厂] 创建新字形: 'e' (字体: 宋体)
  [享元工厂] 创建新字形: 'l' (字体: 宋体)
  [享元工厂] 创建新字形: 'o' (字体: 宋体)
  [享元工厂] 创建新字形: ' ' (字体: 宋体)
  [享元工厂] 创建新字形: 'W' (字体: 楷体)
  [享元工厂] 创建新字形: 'o' (字体: 楷体)
  [享元工厂] 创建新字形: 'r' (字体: 楷体)
  [享元工厂] 创建新字形: 'l' (字体: 楷体)
  [享元工厂] 创建新字形: 'd' (字体: 楷体)
  [享元工厂] 创建新字形: '!' (字体: 宋体)

========== 享元池统计 ==========
缓存的字形数量: 11
```

### 14.3.2 示例二：游戏粒子系统

```java
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 子弹类型枚举
 */
enum BulletType {
    NORMAL("普通弹", "/textures/bullet_normal.png", 10, "/sounds/hit_normal.wav"),
    ARMOR_PIERCING("穿甲弹", "/textures/bullet_ap.png", 25, "/sounds/hit_ap.wav"),
    INCENDIARY("燃烧弹", "/textures/bullet_fire.png", 15, "/sounds/hit_fire.wav");

    private final String displayName;
    private final String texturePath;
    private final int baseDamage;
    private final String hitSound;

    BulletType(String displayName, String texturePath,
               int baseDamage, String hitSound) {
        this.displayName = displayName;
        this.texturePath = texturePath;
        this.baseDamage = baseDamage;
        this.hitSound = hitSound;
    }

    public String getDisplayName() { return displayName; }
    public String getTexturePath() { return texturePath; }
    public int getBaseDamage() { return baseDamage; }
    public String getHitSound() { return hitSound; }
}

/**
 * 子弹享元 - ConcreteFlyweight
 * 存储子弹的内部状态：类型、贴图、伤害值、音效
 * 所有同类型子弹共享这一个对象
 */
public class BulletFlyweight {
    // 内部状态（不可变）
    private final BulletType type;
    private final byte[] textureData;   // 模拟纹理数据
    private final byte[] soundData;     // 模拟音效数据
    private final int damage;

    public BulletFlyweight(BulletType type) {
        this.type = type;
        this.damage = type.getBaseDamage();

        // 模拟加载纹理和音效资源（创建成本高）
        System.out.println("  [加载资源] 子弹类型: " + type.getDisplayName()
                + " (贴图: " + type.getTexturePath()
                + ", 音效: " + type.getHitSound() + ")");

        this.textureData = loadTexture(type.getTexturePath());
        this.soundData = loadSound(type.getHitSound());
    }

    public BulletType getType() { return type; }
    public int getDamage() { return damage; }
    public byte[] getTextureData() { return textureData; }
    public byte[] getSoundData() { return soundData; }

    private byte[] loadTexture(String path) {
        // 模拟加载纹理数据（通常几MB）
        return new byte[512 * 1024]; // 512KB 纹理
    }

    private byte[] loadSound(String path) {
        // 模拟加载音效数据
        return new byte[128 * 1024]; // 128KB 音效
    }
}

/**
 * 子弹享元工厂 - FlyweightFactory
 */
public class BulletFlyweightFactory {
    private static final Map<BulletType, BulletFlyweight> POOL
            = new ConcurrentHashMap<>();

    static {
        // 预加载所有子弹类型（游戏启动时加载）
        System.out.println("======= 游戏启动 - 预加载子弹资源 =======");
        for (BulletType type : BulletType.values()) {
            POOL.put(type, new BulletFlyweight(type));
        }
        System.out.println("======= 预加载完成，共 " + POOL.size()
                + " 种子弹类型 =======\n");
    }

    public static BulletFlyweight getBullet(BulletType type) {
        return POOL.get(type);
    }

    public static int getCacheSize() {
        return POOL.size();
    }
}

/**
 * 子弹实例 - 包含外部状态
 * 每个飞行中的子弹都是一个 BulletInstance
 */
public class BulletInstance {
    // 引用享元（内部状态，共享）
    private final BulletFlyweight flyweight;

    // 外部状态（每个实例不同）
    private double x, y;           // 位置
    private double velocityX;      // X方向速度
    private double velocityY;      // Y方向速度
    private double rotation;       // 旋转角度
    private boolean active;        // 是否存活

    public BulletInstance(BulletType type, double startX, double startY,
                          double velocityX, double velocityY) {
        this.flyweight = BulletFlyweightFactory.getBullet(type);
        this.x = startX;
        this.y = startY;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.rotation = Math.atan2(velocityY, velocityX);
        this.active = true;
    }

    /**
     * 每帧更新位置
     */
    public void update(double deltaTime) {
        x += velocityX * deltaTime;
        y += velocityY * deltaTime;

        // 简单的边界检查
        if (x < 0 || x > 1000 || y < 0 || y > 800) {
            active = false;
        }
    }

    /**
     * 渲染子弹
     */
    public void render() {
        System.out.printf("  [子弹] 类型=%s, 位置=(%.1f, %.1f), "
                        + "速度=(%.1f, %.1f), 伤害=%d, 存活=%b%n",
                flyweight.getType().getDisplayName(),
                x, y, velocityX, velocityY,
                flyweight.getDamage(), active);
    }

    public boolean isActive() { return active; }

    /**
     * 估算内存占用（仅外部状态）
     */
    public long estimateExternalMemory() {
        // 7 个字段，约 56 bytes（在 64位 JVM）
        return 56;
    }
}

/**
 * 游戏引擎 - Client
 */
public class GameEngine {
    private final List<BulletInstance> activeBullets = new CopyOnWriteArrayList<>();

    /**
     * 发射子弹
     */
    public void fireBullet(BulletType type, double x, double y,
                           double vx, double vy) {
        activeBullets.add(new BulletInstance(type, x, y, vx, vy));
    }

    /**
     * 游戏主循环
     */
    public void gameLoop(int iterations) {
        double deltaTime = 0.016; // 16ms ≈ 60 FPS

        System.out.println("======= 游戏运行中 =======");
        for (int frame = 1; frame <= iterations; frame++) {
            // 更新所有子弹
            for (BulletInstance bullet : activeBullets) {
                bullet.update(deltaTime);
            }

            // 移除已失效的子弹
            activeBullets.removeIf(b -> !b.isActive());

            if (frame <= 3 || frame == iterations) {
                System.out.println("\n--- 第 " + frame + " 帧 "
                        + "(活跃子弹: " + activeBullets.size() + ") ---");
                for (BulletInstance bullet : activeBullets) {
                    bullet.render();
                }
            }
        }
    }

    /**
     * 内存统计
     */
    public void printMemoryEstimation() {
        int bulletCount = activeBullets.size();
        long externalMemory = bulletCount * new BulletInstance(
                BulletType.NORMAL, 0, 0, 0, 0).estimateExternalMemory();

        // 享元工厂中的共享对象内存
        long sharedMemory = BulletFlyweightFactory.getCacheSize()
                * (512L + 128L) * 1024; // 3 种类型 × (512KB + 128KB)

        System.out.println("\n========== 内存统计 ==========");
        System.out.println("活跃子弹数量: " + bulletCount);
        System.out.println("子弹类型数量: " + BulletFlyweightFactory.getCacheSize());
        System.out.println("外部状态内存: " + externalMemory / 1024 + " KB");
        System.out.println("共享资源内存: " + sharedMemory / 1024 + " KB");
        System.out.println("总内存: " + (externalMemory + sharedMemory) / 1024 + " KB");

        if (bulletCount > 0) {
            long withoutFlyweight = bulletCount * (512L + 128L) * 1024;
            System.out.println("如果不使用享元模式: "
                    + withoutFlyweight / 1024 / 1024 + " MB");
            System.out.println("内存节省: " +
                    (1.0 - (externalMemory + sharedMemory) /
                            (double) withoutFlyweight) * 100 + "%");
        }
        System.out.println("==============================");
    }

    public static void main(String[] args) {
        GameEngine engine = new GameEngine();

        // 发射大量不同类型的子弹
        System.out.println("======= 发射子弹 =======");
        for (int i = 0; i < 10; i++) {
            engine.fireBullet(
                    BulletType.NORMAL,         // 类型
                    100 + i * 10, 200,         // 起始位置
                    100 + Math.random() * 50,  // X 速度
                    -30 + Math.random() * 60   // Y 速度
            );
        }
        for (int i = 0; i < 5; i++) {
            engine.fireBullet(
                    BulletType.ARMOR_PIERCING,
                    200 + i * 15, 300,
                    80, -10
            );
        }
        for (int i = 0; i < 3; i++) {
            engine.fireBullet(
                    BulletType.INCENDIARY,
                    300 + i * 20, 400,
                    60, -50
            );
        }

        // 运行游戏循环
        engine.gameLoop(5);

        // 统计内存
        engine.printMemoryEstimation();
    }
}
```

### 14.3.3 示例三：数据库连接池（享元的实际应用）

连接池是享元模式在工程实践中的经典应用。通过共享有限数量的数据库连接，避免频繁创建和销毁连接。

```java
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Queue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 连接池享元工厂
 *
 * 注意：这是一个教学用的简化实现。
 * 生产环境请使用 HikariCP、Druid 等成熟的连接池。
 */
public class ConnectionPool {
    private final BlockingQueue<PooledConnection> idleConnections;
    private final String jdbcUrl;
    private final String username;
    private final String password;
    private final int maxPoolSize;

    private final AtomicInteger createdCount = new AtomicInteger(0);
    private final AtomicInteger borrowCount = new AtomicInteger(0);
    private final AtomicInteger returnCount = new AtomicInteger(0);

    public ConnectionPool(String jdbcUrl, String username,
                          String password, int maxPoolSize) {
        this.jdbcUrl = jdbcUrl;
        this.username = username;
        this.password = password;
        this.maxPoolSize = maxPoolSize;
        this.idleConnections = new LinkedBlockingQueue<>(maxPoolSize);
    }

    /**
     * 从池中获取一个连接（借用）
     */
    public PooledConnection borrowConnection() throws SQLException {
        // 1. 先尝试从空闲队列中获取
        PooledConnection conn = idleConnections.poll();
        if (conn != null) {
            borrowCount.incrementAndGet();
            System.out.println("[连接池] 复用空闲连接 (当前借用: "
                    + borrowCount.get() + ")");
            return conn;
        }

        // 2. 空闲队列为空，且未达到最大连接数，创建新连接
        if (createdCount.get() < maxPoolSize) {
            Connection realConn = DriverManager.getConnection(
                    jdbcUrl, username, password);
            createdCount.incrementAndGet();
            borrowCount.incrementAndGet();

            PooledConnection pooled = new PooledConnection(realConn, this);
            System.out.println("[连接池] 创建新连接 (总计: "
                    + createdCount.get() + "/" + maxPoolSize + ")");
            return pooled;
        }

        // 3. 达到最大连接数，等待空闲连接
        try {
            System.out.println("[连接池] 等待空闲连接...");
            conn = idleConnections.poll(30, TimeUnit.SECONDS);
            if (conn != null) {
                borrowCount.incrementAndGet();
                return conn;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        throw new SQLException("无法获取连接：连接池已满且超时");
    }

    /**
     * 归还连接到池中
     */
    void returnConnection(PooledConnection conn) {
        if (conn != null) {
            returnCount.incrementAndGet();
            idleConnections.offer(conn);
            System.out.println("[连接池] 连接已归还 (空闲: "
                    + idleConnections.size() + ")");
        }
    }

    /**
     * 打印统计信息
     */
    public void printStats() {
        System.out.println("\n========== 连接池统计 ==========");
        System.out.println("已创建连接数: " + createdCount.get());
        System.out.println("最大连接数:   " + maxPoolSize);
        System.out.println("空闲连接数:   " + idleConnections.size());
        System.out.println("借用次数:     " + borrowCount.get());
        System.out.println("归还次数:     " + returnCount.get());
        System.out.println("================================");
    }

    public void closeAll() throws SQLException {
        for (PooledConnection conn : idleConnections) {
            conn.reallyClose();
        }
        idleConnections.clear();
        System.out.println("[连接池] 所有连接已关闭");
    }
}

/**
 * 池化的连接包装器
 * 对外提供与普通 Connection 一样的接口
 */
class PooledConnection {
    private final Connection realConnection;
    private final ConnectionPool pool;
    private boolean closed = false;

    public PooledConnection(Connection realConnection, ConnectionPool pool) {
        this.realConnection = realConnection;
        this.pool = pool;
    }

    public void executeQuery(String sql) {
        if (closed) {
            throw new RuntimeException("连接已归还池中");
        }
        System.out.println("  [SQL] 执行: " + sql);
        // 实际应使用 Statement/PreparedStatement
    }

    /**
     * 归还连接（不是真正关闭，而是归还池中）
     */
    public void close() {
        if (!closed) {
            closed = true;
            pool.returnConnection(this);
        }
    }

    /**
     * 真正关闭物理连接
     */
    void reallyClose() throws SQLException {
        if (realConnection != null && !realConnection.isClosed()) {
            realConnection.close();
        }
    }
}

/**
 * 连接池使用示例
 */
public class ConnectionPoolDemo {
    public static void main(String[] args) throws SQLException {
        // 创建连接池（最大 3 个连接）
        // 实际环境需要正确的 JDBC URL
        ConnectionPool pool = new ConnectionPool(
                "jdbc:h2:mem:testdb",  // 使用 H2 内存数据库
                "sa",
                "",
                3
        );

        System.out.println("======= 连接池使用示例 =======\n");

        // 模拟多个线程并发使用连接
        Runnable task = () -> {
            try {
                PooledConnection conn = pool.borrowConnection();
                System.out.println("  [" + Thread.currentThread().getName()
                        + "] 获取到连接");

                // 使用连接执行查询
                conn.executeQuery("SELECT * FROM users WHERE id = 1");

                // 模拟业务处理
                Thread.sleep(100);

                // 归还连接
                conn.close();
                System.out.println("  [" + Thread.currentThread().getName()
                        + "] 归还连接");

            } catch (Exception e) {
                System.out.println("  [" + Thread.currentThread().getName()
                        + "] 错误: " + e.getMessage());
            }
        };

        // 启动 5 个线程（但池中只有 3 个连接）
        Thread[] threads = new Thread[5];
        for (int i = 0; i < 5; i++) {
            threads[i] = new Thread(task, "Worker-" + (i + 1));
            threads[i].start();
        }

        // 等待所有线程完成
        for (Thread t : threads) {
            try {
                t.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        // 打印统计
        pool.printStats();

        // 关闭所有连接
        pool.closeAll();
    }
}
```

## 14.4 JDK/框架源码解析

### 14.4.1 Integer 的缓存机制

Java 的 `Integer` 类是享元模式最基础和最常见的 JDK 实现。`Integer.valueOf()` 会缓存 -128 到 127 范围的整数对象。

```java
/**
 * Integer 的享元模式分析
 */
public class IntegerCacheDemo {
    public static void main(String[] args) {
        // 使用 valueOf 会命中缓存
        Integer a = Integer.valueOf(127);
        Integer b = Integer.valueOf(127);
        System.out.println("127: a == b → " + (a == b));  // true (享元命中)

        Integer c = Integer.valueOf(128);
        Integer d = Integer.valueOf(128);
        System.out.println("128: c == d → " + (c == d));  // false (超出缓存范围)

        // 直接 new 不会使用缓存
        Integer e = new Integer(127);
        Integer f = new Integer(127);
        System.out.println("new 127: e == f → " + (e == f));  // false

        // 缓存边界验证
        Integer g = Integer.valueOf(-128);
        Integer h = Integer.valueOf(-128);
        System.out.println("-128: g == h → " + (g == h));  // true

        Integer i = Integer.valueOf(-129);
        Integer j = Integer.valueOf(-129);
        System.out.println("-129: i == j → " + (i == j));  // false
    }
}

/*
 * Integer 内部缓存实现（JDK 源码简化版）：
 *
 * private static class IntegerCache {
 *     static final int low = -128;
 *     static final int high = 127; // 可通过 -XX:AutoBoxCacheMax= 调整
 *     static final Integer cache[];
 *
 *     static {
 *         cache = new Integer[(high - low) + 1];
 *         int j = low;
 *         for (int k = 0; k < cache.length; k++)
 *             cache[k] = new Integer(j++);
 *     }
 * }
 *
 * public static Integer valueOf(int i) {
 *     if (i >= IntegerCache.low && i <= IntegerCache.high)
 *         return IntegerCache.cache[i + (-IntegerCache.low)];
 *     return new Integer(i);
 * }
 */
```

### 14.4.2 Boolean 的享元实例

`Boolean` 类直接提供了两个静态常量作为享元，因为布尔值只有 `true` 和 `false` 两种可能。

```java
// java.lang.Boolean 源码中的享元定义：
// public static final Boolean TRUE = new Boolean(true);
// public static final Boolean FALSE = new Boolean(false);
//
// public static Boolean valueOf(boolean b) {
//     return (b ? TRUE : FALSE);
// }
//
// public static Boolean valueOf(String s) {
//     return parseBoolean(s) ? TRUE : FALSE;
// }

public class BooleanFlyweightDemo {
    public static void main(String[] args) {
        Boolean a = Boolean.valueOf(true);
        Boolean b = Boolean.valueOf(true);
        System.out.println("a == b → " + (a == b));        // true
        System.out.println("a == Boolean.TRUE → "
                + (a == Boolean.TRUE));                       // true

        Boolean c = Boolean.valueOf("true");
        Boolean d = Boolean.valueOf("true");
        System.out.println("c == d → " + (c == d));        // true

        // Boolean 的享元只有两个，无论怎么创建都是这两个对象之一
    }
}
```

### 14.4.3 String 常量池

Java 字符串常量池是享元模式的另一种经典实现。字符串字面量会被自动放入常量池中，相同的字面量引用同一个对象。

```java
/**
 * String 常量池 = 字符串享元池
 */
public class StringPoolDemo {
    public static void main(String[] args) {
        // 字面量直接放入常量池
        String s1 = "hello";
        String s2 = "hello";
        System.out.println("s1 == s2 → " + (s1 == s2));  // true (同一对象)

        // new 创建的不在常量池中
        String s3 = new String("hello");
        System.out.println("s1 == s3 → " + (s1 == s3));  // false

        // intern() 方法返回常量池中的引用
        String s4 = s3.intern();
        System.out.println("s1 == s4 → " + (s1 == s4));  // true

        // 字符串连接在编译期可能会优化
        String s5 = "he" + "llo";  // 编译期优化为 "hello"
        System.out.println("s1 == s5 → " + (s1 == s5));  // true

        // 运行时连接的字符串不会自动入池
        String s6 = new String("he") + new String("llo");
        System.out.println("s1 == s6 → " + (s1 == s6));  // false
        System.out.println("s1 == s6.intern() → "
                + (s1 == s6.intern()));                     // true
    }
}
```

### 14.4.4 HikariCP 连接池中的享元思想

HikariCP 是目前性能最好的 JDBC 连接池，它采用了享元模式的核心思想：复用连接对象（内部状态），每个连接维护各自的会话状态（外部状态）。

```java
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

/**
 * HikariCP 连接池使用示例
 */
public class HikariCPExample {

    public static void main(String[] args) throws Exception {
        // 配置连接池
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:h2:mem:testdb");
        config.setUsername("sa");
        config.setPassword("");
        config.setMaximumPoolSize(10);     // 最大连接数 = 享元池大小
        config.setMinimumIdle(5);          // 最小空闲连接
        config.setConnectionTimeout(30000); // 连接超时
        config.setIdleTimeout(600000);     // 空闲超时

        HikariDataSource dataSource = new HikariDataSource(config);

        // 从连接池获取连接（借用享元）
        try (Connection conn = dataSource.getConnection()) {
            System.out.println("获取到连接: " + conn.toString());

            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT 1")) {
                ResultSet rs = stmt.executeQuery();
                if (rs.next()) {
                    System.out.println("查询结果: " + rs.getInt(1));
                }
            }
            // 连接自动归还（通过 close() 方法，但实际是归还池中）
        }

        // 连接池统计
        System.out.println("活跃连接: " + dataSource.getHikariPoolMXBean()
                .getActiveConnections());
        System.out.println("空闲连接: " + dataSource.getHikariPoolMXBean()
                .getIdleConnections());

        dataSource.close();
    }
}
```

### 14.4.5 Spring 单例 Bean

Spring 容器中的单例（Singleton）Bean 也是享元模式的一种应用：每个 Bean 的 Class 定义是内部状态（共享），不同注入点的配置可能是外部状态（通过属性注入）。

```java
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Component;

/**
 * Spring 单例 Bean = 享元模式
 *
 * - 默认的 @Scope("singleton") 意味着整个容器中只有一个实例
 * - 所有依赖注入点都共享这同一个 Bean 实例
 * - Bean 的字段通过依赖注入配置，是外部状态
 * - Bean 的方法行为是内部状态（由 Class 定义）
 */
@Component
@Scope("singleton")  // 默认就是 singleton，享元模式
public class ProductService {
    // 这个类的实例在整个 Spring 容器中只有一个
    // 所有需要 ProductService 的地方都共享同一个实例

    public Product findById(Long id) {
        // ...
        return new Product();
    }
}

@Component
@Scope("prototype")  // 不使用享元，每次创建新实例
public class TemporaryProcessor {
    // 每次注入或 getBean 都创建新实例
    // 适用于有状态的对象（外部状态占主导）
}
```

### 14.4.6 JDK 底层编译器的字体享元

`java.awt.Font` 类在 Java 2D 渲染中也使用了享元思想。创建大量使用相同属性的 Font 对象时，底层会尽量共享字体数据。

```java
import java.awt.Font;

public class FontFlyweightExample {
    public static void main(String[] args) {
        // 创建大量相同属性的 Font 对象
        // JVM 底层会对字体数据进行共享（依赖于操作系统和 JVM 实现）
        Font f1 = new Font("宋体", Font.PLAIN, 12);
        Font f2 = new Font("宋体", Font.PLAIN, 12);
        Font f3 = new Font("宋体", Font.BOLD, 12);

        // f1 和 f2 在底层可能会共享字体资源数据
        System.out.println("f1 family: " + f1.getFamily());
        System.out.println("f2 family: " + f2.getFamily());
    }
}

class Product { /* 商品实体类，省略 */ }
```

## 14.5 使用场景与案例

### 14.5.1 文本编辑器格式化系统

大型文本编辑器中，每个字符可能都有独立的字体、颜色、粗体/斜体等格式。享元模式可以将字符格式化信息共享。

```java
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 字符格式化属性 - 享元
 * 包含字体、字号、颜色、粗体、斜体等属性组合
 * 相同格式的字符共享同一个 FormattingFlyweight
 */
public class FormattingFlyweight {
    private final String fontFamily;
    private final int fontSize;
    private final int textColor;
    private final int backgroundColor;
    private final boolean bold;
    private final boolean italic;
    private final boolean underline;

    // 私有构造函数，只能通过工厂创建
    private FormattingFlyweight(Builder builder) {
        this.fontFamily = builder.fontFamily;
        this.fontSize = builder.fontSize;
        this.textColor = builder.textColor;
        this.backgroundColor = builder.backgroundColor;
        this.bold = builder.bold;
        this.italic = builder.italic;
        this.underline = builder.underline;
    }

    // equals 和 hashCode 用于享元池的键去重
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FormattingFlyweight)) return false;
        FormattingFlyweight that = (FormattingFlyweight) o;
        return fontSize == that.fontSize
                && textColor == that.textColor
                && backgroundColor == that.backgroundColor
                && bold == that.bold
                && italic == that.italic
                && underline == that.underline
                && Objects.equals(fontFamily, that.fontFamily);
    }

    @Override
    public int hashCode() {
        return Objects.hash(fontFamily, fontSize, textColor,
                backgroundColor, bold, italic, underline);
    }

    /**
     * 渲染方法 - 使用享元的格式化信息加上外部传入的字符和位置
     */
    public void render(char c, int x, int y) {
        // x, y 是外部状态
        System.out.printf("  渲染'%c' @ (%d,%d) 字体=%s 大小=%d 颜色=#%06X 粗=%b 斜=%b%n",
                c, x, y, fontFamily, fontSize, textColor, bold, italic);
    }

    // Builder
    static class Builder {
        private String fontFamily = "Arial";
        private int fontSize = 12;
        private int textColor = 0x000000;
        private int backgroundColor = 0xFFFFFF;
        private boolean bold = false;
        private boolean italic = false;
        private boolean underline = false;

        public Builder fontFamily(String s) { this.fontFamily = s; return this; }
        public Builder fontSize(int s) { this.fontSize = s; return this; }
        public Builder textColor(int c) { this.textColor = c; return this; }
        public Builder backgroundColor(int c) { this.backgroundColor = c; return this; }
        public Builder bold(boolean b) { this.bold = b; return this; }
        public Builder italic(boolean i) { this.italic = i; return this; }
        public Builder underline(boolean u) { this.underline = u; return this; }

        public FormattingFlyweight build() {
            return FormattingFactory.getFormatting(this);
        }
    }

    /**
     * 格式化享元工厂
     */
    static class FormattingFactory {
        private static final Map<FormattingFlyweight, FormattingFlyweight>
                POOL = new ConcurrentHashMap<>();

        static FormattingFlyweight getFormatting(Builder builder) {
            FormattingFlyweight key = new FormattingFlyweight(builder);
            return POOL.computeIfAbsent(key, k -> {
                System.out.println("  [格式工厂] 创建新格式: "
                        + builder.fontFamily + " " + builder.fontSize + "pt");
                return k;
            });
        }

        static int getPoolSize() {
            return POOL.size();
        }
    }
}

/**
 * 文本编辑器格式化系统测试
 */
class TextFormattingDemo {
    public static void main(String[] args) {
        // 为 "HELLO" 的每个字符创建可能不同的格式
        // 但由于 H-E-L-L-O 用了相似格式，实际创建的 FormattingFlyweight 很少

        FormattingFlyweight.Builder builder = new FormattingFlyweight.Builder();

        // H - 红色粗体
        FormattingFlyweight redBold = builder
                .fontFamily("Arial").fontSize(16)
                .textColor(0xFF0000).bold(true)
                .build();

        // E - 红色（复用 redBold？不，不是粗体，所以不同）
        FormattingFlyweight redNormal = builder
                .fontFamily("Arial").fontSize(16)
                .textColor(0xFF0000).bold(false)
                .build();

        // L (第一个) - 蓝色（新建）
        FormattingFlyweight blueNormal = builder
                .fontFamily("Arial").fontSize(16)
                .textColor(0x0000FF).bold(false)
                .build();

        // L (第二个) - 蓝色（复用！）
        FormattingFlyweight blueNormal2 = builder
                .fontFamily("Arial").fontSize(16)
                .textColor(0x0000FF).bold(false)
                .build();

        // O - 红色（复用 redNormal）
        FormattingFlyweight redNormal2 = builder
                .fontFamily("Arial").fontSize(16)
                .textColor(0xFF0000).bold(false)
                .build();

        System.out.println("\n格式对象数量: "
                + FormattingFlyweight.FormattingFactory.getPoolSize());
        System.out.println("blueNormal == blueNormal2 → "
                + (blueNormal == blueNormal2));
        System.out.println("redNormal == redNormal2 → "
                + (redNormal == redNormal2));
    }
}
```

### 14.5.2 图标缓存系统

UI 应用中经常需要展示大量图标，享元模式可以缓存图标数据，避免重复加载。

```java
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 图标享元 - 存储内部状态（图标数据）
 */
public class IconFlyweight {
    private final String name;
    private final byte[] imageData;  // 图标像素数据
    private final int width;
    private final int height;

    public IconFlyweight(String name, int width, int height) {
        this.name = name;
        this.width = width;
        this.height = height;
        this.imageData = loadImageData(name);  // 模拟加载
        System.out.println("  [加载图标] " + name
                + " (" + width + "x" + height + ")");
    }

    private byte[] loadImageData(String name) {
        // 模拟从磁盘或网络加载图标数据
        return new byte[width * height * 4]; // RGBA
    }

    public String getName() { return name; }
    public int getWidth() { return width; }
    public int getHeight() { return height; }
    public byte[] getImageData() { return imageData; }
}

/**
 * 图标缓存工厂
 */
class IconCache {
    private static final Map<String, IconFlyweight> CACHE
            = new ConcurrentHashMap<>();

    public static IconFlyweight getIcon(String name, int width, int height) {
        String key = name + "_" + width + "x" + height;
        return CACHE.computeIfAbsent(key,
                k -> new IconFlyweight(name, width, height));
    }

    public static int getCacheSize() {
        return CACHE.size();
    }
}

/**
 * 菜单项 - 使用图标享元
 */
class MenuItem {
    private final String label;
    private final IconFlyweight icon;  // 享元引用
    private final int x, y;           // 外部状态：菜单位置

    public MenuItem(String label, String iconName, int x, int y) {
        this.label = label;
        this.icon = IconCache.getIcon(iconName, 24, 24);
        this.x = x;
        this.y = y;
    }

    public void render() {
        System.out.printf("  菜单项 '%s' @ (%d,%d) 图标: %s (%dx%d)%n",
                label, x, y, icon.getName(), icon.getWidth(), icon.getHeight());
    }
}
```

## 14.6 潜在风险与问题

### 14.6.1 线程安全问题

享元工厂的享元池被多个线程并发访问，必须使用线程安全的数据结构。

```java
// 错误：非线程安全的享元工厂
public class UnsafeFlyweightFactory {
    // HashMap 不是线程安全的！
    private static final Map<String, Flyweight> POOL = new HashMap<>();

    public static Flyweight getFlyweight(String key) {
        if (!POOL.containsKey(key)) {
            // 竞态条件：多个线程可能同时进入这里
            POOL.put(key, new ConcreteFlyweight(key));  // 可能创建多个实例
        }
        return POOL.get(key);
    }
}

// 正确：线程安全的享元工厂
public class SafeFlyweightFactory {
    // 使用 ConcurrentHashMap
    private static final Map<String, Flyweight> POOL = new ConcurrentHashMap<>();

    public static Flyweight getFlyweight(String key) {
        // computeIfAbsent 是原子操作
        return POOL.computeIfAbsent(key, ConcreteFlyweight::new);
    }
}
```

### 14.6.2 外部状态管理复杂性

将外部状态从对象中剥离后，客户端的代码会变得更加复杂。客户端需要自己追踪和维护外部状态。

```java
// 痛点：外部状态分散在客户端代码中
// 当外部状态种类增多时，客户端变得难以管理
public class ComplexClient {
    // 客户端需要管理：位置、颜色、字体、动画状态、交互状态...
    // 每种外部状态都需要在正确的地方创建、传递、销毁
    private final Map<Glyph, List<GlyphContext>> contexts = new HashMap<>();

    public void addCharacter(Glyph glyph, int x, int y, int color) {
        contexts.computeIfAbsent(glyph, k -> new ArrayList<>())
                .add(new GlyphContext(x, y, 12, color, false, false));
    }
    // 外部状态的管理代码可能比业务逻辑本身更复杂
}
```

**缓解措施**：
- 将外部状态集中管理在专门的 Context 类中。
- 使用不可变的外部状态对象，避免被意外修改。
- 在享元模式基础上，可以结合其他模式（如组合模式）简化客户端。

### 14.6.3 享元池的内存泄漏风险

如果享元池持续增长而不清理，可能会导致内存泄漏。

```java
// 使用 WeakReference 允许 GC 回收不再使用的享元
import java.lang.ref.WeakReference;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class WeakReferenceFlyweightFactory {
    private static final Map<String, WeakReference<Flyweight>> POOL
            = new ConcurrentHashMap<>();

    public static Flyweight getFlyweight(String key) {
        WeakReference<Flyweight> ref = POOL.get(key);

        if (ref != null) {
            Flyweight flyweight = ref.get();
            if (flyweight != null) {
                return flyweight;  // 对象仍存活
            }
            // ref 已被 GC 回收，移除无效条目
            POOL.remove(key);
        }

        Flyweight newFlyweight = new ConcreteFlyweight(key);
        POOL.put(key, new WeakReference<>(newFlyweight));
        return newFlyweight;
    }
}

// 或者使用 LRU 策略限制池的大小
import java.util.LinkedHashMap;

public class LruFlyweightFactory {
    private static final int MAX_POOL_SIZE = 100;

    private static final Map<String, Flyweight> POOL = new LinkedHashMap<>(
            16, 0.75f, true) {  // accessOrder=true 启用 LRU
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Flyweight> eldest) {
            boolean shouldRemove = size() > MAX_POOL_SIZE;
            if (shouldRemove) {
                System.out.println("[LRU] 淘汰最久未使用的享元: " + eldest.getKey());
            }
            return shouldRemove;
        }
    };

    public static Flyweight getFlyweight(String key) {
        return POOL.computeIfAbsent(key, ConcreteFlyweight::new);
    }
}

// 占位符 - 确保示例可编译
interface Flyweight {}
class ConcreteFlyweight implements Flyweight {
    public ConcreteFlyweight(String key) {}
}
```

### 14.6.4 何时不应使用享元模式

| 条件 | 原因 |
|------|------|
| 对象数量不大（< 1000） | 管理享元的开销可能大于节省的内存 |
| 外部状态占据绝大部分 | 内部状态太少，共享的价值不大 |
| 内部状态频繁变化 | 共享的假设被打破，享元池命中率低 |
| 对象的唯一标识很重要 | 依赖于 `==` 比较的逻辑会出错 |
| 创建对象本身已经很廉价 | 工厂查找的开销可能大于直接创建 |

```java
// 反面案例：不应该使用享元模式的场景
// 每个订单都不同，内部状态（订单状态）频繁变化，不适合享元
public class OrderFlyweightBad { // 不要这样做
    private String status; // 频繁变化！不适合作为内部状态
    private List<String> items;
    // 每个订单都是独一无二的，没有必要共享
}
```

### 14.6.5 享元模式 vs 单例模式 vs 对象池

| 对比维度 | 享元模式 | 单例模式 | 对象池模式 |
|----------|----------|----------|------------|
| 实例数量 | 多个（每种类型一个） | 唯一一个 | 多个（池中有多个） |
| 状态划分 | 区分内部/外部状态 | 通常无状态 | 对象状态完整 |
| 主要目的 | 节省内存 | 保证唯一性 | 复用昂贵对象 |
| 适用对象 | 不可变的内部状态 | 全局访问点 | 可变的完整对象 |
| 典型场景 | 字符渲染、缓存 | 配置管理、日志工厂 | 连接池、线程池 |

## 14.7 优化策略

### 14.7.1 使用枚举类型作为享元

当内部状态的种类是有限的且固定的时，Java 的枚举类型天然就是享元模式的最佳载体。

```java
/**
 * 使用枚举实现享元模式
 * 优点：天然单例、线程安全、类型安全、序列化安全
 */
public enum BulletTypeEnum implements BulletBehavior {
    // 三种子弹类型 = 三个享元实例
    NORMAL("普通弹", 10) {
        @Override
        public void onHit() {
            System.out.println("  普通命中效果");
        }
    },
    ARMOR_PIERCING("穿甲弹", 25) {
        @Override
        public void onHit() {
            System.out.println("  穿甲命中效果");
        }
    },
    INCENDIARY("燃烧弹", 15) {
        @Override
        public void onHit() {
            System.out.println("  燃烧命中效果");
        }
    };

    private final String displayName;
    private final int damage;

    BulletTypeEnum(String displayName, int damage) {
        this.displayName = displayName;
        this.damage = damage;
    }

    public String getDisplayName() { return displayName; }
    public int getDamage() { return damage; }
}

interface BulletBehavior {
    void onHit();
}

// 使用枚举享元
class EnumFlyweightDemo {
    public static void main(String[] args) {
        BulletTypeEnum normal1 = BulletTypeEnum.NORMAL;
        BulletTypeEnum normal2 = BulletTypeEnum.NORMAL;

        // 天然享元：同一个实例
        System.out.println("normal1 == normal2 → " + (normal1 == normal2));

        // 每种类型只有一个实例，JVM 保证
        System.out.println("枚举值总数: " + BulletTypeEnum.values().length);

        // 可以调用枚举特有的方法
        normal1.onHit();
        System.out.println("伤害: " + normal1.getDamage());
    }
}
```

### 14.7.2 享元对象的不可变性设计

享元的内部状态应该设计为不可变的（immutable），这解决了线程安全问题，也防止了共享对象的状态被意外修改。

```java
/**
 * 不可变享元的设计模式
 */
public final class ImmutableFlyweight {  // 1. final 类，防止子类化
    // 2. 所有字段都是 private final
    private final String type;
    private final int value;
    private final List<String> attributes;  // 3. 可变对象需要防御性拷贝

    public ImmutableFlyweight(String type, int value, List<String> attributes) {
        this.type = type;
        this.value = value;
        // 4. 防御性拷贝：不直接存储传入的可变对象引用
        this.attributes = List.copyOf(attributes); // Java 10+ 不可变拷贝
    }

    // 5. 没有 setter 方法

    public String getType() { return type; }
    public int getValue() { return value; }

    // 6. 返回可变对象的防御性拷贝
    public List<String> getAttributes() {
        return new ArrayList<>(attributes);
    }

    // 7. equals 和 hashCode 基于所有字段
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ImmutableFlyweight)) return false;
        ImmutableFlyweight that = (ImmutableFlyweight) o;
        return value == that.value
                && Objects.equals(type, that.type)
                && Objects.equals(attributes, that.attributes);
    }

    @Override
    public int hashCode() {
        return Objects.hash(type, value, attributes);
    }
}
```

### 14.7.3 组合使用工厂模式和享元模式

工厂方法模式与享元模式天然互补。通过工厂方法来创建所有享元实例，可以在后期无缝切换享元策略。

```java
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 结合工厂模式和享元模式
 */
public class OptimizedFlyweightFactory {
    private static final Map<String, ImmutableFlyweight> POOL
            = new ConcurrentHashMap<>();

    /**
     * 带创建统计的工厂方法
     */
    public static ImmutableFlyweight getFlyweight(String type, int value,
                                                   List<String> attributes) {
        String key = type + ":" + value + ":" + String.join(",", attributes);

        return POOL.computeIfAbsent(key, k -> {
            System.out.println("[工厂] 创建享元: " + k);
            return new ImmutableFlyweight(type, value, attributes);
        });
    }

    /**
     * 定期清理策略：当池大小超过阈值时清理
     */
    public static void maintenance() {
        if (POOL.size() > 1000) {
            System.out.println("[工厂] 享元池大小超过 1000，执行清理...");
            // 清理策略：保留最近使用的 500 个
            List<String> keysToRemove = new ArrayList<>(POOL.keySet());
            int removeCount = keysToRemove.size() - 500;
            for (int i = 0; i < removeCount; i++) {
                POOL.remove(keysToRemove.get(i));
            }
            System.out.println("[工厂] 清理完成，当前大小: " + POOL.size());
        }
    }

    /**
     * 监控享元池
     */
    public static void printMetrics() {
        System.out.println("\n========== 享元池监控 ==========");
        System.out.println("池大小: " + POOL.size());
        // 生产环境还应统计命中率、创建速率等
        System.out.println("================================");
    }
}
```

### 14.7.4 享元模式最佳实践总结

| 决策点 | 推荐做法 |
|--------|----------|
| 选择内部状态 | 选取**不可变的、数量有限的**属性作为内部状态 |
| 选择外部状态 | 将**频繁变化的、与上下文相关的**属性作为外部状态 |
| 实现享元工厂 | 使用 `ConcurrentHashMap` + `computeIfAbsent` |
| 保证线程安全 | 享元对象本身设计为不可变，工厂使用线程安全容器 |
| 避免内存泄漏 | 使用 `WeakReference` 或 LRU 策略限制池大小 |
| 监控池效率 | 统计享元对象的命中率和池大小 |
| 组合模式 | 享元 + 组合模式适用于层级结构的共享（如 UI 控件树） |
| 枚举替代 | 当内部状态种类固定时，优先使用枚举实现享元 |

## 本章小结

本章详细介绍了享元模式（Flyweight Pattern）：

1. **核心问题**：需要创建大量相似对象，导致内存消耗过高。
2. **解决思路**：将对象状态分为内部状态（可共享）和外部状态（不可共享），通过共享内部状态减少内存占用。
3. **UML结构**：抽象享元（Flyweight）、具体享元（ConcreteFlyweight）、享元工厂（FlyweightFactory）、客户端（Client）。
4. **代码实现**：提供了字符渲染系统、游戏粒子系统、数据库连接池三个完整示例，展示了内部/外部状态分离的核心技术。
5. **JDK应用**：Integer 缓存（-128~127）、Boolean.TRUE/FALSE、String 常量池（intern）、HikariCP 连接池、Spring 单例 Bean。
6. **使用场景**：文本编辑器字形缓存、图标缓存、游戏粒子系统、线程池/连接池、格式化信息缓存。
7. **主要风险**：线程安全问题、外部状态管理复杂性、享元池内存泄漏、不恰当使用场景。
8. **优化策略**：使用不可变享元、枚举替代、WeakReference 内存管理、LRU 淘汰策略、监控命中率、组合工厂模式。

**享元模式是内存优化的利器**。它的核心思想——通过共享来减少重复——不仅适用于对象设计，也是缓存、池化等技术的基础。合理划分内部状态和外部状态是成功应用享元模式的关键。

---

结构型设计模式（7种）全部讲解完毕。在下一章中，我们将开始第 4 篇——行为型模式，首先学习责任链模式（Chain of Responsibility Pattern）。
