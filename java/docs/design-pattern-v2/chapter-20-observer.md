# 第20章 观察者模式（Observer）

**观察者模式**定义对象间的一种一对多依赖关系，使得每当一个对象状态发生改变时，所有依赖于它的对象都会得到通知并被自动更新。观察者模式也称为**发布-订阅**（Publish-Subscribe）模式，是事件驱动编程的基石。

## 20.1 解决的问题与应用场景

### 20.1.1 核心问题

在软件系统中，经常存在这样一种依赖关系：一个对象的状态变化需要通知到多个其他对象，并且这些依赖对象的数量和类型可能在运行时动态变化。如果直接在状态变化的对象中硬编码通知逻辑，会导致：

- **紧耦合**：被观察者需要知道所有观察者的具体类型
- **不易扩展**：每增加一个新的观察者，都需要修改被观察者的代码
- **代码重复**：类似的"状态变化-通知"逻辑散落各处

```java
// 不使用观察者模式的问题代码
public class WeatherStation {
    private CurrentDisplay currentDisplay;
    private ForecastDisplay forecastDisplay;
    private StatisticsDisplay statisticsDisplay;
    private float temperature;

    public void setTemperature(float temperature) {
        this.temperature = temperature;
        // 每增加一个新显示屏，都要修改这里的代码 —— 违反开闭原则
        currentDisplay.update(temperature);
        forecastDisplay.update(temperature);
        statisticsDisplay.update(temperature);
    }
}
```

观察者模式通过引入抽象的主题（Subject）和观察者（Observer）接口，将两者解耦：主题只知道观察者实现了某个接口，而不关心具体是谁；观察者只需要订阅主题，而不需要知道主题的内部细节。

### 20.1.2 核心特征

| 特征 | 说明 |
|------|------|
| **一对多依赖** | 一个主题可以被多个观察者订阅 |
| **松耦合** | 主题和观察者通过抽象接口交互，彼此独立变化 |
| **动态订阅** | 观察者可以在运行时动态注册和注销 |
| **自动通知** | 主题状态变化时自动触发通知，无需手动调用 |
| **广播机制** | 支持推（Push）和拉（Pull）两种数据传递模型 |

### 20.1.3 典型应用场景

- **UI事件处理**：按钮点击、键盘输入等事件监听机制
- **消息推送系统**：WebSocket消息推送、邮件通知订阅
- **配置变更传播**：配置中心配置变更后，通知所有使用该配置的服务
- **监控告警系统**：监控指标变化后，同时触发短信、邮件、钉钉多渠道告警
- **社交媒体动态**：关注者接收被关注者的内容更新
- **缓存失效广播**：数据变更时通知所有缓存节点进行同步失效
- **股票行情推送**：股票价格变化时，所有关注的客户端实时更新

## 20.2 实现原理与UML

### 20.2.1 核心角色

观察者模式包含以下四个核心角色：

| 角色 | 职责 | 关键方法 |
|------|------|----------|
| **Subject（主题/被观察者）** | 维护观察者列表，提供注册/注销接口，状态变化时通知所有观察者 | `attach()`, `detach()`, `notify()` |
| **Observer（观察者）** | 定义更新接口，当主题通知时执行更新操作 | `update()` |
| **ConcreteSubject（具体主题）** | 存储实际状态数据，状态变化时调用父类的通知方法 | `getState()`, `setState()` |
| **ConcreteObserver（具体观察者）** | 实现更新接口，定义接收到通知后的具体行为 | `update()` |

### 20.2.2 UML类图

```
┌─────────────────────┐         ┌─────────────────────┐
│      Subject        │         │      Observer       │
│     (抽象主题)       │         │     (抽象观察者)     │
├─────────────────────┤         ├─────────────────────┤
│ - observers: List   │<>──────>│ + update()          │
│ + attach(Observer)  │         └──────────┬──────────┘
│ + detach(Observer)  │                    │
│ + notifyObservers() │         ┌──────────┴──────────┐
└─────────┬───────────┘         │                      │
          │           ┌─────────┴──────────┐  ┌───────┴──────────┐
          │           │                    │  │                  │
┌─────────┴───────────┐  ┌─────────────────┐  ┌─────────────────┐
│  ConcreteSubject   │  │ConcreteObserverA│  │ConcreteObserverB│
│   (具体主题)        │  │  (具体观察者A)   │  │  (具体观察者B)   │
├─────────────────────┤  ├─────────────────┤  ├─────────────────┤
│ - state: Object    │  │ + update()      │  │ + update()      │
│ + getState()       │  └─────────────────┘  └─────────────────┘
│ + setState()       │
└─────────────────────┘
```

### 20.2.3 Push模型 vs Pull模型

观察者模式有两种数据传递策略：

| 模型 | 数据流向 | 优点 | 缺点 |
|------|----------|------|------|
| **Push（推模型）** | 主题将所有数据推送给观察者 | 观察者无需主动获取数据 | 即使观察者不需要全部数据也会被推送 |
| **Pull（拉模型）** | 主题只通知变化，观察者根据需要从主题拉取数据 | 观察者按需获取数据，更灵活 | 观察者需要持有主题引用，耦合度略高 |

```java
// Push模型 —— 主题把数据作为参数传给观察者
public interface Observer {
    void update(float temperature, float humidity, float pressure);
}

// Pull模型 —— 观察者从主题拉取数据
public interface Observer {
    void update(Subject subject);  // 观察者通过subject.getState()按需获取
}
```

### 20.2.4 时序图

```
Client          ConcreteSubject     ConcreteObserverA    ConcreteObserverB
  │                   │                    │                    │
  │ attach(observerA) │                    │                    │
  │──────────────────>│                    │                    │
  │                   │                    │                    │
  │ attach(observerB) │                    │                    │
  │──────────────────>│                    │                    │
  │                   │                    │                    │
  │   setState()      │                    │                    │
  │──────────────────>│                    │                    │
  │                   │                    │                    │
  │                   │  notifyObservers() │                    │
  │                   │───────────────────>│                    │
  │                   │                    │                    │
  │                   │  update(t, h, p)   │                    │
  │                   │───────────────────>│                    │
  │                   │                    │  update(t, h, p)   │
  │                   │─────────────────────────────┬───────────>│
  │                   │                    │                    │
```

