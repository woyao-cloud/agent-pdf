package com.jvmbook.case01;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

@SpringBootApplication
@RestController
public class OrderApplication {

    private static final Logger log = LoggerFactory.getLogger(OrderApplication.class);
    private final OrderProcessor orderProcessor;

    public OrderApplication(OrderProcessor orderProcessor) {
        this.orderProcessor = orderProcessor;
    }

    @PostMapping("/order")
    public Map<String, Object> createOrder(
            @RequestParam long userId,
            @RequestParam double amount,
            @RequestParam int items) {
        long start = System.nanoTime();
        try {
            orderProcessor.processOrder(userId, BigDecimal.valueOf(amount), items);
            long elapsed = (System.nanoTime() - start) / 1_000_000;
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("status", "ok");
            result.put("userId", userId);
            result.put("costMs", elapsed);
            return result;
        } catch (Exception e) {
            log.error("Order processing failed", e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", "error");
            error.put("message", e.getMessage());
            return error;
        }
    }

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("processedCount", orderProcessor.getProcessedCount());
        stats.put("pendingOrders", orderProcessor.getPendingOrders().size());
        return stats;
    }

    public static void main(String[] args) {
        SpringApplication.run(OrderApplication.class, args);
    }
}
