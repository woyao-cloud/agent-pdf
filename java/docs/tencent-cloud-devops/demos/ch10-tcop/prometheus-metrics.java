package com.example.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 自定义Prometheus指标示例
 */
@Component
public class BusinessMetrics {

    private final Counter orderCreatedCounter;
    private final Counter orderFailedCounter;
    private final Timer orderProcessingTimer;
    private final AtomicInteger activeUsers = new AtomicInteger(0);

    public BusinessMetrics(MeterRegistry registry) {
        // 计数器：订单创建数
        this.orderCreatedCounter = Counter.builder("demo.order.created")
                .description("累计创建订单数")
                .tag("env", "production")
                .register(registry);

        // 计数器：订单失败数
        this.orderFailedCounter = Counter.builder("demo.order.failed")
                .description("累计失败订单数")
                .tag("env", "production")
                .register(registry);

        // 直方图/计时器：订单处理耗时
        this.orderProcessingTimer = Timer.builder("demo.order.processing.time")
                .description("订单处理耗时")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(registry);

        // 仪表：当前活跃用户数
        registry.gauge("demo.active.users", activeUsers, AtomicInteger::get);
    }

    public void recordOrderCreated() {
        orderCreatedCounter.increment();
    }

    public void recordOrderFailed() {
        orderFailedCounter.increment();
    }

    public void recordOrderProcessing(long millis) {
        orderProcessingTimer.record(millis, TimeUnit.MILLISECONDS);
    }

    public void setActiveUsers(int count) {
        activeUsers.set(count);
    }
}
