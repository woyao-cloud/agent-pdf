package com.demo.controller;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.web.bind.annotation.*;
import java.util.concurrent.ThreadLocalRandom;

@RestController
@RequestMapping("/api/user")
public class UserController {

    private final MeterRegistry meterRegistry;

    public UserController(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @GetMapping("/{userId}/profile")
    public String getProfile(@PathVariable Long userId) {
        sleep(ThreadLocalRandom.current().nextInt(10, 200));
        meterRegistry.counter("user_profile_requests",
                "userId", String.valueOf(userId % 100),
                "range", userId < 1000 ? "small" : "large"
        ).increment();
        return "Profile for user " + userId;
    }

    @GetMapping("/{userId}/order/{orderId}")
    public String getOrder(@PathVariable Long userId, @PathVariable Long orderId) {
        sleep(ThreadLocalRandom.current().nextInt(20, 500));
        return "Order " + orderId + " for user " + userId;
    }

    private void sleep(int ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}