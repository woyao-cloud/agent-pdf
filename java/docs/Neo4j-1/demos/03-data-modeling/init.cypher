// ============================================================
// 第3章：数据建模 — 电商系统图模型
// 展示常见建模模式：星型、树型、多对多、时间线
//
// 业务场景：一个电商平台需要管理用户、商品、分类、订单等数据。
// 这些数据之间天然是"图"结构——用户下单购买商品，商品属于分类，
// 订单有状态流转。用图数据库建模比关系型数据库更直观。
//
// 运行方式：
//   docker exec -it neo4j-modeling cypher-shell -u neo4j -p password123 -f /init.cypher
// 然后打开 http://localhost:7476 在 Browser 中执行查询
// ============================================================

MATCH (n) DETACH DELETE n;

// ============================================================
// 1. 星型模式：用户为中心，辐射订单、地址、购物车
//
// 💡 适用场景：一个中心实体关联多个外围实体
// 类比：太阳系——太阳（用户）周围有多个行星（地址、订单）
// ============================================================

// 创建用户节点
// 业务场景：用户注册时创建，userId 作为唯一标识
CREATE (u1:User {userId: "U001", name: "张三", email: "zhangsan@email.com", registeredAt: datetime("2024-01-15")});
CREATE (u2:User {userId: "U002", name: "李四", email: "lisi@email.com", registeredAt: datetime("2024-03-20")});
CREATE (u3:User {userId: "U003", name: "王五", email: "wangwu@email.com", registeredAt: datetime("2024-06-01")});

// 创建地址节点
// 业务场景：用户可以有多个地址（家、公司），通过关系属性区分类型
CREATE (addr1:Address {addressId: "A001", street: "朝阳区建国路88号", city: "北京", zip: "100022"});
CREATE (addr2:Address {addressId: "A002", street: "浦东新区陆家嘴环路1000号", city: "上海", zip: "200120"});
CREATE (addr3:Address {addressId: "A003", street: "南山区科技园南路1号", city: "深圳", zip: "518057"});

// 创建用户-地址关系
// 业务场景：用户设置收货地址，可以设置默认地址
// 关系属性 type 区分"家"和"公司"，isDefault 标记默认地址
CREATE (u1)-[:HAS_ADDRESS {type: "home", isDefault: true}]->(addr1);
CREATE (u1)-[:HAS_ADDRESS {type: "work", isDefault: false}]->(addr2);
CREATE (u2)-[:HAS_ADDRESS {type: "home", isDefault: true}]->(addr2);
CREATE (u3)-[:HAS_ADDRESS {type: "home", isDefault: true}]->(addr3);

// ============================================================
// 2. 树型模式：商品分类层级
// ============================================================

CREATE (catElectronics:Category {categoryId: "C001", name: "电子产品"});
CREATE (catPhone:Category {categoryId: "C002", name: "手机"});
CREATE (catLaptop:Category {categoryId: "C003", name: "笔记本电脑"});
CREATE (catAccessory:Category {categoryId: "C004", name: "配件"});
CREATE (catClothing:Category {categoryId: "C005", name: "服装"});
CREATE (catMen:Category {categoryId: "C006", name: "男装"});
CREATE (catWomen:Category {categoryId: "C007", name: "女装"});

// 构建分类树
CREATE (catPhone)-[:BELONGS_TO]->(catElectronics);
CREATE (catLaptop)-[:BELONGS_TO]->(catElectronics);
CREATE (catAccessory)-[:BELONGS_TO]->(catElectronics);
CREATE (catMen)-[:BELONGS_TO]->(catClothing);
CREATE (catWomen)-[:BELONGS_TO]->(catClothing);

// ============================================================
// 3. 商品节点（多对多：商品 ↔ 分类）
// ============================================================

CREATE (p1:Product {productId: "P001", name: "iPhone 15 Pro", price: 8999, stock: 100});
CREATE (p2:Product {productId: "P002", name: "MacBook Air M3", price: 10999, stock: 50});
CREATE (p3:Product {productId: "P003", name: "AirPods Pro 2", price: 1899, stock: 200});
CREATE (p4:Product {productId: "P004", name: "纯棉T恤", price: 199, stock: 500});
CREATE (p5:Product {productId: "P005", name: "连衣裙", price: 399, stock: 300});

