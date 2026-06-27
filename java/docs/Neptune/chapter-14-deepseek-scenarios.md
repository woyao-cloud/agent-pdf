# 第14章 Neptune与DeepSeek数据分析实战场景

## 14.1 概述

### 14.1.1 解决的问题

传统数据分析在面对复杂关联数据时存在明显局限：关系型数据库难以高效处理多跳关联查询，单一统计模型无法捕捉图结构中的深层模式，而纯规则引擎在异常识别和自然语言生成方面能力不足。本章旨在解决以下核心问题：

- 如何将图数据库的关联分析能力与大语言模型的语义理解、生成能力深度融合
- 如何在金融风控、社交网络、知识图谱、供应链分析、异常检测等真实场景中落地图+LLM架构
- 如何构建可复用的分析流水线，使非技术用户也能通过自然语言获取图分析结果

### 14.1.2 核心原理

Neptune + DeepSeek 的协同分析架构基于"图计算提取结构特征，大模型注入语义理解"的双引擎模式：

1. **图引擎层（Neptune）**：负责存储关联数据、执行图遍历算法（PageRank、Louvain、Betweenness Centrality等）、通过Gremlin/SPARQL查询返回结构化结果
2. **语义引擎层（DeepSeek）**：接收图查询结果，进行自然语言理解、模式识别、报告生成、推理分析和建议输出
3. **编排层（Orchestrator）**：管理两个引擎之间的数据流转，将图查询结果格式化为LLM友好的上下文，并将LLM输出结构化回传给用户

### 14.1.3 代码/配置实现

本章所有场景基于以下基础设施：

```python
import boto3
import json
import requests
from gremlin_python import statics
from gremlin_python.structure.graph import Graph
from gremlin_python.driver import client, serializer
from gremlin_python.driver.protocol import GremlinServerError

# Neptune 连接配置
NEPTUNE_ENDPOINT = "your-neptune-cluster.cluster-xxxxx.neptune.amazonaws.com"
NEPTUNE_PORT = 8182

def get_neptune_client():
    return client.Client(
        f'wss://{NEPTUNE_ENDPOINT}:{NEPTUNE_PORT}/gremlin',
        'g',
        message_serializer=serializer.GraphSONSerializersV3d0()
    )

def query_neptune(gremlin_query):
    neptune_client = get_neptune_client()
    try:
        result = neptune_client.submit(gremlin_query).all().result()
        return result
    except GremlinServerError as e:
        print(f"Neptune query error: {e}")
        return None
    finally:
        neptune_client.close()

# DeepSeek API 配置
DEEPSEEK_API_KEY = "your-deepseek-api-key"
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

def call_deepseek(prompt, system_message="你是一个专业的数据分析专家。", 
                  model="deepseek-chat", temperature=0.3, max_tokens=4096):
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    response = requests.post(DEEPSEEK_API_URL, headers=headers, json=payload)
    return response.json()["choices"][0]["message"]["content"]
```

### 14.1.4 使用场景

本章覆盖五大核心分析场景，适用于金融科技、社交平台、企业知识管理、供应链管理和运维监控等领域。每个场景均可独立部署，也可组合形成端到端智能分析平台。

### 14.1.5 潜在风险与注意事项

- **API延迟**：DeepSeek调用可能引入秒级延迟，对实时性要求高的场景需设计缓存或异步机制
- **Token成本**：图查询结果可能很大，需对输入做摘要或分块处理以控制Token消耗
- **数据安全**：敏感数据（如交易记录、个人信息）不应直接发送给LLM，需脱敏或使用摘要特征
- **幻觉风险**：DeepSeek在生成分析报告时可能产生不准确信息，关键决策需人工复核

### 14.1.6 本章小结

本节介绍了Neptune+DeepSeek协同分析的整体架构和基础设施配置。后续各节将深入五大场景的具体实现。

---

## 14.2 金融数据分析场景

### 14.2.1 解决的问题

金融机构每天处理海量交易数据，传统规则引擎难以发现隐蔽的欺诈模式，风控报告依赖人工编写效率低下，合规检查面对不断变化的监管要求显得力不从心。本节通过图+LLM的组合方案，实现交易模式识别、风险报告自动生成和合规智能检查。

### 14.2.2 核心原理

金融数据天然具有图结构：账户是节点，交易是边，资金流转形成复杂网络。Neptune擅长在交易网络上执行多跳遍历和模式匹配，DeepSeek则负责理解图模式背后的业务含义并生成自然语言报告。

### 14.2.3 代码/配置实现

#### 14.2.3.1 交易模式识别

```python
def detect_unusual_transaction_patterns(account_id, lookback_days=30):
    """
    检测指定账户的异常交易模式
    1. 查询账户的交易子图
    2. 提取图特征
    3. DeepSeek分析异常模式
    """
    gremlin_query = f"""
    g.V().has('account', 'id', '{account_id}')
      .bothE('transfer').has('timestamp', gte(datetime('{lookback_days}d')))
      .project('from', 'to', 'amount', 'timestamp', 'frequency')
        .by(outV().values('id'))
        .by(inV().values('id'))
        .by('amount')
        .by('timestamp')
        .by(constant(1))
      .fold()
    """
    transactions = query_neptune(gremlin_query)
    
    # 提取图结构特征
    feature_query = f"""
    g.V().has('account', 'id', '{account_id}')
      .union(
        bothE('transfer').count(),                    # 交易总数
        both('transfer').dedup().count(),              # 对手方数量
        bothE('transfer').values('amount').mean(),      # 平均交易金额
        bothE('transfer').values('amount').max(),       # 最大交易金额
        bothE('transfer').has('amount', gt(100000)).count()  # 大额交易数
      ).fold()
    """
    features = query_neptune(feature_query)
    
    # 检测环形交易模式（典型的洗钱模式）
    cycle_query = f"""
    g.V().has('account', 'id', '{account_id}')
      .repeat(both('transfer').simplePath())
      .times(4)
      .has('id', '{account_id}')
      .path()
      .limit(10)
    """
    cycles = query_neptune(cycle_query)
    
    prompt = f"""
    请分析以下交易数据，识别异常模式：

    账户 {account_id} 的交易特征：
    - 交易总数：{features[0] if features else 'N/A'}
    - 对手方数量：{features[1] if features else 'N/A'}
    - 平均交易金额：{features[2] if features else 'N/A'}
    - 最大交易金额：{features[3] if features else 'N/A'}
    - 大额交易(>10万)次数：{features[4] if features else 'N/A'}

    最近交易记录（前20条）：
    {json.dumps(transactions[:20] if transactions else [], indent=2, ensure_ascii=False)}

    检测到的环形交易路径：
    {json.dumps(cycles if cycles else [], indent=2, ensure_ascii=False)}

    请回答：
    1. 是否存在异常交易模式？请具体说明
    2. 是否存在环形交易（洗钱嫌疑）？
    3. 建议的风控措施是什么？
    """
    
    system = "你是一个金融风控专家，擅长从交易图数据中识别欺诈和洗钱模式。"
    return call_deepseek(prompt, system_message=system)
```

#### 14.2.3.2 风险报告自动生成