## 20.3 代码实现

### 20.3.1 自定义观察者模式（Push模型）

```java
// ==================== 抽象观察者接口 ====================
public interface Observer {
    void update(float temperature, float humidity, float pressure);
}

// ==================== 抽象主题接口 ====================
public interface Subject {
    void registerObserver(Observer o);
    void removeObserver(Observer o);
    void notifyObservers();
}

// ==================== 具体主题：气象站 ====================
public class WeatherStation implements Subject {
    private final List<Observer> observers = new ArrayList<>();
    private float temperature;
    private float humidity;
    private float pressure;

    @Override
    public void registerObserver(Observer o) {
        if (o != null && !observers.contains(o)) {
            observers.add(o);
        }
    }

    @Override
    public void removeObserver(Observer o) {
        observers.remove(o);
    }

    @Override
    public void notifyObservers() {
        // 使用快照遍历，避免在通知过程中被修改
        List<Observer> snapshot = new ArrayList<>(observers);
        for (Observer observer : snapshot) {
            observer.update(temperature, humidity, pressure);
        }
    }

    /**
     * 气象数据更新时自动触发通知
     */
    public void setMeasurements(float temperature, float humidity, float pressure) {
        this.temperature = temperature;
        this.humidity = humidity;
        this.pressure = pressure;
        measurementsChanged();
    }

    private void measurementsChanged() {
        notifyObservers();
    }

    public int getObserverCount() {
        return observers.size();
    }
}

// ==================== 具体观察者：当前天气显示 ====================
public class CurrentConditionsDisplay implements Observer {
    private final String displayName;

    public CurrentConditionsDisplay(String displayName) {
        this.displayName = displayName;
    }

    @Override
    public void update(float temperature, float humidity, float pressure) {
        System.out.printf("[%s] 当前天气: 温度=%.1f°C, 湿度=%.1f%%, 气压=%.1fhPa%n",
                displayName, temperature, humidity, pressure);
    }
}

// ==================== 具体观察者：天气预报显示 ====================
public class ForecastDisplay implements Observer {
    private final String displayName;
    private float lastTemperature;
    private boolean firstUpdate = true;

    public ForecastDisplay(String displayName) {
        this.displayName = displayName;
    }

    @Override
    public void update(float temperature, float humidity, float pressure) {
        if (firstUpdate) {
            System.out.printf("[%s] 天气预报: 等待更多数据...%n", displayName);
            firstUpdate = false;
        } else if (temperature > lastTemperature) {
            System.out.printf("[%s] 天气预报: 天气将变暖 (+%.1f°C)%n",
                    displayName, temperature - lastTemperature);
        } else if (temperature < lastTemperature) {
            System.out.printf("[%s] 天气预报: 天气将变冷 (%.1f°C)%n",
                    displayName, temperature - lastTemperature);
        } else {
            System.out.printf("[%s] 天气预报: 天气保持稳定%n", displayName);
        }
        lastTemperature = temperature;
    }
}

// ==================== 具体观察者：统计数据显示 ====================
public class StatisticsDisplay implements Observer {
    private final String displayName;
    private final List<Float> temperatureHistory = new ArrayList<>();

    public StatisticsDisplay(String displayName) {
        this.displayName = displayName;
    }

    @Override
    public void update(float temperature, float humidity, float pressure) {
        temperatureHistory.add(temperature);
        double avg = temperatureHistory.stream()
                .mapToDouble(Float::doubleValue).average().orElse(0.0);
        double max = temperatureHistory.stream()
                .mapToDouble(Float::doubleValue).max().orElse(0.0);
        double min = temperatureHistory.stream()
                .mapToDouble(Float::doubleValue).min().orElse(0.0);
        System.out.printf("[%s] 统计数据: 平均=%.1f°C, 最高=%.1f°C, 最低=%.1f°C%n",
                displayName, avg, max, min);
    }
}

// ==================== 客户端测试 ====================
public class WeatherStationTest {
    public static void main(String[] args) {
        WeatherStation station = new WeatherStation();

        CurrentConditionsDisplay currentDisplay =
                new CurrentConditionsDisplay("大厅显示屏");
        ForecastDisplay forecastDisplay = new ForecastDisplay("手机APP");
        StatisticsDisplay statisticsDisplay = new StatisticsDisplay("数据中心");

        // 注册观察者
        station.registerObserver(currentDisplay);
        station.registerObserver(forecastDisplay);
        station.registerObserver(statisticsDisplay);

        System.out.println("===== 第1次气象更新 =====");
        station.setMeasurements(25.5f, 65.0f, 1013.0f);

        System.out.println("\n===== 移除大厅显示屏后，第2次气象更新 =====");
        station.removeObserver(currentDisplay);
        station.setMeasurements(26.0f, 63.0f, 1012.5f);

        System.out.println("\n===== 第3次气象更新 =====");
        station.setMeasurements(24.0f, 70.0f, 1011.0f);
    }
}
```

**运行结果**：

```
===== 第1次气象更新 =====
[大厅显示屏] 当前天气: 温度=25.5°C, 湿度=65.0%, 气压=1013.0hPa
[手机APP] 天气预报: 等待更多数据...
[数据中心] 统计数据: 平均=25.5°C, 最高=25.5°C, 最低=25.5°C

===== 移除大厅显示屏后，第2次气象更新 =====
[手机APP] 天气预报: 天气将变暖 (+0.5°C)
[数据中心] 统计数据: 平均=25.8°C, 最高=26.0°C, 最低=25.5°C

===== 第3次气象更新 =====
[手机APP] 天气预报: 天气将变冷 (-2.0°C)
[数据中心] 统计数据: 平均=25.2°C, 最高=26.0°C, 最低=24.0°C
```

