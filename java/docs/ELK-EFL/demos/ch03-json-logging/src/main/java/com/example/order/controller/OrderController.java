package com.example.order.controller;

import com.example.order.service.OrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/order")
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    @Autowired
    private OrderService orderService;

    /** 创建订单 —— 演示结构化 JSON 日志 */
    @PostMapping("/create")
    public ResponseEntity<Map<String, Object>> createOrder(@RequestBody Map<String, Object> request) {
        // 模拟 TraceId
        MDC.put("traceId", UUID.randomUUID().toString().replace("-", ""));
        MDC.put("userId", String.valueOf(request.getOrDefault("userId", "unknown")));

        log.info("收到下单请求, productId={}, amount={}",
                request.get("productId"), request.get("amount"));

        try {
            Map<String, Object> result = orderService.createOrder(request);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("订单创建失败", e);
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        } finally {
            MDC.clear();
        }
    }

    /** 制造一条异常日志 —— 演示 stack_trace 输出 */
    @GetMapping("/error-demo")
    public ResponseEntity<String> errorDemo() {
        try {
            throw new RuntimeException("演示异常：这是一个模拟的生产错误");
        } catch (Exception e) {
            log.error("发生异常，详细信息如下", e);
            return ResponseEntity.ok("异常已记录，请查看日志文件中的 stack_trace 字段");
        }
    }
}