# ============================================================
# Python Flask 应用集成 Neo4j
# 展示：连接管理、CRUD操作、事务处理、推荐查询
# ============================================================

from flask import Flask, jsonify, request
from neo4j import GraphDatabase
import os

app = Flask(__name__)

# Neo4j 连接配置
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password123")


class Neo4jConnection:
    """Neo4j 连接管理器"""

    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def query(self, cypher, parameters=None):
        """执行查询并返回结果"""
        with self.driver.session() as session:
            result = session.run(cypher, parameters or {})
            return [record.data() for record in result]

    def execute_transaction(self, cypher, parameters=None):
        """在事务中执行写入操作"""
        with self.driver.session() as session:
            result = session.execute_write(
                lambda tx: tx.run(cypher, parameters or {}).data()
            )
            return result


# 全局连接实例
db = Neo4jConnection(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)


# ============================================================
# API 路由
# ============================================================

@app.route("/")
def index():
    return jsonify({
        "service": "Neo4j 电商 API",
        "version": "1.0",
        "endpoints": {
            "GET /users": "获取所有用户",
            "GET /users/<user_id>": "获取用户详情",
            "GET /users/<user_id>/orders": "获取用户订单",
            "GET /users/<user_id>/recommendations": "获取商品推荐",
            "GET /products": "获取所有商品",
            "GET /products/<product_id>": "获取商品详情",
            "POST /orders": "创建订单",
            "GET /stats": "获取统计信息"
        }
    })


# ============================================================
# 用户相关 API
# ============================================================

@app.route("/users", methods=["GET"])
def get_users():
    """获取所有用户"""
    cypher = """
    MATCH (u:User)
    RETURN u.userId AS userId, u.name AS name, u.email AS email, u.age AS age
    ORDER BY u.name
    """
    users = db.query(cypher)
    return jsonify({"users": users, "count": len(users)})


@app.route("/users/<user_id>", methods=["GET"])
def get_user(user_id):
    """获取用户详情，包括地址和订单"""
    cypher = """
    MATCH (u:User {userId: $userId})
    OPTIONAL MATCH (u)-[:PLACED]->(o:Order)
    RETURN u.userId AS userId, u.name AS name, u.email AS email, u.age AS age,
           collect(DISTINCT {orderId: o.orderId, status: o.status, totalAmount: o.totalAmount}) AS orders
    """
    result = db.query(cypher, {"userId": user_id})
    if not result:
        return jsonify({"error": "用户不存在"}), 404
    return jsonify(result[0])


@app.route("/users/<user_id>/orders", methods=["GET"])
def get_user_orders(user_id):
    """获取用户的所有订单及商品详情"""
    cypher = """
    MATCH (u:User {userId: $userId})<-[:PLACED]-(o:Order)-[:INCLUDES]->(p:Product)
    RETURN o.orderId AS orderId, o.totalAmount AS totalAmount,
           o.status AS status, o.createdAt AS createdAt,
           collect({name: p.name, price: p.price, qty: o.INCLUDES.qty}) AS products
    ORDER BY o.createdAt DESC
    """
    orders = db.query(cypher, {"userId": user_id})
    return jsonify({"userId": user_id, "orders": orders})


# ============================================================
# 商品相关 API
# ============================================================

@app.route("/products", methods=["GET"])
def get_products():
    """获取所有商品"""
    category = request.args.get("category")
    if category:
        cypher = """
        MATCH (p:Product {category: $category})
        RETURN p.productId AS productId, p.name AS name,
               p.price AS price, p.category AS category
        ORDER BY p.price
        """
        products = db.query(cypher, {"category": category})
    else:
        cypher = """
        MATCH (p:Product)
        RETURN p.productId AS productId, p.name AS name,
               p.price AS price, p.category AS category
        ORDER BY p.category, p.price
        """
        products = db.query(cypher)
    return jsonify({"products": products, "count": len(products)})


@app.route("/products/<product_id>", methods=["GET"])
def get_product(product_id):
    """获取商品详情及购买用户"""
    cypher = """
    MATCH (p:Product {productId: $productId})
    OPTIONAL MATCH (p)<-[:INCLUDES]-(o:Order)<-[:PLACED]-(u:User)
    RETURN p.productId AS productId, p.name AS name, p.price AS price,
           p.category AS category,
           collect(DISTINCT {userId: u.userId, name: u.name}) AS buyers
    """
    result = db.query(cypher, {"productId": product_id})
    if not result:
        return jsonify({"error": "商品不存在"}), 404
    return jsonify(result[0])


