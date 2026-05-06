# 第08章 模型保存加载与 TorchScript

训练好的模型最终要离开训练脚本进入推理服务。PyTorch 提供了多条"出 Python"的路径，每条都有自己的优缺点。本章把这些路径对齐成一张全景图，帮你为不同部署场景做出正确选择。

---

## 8.1 模型导出的全景路径

```
                    ┌────────────────┐
                    │  PyTorch 模型  │
                    └───────┬────────┘
              ┌─────────────┼──────────────────────────┐
              │             │                          │
       ┌──────▼─────┐ ┌─────▼──────┐  ┌────────────────▼──────────┐
       │ state_dict │ │ TorchScript│  │  ONNX / torch.export      │
       │  (权重)    │ │ (.pt)      │  │  (跨框架 / AOT)           │
       └──────┬─────┘ └─────┬──────┘  └────────────────┬──────────┘
              │             │                          │
       ┌──────▼─────┐ ┌─────▼──────┐  ┌────────────────▼──────────┐
       │ Python     │ │ LibTorch   │  │ ONNXRuntime / TensorRT /  │
       │ 服务       │ │ C++/移动端 │  │ AOTInductor / 等          │
       └────────────┘ └────────────┘  └───────────────────────────┘
```

---

## 8.2 路径一：state_dict（最常用）

第 5、7 章已介绍过。简单总结：

```python
# 保存
torch.save(model.state_dict(), 'model.pt')

# 加载
model = MyModel(...)              # 必须先构造同结构模型
state = torch.load('model.pt', map_location='cpu', weights_only=True)
model.load_state_dict(state)
model.eval()
```

`weights_only=True`（PT 2.x 默认）只允许加载 Tensor，**禁止任意代码反序列化** —— 防止恶意 pickle。从不可信源加载的 .pt 文件务必保持开启。

### 8.2.1 仅推理服务用 state_dict 是否够？

够，也是首选 —— **只要服务端有 Python**。优势：

- 完整保留 Python 控制流、自定义 op
- 调试 = 训练时调试
- `torch.compile`、AMP 直接可用

劣势：

- 必须在服务端拥有完整的模型代码（含所有依赖）
- 启动慢（Python 解释器 + 模型构建）
- 不适合移动端 / 嵌入式

---

## 8.3 路径二：TorchScript

TorchScript 是 PyTorch 的"中间表示"+ "C++ 解释器"。把 Python 模型转成可在无 Python 环境运行的 IR。

### 8.3.1 trace 模式

```python
example_input = torch.randn(1, 3, 224, 224).cuda()
model.eval()
traced = torch.jit.trace(model, example_input)
traced.save('model_traced.pt')
```

trace 的工作方式：用一组示例输入"跑一遍"模型，记录所有 tensor 操作。**完全忽略 Python 控制流**：

```python
def forward(self, x):
    if x.sum() > 0:
        return x * 2
    return x * 3
```

trace 的版本只会保留**实际走到的那个分支**。变化的输入 shape 也会被固化（除非用 `torch.jit.trace` 的 dynamic shape 支持）。

适合：纯线性流的 CNN、ViT、不带条件分支的网络。

### 8.3.2 script 模式

```python
scripted = torch.jit.script(model)
scripted.save('model_scripted.pt')
```

`script` 是源码级转换：解析 Python AST，转成 TorchScript IR，**保留所有控制流**。但要求代码满足 TorchScript 子集（类型注解、不能用某些 Python 特性）。

适合：NLP 解码器、动态图、带条件分支的模型。

### 8.3.3 trace 与 script 混合

实践中常见组合：复杂模块用 `script`，简单纯计算用 `trace`，嵌套使用：

```python
class Wrapper(nn.Module):
    def __init__(self, simple_subnet, complex_subnet):
        super().__init__()
        self.simple = torch.jit.trace(simple_subnet, example)
        self.complex = torch.jit.script(complex_subnet)
    def forward(self, x):
        return self.complex(self.simple(x))
```

### 8.3.4 加载与运行

```python
import torch
m = torch.jit.load('model_traced.pt', map_location='cuda')
m.eval()
out = m(input_tensor)
```

C++ 端：

```cpp
#include <torch/script.h>
auto module = torch::jit::load("model_traced.pt");
module.to(torch::kCUDA);
auto out = module.forward({input}).toTensor();
```

