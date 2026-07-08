-- ============================================================
-- 第8章：分页优化
-- 业务场景：深分页性能问题，延迟关联、游标分页、子查询分页
-- ============================================================

CREATE TABLE articles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    author VARCHAR(50),
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at),
    INDEX idx_category (category),
    INDEX idx_author (author)
) ENGINE=InnoDB;

-- 批量插入10万条测试数据
DELIMITER //
CREATE PROCEDURE generate_articles()
BEGIN
    DECLARE i INT DEFAULT 1;
    WHILE i <= 100000 DO
        INSERT INTO articles (title, content, author, category, created_at)
        VALUES (
            CONCAT('Article ', i),
            CONCAT('Content for article ', i, ' with some text...'),
            CONCAT('author_', FLOOR(1 + RAND() * 100)),
            ELT(1 + FLOOR(RAND() * 4), 'Tech', 'Life', 'Science', 'Business'),
            DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 365) DAY)
        );
        SET i = i + 1;
    END WHILE;
END //
DELIMITER ;

CALL generate_articles();

-- ============================================================
-- 分页性能对比
-- ============================================================

-- 1. 原始分页（深分页性能差）
-- 业务场景：翻到第5000页，每页20条
-- 问题：需要扫描100000行，丢弃前99980行
-- 执行预期：扫描10万行，耗时约0.5-1秒
EXPLAIN SELECT * FROM articles ORDER BY id LIMIT 99980, 20;

-- 2. 延迟关联（推荐）
-- 业务场景：先查ID（覆盖索引），再关联取完整数据
-- 优势：子查询只扫描索引，不读取完整行
-- 执行预期：子查询扫描10万行索引，外层关联20行
EXPLAIN SELECT a.* FROM articles a
JOIN (SELECT id FROM articles ORDER BY id LIMIT 99980, 20) t
ON a.id = t.id;

-- 3. 游标分页（最优，但需要业务配合）
-- 业务场景：用上一页最后一条的ID作为起点
-- 优势：始终只扫描20行
-- 限制：只能顺序翻页，不能跳页
EXPLAIN SELECT * FROM articles WHERE id > 99980 ORDER BY id LIMIT 20;

-- 4. 子查询分页
-- 业务场景：用子查询定位起始ID
EXPLAIN SELECT * FROM articles WHERE id >= (
    SELECT id FROM articles ORDER BY id LIMIT 99980, 1
) ORDER BY id LIMIT 20;

-- ============================================================
-- 分页方案对比
-- ============================================================

-- 方案对比（10万条数据，翻到第5000页）：
-- 原始分页：扫描100000行，耗时~500ms
-- 延迟关联：扫描100000行索引+20行数据，耗时~50ms
-- 游标分页：扫描20行，耗时~1ms
-- 子查询分页：扫描100000行索引+20行数据，耗时~50ms
