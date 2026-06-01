# 第6章 复杂查询与CTE

## 6.1 场景故事：一条SQL搞定公司组织树

### 业务需求

某公司的HR系统需要展示一个部门的完整组织架构树：从CEO到一线员工的所有层级关系。数据库中的组织表使用"父ID"方式存储：

```
departments表：
id  name          parent_id
1   总公司         null
2   技术部         1
3   产品部         1
4   后端组         2
5   前端组         2
6   电商产品组     3
```

在前端展示时，需要从任意部门出发，递归地查询其所有下级部门。用传统的逐层查询方式需要在Java中写循环：

```java
// ❌ 低效：逐层查询（N+1问题）
public List<Department> getChildDepartments(Long parentId) {
    List<Department> result = new ArrayList<>();
    List<Department> current = jdbcTemplate.query(
        "SELECT * FROM departments WHERE parent_id = ?", parentId);
    for (Department dept : current) {
        result.add(dept);
        result.addAll(getChildDepartments(dept.getId()));  // 递归查询！
    }
    return result;
}
```

这会导致N+1次数据库查询。如果组织树有10层，每个节点有3个子节点，总查询次数超过3万次。

PostgreSQL的递归CTE可以**一条SQL**解决这个问题，只查询一次数据库。

## 6.2 实现原理

### 递归CTE（WITH RECURSIVE）

递归CTE的语法包括两部分：**非递归项（基准查询）** 和**递归项（UNION ALL之后的查询）**。递归项通过引用CTE自身来实现循环：

```sql
-- 一条SQL查询出整个组织树
WITH RECURSIVE org_tree AS (
    -- 1. 非递归项：找到根节点
    SELECT id, name, parent_id, 1 AS level, ARRAY[id] AS path
    FROM departments
    WHERE parent_id IS NULL

    UNION ALL

    -- 2. 递归项：找到当前节点的子节点
    SELECT d.id, d.name, d.parent_id, t.level + 1, t.path || d.id
    FROM departments d
    INNER JOIN org_tree t ON d.parent_id = t.id
)
SELECT * FROM org_tree ORDER BY path;
```

输出：
```
id  name      parent_id  level  path
1   总公司    null       1      {1}
2   技术部    1          2      {1,2}
3   产品部    1          2      {1,3}
4   后端组    2          3      {1,2,4}
5   前端组    2          3      {1,2,5}
6   电商产品组 3         3      {1,3,6}
```

### 窗口函数

窗口函数在不改变行数的情况下对数据进行聚合计算。它本质上是在结果集的"窗口"内执行计算，每个窗口由PARTITION BY和ORDER BY定义：

```sql
-- 各品类销售额排名（ROW_NUMBER vs RANK vs DENSE_RANK）
SELECT
    category,
    product_name,
    sales_amount,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY sales_amount DESC) AS row_num,
    RANK()       OVER (PARTITION BY category ORDER BY sales_amount DESC) AS rank,
    DENSE_RANK() OVER (PARTITION BY category ORDER BY sales_amount DESC) AS dense_rank
FROM product_sales;
```

ROW_NUMBER、RANK和DENSE_RANK的区别：

```
数据：  (电子, 手机, 1000)  (电子, 电脑, 1000)  (电子, 耳机, 500)

ROW_NUMBER:  手机→1, 电脑→2, 耳机→3  （同值不同排名）
RANK:        手机→1, 电脑→1, 耳机→3  （同值同排名，有间隔）
DENSE_RANK:  手机→1, 电脑→1, 耳机→2  （同值同排名，无间隔）
```

### 窗口函数的更多应用

```sql
-- 环比计算（上个月的销售额）
SELECT
    month,
    sales_amount,
    LAG(sales_amount, 1) OVER (ORDER BY month) AS prev_month_sales,
    ROUND((sales_amount - LAG(sales_amount, 1) OVER (ORDER BY month))
        / LAG(sales_amount, 1) OVER (ORDER BY month) * 100, 2) AS growth_rate
FROM monthly_sales;

-- 移动平均（过去3个月的平均值）
SELECT
    month,
    sales_amount,
    AVG(sales_amount) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg_3m
FROM monthly_sales;

-- 分组内累计求和
SELECT
    department,
    employee_name,
    salary,
    SUM(salary) OVER (PARTITION BY department ORDER BY employee_name) AS running_total
FROM employees;
```

### GROUPING SETS

```sql
-- 一次性查询多个维度的汇总
SELECT
    COALESCE(category, '全部') AS category,
    COALESCE(region, '全部') AS region,
    SUM(sales_amount) AS total_sales
FROM sales
GROUP BY GROUPING SETS (
    (category, region),    -- 按品类+地区汇总
    (category),            -- 仅按品类汇总
    (region),              -- 仅按地区汇总
    ()                     -- 全部汇总
);
```

## 6.3 使用场景

| 场景 | 技术 | 示例 |
|------|------|------|
| 组织树/分类树 | 递归CTE | 部门层级、商品分类 |
| 排行榜 | ROW_NUMBER/RANK | 销售额排名 |
| 同比/环比 | LAG/LEAD | 增长率计算 |
| 累计值 | SUM OVER | 累计销售额 |
| 分组汇总 | GROUPING SETS | 多维报表 |
| 图/路径搜索 | 递归CTE | 地铁换乘路线 |

## 6.4 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 递归死循环 | 数据中存在环（如A的父ID是B，B的父ID是A） | 限制递归深度，或检测循环 |
| 内存消耗 | 窗口函数所有数据在内存中排序 | 确保排序字段有索引 |
| 性能陷阱 | 递归CTE每次迭代都扫描全表 | 为parent_id建立索引 |
| 嵌套过多 | 递归层数过多 | 设置max_recursive_iterations |

## 6.5 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: query_demo
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-query.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-query.sql
CREATE TABLE departments (
    id serial PRIMARY KEY,
    name varchar(100) NOT NULL,
    parent_id int REFERENCES departments(id)
);

INSERT INTO departments (id, name, parent_id) VALUES
    (1, '总公司', null),
    (2, '技术部', 1),
    (3, '产品部', 1),
    (4, '后端组', 2),
    (5, '前端组', 2),
    (6, '电商产品组', 3),
    (7, '基础架构组', 2);

CREATE INDEX idx_dept_parent ON departments(parent_id);

CREATE TABLE sales (
    id serial PRIMARY KEY,
    category varchar(50),
    region varchar(50),
    amount numeric(10,2),
    sale_date date
);

INSERT INTO sales (category, region, amount, sale_date) VALUES
    ('电子产品', '华东', 10000, '2024-01-01'),
    ('电子产品', '华北', 8000, '2024-01-01'),
    ('服装', '华东', 5000, '2024-01-01'),
    ('电子产品', '华东', 12000, '2024-02-01'),
    ('服装', '华北', 6000, '2024-02-01');
```

测试查询：
```bash
docker exec -it postgres psql -U postgres -d query_demo

# 测试递归CTE
WITH RECURSIVE org_tree AS (
    SELECT id, name, parent_id, 1 AS level FROM departments WHERE parent_id IS NULL
    UNION ALL
    SELECT d.id, d.name, d.parent_id, t.level + 1
    FROM departments d INNER JOIN org_tree t ON d.parent_id = t.id
)
SELECT * FROM org_tree ORDER BY level, id;
```