### 8.3.5 TorchScript 的现状

PT 2.x 时代，TorchScript 处于**维护模式**：

- 仍是移动端 / C++ 服务的主力路径
- 不再是新优化的重点（重心转向 `torch.compile` / `torch.export`）
- 复杂模型 trace/script 失败时调试代价高

> **建议**：新项目如果不强求 C++/移动端，优先尝试 `torch.compile` + state_dict 部署；移动端用 ExecuTorch；TorchScript 仅在已有大量遗留代码或确实需要纯 C++ 推理时使用。

---

## 8.4 路径三：ONNX

ONNX（Open Neural Network Exchange）是跨框架的模型交换格式。可被 ONNXRuntime、TensorRT、OpenVINO 等推理引擎加载。

### 8.4.1 导出

```python
torch.onnx.export(
    model,
    example_input,
    'model.onnx',
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}},
    opset_version=17,
)
```

### 8.4.2 PT 2.x 的新 ONNX 导出

PT 2.x 引入新版导出 `torch.onnx.export(..., dynamo=True)`（基于 TorchDynamo），更稳健、支持更多算子。截至 PT 2.5 仍在演进，新项目可尝试。

### 8.4.3 ONNX 的边界

- 自定义 Python 算子需要写对应的 ONNX op 注册
- 控制流支持有限（loop / if 有但兼容性参差）
- 不同推理引擎对 op 支持不同 —— 导出时要按目标引擎选 opset

适合：跨语言 / 跨框架部署、TensorRT 加速 GPU 推理、ONNXRuntime CPU 推理。

---

## 8.5 路径四：torch.export + AOTInductor

PT 2.1+ 推出的 PyTorch 原生 AOT 编译路径，定位是"TorchScript 的现代替代"：

```python
ep = torch.export.export(model, args=(example_input,))
# ep 是一个 ExportedProgram，包含 graph + 元信息
torch.export.save(ep, 'exported.pt2')

# 加载
ep = torch.export.load('exported.pt2')
out = ep.module()(input_tensor)
```

进一步 AOT 编译成 .so 文件（无需 Python）：

```python
from torch._inductor import aoti_compile_and_package
path = aoti_compile_and_package(ep, package_path='model.pt2')

# C++/Python 加载
runner = torch._inductor.aoti_load_package('model.pt2')
out = runner(input_tensor)
```

适合：

- 服务端 C++ 推理（取代 TorchScript）
- 需要图级优化的高性能推理
- 边缘部署（与 ExecuTorch 配合）

注意 `torch.export` 仍在快速演进（PT 2.5 标记 stable），动态 shape 与控制流支持比 trace 更好但比 script 略弱。

---

## 8.6 ExecuTorch：移动端与嵌入式

`ExecuTorch` 是 PT 2.x 推出的移动 / 嵌入式部署方案，定位上替代 PyTorch Mobile：

```python
from executorch.exir import to_edge

ep = torch.export.export(model, (example_input,))
edge = to_edge(ep)
program = edge.to_executorch()
with open('model.pte', 'wb') as f:
    f.write(program.buffer)
```

iOS / Android 端用 ExecuTorch runtime 加载 `.pte`。

优点：

- 体积小（runtime 比 LibTorch 小一个数量级）
- 与 PT 2.x 原生编译栈对齐
- 支持后端委托（CoreML / NNAPI / XNNPACK）

劣势：算子覆盖率仍在追赶 TFLite。截至 2024 年中，移动端最稳的仍是 TFLite，ExecuTorch 是 PyTorch 阵营的官方未来。

---

## 8.7 选型决策树

```
需要在没有 Python 的环境推理？
├── 不需要 → state_dict + Python 推理（首选）
└── 需要
    ├── 移动端/嵌入式
    │   ├── 已有 TFLite 流水线 → ONNX → TFLite
    │   └── 全 PyTorch 栈      → ExecuTorch
    ├── 服务端 C++
    │   ├── 旧项目 / 求稳        → TorchScript
    │   └── 新项目 / 求性能      → torch.export + AOTInductor
    ├── 跨框架（NV TensorRT、Intel OpenVINO）
    │   └── ONNX
    └── 浏览器 / WebAssembly
        └── ONNX → ONNXRuntime Web
```

---

## 8.8 通用导出注意事项