```python
def generate_risk_report(portfolio_id):
    """
    基于Neptune中的风险指标自动生成自然语言风险报告
    """
    # 查询组合的风险聚合指标
    risk_query = f"""
    g.V().has('portfolio', 'id', '{portfolio_id}')
      .project('portfolio_name', 'total_value', 'risk_score', 'concentration', 
               'max_exposure', 'num_positions', 'var_95', 'sharpe_ratio')
        .by('name')
        .by('total_value')
        .by('risk_score')
        .by('concentration_ratio')
        .by('max_exposure')
        .by('position_count')
        .by('value_at_risk_95')
        .by('sharpe_ratio')
    """
    portfolio_metrics = query_neptune(risk_query)
    
    # 查询关联资产的风险分布
    asset_query = f"""
    g.V().has('portfolio', 'id', '{portfolio_id}')
      .out('holds')
      .project('asset_name', 'asset_type', 'weight', 'risk_contribution', 'return')
        .by('name')
        .by('type')
        .by('weight')
        .by('risk_contribution')
        .by('return_ytd')
      .order().by('risk_contribution', desc)
      .limit(20)
    """
    asset_risks = query_neptune(asset_query)
    
    # 查询历史风险事件
    event_query = f"""
    g.V().has('portfolio', 'id', '{portfolio_id}')
      .out('experienced')
      .project('event_type', 'severity', 'date', 'impact', 'recovery')
        .by('type')
        .by('severity')
        .by('date')
        .by('impact_pct')
        .by('recovery_days')
      .order().by('date', desc)
      .limit(10)
    """
    risk_events = query_neptune(event_query)
    
    prompt = f"""
    请根据以下投资组合风险指标生成一份专业的风险分析报告：

    ## 组合概况
    {json.dumps(portfolio_metrics[0] if portfolio_metrics else {}, indent=2, ensure_ascii=False)}

    ## 资产风险分布（按风险贡献排序）
    {json.dumps(asset_risks, indent=2, ensure_ascii=False)}

    ## 历史风险事件
    {json.dumps(risk_events, indent=2, ensure_ascii=False)}

    请生成包含以下内容的报告：
    1. 执行摘要：组合整体风险状况的一句话总结
    2. 风险分解：按资产类别分析风险来源
    3. 集中度风险：是否存在过度集中
    4. 尾部风险：VaR指标解读
    5. 风险调整收益：Sharpe比率评估
    6. 历史事件回顾：过去风险事件的影响和恢复情况
    7. 建议措施：3-5条具体可操作的风险管理建议
    """
    
    system = "你是一个专业的金融风险分析师，擅长撰写清晰、数据驱动的风险分析报告。"
    return call_deepseek(prompt, system_message=system, max_tokens=8192)
```

#### 14.2.3.3 合规检查

```python
def compliance_check(entity_id, regulation_type="AML"):
    """
    图查询合规指标 + DeepSeek合规评估与修复建议
    """
    # 查询实体及其交易网络
    network_query = f"""
    g.V().has('entity', 'id', '{entity_id}')
      .project('entity_info', 'transactions', 'counterparties', 'jurisdictions')
        .by(project('name', 'type', 'risk_level')
              .by('name').by('type').by('risk_level'))
        .by(outE('transfer').count())
        .by(both('transfer').dedup().values('country').fold())
        .by(both('transfer').values('jurisdiction').dedup().fold())
    """
    entity_data = query_neptune(network_query)
    
    # 查询合规规则匹配情况
    rule_query = f"""
    g.V().has('entity', 'id', '{entity_id}')
      .out('subject_to')
      .has('status', 'active')
      .project('rule_name', 'rule_type', 'threshold', 'current_value', 'breached')
        .by('name')
        .by('type')
        .by('threshold')
        .by('current_value')
        .by('breached')
    """
    rule_results = query_neptune(rule_query)
    
    # 查询跨境交易
    cross_border_query = f"""
    g.V().has('entity', 'id', '{entity_id}')
      .bothE('transfer')
      .where(outV().values('country').neq(inV().values('country')))
      .project('from_country', 'to_country', 'amount', 'date')
        .by(outV().values('country'))
        .by(inV().values('country'))
        .by('amount')
        .by('timestamp')
      .limit(20)
    """
    cross_border = query_neptune(cross_border_query)
    
    prompt = f"""
    请根据以下数据执行合规检查（{regulation_type}）：

    ## 实体信息
    {json.dumps(entity_data, indent=2, ensure_ascii=False)}

    ## 合规规则匹配结果
    {json.dumps(rule_results, indent=2, ensure_ascii=False)}

    ## 跨境交易记录
    {json.dumps(cross_border, indent=2, ensure_ascii=False)}

    请完成以下任务：
    1. 评估该实体的整体合规状况
    2. 列出已触发的合规规则及其严重程度
    3. 识别潜在的合规风险点
    4. 针对每个风险点给出具体的修复建议
    5. 建议是否需要上报监管机构
    """
    
    system = "你是一个金融合规专家，熟悉AML/KYC/CFT等监管要求。"
    return call_deepseek(prompt, system_message=system)
```

### 14.2.4 使用场景

- 银行反洗钱（AML）监控系统
- 投资组合风险日报自动生成
- 监管科技（RegTech）合规自动化
- 交易行为异常实时告警

### 14.2.5 潜在风险与注意事项

- 交易数据量可能极大，需设计增量查询策略而非全量扫描
- 环形交易检测的深度和广度需平衡性能与准确性
- DeepSeek生成的风险报告不能替代专业风控人员的最终判断
- 合规检查涉及监管要求变化，规则库需定期更新

### 14.2.6 本章小结

本节实现了金融数据分析的三个核心场景。通过Neptune的图遍历能力高效提取交易网络特征，再借助DeepSeek的语义理解生成可读性强的分析报告和合规建议，大幅提升了金融分析的效率和深度。

---

## 14.3 社交网络分析场景

### 14.3.1 解决的问题

社交网络分析面临数据规模大、关系维度多、用户行为复杂等挑战。传统方法难以从海量连接中提取有意义的用户画像，社区发现结果缺乏业务解释，影响力分析停留在数值排名而缺少"为什么"的解读。

### 14.3.2 核心原理

社交网络是典型的图结构：用户是节点，关注/好友/互动是边。Neptune执行图算法（PageRank、Louvain、Triangle Count等）提取结构特征，DeepSeek将这些数值特征转化为有业务含义的用户画像、社区描述和影响力解读。

### 14.3.3 代码/配置实现

#### 14.3.3.1 用户画像生成

