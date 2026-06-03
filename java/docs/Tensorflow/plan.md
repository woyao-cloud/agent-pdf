# 《精通 TensorFlow：核心场景、原理实战与生产部署》大纲

## 本书定位

面向有 Python/Java 基础的开发者，以**生产级实战**为导向，覆盖 TensorFlow 2.x 最核心的应用场景，提供可直接运行的 Docker Compose 环境。

---

## 第一部分：TensorFlow 基础与开发环境

### 第1章 TensorFlow 概述与环境搭建
* **1.1 TensorFlow 生态全景**
  * TensorFlow 2.x vs 1.x 核心变化（Eager Execution、Keras 集成）
  * TF 生态：Keras、TF Serving、TFLite、TF.js、TFX
* **1.2 开发环境搭建**
  * Docker Compose 一键启动（CPU/GPU 两种配置）
  * VS Code Dev Containers 开发配置
* **1.3 TensorFlow 基础概念速成**
  * Tensor（张量）、Operation（操作）、Graph（计算图）
  * `tf.function` 与 AutoGraph 机制
  * Keras 模型构建三板斧：Sequential / Functional / Subclassing
  * 数据管道：`tf.data.Dataset` 核心用法

---

## 第二部分：八大核心应用场景实战

### 第2章 图像分类（Image Classification）
* **2.1 场景说明**：商品图片分类、医疗影像诊断、质检图像分拣
* **2.2 实现原理**：CNN 卷积神经网络、池化层、全连接层
* **2.3 潜在风险**：
  * 过拟合（数据量不足时严重）
  * 类别不平衡（某些类别样本极少）
  * 输入尺寸不一致导致性能波动
* **2.4 优化方案**：
  * 数据增强（`tf.keras.preprocessing.image.ImageDataGenerator`）
  * 迁移学习（`tf.keras.applications` 内置预训练模型）
  * 学习率调度与早停
* **2.5 示例代码**：CIFAR-10 / 猫狗分类完整代码 + Docker Compose 训练环境

### 第3章 目标检测（Object Detection）
* **3.1 场景说明**：自动驾驶行人检测、安防监控、工业缺陷检测
* **3.2 实现原理**：SSD / YOLO / Faster R-CNN 原理简要对比
* **3.3 潜在风险**：
  * 小目标检测精度低
  * 推理速度不满足实时要求
  * Anchor Box 参数不匹配目标分布
* **3.4 优化方案**：
  * TensorFlow Object Detection API 使用
  * TFLite 模型量化加速
  * 非极大值抑制（NMS）阈值调优
* **3.5 示例代码**：基于 TF Object Detection API 的训练 + 推理

### 第4章 文本分类与情感分析（NLP）
* **4.1 场景说明**：垃圾短信过滤、评论情感分析、新闻自动分类
* **4.2 实现原理**：词嵌入（Embedding）、LSTM/GRU、Transformer
* **4.3 潜在风险**：
  * 长文本 OOM（序列长度过长）
  * 词表大小失控
  * 类别不均衡 + 罕见词处理
* **4.4 优化方案**：
  * `tf.keras.layers.TextVectorization` 标准化预处理
  * 双向 LSTM + Attention 机制
  * 预训练词向量（GloVe 迁移）
* **4.5 示例代码**：IMDB 情感分析 + Docker 训练环境

### 第5章 序列到序列与机器翻译（Seq2Seq）
* **5.1 场景说明**：机器翻译、文本摘要、语音识别
* **5.2 实现原理**：Encoder-Decoder 架构、Attention 机制
* **5.3 潜在风险**：
  * Beam Search 解码速度瓶颈
  * OOV（未登录词）问题
  * 长序列梯度消失
* **5.4 优化方案**：
  * Transformer 替代 RNN
  * BPE（字节对编码）子词分词
  * Teacher Forcing 与 Scheduled Sampling
* **5.5 示例代码**：英中翻译 + Docker Compose 训练

### 第6章 时间序列预测（Time Series）
* **6.1 场景说明**：股票价格预测、流量预测、设备故障预警
* **6.2 实现原理**：LSTM / CNN + Attention / TFT
* **6.3 潜在风险**：
  * 序列数据泄露（时间穿越）
  * 多步预测误差累积
  * 季节性/趋势未消除导致模型偏差
* **6.4 优化方案**：
  * 时间序列交叉验证（时间窗口分割）
  * 多输出预测与 Direct Multi-Step
  * 特征工程：滞后特征 + 时间特征
* **6.5 示例代码**：电力负荷预测 + Docker Compose

### 第7章 推荐系统（Recommendation System）
* **7.1 场景说明**：短视频推荐、电商商品推荐、新闻推送
* **7.2 实现原理**：协同过滤、矩阵分解、DeepFM、Wide & Deep
* **7.3 潜在风险**：
  * 冷启动问题（新用户/新商品）
  * 特征稀疏导致模型不收敛
  * 实时性要求高（秒级更新）
