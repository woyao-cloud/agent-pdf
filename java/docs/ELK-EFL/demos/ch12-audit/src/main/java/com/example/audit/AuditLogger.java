package com.example.audit;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
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

    private final ObjectMapper mapper = new ObjectMapper();

    public AuditLogger() {
        // 将 Instant 序列化为 epoch 毫秒（long 整数）
        SimpleModule module = new SimpleModule();
        module.addSerializer(Instant.class, new StdSerializer<Instant>(Instant.class) {
            @Override
            public void serialize(Instant value, JsonGenerator gen, SerializerProvider provider)
                    throws IOException {
                gen.writeNumber(value.toEpochMilli()); // 毫秒整数
            }
        });
        mapper.registerModule(module);
    }

    /**
     * 记录审计事件
     */
    public void audit(AuditEvent event) {
        try {
            String json = mapper.writeValueAsString(event);

            if (kafkaTemplate != null) {
                kafkaTemplate.send(AUDIT_TOPIC, json);
            }

            log.info("AUDIT: action={}, userId={}, resource={}, result={}",
                    event.getAction(), event.getUserId(),
                    event.getResource(), event.getResult());

        } catch (IOException e) {
            log.error("审计事件序列化失败", e);
        }
    }
}