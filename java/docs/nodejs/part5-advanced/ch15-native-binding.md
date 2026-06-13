# 第15章 Rust/C++ 绑定

## 15.1 概述

Node.js 在 I/O 密集型场景表现出色，但在 CPU 密集型任务上受限。通过编写原生插件（Native Addon），可以用 C++ 或 Rust 编写高性能模块，直接在 Node.js 中调用。本章围绕 N-API 和 napi-rs 展开，系统讲解原生绑定的原理、风险和最佳实践。

## 15.2 使用场景

### 15.2.1 极速 JWT 校验

JWT 的签名校验涉及 HMAC 或 RSA 加解密运算，在 Node.js 中执行存在明显的性能瓶颈。通过 Rust 实现可以将吞吐量提升 5-10 倍：

```rust
#[macro_use]
extern crate napi_derive;
use jsonwebtoken::{decode, Validation, DecodingKey};
use napi::bindgen_prelude::*;

#[napi(object)]
pub struct JwtClaims {
    pub sub: String,
    pub exp: u64,
    pub role: String,
}

#[napi]
pub fn verify_jwt(token: String, secret: String) -> Result<JwtClaims> {
    let key = DecodingKey::from_secret(secret.as_bytes());
    match decode::<serde_json::Value>(&token, &key, &Validation::default()) {
        Ok(data) => Ok(JwtClaims {
            sub: data.claims["sub"].as_str().unwrap_or("").to_string(),
            exp: data.claims["exp"].as_u64().unwrap_or(0),
            role: data.claims["role"].as_str().unwrap_or("user").to_string(),
        }),
        Err(e) => Err(Error::from_reason(format!("JWT invalid: {}", e))),
    }
}
```

在 Node.js 中调用时，性能提升十分明显：

```javascript
const { verifyJwt } = require('./native-binding.node');

// 每秒可处理数万次 JWT 校验（取决于密钥算法和 payload 大小）
const claims = verifyJwt(token, secret);
console.log(claims.sub); // "user_12345"
```

### 15.2.2 图片处理

图片编解码（JPEG/PNG/WebP）和变换（缩放/裁剪/旋转）是典型的 CPU 密集型操作。使用原生绑定的 `sharp` 库比纯 JS 的 `jimp` 快 5-10 倍：

```javascript
const sharp = require('sharp');

// 使用 libvips C 库的原生绑定
await sharp('input.jpg')
  .resize(800, 600)
  .webp({ quality: 80 })
  .toFile('output.webp');
```

`sharp` 底层通过 N-API 调用 C 语言编写的 libvips 库，充分利用多核 CPU 和 SIMD 指令集。

### 15.2.3 科学计算与密码学操作

科学计算涉及大量矩阵运算，密码学涉及复杂的数学算法——两者都是原生绑定的典型应用场景：

```javascript
// 使用 Node.js 原生 crypto 模块（C++ 实现）
const { scryptSync, randomBytes, createCipheriv } = require('crypto');

// scrypt 密钥派生——纯 JS 实现慢 10-100 倍
const key = scryptSync('password', 'salt', 32);

// 通过原生绑定获得接近机器码的执行速度
const iv = randomBytes(16);
const cipher = createCipheriv('aes-256-gcm', key, iv);
```

对于更复杂的计算任务（如机器学习推理），可以使用 `onnxruntime-node` 或自定义 Rust 绑定：

```rust
#[napi]
pub fn matrix_multiply(a: Vec<Vec<f64>>, b: Vec<Vec<f64>>) -> Result<Vec<Vec<f64>>> {
    let n = a.len();
    let m = b[0].len();
    let p = b.len();
    let mut result = vec![vec![0.0; m]; n];

    for i in 0..n {
        for j in 0..m {
            for k in 0..p {
                result[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    Ok(result)
}
```

## 15.3 实现原理

### 15.3.1 N-API（稳定 ABI）

N-API 是 Node.js 官方提供的原生插件 API，从 Node.js 8.0 开始引入，从 Node.js 10.0 开始稳定。它的核心设计目标是为原生模块提供稳定的 ABI（Application Binary Interface），使其不随 Node.js 版本升级而失效。

