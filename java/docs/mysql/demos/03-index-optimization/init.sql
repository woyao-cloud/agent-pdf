-- ============================================================
-- 第3章：索引优化实战
-- 业务场景：百万级用户表，对比不同索引策略的性能差异
-- 运行方式：docker compose up -d
-- ============================================================

-- 创建用户表（无索引版本，用于对比）
CREATE TABLE users_no_index (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    age INT,
    city VARCHAR(50),
    status TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建用户表（有索引版本）
CREATE TABLE users_with_index (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    age INT,
    city VARCHAR(50),
    status TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_city (city),
    INDEX idx_age (age),
    INDEX idx_status (status),
    INDEX idx_city_age (city, age),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 批量插入10万条测试数据
-- 使用存储过程生成数据
DELIMITER //
CREATE PROCEDURE generate_users()
BEGIN
    DECLARE i INT DEFAULT 1;
    DECLARE cities VARCHAR(200) DEFAULT 'Beijing,Shanghai,Shenzhen,Guangzhou,Hangzhou';
    DECLARE city VARCHAR(50);
    WHILE i <= 100000 DO
        SET city = ELT(1 + FLOOR(RAND() * 5), 'Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou', 'Hangzhou');
        INSERT INTO users_no_index (name, email, age, city, status, created_at)
        VALUES (
            CONCAT('user_', i),
            CONCAT('user_', i, '@email.com'),
            18 + FLOOR(RAND() * 50),
            city,
            FLOOR(RAND() * 2),
            DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 365) DAY)
        );
        INSERT INTO users_with_index (name, email, age, city, status, created_at)
        VALUES (
            CONCAT('user_', i),
            CONCAT('user_', i, '@email.com'),
            18 + FLOOR(RAND() * 50),
            city,
            FLOOR(RAND() * 2),
            DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 365) DAY)
        );
        SET i = i + 1;
    END WHILE;
END //
DELIMITER ;

CALL generate_users();

-- ============================================================
-- 性能对比：有索引 vs 无索引
-- ============================================================

-- 1. 等值查询对比
-- 业务场景：查询某个城市的用户
-- 无索引：全表扫描，扫描10万行
-- 有索引：索引查找，扫描约2万行（该城市的用户数）
SELECT COUNT(*) FROM users_no_index WHERE city = 'Beijing';
SELECT COUNT(*) FROM users_with_index WHERE city = 'Beijing';

-- 2. 范围查询对比
-- 业务场景：查询年龄在25-35之间的用户
SELECT COUNT(*) FROM users_no_index WHERE age BETWEEN 25 AND 35;
SELECT COUNT(*) FROM users_with_index WHERE age BETWEEN 25 AND 35;

-- 3. 排序查询对比
-- 业务场景：按创建时间排序查询最近注册的用户
-- 无索引：Using filesort
-- 有索引：Using index（索引本身就是有序的）
EXPLAIN SELECT * FROM users_no_index ORDER BY created_at DESC LIMIT 20;
EXPLAIN SELECT * FROM users_with_index ORDER BY created_at DESC LIMIT 20;

-- ============================================================
-- 联合索引最佳实践
-- ============================================================

-- 4. 联合索引全部列命中（最优）
-- 业务场景：查询北京地区25岁以上的用户
-- 执行预期：key=idx_city_age, key_len较大
EXPLAIN SELECT * FROM users_with_index WHERE city = 'Beijing' AND age > 25;

-- 5. 联合索引只命中第一列（可以使用索引）
-- 业务场景：只按城市查询
-- 执行预期：key=idx_city_age, key_len较小
EXPLAIN SELECT * FROM users_with_index WHERE city = 'Beijing';

-- 6. 联合索引跳过第一列（索引失效）
-- 业务场景：只按年龄查询
-- 执行预期：key=idx_age（使用单列索引）或 type=ALL
EXPLAIN SELECT * FROM users_with_index WHERE age > 25;

-- ============================================================
-- 覆盖索引
-- ============================================================

-- 7. 覆盖索引（不需要回表）
-- 业务场景：只查询索引中包含的列
-- 执行预期：Extra=Using index
EXPLAIN SELECT city, age FROM users_with_index WHERE city = 'Beijing';

-- 8. 非覆盖索引（需要回表）
-- 业务场景：查询的列不在索引中
-- 执行预期：Extra=Using where（需要回表取name、email等列）
EXPLAIN SELECT * FROM users_with_index WHERE city = 'Beijing';

-- ============================================================
-- 索引失效场景
-- ============================================================

-- 9. 函数操作导致索引失效
-- 错误写法：对索引列使用函数
EXPLAIN SELECT * FROM users_with_index WHERE YEAR(created_at) = 2024;
-- 正确写法：避免函数操作
EXPLAIN SELECT * FROM users_with_index WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';

-- 10. 隐式类型转换导致索引失效
-- 错误写法：字符串列与数字比较
EXPLAIN SELECT * FROM users_with_index WHERE city = 123;
-- 正确写法：保持类型一致
EXPLAIN SELECT * FROM users_with_index WHERE city = '123';

-- 11. OR条件导致索引失效
-- 错误写法：OR连接不同索引列
EXPLAIN SELECT * FROM users_with_index WHERE city = 'Beijing' OR age = 30;
-- 正确写法：使用UNION ALL
EXPLAIN SELECT * FROM users_with_index WHERE city = 'Beijing'
UNION ALL
SELECT * FROM users_with_index WHERE age = 30 AND city != 'Beijing';

-- 12. NOT IN / != 导致索引失效
-- 业务场景：排除某些状态
-- 如果status只有0和1，用IN比!=更好
EXPLAIN SELECT * FROM users_with_index WHERE status != 0;
EXPLAIN SELECT * FROM users_with_index WHERE status = 1;
