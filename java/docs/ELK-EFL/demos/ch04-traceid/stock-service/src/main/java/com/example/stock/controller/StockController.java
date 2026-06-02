package com.example.stock.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/stock")
public class StockController {

    private static final Logger log = LoggerFactory.getLogger(StockController.class);

    @PostMapping("/deduct")
    public ResponseEntity<String> deduct(@RequestBody Map<String, Object> request) {
        String productId = (String) request.getOrDefault("productId", "unknown");
        log.info("库存服务: 扣减库存, productId={}", productId);
        log.info("库存服务: 库存扣减成功, remain=99");
        return ResponseEntity.ok("库存扣减成功, traceId=" + MDC.get("traceId"));
    }

    @GetMapping("/trace")
    public ResponseEntity<Map<String, String>> getTrace() {
        return ResponseEntity.ok(Map.of("traceId", MDC.get("traceId")));
    }
}