```c
// N-API C 代码示例
#include <node_api.h>

napi_value Add(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double a, b;
    napi_get_value_double(env, args[0], &a);
    napi_get_value_double(env, args[1], &b);

    napi_value sum;
    napi_create_double(env, a + b, &sum);
    return sum;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value fn;
    napi_create_function(env, NULL, 0, Add, NULL, &fn);
    napi_set_named_property(env, exports, "add", fn);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init);
```

N-API 的优势：
- **ABI 稳定**：插件编译一次，跨 Node.js 版本兼容
- **无需重编译**：Node.js 小版本升级不影响原生插件
- **内存安全抽象**：napi_env 封装了 V8 引擎的细节

### 15.3.2 NAPI-RS（Rust 绑定生成器）

NAPI-RS 是 Rust 生态中构建 Node.js 原生绑定的工具链。它通过过程宏自动生成 N-API 胶水代码，让开发者用 Rust 编写业务逻辑，无需手动编写 C 代码：

```rust
// napi-rs 自动处理类型转换
// Rust native fn → N-API val 的转换由 #[napi] 宏自动生成

use napi::bindgen_prelude::*;

// #[napi] 宏展开后生成等效的 N-API 注册代码
// 包含类型转换、错误处理和内存管理
#[napi]
pub fn hello(name: String) -> String {
    format!("Hello, {}!", name)
}

// #[napi(object)] 自动转换为 JavaScript 对象
#[napi(object)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
```

NAPI-RS 项目搭建流程：

```bash
# 1. 安装 napi-rs CLI
npm install -g @napi-rs/cli

# 2. 初始化项目
napi new my-native-addon
cd my-native-addon

# 3. 编写 Rust 代码（src/lib.rs）

# 4. 构建
npm run build

# 5. 在 JavaScript 中使用
const addon = require('./my-native-addon.node');
```

### 15.3.3 FFI（Foreign Function Interface）区别

原生绑定的三种技术路径对比：

| 方案 | 原理 | 性能 | 复杂度 | 跨版本兼容 |
|:--|:--|:--|:--|:--|
| N-API | 编译为 .node 共享库 | 最高 | 高 | 是（ABI 稳定） |
| FFI（ffi-napi） | 运行时加载现有 .so/.dll | 中 | 中 | 是 |
| Child Process | 子进程调用外部程序 | 低 | 低 | 是 |

```javascript
// FFI 方案：直接调用系统 .dll/.so
const ffi = require('ffi-napi');

const lib = ffi.Library('libc', {
  'strlen': ['int', ['string']],
});

console.log(lib.strlen('hello')); // 5
```

FFI 适合快速调用现有系统库，但无法进行优化和类型安全校验。N-API 适合需要深度优化的新开发场景。

## 15.4 潜在风险

### 15.4.1 内存安全

**C++ 手动内存管理**：C++ 原生插件中，开发者需要手动管理 V8 引擎的句柄和作用域：

```cpp
// C++ N-API 中的内存管理
napi_value CreateArray(napi_env env) {
    napi_value arr;
    napi_create_array(env, &arr);

    // 必须正确处理 napi_value 的生命周期
    for (int i = 0; i < 1000; i++) {
        napi_value val;
        napi_create_int32(env, i, &val);
        napi_set_element(env, arr, i, val);
    }
    return arr;
    // 如果 val 在循环外引用会引发 Use-After-Free
}
```

**Rust 所有权安全**：Rust 在编译时就保证了内存安全，这是推荐优先选择 Rust 的关键原因：

```rust
// Rust 编译器确保以下代码无法编译
#[napi]
pub fn unsafe_operation() -> Result<()> {
    let data = vec![1, 2, 3];
    // 下面这行在 Rust 中无法通过编译
    // let dangling = &data[0]; drop(data); // use of moved value
    Ok(())
}
```

### 15.4.2 ABI 兼容性

虽然 N-API 保证了 ABI 稳定，但以下情况仍需关注：

- Node.js 主版本升级（如 16→18）时，napi_version 可能增加，部分旧 API 被标记为 deprecated
- Electron 等非标准运行时使用不同的 ABI，需要额外编译
- Alpine Linux 使用 musl libc 替代 glibc，可能导致编译后的插件不兼容

