package com.example.metrics.controller;

import com.example.metrics.MetricLogger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@RestController
@RequestMapping("/api/metrics")
public class OrderMetricController {

    @Autowired
    private MetricLogger metricLogger;

    private static final String[] CITIES = {"北京", "上海", "广州", "深圳", "杭州", "成都"};
    private static final String[] CATEGORIES = {"手机", "电脑", "家电", "服饰", "食品"};

    /** 模拟一笔交易 —— 记录业务指标日志 */
    @PostMapping("/order")
    public ResponseEntity<String> createOrder(@RequestBody Map<String, Object> request) {
        String city = (String) request.getOrDefault("city", CITIES[ThreadLocalRandom.current().nextInt(CITIES.length)]);
        String category = (String) request.getOrDefault("category", CATEGORIES[ThreadLocalRandom.current().nextInt(CATEGORIES.length)]);
        double amount = ((Number) request.getOrDefault("amount", ThreadLocalRandom.current().nextDouble(100, 5000))).doubleValue();

        metricLogger.recordOrderMetric(
                "create_order", amount, city, category, "WECHAT_PAY", true);

        return ResponseEntity.ok("指标已记录");
    }

    /** 批量模拟交易（用于大屏展示） */
    @PostMapping("/batch")
    public ResponseEntity<String> batchOrders(@RequestParam(defaultValue = "100") int count) {
        for (int i = 0; i < count; i++) {
            metricLogger.recordOrderMetric(
                    "create_order",
                    ThreadLocalRandom.current().nextDouble(10, 10000),
                    CITIES[ThreadLocalRandom.current().nextInt(CITIES.length)],
                    CATEGORIES[ThreadLocalRandom.current().nextInt(CATEGORIES.length)],
                    "WECHAT_PAY",
                    true);
        }
        return ResponseEntity.ok("已记录 " + count + " 条业务指标");
    }
}