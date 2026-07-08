-- ============================================================
-- 第6章：子查询优化
-- 业务场景：子查询 vs JOIN 性能对比，子查询重写策略
-- ============================================================

CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    city VARCHAR(50),
    INDEX idx_city (city)
) ENGINE=InnoDB;

CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    amount DECIMAL(10,2),
    status VARCHAR(20),
    INDEX idx_user_id (user_id),
    INDEX idx_amount (amount)
) ENGINE=InnoDB;

INSERT INTO users (name, city) VALUES
('张三','Beijing'),('李四','Shanghai'),('王五','Beijing'),
('赵六','Shenzhen'),('孙七','Beijing'),('周八','Shanghai');

INSERT INTO orders (user_id, amount, status) VALUES
(1,100,'completed'),(1,200,'pending'),(2,150,'completed'),
(3,300,'shipped'),(4,50,'completed'),(5,400,'pending'),
(1,500,'completed'),(3,200,'completed'),(6,100,'pending');

-- ============================================================
-- 子查询类型与优化
-- ============================================================

-- 1. IN子查询 → JOIN重写
-- 业务场景：查询有订单的用户
-- 子查询写法
EXPLAIN SELECT * FROM users WHERE id IN (SELECT user_id FROM orders);
-- JOIN重写（推荐）
EXPLAIN SELECT DISTINCT u.* FROM users u JOIN orders o ON u.id = o.user_id;

-- 2. NOT IN子查询 → LEFT JOIN + IS NULL
-- 业务场景：查询没有订单的用户
-- 子查询写法
EXPLAIN SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders);
-- LEFT JOIN重写（推荐）
EXPLAIN SELECT u.* FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.id IS NULL;

-- 3. EXISTS子查询（适合子查询结果集大的情况）
-- 业务场景：查询有高额订单的用户
EXPLAIN SELECT * FROM users u WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.amount > 300
);

-- 4. 标量子查询优化
-- 业务场景：查询用户及其最大订单金额
-- 子查询写法（每行执行一次子查询）
EXPLAIN SELECT u.name, (SELECT MAX(amount) FROM orders WHERE user_id = u.id) AS max_amount FROM users u;
-- JOIN + GROUP BY重写（推荐）
EXPLAIN SELECT u.name, MAX(o.amount) AS max_amount FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id;

-- 5. 派生表优化
-- 业务场景：查询订单金额大于平均值的订单
-- 派生表写法
EXPLAIN SELECT * FROM orders WHERE amount > (SELECT AVG(amount) FROM orders);
-- 变量写法（避免重复计算）
EXPLAIN SELECT o.* FROM orders o, (SELECT AVG(amount) AS avg_amt FROM orders) t WHERE o.amount > t.avg_amt;