```python
def generate_user_profile(user_id):
    """
    提取用户图特征，DeepSeek生成综合画像
    """
    # 用户基本图特征
    feature_query = f"""
    g.V().has('user', 'id', '{user_id}')
      .project('basic_info', 'network_stats', 'activity_stats', 'content_stats')
        .by(project('name', 'age', 'gender', 'location')
              .by('name').by('age').by('gender').by('location'))
        .by(project('followers', 'following', 'mutual_friends', 'degree_centrality')
              .by(inE('follows').count())
              .by(outE('follows').count())
              .by(both('follows').where(
                 and_(inE('follows').where(outV().has('id', '{user_id}')),
                      outE('follows').where(inV().has('id', '{user_id}'))
              )).dedup().count())
              .by(both('follows').count()))
        .by(project('posts', 'likes_given', 'comments', 'avg_sentiment')
              .by(outE('posts').count())
              .by(outE('likes').count())
              .by(outE('comments').count())
              .by(outE('posts').values('sentiment').mean()))
        .by(project('topics', 'hashtags', 'mentioned_by')
              .by(out('posts').values('topic').dedup().fold())
              .by(out('posts').values('hashtags').unfold().dedup().fold())
              .by(inE('mentions').count()))
    """
    features = query_neptune(feature_query)
    
    # 用户所在的社区信息
    community_query = f"""
    g.V().has('user', 'id', '{user_id}')
      .out('belongs_to')
      .project('community_id', 'community_size', 'community_topic', 'role_in_community')
        .by('id')
        .by(out('contains').count())
        .by('topic')
        .by(project('influence_rank', 'activity_rank')
              .by('influence_score')
              .by('activity_score'))
    """
    community = query_neptune(community_query)
    
    # 用户最近互动对象
    interaction_query = f"""
    g.V().has('user', 'id', '{user_id}')
      .bothE('mentions', 'comments', 'likes')
      .order().by('timestamp', desc)
      .limit(20)
      .project('interaction_type', 'with_user', 'timestamp', 'content_preview')
        .by(label)
        .by(otherV().values('name'))
        .by('timestamp')
        .by('content')
    """
    interactions = query_neptune(interaction_query)
    
    prompt = f"""
    请根据以下社交网络数据生成用户画像：

    ## 基本信息与网络统计
    {json.dumps(features[0] if features else {}, indent=2, ensure_ascii=False)}

    ## 社区归属
    {json.dumps(community, indent=2, ensure_ascii=False)}

    ## 近期互动
    {json.dumps(interactions, indent=2, ensure_ascii=False)}

    请生成包含以下维度的综合用户画像：
    1. 用户身份摘要：一句话描述该用户
    2. 社交影响力：粉丝数、互动率、在网络中的位置
    3. 兴趣领域：基于发布内容和话题标签
    4. 行为模式：发帖频率、互动偏好、活跃时段
    5. 社区角色：在所属社区中的定位（KOL、活跃分子、潜水者等）
    6. 潜在商业价值：适合的品牌合作方向
    """
    
    system = "你是一个社交网络分析专家，擅长从图数据中构建精准的用户画像。"
    return call_deepseek(prompt, system_message=system, max_tokens=4096)
```

#### 14.3.3.2 社区发现报告

```python
def generate_community_report(graph_name="social_network"):
    """
    Louvain社区检测 + DeepSeek社区特征描述
    """
    # 执行Louvain社区检测（Neptune ML或自定义实现）
    # 这里使用Neptune的subgraph查询模拟社区划分
    communities_query = f"""
    g.V().hasLabel('user')
      .group()
        .by('community_id')
        .by(project('members', 'avg_influence', 'top_topics', 'internal_edges', 'external_edges')
              .by(fold().project('count', 'sample_names')
                    .by(count())
                    .by(unfold().values('name').fold(limit=10)))
              .by(unfold().values('influence_score').mean())
              .by(unfold().out('posts').values('topic').dedup().fold())
              .by(unfold().bothE('follows').where(
                    bothV().values('community_id').dedup().count().is(eq(1))).count())
              .by(unfold().bothE('follows').where(
                    bothV().values('community_id').dedup().count().is(gt(1))).count()))
      .unfold()
      .project('community_id', 'details')
        .by(keys)
        .by(select(values))
      .order().by(select('details').select('members').select('count'), desc)
    """
    communities = query_neptune(communities_query)
    
    # 计算社区间的连接强度
    bridge_query = f"""
    g.V().hasLabel('user')
      .bothE('follows')
      .where(bothV().values('community_id').dedup().count().is(gt(1)))
      .group()
        .by(project('from_community', 'to_community')
              .by(outV().values('community_id'))
              .by(inV().values('community_id')))
        .by(count())
      .unfold()
      .order().by(values, desc)
      .limit(20)
    """
    bridges = query_neptune(bridge_query)
    
    prompt = f"""
    请根据以下社区检测结果生成社区分析报告：

    ## 社区概览（按规模排序）
    {json.dumps(communities, indent=2, ensure_ascii=False)}

    ## 社区间连接（桥接关系）
    {json.dumps(bridges, indent=2, ensure_ascii=False)}

    请生成包含以下内容的报告：
    1. 社区结构总览：有多少个主要社区，规模分布如何
    2. 每个社区的详细描述：
       - 社区主题和兴趣领域
       - 成员特征（活跃度、影响力水平）
       - 社区凝聚力（内部连接 vs 外部连接比例）
       - 代表性用户
    3. 社区间关系：哪些社区联系紧密，哪些相对孤立
    4. 桥接节点分析：连接不同社区的关键用户特征
    5. 业务建议：如何针对不同社区制定运营策略
    """
    
    system = "你是一个社交网络分析专家，擅长从社区发现结果中提取业务洞察。"
    return call_deepseek(prompt, system_message=system, max_tokens=8192)
```

#### 14.3.3.3 影响力分析

```python
def influence_analysis(graph_name="social_network", top_n=20):
    """
    PageRank计算 + DeepSeek关键意见领袖识别
    """
    # 执行PageRank（Neptune内置算法）
    pagerank_query = f"""
    g.V().hasLabel('user')
      .project('user_id', 'name', 'pagerank', 'followers', 'engagement_rate', 'content_quality')
        .by('id')
        .by('name')
        .by(pageRank())
        .by(inE('follows').count())
        .by(project('likes', 'comments', 'shares')
              .by(outE('posts').inE('likes').count())
              .by(outE('posts').inE('comments').count())
              .by(outE('posts').inE('shares').count()))
        .by(outE('posts').values('quality_score').mean())
      .order().by('pagerank', desc)
      .limit({top_n})
    """
    top_users = query_neptune(pagerank_query)
    
    # 查询这些用户的邻域特征
    neighborhood_query = f"""
    g.V().hasLabel('user')
      .order().by(pageRank(), desc)
      .limit({top_n})
      .project('user_id', 'neighborhood_diversity', 'information_broker_score')
        .by('id')
        .by(both('follows').values('community_id').dedup().count())
        .by(project('betweenness', 'closeness')
              .by(betweenness())
              .by(closeness()))
    """
    neighborhood = query_neptune(neighborhood_query)
    
    prompt = f"""
    请根据以下社交网络影响力分析数据识别关键意见领袖（KOL）：

    ## Top {top_n} 影响力用户（按PageRank排序）
    {json.dumps(top_users, indent=2, ensure_ascii=False)}

    ## 邻域多样性分析
    {json.dumps(neighborhood, indent=2, ensure_ascii=False)}

    请完成以下分析：
    1. 识别前5名关键意见领袖，解释他们为什么具有高影响力
    2. 区分"真正的影响力"和"虚假的影响力"（高粉丝但低互动）
    3. 分析影响力来源：是内容质量驱动还是网络位置驱动？
    4. 跨社区影响力：哪些用户能影响多个社区？
    5. 信息桥接者：哪些用户扮演信息传播的关键角色？
    6. 针对每个Top KOL给出合作价值评估
    """
    
    system = "你是一个社交媒体影响力分析专家，擅长从图算法结果中解读影响力来源。"
    return call_deepseek(prompt, system_message=system)
```