无论走哪条路径，都要预先处理这些问题。

### 8.8.1 把模型设成 eval

```python
model.eval()
```

否则 Dropout 仍随机、BN 仍在更新统计 —— 导出后行为与训练时不一致。

### 8.8.2 移除训练专用代码

像 `print()`、`assert`、debug hook、自定义 logging 都可能被 trace 或转换路径丢弃或失败。导出前清理。

### 8.8.3 提供代表性 example_input

trace / export 都需要示例输入。要确保：

- shape 真实（不能用 `(1, 1)` 占位代替 `(B, 3, 224, 224)`）
- dtype 与 device 与生产一致
- 多输入模型要全部提供

### 8.8.4 dynamic shape

```python
torch.export.export(
    model, (x,),
    dynamic_shapes={'x': {0: torch.export.Dim('batch', min=1, max=64)}},
)
```

明确声明哪些维度是动态的，否则会被固化。

### 8.8.5 验证导出后的数值一致性

```python
ep_out = exported_module(example_input)
orig_out = model(example_input)
assert torch.allclose(ep_out, orig_out, atol=1e-5)
```

**必做**。仅 trace 不验证，等于把 bug 直接送进生产。

---

## 8.9 推理时的额外考量

### 8.9.1 batch 维度

服务端通常是单条请求 → 单条推理。但若有 batching server（如 NVIDIA Triton 的 dynamic batching），导出时要支持动态 batch。

### 8.9.2 设备一致性

导出在 CUDA 训练，部署到 CPU 推理：

```python
m = torch.jit.load('model.pt', map_location='cpu')
```

或导出前 `model.cpu()`。

### 8.9.3 fp16 / int8 量化

导出 + 量化的组合通常是 PTQ（post-training quantization）：

```python
quantized = torch.quantization.quantize_dynamic(
    model, {nn.Linear}, dtype=torch.qint8
)
torch.save(quantized.state_dict(), 'q.pt')
```

或走 ONNX → TensorRT 的 INT8 量化流水线。第 14 章会详细讨论量化。

---

## 8.10 安全：不要 load 不可信的 .pt 文件

`torch.load` 默认调用 pickle 反序列化，可执行任意代码：

```python
# 不可信来源 → 危险
torch.load('untrusted.pt')

# 安全：只加载权重
torch.load('untrusted.pt', weights_only=True)   # PT 2.x 默认
```

PT 2.4+ 进一步收紧了 `weights_only` 的默认值。

LibTorch / ONNX / `torch.export` 的格式相对安全（无任意代码），但仍要 hash 校验。

---

## 8.11 服务化简介

完整的推理服务远超模型导出本身。常见方案：

| 方案 | 特点 |
|------|------|
| FastAPI + 自写 wrapper | 简单、灵活；需自己实现 batching |
| **TorchServe** | PyTorch 官方，支持模型版本、A/B 测试 |
| **Triton Inference Server** | NVIDIA，多框架（PT/TF/ONNX/TRT），动态 batching、多模型 |
| **vLLM / TGI** | LLM 专用，PagedAttention、连续 batching |
| **Ray Serve** | 分布式扩缩容，与 Ray 生态集成 |

对 LLM，**vLLM / TGI / TensorRT-LLM** 几乎是必选 —— 它们针对 KV-cache、连续 batching、PagedAttention 做了深度优化，吞吐比朴素 PyTorch 高 5-10 倍。

---

## 8.12 本章小结

- 模型导出有四条主路径：state_dict / TorchScript / ONNX / torch.export(+AOTInductor)
- state_dict + Python 仍是首选；只在跨语言、移动端、极致性能时才走其他路径
- TorchScript 处于维护期；新项目优先 `torch.export` + AOTInductor
- 移动端 PyTorch 阵营推荐 ExecuTorch；TFLite 仍是稳定老选项
- ONNX 作为跨框架"通用语"，与 TensorRT/ONNXRuntime/OpenVINO 配合
- 任何导出必做：`eval()`、提供真实 example、验证数值一致、用 `weights_only=True`
- LLM 推理用 vLLM / TGI / TensorRT-LLM 等专门栈

至此 Part02 核心使用篇完结。下一部分进入应用场景：CV、NLP、推荐 / 时序 / 强化 / 生成模型，看 PyTorch 在每类任务中的典型用法。
