package com.example.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * 审计日志器 —— 独立通道发送审计事件到 Kafka
 */
@Component
public class AuditLogger {

    private static final Logger log = LoggerFactory.getLogger(AuditLogger.class);
    private static final String AUDIT_TOPIC = "audit-logs";

    @Autowired(required = false)
    private KafkaTemplate<String, String> kafkaTemplate;

    private final ObjectMapper mapper = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    /**
     * 记录审计事件
     */
    public void audit(AuditEvent event) {
        try {
            String json = mapper.writeValueAsString(event);

            if (kafkaTemplate != null) {
                kafkaTemplate.send(AUDIT_TOPIC, json);
            }

            // 同时打印普通日志（ELK 中也存一份）
            log.info("AUDIT: action={}, userId={}, resource={}, result={}",
                    event.getAction(), event.getUserId(),
                    event.getResource(), event.getResult());

        } catch (JsonProcessingException e) {
            log.error("审计事件序列化失败", e);
        }
    }
}