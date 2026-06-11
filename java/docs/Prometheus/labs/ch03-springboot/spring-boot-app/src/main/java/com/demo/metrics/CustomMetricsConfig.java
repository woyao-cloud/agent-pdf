package com.demo.metrics;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;
import java.lang.management.ManagementFactory;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class CustomMetricsConfig {

    private final MeterRegistry meterRegistry;
    private final AtomicInteger activeUsers = new AtomicInteger(0);
    private final AtomicInteger pendingOrders = new AtomicInteger(0);

    public CustomMetricsConfig(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @PostConstruct
    public void init() {
        Gauge.builder("app_active_users", activeUsers, AtomicInteger::get)
                .description("Currently active users")
                .register(meterRegistry);
        Gauge.builder("app_pending_orders", pendingOrders, AtomicInteger::get)
                .description("Pending orders count")
                .register(meterRegistry);
        Gauge.builder("app_startup_time_seconds",
                ManagementFactory.getRuntimeMXBean(),
                bean -> bean.getUptime() / 1000.0)
                .description("Application uptime in seconds")
                .register(meterRegistry);
        activeUsers.set(42);
        pendingOrders.set(7);
    }

    public void incrementActiveUsers() { activeUsers.incrementAndGet(); }
    public void decrementActiveUsers() { activeUsers.decrementAndGet(); }
    public void setPendingOrders(int count) { pendingOrders.set(count); }
}