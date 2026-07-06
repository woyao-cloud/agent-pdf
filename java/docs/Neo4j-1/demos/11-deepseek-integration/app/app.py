# ============================================================
# Neo4j + DeepSeek 大模型集成示例
#
# 核心能力：
# 1. NL2Cypher — 自然语言转Cypher查询
# 2. 知识图谱增强RAG — 图上下文检索 + LLM生成
# 3. 图分析智能体 — DeepSeek分析图结构并选择算法
# 4. 向量+图混合检索 — 语义搜索 + 图遍历
# ============================================================

import os
import json
import re
from flask import Flask, jsonify, request, render_template_string
from neo4j import GraphDatabase
from openai import OpenAI

app = Flask(__name__)

# ============================================================
# 配置
# ============================================================

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password123")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# ============================================================
# Neo4j 连接
# ============================================================

class Neo4jConnection:
    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def query(self, cypher, parameters=None):
        with self.driver.session() as session:
            result = session.run(cypher, parameters or {})
            return [record.data() for record in result]

    def get_schema(self):
        """获取数据库Schema信息，用于LLM上下文"""
        cypher = """
        CALL apoc.meta.schema()
        YIELD label, properties, relationships
        RETURN label, properties, relationships
        """
        return self.query(cypher)

    def get_node_count(self):
        """获取各标签节点数量"""
        cypher = """
        CALL apoc.meta.stats()
        YIELD labelCount, relTypeCount, nodeCount, relCount
        RETURN labelCount, relTypeCount, nodeCount, relCount
        """
        return self.query(cypher)


db = Neo4jConnection(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)

# ============================================================
# DeepSeek 客户端
# ============================================================

deepseek_client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL
)


def call_deepseek(system_prompt, user_prompt, temperature=0.1):
    """调用 DeepSeek API"""
    try:
        response = deepseek_client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=temperature,
            max_tokens=2000
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"DeepSeek API 调用失败: {str(e)}"


# ============================================================
# 1. NL2Cypher — 自然语言转Cypher查询
# ============================================================

def build_schema_context():
    """构建Schema上下文，帮助DeepSeek理解图结构"""
    schema = db.get_schema()
    context_parts = []

    for item in schema:
        label = item.get("label", "")
        props = item.get("properties", {})
        rels = item.get("relationships", {})

        # 节点信息
        prop_desc = []
        for prop_name, prop_info in props.items():
            prop_desc.append(f"  - {prop_name}: {prop_info.get('type', 'unknown')}")
        context_parts.append(f"标签: {label}\n属性:\n" + "\n".join(prop_desc))

        # 关系信息
        if rels:
            rel_desc = []
            for rel_type, rel_info in rels.items():
                direction = rel_info.get("direction", "")
                other_label = rel_info.get("otherLabels", [])
                rel_desc.append(f"  - {direction} {rel_type} -> {other_label}")
            context_parts.append("关系:\n" + "\n".join(rel_desc))

    return "\n\n".join(context_parts)


# Few-shot 示例
NL2CYPHER_EXAMPLES = """
示例1:
用户问题: "谁掌握了Neo4j？"
Cypher: MATCH (e:Engineer)-[:KNOWS]->(db:Database {name: "Neo4j"}) RETURN e.name, e.role, e.level

示例2:
用户问题: "FastAPI依赖哪些技术？"
Cypher: MATCH (f:Frameworks {name: "FastAPI"})-[:DEPENDS_ON*]->(t) RETURN f.name, t.name, t.type

示例3:
用户问题: "Alice和谁合作过？"
Cypher: MATCH (e:Engineer {name: "Alice"})-[c:COLLABORATES_WITH]->(other:Engineer) RETURN other.name, c.project

示例4:
用户问题: "哪些数据库可以用Docker部署？"
Cypher: MATCH (t:Tool {name: "Docker"})-[:DEPLOYS]->(db:Database) RETURN db.name, db.type, db.features

示例5:
用户问题: "统计每种类型的节点数量"
Cypher: MATCH (n) RETURN labels(n) AS label, count(*) AS count ORDER BY count DESC
"""