# ============================================================
# 推荐系统 API（基于图分析）
# ============================================================

@app.route("/users/<user_id>/recommendations", methods=["GET"])
def get_recommendations(user_id):
    """
    基于图算法的商品推荐：
    1. 购买了相同商品的用户还买了什么
    2. 同分类下的热门商品
    """
    cypher = """
    // 协同过滤推荐：买了相同商品的人还买了什么
    MATCH (target:User {userId: $userId})-[:PLACED]->(:Order)-[:INCLUDES]->(bought:Product)
    MATCH (bought)<-[:INCLUDES]-(:Order)<-[:PLACED]-(other:User)
    WHERE other <> target
    MATCH (other)-[:PLACED]->(:Order)-[:INCLUDES]->(recommended:Product)
    WHERE NOT EXISTS {
        MATCH (target)-[:PLACED]->(:Order)-[:INCLUDES]->(recommended)
    }
    RETURN recommended.name AS name, recommended.price AS price,
           recommended.category AS category,
           count(DISTINCT other) AS recommenders,
           count(DISTINCT bought) AS based_on
    ORDER BY recommenders DESC, based_on DESC
    LIMIT 5
    """
    recommendations = db.query(cypher, {"userId": user_id})
    return jsonify({"userId": user_id, "recommendations": recommendations})


# ============================================================
# 订单创建 API（事务示例）
# ============================================================

@app.route("/orders", methods=["POST"])
def create_order():
    """
    创建订单（事务性操作）
    请求体: {"userId": "U001", "items": [{"productId": "P001", "qty": 1}]}
    """
    data = request.get_json()
    if not data or "userId" not in data or "items" not in data:
        return jsonify({"error": "缺少必要参数"}), 400

    user_id = data["userId"]
    items = data["items"]

    # 在事务中执行订单创建
    cypher = """
    MATCH (u:User {userId: $userId})
    // 生成订单ID
    WITH u, randomUUID() AS orderId
    // 计算总金额
    UNWIND $items AS item
    MATCH (p:Product {productId: item.productId})
    WITH u, orderId, sum(p.price * item.qty) AS total, collect(item) AS items
    // 创建订单
    CREATE (o:Order {
        orderId: orderId,
        totalAmount: total,
        status: "pending",
        createdAt: datetime()
    })
    CREATE (u)<-[:PLACED]-(o)
    // 创建商品关联
    WITH o, items
    UNWIND items AS item
    MATCH (p:Product {productId: item.productId})
    CREATE (o)-[:INCLUDES {qty: item.qty}]->(p)
    RETURN o.orderId AS orderId, o.totalAmount AS totalAmount, o.status AS status
    """

    try:
        result = db.execute_transaction(cypher, {
            "userId": user_id,
            "items": items
        })
        return jsonify({"message": "订单创建成功", "order": result[0]}), 201
    except Exception as e:
        return jsonify({"error": f"订单创建失败: {str(e)}"}), 500


# ============================================================
# 统计信息 API
# ============================================================

@app.route("/stats", methods=["GET"])
def get_stats():
    """获取数据库统计信息"""
    cypher = """
    CALL {
        MATCH (u:User) RETURN count(u) AS userCount
    }
    CALL {
        MATCH (p:Product) RETURN count(p) AS productCount
    }
    CALL {
        MATCH (o:Order) RETURN count(o) AS orderCount
    }
    CALL {
        MATCH (o:Order) RETURN sum(o.totalAmount) AS totalRevenue
    }
    CALL {
        MATCH (o:Order {status: "pending"}) RETURN count(o) AS pendingOrders
    }
    RETURN userCount, productCount, orderCount, totalRevenue, pendingOrders
    """
    stats = db.query(cypher)
    return jsonify(stats[0] if stats else {})


# ============================================================
# 健康检查
# ============================================================

@app.route("/health", methods=["GET"])
def health_check():
    """检查Neo4j连接状态"""
    try:
        result = db.query("RETURN 1 AS connected")
        return jsonify({"status": "healthy", "neo4j": "connected"})
    except Exception as e:
        return jsonify({"status": "unhealthy", "neo4j": str(e)}), 503


# ============================================================
# 启动应用
# ============================================================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
