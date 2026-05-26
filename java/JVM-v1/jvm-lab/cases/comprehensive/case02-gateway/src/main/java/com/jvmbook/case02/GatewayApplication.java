package com.jvmbook.case02;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicLong;

@SpringBootApplication
@RestController
public class GatewayApplication {

    private final RouteHandler routeHandler;
    private final AtomicLong requestCount = new AtomicLong();
    private final AtomicLong totalLatency = new AtomicLong();
    private final AtomicLong errorCount = new AtomicLong();

    public GatewayApplication() {
        this.routeHandler = new RouteHandler();
        // 预热路由表，模拟服务启动时加载的路由规则
        routeHandler.warmupRoutes();
    }

    /**
     * 核心网关转发端点，代理所有 /api/** 请求到 RouteHandler
     */
    @PostMapping("/api/**")
    public Mono<String> handleRequest(ServerWebExchange exchange, @RequestBody String body) {
        long start = System.nanoTime();
        String path = exchange.getRequest().getPath().value();

        return Mono.fromCallable(() -> {
            try {
                String result = routeHandler.handle(path, body);
                return result;
            } catch (Exception e) {
                errorCount.incrementAndGet();
                return "{\"status\":\"error\",\"message\":\"" + e.getMessage() + "\"}";
            }
        }).doFinally(signalType -> {
            long elapsed = System.nanoTime() - start;
            requestCount.incrementAndGet();
            totalLatency.addAndGet(elapsed);
        });
    }

    /**
     * 运行时指标监控端点
     */
    @GetMapping("/stats")
    public Mono<String> stats() {
        long count = requestCount.get();
        long avgLatency = count > 0 ? totalLatency.get() / count : 0;
        long errors = errorCount.get();
        return Mono.just(String.format(
            "{\"requestCount\":%d,\"avgLatencyNs\":%d,\"errorCount\":%d}",
            count, avgLatency, errors
        ));
    }

    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