### 20.3.2 自定义观察者模式（Pull模型）

Pull模型中，主题只通知观察者"我变了"，观察者根据自己的需要从主题中拉取数据。

```java
// ==================== Pull模型：观察者接口 ====================
public interface PullObserver {
    /**
     * 主题通知观察者"状态变了"，观察者按需拉取数据
     * @param subject 主题引用，观察者通过它拉取需要的数据
     */
    void update(PullSubject subject);
}

// ==================== Pull模型：抽象主题 ====================
public interface PullSubject {
    void registerObserver(PullObserver o);
    void removeObserver(PullObserver o);
    void notifyObservers();
}

// ==================== Pull模型：股票行情主题 ====================
public class StockMarket implements PullSubject {
    private final List<PullObserver> observers = new ArrayList<>();
    private String stockCode;
    private BigDecimal price;
    private BigDecimal changePercent;
    private long volume;

    @Override
    public void registerObserver(PullObserver o) {
        if (!observers.contains(o)) {
            observers.add(o);
        }
    }

    @Override
    public void removeObserver(PullObserver o) {
        observers.remove(o);
    }

    @Override
    public void notifyObservers() {
        for (PullObserver observer : new ArrayList<>(observers)) {
            observer.update(this);
        }
    }

    public void updatePrice(String stockCode, BigDecimal price,
                            BigDecimal changePercent, long volume) {
        this.stockCode = stockCode;
        this.price = price;
        this.changePercent = changePercent;
        this.volume = volume;
        notifyObservers();
    }

    // Getter方法 —— 观察者通过这些方法拉取需要的数据
    public String getStockCode() { return stockCode; }
    public BigDecimal getPrice() { return price; }
    public BigDecimal getChangePercent() { return changePercent; }
    public long getVolume() { return volume; }
}

// ==================== Pull模型：K线图显示（只关心价格和涨跌幅） ====================
public class KLineDisplay implements PullObserver {
    private final String name;

    public KLineDisplay(String name) {
        this.name = name;
    }

    @Override
    public void update(PullSubject subject) {
        StockMarket market = (StockMarket) subject;
        System.out.printf("[%s K线图] %s 当前价: %s, 涨跌幅: %s%%%n",
                name, market.getStockCode(), market.getPrice(),
                market.getChangePercent());
        // K线图不关心成交量，所以不拉取
    }
}

// ==================== Pull模型：成交量显示（只关心成交量） ====================
public class VolumeDisplay implements PullObserver {
    private final String name;

    public VolumeDisplay(String name) {
        this.name = name;
    }

    @Override
    public void update(PullSubject subject) {
        StockMarket market = (StockMarket) subject;
        System.out.printf("[%s 成交量] %s 成交量: %d 手%n",
                name, market.getStockCode(), market.getVolume());
        // 成交量显示不关心价格，所以不拉取
    }
}

// ==================== Pull模型：客户端测试 ====================
public class StockMarketTest {
    public static void main(String[] args) {
        StockMarket market = new StockMarket();

        KLineDisplay klineDisplay = new KLineDisplay("交易终端A");
        VolumeDisplay volumeDisplay = new VolumeDisplay("交易终端B");

        market.registerObserver(klineDisplay);
        market.registerObserver(volumeDisplay);

        market.updatePrice("BABA", new BigDecimal("88.50"),
                new BigDecimal("2.35"), 15200000);
        market.updatePrice("BABA", new BigDecimal("89.20"),
                new BigDecimal("0.79"), 18300000);
    }
}
```

**Pull模型的优势**：KLineDisplay只拉取了价格和涨跌幅，VolumeDisplay只拉取了成交量，每个观察者只获取自己需要的数据，避免了不必要的数据传输。

### 20.3.3 订单状态通知系统完整示例

这是一个更接近真实项目的完整示例，展示观察者模式在电商订单系统中的应用。

