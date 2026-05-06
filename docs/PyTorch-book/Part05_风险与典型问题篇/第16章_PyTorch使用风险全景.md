# 第16章 PyTorch 使用风险全景

前面几章侧重"怎么用"。本章直面"用错了会怎样" —— 把 PyTorch 项目从开发到生产可能踩的所有坑做一次系统性梳理。每条都给出**典型表现**与**根因**，不只是"小心 X"那种泛泛之谈。

---

## 16.1 风险分类总览

| 类别 | 典型问题 | 后果 |
|------|---------|------|
| **正确性风险** | 数据泄漏、错误评估、状态泄漏 | 模型上线表现远低于离线 |
| **性能风险** | 数据瓶颈、显存爆炸、launch overhead | 训练慢 / 推理慢 / OOM |
| **数值风险** | NaN、梯度爆炸、精度损失 | 训练发散、模型退化 |
| **资源风险** | 显存泄漏、文件句柄、线程不释放 | 服务长跑后崩溃 |
| **可重现性风险** | 随机种子、并行非确定、环境差异 | 实验无法复现 |
| **依赖与版本风险** | PyTorch / CUDA / 驱动版本 mismatch | 各种神奇错误 |
| **安全与合规风险** | 模型注入、数据脱敏、模型版权 | 数据泄露、法律风险 |

---

## 16.2 正确性风险

### 16.2.1 数据泄漏（Data Leakage）

**典型现象**：离线指标极高（90%+），上线后崩盘。

常见根因：

- 训练集与验证集**未严格按时间 / 用户 / session 切分**
- 用了**未来信息**做特征（时序中常见）
- **归一化用了全集统计量**（应仅用训练集）
- 同一图像的不同增强同时出现在 train 和 val
- 用户特征里包含 label 直接相关的字段（label encoding 编错）

**预防**：

```python
# ❌ 错：用全集计算 mean
mean = all_data.mean()
train, val = split(all_data)
train_norm = (train - mean) / std

# ✅ 对：仅用训练集统计
train, val = split(all_data)
mean = train.mean()
train_norm = (train - mean) / std
val_norm = (val - mean) / std       # 用相同 mean
```

### 16.2.2 评估错误

- **没切 eval 模式**：BN/Dropout 仍 train 行为，验证 loss 抖动
- **指标计算错**：torch.mean(per_batch_acc) ≠ 全局 accuracy（batch 大小不同时）
- **early stopping 用了同一个验证集做模型选择**：选出来的"最佳"对该集过拟合，应再有独立测试集

```python
# ❌ 简单平均 batch acc
accs = [...]
print(np.mean(accs))   # 错，最后 batch 可能不满

# ✅ 累加 correct 与 total
print(correct / total)
```

### 16.2.3 状态泄漏

- 训练循环中**忘记 `optimizer.zero_grad()`** → 梯度累加，效果像一个超大 lr
- 评估完**忘记 `model.train()`** → 后续训练 BN/Dropout 行为错
- DDP 训练时**不同 rank 收敛到不同模型**：debug 时少加同步、SyncBN 没用
- LightningModule / Trainer 中**遗忘 `.detach()`**：tensor 累积进 metric 列表 → autograd 图不释放 → OOM

### 16.2.4 标签错位

- 多卡训练时 sampler 切片不对齐
- 某些 transform 修改 label（如 RandomCrop 配合检测的 bbox）后维护不一致
- 多任务 loss 混合时 label 顺序混乱

**预防**：写一个 sanity check：取 batch 第一个样本，反归一化、反编码，肉眼对比 image 和 label。

### 16.2.5 BatchNorm 的常见问题

| 问题 | 原因 |
|------|------|
| 验证 acc 突然崩 | 评估忘记 `eval()`，BN 用 batch stats |
| 微调时 BN 退化 | 小 batch 下 BN 统计噪声大；冻结 BN 或用 GroupNorm |
| DDP 各卡 BN 不同 | 用 `SyncBatchNorm.convert_sync_batchnorm` |
| FP16 训练时 BN 计算 | BN 内部应保留 fp32 (autocast 会处理) |

---

## 16.3 性能风险

第 12-15 章已充分讨论。简要清单：

| 性能风险 | 监测指标 |
|---------|---------|
| 数据 pipeline 是瓶颈 | nvidia-smi GPU-Util < 80% |
| 频繁 H2D / D2H | profiler 看 memcpy 时间占比 |
| 同步点过多 | profiler GPU stream 频繁短停顿 |
| launch overhead | 小 batch + 深网络 |
| OOM 时 reserved 远大于 allocated | 显存碎片 |
| 多卡线性加速比 < 0.7 | 通信瓶颈 |
| 推理 QPS 低 | 没用 batching server / KV cache / 量化 |

---

## 16.4 数值风险

### 16.4.1 NaN / Inf

来源：

- log(0)、sqrt(负数)、除以 0
- exp(超过 fp16 范围) → Inf
- attention scores 未除以 sqrt(d) 导致 softmax 溢出
- gradient 累积过大爆炸
- bf16 中累加大量小值丢失精度

**调试**：