### 14.3.4 使用场景

- 社交媒体平台用户画像系统
- 精准营销的目标用户识别
- 社区运营策略制定
- KOL营销合作评估
- 信息传播路径分析

### 14.3.5 潜在风险与注意事项

- PageRank在社交图中可能存在"名人偏差"，需结合互动率等指标综合判断
- Louvain社区检测结果对分辨率参数敏感，需根据业务场景调参
- 用户画像涉及隐私，需确保符合GDPR等数据保护法规
- 社区划分的边界可能模糊，DeepSeek的描述需注明不确定性

### 14.3.6 本章小结

本节展示了社交网络分析的三个关键场景。Neptune的图算法（PageRank、Louvain）提供了定量分析基础，DeepSeek则将数值结果转化为有业务洞察的自然语言报告，使分析结果对非技术用户也易于理解。

---

## 14.4 知识图谱Q&A场景

### 14.4.1 解决的问题

知识图谱的查询门槛高——业务用户不熟悉Gremlin或SPARQL语法，难以从图谱中获取所需信息。多跳推理问题（如"A的供应商的客户的竞争对手是谁"）在传统查询中需要多次手动拼接，而查询结果的原始格式对非技术用户不友好。

### 14.4.2 核心原理

DeepSeek作为自然语言到图查询的翻译器，将用户问题解析为结构化查询语句，执行后返回结果再由DeepSeek解释为自然语言回答。多跳推理通过DeepSeek的链式思考（Chain-of-Thought）能力，将复杂问题分解为多个单跳查询步骤。

### 14.4.3 代码/配置实现

#### 14.4.3.1 自然语言转图查询

```python
def nl_to_graph_query(natural_language_query, graph_schema=None):
    """
    DeepSeek将自然语言翻译为Gremlin/SPARQL查询
    """
    if graph_schema is None:
        # 获取图schema
        schema_query = """
        g.V().limit(1).elementMap()
        """
        sample = query_neptune(schema_query)
        
        label_query = """
        g.V().label().dedup().fold()
        """
        labels = query_neptune(label_query)
        
        edge_query = """
        g.E().label().dedup().fold()
        """
        edge_labels = query_neptune(edge_query)
        
        graph_schema = {
            "node_labels": labels,
            "edge_labels": edge_labels,
            "sample_node": sample
        }
    
    prompt = f"""
    你是一个Neptune图数据库查询专家。请将以下自然语言问题转换为Gremlin查询语句。

    ## 图数据库Schema
    {json.dumps(graph_schema, indent=2, ensure_ascii=False)}

    ## 用户问题
    {natural_language_query}

    请只返回Gremlin查询语句，不要包含任何解释。如果问题无法用图查询实现，请说明原因。
    """
    
    system = "你是一个Gremlin图查询语言专家。你只输出有效的Gremlin查询语句。"
    gremlin_query = call_deepseek(prompt, system_message=system, temperature=0.1)
    
    # 执行生成的查询
    try:
        result = query_neptune(gremlin_query)
        return {
            "original_question": natural_language_query,
            "generated_query": gremlin_query,
            "raw_result": result
        }
    except Exception as e:
        return {
            "original_question": natural_language_query,
            "generated_query": gremlin_query,
            "error": str(e)
        }


def explain_query_result(query_result):
    """
    DeepSeek解释图查询结果
    """
    prompt = f"""
    请用自然语言解释以下图查询结果：

    ## 原始问题
    {query_result.get('original_question', 'N/A')}

    ## 执行的查询
    ```gremlin
    {query_result.get('generated_query', 'N/A')}
    ```

    ## 查询结果
    {json.dumps(query_result.get('raw_result', 'N/A'), indent=2, ensure_ascii=False)}

    请用简洁的自然语言回答原始问题，并解释查询结果的含义。
    如果查询出错，请分析可能的原因。
    """
    
    return call_deepseek(prompt, temperature=0.3)
```

#### 14.4.3.2 多跳推理Q&A

```python
def multi_hop_qa(question, max_hops=3):
    """
    多跳推理：将复杂问题分解为多步图查询
    """
    # 第一步：DeepSeek将问题分解为查询计划
    plan_prompt = f"""
    请将以下问题分解为最多{max_hops}步的图查询计划。
    每一步需要指定：查询目标、起始节点、遍历路径。

    问题：{question}

    请以JSON格式返回查询计划：
    {{
        "steps": [
            {{
                "step": 1,
                "description": "第一步查询描述",
                "start_node": "起始节点条件",
                "traversal": "遍历路径描述",
                "expected_output": "预期输出"
            }}
        ],
        "final_answer_instruction": "如何组合各步结果得到最终答案"
    }}
    """
    
    system = "你是一个知识图谱推理专家，擅长将复杂问题分解为多步图查询。"
    plan_response = call_deepseek(plan_prompt, system_message=system, temperature=0.2)
    
    # 解析查询计划（简化处理，实际需更健壮的解析）
    try:
        plan = json.loads(plan_response)
    except:
        plan = {"steps": [{"description": "直接查询", "traversal": question}], 
                "final_answer_instruction": "直接回答"}
    
    # 第二步：执行每一步查询
    step_results = []
    for step in plan.get("steps", []):
        nl_step = step.get("description", "")
        
        # 将每一步描述转为Gremlin
        step_query = nl_to_graph_query(nl_step)
        step_results.append({
            "step": step.get("step", 1),
            "description": nl_step,
            "query": step_query.get("generated_query", ""),
            "result": step_query.get("raw_result", step_query.get("error", "查询失败"))
        })
    
    # 第三步：DeepSeek综合各步结果给出最终答案
    synthesis_prompt = f"""
    请根据以下多步图查询结果回答用户的问题。

    ## 用户问题
    {question}

    ## 查询计划与各步结果
    {json.dumps(step_results, indent=2, ensure_ascii=False)}

    ## 综合指令
    {plan.get('final_answer_instruction', '请综合各步结果给出答案')}

    请给出最终答案，并解释推理过程。
    """
    
    final_answer = call_deepseek(synthesis_prompt, max_tokens=4096)
    
    return {
        "question": question,
        "plan": plan,
        "step_results": step_results,
        "final_answer": final_answer
    }
```

#### 14.4.3.3 结果可视化解释

