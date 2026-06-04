# 第9章 模型部署与推理优化

## 本章导读

"模型在 Jupyter 里跑得好好的，怎么部署到线上就不行了？"——这是深度学习项目上线时最常见的抱怨。

```
训练 vs 部署的"温差"：

  训练时（Jupyter Notebook）：
  ┌────────────────────────────────────────────┐
  │  1 个 batch 推理 100ms → "没问题"         │
  │  显存占满 → "重启 kernel 就好"            │
  │  模型大小 500MB → "反正服务器装得下"      │
  │  Python 环境 → "这有什么问题？"           │
  └────────────────────────────────────────────┘

  部署时（生产环境）：
  ┌────────────────────────────────────────────┐
  │  要求 < 50ms 响应                          │
  │  100 QPS → 显存只能放 2 个模型            │
  │  模型 500MB → 手机装不下，服务器也卡     │
  │  Python 环境 → "后端是 Java！"            │
  └────────────────────────────────────────────┘

  PyTorch 提供了三个解决方案来缩小这个"温差"：
  1. TorchScript — 让模型脱离 Python 运行
  2. 模型量化 — 模型大小缩小 4 倍
  3. TorchServe — 生产级模型服务
```

---

## 9.1 TorchScript——让模型脱离 Python 也能跑

PyTorch 模型需要 Python 环境才能运行。但生产环境往往不是 Python——可能是 C++、Java、Go。TorchScript 把 PyTorch 模型"编译"成一个跨平台的可执行文件。

```python
import torch

model = torch.load('model.pth')
model.eval()

# ===== 方式 1：Tracing（跟踪）——适合标准模型 =====
# 给一个样例输入，跟踪运算过程
example_input = torch.randn(1, 3, 224, 224)
traced = torch.jit.trace(model, example_input)
traced.save('model_traced.pt')

# C++ 环境直接加载（不需要 Python）：
# torch::jit::load("model_traced.pt")

# ===== 方式 2：Scripting（脚本化）——适合有 if/for 的模型 =====
scripted = torch.jit.script(model)
scripted.save('model_scripted.pt')

# ===== 加载推理（Python 或 C++ 均可） =====
loaded = torch.jit.load('model_traced.pt')
with torch.no_grad():
    output = loaded(example_input)
```

---

## 9.2 模型量化——缩小 4 倍，提速 2 倍

```python
# 训练后动态量化——最简单的优化
import torch.quantization as quant

model = torch.load('model.pth')
model.eval()

quantized = quant.quantize_dynamic(
    model,
    {torch.nn.Linear},       # 只量化全连接层
    dtype=torch.qint8         # int8 精度
)

# 效果对比：
# 原始模型：200MB, 推理 50ms (float32)
# 量化模型： 50MB, 推理 30ms (int8)
# 精度损失：< 0.5%

torch.jit.save(torch.jit.script(quantized), 'model_quantized.pt')
```

---

## 本章总结

| 手段 | 模型大小 | 推理速度 | 精度损失 | 适用场景 |
|------|---------|---------|---------|---------|
| 原始 float32 | 100% | 1x | 0% | 高精度要求 |
| TorchScript | 100% | 1-1.5x | 0% | 跨平台部署 |
| 动态量化 int8 | 25% | 1.5-2x | < 0.5% | CPU/移动端 |