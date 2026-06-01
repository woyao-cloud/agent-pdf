# 第3章 场景一：电商/内容平台的复杂全文检索

## 本章导读

在电商平台搜索"苹果手机"，你期望看到的是 iPhone 15 Pro、iPhone 14 这些商品。但如果搜索结果是"苹果汁"+"手机壳"呢？这就是分词不准导致的典型问题——搜索系统把"苹果手机"拆成了"苹果"和"手机"，于是包含了"苹果"和"手机"的商品都被返回了。

一个电商搜索系统的"好"与"差"，日常使用的感受差异极大：

```
一个差的搜索结果：
  搜索"苹果手机"
  结果 1：苹果汁（标价 9.9 元）
  结果 2：手机壳 - 透明防摔
  结果 3：青苹果 5 斤装
  结果 4：iPhone 15 Pro Max（终于对了，但排在第 4）
  → 用户：这什么垃圾搜索？

一个好的搜索结果：
  搜索"苹果手机"
  结果 1：Apple iPhone 15 Pro Max 256GB（销量 10 万+）
  结果 2：Apple iPhone 14 128GB（销量 5 万+）
  结果 3：Apple iPhone 15 手机壳（虽然是配件，但高度相关）
  → 用户：对了！而且最火的排在最前面
```

从"差的搜索"到"好的搜索"，ES 提供了 Analyzer（分词器）、Bool Query（组合查询）、Function Score（干预评分）三大武器。本章将深入讲解如何用好这三件武器，构建一个生产级的电商搜索系统。

---

## 3.1 实现原理

### Analyzer——搜索质量的"起跑线"

分词器决定了你搜索的"基本盘"。分词器的设计分为三个阶段：

```
Analyzer 的三阶段工作流程：

  输入文本："苹果手机15ProMax"

  阶段 1：Character Filter（字符过滤器）
          将 HTML 标签、特殊字符做预处理
          → "苹果手机15ProMax"

  阶段 2：Tokenizer（分词器）
          将字符串拆分为多个 Token
          标准分词器：["苹果手机15ProMax"]
          IK 分词器：["苹果", "手机", "15", "Pro", "Max"]
          区别：标准分词器按空格和标点切分，对中文无能为力

  阶段 3：Token Filter（Token 过滤器）
          对 Token 做处理
          如：小写化 → ["苹果", "手机", "15", "pro", "max"]
          如：同义词 → ["苹果", "手机", "15", "pro", "max", "iphone"]
```

### 中文分词的难题

中文与英文的最大不同是：**没有空格**。在英文中搜索"apple phone"天然会被空格分成两个词。但"苹果手机"是一个连续字符串，分词器必须在没有空格的情况下猜测"苹果"和"手机"是两个词。这就是中文分词的核心难题——**歧义切分**。

```
中文分词的歧义问题：

  IT 行业："云计算" → 应该分为 ["云", "计算"]，还是 ["云计算"]？
  医药行业："核酸检测" → 应该分为 ["核酸", "检测"]，还是 ["核酸检测"]？
  法律行业："中华人民共和国" → 应该分为 ["中华", "人民", "共和国"]，还是整个作为专有名词？

  同样的字符串，在不同行业中的分词需求完全不同。
  这就是为什么 ES 官方的 standard 分词器对中文效果很差，
  必须使用 IK 分词器等专门针对中文的分词器。
```

### IK 分词器 + 自定义词典

```json
// 安装 IK 分词器（Docker 环境）
// docker exec -it es-node1 bash
// ./bin/elasticsearch-plugin install https://github.com/medcl/elasticsearch-analysis-ik/releases/download/v7.17.7/elasticsearch-analysis-ik-7.17.7.zip

// 创建索引时指定 IK 分词器
PUT products
{
  "settings": {
    "analysis": {
      "analyzer": {
        "ik_smart_analyzer": {
          "type": "custom",
          "tokenizer": "ik_smart"   // IK 的智能切分模式
        },
        "ik_max_word_analyzer": {
          "type": "custom",
          "tokenizer": "ik_max_word" // IK 的最细粒度切分模式
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "ik_max_word",  // 索引时用最细粒度
        "search_analyzer": "ik_smart" // 搜索时用智能切分
      },
      "description": {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart"
      }
    }
  }
}

// 测试 IK 分词效果
POST products/_analyze
{
  "analyzer": "ik_max_word",
  "text": "苹果手机15ProMax最新款"
}

// 结果：
// ["苹果", "手机", "15", "Pro", "Max", "最新", "新款"]
```

