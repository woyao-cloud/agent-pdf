# 第3章 目标检测（Object Detection）

## 本章导读

图像分类回答"这张图里有什么"，目标检测回答"这张图里有什么 + 在哪里"。它在自动驾驶（检测行人/车辆）、安防监控（检测入侵者）、工业质检（检测产品缺陷）中广泛应用。

```
图像分类 vs 目标检测：

  分类输出：["猫", "狗", "猫"]
  ┌──────────────────┐
  │  🐱  🐕  🐱      │
  │                   │
  │  一张图 → 类别列表 │
  └──────────────────┘

  检测输出：[{"猫", x1,y1,x2,y2}, {"狗", x1,y1,x2,y2}]
  ┌──────────────────┐
  │  ┌──┐  ┌──┐  ┌──┐│
  │  │🐱│  │🐕│  │🐱││
  │  └──┘  └──┘  └──┘│
  │  一张图 → 类别+位置 │
  └──────────────────┘
```

---

## 3.1 实现原理：SSD / YOLO

### Anchor Box——"预设的检测框"

```
Anchor Box 的工作原理：

  在特征图的每个位置放置预设框：

  ┌──────┬──────┬──────┐
  │ □ □□ │ □ □□ │      │  □ = 小 Anchor（检测小物体）
  │ □ □□ │ □ □□ │      │  □□ = 大 Anchor（检测大物体）
  ├──────┼──────┼──────┤
  │      │      │      │
  │      │      │      │
  ├──────┼──────┼──────┤
  │      │      │      │
  │      │      │      │
  └──────┴──────┴──────┘

  每个 Anchor Box 预测：
  [x, y, w, h, confidence, class1_prob, class2_prob, ...]
  x,y,w,h = 框的位置和大小
  confidence = 框内是否有物体
  class_prob = 物体属于每个类别的概率
```

---

## 3.2 潜在风险

### 小目标检测精度低

```
小目标在特征图中的"消失"：

  输入 600×600 图像中的 20×20 行人
  → 经过 5 次下采样（每次缩小 2 倍）
  → 在特征图中只剩 1×1 像素
  → 不足以区分"行人"和"噪声"

  解决方案：
  - 使用 FPN（特征金字塔网络）融合多尺度特征
  - 在更高分辨率的特征图上检测小目标
```

---

## 3.3 优化方案

### 使用 TensorFlow Object Detection API

```bash
# 安装 TF Object Detection API
pip install tensorflow-object-detection-api

# 下载预训练模型
# wget http://download.tensorflow.org/models/object_detection/ssd_mobilenet_v2_coco_2018_03_29.tar.gz
```

```python
# 使用预训练模型进行目标检测
import tensorflow as tf
import numpy as np

# 加载预训练模型
model = tf.saved_model.load('ssd_mobilenet_v2_coco/saved_model')

# 推理
def detect_objects(image_path):
    image = tf.io.read_file(image_path)
    image = tf.image.decode_jpeg(image, channels=3)
    image = tf.expand_dims(image, 0)

    result = model(image)

    # 解析结果
    boxes = result['detection_boxes'][0].numpy()      # [N, 4] 边界框
    scores = result['detection_scores'][0].numpy()     # [N] 置信度
    classes = result['detection_classes'][0].numpy()   # [N] 类别

    # 过滤低置信度检测
    valid = scores > 0.5
    return boxes[valid], classes[valid], scores[valid]

# 使用示例
# boxes, classes, scores = detect_objects('test_image.jpg')
```

---

## 本章总结

| 风险 | 解决方案 |
|------|---------|
| 小目标检测差 | FPN 多尺度特征融合 |
| 推理速度慢 | 使用 MobileNet 作为 Backbone |
| Anchor Box 不匹配 | K-Means 聚类分析训练数据中的目标尺寸分布 |