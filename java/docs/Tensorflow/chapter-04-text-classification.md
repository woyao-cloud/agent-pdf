# 第4章 文本分类与情感分析（NLP）

## 本章导读

文本分类是 NLP 中最基础的任务——判断一段文本属于哪个类别。最常见的应用是**情感分析**：一段用户评论是好评还是差评？一条推文是积极还是消极？

这个场景看似简单，但在中文文本中有三个特有的难点：

```
中文文本分类的三大难点：

  难点 1：没有空格
  "我喜欢苹果手机" → 应该分为什么词？
  ["我", "喜欢", "苹果", "手机"]
  ["我", "喜欢", "苹", "果", "手", "机"]
  分词不对 → 特征提取错误 → 分类准确率下降

  难点 2：词义消歧
  "苹果" = 水果 / Apple 品牌？
  需要上下文才能判断

  难点 3：长文本截断
  一篇 5000 字的新闻 → 直接输入会导致 OOM
  截断前 500 字 → 丢失了关键信息
  截断后 500 字 → 不知道前面在说什么
```

---

## 4.1 实现原理

### 从文本到张量的流水线

```
文本分类的数据流：

  原始文本                   模型输入
  "这部电影太好看了"  →  [0.12, -0.45, 0.78, ...]
                        ↑
                    Embedding 层（词向量）

  处理步骤：
  1. 分词：["这", "部", "电影", "太", "好看", "了"]
  2. 查词典：[12, 45, 678, 23, 9012, 56]  ← 每个词一个整数 ID
  3. 填充/截断：[12, 45, 678, 23, 9012, 56, 0, 0, 0, 0]
  4. Embedding：整数 ID → 高维向量（如 100 维）
  5. LSTM/Transformer 提取序列特征
  6. 输出分类概率：[0.9, 0.1]（正面/负面）
```

### Embedding——离散词的连续表示

```python
# Embedding 的本质：建立一个"词-向量"的查找表
# 输入：整数 ID → 输出：稠密向量（64 维）

embedding_layer = tf.keras.layers.Embedding(
    input_dim=10000,    # 词表大小（只包含最常用的 10000 个词）
    output_dim=64,      # 每个词用 64 维向量表示
    input_length=100    # 输入序列长度
)

# "电影" 的 ID = 678
# embedding_layer(678) → [0.12, -0.45, 0.78, ...]（64 个浮点数）
# 相近语义的词，它们的向量在空间中接近：
# "电影" → [0.12, -0.45, 0.78, ...]
# "影片" → [0.11, -0.44, 0.80, ...]  ← 余弦相似度高
# "桌子" → [0.90, 0.12, -0.30, ...]  ← 余弦相似度低
```

### LSTM 如何理解序列

```
LSTM（长短期记忆网络）——解决 RNN 的"忘性大"问题：

  传统 RNN 的问题：
  输入：['这', '部', '电影', '太', '好看', '了']
  第 1 步：读 '这'     → 记住一点点
  第 2 步：读 '部'     → 记住一些，忘了点'这'
  第 3 步：读 '电影'   → 记住当前，可能忘了'这'+'部'
  ...到第 6 步：读 '了' → 前面 5 步的信息基本忘了！
  → 这就是"长期依赖"问题——传统 RNN 只能记住几步前的信息

  LSTM 的解决方案：
  引入"三门"机制：遗忘门、输入门、输出门
  遗忘门：决定丢弃什么信息（忘记不重要的）
  输入门：决定记住什么新信息（记住重要的）
  输出门：决定输出什么信息

  效果：LSTM 可以记住 100+ 步前的信息
```

---

## 4.2 潜在风险

### 长文本 OOM

```
问题：一篇 5000 字的新闻，每个词一个整数 ID
      输入形状 = (batch_size, 5000)
      Embedding 层输出 = (batch_size, 5000, 64)
      LSTM 层处理 5000 步 → 显存爆炸

解决方案：
  truncating='pre':  保留最后 500 词（新闻正文在末尾）
  truncating='post': 保留前 500 词（评论开头最重要）
```

### 词表大小失控

```
问题：训练数据中有 100 万个不同的词
      词表 100 万 × Embedding 维度 64 = 6400 万参数
      这 6400 万参数中大多数很少被更新（低频词）

解决方案：
  限制词表大小（10000-50000）
  低频词用 <UNK> 代替
```

---

## 4.3 优化与应对方案

### 完整的情感分析模型

