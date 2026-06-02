package com.example.audit;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    @Autowired
    private AuditLogger auditLogger;

    /** 演示：用户登录审计 */
    @PostMapping("/login")
    public ResponseEntity<String> login(@RequestBody Map<String, String> request) {
        String userId = request.get("userId");

        // 记录审计事件
        auditLogger.audit(AuditEvent.builder()
                .userId(userId)
                .userIp(request.getOrDefault("ip", "unknown"))
                .action("LOGIN")
                .resource("USER_SESSION")
                .detail("用户登录系统")
                .result("SUCCESS")
                .build());

        return ResponseEntity.ok("审计日志已记录");
    }

    /** 演示：管理员操作审计 */
    @PostMapping("/admin-action")
    public ResponseEntity<String> adminAction(@RequestBody Map<String, Object> request) {
        auditLogger.audit(AuditEvent.builder()
                .userId((String) request.get("adminId"))
                .action("UPDATE")
                .resource("ORDER")
                .resourceId((String) request.get("orderId"))
                .detail("管理员修改订单状态: " + request.get("newStatus"))
                .result("SUCCESS")
                .build());

        return ResponseEntity.ok("操作已审计");
    }
}