```
ik_max_word vs ik_smart 的区别：

  ik_max_word（最细粒度）——用于索引时：
  输入："中华人民共和国"
  输出：["中华人民共和国", "中华人民", "中华", "华人", "人民共和国", "人民", "共和国", "共和", "国"]
  优点：不遗漏任何可能的分词组合
  缺点：索引体积大

  ik_smart（智能切分）——用于搜索时：
  输入："中华人民共和国"
  输出：["中华人民共和国"]
  优点：只保留最合理的分词
  缺点：可能漏掉一些可能的搜索匹配

  标准实践：索引时用 ik_max_word，搜索时用 ik_smart
  这样索引覆盖了所有可能的分词组合（保证召回率）
  搜索时只按最合理的方式切分（提高准确率）
```

### 自定义词典——业务特有词汇

```bash
# IK 的自定义词典文件（IKAnalyzer.cfg.xml 配置）
# 路径：/usr/share/elasticsearch/plugins/ik/config/IKAnalyzer.cfg.xml

# 业务自定义词典 main.dic
# cat /usr/share/elasticsearch/plugins/ik/config/main.dic

# 添加电商行业特有词——这样 IK 就不会错误地拆分它们
华为Mate60Pro
iPhone15ProMax
苹果手机
荣耀MagicVs
红米K70

# 添加品牌名称
华为
小米
荣耀
OPPO
vivo
一加
真我

# 热更新词典（无需重启 ES）
# 在 IKAnalyzer.cfg.xml 中配置远程词典 URL
# <entry key="remote_ext_dict">http://your-server/hot_words.dic</entry>
# 词典文件修改后，IK 每分钟自动拉取最新版本
```

---

## 3.2 潜在风险

### 风险一：中文分词歧义

```
常见的中文分词歧义：

  歧义 1：交集型歧义
  "乒乓球拍卖完了" → ["乒乓球", "拍卖", "完了"]
                  → ["乒乓", "球拍", "卖完了"]
  不同的分词方式产生完全不同的搜索结果

  歧义 2：组合型歧义
  "做手动" → ["做", "手动"]（正确拆法）
          → ["做手", "动"]（错误拆法）

  歧义 3：专有名词
  "小米手机" → ["小米", "手机"]（正确，品牌+品类）
            → ["小", "米", "手机"]（错误，当成三个独立词）
  解决方案：在自定义词典中加入"小米"、"华为"等品牌词
```

### 风险二：相关性失控

```
相关性失控的常见原因：

  场景 1：长文本字段权重过高
  搜索"苹果手机"，一篇文章中提到了 10 次"苹果"
  → 这篇文章的 _score 可能比商品标题还高
  → 解决方案：降低长文本字段的权重（`description^0.5`）

  场景 2：重复内容导致的评分异常
  有人在商品描述中堆砌关键词 "苹果手机苹果手机苹果手机..."
  → BM25 中 TF 虽然会饱和，但堆砌仍然有一定效果
  → 解决方案：对描述字段做长度限制或降低权重

  场景 3：字段类型选择错误
  对 phone_model 字段使用了 text 类型而不是 keyword
  → "iPhone15ProMax" 被分词为 ["iPhone15ProMax"]
  → "iPhone15" 也能匹配到这条结果（只要前缀匹配）
  → 精确匹配的需求变成了分词匹配
```

---

## 3.3 优化与应对方案

### 方案一：Bool Query 组合多条件

```json
// 电商搜索的核心 DSL——Bool Query 组合

GET products/_search
{
  "query": {
    "bool": {
      // must：必须匹配——影响评分
      "must": [
        {
          "multi_match": {
            "query": "{{keyword}}",
            "fields": ["title^3", "category_name^2", "description"],
            // title 权重是 description 的 3 倍
            // category_name 权重是 2 倍
            "type": "best_fields",
            "fuzziness": "AUTO"
            // fuzziness: AUTO = 对短词自动允许编辑距离 1 的拼写错误
            // 如 "iphone" 匹配 "iphone"、"iphnoe"、"ipnone"
          }
        }
      ],
      // filter：必须匹配——不计算评分，利用缓存
      "filter": [
        { "term": { "status": "上架" } },            // 仅上架商品
        { "range": { "price": { "gte": 0 } } },      // 价格 >= 0
        { "term": { "category_id": "{{category_id}}" } } // 分类筛选
      ],
      // should：满足则加分（默认可选）
      "should": [
        { "term": { "is_recommend": true } },   // 推荐商品加分
        { "term": { "is_new": true } }          // 新品加分
      ],
      // minimum_should_match：至少满足几个 should 条件
      "minimum_should_match": 0
    }
  },
  // 排序：按综合排序（_score * 业务因子）
  "sort": [
    { "_score": "desc" },
    { "sales_volume": "desc" }  // 销量高的排前面
  ]
}
```