```python
torch.autograd.set_detect_anomaly(True)
# 反向时检测到 NaN/Inf 抛异常并定位 op
```

注意：**极慢，仅调试用**。生产关闭。

### 16.4.2 梯度爆炸 / 消失

| 现象 | 处理 |
|------|------|
| 梯度爆炸（loss → Inf） | grad clipping、降低 lr、warmup |
| 梯度消失（梯度 ~0） | 激活替换（不要 sigmoid 深层）、residual、normalize |
| 只在某些样本爆 | 数据中可能有异常样本 |

### 16.4.3 fp16 下溢

fp16 最小正规化数 ~6e-5，梯度小于此被截成 0。AMP 的 GradScaler 就是为此设计。

**症状**：训练好好的，某个 step 突然不进展；Scale 反复减半。

**处理**：换 bf16 或继续等（GradScaler 会自适应）。

### 16.4.4 LayerNorm vs BatchNorm 在低精度下

LayerNorm 的方差计算对低精度非常敏感。autocast 会强制 LayerNorm 用 fp32 内部计算 —— 不要手动改 LayerNorm 的 dtype 为 fp16/bf16。

### 16.4.5 cumsum / cumulative ops 的精度

cumsum 在 fp16 下累积误差大。NLP 中位置编码、attention bias 等场景小心。

---

## 16.5 资源风险

### 16.5.1 显存泄漏

**典型**：训练 N 个 epoch 后 OOM，实际单 step 显存够。

来源：

- **保留了带 grad 的 tensor 进 list/dict** → 计算图不释放
  ```python
  losses.append(loss)         # ❌ 持有完整图
  losses.append(loss.item())  # ✅ 仅数值
  losses.append(loss.detach()) # ✅ 仅 tensor 数据
  ```
- **hooks 没 remove** → 引用累积
- **`retain_graph=True`** 但多次反传后没释放
- **CUDA 缓存碎片**（前述）
- **第三方库（如 tensorboard）持有 tensor 引用**

调试：用 `gc.get_objects()` + `torch.cuda.memory_summary()` 看可疑增长。

### 16.5.2 主机内存泄漏

DataLoader workers 子进程内存增长（COW 失效、缓存累积）：

- 用 `pin_memory=False` 看是否变化
- 用 `num_workers=0` 暂时定位
- 升级 torch 与 OS 检查 issue

### 16.5.3 文件句柄 / 网络连接泄漏

- DataLoader worker 内打开 h5/lmdb 但 worker 销毁时没关
- 推理服务里 GPU 连接 / Triton client 未 close

```python
# Dataset 的 __del__ 中关闭
def __del__(self):
    if self.h5 is not None:
        self.h5.close()
```

### 16.5.4 多进程僵死

- DDP / DataLoader worker 因主进程异常没正确清理 → 僵尸进程占显存
- 解决：训练脚本用 try/finally 中调 `dist.destroy_process_group()`、`loader._iterator._shutdown_workers()`
- 系统级：`pkill -9 -f train.py`

---

## 16.6 可重现性风险

### 16.6.1 设种子的完整方式

```python
import random, numpy as np, torch, os
def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    os.environ['PYTHONHASHSEED'] = str(seed)
```

### 16.6.2 cudnn 与算法

```python
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
torch.use_deterministic_algorithms(True)
# 部分 op 没有确定性版本会抛异常
```

代价：性能下降 10-30%。研究中"严格复现"才用，工程多数不需要。

### 16.6.3 多卡复现的额外难点

- 每个 worker 的随机种子要按 rank/worker_id 偏移
- 不同 GPU 数会改变数据分片 → 即使设种子也不严格一致
- NCCL 集合通信顺序不确定 → 数值有微小差异

**结论**：DDP/FSDP 训练的"位级复现"几乎不可能，只能做到"统计意义复现"。

### 16.6.4 环境差异

- Python 3.10 vs 3.11 的 dict 顺序某些细节差异
- NumPy 1.x vs 2.x 的 broadcasting 规则
- CUDA 11 vs 12 的 cuDNN 算法选择
- 不同 GPU 型号上的 fp16 累加顺序

要求严格复现 → 锁版本（requirements.txt + Dockerfile）+ 锁硬件型号。

---

## 16.7 依赖与版本风险

### 16.7.1 PyTorch 版本兼容性

PyTorch + CUDA + 驱动 + cuDNN 是绑定的：

```bash
# 看你的 PyTorch 看到的 CUDA
python -c "import torch; print(torch.version.cuda)"

# 看驱动支持的 CUDA
nvidia-smi    # 右上角 CUDA Version 是驱动支持的最高版本

# 看 cuDNN
python -c "import torch; print(torch.backends.cudnn.version())"
```

驱动 CUDA 版本必须 ≥ PyTorch CUDA 版本。

### 16.7.2 第三方库的兼容性

- transformers 与 PyTorch 绑定较松，但偶尔有 break
- xformers 与 PyTorch 绑定**紧**：换 PyTorch 通常要换 xformers
- bitsandbytes 与 CUDA 版本紧密绑定
- DeepSpeed 与 PyTorch 时常有兼容问题

