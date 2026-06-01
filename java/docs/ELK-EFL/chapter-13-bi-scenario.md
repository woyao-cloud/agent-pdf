# 第13章 场景三：基于日志的实时业务指标监控（伪 BI）

## 本章导读

业务部门说"我要实时看大促的 GMV"——传统的方案是在数据库里写一个统计查询，但数据库扛不住高并发。另一种方案是：从业务日志中实时提取交易数据，在 ES 中做聚合展示。

---

## 13.1 业务日志中嵌入指标

```java
// 在业务代码中打印"可聚合的日志"
@Service
public class OrderService {

    public Order createOrder(OrderRequest request) {
        // 业务逻辑...

        // 打印结构化日志——包含业务指标
        log.info("ORDER_METRIC: service={}, action=create_order, amount={}, " +
                "city={}, category={}, payType={}, success=true",
            "order-service",
            request.getAmount(),
            request.getCity(),
            request.getCategory(),
            request.getPayType());

        return order;
    }
}
```

---

## 13.2 Logstash 解析业务指标

```conf
# Logstash 配置——解析业务指标日志
filter {
  if "ORDER_METRIC" in [message] {
    # 使用 Grok 提取业务字段
    grok {
      match => {
        "message" => "ORDER_METRIC: service=%{DATA:metric_service}, action=%{DATA:action}, amount=%{NUMBER:amount}, city=%{DATA:city}, category=%{DATA:category}, payType=%{DATA:payType}, success=%{DATA:success}"
      }
    }
    # 金额转为浮点数
    mutate {
      convert => { "amount" => "float" }
    }
  }
}
```

---

## 13.3 Kibana 实时 GMV 大屏

```kibana
# 实时 GMV（商品交易总额）翻牌器
# Lens 可视化配置：
# 指标：SUM(amount)
# 筛选：action: create_order AND success: true
# 时间范围：now-24h

# 地域分布热力图
# 字段：city
# 聚合：SUM(amount)
# 可视化类型：Map

# 实时订单量趋势
# 指标：Count
# 水平轴：@timestamp（每 1 分钟）
# 垂直轴：按 category 拆分
```

---

## 本章总结

从日志中提取业务指标是最"轻量"的实时 BI 方案。不需要额外的埋点系统，不需要修改数据库查询，只需要在日志中加上几个业务字段。缺点是 ES 不是 OLAP 引擎，不适合复杂的多维分析。