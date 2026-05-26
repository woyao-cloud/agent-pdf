package com.jvmbook.case02;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * RouteHandler 模拟 Spring Cloud Gateway 的路由处理流程。
 *
 * 设计上刻意引入了三大性能瓶颈，供 async-profiler / Arthas 等工具诊断：
 *
 * 1. 【序列化瓶颈】manualJsonParse() 使用纯字符串解析模拟 JSON 序列化/反序列化
 *    CPU 开销，模拟 Jackson 等通用库在高并发下的 CPU 热点。
 *
 * 2. 【JIT 内联失效】RouteMatcher 接口拥有多个实现类，路由匹配时发生多态调用
 *    (polymorphic dispatch)，JIT 编译器因类型分布超过内联阈值而放弃内联。
 *
 * 3. 【锁竞争】routeTable.computeIfAbsent() 在多线程并发写入路由表时产生锁竞争，
 *    ConcurrentHashMap 的 computeIfAbsent 内部使用分段锁，高并发下出现 contention。
 */
public class RouteHandler {

    // ============================================================
    // 路由表：模拟 Gateway 的路由规则存储
    // ============================================================
    private final ConcurrentHashMap<String, RouteEntry> routeTable = new ConcurrentHashMap<>();
    private final AtomicInteger routeVersion = new AtomicInteger(0);

    // ============================================================
    // 多态路由匹配器接口 —— 触发 JIT 内联失效
    // ============================================================
    public interface RouteMatcher {
        boolean matches(String path);
        String name();
    }

    // ---- 精确路径匹配 ----
    static class ExactMatcher implements RouteMatcher {
        private final String pattern;
        ExactMatcher(String pattern) { this.pattern = pattern; }
        @Override public boolean matches(String path) { return path.equals(pattern); }
        @Override public String name() { return "exact"; }
    }

    // ---- 前缀路径匹配 ----
    static class PrefixMatcher implements RouteMatcher {
        private final String prefix;
        PrefixMatcher(String prefix) { this.prefix = prefix; }
        @Override public boolean matches(String path) { return path.startsWith(prefix); }
        @Override public String name() { return "prefix"; }
    }

    // ---- 通配符路径匹配 ----
    static class WildcardMatcher implements RouteMatcher {
        private final String[] segments;
        WildcardMatcher(String pattern) {
            this.segments = pattern.split("/");
        }
        @Override public boolean matches(String path) {
            String[] pathSegments = path.split("/");
            if (pathSegments.length != segments.length) return false;
            for (int i = 0; i < segments.length; i++) {
                if (!segments[i].equals("*") && !segments[i].equals(pathSegments[i])) {
                    return false;
                }
            }
            return true;
        }
        @Override public String name() { return "wildcard"; }
    }

    // ---- 正则路径匹配 ----
    static class RegexMatcher implements RouteMatcher {
        private final String regex;
        RegexMatcher(String regex) { this.regex = regex; }
        @Override public boolean matches(String path) { return path.matches(regex); }
        @Override public String name() { return "regex"; }
    }

    // ---- 参数模板匹配（模拟 /api/{version}/order 风格） ----
    static class TemplateMatcher implements RouteMatcher {
        private final String[] templateSegments;
        TemplateMatcher(String template) {
            this.templateSegments = template.split("/");
        }
        @Override public boolean matches(String path) {
            String[] pathSegments = path.split("/");
            if (pathSegments.length != templateSegments.length) return false;
            for (int i = 0; i < templateSegments.length; i++) {
                if (templateSegments[i].startsWith("{") && templateSegments[i].endsWith("}")) {
                    continue; // 模板变量匹配任意值
                }
                if (!templateSegments[i].equals(pathSegments[i])) return false;
            }
            return true;
        }
        @Override public String name() { return "template"; }
    }

    // ============================================================
    // 路由条目
    // ============================================================
    static class RouteEntry {
        final RouteMatcher matcher;
        final String targetService;
        final List<String> filters;

        RouteEntry(RouteMatcher matcher, String targetService, List<String> filters) {
            this.matcher = matcher;
            this.targetService = targetService;
            this.filters = filters;
        }
    }

    // ============================================================
    // 构造函数：注册模拟路由规则
    // ============================================================
    public RouteHandler() {
        // 模拟多种路由匹配规则 —— 每种规则使用不同的 Matcher 实现类
        registerRoute("/api/order", new ExactMatcher("/api/order"), "order-service",
                       Arrays.asList("auth", "rate-limit"));
        registerRoute("/api/order/", new PrefixMatcher("/api/order/"), "order-service",
                       Arrays.asList("auth", "rate-limit", "logging"));
        registerRoute("/api/inventory/*/stock", new WildcardMatcher("/api/inventory/*/stock"),
                       "inventory-service", Arrays.asList("auth"));
        registerRoute("/api/user/*/profile", new WildcardMatcher("/api/user/*/profile"),
                       "user-service", Arrays.asList("auth", "logging"));
        registerRoute("/api/payment", new ExactMatcher("/api/payment"), "payment-service",
                       Arrays.asList("auth", "rate-limit", "encryption"));
        registerRoute("/api/search/**", new PrefixMatcher("/api/search/"), "search-service",
                       Arrays.asList("logging"));
        registerRoute("/api/recommend", new ExactMatcher("/api/recommend"), "recommend-service",
                       Arrays.asList("auth", "logging"));
        registerRoute("/api/notification/send", new ExactMatcher("/api/notification/send"),
                       "notification-service", Arrays.asList("auth", "rate-limit"));
        registerRoute("template.*", new RegexMatcher("^/api/v[0-9]+/.*$"),
                       "versioned-service", Arrays.asList("auth"));
        registerRoute("/api/{version}/product", new TemplateMatcher("/api/{version}/product"),
                       "product-service", Arrays.asList("auth", "logging"));
    }