```python
def visualize_and_explain(query_result, visualization_type="path"):
    """
    查询结果可视化 + DeepSeek解释
    """
    result_data = query_result.get("raw_result", [])
    
    if visualization_type == "path":
        # 路径可视化数据准备
        viz_data = {
            "nodes": [],
            "edges": [],
            "paths": []
        }
        for item in result_data:
            if isinstance(item, dict) and "objects" in item:
                path_objects = item["objects"]
                for obj in path_objects:
                    if "id" in obj:
                        viz_data["nodes"].append({
                            "id": obj.get("id"),
                            "label": obj.get("label", "unknown"),
                            "properties": {k: v for k, v in obj.items() 
                                          if k not in ["id", "label"]}
                        })
    
    prompt = f"""
    请解释以下图查询结果，并建议可视化方式：

    ## 查询结果数据
    {json.dumps(result_data[:50], indent=2, ensure_ascii=False)}

    ## 可视化数据
    {json.dumps(viz_data if visualization_type == "path" else result_data[:50], 
                 indent=2, ensure_ascii=False)}

    请完成：
    1. 用自然语言描述查询结果
    2. 建议最适合展示这些结果的可视化方式（力导向图、层次树、桑基图等）
    3. 解释结果中的关键节点和关系
    4. 指出值得进一步探索的方向
    """
    
    return call_deepseek(prompt, max_tokens=4096)
```

### 14.4.4 使用场景

- 企业知识图谱的智能问答系统
- 科研文献图谱的语义搜索
- 产品知识库的自然语言查询
- 法规知识图谱的合规咨询
- 教育领域的知识推理辅助

### 14.4.5 潜在风险与注意事项

- DeepSeek生成的Gremlin查询可能包含语法错误，需设计查询验证和重试机制
- 多跳推理的中间结果可能很大，需限制每步返回的数据量
- 复杂问题分解可能不准确，需设计用户确认环节
- 查询结果解释可能遗漏重要细节，建议同时展示原始数据

### 14.4.6 本章小结

本节实现了知识图谱的自然语言问答能力。通过DeepSeek的语义理解和链式推理，将复杂的图查询过程对用户透明化，大幅降低了知识图谱的使用门槛。多跳推理能力使系统能回答需要跨多步关联的复杂问题。

---

## 14.5 供应链分析场景

### 14.5.1 解决的问题

现代供应链网络复杂且脆弱，企业面临供应商依赖度高、瓶颈节点识别困难、风险传导路径不透明等挑战。传统供应链管理工具难以从全局视角分析网络拓扑，无法快速定位关键瓶颈和评估级联风险。

### 14.5.2 核心原理

供应链天然是图结构：企业/工厂是节点，供应关系是边。Neptune通过Betweenness Centrality识别瓶颈节点，通过路径枚举分析备选方案，通过风险传播模拟评估级联影响。DeepSeek将图算法结果转化为可执行的优化建议。

### 14.5.3 代码/配置实现

#### 14.5.3.1 瓶颈分析报告

```python
def bottleneck_analysis(supply_chain_id):
    """
    Betweenness Centrality分析 + DeepSeek优化建议
    """
    # 计算介数中心性
    betweenness_query = f"""
    g.V().has('supply_chain', 'id', '{supply_chain_id}')
      .out('contains')
      .project('node_id', 'name', 'type', 'betweenness', 'capacity', 'utilization')
        .by('id')
        .by('name')
        .by('type')
        .by(betweenness())
        .by('capacity')
        .by('utilization_rate')
      .order().by('betweenness', desc)
      .limit(30)
    """
    centrality = query_neptune(betweenness_query)
    
    # 查询瓶颈节点的上下游依赖
    bottleneck_nodes = [n for n in (centrality or []) 
                       if n.get('betweenness', 0) > 0.1][:5]
    
    dependencies = []
    for node in bottleneck_nodes:
        dep_query = f"""
        g.V().has('node', 'id', '{node["node_id"]}')
          .project('upstream', 'downstream', 'critical_paths')
            .by(inE('supplies').outV().project('id', 'name', 'critical')
                  .by('id').by('name').by('is_critical').fold())
            .by(outE('supplies').inV().project('id', 'name', 'demand_pct')
                  .by('id').by('name').by('demand_percentage').fold())
            .by(bothE('supplies').count())
        """
        deps = query_neptune(dep_query)
        dependencies.append({"node": node, "dependencies": deps})
    
    prompt = f"""
    请根据以下供应链网络分析结果生成瓶颈分析报告：

    ## 介数中心性排名（Top 30）
    {json.dumps(centrality, indent=2, ensure_ascii=False)}

    ## 关键瓶颈节点依赖分析
    {json.dumps(dependencies, indent=2, ensure_ascii=False)}

    请生成包含以下内容的报告：
    1. 关键瓶颈节点识别：列出前5个瓶颈节点及其介数中心性
    2. 瓶颈影响分析：每个瓶颈节点失效会影响多少上下游节点
    3. 容量利用率评估：瓶颈节点的产能是否充分利用
    4. 单点故障风险：是否存在不可替代的节点
    5. 优化建议：
       - 针对每个瓶颈节点的具体优化措施
       - 建议的备用供应商或替代路径
       - 库存缓冲策略建议
    """
    
    system = "你是一个供应链优化专家，擅长从网络拓扑中识别瓶颈并提出优化方案。"
    return call_deepseek(prompt, system_message=system, max_tokens=8192)
```

#### 14.5.3.2 风险评估

```python
def supply_chain_risk_assessment(supply_chain_id):
    """
    供应商风险评分 + DeepSeek影响评估与缓解建议
    """
    # 查询所有供应商及其风险指标
    risk_query = f"""
    g.V().has('supply_chain', 'id', '{supply_chain_id}')
      .out('contains').has('type', 'supplier')
      .project('supplier_id', 'name', 'risk_score', 'risk_factors', 
               'financial_health', 'geo_risk', 'dependency_level')
        .by('id')
        .by('name')
        .by('risk_score')
        .by(out('has_risk').values('type').fold())
        .by('financial_health_score')
        .by('geo_risk_score')
        .by(project('supplier_count', 'switching_cost')
              .by(in('supplies').dedup().count())
              .by('switching_cost'))
      .order().by('risk_score', desc)
    """
    supplier_risks = query_neptune(risk_query)
    
    # 风险传播路径分析
    propagation_query = f"""
    g.V().has('supply_chain', 'id', '{supply_chain_id}')
      .out('contains').has('risk_score', gt(0.7))
      .repeat(out('supplies').simplePath())
      .times(3)
      .path()
      .limit(50)
    """
    propagation_paths = query_neptune(propagation_query)
    
    # 历史风险事件
    history_query = f"""
    g.V().has('supply_chain', 'id', '{supply_chain_id}')
      .out('experienced')
      .project('event_type', 'severity', 'impact_days', 'cost_impact', 'recovered')
        .by('type')
        .by('severity')
        .by('disruption_days')
        .by('cost_impact')
        .by('recovered')
      .order().by('severity', desc)
      .limit(20)
    """
    risk_history = query_neptune(history_query)
    
    prompt = f"""
    请根据以下供应链风险评估数据生成风险分析报告：

    ## 供应商风险评分（按风险降序）
    {json.dumps(supplier_risks, indent=2, ensure_ascii=False)}

    ## 风险传播路径
    {json.dumps(propagation_paths, indent=2, ensure_ascii=False)}

    ## 历史风险事件
    {json.dumps(risk_history, indent=2, ensure_ascii=False)}

    请完成以下分析：
    1. 高风险供应商识别：列出风险评分>0.7的供应商及其主要风险因素
    2. 级联风险分析：如果高风险供应商出问题，影响会如何传播
    3. 财务风险评估：供应商财务健康状况对供应链的影响
    4. 地缘政治风险：地理分布带来的风险暴露
    5. 历史模式：从历史事件中总结风险规律
    6. 缓解建议：
       - 针对每个高风险供应商的具体缓解措施
       - 建议的供应商多元化策略
       - 应急响应计划建议
       - 保险和合同条款建议
    """
    
    system = "你是一个供应链风险管理专家，擅长评估供应商风险并提出缓解策略。"
    return call_deepseek(prompt, system_message=system, max_tokens=8192)
```