```json
// multi_match 的三种策略

// 策略 1：best_fields（默认）——取匹配度最高的字段
// 适合：标题字段明显更重要
GET products/_search
{
  "query": {
    "multi_match": {
      "query": "苹果手机",
      "fields": ["title^3", "description"],
      "type": "best_fields"
      // 评分 = max(title 得分, description 得分)
      // ≈ 只看 title 中的匹配（因为 title 权重高）
    }
  }
}

// 策略 2：cross_fields——将多个字段视为一个整体
// 适合：搜索词的部分词在 A 字段、部分词在 B 字段
GET products/_search
{
  "query": {
    "multi_match": {
      "query": "苹果手机",
      "fields": ["title", "keywords"],
      "type": "cross_fields"
      // "苹果"在 title 中，"手机"在 keywords 中
      // cross_fields 会将它们视为一条完整匹配
    }
  }
}

// 策略 3：phrase——精确短语匹配
// 适合：搜索结果要求"苹果"和"手机"相邻出现
GET products/_search
{
  "query": {
    "multi_match": {
      "query": "苹果手机",
      "fields": ["title"],
      "type": "phrase",
      "slop": 1    // 允许"苹果"和"手机"之间间隔 1 个词
      // 如 "苹果 15 手机" → slop=1 时能匹配（中间隔了一个"15"）
    }
  }
}
```

### 方案二：Function Score——用业务指标干预相关性

搜索不能只看文本相关性，还要考虑**转化率**。一个 9.9 元的"苹果汁"在文本上很可能匹配"苹果"，但它不是用户想买的"苹果手机"。

```json
// Function Score：将销量、评分等业务指标融入评分

GET products/_search
{
  "query": {
    "function_score": {
      // 基础查询——文本相关性
      "query": {
        "multi_match": {
          "query": "苹果手机",
          "fields": ["title^3", "description"]
        }
      },
      // 业务因子——多个函数的组合
      "functions": [
        // 因子 1：销量（使用 log1p 避免销量差异过大）
        {
          "field_value_factor": {
            "field": "sales_volume",
            "factor": 0.1,
            "modifier": "log1p"
            // 公式：log(1 + 0.1 * sales_volume)
            // 销量 10000：log(1+1000) = 6.9
            // 销量 100：log(1+10) = 2.4
            // 销量 1：log(1+0.1) = 0.095
            // 100 倍销量差异 → 评分差异不到 3 倍
            // 既让热门商品靠前，又不会让文本相关性完全失效
          }
        },
        // 因子 2：评分（好评率）
        {
          "field_value_factor": {
            "field": "rating",
            "factor": 1,
            "modifier": "none"
          }
        },
        // 因子 3：新品加权（24 小时内上架的商品额外加分）
        {
          "filter": {
            "range": {
              "create_time": {
                "gte": "now-24h"
              }
            }
          },
          "weight": 1.5    // 新品额外提升 50% 的权重
        }
      ],
      // 得分计算方式：
      // sum：query_score + function1 + function2 + ...
      // multiply（默认）：query_score × function1 × function2 × ...
      // avg：（query_score + function_results）/ (1 + count)
      // max：max(query_score, function1, function2, ...)
      // min：min(query_score, function1, function2, ...)
      "score_mode": "multiply",
      // 最终得分组合方式
      "boost_mode": "multiply"
    }
  },
  "sort": [
    { "_score": "desc" }
  ]
}
```

### 方案三：Search As You Type——实时下拉提示

```json
// Search As You Type——输入时实时搜索
// 适用场景：搜索框中的下拉联想

// 1. 定义字段类型为 search_as_you_type
PUT products
{
  "mappings": {
    "properties": {
      "title": {
        "type": "search_as_you_type",
        "analyzer": "ik_max_word"
        // 自动生成 ngram 子字段
        // title._2gram → "苹果手机"
        // title._3gram → "苹果手机"
        // title._index_prefix → 支持前缀搜索
      }
    }
  }
}

// 2. 搜索时使用 match_phrase_prefix
GET products/_search
{
  "query": {
    "match_phrase_prefix": {
      "title": {
        "query": "苹果手",
        "slop": 0,
        "max_expansions": 10  // 限制最大扩展数量，控制性能
      }
    }
  }
}
```