// 商品-分类关联（多对多）
CREATE (p1)-[:CATEGORIZED_AS]->(catPhone);
CREATE (p2)-[:CATEGORIZED_AS]->(catLaptop);
CREATE (p3)-[:CATEGORIZED_AS]->(catAccessory);
CREATE (p4)-[:CATEGORIZED_AS]->(catMen);
CREATE (p5)-[:CATEGORIZED_AS]->(catWomen);

// ============================================================
// 4. 时间线模式：订单 → 支付 → 发货 → 完成
// ============================================================

// 订单1
CREATE (o1:Order {orderId: "ORD001", totalAmount: 10898, status: "completed", createdAt: datetime("2024-06-15T10:30:00")});
CREATE (o1)-[:PLACED_BY]->(u1);
CREATE (o1)-[:SHIP_TO]->(addr1);
CREATE (o1)-[:INCLUDES {quantity: 1, unitPrice: 8999}]->(p1);
CREATE (o1)-[:INCLUDES {quantity: 1, unitPrice: 1899}]->(p3);

// 订单状态时间线
CREATE (ev1:Event {eventId: "E001", type: "payment", timestamp: datetime("2024-06-15T10:31:00"), detail: "支付宝支付成功"});
CREATE (ev2:Event {eventId: "E002", type: "shipment", timestamp: datetime("2024-06-15T14:00:00"), detail: "已发货，顺丰快递SF123456"});
CREATE (ev3:Event {eventId: "E003", type: "delivery", timestamp: datetime("2024-06-17T09:30:00"), detail: "已签收"});

CREATE (o1)-[:HAS_EVENT]->(ev1);
CREATE (ev1)-[:NEXT]->(ev2);
CREATE (ev2)-[:NEXT]->(ev3);

// 订单2
CREATE (o2:Order {orderId: "ORD002", totalAmount: 199, status: "pending", createdAt: datetime("2024-07-01T15:00:00")});
CREATE (o2)-[:PLACED_BY]->(u2);
CREATE (o2)-[:SHIP_TO]->(addr2);
CREATE (o2)-[:INCLUDES {quantity: 1, unitPrice: 199}]->(p4);

// ============================================================
// 5. 建模查询示例
// ============================================================

// 5.1 查询用户的所有地址
// MATCH (u:User {name: "张三"})-[:HAS_ADDRESS]->(a:Address)
// RETURN u.name, a.street, a.city;

// 5.2 查询分类树（从根到叶）
// MATCH (child:Category)-[:BELONGS_TO*]->(root:Category)
// WHERE NOT EXISTS { (root)-[:BELONGS_TO]->() }
// RETURN root.name AS root_category, collect(child.name) AS sub_categories;

// 5.3 查询用户的订单详情
// MATCH (u:User {name: "张三"})<-[:PLACED_BY]-(o:Order)-[:INCLUDES]->(p:Product)
// RETURN o.orderId, o.totalAmount, o.status, p.name, o["INCLUDES"].quantity AS qty;

// 5.4 查询订单状态时间线
// MATCH (o:Order {orderId: "ORD001"})-[:HAS_EVENT]->(e:Event)
// OPTIONAL MATCH path = (e)-[:NEXT*]->(next:Event)
// RETURN o.orderId, e.type, e.timestamp, e.detail
// ORDER BY e.timestamp;

// 5.5 查询某个分类下的所有商品（含子分类）
// MATCH (cat:Category {name: "电子产品"})<-[:BELONGS_TO*]-(sub:Category)
// MATCH (sub)<-[:CATEGORIZED_AS]-(p:Product)
// RETURN DISTINCT p.name, p.price;

// 5.6 统计每个分类的商品数量
// MATCH (c:Category)<-[:CATEGORIZED_AS]-(p:Product)
// RETURN c.name AS category, count(p) AS product_count
// ORDER BY product_count DESC;

// 5.7 查询用户行为路径（浏览→加购→下单）
// MATCH (u:User {name: "张三"})<-[:PLACED_BY]-(o:Order)
// MATCH (o)-[:INCLUDES]->(p:Product)
// RETURN u.name, o.orderId, collect(p.name) AS products, o.status;
