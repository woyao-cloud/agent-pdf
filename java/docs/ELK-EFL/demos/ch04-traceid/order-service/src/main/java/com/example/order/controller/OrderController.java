package com.example.order.controller;

import com.example.order.client.PaymentClient;
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
    private PaymentClient paymentClient;

    @PostMapping("/create")
    public ResponseEntity<Map<String, Object>> createOrder(@RequestBody Map<String, Object> request) {
        MDC.put("traceId", UUID.randomUUID().toString().replace("-", ""));

        log.info("订单服务: 收到下单请求, userId={}, amount={}",
                request.get("userId"), request.get("amount"));

        // 调用支付服务 —— TraceId 通过 Feign 拦截器透传
        log.info("订单服务: 调用支付服务");
        String paymentResult = paymentClient.pay(Map.of(
                "orderId", "ORD-" + UUID.randomUUID().toString().substring(0, 8),
                "amount", request.get("amount")
        ));

        log.info("订单服务: 支付结果 = {}", paymentResult);
        return ResponseEntity.ok(Map.of("status", "SUCCESS", "payment", paymentResult, "traceId", MDC.get("traceId")));
    }

    @GetMapping("/trace")
    public ResponseEntity<Map<String, String>> getTrace() {
        return ResponseEntity.ok(Map.of("traceId", MDC.get("traceId")));
    }
}