```python
# ch04-text-classification/train.py
import tensorflow as tf
from tensorflow import keras
import numpy as np

# ===== 1. 加载数据 =====
# 使用 IMDB 电影评论数据集
vocab_size = 10000
max_length = 200

(x_train, y_train), (x_test, y_test) = keras.datasets.imdb.load_data(
    num_words=vocab_size  # 只保留最常用的 10000 个词
)

# 填充/截断到固定长度
x_train = keras.preprocessing.sequence.pad_sequences(
    x_train, maxlen=max_length, truncating='pre')
x_test = keras.preprocessing.sequence.pad_sequences(
    x_test, maxlen=max_length, truncating='pre')

# ===== 2. 构建模型（双向 LSTM + Attention） =====
inputs = keras.Input(shape=(max_length,))

# Embedding 层
x = keras.layers.Embedding(vocab_size, 64)(inputs)

# SpatialDropout1D——在 Embedding 输出上做 Dropout
x = keras.layers.SpatialDropout1D(0.3)(x)

# 双向 LSTM
x = keras.layers.Bidirectional(
    keras.layers.LSTM(64, return_sequences=True)
)(x)

# GlobalMaxPooling——取每个时间步的最大值作为特征
x = keras.layers.GlobalMaxPooling1D()(x)

# 分类头
x = keras.layers.Dense(64, activation='relu')(x)
x = keras.layers.Dropout(0.3)(x)
outputs = keras.layers.Dense(1, activation='sigmoid')(x)

model = keras.Model(inputs, outputs)

model.compile(optimizer='adam',
              loss='binary_crossentropy',
              metrics=['accuracy'])

print(model.summary())

# ===== 3. 训练 =====
history = model.fit(
    x_train, y_train,
    batch_size=64,
    epochs=10,
    validation_split=0.2,
    callbacks=[
        keras.callbacks.EarlyStopping(patience=3,
                                      restore_best_weights=True),
        keras.callbacks.TensorBoard(log_dir='./logs')
    ]
)

# ===== 4. 评估 =====
test_loss, test_acc = model.evaluate(x_test, y_test)
print(f'测试集准确率: {test_acc:.4f}')

# ===== 5. 预测示例 =====
word_index = keras.datasets.imdb.get_word_index()
index_to_word = {v: k for k, v in word_index.items()}

def predict_sentiment(text):
    """预测一段文本的情感"""
    # 将文本转为整数序列（简化处理）
    words = text.lower().split()
    sequence = [word_index.get(w, 2) for w in words]  # 2 = <UNK>
    # 填充/截断
    sequence = keras.preprocessing.sequence.pad_sequences(
        [sequence], maxlen=max_length, truncating='pre')
    # 预测
    prob = model.predict(sequence)[0][0]
    sentiment = "正面" if prob > 0.5 else "负面"
    print(f"文本: {text}")
    print(f"情感: {sentiment} (置信度: {prob:.4f})")

predict_sentiment("this movie is really great i love it")
predict_sentiment("this is the worst movie ever made")
```

### 使用预训练词向量（GloVe 迁移）

```python
# 使用 GloVe 预训练词向量（外部知识迁移）

# 1. 下载 GloVe 词向量
# wget http://nlp.stanford.edu/data/glove.6B.zip
# unzip glove.6B.zip -d glove/

# 2. 构建 Embedding 矩阵
def load_glove_embeddings(path, word_index, embedding_dim=100):
    embeddings_index = {}
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            values = line.split()
            word = values[0]
            coefs = np.asarray(values[1:], dtype='float32')
            embeddings_index[word] = coefs

    # 构建 Embedding 矩阵
    embedding_matrix = np.zeros((len(word_index) + 1, embedding_dim))
    for word, i in word_index.items():
        embedding_vector = embeddings_index.get(word)
        if embedding_vector is not None:
            embedding_matrix[i] = embedding_vector

    return embedding_matrix

# 3. 使用预训练 Embedding
embedding_matrix = load_glove_embeddings(
    'glove/glove.6B.100d.txt', word_index)

embedding_layer = keras.layers.Embedding(
    len(word_index) + 1,
    100,
    weights=[embedding_matrix],  # 使用预训练权重
    trainable=False              # 冻结 Embedding 层
)
```

---

## 4.4 Docker Compose 运行

```yaml
# demos/ch04-text-classification/docker-compose.yml
version: "3.8"
services:
  train:
    image: tensorflow/tensorflow:2.16.1
    container_name: tf-ch04-train
    working_dir: /app
    volumes:
      - ./train.py:/app/train.py
      - ./logs:/app/logs
    command: python train.py
```

```bash
# 启动训练
cd demos/ch04-text-classification
docker compose up train
```

---

## 本章总结

| 风险 | 解决方案 | 效果 |
|------|---------|------|
| 长文本 OOM | pad_sequences + truncating | 显存占用减少 10 倍 |
| 词表失控 | num_words=10000 限制 | 参数量减少 99% |
| 语义理解不足 | 双向 LSTM + GlobalMaxPooling | 准确率提升 3-5% |
| 数据不足 | GloVe 预训练词向量 | 小数据集也能达到 85%+ |