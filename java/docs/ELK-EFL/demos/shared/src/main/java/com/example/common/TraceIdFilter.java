package com.example.common;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;

/**
 * TraceId Filter —— 全链路追踪 ID 注入
 *
 * 功能：
 *   1. 从请求头 X-Trace-Id 获取 traceId（上游服务透传）
 *   2. 没有则自动生成
 *   3. 注入 MDC（logback 在 JSON 日志中输出）
 *   4. 在响应头中返回 traceId
 *   5. 请求结束后清理 MDC
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        try {
            // 1. 从请求头获取 traceId
            String traceId = httpRequest.getHeader("X-Trace-Id");
            if (traceId == null || traceId.isEmpty()) {
                traceId = UUID.randomUUID().toString().replace("-", "");
            }

            // 2. 注入 MDC
            MDC.put("traceId", traceId);

            // 3. 在响应头中返回
            httpResponse.setHeader("X-Trace-Id", traceId);

            // 4. 继续请求处理
            chain.doFilter(request, response);

        } finally {
            // 5. 必须清理！线程复用导致 traceId 错乱
            MDC.clear();
        }
    }
}