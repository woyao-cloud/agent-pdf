package com.example.tracing;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.trace.samplers.Sampler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * OpenTelemetry 链路追踪配置
 */
@Configuration
public class TracingConfig {

    @Bean
    public OpenTelemetry openTelemetry() {
        // 配置OTLP导出器
        OtlpGrpcSpanExporter spanExporter = OtlpGrpcSpanExporter.builder()
                .setEndpoint("http://otel-collector:4317")
                .setTimeout(Duration.ofSeconds(30))
                .build();

        // 配置采样策略：生产环境10%采样率
        Sampler sampler = Sampler.parentBased(Sampler.traceIdRatioBased(0.1));

        SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
                .addSpanProcessor(BatchSpanProcessor.builder(spanExporter)
                        .setScheduleDelay(Duration.ofSeconds(5))
                        .setMaxExportBatchSize(512)
                        .build())
                .setSampler(sampler)
                .build();

        return OpenTelemetrySdk.builder()
                .setTracerProvider(tracerProvider)
                .build();
    }

    @Bean
    public Tracer tracer(OpenTelemetry openTelemetry) {
        return openTelemetry.getTracer("com.example.demo");
    }

    // 手动埋点示例
    public void createOrderWithTracing(Tracer tracer, String orderId, String userId) {
        Span span = tracer.spanBuilder("createOrder")
                .setAttribute("order.id", orderId)
                .setAttribute("user.id", userId)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // 业务逻辑
            Thread.sleep(100);
            span.addEvent("order.created", Attributes.of(
                    AttributeKey.stringKey("orderId"), orderId
            ));
        } catch (Exception e) {
            span.recordException(e);
            span.setAttribute("error", true);
        } finally {
            span.end();
        }
    }
}
