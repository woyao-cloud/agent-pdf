# 第7章 推荐系统（Recommendation System）

## 本章导读

推荐系统可能是 TensorFlow 在生产环境中"最赚钱"的应用——电商的商品推荐、短视频的 Next Video、新闻的信息流推荐，背后都是推荐模型。推荐系统的核心问题只有一个：**在大量候选物品中，找到用户最可能感兴趣的那几个**。

```
推荐系统在电商中的应用：

  用户登录淘宝 → 首页 Feed 流 → 10 万商品候选
    │                          │
    │ 召回阶段（粗筛）             │
    │ 从 10 万 → 1000           │
    │ 方法：协同过滤、双塔模型     │
    │                          │
    │ 排序阶段（精排）             │
    │ 从 1000 → 10              │
    │ 方法：DeepFM、Wide&Deep    │
    │                          │
    │ 重排序阶段（业务干预）        │
    │ 从 10 → 最终展示           │
    │ 多样性、已购买过滤          │
```

---

## 7.1 实现原理：Wide & Deep + DeepFM

### Wide & Deep 模型

Google 在 2016 年提出的 Wide & Deep 模型将"记忆能力"和"泛化能力"结合：

```
Wide & Deep 架构：

  输入特征                   输出
    │                        │
    ├── Wide 部分（记忆） ────┤
    │  ┌──────────────────┐ ││
    │  │ 交叉特征变换       │─┤│
    │  │ gender=男 & item=手机│ ││
    │  └──────────────────┘ ││
    │                        ├──→ Sigmoid → CTR 预估
    ├── Deep 部分（泛化） ──┤│
    │  ┌──────────────────┐ ││
    │  │ Dense 256 → 128  │─┤│
    │  │ 自动学习特征交互   │ ││
    │  └──────────────────┘ ││
    │                        │
    Wide 部分：记住"男性购买手机"这个特定模式
    Deep 部分：学习"年轻用户喜欢电子产品"这个抽象规律
```

---

## 7.2 潜在风险

### 冷启动问题

```
新用户（无历史行为）→ 怎么推荐？

  无解方案：
  "推荐热门商品" → 对新用户没有个性化
  "推荐同类用户喜欢的" → 不知道用户属于哪类

  实际方案：
  - 用用户画像特征（年龄/性别/地域）替代行为特征
  - 先用热门推荐兜底，收集到 10 次点击后再切到个性化模型
  - 探索与利用（ε-greedy）：10% 的流量推荐随机内容
```

---

## 7.3 优化方案

### 双塔模型（Two-Tower）——大规模召回

```python
# 双塔模型：用户塔 + 物品塔，分别计算向量，用点积做相似度
import tensorflow as tf

# 用户特征
user_id = tf.keras.Input(shape=(1,), name='user_id')
user_gender = tf.keras.Input(shape=(1,), name='user_gender')

# 物品特征
item_id = tf.keras.Input(shape=(1,), name='item_id')
item_category = tf.keras.Input(shape=(1,), name='item_category')

# 用户塔
user_embed = tf.keras.layers.Embedding(100000, 64)(user_id)
user_embed = tf.keras.layers.Flatten()(user_embed)
gender_embed = tf.keras.layers.Embedding(3, 8)(user_gender)
gender_embed = tf.keras.layers.Flatten()(gender_embed)
user_vector = tf.keras.layers.Dense(32, activation='relu')(
    tf.keras.layers.Concatenate()([user_embed, gender_embed]))

# 物品塔
item_embed = tf.keras.layers.Embedding(100000, 64)(item_id)
item_embed = tf.keras.layers.Flatten()(item_embed)
cat_embed = tf.keras.layers.Embedding(1000, 16)(item_category)
cat_embed = tf.keras.layers.Flatten()(cat_embed)
item_vector = tf.keras.layers.Dense(32, activation='relu')(
    tf.keras.layers.Concatenate()([item_embed, cat_embed]))

# 相似度（点积）
score = tf.keras.layers.Dot(axes=1)([user_vector, item_vector])
output = tf.keras.layers.Activation('sigmoid')(score)

model = tf.keras.Model([user_id, user_gender, item_id, item_category], output)
model.compile(optimizer='adam', loss='binary_crossentropy')

print(model.summary())
```

---

## 本章总结

| 风险 | 解决方案 |
|------|---------|
| 冷启动 | 用户画像特征 + 热门兜底 + ε-greedy |
| 特征稀疏 | FM 层自动特征交叉 |
| 实时性要求 | 双塔模型 + 向量检索（FAISS）|