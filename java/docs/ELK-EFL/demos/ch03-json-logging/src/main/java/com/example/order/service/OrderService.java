package com.example.order.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public Map<String, Object> createOrder(Map<String, Object> request) {
        String orderId = "ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        MDC.put("orderId", orderId);

        String productId = (String) request.getOrDefault("productId", "unknown");
        int amount = (int) request.getOrDefault("amount", 0);

        log.info("订单创建流程开始, productId={}, amount={}", productId, amount);
        log.info("调用库存服务扣减库存");
        log.info("调用支付服务处理支付");
        log.info("订单创建成功, orderId={}", orderId);

        return Map.of(
                "orderId", orderId,
                "status", "SUCCESS",
                "message", "订单创建成功"
        );
    }
}