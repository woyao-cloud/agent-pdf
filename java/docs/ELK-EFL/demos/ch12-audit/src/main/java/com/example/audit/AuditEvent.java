package com.example.audit;

import java.time.Instant;

public class AuditEvent {
    private Instant timestamp;
    private String userId;
    private String userIp;
    private String action;     // LOGIN / CREATE / UPDATE / DELETE
    private String resource;   // 操作对象类型
    private String resourceId; // 操作对象 ID
    private String detail;
    private String result;     // SUCCESS / FAILURE

    public static AuditEventBuilder builder() { return new AuditEventBuilder(); }

    // Builder
    public static class AuditEventBuilder {
        private final AuditEvent event = new AuditEvent();
        public AuditEventBuilder timestamp(Instant t) { event.timestamp = t; return this; }
        public AuditEventBuilder userId(String u) { event.userId = u; return this; }
        public AuditEventBuilder userIp(String i) { event.userIp = i; return this; }
        public AuditEventBuilder action(String a) { event.action = a; return this; }
        public AuditEventBuilder resource(String r) { event.resource = r; return this; }
        public AuditEventBuilder resourceId(String id) { event.resourceId = id; return this; }
        public AuditEventBuilder detail(String d) { event.detail = d; return this; }
        public AuditEventBuilder result(String r) { event.result = r; return this; }
        public AuditEvent build() {
            if (event.timestamp == null) event.timestamp = Instant.now();
            return event;
        }
    }

    // Getters
    public Instant getTimestamp() { return timestamp; }
    public String getUserId() { return userId; }
    public String getUserIp() { return userIp; }
    public String getAction() { return action; }
    public String getResource() { return resource; }
    public String getResourceId() { return resourceId; }
    public String getDetail() { return detail; }
    public String getResult() { return result; }
}