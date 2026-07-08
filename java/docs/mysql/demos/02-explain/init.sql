-- ============================================================
-- 第2章：执行计划解读(EXPLAIN)
-- 业务场景：学会用EXPLAIN诊断查询性能，理解每个字段的含义
-- 运行方式：docker compose up -d
-- ============================================================

-- 创建测试表（带不同索引）
CREATE TABLE employees (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    department VARCHAR(50),
    salary DECIMAL(10,2),
    hire_date DATE,
    status TINYINT DEFAULT 1,
    INDEX idx_department (department),
    INDEX idx_salary (salary),
    INDEX idx_hire_date (hire_date),
    INDEX idx_dept_salary (department, salary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE departments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) UNIQUE NOT NULL,
    manager VARCHAR(50),
    budget DECIMAL(12,2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入测试数据
INSERT INTO departments (name, manager, budget) VALUES
('Engineering', 'Alice', 1000000.00),
('Sales', 'Bob', 500000.00),
('Marketing', 'Charlie', 300000.00),
('HR', 'Diana', 200000.00);

-- 批量插入员工数据
INSERT INTO employees (name, department, salary, hire_date, status) VALUES
('张三', 'Engineering', 15000.00, '2020-01-15', 1),
('李四', 'Engineering', 18000.00, '2019-03-20', 1),
('王五', 'Engineering', 12000.00, '2021-06-01', 1),
('赵六', 'Sales', 13000.00, '2020-08-10', 1),
('孙七', 'Sales', 11000.00, '2021-11-15', 0),
('周八', 'Marketing', 14000.00, '2019-05-20', 1),
('吴九', 'Marketing', 10000.00, '2022-01-10', 1),
('郑十', 'HR', 9000.00, '2021-03-01', 1),
('王十一', 'Engineering', 20000.00, '2018-07-01', 1),
('李十二', 'Sales', 16000.00, '2020-12-01', 1);

-- ============================================================
-- EXPLAIN 字段详解
-- ============================================================

-- 1. type = const（主键或唯一索引等值查询，最优）
-- 业务场景：通过主键查询单条记录
-- 执行预期：type=const, rows=1
EXPLAIN SELECT * FROM employees WHERE id = 1;

-- 2. type = eq_ref（JOIN时使用主键或唯一索引，第二优）
-- 业务场景：JOIN查询中，被驱动表使用主键关联
-- 执行预期：departments表type=eq_ref
EXPLAIN SELECT e.name, d.name AS dept
FROM employees e
JOIN departments d ON e.department = d.name;

-- 3. type = ref（非唯一索引等值查询）
-- 业务场景：通过普通索引查询
-- 执行预期：type=ref, key=idx_department
EXPLAIN SELECT * FROM employees WHERE department = 'Engineering';

-- 4. type = range（索引范围扫描）
-- 业务场景：范围查询（>、<、BETWEEN、IN）
-- 执行预期：type=range, key=idx_salary
EXPLAIN SELECT * FROM employees WHERE salary BETWEEN 10000 AND 15000;

-- 5. type = index（全索引扫描，比ALL好但不如range）
-- 业务场景：查询的列都在索引中，但需要扫描整个索引
-- 执行预期：type=index, Extra=Using index
EXPLAIN SELECT department, salary FROM employees ORDER BY department;

-- 6. type = ALL（全表扫描，最差）
-- 业务场景：没有可用索引，或查询条件无法使用索引
-- 执行预期：type=ALL, rows=10
EXPLAIN SELECT * FROM employees WHERE name = '张三';

-- ============================================================
-- Extra 字段关键信息
-- ============================================================

-- 7. Using index（覆盖索引，最优）
-- 业务场景：查询的列都在索引中，不需要回表
-- 执行预期：Extra=Using index
EXPLAIN SELECT department, salary FROM employees WHERE department = 'Engineering';

-- 8. Using where（需要回表过滤）
-- 业务场景：索引不能完全覆盖WHERE条件
-- 执行预期：Extra=Using where
EXPLAIN SELECT * FROM employees WHERE department = 'Engineering' AND name = '张三';

-- 9. Using filesort（需要额外排序，需要优化）
-- 业务场景：ORDER BY的列没有索引
-- 执行预期：Extra=Using filesort
EXPLAIN SELECT * FROM employees ORDER BY name;

-- 10. Using temporary（需要临时表，需要优化）
-- 业务场景：GROUP BY和ORDER BY的列不同
-- 执行预期：Extra=Using temporary; Using filesort
EXPLAIN SELECT department, COUNT(*) FROM employees GROUP BY department ORDER BY COUNT(*);

-- ============================================================
-- 联合索引与最左前缀
-- ============================================================

-- 11. 使用联合索引的全部列（最优）
-- 业务场景：WHERE条件包含联合索引的全部列
-- 执行预期：key=idx_dept_salary, key_len较大
EXPLAIN SELECT * FROM employees WHERE department = 'Engineering' AND salary > 15000;

-- 12. 只使用联合索引的第一列（可以使用索引）
-- 业务场景：WHERE条件只包含联合索引的第一列
-- 执行预期：key=idx_dept_salary, key_len较小
EXPLAIN SELECT * FROM employees WHERE department = 'Engineering';

-- 13. 跳过第一列使用第二列（无法使用索引）
-- 业务场景：WHERE条件只包含联合索引的第二列
-- 执行预期：type=ALL（全表扫描）
EXPLAIN SELECT * FROM employees WHERE salary > 15000;

-- ============================================================
-- 索引失效场景
-- ============================================================

-- 14. 函数操作导致索引失效
-- 业务场景：对索引列使用函数
-- 执行预期：type=ALL（索引失效）
EXPLAIN SELECT * FROM employees WHERE YEAR(hire_date) = 2020;

-- 15. 隐式类型转换导致索引失效
-- 业务场景：字符串列与数字比较
-- 执行预期：type=ALL（索引失效）
EXPLAIN SELECT * FROM employees WHERE department = 123;

-- 16. LIKE前置通配符导致索引失效
-- 业务场景：模糊搜索以通配符开头
-- 执行预期：type=ALL
EXPLAIN SELECT * FROM employees WHERE name LIKE '%三';