    private void registerRoute(String id, RouteMatcher matcher, String target, List<String> filters) {
        routeTable.put(id, new RouteEntry(matcher, target, filters));
    }

    /**
     * 启动预热：加载更多的路由规则以使 JIT 编译并触发内联决策
     */
    public void warmupRoutes() {
        for (int i = 0; i < 200; i++) {
            String id = "warmup-" + i;
            String prefix = "/api/warmup/" + i;
            RouteMatcher m;
            if (i % 4 == 0) {
                m = new ExactMatcher(prefix);
            } else if (i % 4 == 1) {
                m = new PrefixMatcher(prefix);
            } else if (i % 4 == 2) {
                m = new WildcardMatcher(prefix + "/*");
            } else {
                m = new TemplateMatcher("/api/{version}/warmup/" + i);
            }
            routeTable.put(id, new RouteEntry(m, "warmup-service-" + i,
                           Collections.singletonList("auth")));
        }
    }

    // ============================================================
    // 核心处理方法
    // ============================================================

    /**
     * 处理网关请求：反序列化 → 路由匹配 → 序列化响应
     */
    public String handle(String path, String body) {
        // ---- 瓶颈 1: 手动 JSON 解析模拟反序列化 CPU 开销 ----
        Map<String, Object> parsedBody = manualJsonParse(body);

        // ---- 从 parsedBody 中获取请求参数 ----
        @SuppressWarnings("unchecked")
        Map<String, Object> innerData = (Map<String, Object>) parsedBody.getOrDefault("data",
                                          parsedBody);

        // ---- 瓶颈 2: 多态路由匹配 + 瓶颈 3: 锁竞争 ----
        RouteEntry entry = matchRoute(path);

        // ---- 模拟路由转发处理 ----
        String result = simulateForward(entry, innerData);

        // ---- 模拟响应序列化 ----
        return manualJsonSerialize(result, entry.targetService);
    }

    // ============================================================
    // 瓶颈 1: 序列化/反序列化 CPU 热点
    // ============================================================

    /**
     * 手动 JSON 解析 —— 使用纯字符串操作模拟 Jackson 反序列化的 CPU 消耗。
     * 在高并发下此方法会成为显著的 CPU 热点。
     */
    Map<String, Object> manualJsonParse(String json) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (json == null || json.isBlank()) return result;

        // 去除外层花括号
        String trimmed = json.trim();
        if (trimmed.startsWith("{")) trimmed = trimmed.substring(1);
        if (trimmed.endsWith("}")) trimmed = trimmed.substring(0, trimmed.length() - 1);