```bash
# 查看当前 Node.js 的 N-API 版本
node -e "console.log(process.versions.napi)"

# Electron 下需要针对 Electron 的 ABI 重新编译
npx electron-rebuild
```

### 15.4.3 调试困难

原生插件的调试比纯 JS 代码复杂得多：

| 问题 | 表现 | 排查方法 |
|:--|:--|:--|
| Segfault | 进程无日志崩溃 | 使用 gdb/lldb 附加调试 |
| 内存泄漏 | RSS 持续增长 | Valgrind / heaptrack |
| 线程安全 | 偶发数据错乱 | ThreadSanitizer |

```bash
# Rust 绑定调试
# 构建 debug 版本
npm run build -- --debug

# 使用 lldb 附加到 Node 进程
lldb -f node -o "run index.js"

# 设置断点（需要符号表）
breakpoint set --name verify_jwt
```

## 15.5 优化策略

### 15.5.1 优先 Rust 而非 C++

在同等场景下，优先选择 Rust 而非 C++ 编写原生绑定：

| 维度 | Rust | C++ |
|:--|:--|:--|
| 内存安全 | 编译器保证 | 手动管理 |
| 并发安全 | 所有权 + 借用检查 | 手动锁管理 |
| napi-rs 生态 | 成熟，宏自动生成胶水代码 | 需要手动编写 N-API |
| 构建工具 | cargo + napi-rs | node-gyp + binding.gyp |
| 学习曲线 | 较陡但安全 | 复杂度可类比 |

### 15.5.2 减少跨语言调用次数

每次从 JavaScript 调用原生函数都有固定的开销（~50-200ns）。在性能关键路径上，应该：

```javascript
// ❌ 不推荐：频繁跨语言调用
let sum = 0n;
for (const num of largeArray) {
  sum = nativeAdd(sum, num); // 10 万次调用 = 10ms 开销
}

// ✅ 推荐：批量操作减少边界切换
const sum = nativeSumArray(largeArray); // 1 次调用
```

```rust
// Rust 端接受整个数组，一次性处理
#[napi]
pub fn sum_array(arr: Vec<i64>) -> i64 {
    arr.iter().sum()
}
```

### 15.5.3 异步操作避免阻塞 Event Loop

CPU 密集型任务应通过异步操作避免阻塞 Node.js 事件循环：

```rust
// napi-rs 支持异步任务（自动在线程池中执行）
#[napi]
pub async fn compute_heavy(input: Vec<f64>) -> Result<f64> {
    // tokio 或 napi 线程池中执行
    let result = tokio::task::spawn_blocking(move || {
        // CPU 密集型计算
        input.iter().map(|x| x.sin().cos().atan()).sum()
    })
    .await
    .map_err(|e| Error::from_reason(e.to_string()))?;

    Ok(result)
}
```

```javascript
// Node.js 侧——不阻塞事件循环
const result = await computeHeavy(largeArray);
console.log('计算完成', result);
```

## 15.6 典型问题处理

### 15.6.1 Node 版本升级后插件失效

当 Node.js 主版本升级时，即使 N-API 保持稳定，某些情况下仍需要重新编译：

```bash
# 重新编译所有原生插件
npm rebuild

# 如果使用了 prebuild 分发，确保获取新版本的预编译包
npm update @mapbox/node-pre-gyp

# 对于 napi-rs 项目
npm run build -- --release
```

### 15.6.2 Segfault 定位

原生插件崩溃后没有 JavaScript 堆栈信息，需要通过系统工具定位：

```bash
# 1. 启用核心转储
ulimit -c unlimited

# 2. 运行程序触发崩溃
node index.js

# 3. 使用 lldb/gdb 分析核心转储
lldb -c core node
bt  # backtrace 查看崩溃位置

# 对于 Rust：启用调试符号并在 debug 模式下构建
# Cargo.toml
[profile.release]
debug = true
```

常见 segfault 原因：

| 原因 | 预防方法 |
|:--|:--|
| 空指针解引用 | 使用 Option<T> 优雅处理空值 |
| Use-After-Free | Rust 编译器静态检查 |
| 缓冲区溢出 | 使用安全容器 Vec/String 而非裸指针 |
| 类型不匹配 | napi-rs 自动处理类型转换 |

### 15.6.3 跨平台构建

