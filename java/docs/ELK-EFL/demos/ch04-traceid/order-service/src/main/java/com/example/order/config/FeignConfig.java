package com.example.order.config;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Feign 拦截器 —— 自动透传 TraceId
 * 每次 Feign 调用时，将当前 MDC 中的 traceId 写入请求头
 */
@Configuration
public class FeignConfig {

    @Bean
    public RequestInterceptor traceIdInterceptor() {
        return (RequestTemplate request) -> {
            String traceId = MDC.get("traceId");
            if (traceId != null) {
                request.header("X-Trace-Id", traceId);
            }
        };
    }
}