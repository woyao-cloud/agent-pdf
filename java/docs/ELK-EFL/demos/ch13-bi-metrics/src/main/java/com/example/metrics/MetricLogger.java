package com.example.metrics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 业务指标日志器
 * 在日志中打印结构化的业务指标，供 Logstash 解析后写入 ES 做聚合
 */
@Component
public class MetricLogger {

    private static final Logger metricLog = LoggerFactory.getLogger("METRIC");

    public void recordOrderMetric(String action, double amount, String city,
                                  String category, String payType, boolean success) {
        metricLog.info("ORDER_METRIC: action={}, amount={}, city={}, category={}, payType={}, success={}",
                action, amount, city, category, payType, success);
    }

    public void recordUserAction(String userId, String action, String target) {
        metricLog.info("USER_ACTION: userId={}, action={}, target={}",
                userId, action, target);
    }
}