原生插件需要针对不同平台编译：

```jsonc
// napi-rs 项目的 package.json 配置
{
  "napi": {
    "name": "my-addon",
    "triples": {
      "defaults": true, // 包括常见平台
      "additional": [
        "aarch64-apple-darwin",    // Apple Silicon
        "aarch64-unknown-linux-gnu", // ARM Linux
        "x86_64-pc-windows-msvc"    // Windows
      ]
    }
  }
}
```

CI/CD 中使用 GitHub Actions 的 napi-rs 模板自动构建所有平台：

```yaml
# .github/workflows/build.yml
jobs:
  build:
    strategy:
      matrix:
        target:
          - x86_64-unknown-linux-gnu
          - x86_64-pc-windows-msvc
          - x86_64-apple-darwin
    steps:
      - uses: actions/checkout@v4
      - uses: napi-rs/setup-napi@v3
      - run: npm run build -- --target ${{ matrix.target }}
```

## 15.7 开发者技能

### 15.7.1 napi-rs CLI

```bash
# 创建新项目
napi new my-native-package

# 构建（自动处理 target 和环境）
napi build --platform --release

# 发布预编译包
napi artifacts
napi prepublish -t npm
```

### 15.7.2 node-gyp 基础

对于 C++ 插件，`node-gyp` 是最常用的构建工具：

```python
# binding.gyp
{
  "targets": [
    {
      "target_name": "addon",
      "sources": ["src/addon.cc"],
      "include_dirs": ["<!(node -e \"require('node-addon-api').include\")"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"]
    }
  ]
}
```

```bash
# 构建 C++ 插件
node-gyp configure
node-gyp build

# 如果系统没有安装编译工具链
npm install -g windows-build-tools  # Windows
sudo apt-get install build-essential # Linux
xcode-select --install              # macOS
```

### 15.7.3 Rust 所有权与借用

编写 napi-rs 绑定时需要理解 Rust 的核心概念：

```rust
// 所有权（Ownership）：每个值只有一个所有者
#[napi]
pub fn process(data: String) -> String {
    // data 是此函数的自有变量
    let result = data.to_uppercase();
    // 返回 result，所有权转移给调用方
    result
    // 函数结束，data 被自动释放
}

// 借用（Borrowing）：& 符号表示不可变引用
#[napi]
pub fn analyze(data: &[u8]) -> u64 {
    // data 是对外部数据的不可变引用
    data.iter().map(|&b| b as u64).sum()
    // 借用结束后，外部数据仍然有效
}

// 可变引用（&mut）：允许修改但不允许多个引用
#[napi]
pub fn transform(data: &mut Vec<f64>) {
    // data 是唯一可变的引用
    data.iter_mut().for_each(|x| *x *= 2.0);
}
```

## 15.8 项目结构示例

一个规范的 napi-rs 项目结构：

```
my-native-addon/
├── src/
│   ├── lib.rs          # 主入口，注册 napi 函数
│   ├── jwt.rs          # JWT 校验模块
│   ├── crypto.rs       # 密码学辅助函数
│   └── types.rs        # 共享数据结构
├── index.js            # JS 入口（加载 .node 文件）
├── package.json        # napi 配置
├── Cargo.toml          # Rust 依赖
├── build.rs            # 构建脚本
├── __test__/
│   └── index.spec.ts   # 集成测试
└── npm/                # 预编译包输出
```

```jsonc
// package.json
{
  "name": "my-native-addon",
  "main": "index.js",
  "napi": {
    "name": "my-addon",
    "triples": {}
  },
  "scripts": {
    "build": "napi build --platform --release",
    "build:debug": "napi build --platform",
    "test": "node --test __test__/*.spec.js"
  },
  "devDependencies": {
    "@napi-rs/cli": "^2.18.0"
  }
}
```

---

## 本章小结

原生绑定是突破 Node.js CPU 瓶颈的最有效手段。通过 N-API 稳定 ABI 和 napi-rs 的工具链，Rust 或 C++ 代码可以平滑地与 Node.js 集成。优先选择 Rust 以获得内存安全保障，通过批量操作减少跨语言调用次数，并始终使用异步模式避免阻塞事件循环。下一章将探讨边缘计算与 Serverless 场景下的 Node.js 应用。