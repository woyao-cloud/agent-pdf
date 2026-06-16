# 第9章 Bun FFI 外部函数接口

## 目录

1. [使用场景](#1-使用场景)
2. [实现原理](#2-实现原理)
3. [风险与优化](#3-风险与优化)
4. [典型问题处理](#4-典型问题处理)
5. [必备知识](#5-必备知识)
6. [示例代码与配置](#6-示例代码与配置)

---

## 1. 使用场景

### 1.1 调用系统 C 库

Bun FFI（Foreign Function Interface）最直接的应用场景是调用操作系统提供的 C 语言库。几乎所有现代操作系统都提供了丰富的 C 语言 API，涵盖文件操作、网络通信、进程管理、加密解密、数学计算等各个领域。在 Bun 出现之前，JavaScript/TypeScript 开发者调用这些系统 API 通常需要通过 Node.js 的 C++ 原生插件（Native Addon）或 child_process 间接调用命令行工具，这两种方式都有明显的缺陷：C++ 原生插件需要编写和编译 C++ 代码，维护成本高，跨平台兼容性差；命令行调用则有显著的进程创建开销和字符串解析成本。

Bun FFI 允许开发者直接在 TypeScript 代码中加载任意共享库（.so、.dll、.dylib），声明函数签名后即可像调用普通 JavaScript 函数一样调用 C 函数。这种能力使得许多原本需要编写 C/C++ 原生插件的场景可以用纯 TypeScript 实现，大大降低了开发门槛和维护成本。

在实际生产中，调用系统 C 库的常见场景包括：

**系统信息获取**：通过 libc 的 getpid、getuid、gethostname、sysinfo 等函数获取进程和系统信息，比解析 /proc 文件系统更加高效和可靠。例如，一个监控代理需要每秒采集一次系统 CPU 和内存使用情况，使用 FFI 调用 sysinfo() 函数可以在微秒级别完成数据采集，而解析 /proc/stat 则需要多次文件读取和字符串解析，耗时通常增加一个数量级。

**加密哈希计算**：通过 libcrypto（OpenSSL）直接调用 MD5、SHA256、AES 等加密函数。相比使用 Node.js 的 crypto 模块，FFI 方式可以更精细地控制内存管理和算法参数，特别是在需要处理大量数据或进行批量加密操作时，FFI 方式可以提供更好的性能。例如，一个文件完整性校验工具需要计算数千个文件的哈希值，使用 FFI 调用 OpenSSL 的 EVP_Digest 系列函数，可以充分利用 OpenSSL 的硬件加速特性（如 AES-NI 指令集），比 JavaScript 实现的哈希算法快数十倍。

**数学计算**：通过 libm（数学库）调用 sin、cos、sqrt、exp 等数学函数。虽然 JavaScript 标准库已经提供了这些函数，但在某些场景下（如需要高精度计算或使用特定数学库函数），直接调用 C 数学库可能更有优势。例如，在科学计算或金融计算中，可能需要调用 erfc（互补误差函数）、tgamma（伽马函数）等 C 数学库特有的函数。

**时间操作**：通过 librt 调用 clock_gettime、timer_create 等时间相关函数，获得纳秒级的时间精度。JavaScript 的 Date.now() 和 performance.now() 精度有限（毫秒或微秒级），而 C 语言的 clock_gettime 可以精确到纳秒。对于性能基准测试、延迟测量和时间敏感型应用，纳秒级精度至关重要。

**内存操作**：通过 libc 调用 memset、memcpy、memcmp 等内存操作函数。这些函数通常由 C 标准库的高度优化版本实现（如 glibc 的 SSE/AVX 优化版本），在处理大量数据时比 JavaScript 的手动循环快得多。例如，一个图像处理应用需要对百万像素的数据缓冲区进行清零操作，使用 FFI 调用 memset 可以利用 CPU 的 SIMD 指令在几个 CPU 周期内完成，而 JavaScript 的 for 循环需要数百万次迭代。

### 1.2 调用 Rust/Zig/Go 共享库

Bun FFI 的一个重要应用场景是调用由其他系统编程语言编译的共享库。Rust、Zig、Go 等现代系统编程语言都可以编译为符合 C ABI（应用程序二进制接口）的共享库，这意味着 Bun 可以通过 FFI 无缝调用这些语言编写的函数。这种能力为 TypeScript 开发者打开了一个全新的性能优化空间：对于计算密集型的业务逻辑，可以用 Rust 或 Zig 重写关键路径，编译为共享库后通过 FFI 在 Bun 中调用，既保留了 TypeScript 的开发效率，又获得了接近原生的执行性能。

**Rust 共享库的典型应用**：

Rust 语言以其内存安全性和高性能著称，是编写 FFI 共享库的首选语言之一。通过 `#[no_mangle]` 和 `extern "C"` 属性，Rust 函数可以导出为标准的 C 函数，供 Bun FFI 调用。

图像处理是 Rust + Bun FFI 的经典组合。一个用 Rust 编写的图像缩放函数，使用 SIMD 指令优化像素操作，其性能可以达到纯 JavaScript 实现的 10-50 倍。在需要处理大量图像的生产环境中，这种性能提升可以显著降低服务器成本和响应时间。例如，一个图片 CDN 的边缘节点每天需要处理数百万张图片的缩放和格式转换，使用 Rust 实现的图像处理库通过 FFI 集成到 Bun 服务中，可以在保持代码可维护性的同时达到接近原生的处理速度。

数据解析是另一个适合 Rust + FFI 的场景。JSON、Protocol Buffers、MessagePack 等数据格式的解析是 Web 服务中的高频操作。虽然 Bun 内置了快速的 JSON 解析器，但对于自定义二进制协议或特殊格式的数据，使用 Rust 编写解析器并通过 FFI 调用可以获得显著的性能优势。例如，一个金融交易系统需要解析纳秒级精度的市场数据，使用 Rust 实现的高性能解析器通过 FFI 集成，可以确保数据处理的延迟在可控范围内。

**Zig 共享库的特点**：

Zig 语言与 C 的互操作性极佳，它可以直接包含 C 头文件，生成的二进制文件体积小、无运行时依赖。Zig 编译的共享库特别适合在资源受限的环境中部署，如边缘计算节点或嵌入式设备。

Zig 的编译时计算和高级内存管理特性使得它非常适合编写性能关键型 FFI 库。例如，一个需要频繁进行字符串处理和模式匹配的文本分析工具，使用 Zig 实现的核心算法编译为共享库后，通过 FFI 在 Bun 中调用，可以在保持代码清晰度的同时获得显著的性能提升。

**Go 共享库的注意事项**：

Go 语言也可以编译为 C 共享库（通过 `-buildmode=c-shared`），但需要注意 Go 运行时的一些特性：Go 的垃圾回收器可能引入不可预测的暂停时间，Go 的 goroutine 调度与 C 调用栈的交互可能带来额外开销，Go 的字符串和切片与 C 的表示方式不同需要进行转换。尽管如此，对于某些场景（如需要调用 Go 生态中特有的库），将 Go 代码编译为共享库并通过 Bun FFI 调用仍然是一个可行的方案。

### 1.3 性能关键路径

在任何高性能应用中，总有一些代码路径对性能的要求远超其他部分。这些"热点路径"通常占整个代码库的很小一部分（约 5-10%），却消耗了大部分 CPU 时间（约 90%）。Bun FFI 的策略正是针对这些热点路径进行优化：将性能关键的部分用系统级语言实现，通过 FFI 调用，而其余部分仍然使用 TypeScript 保持开发效率。

**计算密集型任务**：

科学计算、机器学习推理、信号处理、图像和视频编码等计算密集型任务，其核心算法通常涉及大量数值计算和循环操作。JavaScript 引擎虽然经过了数十年的优化，但在纯计算性能上仍然无法与 C/C++/Rust 等系统语言相比。对于这些任务，FFI 提供了一条清晰的性能优化路径。

考虑一个实时音频处理应用：需要对音频流进行 FFT（快速傅里叶变换）分析、滤波和特征提取。FFT 算法的核心是复数乘法和蝶形运算，在 JavaScript 中实现需要大量数组操作和函数调用，性能开销较大。而使用 C 或 Rust 实现的 FFT 库（如 FFTW、pffft）经过数十年的优化，充分利用了 CPU 的 SIMD 指令集和多级缓存，性能远超 JavaScript 实现。通过 FFI 调用这些库，Bun 应用可以在保持实时处理能力的同时，处理更高采样率和更多通道的音频数据。

**数据序列化与反序列化**：

数据序列化是 Web 服务和高性能计算中的常见瓶颈。JSON、CBOR、MessagePack、Protocol Buffers 等格式的序列化和反序列化涉及大量内存分配、字符串操作和数据复制。虽然 Bun 内置了高性能的 JSON 解析器，但对于自定义二进制协议或需要极致性能的场景，FFI 方式仍然具有优势。

例如，一个高频交易系统需要在微秒级别内完成市场数据的编码和解码。使用 Rust 实现的数据编码器，通过 FFI 调用，可以充分利用 Rust 的零成本抽象和 LLVM 的优化能力，生成极其高效的机器码。相比 JavaScript 实现，FFI 方式通常可以获得 5-20 倍的性能提升。

**大规模数据处理**：

处理大规模数据集（如日志分析、数据清洗、ETL 管道）时，数据转换和过滤操作通常是性能瓶颈。对于这些操作，将核心处理逻辑用 C/Rust 实现，通过 FFI 在 Bun 中调用，可以充分利用系统语言的性能优势。

例如，一个日志分析平台每天需要处理 TB 级别的日志数据，需要进行正则匹配、字段提取、时间戳解析和聚合计算。使用 Rust 实现的正则引擎和解析器通过 FFI 集成，可以在相同硬件上处理数倍于纯 JavaScript 实现的数据量，同时保持更低的延迟和 CPU 使用率。

### 1.4 复用 C/C++ 生态

C 和 C++ 拥有世界上最庞大的软件生态系统，涵盖了从底层系统工具到高级应用框架的各个领域。许多功能在 C/C++ 生态中已经有了成熟、经过充分测试和高度优化的实现，而 JavaScript/TypeScript 生态中可能没有对应的实现，或者实现的质量和性能不足。Bun FFI 使得 TypeScript 开发者可以直接利用这些已有的 C/C++ 库，无需重新实现或寻找替代方案。

**数据库引擎**：SQLite、LMDB、RocksDB 等嵌入式数据库引擎都是用 C/C++ 实现的。虽然 Bun 内置了 bun:sqlite，但通过 FFI 可以调用其他数据库引擎或 SQLite 的特定扩展。例如，一个需要高性能键值存储的应用可以通过 FFI 调用 LMDB（Lightning Memory-Mapped Database），利用其内存映射和零拷贝特性获得极高的读写性能。

**图像处理库**：libjpeg-turbo、libpng、libwebp、ImageMagick 等图像处理库是 C/C++ 生态中的经典作品。这些库经过数十年的优化，在图像编解码速度和质量上达到了极高的水平。通过 FFI 调用这些库，Bun 应用可以获得与原生应用相同的图像处理能力。例如，一个图片上传服务可以使用 libjpeg-turbo 进行 JPEG 编码，其编码速度是纯 JavaScript 实现的 20-50 倍。

**音视频编解码**：FFmpeg 是世界上最强大的多媒体处理框架，支持几乎所有音视频格式的编码、解码、转码和流处理。通过 FFI 调用 FFmpeg 的部分功能，Bun 应用可以实现高效的音视频处理，而不需要依赖命令行调用或第三方服务。例如，一个视频处理平台可以使用 FFmpeg 的 libavcodec 和 libavformat 进行视频转码和封装格式转换，所有处理在 Bun 进程内完成，避免了子进程的创建开销和进程间通信的复杂性。

**压缩算法库**：zlib、lz4、zstd、brotli 等压缩算法库在 C 生态中有着广泛的应用。这些库提供了高效的压缩和解压缩功能，适用于数据传输和存储优化。通过 FFI 调用这些库，Bun 应用可以在文件传输、日志归档和数据缓存等场景中获得更好的压缩比和更快的处理速度。例如，一个日志收集系统可以使用 zstd 对日志数据进行实时压缩，将存储成本降低 5-10 倍。

**科学计算库**：BLAS、LAPACK、FFTW、GSL 等科学计算库是 C/Fortran 生态中的瑰宝。这些库经过数十年的学术研究和工业应用，在数值计算的精度和性能上达到了极致。通过 FFI 调用这些库，Bun 应用可以在科学计算、数据分析、机器学习等领域发挥 TypeScript 的开发效率，同时获得专业级的计算能力。

## 2. 实现原理

### 2.1 FFI 基础概念

FFI（Foreign Function Interface，外部函数接口）是一种允许一种编程语言调用另一种编程语言编写的函数的机制。在 Bun 中，FFI 特指从 JavaScript/TypeScript 调用符合 C 调用约定的函数。理解 FFI 的工作原理需要掌握以下几个核心概念。

**函数调用约定（Calling Convention）**：

调用约定定义了函数调用时参数如何传递、返回值如何返回、栈如何清理等底层细节。C 语言最常用的调用约定是 cdecl（C Declaration），在 x86 架构上，cdecl 约定规定：参数从右向左压入栈中，由调用者清理栈空间，返回值存储在 EAX 寄存器中。在 x86-64（AMD64）架构上，调用约定更为复杂：前六个整数参数通过寄存器（RDI、RSI、RDX、RCX、R8、R9）传递，多余的参数通过栈传递；前八个浮点参数通过 XMM0-XMM7 传递；返回值存储在 RAX 寄存器中。

Bun FFI 自动处理调用约定的差异，开发者只需要声明参数类型和返回类型，Bun 会生成正确的机器指令来调用 C 函数。这个过程中，Bun 需要完成以下工作：

1. **类型映射**：将 JavaScript 类型映射为 C 类型（如 JS number → C int32、JS bigint → C int64）。
2. **参数编组**：将 JavaScript 值按照调用约定的规则放入寄存器或栈中。
3. **调用生成**：生成调用 C 函数的机器指令。
4. **结果转换**：将 C 函数的返回值转换为 JavaScript 值。

**ABI（Application Binary Interface，应用程序二进制接口）**：

ABI 比调用约定更广泛，它定义了二进制级别的接口规范，包括数据类型的大小和对齐方式、结构体的内存布局、符号命名规则、异常处理机制等。当两个模块（如 Bun 运行时和共享库）遵循相同的 ABI 时，它们可以在二进制级别无缝互操作。

Bun 运行在 x86-64 Linux、ARM64 macOS 等主流平台上，FFI 实现针对这些平台的 ABI 进行了专门优化。例如，在 x86-64 Linux 上，Bun FFI 遵循 System V AMD64 ABI；在 ARM64 macOS 上，遵循 ARM64 AAPCS（Procedure Call Standard）。

**符号解析（Symbol Resolution）**：

当使用 dlopen 加载共享库时，操作系统会将共享库加载到进程的地址空间中，并解析库中导出的符号（函数和全局变量）的地址。Bun FFI 使用操作系统的动态链接器（如 Linux 的 ld-linux.so）来完成符号解析。开发者只需要提供函数名和类型签名，Bun FFI 会在加载的共享库中查找对应的符号地址，并生成调用该地址的 JavaScript 函数。

### 2.2 Bun FFI 类型映射

Bun FFI 的核心是将 JavaScript 类型与 C 类型进行映射。这个映射过程涉及类型的大小、对齐方式、符号扩展规则等多个方面。以下是 Bun FFI 支持的主要类型映射表：

| Bun FFI 类型 | C 类型 | JavaScript 类型 | 大小（字节） | 说明 |
|-------------|--------|----------------|-------------|------|
| "char" | char | number | 1 | 有符号单字节整数 |
| "uchar" | unsigned char | number | 1 | 无符号单字节整数 |
| "short" | short | number | 2 | 有符号短整数 |
| "ushort" | unsigned short | number | 2 | 无符号短整数 |
| "int" | int | number | 4 | 有符号整数 |
| "uint" | unsigned int | number | 4 | 无符号整数 |
| "i32" | int32_t | number | 4 | 32位有符号整数 |
| "u32" | uint32_t | number | 4 | 32位无符号整数 |
| "i64" | int64_t | bigint | 8 | 64位有符号整数（必须用 BigInt） |
| "u64" | uint64_t | bigint | 8 | 64位无符号整数（必须用 BigInt） |
| "float" | float | number | 4 | 单精度浮点数 |
| "double" | double | number | 8 | 双精度浮点数 |
| "ptr" | void* | number (pointer) | 8 | 指针，在 JS 中表现为数字 |
| "void" | void | undefined | 0 | 无返回值 |
| "bool" | _Bool | boolean | 1 | 布尔值 |

**类型映射的关键注意事项**：

**32位与64位整数**：JavaScript 的 number 类型是 IEEE 754 双精度浮点数，可以精确表示 -2^53 到 2^53 之间的整数。对于 32 位整数（int、uint），JavaScript 的 number 可以精确表示，因此 Bun FFI 自动将 32 位整数映射为 number。但对于 64 位整数（i64、u64），JavaScript 的 number 无法精确表示，必须使用 BigInt 类型。在声明函数签名时，如果参数或返回值为 64 位整数，必须在 JavaScript 中使用 BigInt 值。

**指针类型**：在 JavaScript 中，指针被表示为 number 类型。这个值是一个内存地址，不应该被直接用于算术运算或作为普通数字使用。Bun FFI 提供了 ptr() 函数将 TypedArray 转换为指针值，也提供了 toArrayBuffer() 函数将指针值转换回 TypedArray 可读的内存区域。指针的传递是 FFI 中最容易出现问题的部分，错误地使用指针值可能导致段错误或数据损坏。

**布尔类型**：C 语言的 _Bool 类型在 JavaScript 中映射为 boolean。需要注意的是，C 语言中非零值被视为 true，零值被视为 false，Bun FFI 自动处理这种转换。

**字符串类型**：Bun FFI 不直接支持字符串类型。字符串需要通过 CString 类转换为 C 兼容的指针，或者从 C 函数返回的指针中读取字符串内容。CString 类封装了字符串与 C 指针之间的转换逻辑，包括编码转换（UTF-8 ↔ JavaScript 内部编码）和内存管理。

### 2.3 调用约定：cdecl 与 thiscall

调用约定（Calling Convention）定义了函数调用的底层机制，包括参数传递方式、栈管理责任和寄存器使用规则。Bun FFI 自动处理调用约定的差异，但理解这些约定有助于排查复杂问题。

**cdecl（C Declaration）**：

cdecl 是 C 语言最常用的调用约定，也是 Bun FFI 默认使用的约定。在 cdecl 约定中：

- **参数传递**：参数从右向左压入栈中（x86）或通过寄存器传递（x86-64）。这种参数传递顺序使得可变参数函数（如 printf）的实现变得简单：被调用者不需要知道参数的数量，因为参数是从左向右依次解析的，而最左边的参数位于栈顶。
- **栈清理**：调用者负责清理栈上的参数。这意味着每次函数调用后，调用者需要调整栈指针以移除压入的参数。这种方式的优势在于可变参数函数的实现变得简单，因为只有调用者才知道实际传递了多少参数。
- **返回值**：返回值存储在 EAX 寄存器中（x86）或 RAX 寄存器中（x86-64）。对于 64 位返回值，使用 EDX:EAX（x86）或 RDX:RAX（x86-64）寄存器对。
- **寄存器保存**：被调用者必须保存 EBP、EBX、EDI、ESI 等寄存器的值，调用者不需要保存寄存器。

**thiscall**：

thiscall 是 C++ 中用于调用成员函数的调用约定。它与 cdecl 的主要区别在于 this 指针的传递方式：

- **x86 上的 thiscall**：this 指针通过 ECX 寄存器传递，其他参数通过栈传递。被调用者负责清理栈。
- **x86-64 上的 thiscall**：在 x86-64 上，thiscall 与 cdecl 的行为一致——this 指针作为第一个参数通过 RDI 寄存器传递。这是因为 x86-64 的寄存器数量足够多，可以容纳 this 指针和其他参数。
- **C++ 虚函数调用**：调用 C++ 虚函数时，需要通过虚函数表（vtable）进行间接调用。Bun FFI 不支持直接调用 C++ 的成员函数，但可以通过传递 this 指针和手动计算 vtable 偏移来间接调用。

**stdcall（Standard Call）**：

stdcall 是 Windows API 使用的调用约定，与 cdecl 的主要区别在于栈清理的责任：

- **参数传递**：与 cdecl 相同，参数从右向左压入栈中。
- **栈清理**：被调用者负责清理栈。这意味着函数必须在返回前调整栈指针，移除自己的参数。这种方式的优势在于生成的代码更紧凑（不需要在每个调用点插入栈清理代码），但不支持可变参数函数。
- **名称修饰**：stdcall 函数名被修饰为 `_function@N` 的形式，其中 N 是参数的总字节数。

Bun FFI 在 Windows 上自动使用 stdcall 约定调用 Win32 API 函数，在 Linux 和 macOS 上使用 cdecl 或 System V AMD64 约定。

**调用约定的选择**：

对于大多数场景，Bun FFI 自动选择合适的调用约定。开发者不需要手动指定调用约定，Bun 会根据平台和函数签名自动处理。只有在调用非标准约定的函数（如某些嵌入系统或旧代码的特定约定）时，才需要关注调用约定的问题。

### 2.4 内存管理：ptr、CString、JSCallback

Bun FFI 的内存管理是正确使用 FFI 的关键。与 JavaScript 的自动垃圾回收不同，C 语言的内存管理需要手动分配和释放。Bun FFI 提供了几个核心工具来桥接这两种内存管理模型。

**ptr() 函数**：

`ptr(typedArray)` 函数是 Bun FFI 中最基础的内存工具。它接受一个 TypedArray（如 Uint8Array、Int32Array、Float64Array 等）作为参数，返回一个表示该数组底层内存地址的指针值（number 类型）。这个指针值可以作为 FFI 函数的参数传递给 C 函数，让 C 函数直接读写 JavaScript 数组的内存。

`ptr()` 的工作原理是获取 TypedArray 的 ArrayBuffer 的底层内存地址。由于 TypedArray 的 ArrayBuffer 在 JavaScript 引擎中是以连续内存块的形式存储的，C 函数可以像操作普通 C 数组一样操作这块内存。这种零拷贝的方式避免了数据在 JavaScript 和 C 之间来回复制的开销。

使用 `ptr()` 的注意事项：

1. **内存生命周期**：TypedArray 对象必须在 C 函数执行期间保持存活。如果 TypedArray 被垃圾回收，其底层内存可能被释放，C 函数操作的就是野指针，导致未定义行为（通常是段错误）。因此，在 C 函数返回之前，必须确保 TypedArray 引用不被释放。

2. **内存对齐**：TypedArray 的底层内存通常是按 8 字节对齐的，适合大多数 C 结构体的对齐要求。但对于需要特定对齐的数据类型（如 16 字节对齐的 SSE 数据类型），可能需要使用特殊的分配方法。

3. **内存大小**：`ptr()` 返回的指针指向整个 ArrayBuffer 的起始地址，而不是 TypedArray 的视图起始位置。如果 TypedArray 是从 ArrayBuffer 的某个偏移开始的视图（subarray），需要额外计算偏移量。

**toArrayBuffer() 函数**：

`toArrayBuffer(ptr, byteLength)` 函数执行与 `ptr()` 相反的操作：它接受一个 C 指针和长度，返回一个指向同一内存区域的 ArrayBuffer。通过这个 ArrayBuffer 创建的 TypedArray，JavaScript 代码可以直接读取 C 函数写入内存的数据。

`toArrayBuffer()` 返回的 ArrayBuffer 是"外部"的（external），即它的内存不是由 JavaScript 引擎分配的，而是由 C 代码分配和管理的。因此，JavaScript 引擎不会自动释放这块内存。开发者需要确保在不再需要数据时，由 C 代码释放对应的内存。

**CString 类**：

`CString` 是 Bun FFI 提供的字符串处理工具，用于在 JavaScript 字符串和 C 字符串（null-terminated char*）之间进行转换。

`new CString(str)` 创建一个 CString 实例，内部完成以下工作：

1. 将 JavaScript 字符串编码为 UTF-8 字节序列。
2. 分配足够的内存来存储字节序列和 null 终止符。
3. 将字节序列和 null 终止符写入分配的内存。
4. 提供 `.ptr` 属性，返回指向该内存的指针值。

CString 实例的 `.ptr` 属性可以直接作为 `"ptr"` 类型的参数传递给 FFI 函数。C 函数接收到的是一个合法的 char* 指针，可以像处理普通 C 字符串一样处理它。

`new CString(ptr)`（将指针作为参数）创建一个指向已有 C 字符串的 CString 视图。当 CString 以这种方式创建时，它不会分配新内存，而是直接引用指针指向的内存。通过 `.toString()` 方法，可以将 C 字符串读取为 JavaScript 字符串。

CString 的内存管理：

- CString 实例分配的内存由 Bun FFI 管理，当 CString 实例被垃圾回收时，对应的内存会被自动释放。
- 对于 C 函数返回的指针创建的 CString，Bun 不会自动释放 C 端的内存。开发者需要调用对应的 C free 函数来释放内存。
- CString 在创建时会立即分配内存和编码字符串，没有惰性求值。

**JSCallback 类**：

`JSCallback` 是 Bun FFI 提供的将 JavaScript 函数转换为 C 函数指针的工具。这在需要向 C 函数传递回调函数时非常有用，例如排序比较函数、事件处理回调、异步完成通知等。

`new JSCallback(fn, { args: [...], returns: "..." })` 创建一个 JSCallback 实例，内部完成以下工作：

1. 分配一段可执行内存（executable memory），用于存放跳转到 JavaScript 回调函数的机器指令。
2. 生成一个"桩"（trampoline）函数，该函数遵循 C 调用约定，接收参数后调用 JavaScript 回调函数。
3. 提供 `.ptr` 属性，返回指向该桩函数的指针值。

当 C 代码通过这个函数指针调用时，执行流程如下：

1. C 代码按照调用约定压入参数。
2. CPU 跳转到桩函数地址。
3. 桩函数保存寄存器状态，从 C 栈中提取参数。
4. 桩函数调用 JavaScript 回调函数，传递转换后的参数。
5. JavaScript 回调函数执行，返回结果。
6. 桩函数将结果转换为 C 返回值，恢复寄存器状态。
7. 返回到 C 代码继续执行。

JSCallback 的生命周期管理非常重要：

- **必须手动关闭**：JSCallback 实例必须显式调用 `.close()` 方法来释放分配的可执行内存。如果不关闭，每次创建 JSCallback 都会泄露一段可执行内存。
- **线程安全**：JSCallback 的回调函数在调用 C 函数的线程上执行。在 Bun 中，这通常是主线程，但在某些情况下可能涉及其他线程。
- **性能开销**：每次通过 JSCallback 调用 JavaScript 函数都有一定的开销（约 100-200ns），包括上下文切换和类型转换。对于高频调用的回调（如每个元素的比较函数），这个开销可能成为性能瓶颈。

## 3. 风险与优化

### 3.1 内存泄漏

FFI 编程中内存泄漏是最常见且最危险的问题之一。JavaScript 开发者习惯了自动垃圾回收，往往容易忽视跨语言边界的内存管理问题。在 Bun FFI 中，内存泄漏主要来自以下几个方面：

**C 分配的内存未释放**：

当 C 函数通过 malloc、strdup、calloc 等函数分配内存并返回指针时，JavaScript 端获得了这块内存的所有权，但 JavaScript 的垃圾回收器不知道这块内存的存在。如果开发者忘记调用对应的 free 函数，这块内存就会永远泄漏。

```typescript
// 危险：strdup 返回的内存永远不会被释放
const ptr = lib.symbols.strdup(someCString.ptr);
// 使用 ptr ...
// 忘记调用 free(ptr) → 内存泄漏

// 正确：使用完毕后立即释放
const ptr = lib.symbols.strdup(someCString.ptr);
try {
  // 使用 ptr ...
} finally {
  lib.symbols.free(ptr);
}
```

这种泄漏在长时间运行的服务中尤其危险。每次泄漏少量内存，累积起来可能导致进程的 RSS（驻留内存）持续增长，最终触发 OOM（Out of Memory）被系统杀死。诊断这类问题通常需要借助 valgrind、AddressSanitizer 或 Bun 内置的内存监控工具。

**CString 循环引用**：

虽然 CString 实例的内存由 Bun 管理，但如果 CString 实例被长期持有（如存储在全局 Map 中或闭包中），其分配的内存也无法被回收。在循环引用场景中，如果 CString 实例间接引用了自身（通过 FFI 回调），可能导致整个引用链无法被垃圾回收。

**JSCallback 未关闭**：

JSCallback 实例在创建时会分配可执行内存（executable memory），这种内存是稀缺资源（操作系统通常限制每进程的可执行内存总量）。如果每次创建 JSCallback 后忘记关闭，不仅会泄漏内存，还可能耗尽操作系统的可执行内存配额，导致后续的 JSCallback 创建失败。

```typescript
// 危险：每次调用都会创建一个新的 JSCallback，但从不关闭
function sortWithFFI(arr: Int32Array) {
  const cb = new JSCallback(/* ... */);
  lib.symbols.qsort(ptr(arr), BigInt(arr.length), BigInt(4), cb.ptr);
  // 忘记 cb.close() → 可执行内存泄漏
}

// 正确：重用或及时关闭
let cachedCb: JSCallback | null = null;
function sortWithFFI(arr: Int32Array) {
  if (cachedCb) cachedCb.close();
  cachedCb = new JSCallback(/* ... */);
  lib.symbols.qsort(ptr(arr), BigInt(arr.length), BigInt(4), cachedCb.ptr);
}
// 在不需要时关闭
// cachedCb?.close();
```

**指针值被覆盖**：

当一个指针值被赋值给另一个变量或存储在某个容器中，但原始持有者被释放后，新持有者访问的是已经释放的内存。这种"悬空指针"问题在 C 语言中很常见，在 Bun FFI 中同样存在。

```typescript
// 危险：CString 被释放后，ptr 变为悬空指针
function getStringPtr(): number {
  const cs = new CString("temporary");
  return cs.ptr; // cs 在函数返回后被垃圾回收，返回的 ptr 无效
}

// 使用
const p = getStringPtr();
lib.symbols.printf(p, 0); // 可能访问已释放的内存
```

**内存泄漏的优化策略**：

1. **建立明确的所有权模型**：每块内存都应该有明确的所有者（C 或 JavaScript），所有者负责释放。在代码中清晰标注哪些指针需要手动释放。

2. **使用 RAII 模式**：在 TypeScript 中模拟 RAII（Resource Acquisition Is Initialization），使用类的构造函数分配资源，析构函数释放资源。

```typescript
class AutoFreePtr {
  constructor(private ptr: number, private freeFn: (p: number) => void) {}
  
  [Symbol.dispose]() {
    if (this.ptr !== 0) {
      this.freeFn(this.ptr);
      this.ptr = 0;
    }
  }
  
  get value() { return this.ptr; }
}
```

3. **使用 try/finally 确保释放**：在所有可能提前返回或抛出异常的地方，使用 try/finally 确保资源释放。

4. **限制 FFI 调用频率**：对于高频调用的 FFI 函数，考虑批处理或缓存结果，减少内存分配和释放的次数。

5. **定期监控内存使用**：在生产环境中监控进程的 RSS 和堆内存使用情况，设置告警阈值，及时发现内存泄漏。

### 3.2 段错误导致进程崩溃

段错误（Segmentation Fault）是 FFI 编程中最严重的运行时错误。当程序访问了未被映射的内存地址、向只读内存写入数据或破坏了栈结构时，操作系统会发送 SIGSEGV 信号，默认行为是终止进程。与 JavaScript 的异常不同，段错误无法被 try/catch 捕获，它会直接导致 Bun 进程崩溃。

**段错误的常见原因**：

**空指针解引用**：C 函数返回 NULL 指针表示错误，但如果 JavaScript 代码直接使用这个 NULL 指针作为参数传递给其他 C 函数，或者使用 toArrayBuffer 读取 NULL 指向的内存，就会触发段错误。

```typescript
// 危险：未检查返回值
const result = lib.symbols.someFunction(ptr);
const buf = toArrayBuffer(result, 100); // result 可能为 NULL → 段错误

// 正确：检查指针是否有效
const result = lib.symbols.someFunction(ptr);
if (result === 0 || result === null) {
  throw new Error("Function returned null pointer");
}
const buf = toArrayBuffer(result, 100);
```

**缓冲区溢出**：当向 C 函数传递的缓冲区大小小于 C 函数实际写入的数据量时，C 函数会写入超出缓冲区边界的内存，破坏相邻的内存区域。这种错误可能在当前代码中不会立即触发段错误，而是在后续某个不确定的时间点崩溃（称为"延时崩溃"），诊断非常困难。

```typescript
// 危险：缓冲区大小不匹配
const buf = new Uint8Array(8);  // 8 字节缓冲区
lib.symbols.readData(ptr(buf)); // C 函数可能写入超过 8 字节

// 正确：使用足够大的缓冲区或获取所需大小
const size = lib.symbols.getRequiredSize();
const buf = new Uint8Array(size);
lib.symbols.readData(ptr(buf), BigInt(size));
```

**类型签名不匹配**：当声明的函数签名与实际 C 函数的签名不一致时，Bun FFI 生成错误的参数编组代码，导致栈或寄存器中的数据布局错误。这种错误通常表现为函数返回奇怪的值或随机触发段错误。

```typescript
// C 函数：int64_t compute(int32_t a, int64_t b);
// 错误声明（类型不匹配）
const lib = dlopen("./lib.so", {
  compute: { args: ["i64", "i32"], returns: "int" }  // 类型顺序和大小都错了
});

// 正确声明
const lib = dlopen("./lib.so", {
  compute: { args: ["i32", "i64"], returns: "i64" }
});
```

**栈溢出**：当通过 JSCallback 进行深层递归调用时，C 栈和 JavaScript 栈都可能被耗尽。C 函数的栈通常较小（默认 8MB），而递归调用的每次函数调用都会消耗栈空间。如果回调函数中再次调用 C 函数，而 C 函数又调用回调，形成相互递归，栈空间可能迅速耗尽。

**已释放内存的访问**：这是最常见的一类段错误。当 JavaScript 的垃圾回收器回收了某个 TypedArray 或 CString 的底层内存，但 C 代码仍然持有指向该内存的指针时，后续的访问操作会读取或写入已释放的内存。

```typescript
// 危险：TypedArray 可能被垃圾回收
function processData() {
  const data = new Uint8Array(1024);
  // 将 data 的指针传给 C 函数异步处理
  lib.symbols.asyncProcess(ptr(data), BigInt(data.length));
  // data 在这里可能被回收（如果函数不再引用它）
  // 而 C 函数仍在后台使用这个指针
}
```

**段错误的防护策略**：

1. **全面验证返回值**：所有返回指针的 FFI 函数调用都必须检查返回值是否为 NULL 或 0。

2. **使用安全缓冲区**：为 C 函数分配缓冲区时，分配足够的空间，并传入缓冲区大小参数。

3. **确保指针生命周期**：在 C 函数使用指针期间，确保对应的 TypedArray 或 CString 实例不被回收。可以通过将引用保持在作用域内或使用全局缓存来实现。

4. **类型签名双重检查**：编写 FFI 声明时，对照 C 头文件逐字段检查类型映射是否正确。特别注意 32 位和 64 位整数的区分。

5. **使用 AddressSanitizer 调试**：在开发环境中使用 AddressSanitizer（ASan）编译共享库，可以检测缓冲区溢出、释放后使用等内存错误。

6. **分段测试**：逐个函数测试 FFI 绑定，确保每个函数的行为符合预期，再进行组合使用。

### 3.3 线程安全

Bun 默认使用单线程事件循环模型，但 FFI 调用可能引入多线程的复杂性。理解 FFI 的线程安全模型对于避免竞态条件和数据损坏至关重要。

**Bun 的线程模型**：

Bun 基于 JavaScriptCore 引擎，默认使用单线程事件循环。所有的 JavaScript 代码在同一个线程上执行，通过异步 I/O 和协程（如 Bun.sleep、Promise）实现并发。然而，通过 FFI 调用的 C 代码可能创建自己的线程，或者调用 C 库中使用了多线程的函数。

**FFI 调用中的线程问题**：

**C 函数内部的多线程**：某些 C 库（如 OpenSSL、SQLite）在内部使用多线程进行并行计算。当通过 FFI 调用这些函数时，C 代码可能在多个线程上执行，而 JavaScript 回调（通过 JSCallback）可能从非主线程调用。如果 JSCallback 试图访问 JavaScript 对象或调用 JavaScript API，可能导致未定义行为。

```typescript
// 危险：C 库在多线程中调用回调
const callback = new JSCallback((ptr: number) => {
  // 如果这个回调从非主线程调用，访问 Bun 对象可能崩溃
  console.log("Callback invoked"); // 可能不安全
  return 0;
}, { args: ["ptr"], returns: "int" });

lib.symbols.register_callback(callback.ptr);
// C 库可能在内部线程中调用 callback
```

**共享状态的竞态条件**：当多个 FFI 调用同时操作同一块内存时（例如通过 TypedArray 共享的缓冲区），可能出现竞态条件。虽然 JavaScript 是单线程的，但如果 C 代码在异步 FFI 调用中修改共享内存，而 JavaScript 也在读取同一块内存，数据的一致性就无法保证。

**全局状态的线程不安全**：某些 C 库使用全局变量或线程局部存储（TLS）来维护状态。当从不同上下文调用时，这些全局状态可能被意外修改。例如，使用 strtok（非线程安全版本）在不同 FFI 调用中交替调用会导致状态混乱。

**线程安全的优化策略**：

1. **避免 JSCallback 中的线程不安全操作**：在 JSCallback 中只进行简单的数据操作，不要访问 Bun 的 I/O API 或复杂的 JavaScript 对象。如果需要在回调中执行异步操作，使用消息队列将数据传递到主线程。

```typescript
const pendingData: number[] = [];
const callback = new JSCallback((ptr: number) => {
  pendingData.push(ptr); // 简单操作，线程安全
  return 0;
}, { args: ["ptr"], returns: "int" });
```

2. **使用互斥锁保护共享状态**：如果 C 代码访问共享资源，在 C 层面使用互斥锁（pthread_mutex_t）保护。Bun FFI 不提供 JavaScript 层面的锁机制，因此所有同步操作应该在 C 层面完成。

3. **避免在 JSCallback 中调用 FFI**：在 JSCallback 中再次调用 FFI 函数可能导致重入问题，特别是在 C 库的内部锁已经被持有时。

4. **使用无锁数据结构**：对于高性能场景，考虑在 C 层面使用无锁数据结构（lock-free data structures），避免锁竞争带来的性能开销。

5. **文档化线程安全契约**：对于生产环境使用的 FFI 库，明确记录哪些函数是线程安全的，哪些只能在主线程调用。

### 3.4 跨平台兼容性

Bun 支持 Linux、macOS 和 Windows 三大主流操作系统，每个平台的共享库格式、加载机制和系统 API 都有差异。编写跨平台兼容的 FFI 代码需要仔细处理这些差异。

**共享库文件名差异**：

| 平台 | 共享库扩展名 | 系统 C 库 | 示例 |
|------|-------------|----------|------|
| Linux | .so | libc.so.6 | libm.so.6 |
| macOS | .dylib | libSystem.dylib | libm.dylib |
| Windows | .dll | msvcrt.dll | user32.dll |

在代码中，应该根据 platform 选择合适的库名：

```typescript
const libName = process.platform === "win32" 
  ? "msvcrt.dll" 
  : process.platform === "darwin" 
    ? "libSystem.dylib" 
    : "libc.so.6";

const lib = dlopen(libName, { /* ... */ });
```

**ABI 差异**：

不同操作系统在 ABI 层面存在差异：

| 特性 | Linux (x86-64) | macOS (ARM64) | Windows (x86-64) |
|------|---------------|--------------|------------------|
| 调用约定 | System V AMD64 | ARM64 AAPCS | Microsoft x64 |
| 整数参数传递 | RDI, RSI, RDX, RCX, R8, R9 | X0-X7 | RCX, RDX, R8, R9 |
| 浮点参数传递 | XMM0-XMM7 | V0-V7 | XMM0-XMM3 |
| 栈对齐 | 16 字节 | 16 字节 | 16 字节 |
| 返回值 | RAX | X0 | RAX |
| 异常处理 | DWARF | ARM64 EH | SEH |

这些差异通常由 Bun FFI 自动处理，但在涉及汇编代码或非标准调用约定时需要注意。

**系统 API 可用性差异**：

许多 POSIX API 在 Windows 上不存在或名称不同：

| 功能 | POSIX (Linux/macOS) | Windows |
|------|-------------------|---------|
| 内存分配 | malloc/free | HeapAlloc/HeapFree |
| 文件操作 | open/read/write | CreateFile/ReadFile/WriteFile |
| 线程 | pthread | CreateThread |
| 时间 | clock_gettime | QueryPerformanceCounter |
| 网络 | socket API | Winsock |

编写跨平台 FFI 代码时，需要为每个平台提供独立的库加载和函数调用代码。

**架构差异**：

除了操作系统差异，CPU 架构也影响 FFI 的使用：

- **x86-64 vs ARM64**：寄存器名称和数量不同，指令集不同，数据对齐要求不同。
- **大小端**：x86-64 和 ARM64 都是小端（little-endian），但某些嵌入式架构是大端（big-endian）。
- **指针大小**：所有主流桌面和服务器架构都使用 64 位指针，但某些嵌入式系统可能使用 32 位指针。

**跨平台兼容性的优化策略**：

1. **抽象 FFI 层**：为不同平台创建统一的抽象接口，内部处理平台差异。

```typescript
interface SystemInfo {
  getpid(): number;
  getHostname(): string;
}

function createSystemInfo(): SystemInfo {
  if (process.platform === "win32") {
    return new WindowsSystemInfo();
  } else {
    return new PosixSystemInfo();
  }
}
```

2. **使用条件加载**：在运行时根据平台加载不同的共享库和符号。

3. **在 CI/CD 中测试多平台**：在持续集成中配置 Linux、macOS 和 Windows 的测试环境，确保 FFI 代码在所有目标平台上正常工作。

4. **容器化部署**：使用 Docker 容器部署可以简化跨平台问题，因为容器内通常是固定的 Linux 环境。

## 4. 典型问题处理

### 4.1 dlopen 失败

`dlopen` 失败是使用 Bun FFI 时最常见的初始化错误。当调用 `dlopen()` 加载共享库时，如果操作系统无法找到或加载指定的库文件，会抛出异常。正确诊断和处理 dlopen 失败是 FFI 编程的基础技能。

**常见原因**：

**库路径不正确**：当传入的库路径是相对路径时，操作系统会在标准库搜索路径中查找。Linux 的标准搜索路径包括 `/lib`、`/usr/lib`、`/usr/local/lib` 以及 `LD_LIBRARY_PATH` 环境变量指定的路径。如果库不在这些路径中，dlopen 会失败。

```typescript
// 可能失败：相对路径，库不在标准搜索路径中
const lib = dlopen("./custom.so", { /* ... */ });

// 更好的方式：使用绝对路径
const path = join(__dirname, "libs", "custom.so");
const lib = dlopen(path, { /* ... */ });
```

**缺少运行时依赖**：共享库可能依赖于其他共享库（通过 DT_NEEDED 条目指定）。如果这些依赖库不存在或版本不匹配，dlopen 会失败。可以使用 `ldd` 命令（Linux）或 `otool -L`（macOS）查看共享库的依赖关系。

**权限不足**：共享库文件没有读取权限或执行权限。在 Linux 上，共享库文件需要至少拥有读取权限。

**架构不匹配**：共享库的 CPU 架构与 Bun 运行时的架构不匹配。例如，在 ARM64 macOS 上加载 x86-64 的 .dylib 文件会导致加载失败。

**损坏的文件**：共享库文件损坏或不完整（例如下载中断导致的文件不完整）。

**诊断方法**：

1. **检查错误消息**：Bun 在 dlopen 失败时会抛出包含详细信息的异常，包括操作系统的错误消息。

```typescript
try {
  const lib = dlopen("./custom.so", { /* ... */ });
} catch (err) {
  console.error("dlopen failed:", err.message);
  // 输出类似 "dlopen failed: cannot open shared object file: No such file or directory"
}
```

2. **使用 ldd 检查依赖**：在 Linux 上，使用 `ldd custom.so` 查看所有依赖库及其解析状态。

3. **检查文件属性**：确认文件存在、有读取权限，且是有效的共享库格式。

4. **使用 strace 追踪系统调用**：在 Linux 上，使用 `strace -e openat bun run script.ts` 追踪 dlopen 尝试打开的文件路径。

**解决方案**：

1. 使用绝对路径或确保库在标准搜索路径中。
2. 安装缺少的依赖库（使用系统的包管理器）。
3. 设置 LD_LIBRARY_PATH 环境变量包含库所在目录。
4. 在 macOS 上，使用 `install_name_tool` 修改库的安装路径。
5. 为每个目标架构编译正确的共享库版本。

### 4.2 类型映射错误

类型映射错误是 FFI 编程中最隐蔽的问题之一。错误声明的函数签名可能不会立即导致程序崩溃，而是产生错误的结果或间歇性的段错误。理解类型映射错误的典型表现和排查方法至关重要。

**典型表现**：

**返回值异常**：C 函数返回了正确的结果，但 JavaScript 接收到的值完全错误。例如，一个返回 64 位整数的函数被声明为返回 32 位整数，导致高位被截断，返回值错误。

```typescript
// C 函数: uint64_t getTimestamp() { return 1746000000000; }
// 错误声明（类型太小）
const lib = dlopen("lib.so", {
  getTimestamp: { args: [], returns: "int" } // 应该用 "u64"
});
const ts = lib.symbols.getTimestamp(); // ts 是错误的值
```

**参数传递错误**：声明的参数类型与实际函数不匹配，导致 C 函数接收到错误的值。例如，传递 64 位整数时使用了 number 而不是 BigInt，导致精度丢失。

```typescript
// C 函数: void processBigData(int64_t size, void* data);
// 错误调用（未使用 BigInt）
lib.symbols.processBigData(1000000000000, ptr(data)); 
// 1000000000000 超过 Number 的安全整数范围，精度丢失

// 正确调用
lib.symbols.processBigData(BigInt(1000000000000), ptr(data));
```

**指针错误**：在需要指针的地方传递了普通数字，或将指针值用于算术运算。指针在 Bun FFI 中表现为 number，但不是所有 number 都可以作为指针使用。

**排查方法**：

1. **对照 C 头文件检查声明**：逐字段对比 C 函数声明和 Bun FFI 的类型映射声明，确保每个参数的类型和顺序完全一致。

2. **使用已知结果的测试函数**：编写简单的测试函数，用已知输入验证 FFI 调用的输出是否正确。

3. **使用 printf 调试**：在 C 代码中添加 printf 语句，打印接收到的参数值，与 JavaScript 传递的值对比。

4. **检查数据大小和对齐**：对于结构体，确认 C 编译器的内存布局（包括填充字节）与 JavaScript 的手动布局一致。

**常见类型映射错误对照表**：

| 错误 | 症状 | 正确做法 |
|------|------|---------|
| int 与 i64 混淆 | 大整数溢出或截断 | 超过 2^53 的值用 i64/u64 |
| 指针与整数混淆 | 段错误或非法内存访问 | 明确区分 ptr 和数值类型 |
| 有符号与无符号混淆 | 大负数出现在正数场景 | 根据 C 类型选择 signed/unsigned |
| 忽略结构体对齐 | 结构体字段读取错误 | 计算正确的偏移量和对齐填充 |
| 返回值类型错误 | 函数返回 undefined 或 NaN | 确保 returns 类型正确 |

### 4.3 进程崩溃

当 Bun 进程因为 FFI 调用而崩溃时，标准的 try/catch 无法捕获错误。进程崩溃通常表现为程序突然退出，没有抛出任何 JavaScript 异常。诊断这类问题需要系统级的调试工具和方法。

**崩溃类型**：

**立即崩溃**：在 FFI 函数调用时立即发生段错误。这种崩溃通常由空指针解引用、无效内存访问或错误的函数签名引起。崩溃点在 C 代码中，Bun 无法捕获，进程直接退出。

**延时崩溃**：FFI 调用返回后一段时间才崩溃。这种崩溃通常由缓冲区溢出、已释放内存的访问或栈损坏引起。崩溃点可能在完全无关的代码路径中，诊断极其困难。

**条件崩溃**：只在特定输入或特定环境下崩溃。这种崩溃通常由未初始化变量、竞态条件或特定数据组合触发。

**诊断工具**：

1. **核心转储（Core Dump）**：启用核心转储后，进程崩溃时会将内存映像保存到文件。可以使用 GDB 分析核心转储文件，查看崩溃时的调用栈、寄存器和内存状态。

```bash
# 启用核心转储
ulimit -c unlimited
# 运行程序
bun run ffi-script.ts
# 分析核心转储
gdb bun core
```

2. **AddressSanitizer（ASan）**：使用 AddressSanitizer 编译共享库，可以检测缓冲区溢出、释放后使用、双重释放等内存错误。ASan 在检测到错误时会打印详细的诊断信息，包括错误类型、访问地址、分配和释放的调用栈。

3. **Valgrind**：Valgrind 是一个内存调试和分析工具，可以检测内存泄漏、未初始化内存访问和非法内存操作。但 Valgrind 会使程序运行速度降低 10-20 倍，不适合在生产环境中使用。

4. **Bun 的 --smol 模式**：Bun 提供了 `--smol` 模式，可以减少内存使用并更早地暴露内存问题。

**崩溃预防策略**：

1. **沙箱测试**：在隔离的测试环境中逐个测试 FFI 函数，确保每个函数在不同输入下都能稳定运行。

2. **输入验证**：在传递给 FFI 函数之前，验证所有输入值的合法性，包括指针是否为 NULL、大小是否在合理范围内、枚举值是否有效。

3. **防御性编程**：在 C 代码中添加边界检查、空指针检查和错误处理，不假设调用者会传递合法的参数。

4. **使用信号处理**：虽然无法用 try/catch 捕获 SIGSEGV，但可以注册信号处理器来记录崩溃信息并执行清理操作。

### 4.4 内存泄漏检测

在 FFI 编程中，内存泄漏的检测比纯 JavaScript 编程更加复杂，因为 JavaScript 的垃圾回收器不知道 C 层面分配的内存。有效的内存泄漏检测需要结合多种工具和方法。

**Bun 内置内存监控**：

Bun 提供了一些内置的内存监控功能，可以帮助检测内存泄漏：

```typescript
// 查看当前进程的内存使用情况
const usage = process.memoryUsage();
console.log("RSS:", usage.rss);
console.log("Heap Total:", usage.heapTotal);
console.log("Heap Used:", usage.heapUsed);
console.log("External:", usage.external); // 外部内存（包括 FFI 分配的内存）
```

持续监控 external 内存的变化趋势，可以初步判断是否存在 FFI 内存泄漏。

**系统级工具**：

1. **Valgrind 的 memcheck 工具**：Valgrind 的 memcheck 工具可以跟踪所有的内存分配和释放操作，在程序退出时报告未释放的内存。它还能检测缓冲区溢出、使用未初始化内存等错误。

```bash
valgrind --leak-check=full --show-leak-kinds=all bun run ffi-script.ts
```

2. **AddressSanitizer**：在编译共享库时启用 ASan 的泄漏检测功能：

```bash
# 编译时添加 ASan 标志
clang -fsanitize=address -fno-omit-frame-pointer -g -O1 -shared -o lib.so lib.c

# 运行（ASan 会在程序退出时报告内存泄漏）
bun run ffi-script.ts
```

3. **heaptrack**：heaptrack 是一个 Linux 上的堆内存分析工具，可以记录所有的内存分配和释放操作，生成详细的分析报告。

**代码层面的检测策略**：

1. **分配计数**：在 FFI 调用中维护分配计数器和释放计数器，定期检查两者是否平衡。

```typescript
let allocCount = 0;
let freeCount = 0;

function trackedMalloc(size: number): number {
  allocCount++;
  return lib.symbols.malloc(size);
}

function trackedFree(ptr: number): void {
  freeCount++;
  lib.symbols.free(ptr);
}

// 定期检查
setInterval(() => {
  console.log(`Allocations: ${allocCount}, Frees: ${freeCount}, Delta: ${allocCount - freeCount}`);
  if (allocCount - freeCount > THRESHOLD) {
    console.warn("Potential memory leak detected");
  }
}, 60000);
```

2. **包装函数自动释放**：创建包装函数，在 finally 块中自动释放资源。

3. **快照对比**：在关键操作前后拍摄内存快照，对比变化。

**生产环境的内存监控**：

在生产环境中，除了代码层面的监控外，还需要系统级别的告警：

1. 监控进程的 RSS（Resident Set Size）是否持续增长。
2. 设置 RSS 增长率的告警阈值。
3. 在达到内存上限时自动重启进程（如 Kubernetes 的 liveness probe）。

## 5. 必备知识

### 5.1 C 指针和内存布局

理解和正确使用 C 指针是掌握 Bun FFI 的核心前提。JavaScript 开发者通常不需要关心内存地址和数据布局，但 FFI 编程要求对这些概念有深入的理解。

**指针基础**：

指针是存储内存地址的变量。在 C 语言中，`int* p` 声明了一个指向 int 类型变量的指针。指针的值是某个内存地址，通过解引用操作符 `*p` 可以访问该地址上存储的值。

在 Bun FFI 中，指针被表示为 JavaScript 的 number 类型（64 位浮点数，但在表示地址时取其整数部分）。这个 number 值就是 C 指针在内存中的地址值。开发者不应对指针值进行算术运算（除非明确需要指针偏移计算），也不应将其视为普通数字。

**指针与数组的关系**：

在 C 语言中，数组名本质上是一个指向数组第一个元素的常量指针。`arr[i]` 等价于 `*(arr + i)`，即先计算偏移量，然后解引用。这意味着 C 数组和指针在底层是统一的。

在 Bun FFI 中，这种统一性意味着你可以将 TypedArray 的指针传递给期望 C 数组的 C 函数。TypedArray 在内存中是连续存储的，布局与 C 数组完全一致。例如，一个 Int32Array 在内存中的布局与 C 语言的 `int32_t arr[]` 完全相同。

**结构体的内存布局**：

C 结构体（struct）的内存布局比基本类型复杂，因为编译器可能会在字段之间插入填充字节（padding）以满足对齐要求。

```c
struct Example {
  char a;     // 1 字节，偏移 0
  // 3 字节填充
  int b;      // 4 字节，偏移 4
  double c;   // 8 字节，偏移 8
  short d;    // 2 字节，偏移 16
  // 6 字节填充（结构体对齐到最大成员对齐要求）
}; // 总大小 24 字节
```

结构体的对齐规则：

1. 每个字段的偏移量必须是该字段大小的整数倍。
2. 结构体的总大小必须是最大字段大小的整数倍。
3. 编译器可能在字段之间和结构体末尾插入填充字节。

在 Bun FFI 中，由于没有内置的结构体支持，开发者需要手动计算字段偏移量并读取每个字段：

```typescript
// 对应 C 结构体
// struct timespec { time_t tv_sec; long tv_nsec; };
// 在 64 位 Linux 上：tv_sec = 8 字节 (偏移 0)，tv_nsec = 8 字节 (偏移 8)
const buf = new Uint8Array(16); // 分配结构体大小的缓冲区
lib.symbols.clock_gettime(CLOCK_MONOTONIC, ptr(buf));

const dv = new DataView(buf.buffer);
const tv_sec = Number(dv.getBigUint64(0, true));  // 读取 tv_sec
const tv_nsec = Number(dv.getBigUint64(8, true)); // 读取 tv_nsec
```

**内存区域划分**：

理解进程的内存布局有助于诊断 FFI 相关的问题：

| 区域 | 用途 | FFI 相关性 |
|------|------|-----------|
| 栈（Stack） | 局部变量、函数调用帧 | C 函数的局部变量在此分配 |
| 堆（Heap） | 动态分配的内存 | malloc/free 分配的内存在此 |
| 数据段（Data） | 全局变量和静态变量 | 全局状态可能被 FFI 修改 |
| 代码段（Text） | 程序指令 | 共享库的代码加载到此 |
| 内存映射段（mmap） | 文件映射、共享内存 | dlopen 加载的库在此区域 |

### 5.2 共享库编译与链接

要使用 Bun FFI 调用自定义 C 代码，需要将 C 代码编译为共享库。理解共享库的编译和链接过程对于创建可用的 FFI 库至关重要。

**编译共享库**：

在 Linux 上，使用 GCC 或 Clang 编译共享库：

```bash
# 编译为位置无关代码（PIC）
gcc -fPIC -c mylib.c -o mylib.o

# 链接为共享库
gcc -shared -o libmylib.so mylib.o
```

`-fPIC`（Position Independent Code）标志是编译共享库的关键。它生成的代码不依赖于特定的内存地址，可以在进程地址空间的任何位置加载。没有这个标志，共享库可能无法正确加载。

**导出符号**：

默认情况下，C 编译器会导出所有非静态（non-static）函数。可以通过以下方式控制符号的可见性：

```c
// 默认导出所有非静态函数
int public_function(int x) { return x * 2; }

// 使用 static 隐藏函数
static int hidden_function(int x) { return x * 3; }

// 使用 visibility 属性控制（GCC/Clang）
__attribute__((visibility("default"))) int exported_function(int x) { return x * 4; }
__attribute__((visibility("hidden"))) int internal_function(int x) { return x * 5; }
```

在编译时使用 `-fvisibility=hidden` 标志，然后显式标记要导出的函数，可以减小共享库的体积并避免符号冲突。

**名称修饰（Name Mangling）**：

C 语言的函数名在编译后保持不变（加下划线前缀，如 `printf` → `_printf`）。但 C++ 编译器会对函数名进行修饰，包含函数名、参数类型和命名空间信息，生成类似 `_Z5funcid` 的修饰名。

Bun FFI 期望 C 语言的函数名，因此：

1. 如果使用 C++ 编写共享库，函数必须用 `extern "C"` 声明，禁止名称修饰。
2. 共享库中的函数名必须与 dlopen 中声明的名称完全一致。

```cpp
// C++ 代码，导出为 C 函数
extern "C" {
  int add(int a, int b) { return a + b; }
}
```

**依赖库的处理**：

如果共享库依赖于其他库，在链接时需要指定：

```bash
# 链接数学库
gcc -shared -o libcalc.so calc.o -lm

# 链接 pthread
gcc -shared -o libworker.so worker.o -lpthread
```

使用 `ldd` 命令可以查看共享库的依赖关系：

```bash
ldd libcalc.so
# linux-vdso.so.1
# libm.so.6 => /lib/x86_64-linux-gnu/libm.so.6
# libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6
# /lib64/ld-linux-x86-64.so.2
```

**跨平台编译**：

为不同平台编译共享库需要不同的工具链：

| 平台 | 编译器 | 输出文件 | 编译命令 |
|------|--------|---------|---------|
| Linux x86-64 | gcc/clang | .so | `gcc -shared -fPIC -o lib.so` |
| macOS ARM64 | clang | .dylib | `clang -shared -o lib.dylib` |
| Windows x86-64 | MSVC/clang | .dll | `cl /LD /Fe:lib.dll` |
| Linux ARM64 | aarch64-linux-gnu-gcc | .so | 交叉编译 |

### 5.3 调用约定和 ABI

调用约定和 ABI 是 FFI 编程的核心理论基础。虽然 Bun FFI 自动处理这些细节，但理解它们有助于诊断和解决复杂的互操作问题。

**寄存器与栈的使用**：

在 x86-64 Linux（System V AMD64 ABI）上，函数调用时寄存器的使用规则：

| 寄存器 | 用途 | 调用者保存 | 被调用者保存 |
|--------|------|-----------|-------------|
| RAX | 返回值、临时变量 | 是 | 否 |
| RBX | 临时变量 | 否 | 是 |
| RCX | 第4个整数参数 | 是 | 否 |
| RDX | 第3个整数参数 | 是 | 否 |
| RSI | 第2个整数参数 | 是 | 否 |
| RDI | 第1个整数参数 | 是 | 否 |
| R8 | 第5个整数参数 | 是 | 否 |
| R9 | 第6个整数参数 | 是 | 否 |
| R10-R11 | 临时变量 | 是 | 否 |
| R12-R15 | 临时变量 | 否 | 是 |
| XMM0-XMM7 | 浮点参数 | 是 | 否 |
| XMM8-XMM15 | 临时变量 | 是 | 否 |

当参数超过 6 个整数或 8 个浮点数时，多余的参数通过栈传递。栈上的参数从右向左压入。

**数据对齐**：

CPU 访问对齐的数据比访问非对齐的数据更快，某些 CPU 架构甚至不支持非对齐访问。C 编译器会自动在结构体字段之间插入填充字节以满足对齐要求：

| 类型 | 大小（字节） | 对齐要求 |
|------|-------------|---------|
| char | 1 | 1 |
| short | 2 | 2 |
| int | 4 | 4 |
| long | 8 | 8 |
| float | 4 | 4 |
| double | 8 | 8 |
| pointer | 8 | 8 |

在 Bun FFI 中处理结构体时，必须考虑这些对齐规则。错误计算偏移量是常见的 FFI 错误源。

**数据类型大小**：

不同平台和数据模型下，C 数据类型的大小可能不同：

| 类型 | LP64 (Linux/macOS) | LLP64 (Windows) |
|------|-------------------|----------------|
| char | 1 | 1 |
| short | 2 | 2 |
| int | 4 | 4 |
| long | 8 | 4 |
| long long | 8 | 8 |
| pointer | 8 | 8 |
| size_t | 8 | 8 |
| time_t | 8 | 8 |

LP64 和 LLP64 的主要区别在于 long 类型的大小。在 Linux 和 macOS 上 long 是 8 字节，在 Windows 上 long 是 4 字节。编写跨平台 FFI 代码时必须注意这个差异。

### 5.4 内存管理基础

FFI 编程中的内存管理比纯 JavaScript 或纯 C 编程都更复杂，因为需要同时管理两种内存模型的交互。

**栈内存与堆内存**：

C 语言中的内存分配有两种主要方式：

栈内存（自动变量）在函数返回时自动释放，不需要手动管理。但栈内存的生命周期受限于函数作用域，不能作为返回值或长期持有的数据。

```c
// 错误：返回栈内存指针
int* bad_alloc() {
  int x = 42;
  return &x; // x 在函数返回后释放，返回的指针是悬空指针
}

// 正确：使用堆内存
int* good_alloc() {
  int* p = malloc(sizeof(int));
  *p = 42;
  return p; // 堆内存在显式释放前一直有效
}
```

堆内存通过 malloc/calloc/realloc 分配，通过 free 释放。堆内存的生命周期由开发者控制，可以跨函数传递。

**所有权模型**：

在 FFI 编程中，每块内存都应有明确的所有者：

| 内存来源 | 所有者 | 释放方式 |
|---------|-------|---------|
| JavaScript 分配的 TypedArray | JavaScript 垃圾回收器 | 自动 |
| C 分配的 malloc 内存 | C 代码 | 调用 free |
| CString 分配的内存 | Bun FFI 运行时 | CString 被 GC 时自动释放 |
| JSCallback 分配的可执行内存 | JSCallback 实例 | 调用 close() |

**资源管理模式**：

在 TypeScript 中模拟 RAII（Resource Acquisition Is Initialization）模式：

```typescript
class ScopedMemory {
  private ptrs: number[] = [];
  private freeFn: (p: number) => void;

  constructor(freeFn: (p: number) => void) {
    this.freeFn = freeFn;
  }

  add(ptr: number): number {
    if (ptr !== 0) this.ptrs.push(ptr);
    return ptr;
  }

  release(): void {
    for (const ptr of this.ptrs) {
      this.freeFn(ptr);
    }
    this.ptrs = [];
  }

  [Symbol.dispose](): void {
    this.release();
  }
}

// 使用
using mem = new ScopedMemory((p) => lib.symbols.free(p));
const ptr1 = mem.add(lib.symbols.malloc(100));
const ptr2 = mem.add(lib.symbols.strdup(someString));
// 作用域结束时自动释放
```

**防止双重释放**：

双重释放（double free）是 C 内存管理中另一个严重问题。当同一块内存被释放两次时，堆管理器可能损坏，导致后续的内存分配或释放操作崩溃。

```typescript
// 危险：双重释放
const ptr = lib.symbols.malloc(100);
lib.symbols.free(ptr);
lib.symbols.free(ptr); // 双重释放，未定义行为

// 正确：释放后置空
const ptr = lib.symbols.malloc(100);
lib.symbols.free(ptr);
// 不要再使用 ptr
```

## 6. 示例代码与配置

### 6.1 docker-compose.yml

`docker-compose.yml` 定义了运行 FFI 示例的容器环境。我们选择使用 `oven/bun:latest` 镜像，因为它包含了 Bun 运行时和标准的 Linux C 库（glibc），为 FFI 示例提供了完整的运行环境。

**配置解读**：

```yaml
services:
  bun:
    image: oven/bun:latest
    container_name: bun-ch09
    working_dir: /app
    volumes:
      - ./examples:/app/examples
    entrypoint: ["/bin/sh", "-c"]
    command: >
      echo '=== 01-basic: C Library FFI ===' &&
      bun run examples/01-basic/ffi-basics.ts &&
      ...
```

`volumes` 配置将本地的 `examples` 目录挂载到容器的 `/app/examples` 路径。这意味着我们可以在宿主机上编辑代码，代码的变更会实时反映到容器中。`command` 使用 shell 的 `&&` 操作符依次运行三个示例，确保每个示例运行完毕后再执行下一个。

**为什么使用 Docker**：

FFI 示例需要调用系统 C 库（如 libc.so.6），不同的操作系统（Linux、macOS、Windows）的系统库路径和名称不同。使用 Docker 容器提供了一个标准化的 Linux 运行环境，避免了跨平台兼容性问题。此外，容器环境与宿主机隔离，即使 FFI 调用导致段错误，也不会影响宿主机的稳定性。

### 6.2 ffi-basics.ts 详解

`examples/01-basic/ffi-basics.ts` 是 Bun FFI 的入门示例，展示了最基本的 FFI 调用模式：加载共享库、声明函数签名、调用 C 函数。

**加载共享库**：

```typescript
import { dlopen, CString, ptr } from "bun:ffi";

const lib = dlopen("libc.so.6", {
  printf: { args: ["ptr", "ptr"], returns: "int" },
});
```

`dlopen` 函数接受两个参数：共享库的路径和符号表。`"libc.so.6"` 是 Linux 系统上 C 标准库的 soname（共享对象名称），动态链接器会自动在标准库路径中查找。在 macOS 上，对应的库名为 `"libSystem.dylib"`；在 Windows 上，对应的库名为 `"msvcrt.dll"`。

符号表是一个对象，键是函数名（必须与 C 库中的导出符号名完全一致），值是一个包含 `args` 和 `returns` 字段的类型签名对象。Bun 使用这些类型信息生成正确的参数编组和返回值转换代码。

**创建 C 字符串**：

```typescript
const msg = new CString("Hello from Bun FFI!\n");
```

`CString` 构造函数将 JavaScript 字符串编码为 UTF-8 字节序列，并分配一块包含 null 终止符的内存。`msg.ptr` 属性返回指向这块内存的指针值，可以直接作为 `"ptr"` 类型的 FFI 参数使用。

CString 的内存管理：CString 实例被垃圾回收时，Bun FFI 自动释放其分配的内存。开发者不需要手动释放 CString 的内存。

**调用 C 函数**：

```typescript
const result = lib.symbols.printf(msg.ptr, 0);
console.log(`printf returned ${result} (characters written)`);
```

`lib.symbols.printf` 是一个由 Bun FFI 生成的 JavaScript 函数。调用这个函数时，Bun 会：

1. 将 JavaScript 参数转换为 C 类型（`msg.ptr` 作为 `ptr` 类型，`0` 作为 `ptr` 类型）。
2. 按照 cdecl 调用约定将参数放入寄存器或栈中。
3. 生成调用 C 函数 `printf` 的机器指令。
4. 执行 C 函数。
5. 将 C 函数的返回值（int）转换为 JavaScript number。

**多个 libc 函数调用**：

示例还展示了调用 `getpid`、`getuid` 和 `getrandom` 的 FFI 绑定：

```typescript
const lib2 = dlopen("libc.so.6", {
  getpid: { args: [], returns: "int" },
  getuid: { args: [], returns: "int" },
});

const pid = lib2.symbols.getpid();
const uid = lib2.symbols.getuid();
```

这些函数没有参数，直接返回系统信息。`getrandom` 的调用展示了如何分配 TypedArray 缓冲区，通过 `ptr()` 获取指针，然后传递给 C 函数填充数据：

```typescript
const lib3 = dlopen("libc.so.6", {
  getrandom: { args: ["ptr", "i64", "i32"], returns: "i64" },
});

const buf = new Uint8Array(16);
const bytesRead = lib3.symbols.getrandom(ptr(buf), BigInt(16), 0);
console.log(`getrandom: read ${bytesRead} bytes`, Array.from(buf.slice(0, Number(bytesRead))));
```

### 6.3 complex-ffi.ts 详解

`examples/02-advanced/complex-ffi.ts` 展示了更复杂的 FFI 模式：字符串传递、结构体操作、回调函数和缓冲区操作。

**字符串传递与内存管理**：

```typescript
const libc = dlopen("libc.so.6", {
  strlen: { args: ["ptr"], returns: "i64" },
  strdup: { args: ["ptr"], returns: "ptr" },
  free: { args: ["ptr"], returns: "void" },
});

const hello = new CString("Hello Bun FFI!");
const len = libc.symbols.strlen(hello.ptr);
```

这段代码展示了两种字符串传递模式：

1. **向 C 传递字符串**：通过 `CString` 创建 C 兼容字符串，将 `.ptr` 传递给 C 函数。
2. **从 C 接收字符串**：`strdup` 返回一个指向新分配的 C 字符串的指针。这个指针指向的内存是由 C 的 `malloc` 分配的，需要手动释放。

关键的内存管理原则：**谁分配，谁释放**。`strdup` 使用 `malloc` 分配内存，所以必须使用 `free` 释放：

```typescript
const dupPtr = libc.symbols.strdup(hello.ptr);
// ... 使用 dupPtr ...
libc.symbols.free(dupPtr); // 必须释放
```

**结构体操作**：

由于 Bun FFI 不直接支持结构体，需要通过手动计算偏移量的方式操作结构体字段：

```typescript
// C 结构体: struct timespec { time_t tv_sec; long tv_nsec; };
// 64 位 Linux 布局: tv_sec 偏移 0 (8 字节), tv_nsec 偏移 8 (8 字节)
const ts = new Uint8Array(16);
librt.symbols.clock_gettime(CLOCK_MONOTONIC, ptr(ts));

const dv = new DataView(ts.buffer);
const tv_sec = Number(dv.getBigUint64(0, true));
const tv_nsec = Number(dv.getBigUint64(8, true));
```

这种手动布局的方式需要开发者准确了解结构体的内存布局，包括字段偏移量和填充字节。对于复杂的结构体，可以使用 `offsetof` 宏或 `pahole` 工具来验证布局。

**JSCallback 与 C 回调**：

```typescript
const comparator = new JSCallback(
  (aPtr: number, bPtr: number): number => {
    const aBuf = toArrayBuffer(aPtr, 4);
    const bBuf = toArrayBuffer(bPtr, 4);
    const aVal = new DataView(aBuf).getInt32(0, true);
    const bVal = new DataView(bBuf).getInt32(0, true);
    return aVal - bVal;
  },
  { args: ["ptr", "ptr"], returns: "i32" },
);

libc2.symbols.qsort(ptr(arr), BigInt(arr.length), BigInt(4), comparator.ptr);
```

JSCallback 的创建需要注意：

1. 回调函数的参数类型和返回类型必须与 C 函数指针的类型完全匹配。
2. 回调函数接收的是指针值，需要通过 `toArrayBuffer` 读取指针指向的内存。
3. JSCallback 必须显式调用 `.close()` 释放资源。

**TypedArray 作为缓冲区**：

```typescript
const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
libc3.symbols.memset(ptr(buf), 0, BigInt(buf.length));
```

TypedArray 的底层内存是连续的，通过 `ptr()` 获取的指针可以直接传递给期望 C 数组或缓冲区的 C 函数。C 函数修改缓冲区后，修改会直接反映到 TypedArray 中，不需要额外的数据复制。

### 6.4 image-hash.ts 详解

`examples/03-production/image-hash.ts` 展示了一个生产级的 FFI 应用场景：图像感知哈希计算。这个示例虽然是概念性的，但它涵盖了生产级 FFI 应用的多个关键模式。

**优雅降级与回退**：

```typescript
function loadLibrary(path: string, symbols: Record<string, any>) {
  try {
    const lib = dlopen(path, symbols);
    console.log(`  ✓ Loaded: ${path}`);
    return lib;
  } catch (err) {
    console.warn(`  ⚠ Failed to load ${path}: ${err.message}`);
    console.warn("  → Falling back to JS implementation");
    return null;
  }
}
```

这个加载函数体现了生产级 FFI 的重要原则：**当 C 库不可用时，优雅降级到纯 JavaScript 实现**。在部署环境中，共享库可能不存在、版本不匹配或权限不足。通过提供回退方案，应用可以在不完整的环境中继续运行，而不是直接崩溃。

**OpenSSL 调用示例**：

```typescript
const sslLib = loadLibrary("libcrypto.so.3", {
  MD5: { args: ["ptr", "i64", "ptr"], returns: "ptr" },
});
```

这段代码展示了如何通过 FFI 调用 OpenSSL 的 MD5 函数。在生产环境中，这可以扩展到 SHA256、AES、RSA 等更复杂的加密操作。通过 FFI 调用 OpenSSL 相比使用 Bun 内置的 `crypto.subtle` API，提供了更灵活的控制和访问更多算法选项的能力。

**dHash 算法实现**：

感知哈希（Perceptual Hash）是一种图像指纹算法，可以生成代表图像内容的哈希值。相似的图像生成相似的哈希值，通过比较哈希值的汉明距离可以判断图像的相似度。

```typescript
function differenceHash(pixels: Uint8Array, width: number, height: number): string {
  // 1. 转换为灰度图并降采样到 9x8
  // 2. 比较相邻像素生成 64 位哈希
  // 3. 返回十六进制字符串
}
```

在真实场景中，dHash 算法用 C 或 Rust 实现并通过 FFI 调用，可以获得显著的性能提升。C 实现可以利用 SIMD 指令并行处理多个像素，性能通常比纯 JavaScript 实现快 10-50 倍。

**汉明距离计算**：

```typescript
function hammingDistance(hash1: string, hash2: string): number {
  const h1 = BigInt("0x" + hash1);
  const h2 = BigInt("0x" + hash2);
  const xor = h1 ^ h2;
  let dist = 0;
  let n = xor;
  while (n > 0n) {
    dist += Number(n & 1n);
    n >>= 1n;
  }
  return dist;
}
```

汉明距离计算两个哈希值之间不同的位数。在图像搜索和去重场景中，汉明距离小于某个阈值（通常为 10）的图像被认为是相似的或相同的。

**批量处理模式**：

```typescript
const images: ImageInfo[] = [ /* ... */ ];
for (const img of images) {
  const hash = differenceHash(img.pixels, img.width, img.height);
  console.log(`  ${img.name}: dHash = ${hash}`);
}
```

批量处理是生产环境中的常见模式。在处理大量图片时，可以通过以下方式优化：

1. **批量 FFI 调用**：将多个图片的像素数据打包到连续的内存块中，一次 FFI 调用处理多个图片，减少 FFI 调用的开销。
2. **并行处理**：使用 Bun 的 `Bun.Concurrency` 或 Worker 线程并行处理多个图片。
3. **结果缓存**：缓存已计算过的哈希值，避免重复计算。

### 6.5 从示例到生产

这些示例展示了从基础到高级的 FFI 使用模式。在实际生产项目中，还需要考虑以下方面：

**错误处理策略**：

生产级 FFI 代码应该包含多层错误处理：

1. 库加载时的错误处理（dlopen 失败）。
2. 函数调用时的错误处理（返回值和错误码检查）。
3. 资源释放时的错误处理（确保资源始终被释放）。
4. 全局错误处理（SIGSEGV 信号处理器）。

**性能优化**：

1. **减少 FFI 调用次数**：每次 FFI 调用都有固定的开销（约 50-100ns）。对于高频操作，考虑批量处理。
2. **重用 CString 和 JSCallback**：避免在循环中创建和销毁 CString 或 JSCallback。
3. **使用适当的类型**：使用最精确的类型声明（如 i32 而不是 int），减少类型转换开销。
4. **内存池**：对于频繁分配和释放的缓冲区，使用内存池减少 malloc/free 调用。

**测试策略**：

1. **单元测试**：每个 FFI 函数单独测试，验证参数传递和返回值。
2. **集成测试**：测试 FFI 函数在真实业务流程中的表现。
3. **压力测试**：测试 FFI 函数在高并发和高频率调用下的稳定性。
4. **内存泄漏测试**：使用 Valgrind 或 ASan 验证内存管理的正确性。
5. **跨平台测试**：在所有目标平台上测试 FFI 代码。

**部署注意事项**：

1. **共享库分发**：将共享库与应用代码一起打包，确保部署时库文件存在。
2. **版本兼容性**：指定共享库的版本号，避免不兼容的更新导致运行时错误。
3. **容器化部署**：使用 Docker 容器确保运行环境的一致性。
4. **监控和告警**：监控 FFI 调用的成功率、延迟和错误率，及时发现和定位问题。

---

## 总结

Bun FFI 是连接 TypeScript 生态与系统级编程生态的桥梁。通过 FFI，开发者可以在保持 TypeScript 开发效率的同时，利用 C/C++/Rust/Zig 等语言在性能、生态系统和底层控制方面的优势。

本章从六个维度全面介绍了 Bun FFI：使用场景帮助读者理解 FFI 的应用价值，实现原理揭示了 FFI 的底层工作机制，风险与优化部分帮助读者规避常见的陷阱，典型问题处理提供了实用的故障排查指南，必备知识夯实了 C 语言和系统编程的基础，示例代码通过从简单到复杂的三个实例，展示了 FFI 的实际使用模式。

在实际应用中，FFI 的正确使用需要深入理解类型映射、内存管理和调用约定等核心概念。建议开发者在项目中使用 FFI 时，遵循以下原则：

1. **隔离 FFI 代码**：将 FFI 调用封装在独立的模块中，通过清晰的接口与业务代码交互。
2. **完整错误处理**：对每个 FFI 调用进行错误检查和资源释放验证。
3. **全面测试**：在不同平台和条件下测试 FFI 代码的稳定性和正确性。
4. **持续监控**：监控 FFI 调用的性能和资源使用情况，及时发现潜在问题。

通过合理使用 Bun FFI，TypeScript 开发者可以突破 JavaScript 运行时的性能限制，构建高性能、低延迟的系统级应用，同时保持敏捷的开发节奏和丰富的生态支持。