```java
// ==================== 事件对象（不可变） ====================
public class OrderEvent {
    private final String orderId;
    private final OrderStatus status;
    private final BigDecimal amount;
    private final String buyerName;
    private final LocalDateTime timestamp;

    public enum OrderStatus {
        CREATED, PAID, SHIPPED, DELIVERED, CANCELLED
    }

    public OrderEvent(String orderId, OrderStatus status,
                      BigDecimal amount, String buyerName) {
        this.orderId = orderId;
        this.status = status;
        this.amount = amount;
        this.buyerName = buyerName;
        this.timestamp = LocalDateTime.now();
    }

    public String getOrderId() { return orderId; }
    public OrderStatus getStatus() { return status; }
    public BigDecimal getAmount() { return amount; }
    public String getBuyerName() { return buyerName; }
    public LocalDateTime getTimestamp() { return timestamp; }

    @Override
    public String toString() {
        return String.format("OrderEvent{订单:%s, 状态:%s, 金额:%.2f, 买家:%s, 时间:%s}",
                orderId, status, amount, buyerName, timestamp);
    }
}

// ==================== 观察者接口 ====================
public interface OrderObserver {
    void onOrderChanged(OrderEvent event);
}

// ==================== 订单主题 ====================
public class OrderSubject {
    private final List<OrderObserver> observers = new CopyOnWriteArrayList<>();

    public void addObserver(OrderObserver observer) {
        observers.add(observer);
    }

    public void removeObserver(OrderObserver observer) {
        observers.remove(observer);
    }

    public void notifyObservers(OrderEvent event) {
        for (OrderObserver observer : observers) {
            try {
                observer.onOrderChanged(event);
            } catch (Exception e) {
                System.err.println("通知观察者失败: " + e.getMessage());
            }
        }
    }
}

// ==================== 订单服务 ====================
public class OrderService {
    private final OrderSubject subject = new OrderSubject();

    public OrderService() {
        // 注册各类通知处理器
        subject.addObserver(new SmsNotifier());
        subject.addObserver(new EmailNotifier());
        subject.addObserver(new LogisticsNotifier());
        subject.addObserver(new PointsNotifier());
    }

    public void createOrder(String orderId, BigDecimal amount, String buyer) {
        System.out.println("\n>>> 创建订单: " + orderId);
        OrderEvent event = new OrderEvent(orderId,
                OrderEvent.OrderStatus.CREATED, amount, buyer);
        subject.notifyObservers(event);
    }

    public void payOrder(String orderId, BigDecimal amount, String buyer) {
        System.out.println("\n>>> 支付订单: " + orderId);
        OrderEvent event = new OrderEvent(orderId,
                OrderEvent.OrderStatus.PAID, amount, buyer);
        subject.notifyObservers(event);
    }

    public void cancelOrder(String orderId, BigDecimal amount, String buyer) {
        System.out.println("\n>>> 取消订单: " + orderId);
        OrderEvent event = new OrderEvent(orderId,
                OrderEvent.OrderStatus.CANCELLED, amount, buyer);
        subject.notifyObservers(event);
    }

    // 支持外部动态注册/注销观察者
    public void addCustomObserver(OrderObserver observer) {
        subject.addObserver(observer);
    }
}

// ==================== 具体观察者：短信通知 ====================
class SmsNotifier implements OrderObserver {
    @Override
    public void onOrderChanged(OrderEvent event) {
        // 不同状态发送不同短信
        switch (event.getStatus()) {
            case CREATED:
                sendSms(event.getBuyerName(),
                        "订单" + event.getOrderId() + "已创建，请尽快支付");
                break;
            case PAID:
                sendSms(event.getBuyerName(),
                        "订单" + event.getOrderId() + "已支付，我们将尽快发货");
                break;
            case CANCELLED:
                sendSms(event.getBuyerName(),
                        "订单" + event.getOrderId() + "已取消");
                break;
        }
    }

    private void sendSms(String phone, String message) {
        System.out.println("  [短信通知] 发送至 " + phone + ": " + message);
    }
}

// ==================== 具体观察者：邮件通知 ====================
class EmailNotifier implements OrderObserver {
    @Override
    public void onOrderChanged(OrderEvent event) {
        System.out.println("  [邮件通知] 发送订单状态变更邮件: " +
                event.getOrderId() + " -> " + event.getStatus());
    }
}

// ==================== 具体观察者：物流系统 ====================
class LogisticsNotifier implements OrderObserver {
    @Override
    public void onOrderChanged(OrderEvent event) {
        if (event.getStatus() == OrderEvent.OrderStatus.PAID) {
            System.out.println("  [物流系统] 订单" + event.getOrderId() +
                    "已支付，生成拣货任务");
        } else if (event.getStatus() == OrderEvent.OrderStatus.CANCELLED) {
            System.out.println("  [物流系统] 订单" + event.getOrderId() +
                    "已取消，释放锁定库存");
        }
    }
}

// ==================== 具体观察者：积分系统 ====================
class PointsNotifier implements OrderObserver {
    @Override
    public void onOrderChanged(OrderEvent event) {
        if (event.getStatus() == OrderEvent.OrderStatus.PAID) {
            int points = event.getAmount().intValue() / 10;
            System.out.println("  [积分系统] 用户" + event.getBuyerName() +
                    "获得" + points + "积分（消费" + event.getAmount() + "元）");
        }
    }
}

// ==================== 客户端测试 ====================
public class OrderSystemTest {
    public static void main(String[] args) {
        OrderService orderService = new OrderService();

        // 创建订单 -> 触发短信、邮件通知
        orderService.createOrder("ORD-20240001",
                new BigDecimal("299.00"), "张三");

        // 支付订单 -> 触发短信、邮件、物流、积分通知
        orderService.payOrder("ORD-20240001",
                new BigDecimal("299.00"), "张三");

        // 取消订单 -> 触发短信、邮件、物流通知
        orderService.cancelOrder("ORD-20240002",
                new BigDecimal("159.00"), "李四");
    }
}
```

## 20.4 JDK/框架源码解析

### 20.4.1 java.util.Observer / Observable（已废弃）

JDK 1.0就内置了观察者模式的实现，但从Java 9开始被标记为`@Deprecated`（因设计缺陷：Observable是类而非接口，限制了复用）。

```java
import java.util.Observable;
import java.util.Observer;

// Observable是类（而非接口） —— 这是设计上的主要缺陷
public class StockObservable extends Observable {
    private String stockCode;
    private double price;

    public void setPrice(String stockCode, double price) {
        this.stockCode = stockCode;
        this.price = price;
        setChanged();       // 标记状态已变化
        notifyObservers(price);  // 通知所有观察者（Push模型传递数据）
    }

    public String getStockCode() { return stockCode; }
}

public class StockDisplay implements Observer {
    private String name;

    public StockDisplay(String name) {
        this.name = name;
    }

    @Override
    public void update(Observable o, Object arg) {
        StockObservable stock = (StockObservable) o;
        System.out.printf("[%s] %s 最新价: %.2f%n",
                name, stock.getStockCode(), (Double) arg);
    }
}
```

**废弃原因**：
1. `Observable`是一个类，在Java单继承机制下限制了灵活性
2. `setChanged()`方法为protected，组合模式无法使用
3. 没有线程安全保障
4. 没有提供弱引用等内存管理机制

### 20.4.2 java.beans.PropertyChangeListener

`PropertyChangeSupport`是JavaBeans规范中观察者模式的优秀实现，广泛应用于GUI和配置管理中。

