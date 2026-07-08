-- ============================================================
-- 第9章：事务与锁优化
-- 业务场景：死锁模拟、锁等待诊断、事务隔离级别对比
-- ============================================================

CREATE TABLE accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    INDEX idx_name (name)
) ENGINE=InnoDB;

CREATE TABLE transfer_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    from_account INT,
    to_account INT,
    amount DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO accounts (name, balance) VALUES
('Alice', 10000.00),
('Bob', 5000.00),
('Charlie', 8000.00);

-- ============================================================
-- 事务隔离级别
-- ============================================================

-- 查看当前隔离级别
SELECT @@transaction_isolation;

-- 设置隔离级别（会话级别）
-- SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- ============================================================
-- 死锁模拟（需要两个会话同时执行）
-- ============================================================

-- 会话1：先锁Alice，再锁Bob
-- START TRANSACTION;
-- UPDATE accounts SET balance = balance - 100 WHERE name = 'Alice';
-- -- 等待几秒
-- UPDATE accounts SET balance = balance + 100 WHERE name = 'Bob';
-- COMMIT;

-- 会话2：先锁Bob，再锁Alice（与会话1顺序相反，导致死锁）
-- START TRANSACTION;
-- UPDATE accounts SET balance = balance - 100 WHERE name = 'Bob';
-- -- 等待几秒
-- UPDATE accounts SET balance = balance + 100 WHERE name = 'Alice';
-- COMMIT;

-- ============================================================
-- 死锁诊断
-- ============================================================

-- 查看最近死锁信息
-- SHOW ENGINE INNODB STATUS\G

-- 查看当前事务
-- SELECT * FROM information_schema.INNODB_TRX\G

-- 查看当前锁等待
-- SELECT * FROM information_schema.INNODB_LOCK_WAITS\G

-- ============================================================
-- 锁优化策略
-- ============================================================

-- 1. 按固定顺序访问资源（避免死锁）
-- 正确：始终按ID升序更新
START TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- Alice
UPDATE accounts SET balance = balance + 100 WHERE id = 2;  -- Bob
COMMIT;

-- 2. 缩短事务时间
-- 错误：事务中包含耗时操作
-- START TRANSACTION;
-- UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- -- 不要在事务中调用外部API或执行耗时计算
-- COMMIT;

-- 3. 使用合适的事务隔离级别
-- READ COMMITTED：减少间隙锁，降低死锁概率
-- REPEATABLE READ：默认级别，一致性更好但锁更多

-- 4. 合理使用索引避免间隙锁范围过大
-- 没有索引时，UPDATE会锁全表
-- 有索引时，只锁匹配的行
EXPLAIN UPDATE accounts SET balance = balance - 100 WHERE name = 'Alice';