#### 14.5.3.3 优化建议

```python
def supply_chain_optimization(supply_chain_id, target_node_id):
    """
    备选路径分析 + DeepSeek方案对比
    """
    # 查询当前供应路径
    current_path_query = f"""
    g.V().has('node', 'id', '{target_node_id}')
      .inE('supplies').has('is_primary', true)
      .outV()
      .repeat(__.inE('supplies').has('is_primary', true).outV().simplePath())
      .until(has('type', 'raw_material'))
      .path()
      .limit(5)
    """
    current_paths = query_neptune(current_path_query)
    
    # 查询所有备选路径
    alternative_paths_query = f"""
    g.V().has('node', 'id', '{target_node_id}')
      .repeat(__.in('supplies').simplePath())
      .times(4)
      .has('type', 'raw_material')
      .path()
      .limit(20)
    """
    alternative_paths = query_neptune(alternative_paths_query)
    
    # 路径成本和时间比较
    cost_comparison_query = f"""
    g.V().has('node', 'id', '{target_node_id}')
      .inE('supplies')
      .project('supplier', 'cost', 'lead_time', 'quality_score', 'reliability')
        .by(outV().values('name'))
        .by('unit_cost')
        .by('lead_time_days')
        .by('quality_score')
        .by('reliability_score')
      .order().by('cost', asc)
    """
    cost_comparison = query_neptune(cost_comparison_query)
    
    prompt = f"""
    请根据以下供应链优化数据生成优化建议：

    ## 当前主要供应路径
    {json.dumps(current_paths, indent=2, ensure_ascii=False)}

    ## 备选供应路径
    {json.dumps(alternative_paths, indent=2, ensure_ascii=False)}

    ## 供应商成本与绩效对比
    {json.dumps(cost_comparison, indent=2, ensure_ascii=False)}

    请完成以下分析：
    1. 当前路径评估：分析当前供应路径的优缺点
    2. 备选方案对比：列出3-5个可行的备选路径
    3. 多维度比较：从成本、交期、质量、可靠性四个维度对比各方案
    4. 推荐方案：给出最优路径建议并说明理由
    5. 实施建议：
       - 切换路径的具体步骤
       - 过渡期风险管理
       - 预期成本节约和效率提升
    """
    
    system = "你是一个供应链优化专家，擅长从多维度比较供应方案并给出最优建议。"
    return call_deepseek(prompt, system_message=system)
```

### 14.5.4 使用场景

- 制造业供应链网络优化
- 零售业供应商风险管理
- 物流网络瓶颈分析
- 采购策略优化
- 供应链韧性评估

### 14.5.5 潜在风险与注意事项

- Betweenness Centrality计算在大规模图上可能很慢，需使用近似算法
- 供应链数据涉及商业机密，需严格控制数据访问权限
- 优化建议需结合实时市场数据，图数据需定期更新
- 备选路径分析可能遗漏隐性约束（如合同锁定、资质要求）

### 14.5.6 本章小结

本节实现了供应链分析的三个核心场景。Neptune的图算法（Betweenness Centrality、路径枚举）从拓扑角度识别瓶颈和风险，DeepSeek则将算法结果转化为可执行的业务建议，帮助供应链管理者做出更明智的决策。

---

## 14.6 异常检测与根因分析场景

### 14.6.1 解决的问题

在复杂系统中，异常往往不是孤立事件，而是多个组件之间关系异常的表现。传统基于阈值的监控方法无法捕捉图结构中的异常模式，根因分析需要人工在大量告警中追溯，效率低下且容易遗漏。

### 14.6.2 核心原理

异常在图中表现为异常的子图模式（如异常的星型结构、异常的密集连接子图、异常的路径模式）。Neptune通过图模式匹配和异常子图检测算法定位异常区域，DeepSeek则通过分析异常子图的上下文信息推断根因并生成修复建议。

### 14.6.3 代码/配置实现

#### 14.6.3.1 图模式异常检测

```python
def detect_graph_anomalies(graph_name="system_graph", time_window_hours=24):
    """
    检测异常子图模式
    """
    # 检测异常密集连接子图
    dense_subgraph_query = f"""
    g.V().hasLabel('service')
      .project('service_id', 'name', 'connection_density', 'avg_latency', 
               'error_rate', 'anomaly_score')
        .by('id')
        .by('name')
        .by(project('actual_edges', 'expected_edges')
              .by(bothE('calls').count())
              .by(both('calls').count().as('n').math('n*(n-1)/2')))
        .by(outE('calls').values('latency_ms').mean())
        .by(outE('calls').values('error_rate').mean())
        .by('anomaly_score')
      .where(values('anomaly_score').is(gt(0.8)))
      .order().by('anomaly_score', desc)
    """
    dense_anomalies = query_neptune(dense_subgraph_query)
    
    # 检测异常星型结构（一个节点连接异常多的叶子节点）
    star_anomaly_query = f"""
    g.V().hasLabel('service')
      .project('service_id', 'name', 'fan_out', 'fan_in', 'unusual_connections')
        .by('id')
        .by('name')
        .by(outE('calls').count())
        .by(inE('calls').count())
        .by(project('new_connections_1h', 'unusual_ports')
              .by(outE('calls').has('timestamp', 
                    gte(datetime('{time_window_hours}h'))).count())
              .by(outE('calls').values('port').dedup().fold()))
      .where(values('fan_out').is(gt(50)))
      .order().by('fan_out', desc)
    """
    star_anomalies = query_neptune(star_anomaly_query)
    
    # 检测异常路径模式（如循环依赖、异常长的调用链）
    cycle_query = f"""
    g.V().hasLabel('service')
      .repeat(out('calls').simplePath())
      .times(6)
      .where(cyclicPath())
      .path()
      .limit(20)
    """
    cycles = query_neptune(cycle_query)
    
    prompt = f"""
    请分析以下图异常检测结果：

    ## 异常密集连接子图（异常分数>0.8）
    {json.dumps(dense_anomalies, indent=2, ensure_ascii=False)}

    ## 异常星型结构（扇出>50）
    {json.dumps(star_anomalies, indent=2, ensure_ascii=False)}

    ## 循环依赖检测
    {json.dumps(cycles, indent=2, ensure_ascii=False)}

    请完成以下分析：
    1. 异常模式分类：识别出哪些类型的图异常
    2. 严重程度评估：每个异常的影响范围和严重程度
    3. 异常关联分析：不同异常之间是否存在关联
    4. 可能的根因假设：基于图模式提出2-3个根因假设
    5. 建议的进一步调查方向
    """
    
    system = "你是一个系统可靠性专家，擅长从图结构中识别异常模式。"
    return call_deepseek(prompt, system_message=system)
```