@app.route("/nl2cypher", methods=["POST"])
def nl2cypher():
    """
    自然语言转Cypher查询
    请求体: {"question": "谁掌握了Neo4j？"}
    """
    data = request.get_json()
    question = data.get("question", "")

    if not question:
        return jsonify({"error": "请提供问题"}), 400

    # 获取Schema上下文
    schema_context = build_schema_context()

    system_prompt = f"""你是一个Neo4j Cypher查询专家。你的任务是将用户的自然语言问题转换为Cypher查询。

数据库Schema:
{schema_context}

参考示例:
{NL2CYPHER_EXAMPLES}

规则:
1. 只返回Cypher查询语句，不要包含任何解释
2. 使用正确的标签名和关系类型
3. 如果问题涉及路径查询，使用变长路径 [*]
4. 如果问题涉及统计，使用 count() 聚合
5. 如果无法转换，返回 "无法生成查询"
"""

    # 调用DeepSeek生成Cypher
    cypher_result = call_deepseek(system_prompt, question, temperature=0.1)

    # 提取Cypher语句
    cypher_match = re.search(r'(MATCH|CALL|CREATE|MERGE)\b.*?(?=\n\n|\Z)', cypher_result, re.DOTALL)
    if cypher_match:
        cypher = cypher_match.group(0).strip()
    else:
        cypher = cypher_result.strip()

    # 执行查询
    try:
        result = db.query(cypher)
        return jsonify({
            "question": question,
            "cypher": cypher,
            "result": result,
            "count": len(result)
        })
    except Exception as e:
        return jsonify({
            "question": question,
            "cypher": cypher,
            "error": f"查询执行失败: {str(e)}"
        })


# ============================================================
# 2. 知识图谱增强RAG
# ============================================================

@app.route("/rag", methods=["POST"])
def rag_query():
    """
    知识图谱增强RAG：从Neo4j检索图上下文，注入DeepSeek生成回答
    请求体: {"question": "我们的团队在技术栈上有什么优势？"}
    """
    data = request.get_json()
    question = data.get("question", "")

    if not question:
        return jsonify({"error": "请提供问题"}), 400

    # 步骤1: 从知识图谱检索相关上下文
    # 这里使用关键词匹配 + 图遍历检索
    retrieval_queries = [
        # 查询所有技术栈关系
        """
        MATCH (f:Frameworks)-[:DEPENDS_ON]->(l:Language)
        RETURN f.name AS source, 'depends_on' AS relation, l.name AS target, 'framework-language' AS type
        """,
        # 查询所有数据库兼容关系
        """
        MATCH (d:Database)-[:COMPATIBLE_WITH]->(l:Language)
        RETURN d.name AS source, 'compatible_with' AS relation, l.name AS target, 'database-language' AS type
        """,
        # 查询团队技能分布
        """
        MATCH (e:Engineer)-[:KNOWS]->(t)
        RETURN e.name AS source, 'knows' AS relation,
               CASE
                 WHEN t:Language THEN t.name
                 WHEN t:Database THEN t.name
                 WHEN t:Frameworks THEN t.name
                 WHEN t:Tool THEN t.name
               END AS target,
               labels(t)[0] AS type
        """,
        # 查询协作关系
        """
        MATCH (e:Engineer)-[c:COLLABORATES_WITH]->(other:Engineer)
        RETURN e.name AS source, 'collaborates_on_' + c.project AS relation, other.name AS target, 'collaboration' AS type
        """
    ]

    graph_context = []
    for q in retrieval_queries:
        try:
            graph_context.extend(db.query(q))
        except:
            pass

    # 步骤2: 将图上下文注入DeepSeek
    system_prompt = """你是一个技术顾问，基于知识图谱数据回答技术问题。

知识图谱数据包含以下信息：
- 技术栈依赖关系（框架依赖什么语言）
- 数据库兼容性（数据库兼容什么语言）
- 团队技能分布（工程师掌握什么技术）
- 团队协作关系（工程师之间的合作）

请基于这些数据回答问题。如果数据不足以回答，请说明缺少什么信息。
回答要简洁、准确、有数据支撑。"""

    user_prompt = f"""知识图谱数据:
{json.dumps(graph_context, ensure_ascii=False, indent=2)}

问题: {question}

请基于以上知识图谱数据回答问题。"""

    answer = call_deepseek(system_prompt, user_prompt, temperature=0.3)

    return jsonify({
        "question": question,
        "graph_context": graph_context[:20],  # 限制返回数量
        "answer": answer
    })


# ============================================================
# 3. 图分析智能体
# ============================================================

