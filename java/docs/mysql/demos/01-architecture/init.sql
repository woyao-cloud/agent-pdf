-- ============================================================
-- 第1章：MySQL架构与查询执行流程
-- 业务场景：理解一条SQL从客户端到返回结果的完整执行流程
-- 运行方式：docker compose up -d
-- ============================================================

-- 创建测试表
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    age INT,
    city VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_city (city),
    INDEX idx_age (age)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    amount DECIMAL(10,2),
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入测试数据
INSERT INTO users (name, email, age, city) VALUES
('张三', 'zhangsan@email.com', 30, 'Beijing'),
('李四', 'lisi@email.com', 28, 'Shanghai'),
('王五', 'wangwu@email.com', 35, 'Beijing'),
('赵六', 'zhaoliu@email.com', 27, 'Shenzhen'),
('孙七', 'sunqi@email.com', 32, 'Beijing'),
('周八', 'zhouba@email.com', 29, 'Shanghai'),
('吴九', 'wujiu@email.com', 31, 'Shenzhen'),
('郑十', 'zhengshi@email.com', 33, 'Beijing');

INSERT INTO orders (user_id, amount, status, created_at) VALUES
(1, 100.00, 'completed', '2024-01-15 10:30:00'),
(1, 200.00, 'pending', '2024-02-20 14:00:00'),
(2, 150.00, 'completed', '2024-03-10 09:00:00'),
(3, 300.00, 'shipped', '2024-04-05 16:30:00'),
(4, 50.00, 'completed', '2024-05-12 11:00:00'),
(5, 400.00, 'pending', '2024-06-01 08:00:00'),
(6, 250.00, 'completed', '2024-06-15 13:00:00'),
(7, 180.00, 'shipped', '2024-07-01 10:00:00');

-- ============================================================
-- 查询执行流程演示
-- ============================================================

-- 1. 查看查询的执行计划（优化器如何选择索引）
-- 业务场景：想知道MySQL是如何执行这个查询的
-- 执行预期：显示id、select_type、table、type、key、rows等字段
EXPLAIN SELECT * FROM users WHERE city = 'Beijing' AND age > 30;

-- 2. 查看实际执行成本（MySQL 8.0.18+）
-- 业务场景：想知道查询实际花了多少时间
-- EXPLAIN ANALYZE SELECT * FROM users WHERE city = 'Beijing' AND age > 30;

-- 3. 查看当前连接和查询状态
-- 业务场景：排查"数据库卡住了"的问题
-- SHOW PROCESSLIST;

-- 4. 查看表的状态信息
-- 业务场景：了解表的数据量和索引情况
-- SHOW TABLE STATUS LIKE 'users';

-- 5. 查看索引信息
-- 业务场景：确认索引是否被正确使用
-- SHOW INDEX FROM users;

-- 6. 查看MySQL版本和存储引擎
-- 业务场景：确认MySQL版本和默认存储引擎
-- SELECT VERSION();
-- SHOW ENGINES;

-- 7. 查看InnoDB状态
-- 业务场景：诊断InnoDB相关问题
-- SHOW ENGINE INNODB STATUS\G

-- ============================================================
-- 优化器行为演示
-- ============================================================

-- 场景1：优化器自动选择索引
-- 当查询条件同时命中city索引和age索引时，优化器会选择成本更低的
EXPLAIN SELECT * FROM users WHERE city = 'Beijing' AND age = 30;

-- 场景2：强制使用特定索引（对比优化器的选择）
-- 业务场景：当优化器选错了索引，可以强制指定
EXPLAIN SELECT * FROM users FORCE INDEX (idx_age) WHERE city = 'Beijing' AND age = 30;

-- 场景3：查看优化器跟踪（了解优化器决策过程）
-- 业务场景：想知道优化器为什么选择了这个索引而不是那个
-- SET optimizer_trace="enabled=on";
-- SELECT * FROM users WHERE city = 'Beijing' AND age > 30;
-- SELECT * FROM information_schema.OPTIMIZER_TRACE\G
-- SET optimizer_trace="enabled=off";