**推荐**：用 conda / Docker 锁住整个栈。生产环境绝不要 `pip install -U torch`。

### 16.7.3 Lock 工具

```bash
pip freeze > requirements.txt
# 或
pip install pip-tools && pip-compile

# 更现代
poetry / uv / rye
```

### 16.7.4 算子实现差异

- ROCm 版 PyTorch 与 CUDA 行为可能略有不同
- MPS（Apple Silicon）算子覆盖率仍在追赶
- 自定义 CUDA kernel 与不同 CUDA 版本兼容性

---

## 16.8 安全与合规风险

### 16.8.1 反序列化攻击

`torch.load` 默认调用 pickle，可执行任意代码：

```python
# 危险（来自不可信源）
torch.load('attacker.pt')

# 安全
torch.load('attacker.pt', weights_only=True)   # PT 2.x 默认
```

PT 2.4+ 的 `weights_only=True` 默认开启，加载非 Tensor 类型会报错。如果你的合法 ckpt 含元数据，要么改用 safetensors，要么显式 `weights_only=False`（仅信任源）。

**推荐**：模型权重改用 [safetensors](https://github.com/huggingface/safetensors) 格式：

```python
from safetensors.torch import save_file, load_file
save_file(state_dict, 'model.safetensors')
state = load_file('model.safetensors')
```

无任何代码执行风险，加载更快。

### 16.8.2 模型逆向

公开训练好的模型 weight 可能被反推训练数据（membership inference）。敏感数据训练的模型不要随意公开 weight。

### 16.8.3 推理服务的 prompt injection（LLM）

LLM 应用必须考虑 prompt injection：

- 用户输入伪装成系统指令
- 用户上传文件包含恶意指令
- RAG 检索回的文档含注入

防御：

- 严格区分"系统 prompt"与"用户输入"，结构化处理
- 输出过滤
- 限定工具调用权限

### 16.8.4 数据合规

训练数据可能包含：

- 个人身份信息（PII）→ 模型泄露
- 受版权保护的内容
- 用户聊天记录

合规要求：

- 数据脱敏
- 同意条款
- GDPR / CCPA / 国内个人信息保护法

### 16.8.5 模型版权与许可证

- Llama 系列有 Meta 自己的许可证（不是 Apache）
- Stable Diffusion 有 RAIL 许可证
- 商用前确认许可证

---

## 16.9 工程交付风险

### 16.9.1 训练脚本能跑 ≠ 项目可交付

常见缺失：

- 没有 reproducibility / random seed 控制
- 配置散落在脚本各处
- 无单元测试
- 无 CI
- 实验记录混乱（log 文件 vs WandB vs 没有）
- 模型 ckpt 命名不规范

### 16.9.2 推理服务的"长尾延迟"

- 平均 20ms，P99 200ms：来自 Python GC、CUDA sync、网络抖动
- 处理：warm-up、固定 worker 数、合理 batching、监控 P99

### 16.9.3 模型版本管理

- ckpt 文件 hash 与训练代码 commit 关联
- 推理服务支持模型版本切换、回滚
- A/B 实验的流量切分

工具：MLflow、Weights & Biases、ClearML、自研模型注册表。

---

## 16.10 风险监测清单

部署前 / 上线后建议监控：

| 阶段 | 监控项 |
|------|------|
| 训练 | loss 曲线 / 梯度范数 / 学习率 / GPU 利用率 / 显存峰值 |
| 评估 | 验证集多个指标 / 子集分布表现 / 公平性指标 |
| 推理 | P50/P95/P99 延迟 / QPS / 错误率 / 输入输出 shape 异常 |
| 数据漂移 | 输入分布对比 / 缺失率 / 异常值比例 |
| 模型漂移 | 关键业务指标 / 反馈数据再评估 |
| 资源 | GPU 利用率 / 显存 / 主机 RAM / 磁盘 |

---

## 16.11 风险地图：哪些风险与什么场景关联

| 场景 | 主要风险 |
|------|---------|
| 视觉分类 | BN 处理、数据增强一致性、resolution mismatch |
| 检测 / 分割 | label 同步增强、异常 box、NMS 阈值 |
| LLM 训练 | OOM、loss NaN、chat template、数据污染 |
| LLM 推理 | KV cache OOM、prompt injection、量化精度 |
| 推荐系统 | 数据泄漏、特征不一致、冷启动 |
| 时序 | 未来信息泄漏、归一化逆变换 |
| RL | reward hacking、超参敏感、env 不确定性 |
| 多卡 | sampler set_epoch、SyncBN、ckpt 同步 |

---

## 16.12 本章小结

- 风险分七类：正确性、性能、数值、资源、可重现性、依赖、安全合规
- 离线指标好上线崩 = 数据泄漏 / eval 错 / 训练-推理不一致
- NaN / 显存爆炸有标准排查工具：`set_detect_anomaly` / `memory_viz`
- 反序列化 .pt 文件不可信源 → safetensors / weights_only
- 复现性的成本是性能；要平衡而非追求完美
- 上线后监控延迟分布、数据漂移、模型漂移

下一章给出这些风险与典型问题的具体处理方法。
