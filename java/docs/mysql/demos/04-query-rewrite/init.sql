-- ============================================================
-- 第4章：查询重写优化
-- 业务场景：同样的需求，不同的写法，性能可能差100倍
-- 运行方式：docker compose up -d
-- ============================================================

-- 创建测试表
CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    price DECIMAL(10,2),
    stock INT,
    status TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_price (price),
    INDEX idx_status (status),
    INDEX idx_category_price (category, price)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    quantity INT,
    amount DECIMAL(10,2),
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_product_id (product_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入测试数据
INSERT INTO products (name, category, price, stock, status) VALUES
('iPhone 15', '手机', 8999.00, 100, 1),
('MacBook Air', '笔记本', 10999.00, 50, 1),
('AirPods Pro', '配件', 1899.00, 200, 1),
('iPad Air', '平板', 5999.00, 80, 1),
('华为Mate 60', '手机', 7999.00, 60, 1),
('ThinkPad X1', '笔记本', 9999.00, 30, 1),
('Sony WH-1000XM5', '配件', 2999.00, 150, 1),
('Samsung Tab S9', '平板', 4999.00, 40, 0);

INSERT INTO orders (product_id, user_id, quantity, amount, status, created_at) VALUES
(1, 1, 1, 8999.00, 'completed', '2024-01-15'),
(1, 2, 2, 17998.00, 'completed', '2024-02-20'),
(2, 1, 1, 10999.00, 'pending', '2024-03-10'),
(3, 3, 1, 1899.00, 'completed', '2024-04-05'),
(4, 2, 1, 5999.00, 'shipped', '2024-05-12'),
(5, 3, 1, 7999.00, 'completed', '2024-06-01'),
(6, 1, 1, 9999.00, 'pending', '2024-06-15'),
(7, 2, 2, 5998.00, 'completed', '2024-07-01');

-- ============================================================
-- 优化1：避免 SELECT *
-- ============================================================

-- 错误写法：SELECT * 返回所有列，无法使用覆盖索引
-- 执行预期：type=ALL 或 type=ref + Using where
EXPLAIN SELECT * FROM products WHERE category = '手机';

-- 正确写法：只查需要的列，可以利用覆盖索引
-- 执行预期：Extra=Using index（覆盖索引）
EXPLAIN SELECT name, price FROM products WHERE category = '手机';

-- ============================================================
-- 优化2：用 UNION ALL 代替 OR
-- ============================================================

-- 错误写法：OR 连接不同索引列，可能导致全表扫描
-- 执行预期：type=ALL 或 type=index_merge
EXPLAIN SELECT * FROM products WHERE category = '手机' OR price > 5000;

-- 正确写法：拆成 UNION ALL，每个子查询都能用索引
-- 执行预期：两个子查询都使用索引
EXPLAIN SELECT * FROM products WHERE category = '手机'
UNION ALL
SELECT * FROM products WHERE price > 5000 AND category != '手机';

-- ============================================================
-- 优化3：用 EXISTS 代替 IN（子查询返回大量数据时）
-- ============================================================

-- IN 写法：子查询先执行，结果集大时效率低
EXPLAIN SELECT * FROM products WHERE id IN (
    SELECT product_id FROM orders WHERE status = 'completed'
);

-- EXISTS 写法：逐行检查，子查询结果集大时更高效
EXPLAIN SELECT * FROM products p WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.product_id = p.id AND o.status = 'completed'
);

-- ============================================================
-- 优化4：用 JOIN 代替子查询
-- ============================================================

-- 子查询写法：MySQL可能将子查询物化为临时表
EXPLAIN SELECT * FROM products WHERE id IN (
    SELECT product_id FROM orders WHERE user_id = 1
);

-- JOIN 写法：优化器可以更好地选择JOIN顺序
EXPLAIN SELECT DISTINCT p.* FROM products p
JOIN orders o ON p.id = o.product_id
WHERE o.user_id = 1;

-- ============================================================
-- 优化5：避免在 WHERE 中对列进行函数操作
-- ============================================================

-- 错误写法：对索引列使用函数
EXPLAIN SELECT * FROM orders WHERE YEAR(created_at) = 2024;

-- 正确写法：使用范围查询
EXPLAIN SELECT * FROM orders
WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';

-- ============================================================
-- 优化6：用 LIMIT 限制结果集
-- ============================================================

-- 无 LIMIT：返回所有匹配行
EXPLAIN SELECT * FROM products WHERE category = '手机';

-- 有 LIMIT：找到足够行数就停止扫描
EXPLAIN SELECT * FROM products WHERE category = '手机' LIMIT 10;

-- ============================================================
-- 优化7：用 UNION ALL 代替 UNION（不需要去重时）
-- ============================================================

-- UNION：自动去重，需要额外排序
EXPLAIN SELECT category FROM products WHERE price > 5000
UNION
SELECT category FROM products WHERE stock > 50;

-- UNION ALL：不去重，性能更好
EXPLAIN SELECT category FROM products WHERE price > 5000
UNION ALL
SELECT category FROM products WHERE stock > 50;
