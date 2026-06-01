# 第10章 地理空间（PostGIS）

## 10.1 场景故事：附近的人与外卖配送范围

### 业务需求

外卖APP需要实现"附近5公里内的商家"功能，地图上显示用户周围的外卖店铺，并按距离排序。如果在MySQL中实现，通常的解决方案是计算经纬度差值来估算距离：

```sql
-- MySQL的近似方法（不准确，且无法使用索引）
SELECT *, 
    (6371 * acos(cos(radians(:lat)) * cos(radians(latitude)) 
    * cos(radians(longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(latitude)))) 
    AS distance
FROM shops
HAVING distance < 5
ORDER BY distance;
```

这条查询的问题是：它必须为每条数据都执行一次三角函数计算，且`HAVING distance < 5`无法使用索引，每查询一次就是全表扫描。

PostGIS使用空间索引（GiST）和空间函数解决了这个问题——查询速度与数据量无关，只与查询范围有关。

---

## 10.2 实现原理

### PostGIS的核心概念

PostGIS是PostgreSQL最著名的扩展，它将PostgreSQL变成了一个专业级的地理空间数据库，遵循OpenGIS标准。

**空间数据类型**：
```sql
-- GEOMETRY：平面坐标系（笛卡尔坐标）
-- GEOGRAPHY：球面坐标系（WGS84 GPS坐标，精确度更高但计算略慢）

-- 点（经纬度）
ST_GeomFromText('POINT(116.4074 39.9042)', 4326)  -- 北京天安门

-- 线（路径、道路）
ST_GeomFromText('LINESTRING(0 0, 1 1, 2 0)', 4326)

-- 面（区域、范围）
ST_GeomFromText('POLYGON((0 0, 0 10, 10 10, 10 0, 0 0))', 4326)
```

其中4326是**SRID**（空间参考标识符），代表WGS84坐标系——也就是GPS使用的经纬度坐标系。

### 空间函数

```sql
-- 1. 计算两点之间的距离
SELECT ST_Distance(
    ST_GeomFromText('POINT(116.4074 39.9042)', 4326),  -- 北京
    ST_GeomFromText('POINT(121.4737 31.2304)', 4326)   -- 上海
);
-- 结果：约1068公里（球面距离）

-- 2. 查找范围内的点（附近的人）
SELECT name, address
FROM shops
WHERE ST_DWithin(
    geom,
    ST_GeomFromText('POINT(116.4074 39.9042)', 4326),
    5000     -- 5公里
);

-- 3. 计算面积
SELECT ST_Area(ST_GeomFromText('POLYGON((0 0, 0 10, 10 10, 10 0, 0 0))', 4326)::geography);

-- 4. 缓冲区（以某点为中心画圆）
SELECT ST_Buffer(ST_GeomFromText('POINT(116.4074 39.9042)', 4326), 0.05);
```

### 空间索引

GiST索引是PostGIS查询性能的关键：

```sql
-- 创建空间索引
CREATE INDEX idx_shops_geom ON shops USING gist(geom);

-- 使用空间索引的查询会自动走索引
EXPLAIN SELECT * FROM shops
WHERE ST_DWithin(geom, ST_GeomFromText('POINT(116.4 39.9)', 4326), 5000);
-- 查询计划：Bitmap Index Scan on idx_shops_geom
```

---

## 10.3 使用场景

| 场景 | PostGIS函数 | 示例 |
|------|------------|------|
| 附近查询 | ST_DWithin | 附近5公里的商家 |
| 距离排序 | ST_Distance | 按距离排序 |
| 区域判定 | ST_Contains | 判断点是否在配送范围内 |
| 轨迹回放 | ST_MakeLine | 用户骑行轨迹 |
| 区域统计 | ST_Intersects | 统计某区域内的店铺数 |
| GeoJSON输出 | ST_AsGeoJSON | 地图可视化 |

---

## 10.4 潜在风险

| 风险 | 说明 | 优化方案 |
|------|------|---------|
| 坐标系混淆 | 使用GEOMETRY但不小心混用不同SRID | 统一使用GEOGRAPHY类型 |
| 索引构建慢 | 海量数据的空间索引构建耗时 | 先导入数据，后创建索引 |
| 精度问题 | GEOGRAPHY计算比GEOMETRY慢但更精确 | 短距离（<100km）用GEOMETRY，长距离用GEOGRAPHY |
| 数据量 | 超大规模空间数据的查询性能下降 | 结合分表分区策略 |

---

## 10.5 Java示例

```java
// pom.xml 依赖
// <dependency>
//     <groupId>org.hibernate.orm</groupId>
//     <artifactId>hibernate-spatial</artifactId>
// </dependency>
// <dependency>
//     <groupId>net.postgis</groupId>
//     <artifactId>postgis-jdbc</artifactId>
//     <version>2023.1.0</version>
// </dependency>

@Entity
@Table(name = "shops")
public class Shop {
    @Id
    private Long id;
    
    private String name;
    
    @Column(columnDefinition = "geometry(Point, 4326)")
    private Point location;  // Hibernate Spatial类型
    
    @Query("SELECT s, ST_Distance(s.location, :point) as distance FROM Shop s " +
           "WHERE ST_DWithin(s.location, :point, :radius) = true " +
           "ORDER BY distance")
    List<Object[]> findNearbyShops(@Param("point") Point point, 
                                   @Param("radius") double radius);
}
```

---

## 10.6 Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgis/postgis:16-3.4
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: gis_demo
      POSTGRES_PASSWORD: test
    volumes:
      - ./init-gis.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init-gis.sql
CREATE EXTENSION postgis;

CREATE TABLE shops (
    id serial PRIMARY KEY,
    name varchar(200) NOT NULL,
    address text,
    geom geography(Point, 4326)  -- 使用GEOGRAPHY获得球面精确计算
);

INSERT INTO shops (name, address, geom) VALUES
    ('麦当劳（朝阳店）', '北京市朝阳区建国路88号', 
     ST_GeogFromText('SRID=4326;POINT(116.4603 39.9087)')),
    ('肯德基（海淀店）', '北京市海淀区中关村大街1号',
     ST_GeogFromText('SRID=4326;POINT(116.3103 39.9929)')),
    ('星巴克（国贸店）', '北京市朝阳区建国门外大街1号',
     ST_GeogFromText('SRID=4326;POINT(116.4600 39.9090)'));

CREATE INDEX idx_shops_geom ON shops USING gist(geom);

-- 测试：查找天安门附近5公里的商家
SELECT name, address,
    ST_Distance(geom, ST_GeogFromText('SRID=4326;POINT(116.3974 39.9087)')) AS distance_m
FROM shops
WHERE ST_DWithin(geom, ST_GeogFromText('SRID=4326;POINT(116.3974 39.9087)'), 5000)
ORDER BY distance_m;
```