# 第22章 策略模式（Strategy）

**策略模式**定义一系列算法，把它们一个个封装起来，并使它们可以相互替换。

## 22.1 解决的问题与应用场景

### 22.1.1 问题分析

如果不同算法需要根据条件切换：

```java
if (type.equals("A")) {
    new AlgorithmA().execute();
} else if (type.equals("B")) {
    new AlgorithmB().execute();
}
// 问题：新增算法需要修改代码
```

### 22.1.2 典型应用场景

**1. 支付方式**

```java
PaymentStrategy strategy = getStrategy(type);
strategy.pay(amount);
```

**2. 排序算法**

```java
Sorter sorter = new QuickSorter();  // 可替换为MergeSorter
```

**3. 验证策略**

```java
Validator validator = new EmailValidator();  // 可替换为PhoneValidator
```

## 22.2 实现原理与UML

```
┌─────────────┐       ┌─────────────────┐
│   Context   │       │    Strategy    │
│   (上下文)   │       │   (抽象策略)    │
├─────────────┤       ├─────────────────┤
│ - strategy  │──────►│ + execute()    │
│ + execute() │       └────────┬────────┘
│             │                │
└─────────────┘                │       ┌───────┴───────┐
                               │       │               │
                               ▼       ▼
                    ┌─────────────────┐   ┌─────────────────┐
                    │ConcreteStrA     │   │ConcreteStrB    │
                    │  (策略A)         │   │  (策略B)       │
                    ├─────────────────┤   ├─────────────────┤
                    │ + execute()     │   │ + execute()    │
                    └─────────────────┘   └─────────────────┘
```

## 22.3 代码实现

### 22.3.1 支付示例

```java
// 策略接口
public interface PaymentStrategy {
    void pay(double amount);
}

// 具体策略 - 支付宝
public class AlipayStrategy implements PaymentStrategy {
    @Override
    public void pay(double amount) {
        System.out.println("支付宝支付: " + amount + "元");
    }
}

// 具体策略 - 微信支付
public class WechatPayStrategy implements PaymentStrategy {
    @Override
    public void pay(double amount) {
        System.out.println("微信支付: " + amount + "元");
    }
}

// 上下文
public class PaymentContext {
    private PaymentStrategy strategy;

    public PaymentContext(PaymentStrategy strategy) {
        this.strategy = strategy;
    }

    public void pay(double amount) {
        strategy.pay(amount);
    }
}

// 使用
public class Main {
    public static void main(String[] args) {
        PaymentContext ctx = new PaymentContext(new AlipayStrategy());
        ctx.pay(100);

        ctx = new PaymentContext(new WechatPayStrategy());
        ctx.pay(200);
    }
}
```

## 22.4 JDK源码解析

### 22.4.1 Comparator

```java
// 策略模式典型应用
Collections.sort(list, (a, b) -> a.compareTo(b));
// 不同的Comparator实现不同的排序策略
```

## 22.5 本章小结

策略模式将算法封装为独立类，通过上下文切换算法，使算法可相互替换，符合开闭原则。