#### 14.6.3.2 根因定位

```python
def root_cause_localization(anomaly_id, anomaly_type="latency_spike"):
    """
    从异常节点出发，沿图遍历定位根因
    """
    # 获取异常节点
    anomaly_query = f"""
    g.V().has('anomaly', 'id', '{anomaly_id}')
      .project('anomaly_info', 'affected_services')
        .by(project('type', 'severity', 'start_time', 'metric')
              .by('type').by('severity').by('start_time').by('metric_name'))
        .by(out('affects').project('service_id', 'name', 'current_status')
              .by('id').by('name').by('status').fold())
    """
    anomaly_info = query_neptune(anomaly_query)
    
    # 沿调用链向上游追溯（广度优先）
    upstream_trace_query = f"""
    g.V().has('anomaly', 'id', '{anomaly_id}')
      .out('affects')
      .repeat(__.in('calls').simplePath())
      .times(5)
      .emit()
      .dedup()
      .project('service_id', 'name', 'type', 'health_status', 'metrics')
        .by('id')
        .by('name')
        .by('type')
        .by('health_score')
        .by(project('cpu', 'memory', 'latency', 'error_rate')
              .by('cpu_usage').by('memory_usage')
              .by('avg_latency').by('error_rate'))
      .fold()
    """
    upstream_chain = query_neptune(upstream_trace_query)
    
    # 查询依赖关系图
    dependency_query = f"""
    g.V().has('anomaly', 'id', '{anomaly_id}')
      .out('affects')
      .bothE('calls').has('timestamp', gte(datetime('1h')))
      .project('source', 'target', 'latency', 'error_rate', 'request_count')
        .by(outV().values('name'))
        .by(inV().values('name'))
        .by('latency_ms')
        .by('error_rate')
        .by('request_count')
      .order().by('latency', desc)
      .limit(30)
    """
    dependencies = query_neptune(dependency_query)
    
    # 查询变更历史（变更往往是根因）
    change_query = f"""
    g.V().has('anomaly', 'id', '{anomaly_id}')
      .out('affects')
      .in('changed_by')
      .project('change_id', 'type', 'description', 'time', 'author', 'rollback')
        .by('id')
        .by('change_type')
        .by('description')
        .by('timestamp')
        .by('author')
        .by('is_rolled_back')
      .order().by('time', desc)
      .limit(20)
    """
    changes = query_neptune(change_query)
    
    prompt = f"""
    请根据以下数据定位系统异常的根因：

    ## 异常信息
    {json.dumps(anomaly_info, indent=2, ensure_ascii=False)}

    ## 上游调用链（从异常节点向上追溯5层）
    {json.dumps(upstream_chain, indent=2, ensure_ascii=False)}

    ## 依赖关系与指标
    {json.dumps(dependencies, indent=2, ensure_ascii=False)}

    ## 最近变更记录
    {json.dumps(changes, indent=2, ensure_ascii=False)}

    请完成根因分析：
    1. 根因定位：基于图遍历结果，确定最可能的根因
    2. 证据链：列出支持根因结论的证据
    3. 影响范围：根因影响了哪些服务和用户
    4. 排除因素：排除了哪些其他可能性
    5. 根因分类：是代码变更、配置变更、资源耗尽还是外部依赖？
    """
    
    system = "你是一个SRE（站点可靠性工程师）专家，擅长从依赖图中定位故障根因。"
    return call_deepseek(prompt, system_message=system)
```

#### 14.6.3.3 修复建议生成

```python
def generate_remediation(anomaly_id, root_cause_result):
    """
    基于图上下文生成修复步骤
    """
    # 获取异常影响的服务拓扑
    topology_query = f"""
    g.V().has('anomaly', 'id', '{anomaly_id}')
      .out('affects')
      .aggregate('affected')
      .bothE('calls')
      .project('edge_info', 'source_health', 'target_health')
        .by(project('type', 'latency', 'error_rate')
              .by(label).by('latency_ms').by('error_rate'))
        .by(outV().values('health_score'))
        .by(inV().values('health_score'))
      .fold()
    """
    topology = query_neptune(topology_query)
    
    # 查询可用的容灾/降级策略
    strategy_query = f"""
    g.V().has('anomaly', 'id', '{anomaly_id}')
      .out('affects')
      .out('has_strategy')
      .project('strategy_name', 'type', 'effectiveness', 'rollback_time', 'risk')
        .by('name')
        .by('strategy_type')
        .by('effectiveness_score')
        .by('estimated_rollback_minutes')
        .by('risk_level')
    """
    strategies = query_neptune(strategy_query)
    
    # 查询类似历史事件的处理方案
    history_query = f"""
    g.V().has('anomaly', 'id', '{anomaly_id}')
      .out('affects')
      .in('experienced')
      .has('type', root_cause_result.get('root_cause_category', 'unknown'))
      .project('past_event', 'resolution', 'effectiveness', 'time_to_resolve')
        .by('id')
        .by('resolution_steps')
        .by('resolution_effectiveness')
        .by('minutes_to_resolve')
      .limit(5)
    """
    history = query_neptune(history_query)
    
    prompt = f"""
    请根据以下上下文生成系统异常的修复方案：

    ## 根因分析结果
    {root_cause_result}

    ## 当前服务拓扑与健康状态
    {json.dumps(topology, indent=2, ensure_ascii=False)}

    ## 可用容灾/降级策略
    {json.dumps(strategies, indent=2, ensure_ascii=False)}

    ## 类似历史事件处理方案
    {json.dumps(history, indent=2, ensure_ascii=False)}

    请生成详细的修复方案：
    1. 立即止损措施（5分钟内可执行）：
       - 流量切换/降级步骤
       - 回滚操作步骤
       - 隔离措施
    2. 根本修复方案：
       - 代码/配置修复步骤
       - 验证步骤
       - 灰度发布计划
    3. 恢复验证：
       - 如何确认修复生效
       - 关键指标恢复目标
    4. 事后改进：
       - 监控告警改进建议
       - 架构优化建议
       - 故障演练建议
    """
    
    system = "你是一个SRE专家，擅长生成可执行的故障修复方案。"
    return call_deepseek(prompt, system_message=system, max_tokens=8192)
```

### 14.6.4 使用场景

- 微服务架构的智能运维（AIOps）
- 云基础设施的故障自愈系统
- 应用性能监控（APM）的根因分析
- 网络安全事件的溯源分析
- 物联网设备异常检测

### 14.6.5 潜在风险与注意事项

- 异常子图检测的计算复杂度高，需设计采样或近似算法
- 根因定位的准确性依赖图数据的完整性和时效性
- 自动修复方案需设计人工审批环节，避免误操作
- 变更记录与异常的因果关系需谨慎判断，避免相关性谬误

