-- ============================================================
-- 第10章：表结构设计优化
-- 业务场景：字段类型选择、范式vs反范式、大字段处理
-- ============================================================

-- 1. 字段类型选择对比
-- 错误设计：用VARCHAR存数字
CREATE TABLE bad_design (
    id VARCHAR(32) PRIMARY KEY,     -- ❌ 用VARCHAR做主键，占用空间大，比较慢
    age VARCHAR(10),                -- ❌ 用VARCHAR存年龄
    amount VARCHAR(20),             -- ❌ 用VARCHAR存金额
    is_active VARCHAR(5),           -- ❌ 用VARCHAR存布尔值
    created_at VARCHAR(30)          -- ❌ 用VARCHAR存时间
) ENGINE=InnoDB;

-- 正确设计：选择合适的类型
CREATE TABLE good_design (
    id INT PRIMARY KEY AUTO_INCREMENT,  -- ✅ INT自增主键，紧凑高效
    age TINYINT UNSIGNED,               -- ✅ TINYINT存年龄(0-255)
    amount DECIMAL(10,2),               -- ✅ DECIMAL存金额，精确
    is_active TINYINT(1) DEFAULT 1,     -- ✅ TINYINT存布尔值
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- ✅ TIMESTAMP存时间
) ENGINE=InnoDB;

-- ============================================================
-- 2. 范式 vs 反范式
-- ============================================================

-- 范式设计（减少冗余，但需要JOIN）
CREATE TABLE users_norm (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50),
    city_id INT
);
CREATE TABLE cities (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50)
);
-- 查询需要JOIN
-- SELECT u.name, c.name FROM users_norm u JOIN cities c ON u.city_id = c.id;

-- 反范式设计（冗余存储，但查询快）
CREATE TABLE users_denorm (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50),
    city_name VARCHAR(50)  -- 直接存城市名，不需要JOIN
);
-- 查询不需要JOIN
-- SELECT name, city_name FROM users_denorm;

-- ============================================================
-- 3. 大字段处理
-- ============================================================

CREATE TABLE articles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(500),           -- 摘要，用于列表展示
    content TEXT,                   -- 正文，只在详情页读取
    author VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- 优化策略：
-- 1. 列表查询只查必要字段，避免读取TEXT
-- SELECT id, title, summary, author FROM articles ORDER BY created_at DESC LIMIT 20;
-- 2. 详情查询才读取TEXT
-- SELECT * FROM articles WHERE id = 1;

-- ============================================================
-- 4. 字段类型选择指南
-- ============================================================

-- 整数类型选择：
-- TINYINT:  0-255 (年龄、状态)
-- SMALLINT: 0-65535 (数量)
-- INT:      0-43亿 (用户ID、订单ID)
-- BIGINT:   更大范围 (分布式ID)

-- 字符串类型选择：
-- CHAR(N):    固定长度，适合短且长度固定的字段（如MD5、手机号）
-- VARCHAR(N): 可变长度，适合长度不固定的字段（如姓名、邮箱）
-- TEXT:       大文本，适合文章内容、JSON数据

-- 时间类型选择：
-- DATE:      日期 (2024-01-15)
-- TIME:      时间 (10:30:00)
-- DATETIME:  日期时间 (2024-01-15 10:30:00)，范围1000-9999年
-- TIMESTAMP: 时间戳 (2024-01-15 10:30:00)，范围1970-2038年，自动时区转换