### 方案四：Fuzzy Query——拼写纠错

```json
// Fuzzy Query——处理用户拼写错误
// 适用场景：用户打错字"iphoe"、"苹果手提"

GET products/_search
{
  "query": {
    "fuzzy": {
      "title": {
        "value": "iphoe",
        "fuzziness": "AUTO",  // AUTO = 自动计算最大编辑距离
        // 1-2 个字符的词：允许 0 次编辑
        // 3-5 个字符的词：允许 1 次编辑
        // 5+ 个字符的词：允许 2 次编辑
        "prefix_length": 1,   // 前缀长度 1，减少需要计算的候选词
        "transpositions": true // 允许换位（"iphoe" → "iphone" 就是换位）
      }
    }
  }
}
```

### Spring Boot 集成 ES 搜索

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
</dependency>
```

```java
@Service
public class ProductSearchService {

    private final ElasticsearchRestTemplate elasticsearchTemplate;

    public ProductSearchService(ElasticsearchRestTemplate template) {
        this.elasticsearchTemplate = template;
    }

    /**
     * 电商商品搜索
     */
    public SearchResult<Product> search(SearchRequest request) {
        // 1. 构建基础查询
        NativeQueryBuilder queryBuilder = NativeQuery.builder()
            .withQuery(buildBoolQuery(request))
            .withPageable(PageRequest.of(request.getPage(), request.getSize()));

        // 2. 设置排序
        if ("sales".equals(request.getSortBy())) {
            queryBuilder.withSort(Sort.by(Sort.Direction.DESC, "sales_volume"));
        } else {
            queryBuilder.withSort(Sort.by(Sort.Direction.DESC, "_score"));
        }

        // 3. 执行搜索
        SearchHits<Product> searchHits = elasticsearchTemplate.search(
            queryBuilder.build(), Product.class);

        // 4. 封装结果
        return new SearchResult<>(
            searchHits.getSearchHits().stream()
                .map(hit -> {
                    Product p = hit.getContent();
                    p.setScore(hit.getScore());
                    return p;
                }).collect(Collectors.toList()),
            searchHits.getTotalHits()
        );
    }

    private Query buildBoolQuery(SearchRequest req) {
        return Query.of(q -> q.bool(b -> {
            // must：文本匹配
            b.must(m -> m.multiMatch(mm -> mm
                .query(req.getKeyword())
                .fields("title^3", "category_name^2", "description")
                .type(TextQueryType.BestFields)
                .fuzziness("AUTO")));

            // filter：过滤条件（不参与评分计算）
            b.filter(f -> f.term(t -> t.field("status").value("上架")));
            if (req.getCategoryId() != null) {
                b.filter(f -> f.term(t -> t.field("category_id").value(req.getCategoryId())));
            }
            if (req.getMinPrice() != null) {
                b.filter(f -> f.range(r -> r.field("price").gte(JsonData.of(req.getMinPrice()))));
            }

            // should：加分条件
            if (req.getHasRecommend()) {
                b.should(s -> s.term(t -> t.field("is_recommend").value(true)));
            }

            return b;
        }));
    }
}
```

---

## 本章总结

| 技术组件 | 解决的问题 | 生产建议 |
|---------|-----------|---------|
| **IK 分词器** | 中文分词不准 | ik_max_word 索引 + ik_smart 搜索；配置自定义词典 |
| **Bool Query** | 多条件组合搜索 | must 做文本匹配、filter 做过滤、should 做加 |
| **Function Score** | 业务指标影响排序 | field_value_factor + log1p 处理销量类数据 |
| **Fuzzy Query** | 用户拼写错误 | fuzziness: AUTO + prefix_length: 1 |
| **Search As You Type** | 实时下拉提示 | 字段类型 search_as_you_type + match_phrase_prefix |

**核心原则**：
1. **搜索质量从分词开始**——80% 的搜索问题可以用"换一个好的分词器 + 自定义词典"解决
2. **filter 和 must 的区别一定要搞清楚**——filter 不计算评分、利用缓存、适合过滤条件；must 参与评分计算、适合文本匹配
3. **不要完全依赖文本相关性**——电商搜索需要把销量、评分、新品等业务因子融入评分，否则搜索结果一定不符合业务预期
4. **先在 Kibana Dev Tools 中验证 DSL，再写到代码里**——DSL 的调试在 Kibana 中比在 Java 代码中方便 100 倍