### 14.6.6 本章小结

本节实现了异常检测与根因分析的完整闭环。Neptune的图模式匹配和遍历能力使系统能从拓扑角度发现传统监控无法捕捉的异常，DeepSeek的推理能力则帮助运维团队快速定位根因并获得可执行的修复方案。

---

## 14.7 综合实战：端到端智能分析平台

### 14.7.1 解决的问题

前面各节分别实现了独立场景，但在实际企业环境中，这些场景需要整合为一个统一的智能分析平台，实现数据共享、流程协同和统一管理。

### 14.7.2 核心原理

构建统一的编排层（Orchestrator），将Neptune查询、DeepSeek分析、结果缓存、权限管理等功能封装为可复用的服务组件，通过配置化方式组合不同场景的分析流水线。

### 14.7.3 代码/配置实现

```python
class NeptuneDeepSeekAnalyzer:
    """
    统一分析编排器
    """
    
    def __init__(self, neptune_endpoint, deepseek_api_key, cache_ttl=300):
        self.neptune_endpoint = neptune_endpoint
        self.deepseek_api_key = deepseek_api_key
        self.cache_ttl = cache_ttl
        self.cache = {}
        self.analysis_pipelines = {}
    
    def register_pipeline(self, name, pipeline_config):
        """注册分析流水线"""
        self.analysis_pipelines[name] = pipeline_config
    
    def execute_pipeline(self, pipeline_name, params):
        """执行分析流水线"""
        if pipeline_name not in self.analysis_pipelines:
            raise ValueError(f"Pipeline {pipeline_name} not found")
        
        pipeline = self.analysis_pipelines[pipeline_name]
        cache_key = f"{pipeline_name}:{json.dumps(params, sort_keys=True)}"
        
        # 检查缓存
        if cache_key in self.cache:
            cached = self.cache[cache_key]
            if time.time() - cached["timestamp"] < self.cache_ttl:
                return cached["result"]
        
        # 执行流水线步骤
        context = {}
        for step in pipeline["steps"]:
            step_type = step["type"]
            if step_type == "neptune_query":
                context[step["output_var"]] = query_neptune(step["query_template"].format(**params, **context))
            elif step_type == "deepseek_analyze":
                prompt = step["prompt_template"].format(**params, **context, **context)
                context[step["output_var"]] = call_deepseek(prompt, system_message=step.get("system_message", ""))
            elif step_type == "transform":
                context[step["output_var"]] = step["transform_func"](context)
        
        result = context.get(pipeline.get("output_var", "result"))
        
        # 写入缓存
        self.cache[cache_key] = {
            "result": result,
            "timestamp": time.time()
        }
        
        return result


# 注册金融风控流水线
analyzer = NeptuneDeepSeekAnalyzer(
    neptune_endpoint=NEPTUNE_ENDPOINT,
    deepseek_api_key=DEEPSEEK_API_KEY
)

analyzer.register_pipeline("financial_risk_report", {
    "steps": [
        {
            "type": "neptune_query",
            "description": "查询组合风险指标",
            "query_template": """
                g.V().has('portfolio', 'id', '{portfolio_id}')
                  .project('total_value', 'risk_score', 'concentration', 'var_95')
                    .by('total_value').by('risk_score')
                    .by('concentration_ratio').by('value_at_risk_95')
            """,
            "output_var": "risk_metrics"
        },
        {
            "type": "neptune_query",
            "description": "查询资产风险分布",
            "query_template": """
                g.V().has('portfolio', 'id', '{portfolio_id}')
                  .out('holds')
                  .project('name', 'weight', 'risk_contribution')
                    .by('name').by('weight').by('risk_contribution')
                  .order().by('risk_contribution', desc)
                  .limit(20)
            """,
            "output_var": "asset_risks"
        },
        {
            "type": "deepseek_analyze",
            "description": "生成风险报告",
            "system_message": "你是一个金融风险分析师。",
            "prompt_template": """
                请根据以下数据生成风险报告：
                
                组合指标：{risk_metrics}
                资产风险分布：{asset_risks}
                
                请生成包含风险概况、主要风险因素和建议措施的报告。
            """,
            "output_var": "result"
        }
    ],
    "output_var": "result"
})

# 执行流水线
report = analyzer.execute_pipeline("financial_risk_report", {
    "portfolio_id": "port_001"
})
```

### 14.7.4 使用场景

- 企业级智能分析中台
- 多部门共享的数据分析平台
- 自动化运营报告系统
- 智能运维控制台

### 14.7.5 潜在风险与注意事项

- 流水线编排需处理步骤间的依赖和错误传播
- 缓存策略需考虑数据时效性要求
- 多用户并发访问需设计资源隔离和限流机制
- 流水线配置需版本管理，支持回滚

### 14.7.6 本章小结

本节将前五节的独立场景整合为统一的智能分析平台，通过可配置的流水线编排，实现了图分析能力的复用和组合，为企业构建端到端的智能分析系统提供了架构参考。

---

## 14.8 总结与展望

### 14.8.1 核心收获

本章通过五大实战场景，系统展示了Neptune图数据库与DeepSeek大语言模型协同分析的技术架构和实现方法：

1. **金融数据分析**：利用图遍历检测环形交易等洗钱模式，自动生成风险报告和合规评估
2. **社交网络分析**：结合PageRank、Louvain等图算法与LLM语义理解，生成用户画像和社区洞察
3. **知识图谱Q&A**：DeepSeek作为自然语言到图查询的翻译器，实现多跳推理问答
4. **供应链分析**：Betweenness Centrality识别瓶颈，LLM生成优化建议
5. **异常检测与根因分析**：图模式匹配发现异常，图遍历定位根因，LLM生成修复方案

### 14.8.2 最佳实践总结

- **数据分层**：原始数据在Neptune中存储和计算，仅将聚合特征和查询结果传递给DeepSeek
- **查询优化**：使用Neptune的索引和分区策略优化图查询性能，避免全图扫描
- **Prompt工程**：为每个场景设计专门的System Prompt，控制输出格式和质量
- **缓存策略**：对高频查询结果进行缓存，减少Neptune和DeepSeek的调用次数
- **人工审核**：关键决策场景保留人工审核环节，LLM输出作为辅助参考

### 14.8.3 未来方向

- **Agent化**：将分析流程封装为自主Agent，支持多轮交互和动态调整分析策略
- **流式分析**：结合Neptune的实时更新能力与DeepSeek的流式输出，实现实时异常告警
- **多模态扩展**：在图+文本的基础上，引入时序数据和知识图谱的联合分析
- **联邦分析**：在数据不出域的前提下，实现跨组织的协同图分析
- **自动化调优**：利用DeepSeek自动优化Gremlin查询性能和Prompt模板

### 14.8.4 本章小结

Neptune与DeepSeek的结合代表了数据分析的一个重要方向：图数据库提供结构化的关联分析能力，大语言模型注入语义理解和自然语言生成能力。这种"结构+语义"的双引擎模式，正在重新定义企业数据分析的边界和可能性。随着图算法和LLM技术的持续演进，两者的融合将催生更多创新的分析场景和应用形态。
