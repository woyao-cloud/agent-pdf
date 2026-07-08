-- ============================================================
-- 第7章：排序与分组优化
-- 业务场景：ORDER BY和GROUP BY性能优化
-- ============================================================

CREATE TABLE logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    action VARCHAR(50),
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_category (category),
    INDEX idx_created_at (created_at),
    INDEX idx_category_created (category, created_at)
) ENGINE=InnoDB;

-- 插入测试数据
INSERT INTO logs (user_id, action, category, created_at) VALUES
(1, 'login', 'auth', '2024-01-15 10:30:00'),
(1, 'view_product', 'browse', '2024-01-15 10:35:00'),
(2, 'login', 'auth', '2024-01-15 11:00:00'),
(1, 'add_to_cart', 'cart', '2024-01-15 10:40:00'),
(3, 'login', 'auth', '2024-01-15 12:00:00'),
(2, 'purchase', 'order', '2024-01-15 11:30:00'),
(1, 'purchase', 'order', '2024-01-15 10:50:00'),
(3, 'view_product', 'browse', '2024-01-15 12:05:00'),
(2, 'logout', 'auth', '2024-01-15 12:00:00'),
(1, 'logout', 'auth', '2024-01-15 11:00:00');

-- ============================================================
-- 排序优化
-- ============================================================

-- 1. 利用索引排序（最优）
-- 业务场景：按创建时间排序，created_at有索引
-- 执行预期：Extra中没有Using filesort
EXPLAIN SELECT * FROM logs ORDER BY created_at DESC LIMIT 10;

-- 2. 无法利用索引排序（需要优化）
-- 业务场景：按user_id排序但查询条件用了category索引
-- 执行预期：Extra=Using filesort
EXPLAIN SELECT * FROM logs WHERE category = 'auth' ORDER BY user_id;

-- 3. 联合索引解决排序问题
-- 业务场景：按category查询，按created_at排序
-- 执行预期：使用idx_category_created，无filesort
EXPLAIN SELECT * FROM logs WHERE category = 'auth' ORDER BY created_at DESC;

-- ============================================================
-- 分组优化
-- ============================================================

-- 4. 利用索引分组（最优）
-- 业务场景：按category分组统计
-- 执行预期：使用idx_category，无temporary
EXPLAIN SELECT category, COUNT(*) FROM logs GROUP BY category;

-- 5. 无法利用索引分组（需要优化）
-- 业务场景：按action分组，action没有索引
-- 执行预期：Using temporary; Using filesort
EXPLAIN SELECT action, COUNT(*) FROM logs GROUP BY action;

-- 6. GROUP BY + ORDER BY 不同列
-- 业务场景：按category分组，按count排序
-- 执行预期：Using temporary; Using filesort
EXPLAIN SELECT category, COUNT(*) AS cnt FROM logs GROUP BY category ORDER BY cnt DESC;

-- ============================================================
-- DISTINCT优化
-- ============================================================

-- 7. DISTINCT vs GROUP BY
-- 业务场景：查询所有不重复的category
-- DISTINCT写法
EXPLAIN SELECT DISTINCT category FROM logs;
-- GROUP BY写法（效果相同）
EXPLAIN SELECT category FROM logs GROUP BY category;
