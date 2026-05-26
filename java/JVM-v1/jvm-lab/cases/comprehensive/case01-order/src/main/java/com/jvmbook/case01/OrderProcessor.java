package com.jvmbook.case01;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.concurrent.ConcurrentLinkedDeque;

@Component
public class OrderProcessor {

    private static final Logger log = LoggerFactory.getLogger(OrderProcessor.class);
    private static final int PURGE_THRESHOLD = 100_000;
    private static final int PURGE_RATIO = 3;

    private final ConcurrentLinkedDeque<Order> orders = new ConcurrentLinkedDeque<>();

    public void processOrder(long userId, BigDecimal amount, int itemCount) {
        Order order = Order.create(userId, amount, itemCount);
        orders.addLast(order);
        simulateCpuWork(500);
        if (orders.size() > PURGE_THRESHOLD) {
            purgeOldOrders();
        }
    }

    private void purgeOldOrders() {
        int targetSize = orders.size() / PURGE_RATIO;
        while (orders.size() > targetSize) {
            Order removed = orders.pollFirst();
            if (removed == null) {
                break;
            }
        }
        log.info("Purged orders, current size: {}", orders.size());
    }

    private void simulateCpuWork(int iterations) {
        double acc = 0.0;
        for (int i = 0; i < iterations; i++) {
            acc += Math.sin(i * 0.1) * Math.cos(i * 0.05);
        }
        if (acc == Double.MAX_VALUE) {
            log.warn("Unlikely branch to prevent JIT elimination");
        }
    }

    public int getProcessedCount() {
        return orders.size();
    }

    public ConcurrentLinkedDeque<Order> getPendingOrders() {
        return orders;
    }
}