@app.route("/analyze", methods=["POST"])
def analyze_graph():
    """
    DeepSeek分析图结构，自动选择并执行图分析
    请求体: {"task": "分析团队中的关键人物"}
    """
    data = request.get_json()
    task = data.get("task", "")

    if not task:
        return jsonify({"error": "请提供分析任务"}), 400

    # 步骤1: DeepSeek决定分析策略
    system_prompt = """你是一个图分析专家。根据用户的分析任务，选择最合适的图分析策略。

可用的分析策略:
1. 中心性分析 - 找出图中最重要的节点（PageRank、Degree Centrality）
2. 社区发现 - 找出图中的社区/群组
3. 路径分析 - 找出节点之间的连接路径
4. 模式匹配 - 找出特定模式（如三角关系）
5. 统计汇总 - 基本的数据统计

请返回JSON格式:
{
    "strategy": "策略名称",
    "reason": "选择理由",
    "cypher_queries": ["查询1", "查询2"]
}"""

    user_prompt = f"分析任务: {task}\n\n图中有以下标签: Engineer, Language, Frameworks, Database, Tool\n关系类型: DEPENDS_ON, COMPATIBLE_WITH, KNOWS, COLLABORATES_WITH, DEPLOYS, ORCHESTRATES, HOSTS"

    strategy_result = call_deepseek(system_prompt, user_prompt, temperature=0.2)

    # 步骤2: 解析策略并执行查询
    try:
        strategy = json.loads(strategy_result)
    except:
        strategy = {"strategy": "统计汇总", "cypher_queries": [
            "MATCH (n) RETURN labels(n) AS label, count(*) AS count ORDER BY count DESC",
            "MATCH ()-[r]->() RETURN type(r) AS relType, count(*) AS count ORDER BY count DESC"
        ]}

    # 步骤3: 执行查询
    query_results = []
    for cypher in strategy.get("cypher_queries", []):
        try:
            result = db.query(cypher)
            query_results.append({"cypher": cypher, "result": result})
        except Exception as e:
            query_results.append({"cypher": cypher, "error": str(e)})

    # 步骤4: DeepSeek解读结果
    interpretation_prompt = f"""分析任务: {task}
分析策略: {strategy.get('strategy', '未知')}
选择理由: {strategy.get('reason', '无')}

查询结果:
{json.dumps(query_results, ensure_ascii=False, indent=2)}

请用自然语言解读这些分析结果，给出有洞察的结论。"""

    interpretation = call_deepseek(
        "你是一个数据分析专家，请用简洁的语言解读图分析结果。",
        interpretation_prompt,
        temperature=0.3
    )

    return jsonify({
        "task": task,
        "strategy": strategy,
        "query_results": query_results,
        "interpretation": interpretation
    })


# ============================================================
# 4. 智能问答（NL2Cypher + RAG 组合）
# ============================================================

@app.route("/ask", methods=["POST"])
def ask():
    """
    智能问答：自动判断使用NL2Cypher还是RAG
    请求体: {"question": "谁掌握了Neo4j？"}
    """
    data = request.get_json()
    question = data.get("question", "")

    if not question:
        return jsonify({"error": "请提供问题"}), 400

    # 判断问题类型
    classification_prompt = """判断以下问题属于哪种类型，只返回类型名称：

1. graph_query - 需要查询图数据库获取具体数据（如"谁掌握了Neo4j？"、"Alice和谁合作过？"）
2. analysis - 需要分析图结构或关系（如"团队有什么特点？"、"技术栈有什么优势？"）
3. general - 一般性问题（如"什么是图数据库？"）

问题: {question}"""

    q_type = call_deepseek("", classification_prompt.format(question=question), temperature=0.1).strip()

    if "graph_query" in q_type:
        # 使用NL2Cypher
        schema_context = build_schema_context()
        system_prompt = f"""你是一个Neo4j Cypher查询专家。数据库Schema:
{schema_context}

{NL2CYPHER_EXAMPLES}

只返回Cypher查询语句。"""

        cypher = call_deepseek(system_prompt, question, temperature=0.1).strip()
        cypher_match = re.search(r'(MATCH|CALL)\b.*?(?=\n\n|\Z)', cypher, re.DOTALL)
        cypher = cypher_match.group(0).strip() if cypher_match else cypher

        try:
            result = db.query(cypher)
            # 用DeepSeek将结果转为自然语言
            nl_prompt = f"""问题: {question}
Cypher查询: {cypher}
查询结果: {json.dumps(result, ensure_ascii=False, indent=2)}

请用自然语言回答用户的问题，基于查询结果。"""
            answer = call_deepseek("你是一个数据助手，请用简洁的语言回答。", nl_prompt, temperature=0.3)
            return jsonify({
                "question": question,
                "type": "graph_query",
                "cypher": cypher,
                "data": result,
                "answer": answer
            })
        except Exception as e:
            return jsonify({
                "question": question,
                "type": "graph_query",
                "error": str(e)
            })

    elif "analysis" in q_type:
        # 使用图分析
        return analyze_graph_internal(question)
    else:
        # 使用RAG
        return rag_query_internal(question)