```java
import java.beans.PropertyChangeListener;
import java.beans.PropertyChangeSupport;

// ==================== 可观察的配置对象 ====================
public class AppConfig {
    private final PropertyChangeSupport support = new PropertyChangeSupport(this);
    private String appName;
    private int maxConnections;
    private String databaseUrl;

    public void addPropertyChangeListener(PropertyChangeListener listener) {
        support.addPropertyChangeListener(listener);
    }

    public void removePropertyChangeListener(PropertyChangeListener listener) {
        support.removePropertyChangeListener(listener);
    }

    // 支持按属性名注册监听器 —— 只在特定属性变化时通知
    public void addPropertyChangeListener(String propertyName,
                                          PropertyChangeListener listener) {
        support.addPropertyChangeListener(propertyName, listener);
    }

    public void setAppName(String newValue) {
        String oldValue = this.appName;
        this.appName = newValue;
        support.firePropertyChange("appName", oldValue, newValue);
    }

    public void setMaxConnections(int newValue) {
        int oldValue = this.maxConnections;
        this.maxConnections = newValue;
        support.firePropertyChange("maxConnections", oldValue, newValue);
    }

    public void setDatabaseUrl(String newValue) {
        String oldValue = this.databaseUrl;
        this.databaseUrl = newValue;
        support.firePropertyChange("databaseUrl", oldValue, newValue);
    }

    public String getAppName() { return appName; }
    public int getMaxConnections() { return maxConnections; }
    public String getDatabaseUrl() { return databaseUrl; }
}

// ==================== 监听器实现 ====================
public class ConfigChangeListener implements PropertyChangeListener {
    private final String listenerName;

    public ConfigChangeListener(String listenerName) {
        this.listenerName = listenerName;
    }

    @Override
    public void propertyChange(java.beans.PropertyChangeEvent evt) {
        System.out.printf("[%s] 配置变更: %s -> 旧值=%s, 新值=%s%n",
                listenerName, evt.getPropertyName(),
                evt.getOldValue(), evt.getNewValue());
    }
}

// ==================== 测试 ====================
public class PropertyChangeTest {
    public static void main(String[] args) {
        AppConfig config = new AppConfig();

        // 全局监听器 —— 任何属性变化都会通知
        ConfigChangeListener globalListener =
                new ConfigChangeListener("全局监听器");
        config.addPropertyChangeListener(globalListener);

        // 精确监听器 —— 只监听appName变化
        ConfigChangeListener appNameListener =
                new ConfigChangeListener("应用名称监听器");
        config.addPropertyChangeListener("appName", appNameListener);

        config.setAppName("MyApp v2.0");         // 两个监听器都会收到通知
        config.setMaxConnections(100);            // 只有全局监听器收到通知
        config.setDatabaseUrl("jdbc:mysql://..."); // 只有全局监听器收到通知
    }
}
```

**PropertyChangeSupport优势**：
- 支持按属性名精确监听，避免不必要的通知
- 新旧值同时传递，方便对比和回滚
- 线程安全：内部使用`synchronized`保护监听器列表
- 实现了`Serializable`，支持序列化

### 20.4.3 java.util.EventListener与事件委托模型

Java事件委托模型是观察者模式在AWT/Swing GUI框架中的典型应用。该模型由三部分组成：

```java
import java.util.EventListener;
import java.util.EventObject;

// ==================== 自定义事件对象 ====================
public class TransferEvent extends EventObject {
    private final String fromAccount;
    private final String toAccount;
    private final BigDecimal amount;
    private final boolean success;

    public TransferEvent(Object source, String fromAccount,
                         String toAccount, BigDecimal amount, boolean success) {
        super(source);
        this.fromAccount = fromAccount;
        this.toAccount = toAccount;
        this.amount = amount;
        this.success = success;
    }

    public String getFromAccount() { return fromAccount; }
    public String getToAccount() { return toAccount; }
    public BigDecimal getAmount() { return amount; }
    public boolean isSuccess() { return success; }
}

// ==================== 自定义事件监听器 ====================
public interface TransferListener extends EventListener {
    void onTransferSuccess(TransferEvent event);
    void onTransferFailed(TransferEvent event);
}

// ==================== 事件源 ====================
public class TransferService {
    private final List<TransferListener> listeners = new CopyOnWriteArrayList<>();

    public void addTransferListener(TransferListener listener) {
        listeners.add(listener);
    }

    public void removeTransferListener(TransferListener listener) {
        listeners.remove(listener);
    }

    public void transfer(String from, String to, BigDecimal amount) {
        boolean success = Math.random() > 0.2; // 模拟80%成功率
        TransferEvent event = new TransferEvent(
                this, from, to, amount, success);

        for (TransferListener listener : listeners) {
            if (success) {
                listener.onTransferSuccess(event);
            } else {
                listener.onTransferFailed(event);
            }
        }
    }
}

// ==================== 具体监听器 ====================
public class AuditListener implements TransferListener {
    @Override
    public void onTransferSuccess(TransferEvent event) {
        System.out.printf("[审计] 转账成功: %s -> %s, 金额: %s%n",
                event.getFromAccount(), event.getToAccount(), event.getAmount());
    }

    @Override
    public void onTransferFailed(TransferEvent event) {
        System.out.printf("[审计] 转账失败: %s -> %s, 金额: %s%n",
                event.getFromAccount(), event.getToAccount(), event.getAmount());
    }
}
```

**事件委托模型对比传统观察者模式**：
- 事件对象携带更多上下文信息，而非简单的数据字段
- 通过`EventListener`标记接口实现类型安全
- 支持多方法监听器（如`TransferListener`有成功和失败两个回调）
- 广泛用于Java GUI（`ActionListener`, `MouseListener`, `KeyListener`等）

### 20.4.4 Spring ApplicationEvent

Spring的事件机制是观察者模式在服务端框架中的经典实践。