* **7.4 优化方案**：
  * 双塔模型（Two-Tower）实时召回
  * 特征交叉（FM 层 + DNN 层）
  * 负采样策略优化
* **7.5 示例代码**：MovieLens 推荐 + Docker Compose 训练

### 第8章 生成式模型（GANs/VAEs）
* **8.1 场景说明**：图像生成、数据增强、超分辨率
* **8.2 实现原理**：生成器与判别器的对抗训练
* **8.3 潜在风险**：
  * 模式崩塌（Mode Collapse）
  * 训练不稳定（判别器太强/太弱）
  * 生成质量评估困难
* **8.4 优化方案**：
  * WGAN-GP（梯度惩罚）
  * 标签平滑（Label Smoothing）
  * 渐进式增长训练（ProGAN）
* **8.5 示例代码**：DCGAN 生成手写数字 + Docker Compose

### 第9章 模型部署与推理优化（Production）
* **9.1 场景说明**：在线推理服务、移动端部署、边缘计算
* **9.2 实现原理**：TF SavedModel 格式、TF Serving、TFLite
* **9.3 潜在风险**：
  * 模型过大内存不足
  * 推理延迟超时
  * 版本管理混乱（模型版本兼容）
* **9.4 优化方案**：
  * 模型量化（Post-Training Quantization）
  * TF Serving 批处理（batch）配置
  * Docker + K8s 模型部署模板
* **9.5 示例代码**：TF Serving Docker Compose + gRPC/REST 客户端

---

## 第三部分：模型调优与生产排坑

### 第10章 模型训练性能调优
* **10.1 GPU 利用率优化**
  * `tf.data` 流水线优化（prefetch / map / cache / batch）
  * 混合精度训练（mixed_float16）
  * 分布式策略（MirroredStrategy / MultiWorkerMirroredStrategy）
* **10.2 显存管理**
  * 显存增长模式（`tf.config.experimental.set_memory_growth`）
  * 梯度累积模拟大 Batch
* **10.3 超参数调优**
  * Keras Tuner 自动搜索
  * 学习率预热 + 余弦退火

### 第11章 典型问题排查指南
* **11.1 模型不收敛**
  * 梯度消失/爆炸（梯度裁剪、BatchNorm）
  * 学习率过大/过小
  * 损失函数选择不当
* **11.2 NaN Loss**
  * 除零错误（加 epsilon）
  * log(0) 问题（ClipByValue）
  * 学习率过大
* **11.3 过拟合**
  * Dropout / L2 正则化 / 数据增强
  * 早停（EarlyStopping）与 ReduceLROnPlateau
* **11.4 GPU OOM**
  * Batch Size 调小
  * 混合精度
  * Gradient Checkpointing

### 第12章 开发者必备技能
* **12.1 TensorFlow 调试技巧**
  * `tf.debugging` 断言工具
  * TensorBoard 可视化（Scalars / Graphs / Histograms / Embeddings）
  * `tf.print` 与 eager 模式调试
* **12.2 模型版本管理**
  * SavedModel 格式与签名定义
  * `tf.saved_model.save` / `load`
  * 模型注册表设计
* **12.3 MLOps 基础**
  * TFX 管线概览
  * MLflow 实验跟踪
  * 模型 A/B 测试

---

## 附录
* **附录A**：Docker Compose 环境速查（CPU/GPU 切换、Jupyter 配置）
* **附录B**：TensorFlow 常用 API 速查表（Layer / Loss / Optimizer / Metric）
* **附录C**：TensorBoard 可视化指南
* **附录D**：常见面试题与架构师级解答

---

## Docker Compose 演示结构

```
docs/Tensorflow/demos/
├─ docker-compose.yml          # 共享基础设施（Jupyter + TF Serving）
├─ .env                        # 环境变量
├─ ch02-image-classification/  # 第2章 图像分类
│  ├─ README.md
│  ├─ train.py
│  └─ Dockerfile
├─ ch03-object-detection/      # 第3章 目标检测
│  ├─ ...
├─ ch04-text-classification/   # 第4章 文本分类
│  ├─ ...
├─ ch05-seq2seq/               # 第5章 机器翻译
│  ├─ ...
├─ ch06-timeseries/            # 第6章 时间序列
│  ├─ ...
├─ ch07-recommendation/        # 第7章 推荐系统
│  ├─ ...
├─ ch08-gan/                   # 第8章 生成式模型
│  ├─ ...
├─ ch09-model-serving/         # 第9章 模型部署
│  ├─ docker-compose.yml       # TF Serving + 客户端
│  ├─ model/                   # 预训练模型
│  └─ client.py                # gRPC/REST 客户端
└─ README.md
```