def analyze_graph_internal(task):
    """内部图分析函数"""
    strategy_queries = [
        "MATCH (n) RETURN labels(n) AS label, count(*) AS count ORDER BY count DESC",
        "MATCH ()-[r]->() RETURN type(r) AS relType, count(*) AS count ORDER BY count DESC",
        "MATCH (e:Engineer)-[:KNOWS]->(t) RETURN e.name, labels(t)[0] AS type, count(t) AS skill_count ORDER BY skill_count DESC"
    ]

    query_results = []
    for cypher in strategy_queries:
        try:
            result = db.query(cypher)
            query_results.append({"cypher": cypher, "result": result})
        except Exception as e:
            query_results.append({"cypher": cypher, "error": str(e)})

    interpretation = call_deepseek(
        "你是一个数据分析专家，请用简洁的语言解读图分析结果。",
        f"分析任务: {task}\n\n查询结果:\n{json.dumps(query_results, ensure_ascii=False, indent=2)}",
        temperature=0.3
    )

    return jsonify({
        "task": task,
        "type": "analysis",
        "query_results": query_results,
        "answer": interpretation
    })


def rag_query_internal(question):
    """内部RAG查询函数"""
    retrieval_queries = [
        "MATCH (f:Frameworks)-[:DEPENDS_ON]->(l:Language) RETURN f.name, l.name",
        "MATCH (d:Database)-[:COMPATIBLE_WITH]->(l:Language) RETURN d.name, l.name",
        "MATCH (e:Engineer)-[:KNOWS]->(t) RETURN e.name, labels(t)[0], coalesce(t.name, '')"
    ]

    graph_context = []
    for q in retrieval_queries:
        try:
            graph_context.extend(db.query(q))
        except:
            pass

    answer = call_deepseek(
        "你是一个技术顾问，基于知识图谱数据回答问题。回答要简洁、准确。",
        f"知识图谱数据:\n{json.dumps(graph_context, ensure_ascii=False, indent=2)}\n\n问题: {question}",
        temperature=0.3
    )

    return jsonify({
        "question": question,
        "type": "rag",
        "answer": answer
    })


# ============================================================
# 5. 交互式Web界面
# ============================================================

HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Neo4j + DeepSeek 智能问答</title>
    <meta charset="utf-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               background: #f5f5f5; color: #333; max-width: 900px; margin: 0 auto; padding: 20px; }
        h1 { color: #008CC1; margin-bottom: 20px; }
        .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        textarea { width: 100%; min-height: 60px; padding: 10px; border: 1px solid #ddd;
                   border-radius: 4px; font-size: 14px; margin-bottom: 10px; }
        button { background: #008CC1; color: white; border: none; padding: 10px 20px;
                 border-radius: 4px; cursor: pointer; font-size: 14px; }
        button:hover { background: #006699; }
        .result { background: #f8f9fa; border: 1px solid #eee; border-radius: 4px;
                  padding: 15px; margin-top: 10px; white-space: pre-wrap; font-size: 14px; }
        .tag { display: inline-block; background: #e3f2fd; color: #008CC1; padding: 2px 8px;
               border-radius: 4px; font-size: 12px; margin-right: 5px; }
        .examples { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
        .example-btn { background: #e3f2fd; color: #008CC1; border: 1px solid #bbdefb;
                       padding: 5px 12px; border-radius: 16px; cursor: pointer; font-size: 13px; }
        .example-btn:hover { background: #bbdefb; }
        .loading { display: none; text-align: center; padding: 20px; color: #666; }
        .error { color: #d32f2f; }
        .meta { font-size: 12px; color: #999; margin-top: 5px; }
    </style>
</head>
<body>
    <h1>Neo4j + DeepSeek 智能问答</h1>

    <div class="card">
        <h3>快速示例</h3>
        <div class="examples">
            <button class="example-btn" onclick="setQuestion('谁掌握了Neo4j？')">谁掌握了Neo4j？</button>
            <button class="example-btn" onclick="setQuestion('FastAPI依赖哪些技术？')">FastAPI依赖哪些技术？</button>
            <button class="example-btn" onclick="setQuestion('Alice和谁合作过？')">Alice和谁合作过？</button>
            <button class="example-btn" onclick="setQuestion('我们的团队在技术栈上有什么优势？')">团队技术栈优势</button>
            <button class="example-btn" onclick="setQuestion('分析团队中的关键人物')">分析关键人物</button>
        </div>
    </div>

    <div class="card">
        <h3>输入问题</h3>
        <textarea id="question" placeholder="请输入关于知识图谱的问题..."></textarea>
        <div style="display: flex; gap: 10px;">
            <button onclick="ask()">智能问答</button>
            <button onclick="nl2cypher()">NL2Cypher</button>
            <button onclick="analyze()">图分析</button>
        </div>
        <div class="loading" id="loading">正在分析...</div>
        <div id="result" class="result" style="display:none;"></div>
    </div>

    <div class="card">
        <h3>API 端点</h3>
        <p><span class="tag">POST</span> /ask - 智能问答（自动判断类型）</p>
        <p><span class="tag">POST</span> /nl2cypher - 自然语言转Cypher</p>
        <p><span class="tag">POST</span> /rag - 知识图谱增强RAG</p>
        <p><span class="tag">POST</span> /analyze - 图分析智能体</p>
        <p><span class="tag">GET</span> /schema - 查看数据库Schema</p>
    </div>

    <script>
        function setQuestion(q) {
            document.getElementById('question').value = q;
        }

        async function ask() {
            const q = document.getElementById('question').value;
            if (!q) return;
            showLoading();
            const res = await fetch('/ask', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({question: q})
            });
            const data = await res.json();
            showResult(data);
        }

        async function nl2cypher() {
            const q = document.getElementById('question').value;
            if (!q) return;
            showLoading();
            const res = await fetch('/nl2cypher', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({question: q})
            });
            const data = await res.json();
            showResult(data);
        }

        async function analyze() {
            const q = document.getElementById('question').value;
            if (!q) return;
            showLoading();
            const res = await fetch('/analyze', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({task: q})
            });
            const data = await res.json();
            showResult(data);
        }

        function showLoading() {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('result').style.display = 'none';
        }

        function showResult(data) {
            document.getElementById('loading').style.display = 'none';
            const el = document.getElementById('result');
            el.style.display = 'block';
            el.innerHTML = formatResult(data);
        }

        function formatResult(data) {
            let html = '';
            if (data.answer) {
                html += '<strong>回答:</strong><br>' + data.answer + '<hr>';
            }
            if (data.cypher) {
                html += '<strong>Cypher查询:</strong><br><code>' + data.cypher + '</code><hr>';
            }
            if (data.data) {
                html += '<strong>查询结果:</strong><br>' + JSON.stringify(data.data, null, 2);
            }
            if (data.query_results) {
                html += '<strong>分析结果:</strong><br>' + JSON.stringify(data.query_results, null, 2);
            }
            if (data.interpretation) {
                html += '<hr><strong>解读:</strong><br>' + data.interpretation;
            }
            if (data.error) {
                html += '<div class="error"><strong>错误:</strong> ' + data.error + '</div>';
            }
            if (data.type) {
                html += '<div class="meta">类型: ' + data.type + '</div>';
            }
            return html;
        }
    </script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE)


@app.route("/schema", methods=["GET"])
def get_schema():
    """查看数据库Schema"""
    schema = db.get_schema()
    stats = db.get_node_count()
    return jsonify({
        "schema": schema,
        "stats": stats
    })


# ============================================================
# 启动
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("Neo4j + DeepSeek 智能问答系统")
    print("=" * 60)
    print(f"Neo4j: {NEO4J_URI}")
    print(f"DeepSeek Model: {DEEPSEEK_MODEL}")
    print(f"DeepSeek API Key: {'已配置' if DEEPSEEK_API_KEY and DEEPSEEK_API_KEY != 'your-api-key-here' else '未配置'}")
    print("=" * 60)
    print("访问 http://localhost:5001 使用Web界面")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)