```java
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;

// ==================== 自定义事件 ====================
public class UserRegisteredEvent extends ApplicationEvent {
    private final Long userId;
    private final String username;
    private final String email;

    public UserRegisteredEvent(Object source, Long userId,
                               String username, String email) {
        super(source);
        this.userId = userId;
        this.username = username;
        this.email = email;
    }

    public Long getUserId() { return userId; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
}

// ==================== 方式1：实现ApplicationListener接口 ====================
@Component
public class WelcomeEmailListener
        implements ApplicationListener<UserRegisteredEvent> {

    @Override
    public void onApplicationEvent(UserRegisteredEvent event) {
        System.out.println("发送欢迎邮件至: " + event.getEmail());
    }
}

// ==================== 方式2：使用@EventListener注解（推荐） ====================
@Component
public class UserEventHandlers {

    @EventListener
    public void handleRegistration(UserRegisteredEvent event) {
        System.out.println("处理用户注册: " + event.getUsername());
        // 创建用户初始数据、赠送优惠券等
    }

    @EventListener
    @Async  // 异步处理，不阻塞主线程
    public void sendSmsNotification(UserRegisteredEvent event) {
        System.out.println("异步发送短信通知: " + event.getUsername());
    }

    // 按条件监听
    @EventListener(condition = "#event.email.endsWith('@vip.com')")
    public void handleVipRegistration(UserRegisteredEvent event) {
        System.out.println("VIP用户注册: " + event.getUsername());
    }
}

// ==================== 事件发布 ====================
@Service
public class UserService {

    @Autowired
    private ApplicationEventPublisher publisher;

    public void register(String username, String email) {
        // 保存用户到数据库...
        System.out.println("用户注册成功: " + username);

        // 发布事件
        publisher.publishEvent(new UserRegisteredEvent(
                this, 1001L, username, email));
    }
}
```

**Spring事件机制特点**：
- `ApplicationEventPublisher`作为事件发布的标准接口
- `@EventListener`注解支持声明式事件处理
- 支持`@Async`异步事件处理
- 支持条件过滤（`condition`属性）
- 支持事件排序（`@Order`）
- 内置事务事件（`@TransactionalEventListener`）

### 20.4.5 Google Guava EventBus

Guava EventBus提供了更灵活的发布-订阅实现。

```java
import com.google.common.eventbus.EventBus;
import com.google.common.eventbus.Subscribe;
import com.google.common.eventbus.AllowConcurrentEvents;

// ==================== 事件定义 ====================
public class LogoutEvent {
    private final String username;
    private final LocalDateTime time;

    public LogoutEvent(String username) {
        this.username = username;
        this.time = LocalDateTime.now();
    }

    public String getUsername() { return username; }
    public LocalDateTime getTime() { return time; }
}

// ==================== 订阅者 ====================
public class AuditSubscriber {

    @Subscribe
    public void recordLogout(LogoutEvent event) {
        System.out.printf("审计: %s 于 %s 登出系统%n",
                event.getUsername(), event.getTime());
    }

    @Subscribe
    @AllowConcurrentEvents  // 允许并发执行此方法
    public void updateOnlineStatus(LogoutEvent event) {
        System.out.println("更新在线状态: " + event.getUsername() + " -> 离线");
    }
}

// ==================== 使用 ====================
public class EventBusTest {
    public static void main(String[] args) {
        EventBus eventBus = new EventBus("user-event-bus");
        eventBus.register(new AuditSubscriber());

        eventBus.post(new LogoutEvent("张三"));
        eventBus.post(new LogoutEvent("李四"));
    }
}
```

**EventBus特点**：
- 不需要实现特定接口，只要方法上有`@Subscribe`注解即可
- 支持对父类事件的监听（类型层级匹配）
- 支持`@AllowConcurrentEvents`并发控制
- `AsyncEventBus`支持异步事件分发
- 自动根据事件类型匹配订阅者方法

### 20.4.6 RxJava Observable（响应式扩展）

RxJava将观察者模式进行了现代化扩展，形成了响应式编程范式。

```java
import io.reactivex.rxjava3.core.Observable;
import io.reactivex.rxjava3.core.Observer;
import io.reactivex.rxjava3.disposables.Disposable;

// 创建Observable
Observable<String> observable = Observable.create(emitter -> {
    emitter.onNext("事件1");
    emitter.onNext("事件2");
    emitter.onNext("事件3");
    emitter.onComplete();  // 流结束
});

// 创建Observer
Observer<String> observer = new Observer<String>() {
    @Override public void onSubscribe(Disposable d) {
        System.out.println("已订阅");
    }
    @Override public void onNext(String s) {
        System.out.println("收到: " + s);
    }
    @Override public void onError(Throwable e) {
        System.out.println("错误: " + e.getMessage());
    }
    @Override public void onComplete() {
        System.out.println("完成");
    }
};

observable.subscribe(observer);
```

**RxJava对比经典观察者模式**：
- 支持流式操作符（`map`, `filter`, `flatMap`等）
- 内置线程调度（`subscribeOn`, `observeOn`）
- 支持背压（Backpressure）策略
- 有明确的完成和错误通知机制
- 支持取消订阅（`Disposable`）

## 20.5 使用场景与案例

### 20.5.1 UI事件处理

Java Swing/JavaFX的整个事件体系都建立在观察者模式之上：

```java
import javax.swing.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

public class ButtonObserverExample {
    public static void main(String[] args) {
        JFrame frame = new JFrame("观察者模式示例");
        JButton button = new JButton("点击我");
        JLabel label = new JLabel("等待点击...");

        // ActionListener 就是 Observer
        button.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                label.setText("按钮被点击了！时间: " +
                        System.currentTimeMillis());
            }
        });

        // 可以添加多个监听器
        button.addActionListener(e ->
                System.out.println("第二个监听器收到事件"));

        JPanel panel = new JPanel();
        panel.add(button);
        panel.add(label);
        frame.add(panel);
        frame.setSize(300, 200);
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setVisible(true);
    }
}
```

### 20.5.2 配置变更传播

在分布式系统中，配置中心的配置变更需要传播到所有订阅了该配置的服务实例。

