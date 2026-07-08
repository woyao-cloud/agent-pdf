-- ============================================================
-- 第5章：JOIN优化
-- 业务场景：多表关联查询，驱动表选择、JOIN算法对比
-- ============================================================

CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    city VARCHAR(50),
    INDEX idx_city (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    amount DECIMAL(10,2),
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    product_name VARCHAR(100),
    price DECIMAL(10,2),
    quantity INT,
    INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入数据
INSERT INTO users (name, city) VALUES
('张三', 'Beijing'), ('李四', 'Shanghai'), ('王五', 'Beijing'),
('赵六', 'Shenzhen'), ('孙七', 'Beijing'), ('周八', 'Shanghai');

INSERT INTO orders (user_id, amount, status, created_at) VALUES
(1, 100.00, 'completed', '2024-01-15'), (1, 200.00, 'pending', '2024-02-20'),
(2, 150.00, 'completed', '2024-03-10'), (3, 300.00, 'shipped', '2024-04-05'),
(4, 50.00, 'completed', '2024-05-12'), (5, 400.00, 'pending', '2024-06-01');

INSERT INTO order_items (order_id, product_name, price, quantity) VALUES
(1, 'iPhone', 8999.00, 1), (1, 'AirPods', 1899.00, 1),
(2, 'MacBook', 10999.00, 1), (3, 'iPad', 5999.00, 1),
(4, '华为Mate', 7999.00, 1), (5, 'ThinkPad', 9999.00, 1);

-- ============================================================
-- JOIN算法对比
-- ============================================================

-- 1. Nested-Loop Join（默认，小表驱动大表）
-- 业务场景：查询用户及其订单
-- 执行预期：users为驱动表，orders使用idx_user_id
EXPLAIN SELECT u.name, o.amount, o.status
FROM users u JOIN orders o ON u.id = o.user_id;

-- 2. 强制驱动表顺序（STRAIGHT_JOIN）
-- 业务场景：当优化器选错驱动表时，手动指定
EXPLAIN SELECT STRAIGHT_JOIN u.name, o.amount
FROM orders o JOIN users u ON u.id = o.user_id;

-- ============================================================
-- JOIN优化策略
-- ============================================================

-- 3. 为JOIN列建索引（关键！）
-- 业务场景：orders.user_id有索引，JOIN时使用ref访问
EXPLAIN SELECT u.name, o.amount
FROM users u JOIN orders o ON u.id = o.user_id
WHERE u.city = 'Beijing';

-- 4. 减少JOIN表数量
-- 三表JOIN：users → orders → order_items
EXPLAIN SELECT u.name, o.amount, oi.product_name
FROM users u
JOIN orders o ON u.id = o.user_id
JOIN order_items oi ON o.id = oi.order_id
WHERE u.city = 'Beijing';

-- 5. 避免笛卡尔积
-- 错误：忘记JOIN条件
-- EXPLAIN SELECT * FROM users, orders; -- 6*6=36行，笛卡尔积

-- 6. LEFT JOIN优化
-- 业务场景：查询所有用户及其订单（包括没有订单的用户）
-- 注意：LEFT JOIN时，右表的WHERE条件要放在ON中
EXPLAIN SELECT u.name, o.amount
FROM users u
LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'completed';

-- ============================================================
-- JOIN vs 子查询
-- ============================================================

-- 7. JOIN写法（推荐）
EXPLAIN SELECT DISTINCT u.* FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.amount > 100;

-- 8. 子查询写法
EXPLAIN SELECT * FROM users WHERE id IN (
    SELECT user_id FROM orders WHERE amount > 100
);
