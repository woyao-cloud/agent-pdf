-- ============================================================
-- 第12章：慢查询分析与监控
-- 业务场景：开启慢查询日志、分析慢SQL、建立优化流程
-- ============================================================

CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    city VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 插入测试数据
INSERT INTO users (name, email, city) VALUES
('张三', 'zhangsan@email.com', 'Beijing'),
('李四', 'lisi@email.com', 'Shanghai'),
('王五', 'wangwu@email.com', 'Beijing'),
('赵六', 'zhaoliu@email.com', 'Shenzhen');

-- ============================================================
-- 慢查询日志管理
-- ============================================================

-- 1. 查看慢查询日志配置
SHOW VARIABLES LIKE 'slow_query_log%';
SHOW VARIABLES LIKE 'long_query_time';

-- 2. 查看慢查询统计
SHOW STATUS LIKE 'Slow_queries';

-- 3. 临时开启/关闭慢查询日志
-- SET GLOBAL slow_query_log = 1;
-- SET GLOBAL slow_query_log = 0;

-- 4. 修改慢查询阈值（全局生效）
-- SET GLOBAL long_query_time = 0.5;

-- ============================================================
-- 模拟慢查询（用于测试慢查询日志）
-- ============================================================

-- 全表扫描（无索引）
SELECT * FROM users WHERE name = '张三';

-- 全表扫描 + 排序
SELECT * FROM users ORDER BY email;

-- ============================================================
-- Performance Schema 监控
-- ============================================================

-- 5. 查看Performance Schema是否开启
SHOW VARIABLES LIKE 'performance_schema';

-- 6. 查看最近执行的SQL统计
-- SELECT * FROM performance_schema.events_statements_summary_by_digest
-- ORDER BY SUM_TIMER_WAIT DESC LIMIT 10;

-- 7. 查看锁等待统计
-- SELECT * FROM performance_schema.events_waits_summary_global_by_event_name
-- WHERE EVENT_NAME LIKE '%lock%' ORDER BY SUM_TIMER_WAIT DESC;

-- ============================================================
-- SQL优化流程
-- ============================================================

-- 标准优化流程：
-- 1. 发现：通过慢查询日志找到慢SQL
-- 2. 分析：用EXPLAIN查看执行计划
-- 3. 优化：加索引 / 重写SQL / 调整配置
-- 4. 验证：对比优化前后的执行时间和EXPLAIN
-- 5. 监控：持续监控，确保优化有效

-- 示例：优化一条慢查询
-- 步骤1：发现慢查询
-- 步骤2：EXPLAIN分析
EXPLAIN SELECT * FROM users WHERE name = '张三';
-- 步骤3：加索引
CREATE INDEX idx_name ON users(name);
-- 步骤4：验证
EXPLAIN SELECT * FROM users WHERE name = '张三';
-- 步骤5：监控
SHOW STATUS LIKE 'Slow_queries';
