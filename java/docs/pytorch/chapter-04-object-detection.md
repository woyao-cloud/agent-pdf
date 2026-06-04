# 第4章 目标检测（Object Detection）

## 本章导读

想象你正在开发一个自动驾驶系统的**行人检测模块**。摄像头以每秒 30 帧的速度捕捉前方画面，你的任务是在每一帧中找出所有行人，并用方框标出他们的位置。这听起来跟第 3 章的图像分类差不多——但有个关键区别：

```
图像分类 vs 目标检测：

  分类（第3章）：
  ┌──────────────────────┐
  │                      │
  │   一张图里有行人      │
  │   输出："行人" ✓     │
  │   但行人在哪？不知道！ │
  └──────────────────────┘

  检测（本章）：
  ┌──────────────────────┐
  │                      │
  │   ┌──┐               │
  │   │行│               │
  │   │人│               │
  │   └──┘  ┌──┐        │
  │         │汽│        │
  │         │车│        │
  │         └──┘        │
  └──────────────────────┘
  输出：[{"行人", x1,y1,x2,y2}, {"汽车", x3,y3,x4,y4}]
  既要知道"是什么"，还要知道"在哪里"
```

本章使用 PyTorch 的 `torchvision` 库中预训练的 Faster R-CNN 模型来实现目标检测，并详细讲解 Anchor Box、NMS（非极大值抑制）和 FPN（特征金字塔网络）这三个核心概念。

---

## 4.1 实现原理：Faster R-CNN 与 Anchor Box

### 从图像到检测框的三步走

一个典型的目标检测模型（Faster R-CNN）的工作流程可以分为三步：

```
Faster R-CNN 推理流程：

  输入图像 (800×600×3)
    │
    ▼
  第一步：Backbone 提取特征
  ┌──────────────────────────────────────────────┐
  │  ResNet-50 + FPN → 多尺度特征图                │
  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    │
  │  │ 200×150 │ 100×75 │  50×38 │  25×19 │    │
  │  └──────┘  └──────┘  └──────┘  └──────┘    │
  │  小尺度特征图 → 检测大物体                      │
  │  大尺度特征图 → 检测小物体                      │
  └──────────────────────────────────────────────┘
    │
    ▼
  第二步：RPN（区域提议网络）生成候选框
  ┌──────────────────────────────────────────────┐
  │  在特征图的每个位置放置 Anchor Box（预设框）     │
  │  ┌──────┬──────┬──────┐                      │
  │  │ □ □□ │ □ □□ │      │  □ = 小框(检测小物体)│
  │  │ □ □□ │ □ □□ │      │  □□ = 大框(大物体)  │
  │  └──────┴──────┴──────┘                      │
  │  每个 Anchor 预测：是否有物体 + 框的偏移量      │
  └──────────────────────────────────────────────┘
    │
    ▼
  第三步：分类 + 回归 + NMS
  ┌──────────────────────────────────────────────┐
  │  对每个候选框：                                │
  │  - 分类：框中物体属于哪一类（人/车/猫...）      │
  │  - 回归：微调框的位置和大小                     │
  │  - NMS：去除重复框                             │
  └──────────────────────────────────────────────┘
    │
    ▼
  输出：检测结果
```

### Anchor Box——目标检测的"预设框"

Anchor Box 是理解目标检测最关键的概念。它的想法很直观：**在图像上预先放置大量不同大小和形状的框，然后判断每个框里有没有物体，有的话是什么**。

```
Anchor Box 的直观理解：

  假设特征图是 50×38 的大小：
  每个网格点放置 9 个 Anchor Box（3 种大小 × 3 种比例）：
  小框(32²)    中框(64²)    大框(128²)
  ┌──┐         ┌────┐      ┌────────┐
  │  │         │    │      │        │
  └──┘         └────┘      └────────┘
   正方形        正方形       正方形（以及高瘦、矮胖变体）

  总 Anchor 数 = 50 × 38 × 9 ≈ 17,100 个预设框

  训练时：与真实框重合度 > 70% 的 Anchor → 正样本
          与真实框重合度 < 30% 的 Anchor → 负样本
```

### NMS（非极大值抑制）——去除重复框

```
NMS 过程：
  步骤 1：按置信度排序 [0.92, 0.88, 0.85, 0.78, 0.65]
  步骤 2：取最高的 0.92，去除与其 IoU > 0.5 的框
  步骤 3：从剩余中再取最高的，重复
  NMS 后只保留置信度最高的框
```

### FPN——小目标检测的关键

```
传统方法只在最后一层特征图上检测：
  小物体经过 5 次下采样后只剩不到 1 个像素——信息丢失

  FPN 在每一层都做检测并融合：
  小尺度图→检测大物体，大尺度图→检测小物体
  小物体召回率从 30% → 55%
```

---

## 4.2 使用 torchvision 预训练模型

### 完整推理代码

```python
import torch
import torchvision
from torchvision.models.detection import fasterrcnn_resnet50_fpn
from PIL import Image
from torchvision.transforms import functional as F
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np

# 1. 加载 COCO 预训练模型（80 类，mAP ≈ 37%）
model = fasterrcnn_resnet50_fpn(pretrained=True)
model.eval()
model = model.cuda()

# 2. 加载图像
img = Image.open('test.jpg').convert('RGB')
img_tensor = F.to_tensor(img).unsqueeze(0).cuda()

# 3. 推理
with torch.no_grad():
    predictions = model(img_tensor)

boxes = predictions[0]['boxes'].cpu().numpy()
scores = predictions[0]['scores'].cpu().numpy()
labels = predictions[0]['labels'].cpu().numpy()

# 4. 筛选高置信度结果
valid = scores > 0.5
filtered_boxes, filtered_scores, filtered_labels = boxes[valid], scores[valid], labels[valid]
print(f"检测到 {len(filtered_boxes)} 个目标")
```

**代码关键点**：
- `model.eval()` — 必须调用，否则 BatchNorm/Dropout 行为错误
- `torch.no_grad()` — 禁用梯度计算，推理显存节省 75%
- 置信度阈值 0.5 是通用平衡点；自动驾驶场景应降到 0.3（宁误勿漏）

---

## 4.3 潜在风险

| 风险 | 根因 | 解决方案 |
|------|------|---------|
| 小目标漏检 | 下采样后信息丢失 | FPN（torchvision 已内置）|
| 推理慢 (15fps) | Faster R-CNN 候选框多 | 换 YOLOv5s / SSD / 跳帧 |
| NMS 误删紧密物体 | IoU 阈值太小 | `torchvision.ops.nms(..., iou_threshold=0.3)` |
| 置信度不合理 | 阈值不适配场景 | 自动驾驶 0.3，安防 0.7 |

---

## 本章总结

1. **检测比分类多一层"位置"维度**——理解 Anchor Box 是第一步
2. **小目标检测没有银弹**——FPN 改善但无法完全解决
3. **阈值根据业务调**——自动驾驶宁误勿漏，安防宁漏勿误
4. **Faster R-CNN 精度最高但慢**——实时场景换 YOLO/SSD