        // 模拟 Jackson 的字段解析过程 —— 引入额外 CPU 循环制造热点
        int braceDepth = 0;
        boolean inString = false;
        StringBuilder token = new StringBuilder();
        String currentKey = null;

        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (c == '"' && (i == 0 || trimmed.charAt(i - 1) != '\\')) {
                inString = !inString;
                if (!inString && currentKey == null) {
                    currentKey = token.toString();
                    token.setLength(0);
                    continue;
                } else if (!inString) {
                    result.put(currentKey, token.toString());
                    currentKey = null;
                    token.setLength(0);
                    continue;
                }
            }
            if (!inString) {
                if (c == '{') braceDepth++;
                if (c == '}') braceDepth--;
                if (c == ':' || c == ',' || c == '[' || c == ']') continue;
                if (Character.isWhitespace(c)) continue;
            }
            token.append(c);
        }

        // 模拟复杂对象的深层解析开销（Jackson 的 ObjectMapper 内部处理）
        // 引入额外的 CPU 密集型循环来模拟序列化框架的反射处理
        if (!result.isEmpty()) {
            simulateReflectionOverhead(result.size());
        }

        return result;
    }

    /**
     * 模拟 Jackson ObjectMapper 的反射字段解析开销
     */
    private void simulateReflectionOverhead(int fieldCount) {
        // 模拟反射调用的 CPU 循环 —— 每个字段产生约 2000 次内部操作
        int iterations = fieldCount * 2000;
        long sum = 0;
        for (int i = 0; i < iterations; i++) {
            sum += (long) i * i;
        }
        // 防止 JIT 完全消除循环
        if (sum < 0) {
            throw new RuntimeException("unexpected");
        }
    }

    /**
     * 手动 JSON 序列化 —— 模拟响应序列化的 CPU 成本
     */
    private String manualJsonSerialize(String data, String service) {
        StringBuilder sb = new StringBuilder(256);
        sb.append("{\"status\":\"ok\",\"service\":\"");
        sb.append(service);
        sb.append("\",\"data\":\"");
        sb.append(data);
        sb.append("\",\"timestamp\":");
        sb.append(System.currentTimeMillis());

        // 模拟序列化框架的字段遍历开销
        int extraFields = 8;
        for (int i = 0; i < extraFields; i++) {
            sb.append(",\"field_").append(i).append("\":\"value_").append(i).append("\"");
        }
        sb.append("}");
        return sb.toString();
    }

    // ============================================================
    // 瓶颈 2 & 3: 多态路由匹配 + 锁竞争
    // ============================================================

    /**
     * 路由匹配 —— 遍历路由表，对每个条目调用 matcher.matches(path)。
     *
     * 【JIT 内联失效】
     * matcher.matches() 是接口方法调用，实际类型可能是 ExactMatcher、
     * PrefixMatcher、WildcardMatcher、RegexMatcher、TemplateMatcher 中的任一种。
     * JIT 编译器维护类型 profiling 信息，当同一调用点的类型数量超过
     * 内联阈值（默认 2 种类型）时，JIT 放弃内联，退化为 vtable dispatch。
     *
     * 【锁竞争】
     * routeTable.computeIfAbsent() 在并发更新路由表时产生内部锁竞争。
     * computeIfAbsent 在 ConcurrentHashMap 内部使用 synchronized 块，
     * 高 QPS 下路由表变更操作会导致线程阻塞。
     */
    RouteEntry matchRoute(String path) {
        // ---- 瓶颈 3: computeIfAbsent 锁竞争 ----
        // 模拟动态路由注册 —— 每次匹配时以 0.1% 的概率动态添加新路由
        if (ThreadLocalRandom.current().nextInt(1000) == 0) {
            String newId = "dynamic-" + routeVersion.incrementAndGet();
            routeTable.computeIfAbsent(newId, id -> {
                // computeIfAbsent 内部持有 ConcurrentHashMap 的分段锁
                simulateCpuWork(500);
                return new RouteEntry(
                    new PrefixMatcher("/api/dynamic/" + routeVersion.get()),
                    "dynamic-service",
                    Arrays.asList("auth", "rate-limit")
                );
            });
        }

        // ---- 瓶颈 2: 多态路由匹配 ----
        for (RouteEntry entry : routeTable.values()) {
            if (entry.matcher.matches(path)) {
                return entry;
            }
        }

        // 未匹配时返回默认路由
        return new RouteEntry(new ExactMatcher("/default"), "default-service",
                              Collections.singletonList("auth"));
    }

    /**
     * 模拟路由转发到目标服务 —— 包含额外的 CPU 处理
     */
    private String simulateForward(RouteEntry entry, Map<String, Object> params) {
        // 模拟过滤器链处理
        for (String filter : entry.filters) {
            applyFilter(filter, params);
        }

        // 模拟请求体转换
        StringBuilder sb = new StringBuilder(128);
        sb.append("processed by ").append(entry.targetService);
        sb.append(" with params: ").append(params);
        return sb.toString();
    }

    /**
     * 模拟过滤器处理
     */
    private void applyFilter(String filter, Map<String, Object> params) {
        // 每个过滤器执行少量的 CPU 模拟
        switch (filter) {
            case "auth":
                // 模拟认证检查 —— 字符串比较和哈希计算
                String token = (String) params.getOrDefault("token", "default-token");
                for (int i = 0; i < token.length(); i++) {
                    params.put("auth_check_" + i, token.charAt(i) % 10);
                }
                break;
            case "rate-limit":
                // 模拟限流判断 —— 计数器递增
                int count = (int) params.getOrDefault("rate_count", 0);
                params.put("rate_count", count + 1);
                break;
            case "logging":
                // 模拟日志记录开销
                params.put("logged_at", System.nanoTime());
                break;
            case "encryption":
                // 模拟加密处理 —— 计算密集
                simulatEncryptionCpu();
                break;
            default:
                break;
        }
    }

    private void simulatEncryptionCpu() {
        long seed = System.nanoTime();
        long acc = seed;
        for (int i = 0; i < 100; i++) {
            acc ^= (acc << 13);
            acc ^= (acc >>> 7);
            acc ^= (acc << 17);
        }
        if (acc == 0) {
            throw new RuntimeException("unexpected");
        }
    }

    /**
     * 模拟 CPU 工作负载（供 computeIfAbsent 内部调用）
     */
    private void simulateCpuWork(int iterations) {
        long sum = 0;
        for (int i = 0; i < iterations; i++) {
            sum += i * i;
        }
        if (sum < 0) {
            throw new RuntimeException("unexpected");
        }
    }
}
