# 《精通 PyTorch：核心场景、原理实战与生产部署》大纲

---

## 第一部分：基础与环境

### 第1章 PyTorch 概述与开发环境
* **1.1 PyTorch 生态全景**
  * PyTorch 2.x 核心特性（torch.compile、Eager Mode）
  * 生态：torchvision、torchaudio、torchtext、HuggingFace、Lightning
  * PyTorch vs TensorFlow 对比分析
* **1.2 开发环境搭建**
  * Docker Compose 一键启动（CPU/GPU 两种配置）
  * Jupyter Notebook + PyTorch 开发环境

### 第2章 PyTorch 核心概念速成
* **2.1 Tensor 基础**
  * 创建、运算、GPU 迁移、与 NumPy 互转
* **2.2 Autograd 自动求导**
  * 计算图与反向传播原理
* **2.3 nn.Module 与模型构建**
  * Sequential / 自定义 Module / 参数管理
* **2.4 DataLoader 数据加载**
  * Dataset、DataLoader、Transform 流水线

---

## 第二部分：八大核心场景

### 第3章 图像分类
* **3.1 场景**：商品分类、医学影像、质检
* **3.2 原理**：CNN、残差连接、BatchNorm
* **3.3 风险**：过拟合、GPU 显存不足、类别不平衡
* **3.4 优化**：数据增强、迁移学习 torchvision.models、学习率调度
* **3.5 代码**：CIFAR-10 ResNet 训练 + Docker Compose

### 第4章 目标检测
* **4.1 场景**：自动驾驶、安防、工业缺陷
* **4.2 原理**：Faster R-CNN / YOLO 原理、Anchor Box
* **4.3 风险**：小目标检测难、推理速度、Anchor 不匹配
* **4.4 优化**：torchvision.detection、FPN、NMS 调优
* **4.5 代码**：预训练 Faster R-CNN 推理 + Docker

### 第5章 文本分类与情感分析
* **5.1 场景**：评论分析、垃圾过滤、意图识别
* **5.2 原理**：Embedding、RNN/LSTM、Transformer Encoder
* **5.3 风险**：长文本 OOM、词表失控、过拟合
* **5.4 优化**：nn.EmbeddingBag、预训练词向量、nn.TransformerEncoder
* **5.5 代码**：IMDB 情感分析 + Docker

### 第6章 序列到序列与机器翻译
* **6.1 场景**：机器翻译、摘要生成、语音识别
* **6.2 原理**：Encoder-Decoder + Attention
* **6.3 风险**：Beam Search 慢、OOV、梯度消失
* **6.4 优化**：nn.Transformer、BPE 分词、标签平滑
* **6.5 代码**：Transformer 翻译 Demo + Docker

### 第7章 时间序列预测
* **7.1 场景**：股票预测、流量预测、异常检测
* **7.2 原理**：LSTM / TCN / Transformer
* **7.3 风险**：数据泄露、误差累积、季节性未处理
* **7.4 优化**：时间分割、多步预测、特征工程
* **7.5 代码**：电力负荷预测 LSTM + Docker

### 第8章 生成对抗网络（GAN）
* **8.1 场景**：图像生成、超分辨率、数据增强
* **8.2 原理**：生成器+判别器对抗训练
* **8.3 风险**：模式崩塌、训练不稳定
* **8.4 优化**：WGAN-GP、标签平滑、梯度惩罚
* **8.5 代码**：DCGAN 生成 MNIST + Docker

### 第9章 模型部署与推理优化
* **9.1 场景**：在线推理、边缘部署
* **9.2 原理**：TorchScript / torch.fx / ONNX
* **9.3 风险**：模型过大、延迟超标、版本管理
* **9.4 优化**：量化、TorchScript 编译、批处理
* **9.5 代码**：TorchServe Docker Compose + REST 客户端

---

## 第三部分：调优与排坑

### 第10章 训练性能调优
* GPU 利用率优化（DataLoader workers、prefetch）
* 混合精度训练（torch.cuda.amp）
* 分布式训练（DDP）
* 显存管理（gradient checkpointing、accumulation）

### 第11章 典型问题排查
* Loss 不收敛、NaN、GPU OOM、过拟合

### 第12章 开发者必备技能
* TensorBoard、torchinfo、torch.jit、HuggingFace 集成