```java
// ==================== 配置中心（主题） ====================
public class ConfigCenter {
    private final Map<String, List<ConfigChangeListener>> topicListeners =
            new ConcurrentHashMap<>();

    public void subscribe(String configKey, ConfigChangeListener listener) {
        topicListeners.computeIfAbsent(configKey, k ->
                new CopyOnWriteArrayList<>()).add(listener);
    }

    public void unsubscribe(String configKey, ConfigChangeListener listener) {
        List<ConfigChangeListener> listeners = topicListeners.get(configKey);
        if (listeners != null) {
            listeners.remove(listener);
        }
    }

    public void updateConfig(String key, String newValue) {
        System.out.println("[配置中心] " + key + " = " + newValue);
        List<ConfigChangeListener> listeners = topicListeners.get(key);
        if (listeners != null) {
            ConfigChangeEvent event = new ConfigChangeEvent(key, newValue);
            for (ConfigChangeListener listener : listeners) {
                listener.onConfigChanged(event);
            }
        }
    }
}

// ==================== 各服务作为观察者 ====================
public class DatabaseService implements ConfigChangeListener {
    @Override
    public void onConfigChanged(ConfigChangeEvent event) {
        System.out.println("  [数据库服务] 重新加载连接池配置: "
                + event.getKey());
    }
}

public class CacheService implements ConfigChangeListener {
    @Override
    public void onConfigChanged(ConfigChangeEvent event) {
        System.out.println("  [缓存服务] 更新过期时间配置: "
                + event.getKey());
    }
}
```

### 20.5.3 监控告警系统

```java
// ==================== 告警事件 ====================
public class AlertEvent {
    private final AlertLevel level;
    private final String metric;
    private final double value;
    private final double threshold;

    public enum AlertLevel { INFO, WARNING, CRITICAL }

    public AlertEvent(AlertLevel level, String metric,
                      double value, double threshold) {
        this.level = level;
        this.metric = metric;
        this.value = value;
        this.threshold = threshold;
    }

    public AlertLevel getLevel() { return level; }
    public String getMetric() { return metric; }
    public double getValue() { return value; }
    public double getThreshold() { return threshold; }
}

// ==================== 多种告警通道 ====================
public class DingTalkAlerter implements AlertObserver {
    @Override
    public void onAlert(AlertEvent event) {
        System.out.printf("[钉钉] %s告警: %s=%.2f (阈值:%.2f)%n",
                event.getLevel(), event.getMetric(),
                event.getValue(), event.getThreshold());
    }
}

public class SmsAlerter implements AlertObserver {
    @Override
    public void onAlert(AlertEvent event) {
        if (event.getLevel() == AlertEvent.AlertLevel.CRITICAL) {
            System.out.printf("[短信] 严重告警: %s异常!%n",
                    event.getMetric());
        }
    }
}

public class EmailAlerter implements AlertObserver {
    @Override
    public void onAlert(AlertEvent event) {
        System.out.printf("[邮件] 告警报告已发送%n");
    }
}
```

### 20.5.4 缓存失效广播

```java
public class CacheManager implements CacheChangeObserver {
    private final Map<String, Object> localCache = new ConcurrentHashMap<>();

    @Override
    public void onCacheChanged(CacheChangeEvent event) {
        if (event.getType() == CacheChangeEvent.ChangeType.INVALIDATE) {
            localCache.remove(event.getKey());
            System.out.println("本地缓存已失效: " + event.getKey());
        } else if (event.getType() == CacheChangeEvent.ChangeType.UPDATE) {
            localCache.put(event.getKey(), event.getValue());
            System.out.println("本地缓存已更新: " + event.getKey());
        }
    }
}
```

## 20.6 潜在风险与问题

### 20.6.1 内存泄漏

这是观察者模式最常见的问题。如果观察者忘记从主题中注销，主题将一直持有观察者的引用，导致观察者无法被GC回收。

```java
// ==================== 内存泄漏示例 ====================
public class MemoryLeakExample {
    public static void main(String[] args) {
        WeatherStation station = new WeatherStation();

        for (int i = 0; i < 1000; i++) {
            // 每次循环创建新的观察者并注册
            CurrentConditionsDisplay display =
                    new CurrentConditionsDisplay("Display-" + i);
            station.registerObserver(display);
            // 问题：display离开作用域后没有被注销，station仍持有引用
            // 导致display无法被GC回收 —— 内存泄漏！
        }
        System.out.println("已注册 " + station.getObserverCount()
                + " 个观察者（可能有很多已不可达）");
    }
}
```

**解决方案**：
- 确保在不需要时调用`removeObserver()`注销
- 使用`WeakReference`持有观察者引用
- 在框架层面统一管理生命周期（如Spring容器自动管理）

### 20.6.2 级联更新

观察者的更新操作可能触发主题的再次变化，形成循环依赖，导致无限循环或栈溢出。

```java
// ==================== 级联更新问题 ====================
public class CascadingUpdateExample {
    // 观察者收到通知后修改了主题状态
    // -> 主题再次通知所有观察者
    // -> 观察者再次修改主题状态
    // -> 无限循环！
}
```

**解决方案**：
- 使用标志位防止重入通知
- 严格限制观察者不要在`update()`中修改主题状态
- 将状态变更和通知分离到不同的执行周期

### 20.6.3 通知顺序依赖

观察者之间存在隐含的执行顺序依赖时，如果通知顺序改变，可能导致错误。

```java
// 观察者A必须先于观察者B执行，但通知顺序是不可靠的
public void notifyObservers() {
    for (Observer observer : observers) {
        observer.update(temperature);  // 顺序取决于注册顺序，不透明
    }
}
```

**解决方案**：
- 使用`LinkedHashSet`维护确定性的迭代顺序
- 为观察者添加优先级机制
- 文档化顺序依赖，或重构消除依赖

### 20.6.4 大量观察者的性能问题

当观察者数量很大时，同步通知会显著影响性能。

```java
// 同步通知10000个观察者，每个耗时1ms = 10秒阻塞
public void notifyObservers() {
    for (Observer observer : observers) {  // observers size = 10000
        observer.update(data);  // 每个1ms
    }
}
```

### 20.6.5 线程安全问题

在多线程环境下，观察者列表的并发修改可能导致`ConcurrentModificationException`。

