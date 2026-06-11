package com.demo.controller;

import io.micrometer.core.annotation.Timed;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.web.bind.annotation.*;
import java.time.Duration;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/order")
public class OrderController {

    private final MeterRegistry meterRegistry;
    private final Timer orderProcessingTimer;

    public OrderController(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.orderProcessingTimer = Timer.builder("order_processing_seconds")
                .description("Time taken to process an order")
                .publishPercentiles(0.5, 0.95, 0.99)
                .publishPercentileHistogram()
                .sla(Duration.ofMillis(50), Duration.ofMillis(100),
                     Duration.ofMillis(200), Duration.ofMillis(500))
                .register(meterRegistry);
    }

    @Timed(value = "order_create_seconds", description = "Time taken to create an order",
           percentiles = {0.5, 0.95, 0.99})
    @PostMapping("/create")
    public String createOrder(@RequestParam(defaultValue = "1") Long userId) {
        double amount = ThreadLocalRandom.current().nextDouble(10, 1000);
        meterRegistry.counter("order_created_total",
                "currency", "CNY",
                "amount_range", amount < 100 ? "small" : amount < 500 ? "medium" : "large"
        ).increment();
        sleep(ThreadLocalRandom.current().nextInt(30, 300));
        return "Order created for user " + userId + ", amount=" + String.format("%.2f", amount);
    }

    @PostMapping("/pay")
    public String payOrder(@RequestParam Long orderId) {
        long start = System.nanoTime();
        sleep(ThreadLocalRandom.current().nextInt(50, 1000));
        long duration = System.nanoTime() - start;
        orderProcessingTimer.record(duration, TimeUnit.NANOSECONDS);
        meterRegistry.counter("payment_processed_total").increment();
        return "Payment done for order " + orderId;
    }

    @GetMapping("/stats")
    public String stats(@RequestParam(defaultValue = "0") Long simulateError) {
        if (simulateError > 0) {
            meterRegistry.counter("order_error_total", "type", "timeout").increment();
            sleep(2000);
            return "Error simulated";
        }
        return "All good";
    }

    private void sleep(int ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}