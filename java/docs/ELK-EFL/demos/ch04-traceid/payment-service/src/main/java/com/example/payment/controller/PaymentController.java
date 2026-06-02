package com.example.payment.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/payment")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);

    @PostMapping("/pay")
    public ResponseEntity<String> pay(@RequestBody Map<String, Object> request) {
        log.info("支付服务: 收到支付请求, orderId={}, amount={}",
                request.get("orderId"), request.get("amount"));
        log.info("支付服务: 调用库存服务扣减库存");
        log.info("支付服务: 支付成功");
        return ResponseEntity.ok("支付成功, traceId=" + MDC.get("traceId"));
    }

    @GetMapping("/trace")
    public ResponseEntity<Map<String, String>> getTrace() {
        return ResponseEntity.ok(Map.of("traceId", MDC.get("traceId")));
    }
}