```java
// 问题代码：遍历过程中列表被修改
public void notifyObservers() {
    for (Observer observer : observers) {
        observer.update(data);  // 如果update中尝试removeObserver，会抛出异常
    }
}
```

## 20.7 优化策略

### 20.7.1 使用WeakReference防止内存泄漏

```java
public class WeakReferenceSubject {
    private final List<WeakReference<Observer>> observers = new ArrayList<>();

    public void registerObserver(Observer o) {
        observers.add(new WeakReference<>(o));
    }

    public void notifyObservers(Message msg) {
        Iterator<WeakReference<Observer>> iterator = observers.iterator();
        while (iterator.hasNext()) {
            WeakReference<Observer> ref = iterator.next();
            Observer observer = ref.get();
            if (observer == null) {
                iterator.remove();  // 清理已被GC回收的观察者
            } else {
                observer.update(msg);
            }
        }
    }
}
```

### 20.7.2 使用CopyOnWriteArrayList保证并发安全

```java
import java.util.concurrent.CopyOnWriteArrayList;

public class ThreadSafeSubject {
    // CopyOnWriteArrayList在写时复制，读操作不需要加锁
    private final List<Observer> observers = new CopyOnWriteArrayList<>();

    public void registerObserver(Observer o) {
        observers.add(o);
    }

    public void removeObserver(Observer o) {
        observers.remove(o);
    }

    public void notifyObservers(Object data) {
        // CopyOnWriteArrayList的迭代器是快照，不会抛ConcurrentModificationException
        for (Observer observer : observers) {
            observer.update(data);
        }
    }
}
```

### 20.7.3 异步通知（ExecutorService）

```java
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AsyncNotificationSubject {
    private final List<Observer> observers = new CopyOnWriteArrayList<>();
    private final ExecutorService executor =
            Executors.newFixedThreadPool(4);

    public void notifyObserversAsync(Object data) {
        for (Observer observer : observers) {
            executor.submit(() -> {
                try {
                    observer.update(data);
                } catch (Exception e) {
                    System.err.println("异步通知失败: " + e.getMessage());
                }
            });
        }
    }

    public void shutdown() {
        executor.shutdown();
    }
}
```

### 20.7.4 限流与批处理

```java
public class RateLimitedSubject {
    private final List<Observer> observers = new CopyOnWriteArrayList<>();
    private final List<Object> pendingEvents = new ArrayList<>();
    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor();
    private volatile boolean dirty = false;

    public RateLimitedSubject() {
        // 每秒批量发送一次
        scheduler.scheduleAtFixedRate(this::flush, 1, 1, TimeUnit.SECONDS);
    }

    public void publish(Object event) {
        synchronized (pendingEvents) {
            pendingEvents.add(event);
            dirty = true;
        }
    }

    private void flush() {
        if (!dirty) return;
        List<Object> batch;
        synchronized (pendingEvents) {
            batch = new ArrayList<>(pendingEvents);
            pendingEvents.clear();
            dirty = false;
        }
        // 批量通知 —— 将多次变化合并为一次通知
        for (Observer observer : observers) {
            observer.update(batch);
        }
    }
}
```

### 20.7.5 不可变事件对象

事件对象应该设计为不可变（Immutable），避免观察者在回调中修改事件数据影响其他观察者。

```java
// 不可变事件对象
public final class ImmutableEvent {
    private final String type;
    private final Object data;
    private final long timestamp;

    public ImmutableEvent(String type, Object data) {
        this.type = type;
        this.data = data;
        this.timestamp = System.currentTimeMillis();
    }

    public String getType() { return type; }
    public Object getData() { return data; }
    public long getTimestamp() { return timestamp; }
}
```

### 20.7.6 事件总线 vs 直接观察者

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **直接观察者模式** | 主题和观察者关系明确，数量可控 | 类型安全，编译时检查 | 观察者需持有主题引用 |
| **EventBus** | 多个发布者和订阅者，需要完全解耦 | 完全解耦，灵活 | 类型安全性降低，难调试 |
| **Spring Event** | Spring托管Bean间的事件通信 | 容器管理生命周期，无需关心注册/注销 | 依赖Spring容器 |
| **RxJava** | 复杂的数据流处理 | 丰富的操作符，支持背压 | 学习曲线陡峭 |
| **消息队列** | 分布式系统的跨进程通信 | 持久化、可靠性保障 | 运维成本高，延迟增加 |

## 本章小结

观察者模式是行为型设计模式中使用频率最高的模式之一。本章从以下七个维度系统讲解了观察者模式：

1. **核心问题**：解决对象间一对多依赖关系的自动通知问题，实现松耦合的发布-订阅机制

2. **实现原理**：通过Subject维护Observer列表，状态变化时调用每个Observer的update方法。支持Push和Pull两种数据传递模型

3. **代码实现**：提供了Push模型（气象站）、Pull模型（股票行情）、订单通知系统三个完整的企业级示例

4. **JDK/框架源码**：
   - `java.util.Observer/Observable`（已废弃）：最早的JDK内置实现
   - `PropertyChangeSupport`：JavaBeans事件通知机制
   - `EventListener`：GUI事件委托模型
   - `Spring ApplicationEvent`：Spring容器的事件发布机制
   - `Guava EventBus`：轻量级发布-订阅框架
   - `RxJava`：响应式编程中的观察者模式

5. **应用场景**：UI事件处理、配置变更传播、监控告警、缓存失效广播等

6. **风险问题**：内存泄漏、级联更新、通知顺序依赖、性能瓶颈、线程安全

7. **优化策略**：WeakReference、CopyOnWriteArrayList、异步通知、限流批处理、不可变事件对象

**核心启示**：观察者模式最根本的价值在于"解耦"——让主题和观察者各自独立变化的同时，保持通信通道畅通。在实际项目中，建议优先使用成熟的框架实现（Spring Event、EventBus）而非从零实现，除非有特殊定制需求。
