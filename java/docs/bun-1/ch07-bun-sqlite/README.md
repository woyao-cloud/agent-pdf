# 第7章 bun:sqlite 内置数据库

## 目录

1. [使用场景](#1-使用场景)
2. [实现原理](#2-实现原理)
3. [潜在风险与优化](#3-潜在风险与优化)
4. [典型问题处理](#4-典型问题处理)
5. [必备知识与技能](#5-必备知识与技能)
6. [示例代码与配置](#6-示例代码与配置)

---

## 1. 使用场景

### 1.1 本地优先应用

在现代应用开发中，数据存储方案的选择直接影响应用的架构设计、部署方式和运维成本。bun:sqlite 作为 Bun 运行时内置的数据库引擎，为开发者提供了一种轻量级、零配置的本地数据存储方案，特别适合本地优先（Local-first）的应用场景。

本地优先应用的核心思想是将数据存储在用户本地设备上，网络连接不再是数据访问的必要条件。这类应用包括桌面端笔记软件、本地知识库管理工具、个人财务管理应用、离线优先的移动应用等。在这些场景中，bun:sqlite 展现出显著的优势：无需额外安装数据库服务，无需配置数据库连接参数，无需担心网络延迟对查询性能的影响。

与传统的客户端-服务器数据库架构相比，bun:sqlite 消除了网络 I/O 这一关键瓶颈。每一次数据库操作都直接发生在本地进程内，数据的读取和写入速度可以达到微秒级别。对于个人或小团队使用的内部工具、开发辅助脚本、数据分析和 ETL 流水线等场景，bun:sqlite 提供了一个比 PostgreSQL 更简单、更快速的替代方案。

考虑一个典型的本地知识库应用：用户需要存储 Markdown 文档的元数据、标签、全文索引和版本历史。使用 bun:sqlite，开发者可以在几十行代码内完成数据模型的定义、CRUD 操作的封装和全文搜索的实现。所有的数据都存储在一个独立的 .db 文件中，用户可以方便地备份、迁移或分享这个文件。

bun:sqlite 还特别适合用于 Electron 或 Tauri 等桌面应用框架的数据层。在这些框架中，应用需要在用户本地存储配置信息、用户数据和应用状态。使用 bun:sqlite 替代 JSON 文件或 LevelDB，可以获得关系型数据库的查询能力、事务支持和数据完整性保障。

本地优先应用的数据同步是另一个重要话题。bun:sqlite 可以作为本地数据的存储引擎，配合自定义的同步逻辑或第三方同步框架，实现多设备之间的数据一致性。SQLite 的 WAL 模式支持并发读取，这使得在后台同步数据的同时，前端界面仍然可以流畅地查询数据。

在开发效率方面，bun:sqlite 的零配置特性大大降低了开发者的入门门槛。不需要像 PostgreSQL 那样安装数据库服务、创建数据库实例、配置用户权限和网络访问控制。开发者只需要在 Bun 项目中导入 `bun:sqlite` 模块，创建一个 Database 实例，就可以开始执行 SQL 语句。这种简洁的开发体验使得 bun:sqlite 成为原型开发和快速迭代的理想选择。

### 1.2 边缘计算与服务端无服务器环境

边缘计算和 Serverless 架构的兴起，对运行环境的资源占用和启动速度提出了极高的要求。在这种环境中，每个函数实例的内存和 CPU 资源有限，而且实例可能会被频繁创建和销毁。bun:sqlite 在这种场景下展现出独特的优势。

在 AWS Lambda、Cloudflare Workers、Vercel Edge Functions 等 Serverless 平台上，函数实例的冷启动时间直接影响用户体验和成本。Bun 本身以快速的启动速度著称，而 bun:sqlite 作为内置模块，不会增加额外的依赖加载时间。当函数实例启动时，SQLite 数据库引擎已经在 Bun 运行时中初始化完毕，开发者可以直接使用，无需等待数据库连接池的建立或 ORM 框架的初始化。

边缘计算场景中的数据处理通常具有以下特点：单次处理的数据量不大（通常在 MB 级别）、查询模式相对简单、对响应时间要求极高。这些特点恰好与 bun:sqlite 的能力相匹配。例如，一个在全球多个边缘节点部署的内容分发服务，可以在每个节点上使用 bun:sqlite 缓存热点数据，减少对中心数据库的查询压力。

在 Serverless 环境中使用 bun:sqlite 时，需要注意数据库文件的存储位置和生命周期。由于函数实例是无状态的，数据库文件通常需要存储在可持久化的文件系统或对象存储中。一种常见的模式是将数据库文件存储在 tmpfs 中，在函数实例启动时从远程存储加载，在实例销毁前写回远程存储。虽然这种模式不适合写入频繁的场景，但对于读取密集型的缓存和配置数据存储，是一个简单而高效的方案。

bun:sqlite 在 Serverless 环境中的另一个重要应用是作为数据聚合和转换的中间层。当函数需要处理从多个 API 获取的数据时，可以先将数据写入内存中的 SQLite 数据库，然后利用 SQL 的 JOIN、GROUP BY 和窗口函数等高级查询能力进行数据分析和转换，最后输出结果。这种方式比在代码中手动实现数据聚合逻辑更加简洁、高效且易于维护。

### 1.3 嵌入式数据库应用

嵌入式数据库是指在应用程序内部运行的数据库引擎，不需要独立的数据库服务进程。SQLite 是世界上最流行的嵌入式数据库，而 bun:sqlite 将这种能力原生地集成到了 Bun 运行时中。

在移动应用和桌面应用中，嵌入式数据库是数据持久化的核心方案。bun:sqlite 可以用于存储应用配置、用户偏好设置、应用缓存数据和离线数据。与使用 SharedPreferences 或 UserDefaults 等键值存储方案相比，bun:sqlite 提供了更丰富的数据模型和查询能力，特别适合存储结构化数据。

对于物联网（IoT）和边缘设备应用，资源限制是数据存储方案选择的关键因素。SQLite 的代码体积小（约 600KB）、内存占用低（几百 KB 即可运行），非常适合在资源受限的设备上使用。bun:sqlite 继承了 SQLite 的这些优势，同时利用 Bun 的高性能特性，在数据读写速度上有了进一步的提升。

嵌入式数据库在数据科学和机器学习领域也有广泛的应用。数据科学家经常需要处理中等规模的数据集（百万行级别），bun:sqlite 可以作为一个轻量级的数据分析工具。相比 Pandas 等内存数据处理库，bun:sqlite 可以处理超出可用内存的数据集，因为 SQLite 在必要时会将数据缓存到磁盘上。同时，SQL 语言的声明式查询特性使得数据分析逻辑更加清晰和可复用。

在游戏开发中，bun:sqlite 可以用于存储游戏状态、玩家数据、关卡配置和游戏内物品数据。SQLite 的事务支持确保了游戏数据的一致性和完整性，即使在游戏崩溃的情况下也能保证数据不损坏。

### 1.4 开发与测试数据存储

在软件开发过程中，数据存储方案的选择不仅影响生产环境的运行效果，也直接影响开发效率和测试质量。bun:sqlite 在开发和测试环境中提供了极大的便利。

在开发环境中，bun:sqlite 的内存数据库模式（`:memory:`）特别适合用于集成测试和单元测试。每个测试用例可以创建一个独立的内存数据库，测试完成后自动销毁，不会留下任何残留数据。这种方式消除了测试之间的数据依赖，提高了测试的隔离性和可重复性。

使用 bun:sqlite 进行测试的另一个优势是测试速度。内存数据库的读写操作不需要磁盘 I/O，测试执行速度可以提升数倍。对于需要频繁运行测试的持续集成环境，这种性能提升可以显著缩短构建时间。

在开发阶段，开发者经常需要模拟真实数据来验证应用的功能和性能。bun:sqlite 可以方便地生成和管理测试数据。开发者可以编写数据生成脚本，使用 SQL 语句批量插入测试数据，然后使用 `backup()` API 将内存数据库的内容保存到文件中，供后续测试使用。

bun:sqlite 在开发环境中的另一个重要应用是作为数据库迁移工具的执行环境。在开发过程中，数据库模式（Schema）会不断变化，需要使用迁移工具来管理这些变化。bun:sqlite 可以快速执行迁移脚本，验证迁移的正确性，并在迁移失败时回滚到之前的状态。由于 SQLite 支持嵌套事务（savepoints），开发者可以实现复杂的迁移逻辑，包括数据转换、表结构变更和索引重建。

对于使用 PostgreSQL 或 MySQL 等数据库的生产环境，在开发环境中使用 bun:sqlite 进行模拟是一种常见的实践。虽然 SQLite 和 PostgreSQL 在 SQL 语法和功能上存在差异，但对于大多数常见的 CRUD 操作和基本查询，代码可以无缝迁移。开发者只需要在开发环境中使用 bun:sqlite 连接，在生产环境中切换到 PostgreSQL 连接，应用层的代码基本不需要修改。

### 1.5 缓存层

缓存是提升应用性能的关键技术。bun:sqlite 可以作为应用架构中的缓存层，替代 Redis 或 Memcached 等外部缓存服务。

在单机应用中，使用 bun:sqlite 作为缓存层可以避免网络 I/O 开销，缓存数据的读取速度接近直接访问内存。与内存缓存（如 Map 或 Object）相比，bun:sqlite 提供了更强大的缓存管理能力，包括缓存过期策略、缓存淘汰策略和缓存持久化。

bun:sqlite 的缓存层特别适合以下场景：缓存数据量较大（超过可用内存）、缓存数据结构复杂（需要按多个维度查询）、缓存需要持久化（应用重启后缓存不丢失）。例如，一个电子商务应用可以使用 bun:sqlite 缓存商品信息、用户购物车和价格数据。当应用重启时，缓存数据可以从磁盘加载，避免了对数据库的批量查询。

在缓存实现中，bun:sqlite 的 WAL 模式允许并发读取，这意味着多个请求可以同时读取缓存数据而不会相互阻塞。对于读多写少的缓存场景，这种并发读取能力可以显著提升应用的吞吐量。

bun:sqlite 还可以实现复杂的缓存策略，如 LFU（最不经常使用）和 LRU（最近最少使用）缓存淘汰算法。通过记录缓存项的访问次数或访问时间，开发者可以使用 SQL 查询来识别和清理过期的缓存数据。这种方式比在应用代码中实现缓存淘汰逻辑更加高效和可靠。

## 2. 实现原理

### 2.1 SQLite 嵌入式数据库架构

要深入理解 bun:sqlite 的工作原理，首先需要了解 SQLite 作为嵌入式数据库的架构设计。SQLite 是一个 C 语言库，实现了自包含、无服务器、零配置、事务性的 SQL 数据库引擎。与传统的客户端-服务器数据库架构不同，SQLite 直接嵌入到宿主应用程序中，作为应用程序的一部分运行。

SQLite 的架构可以分为以下几个核心层次：

**核心接口层（Core Interface）**：这是 SQLite 暴露给外部应用的主要 API 接口。bun:sqlite 通过 C FFI（Foreign Function Interface）或直接链接的方式调用 SQLite 的核心 API。这些 API 包括数据库连接管理（sqlite3_open、sqlite3_close）、SQL 语句编译（sqlite3_prepare）、语句执行（sqlite3_step）和结果集获取（sqlite3_column_*）等。

**SQL 编译层（SQL Compiler）**：当应用程序执行一条 SQL 语句时，SQLite 的编译层会将 SQL 文本解析为语法树（Token Tree），然后生成虚拟机字节码（Virtual Machine Code）。这个过程类似于编程语言的编译过程，包括词法分析、语法分析、语义分析和代码生成。生成的字节码由 SQLite 的虚拟机（Virtual Database Engine，简称 VDBE）执行。

**虚拟数据库引擎层（VDBE）**：VDBE 是 SQLite 的核心执行引擎，它执行编译生成的字节码指令。每条字节码指令执行一个特定的数据库操作，如打开游标、读取记录、比较值、更新索引等。VDBE 的设计使得 SQLite 可以以统一的方式处理不同类型的 SQL 语句，包括 SELECT、INSERT、UPDATE、DELETE 和 CREATE TABLE 等。

**B-Tree 存储引擎（B-Tree Storage Engine）**：SQLite 使用 B-Tree 作为其核心数据结构来组织和存储数据。每个数据库表都有一个对应的 B-Tree，索引也使用 B-Tree 实现。B-Tree 的设计确保了在插入、删除和查询操作中都能保持 O(log n) 的时间复杂度。SQLite 的 B-Tree 实现经过了数十年的优化，在磁盘 I/O 和缓存利用方面达到了极高的效率。

**页面缓存层（Pager Layer）**：页面缓存层负责管理数据库文件在内存中的缓存页面。当 VDBE 需要读取或写入数据时，它通过页面缓存层访问数据库文件。页面缓存层实现了 ACID 事务的支持，包括原子提交和回滚。它使用 Write-Ahead Logging（WAL）或回滚日志（Rollback Journal）来实现事务的原子性和持久性。

**操作系统接口层（OS Interface）**：这是 SQLite 与操作系统交互的抽象层，负责文件 I/O、内存分配、互斥锁等底层操作。SQLite 提供了一个默认的 Unix 和 Windows 接口实现，也允许应用程序自定义这些接口。

bun:sqlite 对 SQLite 的集成采用了直接编译的方式。Bun 的构建系统在编译时会将 SQLite 的 C 源代码编译进 Bun 运行时中，而不是作为动态链接库加载。这种方式的好处是：避免了运行时动态链接的开销，可以针对 Bun 的运行环境进行特定的编译优化，并且确保 SQLite 的版本与 Bun 的版本一致。

在 Bun 的源码中，bun:sqlite 的实现主要位于 `src/bun.js/bindings/sqlite/SQLiteDatabase.cpp` 和相关的头文件中。这些 C++ 代码封装了 SQLite 的 C API，通过 WebKit 的 JavaScriptCore 引擎暴露给 JavaScript 环境。bun:sqlite 的数据类型映射如下：

| SQLite 类型 | JavaScript 类型 | 说明 |
|------------|----------------|------|
| NULL | null | SQL 空值 |
| INTEGER | number (int32) 或 bigint | 64 位整数会转换为 bigint |
| REAL | number (double) | 浮点数 |
| TEXT | string | UTF-8 编码字符串 |
| BLOB | Uint8Array | 二进制数据 |

### 2.2 Bun 的零拷贝 SQLite 实现

零拷贝（Zero-copy）是 bun:sqlite 区别于其他 Node.js SQLite 库（如 better-sqlite3 和 sql.js）的关键特性之一。在传统的数据库访问模式中，数据在 SQLite 引擎和 JavaScript 运行时之间需要多次拷贝：SQLite 引擎从数据库文件中读取数据到内部缓冲区，然后将数据从缓冲区拷贝到 JavaScript 运行时的内存空间，最后转换为 JavaScript 对象。

bun:sqlite 的零拷贝实现通过以下几种方式减少不必要的数据拷贝：

**直接内存访问**：Bun 的 C++ 绑定层直接操作 SQLite 引擎的内存缓冲区，避免了数据在 C 层和 JavaScript 层之间的额外拷贝。当查询结果包含大量数据时，这种优化可以显著减少内存带宽的消耗和 CPU 时间。

**字符串零拷贝**：在 JavaScript 中，字符串是不可变的。传统的实现需要将 SQLite 返回的 C 字符串转换为 JavaScript 字符串，这个过程涉及字符串的复制和编码转换。bun:sqlite 利用 JavaScriptCore 引擎的能力，在某些条件下可以创建指向 SQLite 内部缓冲区的 JavaScript 字符串视图，避免了字符串的复制。对于大文本字段（如 JSON 数据、Markdown 内容），这种优化可以节省大量的内存分配和复制开销。

**二进制数据零拷贝**：对于 BLOB 类型的数据，bun:sqlite 直接返回指向 SQLite 内部缓冲区的 Uint8Array 视图，而不是创建新的 Uint8Array 实例并复制数据。这种方式不仅减少了内存分配，还降低了垃圾回收的压力。对于处理大量二进制数据（如图片、文件内容）的应用，这种优化效果尤为明显。

**查询结果优化**：bun:sqlite 在将查询结果转换为 JavaScript 对象时，采用了惰性求值（Lazy Evaluation）的策略。不是一次性将所有结果行转换为 JavaScript 对象，而是按需转换。当开发者使用迭代器或流式 API 处理结果时，只有当前正在处理的行才会被转换为 JavaScript 对象。这种方式减少了内存占用，特别是在处理大量结果集时。

**Statement 缓存**：bun:sqlite 自动缓存已编译的 SQL 语句（Prepared Statement）。当相同的 SQL 语句被重复执行时，bun:sqlite 会重用之前编译好的语句对象，避免了重复的 SQL 解析和编译开销。这种优化对于循环执行相同查询的场景特别有效。

bun:sqlite 的零拷贝实现在性能测试中表现出色。在处理大量数据的场景下，bun:sqlite 的查询速度可以达到 better-sqlite3 的 2-3 倍，达到 sql.js 的 3-5 倍。下面是一个简单的性能对比数据：

| 操作 | bun:sqlite | better-sqlite3 | sql.js |
|------|-----------|----------------|--------|
| 10000 次插入（事务内） | 8ms | 12ms | 25ms |
| 100000 行全表扫描 | 15ms | 28ms | 60ms |
| 复杂 JOIN 查询 | 3ms | 5ms | 12ms |
| BLOB 读写（1MB） | 0.5ms | 1.2ms | 3ms |
| 启动加载时间 | 2ms | 15ms | 10ms |

> 注：以上数据基于 Bun 1.2 版本的基准测试，实际性能可能因硬件配置和数据集特征而异。

### 2.3 预编译语句缓存与重用

预编译语句（Prepared Statement）是数据库性能优化的核心机制之一。bun:sqlite 在预编译语句的管理和缓存方面实现了深度优化。

当开发者调用 `db.prepare()` 方法时，bun:sqlite 会将 SQL 语句文本发送给 SQLite 引擎进行编译。编译过程包括词法分析、语法分析、语义检查和字节码生成。生成的字节码存储在 PreparedStatement 对象中，可以被多次执行，每次执行只需要绑定参数值并执行字节码。

bun:sqlite 的预编译语句缓存机制的工作原理如下：

**自动缓存**：bun:sqlite 内部维护了一个 LRU（Least Recently Used）缓存，用于存储最近使用的预编译语句。缓存的键是 SQL 语句的文本（经过规范化处理），值是对应的 PreparedStatement 对象。当开发者多次执行相同的 SQL 语句时，bun:sqlite 会从缓存中取出之前编译好的语句，而不是重新编译。

**缓存容量**：默认情况下，bun:sqlite 的预编译语句缓存容量是自动调节的，根据实际使用情况动态调整。在内存压力较大时，缓存会自动淘汰最不常用的语句。开发者也可以通过配置参数来手动控制缓存容量。

**参数绑定优化**：bun:sqlite 对参数绑定过程进行了优化。当执行预编译语句时，参数绑定（Parameter Binding）是最耗时的操作之一。bun:sqlite 使用类型推断和批量绑定技术来加速参数绑定过程。对于批量插入操作，bun:sqlite 可以重用同一个 PreparedStatement 对象，在循环中快速绑定不同的参数值。

**自动释放**：当 PreparedStatement 对象不再被引用时，bun:sqlite 会自动释放其占用的内存资源。开发者不需要手动调用 `finalize()` 方法（虽然在某些情况下手动释放可以更及时地回收资源）。

**监控与调优**：bun:sqlite 提供了 API 来监控预编译语句的使用情况，包括缓存命中率、缓存大小和语句执行次数。开发者可以利用这些信息来优化 SQL 查询模式，提高缓存利用率。

预编译语句的缓存和重用对于以下场景特别重要：

- **高频查询**：在 Web API 或实时数据处理中，相同的查询可能被每秒执行数百次。预编译语句缓存可以消除重复的 SQL 编译开销。
- **批量数据操作**：在数据导入、ETL 或数据同步中，预编译语句可以显著提高数据处理的吞吐量。
- **参数化查询**：对于需要动态生成参数的应用，预编译语句不仅可以提高性能，还可以防止 SQL 注入攻击。

### 2.4 WAL 模式与并发控制

WAL（Write-Ahead Logging）模式是 SQLite 提供的一种事务日志机制，它与传统的回滚日志（Rollback Journal）模式在并发控制和性能特性上有着显著的区别。

在回滚日志模式下，当数据库执行写操作时，SQLite 会先将原始数据的副本写入回滚日志文件。如果事务回滚，SQLite 会使用回滚日志中的副本来恢复数据库的原始状态。如果事务提交，回滚日志会被删除。在这种模式下，读操作和写操作不能同时进行：当有写操作正在执行时，读操作会被阻塞，反之亦然。

在 WAL 模式下，SQLite 将事务日志写入一个独立的 WAL 文件（`数据库名-wal`）。写操作只修改 WAL 文件，不直接修改数据库文件。读操作则同时从数据库文件和 WAL 文件中读取数据，将 WAL 中的最新修改合并到查询结果中。这种设计带来的核心优势是：

**并发读取**：在 WAL 模式下，多个读取者可以同时访问数据库，而不会与写入者发生冲突。写入者在写入 WAL 文件时，读取者仍然可以读取数据库文件和 WAL 文件中的已提交数据。这种读写并发的能力对于读多写少的应用场景特别有利。

**写入性能**：WAL 模式下的写入操作通常比回滚日志模式更快。因为写入操作只需要追加到 WAL 文件的末尾（顺序 I/O），而不是随机修改数据库文件（随机 I/O）。顺序 I/O 比随机 I/O 快一个数量级，特别是在机械硬盘上。

**读性能**：在 WAL 模式下，读取操作通常也更快。因为读取者不需要等待写入者完成，也不需要在读取时维护共享锁。不过，当 WAL 文件变得很大时，读取者需要合并数据库文件和 WAL 文件的数据，这会导致读取性能下降。在这种情况下，执行 Checkpoint 操作可以将 WAL 文件的内容合并到数据库文件中，恢复读取性能。

bun:sqlite 对 WAL 模式提供了原生支持。开发者可以通过简单的配置启用 WAL 模式：

```typescript
const db = new Database("mydb.sqlite");
db.run("PRAGMA journal_mode = WAL");
```

除了 WAL 模式外，bun:sqlite 还支持其他并发控制机制：

**数据库级锁**：SQLite 使用数据库级锁来控制并发访问。锁的状态包括 UNLOCKED、SHARED、RESERVED、PENDING 和 EXCLUSIVE。读取操作需要获取 SHARED 锁，写入操作需要获取 RESERVED 或 EXCLUSIVE 锁。bun:sqlite 通过 SQLite 的锁机制确保数据的一致性和隔离性。

**忙等待超时**：当数据库被其他连接锁定时，SQLite 默认会返回 SQLITE_BUSY 错误。开发者可以通过设置忙等待超时来控制 SQLite 的行为：

```typescript
db.run("PRAGMA busy_timeout = 5000"); // 等待最多 5 秒
```

这样，当数据库被锁定时，SQLite 会等待指定的时间，如果在该时间内锁被释放，则继续执行操作，否则返回超时错误。

**WAL 模式下的并发限制**：虽然 WAL 模式支持并发读写，但它并不是完全无锁的。在 WAL 模式下，同一时刻只能有一个写入者。当有多个写入者同时访问数据库时，只有一个可以成功获取写锁，其他的写入者需要等待或返回繁忙错误。

### 2.5 内存映射 I/O 与性能优化

内存映射 I/O（Memory-Mapped I/O，简称 mmap）是 bun:sqlite 提升数据库文件访问性能的关键技术。mmap 是一种将文件内容映射到进程地址空间的技术，使得应用程序可以像访问内存一样访问文件内容。

传统的文件 I/O 操作需要通过系统调用（如 read() 和 write()）来读写文件。每次系统调用都需要在用户空间和内核空间之间切换，并且数据需要在内核缓冲区和用户缓冲区之间拷贝。对于频繁的数据库操作，这种开销会显著影响性能。

使用 mmap 后，数据库文件被映射到进程的虚拟地址空间中，应用程序可以直接通过指针访问文件内容。当读取数据时，如果数据已经在内存中，则直接访问；如果数据不在内存中，则触发页面错误，操作系统自动从磁盘加载数据到内存。当写入数据时，数据直接写入映射的内存区域，操作系统在后台将修改写回磁盘。

bun:sqlite 利用 mmap 技术带来了以下性能优势：

**减少系统调用**：mmap 消除了每次数据库操作都需要进行系统调用的开销。对于大量的小型读写操作，这种优化可以显著降低 CPU 使用率。

**减少数据拷贝**：在传统的文件 I/O 中，数据需要在内核空间和用户空间之间多次拷贝。mmap 直接映射文件到用户空间，数据只需要从磁盘加载到内存一次，不需要额外的拷贝。

**页面缓存共享**：mmap 的页面缓存由操作系统管理，多个进程可以共享同一个文件的 mmap 页面缓存。当多个 Bun 实例访问同一个数据库文件时，操作系统可以复用已经缓存的页面，减少磁盘 I/O。

**惰性加载**：mmap 支持惰性加载（Lazy Loading），即只有被访问的文件页面才会被加载到内存中。对于大型数据库文件，这种方式可以显著减少启动时的内存占用。

bun:sqlite 在 mmap 的实现中做了进一步的优化：

**智能预读**：bun:sqlite 会分析查询模式，对可能被访问的数据页面进行预读。当检测到顺序扫描模式时，bun:sqlite 会提前将后续页面加载到内存中，减少页面错误的发生。

**页面对齐优化**：bun:sqlite 确保数据库文件的页面大小与操作系统的页面大小对齐（通常是 4KB），避免在 mmap 映射时出现部分页面的情况。

**写时复制优化**：对于写入操作，bun:sqlite 使用写时复制（Copy-on-Write）策略，确保写入操作不会阻塞正在进行的读取操作。

然而，mmap 技术也有其局限性。对于非常大的数据库文件（超过可用内存），mmap 可能导致频繁的页面换入换出，反而降低性能。在这种情况下，传统的文件 I/O 方式可能更合适。bun:sqlite 提供了配置选项来控制 mmap 的使用：

```typescript
const db = new Database("mydb.sqlite", { readwrite: true, create: true });
```

开发者可以根据数据库文件的大小和访问模式，选择是否启用 mmap 优化。

## 3. 潜在风险与优化

### 3.1 并发写入性能瓶颈

尽管 bun:sqlite 在单机场景下表现出色，但在高并发写入场景中仍存在显著的性能瓶颈。理解这些瓶颈对于正确评估 bun:sqlite 的适用性至关重要。

SQLite 的核心限制在于其并发写入模型：在任意时刻，最多只能有一个写入者可以修改数据库。这个限制源于 SQLite 的设计哲学——为了保持简单、可靠和轻量级，SQLite 选择了数据库级别的锁定粒度。当多个进程或多个线程同时尝试写入同一个 SQLite 数据库文件时，只有一个可以成功获取写锁，其他的写入者需要等待或失败。

在高并发写入场景下，这个限制会导致以下问题：

**写入吞吐量上限**：即使是在最佳条件下，SQLite 的写入吞吐量也有一个上限。在 WAL 模式下，单次写入操作通常需要几毫秒到几十毫秒。因此，理论上每秒最多只能执行几百到几千次写入操作。对于需要每秒数万次写入的应用（如高并发 Web 应用、实时数据采集系统），bun:sqlite 无法满足需求。

**写入延迟抖动**：当多个写入者同时竞争写锁时，写入操作的延迟会变得不稳定。有些写入操作可能等待几毫秒就获得了写锁，而有些可能等待几秒钟。这种延迟抖动对于需要稳定延迟的应用（如实时交互系统）是不利的。

**死锁风险**：在复杂的事务中，如果多个事务以不同的顺序访问资源，可能会导致死锁。SQLite 通过超时机制来处理死锁，但超时意味着事务失败，需要重试。

为了解决这些并发写入问题，可以考虑以下优化策略：

**写入批处理**：将多个写入操作合并到一个事务中执行。在同一个事务中，多个写入操作只需要获取一次写锁。这种方式可以显著减少锁竞争，提高写入吞吐量。例如，如果每秒需要写入 1000 条数据，可以将它们合并到 10 个事务中，每个事务写入 100 条数据。

**写入队列**：在应用层面实现写入队列，将写入请求排队，由单个线程或协程顺序执行。这种方式避免了多个写入者同时竞争写锁，并且可以更好地控制写入的时序和优先级。

**分库分表**：将数据分散到多个数据库文件中，每个数据库文件独立处理写入操作。例如，可以按用户 ID 或时间范围进行分片。这种方式虽然增加了应用的复杂度，但可以显著提高并发写入能力。

**读写分离**：使用主从复制架构，将写入操作发送到主数据库，读取操作从从数据库读取。bun:sqlite 本身不提供复制功能，但开发者可以通过应用层面的同步机制实现。

### 3.2 数据库文件损坏与恢复

数据库文件的完整性是数据存储系统的生命线。bun:sqlite 虽然在数据完整性方面做了很多工作，但在某些极端情况下，数据库文件仍然可能损坏。

数据库文件损坏的原因包括：

**硬件故障**：磁盘坏道、内存错误、电源故障等硬件问题可能导致数据库文件损坏。特别是在写入操作过程中发生电源故障，数据库文件可能处于不一致的状态。

**软件错误**：应用程序的 Bug（如错误的内存操作、缓冲区溢出）可能损坏数据库文件。虽然 SQLite 和 bun:sqlite 本身经过了严格的测试，但应用程序层面的错误仍然可能导致数据损坏。

**文件系统问题**：文件系统的 Bug 或异常（如磁盘空间满、inode 耗尽）可能导致数据库文件损坏。

**并发访问错误**：多个进程或线程以错误的方式访问同一个数据库文件（如一个进程以 WAL 模式访问，另一个以回滚日志模式访问）可能导致文件损坏。

SQLite 提供了一些机制来防止和恢复数据损坏：

**原子提交**：SQLite 的事务提交是原子的，这意味着要么所有修改都写入数据库，要么都不写入。这个特性通过回滚日志或 WAL 日志实现。即使系统在事务提交过程中崩溃，SQLite 也可以在下次打开数据库时自动恢复。

**完整性检查**：SQLite 提供了 `PRAGMA integrity_check` 命令来检查数据库的完整性。这个命令会检查所有表和索引的内部结构，验证 B-Tree 的平衡性、页面链接的正确性等。

**PRAGMA quick_check**：与 integrity_check 类似，但只进行基本检查，速度更快。适合在应用启动时快速验证数据库的完整性。

**备份与恢复**：SQLite 提供了 `VACUUM INTO` 命令，可以将数据库的完整内容复制到一个新的文件中，同时消除碎片空间。这可以作为备份和恢复的一种方式。

在 bun:sqlite 中，开发者可以使用以下策略来保护数据库文件：

**定期备份**：定期将数据库文件备份到安全的存储位置。可以使用 bun:sqlite 的 `backup()` API 或系统级别的文件复制。

**写入时校验**：在写入数据之前，计算数据的校验和（如 MD5 或 SHA256），写入后再次验证。虽然这会增加写入开销，但可以在数据损坏早期发现问题。

**回滚日志保护**：确保回滚日志或 WAL 文件不会被外部程序错误删除或修改。在 WAL 模式下，`-wal` 和 `-shm` 文件与主数据库文件同等重要。

**错误处理**：在应用代码中正确处理 SQLite 返回的错误码。当检测到数据损坏时，立即停止写入并启动恢复流程。

如果数据库文件已经损坏，可以尝试以下恢复步骤：

1. **备份损坏文件**：在尝试任何恢复操作之前，先备份损坏的数据库文件。
2. **尝试 PRAGMA integrity_check**：运行完整性检查，了解损坏的程度和范围。
3. **使用 .dump 导出**：如果数据库可以部分访问，使用 `.dump` 命令导出可以读取的数据。
4. **使用 sqlite3 工具修复**：SQLite 官方提供了 `sqlite3` 命令行工具，可以尝试修复损坏的数据库。
5. **使用第三方修复工具**：对于严重的损坏，可以考虑使用商业或开源的 SQLite 修复工具。

### 3.3 内存使用与查询缓存

bun:sqlite 的内存使用是应用性能的一个重要因素。虽然 bun:sqlite 在内存管理方面做了大量优化，但在处理大数据集或复杂查询时，仍然可能出现内存使用过高的问题。

bun:sqlite 的内存消耗主要来自以下几个方面：

**页面缓存**：SQLite 使用页面缓存来减少磁盘 I/O。页面缓存的大小由 `PRAGMA cache_size` 控制，默认为 2MB（约 2000 页，每页 1KB）。对于频繁访问的数据库，适当增加页面缓存可以显著提高查询性能，但也会增加内存占用。

**预编译语句缓存**：bun:sqlite 自动缓存预编译的 SQL 语句。每个缓存的语句需要占用一定的内存来存储编译后的字节码。对于有大量不同 SQL 语句的应用，语句缓存可能消耗可观的内存。

**查询结果集**：当执行大型查询时，查询结果需要存储在内存中。使用 `stmt.all()` 方法会将所有结果行加载到内存中，对于百万行级别的大结果集，可能导致内存不足。

**WAL 内存**：在 WAL 模式下，SQLite 需要在内存中维护 WAL 索引，用于快速查找 WAL 文件中的数据。当 WAL 文件很大时，WAL 索引也会占用大量内存。

**连接对象**：每个 Database 对象都需要维护连接状态、缓存和内部数据结构。虽然在大多数应用中这不是主要问题，但在创建大量数据库连接时，连接对象的内存消耗不可忽视。

为了优化内存使用，可以采取以下策略：

**调整页面缓存大小**：根据数据库的大小和访问模式，调整页面缓存大小。对于只读应用，可以减小页面缓存；对于读写频繁的应用，适当增加页面缓存。

```typescript
db.run("PRAGMA cache_size = -8000"); // 设置为 8MB（负值表示以 KB 为单位）
```

**使用流式查询**：对于大型结果集，使用迭代器或流式 API 替代 `stmt.all()`，按需处理数据，减少内存占用。

```typescript
const stmt = db.prepare("SELECT * FROM large_table");
for (const row of stmt.asIterator()) {
  // 逐行处理，不将所有结果加载到内存
}
```

**定期清理缓存**：在完成批量操作后，清理预编译语句缓存和页面缓存，释放内存。

```typescript
// 关闭语句释放内存
stmt.finalize();
// 清理页面缓存
db.run("PRAGMA shrink_memory");
```

**限制 WAL 文件大小**：定期执行 Checkpoint 操作，将 WAL 文件的内容合并到数据库文件中，减少 WAL 文件的内存占用。

```typescript
db.run("PRAGMA wal_checkpoint(TRUNCATE)");
```

### 3.4 不适合高并发写入的场景

bun:sqlite 在某些场景下是不适合的，特别是需要高并发写入的场景。正确识别这些场景可以避免在生产环境中遇到严重的性能问题。

**高并发 Web API**：如果 Web API 的每秒请求量超过数千次，且大部分请求涉及数据库写入操作，bun:sqlite 可能无法满足性能需求。在这种情况下，PostgreSQL、MySQL 或分布式数据库更适合。

**实时数据处理**：对于需要实时处理大量数据流的系统（如日志聚合、实时分析、IoT 数据采集），bun:sqlite 的写入吞吐量可能成为瓶颈。

**多用户协作系统**：在多个用户同时编辑和保存数据的协作系统中，写冲突可能导致频繁的重试和用户体验下降。

**分布式系统**：bun:sqlite 不支持分布式部署，无法在多个服务器之间共享数据。对于需要在多个节点之间同步数据的应用，需要额外的数据同步机制。

**大数据分析**：对于需要处理 TB 级别数据的数据分析应用，bun:sqlite 的存储容量和查询性能可能不足。

在这些场景中，可以考虑以下替代方案：

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| 高并发 Web API | PostgreSQL + 连接池 | 支持高并发写入，成熟的连接池管理 |
| 实时数据处理 | Apache Kafka + 流处理引擎 | 高吞吐量的数据管道，持久化消息 |
| 多用户协作 | 分布式数据库（如 CockroachDB） | 支持多节点写入和数据一致性 |
| 分布式系统 | 分布式数据库或数据库中间件 | 数据分片、复制和故障转移 |
| 大数据分析 | 列式存储（如 ClickHouse） | 列式压缩存储，高效的聚合查询 |

### 3.5 WAL 与 DELETE 模式的权衡

SQLite 的两种事务日志模式——WAL（Write-Ahead Logging）和 DELETE（回滚日志，传统模式）——各有优缺点。选择合适的模式对应用性能和可靠性有重要影响。

**DELETE 模式（传统回滚日志）**：

优点：
- 兼容性最好，所有 SQLite 版本都支持
- 数据库文件只有一个（不需要管理额外的 -wal 和 -shm 文件）
- 在只读场景下，不需要维护 WAL 索引，内存占用更低
- 数据库文件大小固定，不会因为 WAL 文件增长而出现性能波动

缺点：
- 读操作和写操作不能并发执行
- 写入性能较低（随机 I/O 为主）
- 多个读取者之间也不能完全并发（共享锁的限制）

**WAL 模式**：

优点：
- 读操作和写操作可以并发执行
- 写入性能更高（顺序 I/O）
- 读取性能通常也更好（不需要等待写入者）
- 适合读多写少的应用场景

缺点：
- 需要管理额外的文件（-wal 和 -shm）
- 在 WAL 文件变大时，读取性能下降
- 不适合需要低延迟写入的应用（WAL 文件的 Checkpoint 操作可能导致延迟抖动）
- 在只读文件系统上无法使用 WAL 模式

**模式选择建议**：

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| 读多写少（10:1 以上） | WAL | 并发读取性能更好 |
| 写操作频繁 | DELETE | 避免 WAL 文件增长导致的性能波动 |
| 单个连接访问 | DELETE | 不需要并发读取的优势 |
| 只读应用 | DELETE 或 WAL | 两者差异不大 |
| 文件系统不可写 | DELETE | WAL 模式需要写入额外的文件 |
| 嵌入式/移动设备 | WAL | 更好的崩溃恢复能力 |

在 bun:sqlite 中切换模式非常简单：

```typescript
// 切换到 WAL 模式
db.run("PRAGMA journal_mode = WAL");

// 切换回 DELETE 模式
db.run("PRAGMA journal_mode = DELETE");

// 查看当前模式
const mode = db.query("PRAGMA journal_mode").get();
```

## 4. 典型问题处理

### 4.1 SQLITE_BUSY 错误与 WAL 模式切换

SQLITE_BUSY 是 bun:sqlite 应用中最常见的错误之一。这个错误表示数据库正在被其他连接使用，当前操作无法获取所需的锁。

**错误原因**：

SQLITE_BUSY 错误可能由以下情况引起：

1. 多个进程同时访问同一个数据库文件，且尝试进行写操作。
2. 在同一个进程中，多个 Database 实例同时操作同一个数据库文件。
3. 一个事务长时间未提交或回滚，阻塞了其他连接的操作。
4. 在 DELETE 模式下，读操作和写操作同时发生。

**诊断方法**：

可以通过以下方式诊断 SQLITE_BUSY 错误：

```typescript
try {
  db.run("INSERT INTO logs VALUES (?)", "test");
} catch (e) {
  console.error("SQLite error:", e.message);
  // 检查错误码
  if (e.errno === 5) { // SQLITE_BUSY
    console.log("数据库繁忙，需要重试或切换模式");
  }
}
```

**解决方案**：

1. **切换到 WAL 模式**：WAL 模式允许读操作和写操作并发执行，可以显著减少 SQLITE_BUSY 错误。

```typescript
const db = new Database("app.db");
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA busy_timeout = 5000"); // 等待最多 5 秒
```

2. **设置忙等待超时**：通过 `PRAGMA busy_timeout` 设置忙等待超时时间，让 SQLite 在遇到锁冲突时等待一段时间，而不是立即返回错误。

3. **实现重试逻辑**：在应用层实现重试逻辑，当遇到 SQLITE_BUSY 错误时，等待一段时间后重试。

```typescript
function executeWithRetry(db, sql, params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return db.run(sql, params);
    } catch (e) {
      if (e.errno === 5 && i < maxRetries - 1) {
        // 等待指数退避
        Bun.sleep(100 * Math.pow(2, i));
        continue;
      }
      throw e;
    }
  }
}
```

4. **减少事务时间**：确保事务尽可能短，不要在事务中执行耗时的操作（如网络请求、文件 I/O）。

5. **使用单个连接**：在单进程应用中，尽量使用单个 Database 实例，避免多个连接竞争锁。

### 4.2 慢查询优化与索引

慢查询是影响应用性能的常见问题。bun:sqlite 提供了多种工具和策略来诊断和优化慢查询。

**诊断慢查询**：

1. **使用 EXPLAIN 分析查询计划**：

```typescript
const plan = db.query("EXPLAIN QUERY PLAN SELECT * FROM users WHERE age > 30").all();
console.table(plan);
```

EXPLAIN QUERY PLAN 的输出会显示 SQLite 是如何执行查询的，包括是否使用了索引、扫描了多少条记录等。如果输出中包含 "SCAN TABLE" 而不是 "SEARCH TABLE"，说明查询没有使用索引，需要进行全表扫描。

2. **使用 SQLITE_STMT 统计信息**：

bun:sqlite 提供了预编译语句的统计信息，包括执行次数、总耗时等。可以利用这些信息识别最耗时的查询。

3. **启用 SQLite 的慢查询日志**：

通过设置编译选项，SQLite 可以记录执行时间超过指定阈值的查询。

**索引优化策略**：

1. **创建合适的索引**：为经常出现在 WHERE 子句、JOIN 条件和 ORDER BY 子句中的列创建索引。

```typescript
db.run("CREATE INDEX idx_users_age ON users(age)");
db.run("CREATE INDEX idx_orders_user_id ON orders(user_id)");
```

2. **复合索引**：对于多条件的查询，创建复合索引可以提高查询效率。

```typescript
// 查询: SELECT * FROM orders WHERE user_id = ? AND status = ?
db.run("CREATE INDEX idx_orders_user_status ON orders(user_id, status)");
```

3. **覆盖索引**：如果查询需要的所有列都包含在索引中，SQLite 可以直接从索引中获取数据，不需要访问主表。这种方式可以进一步提高查询性能。

```typescript
// 查询: SELECT id, name FROM users WHERE age > 30
db.run("CREATE INDEX idx_users_age_id_name ON users(age, id, name)");
```

4. **避免过度索引**：虽然索引可以加速读取操作，但会降低写入操作的速度（因为每次写入都需要更新索引）。为每个表创建的索引数量不要超过 5-10 个。

**查询优化技巧**：

1. **使用 LIMIT 限制结果集大小**：对于只需要部分数据的查询，使用 LIMIT 可以减少数据传输和内存消耗。

2. **避免 SELECT \***：只选择需要的列，减少数据传输和处理的开销。

3. **使用 EXISTS 替代 IN**：在子查询中，EXISTS 通常比 IN 更高效。

4. **避免在 WHERE 子句中对列进行函数操作**：如 `WHERE YEAR(date) = 2024` 会导致索引失效，应该使用范围查询替代。

5. **合理使用 LIKE**：LIKE 模式的通配符在前（如 `%keyword`）会导致索引失效，应该避免。

### 4.3 数据库文件过大与 VACUUM

随着数据的不断写入和删除，SQLite 数据库文件可能会变得过大，其中包含大量的空闲空间。VACUUM 命令可以回收这些空闲空间，减小数据库文件的大小。

**空闲空间产生的原因**：

1. **删除操作**：删除记录时，SQLite 只是标记这些空间为可用，并不会立即归还给操作系统。
2. **更新操作**：更新操作可能被实现为删除旧记录和插入新记录，同样会留下空闲空间。
3. **事务回滚**：回滚的事务可能留下空闲页面。
4. **自动增长**：SQLite 以页面为单位分配空间，分配的单位大于实际需求。

**VACUUM 的工作原理**：

VACUUM 命令会创建一个新的数据库文件，将现有数据逐页复制到新文件中，然后删除旧文件，用新文件替换旧文件。在这个过程中，空闲空间被回收，数据库文件被压缩到最小尺寸。

在 bun:sqlite 中，可以这样使用 VACUUM：

```typescript
// 执行 VACUUM，回收空闲空间
db.run("VACUUM");

// 将 VACUUM 后的数据库保存到新文件
db.run("VACUUM INTO 'compacted.db'");
```

**VACUUM 的注意事项**：

1. **VACUUM 需要大量磁盘空间**：VACUUM 需要足够的磁盘空间来创建新的数据库文件。通常需要大约两倍于原数据库文件的空间。
2. **VACUUM 需要独占锁**：VACUUM 执行期间，其他连接无法访问数据库。在生产环境中，需要在低峰期执行 VACUUM。
3. **VACUUM 会重建索引**：VACUUM 会重新创建所有索引，可能会使索引更加紧凑。
4. **增量 VACUUM**：对于大数据库，可以使用 `PRAGMA auto_vacuum = INCREMENTAL` 来逐步回收空间，减少对业务的影响。

```typescript
db.run("PRAGMA auto_vacuum = INCREMENTAL");
// 手动触发增量 VACUUM
db.run("PRAGMA incremental_vacuum(100)"); // 回收 100 页
```

**预防数据库文件过大的策略**：

1. **定期执行 VACUUM**：根据数据的更新频率，定期（如每周或每月）执行 VACUUM。
2. **数据归档**：定期将历史数据归档到其他存储系统，减少数据库中的数据量。
3. **分表存储**：将数据按时间或其他维度分表存储，减少单表的大小。
4. **监控数据库文件大小**：设置监控告警，当数据库文件超过一定大小时自动执行 VACUUM 或触发人工处理。

### 4.4 连接泄漏与正确的关闭模式

数据库连接泄漏是 bun:sqlite 应用中容易被忽视但后果严重的问题。不正确地管理数据库连接可能导致文件句柄耗尽、内存泄漏和数据损坏。

**连接泄漏的原因**：

1. **未调用 close()**：创建 Database 实例后，忘记调用 close() 方法释放资源。
2. **异常退出**：在发生异常时，没有确保数据库连接被正确关闭。
3. **长时间持有连接**：在长时间运行的应用中，虽然最终会关闭连接，但连接持有时间过长导致资源紧张。
4. **循环中创建连接**：在循环中反复创建 Database 实例而不关闭，导致大量连接泄漏。

**正确的连接管理模式**：

1. **使用 try/finally 确保关闭**：

```typescript
const db = new Database("app.db");
try {
  // 执行数据库操作
  db.run("INSERT INTO logs VALUES (?)", "test");
} finally {
  db.close();
}
```

2. **使用 Bun 的生命周期管理**：

```typescript
// 在应用退出时自动关闭
process.on("exit", () => {
  db.close();
});

// 捕获未处理的异常
process.on("uncaughtException", (err) => {
  console.error("未捕获异常:", err);
  db.close();
  process.exit(1);
});
```

3. **单例模式管理连接**：

对于大多数单进程应用，维护一个全局的数据库连接实例即可。避免在函数中频繁创建和销毁连接。

```typescript
// database.ts
import { Database } from "bun:sqlite";

let db: Database | null = null;

export function getDatabase(): Database {
  if (!db) {
    db = new Database("app.db");
    db.run("PRAGMA journal_mode = WAL");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

4. **连接池模式**：

对于需要多个连接的应用，可以使用连接池管理连接的生命周期。虽然 bun:sqlite 没有内置的连接池，但可以自己实现一个简单的连接池。

```typescript
class DatabasePool {
  private pools: Database[] = [];
  private inUse: Set<Database> = new Set();
  
  constructor(private maxSize: number = 5) {}
  
  acquire(): Database {
    // 找空闲连接
    for (const db of this.pools) {
      if (!this.inUse.has(db)) {
        this.inUse.add(db);
        return db;
      }
    }
    // 创建新连接
    if (this.pools.length < this.maxSize) {
      const db = new Database("app.db");
      this.pools.push(db);
      this.inUse.add(db);
      return db;
    }
    throw new Error("连接池已满");
  }
  
  release(db: Database): void {
    this.inUse.delete(db);
  }
  
  close(): void {
    for (const db of this.pools) {
      db.close();
    }
    this.pools = [];
    this.inUse.clear();
  }
}
```

5. **使用 FinalizationRegistry 兜底**：

虽然不推荐依赖，但可以使用 FinalizationRegistry 作为兜底机制，在数据库对象被垃圾回收时自动关闭连接。

```typescript
const registry = new FinalizationRegistry((db: Database) => {
  try { db.close(); } catch {}
});
registry.register(db, db);
```

## 5. 必备知识与技能

### 5.1 SQL 基础

使用 bun:sqlite 要求开发者具备扎实的 SQL 基础知识。虽然 bun:sqlite 简化了数据库的连接和管理，但核心的数据操作仍然通过 SQL 语句完成。

**CRUD 操作**：

CRUD 是数据库操作的基础，分别对应 Create（创建）、Read（读取）、Update（更新）和 Delete（删除）。

CREATE（创建）：

```sql
-- 创建表
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  age INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 插入数据
INSERT INTO users (name, email, age) VALUES ('张三', 'zhangsan@example.com', 28);
INSERT INTO users (name, email, age) VALUES ('李四', 'lisi@example.com', 32);
```

READ（读取）：

```sql
-- 基本查询
SELECT * FROM users;
SELECT name, email FROM users WHERE age > 25;
SELECT * FROM users ORDER BY age DESC LIMIT 10;

-- 聚合查询
SELECT COUNT(*) as total, AVG(age) as avg_age FROM users;
SELECT age, COUNT(*) as count FROM users GROUP BY age;
```

UPDATE（更新）：

```sql
-- 更新数据
UPDATE users SET age = 29 WHERE name = '张三';
UPDATE users SET age = age + 1 WHERE age < 30;
```

DELETE（删除）：

```sql
-- 删除数据
DELETE FROM users WHERE id = 1;
DELETE FROM users WHERE age < 18;
```

**JOIN 操作**：

JOIN 用于关联多个表的数据，是关系型数据库的核心能力。

```sql
-- INNER JOIN：只返回匹配的记录
SELECT u.name, o.order_date, o.amount
FROM users u
INNER JOIN orders o ON u.id = o.user_id;

-- LEFT JOIN：返回左表所有记录，右表不匹配的为 NULL
SELECT u.name, o.order_date, o.amount
FROM users u
LEFT JOIN orders o ON u.id = o.user_id;

-- 多表 JOIN
SELECT u.name, o.order_date, p.product_name
FROM users u
JOIN orders o ON u.id = o.user_id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id;
```

**索引**：

索引是提高查询性能的关键。合理的索引设计可以显著减少查询时间。

```sql
-- 创建单列索引
CREATE INDEX idx_users_email ON users(email);

-- 创建复合索引
CREATE INDEX idx_users_age_name ON users(age, name);

-- 创建唯一索引
CREATE UNIQUE INDEX idx_users_email_unique ON users(email);

-- 删除索引
DROP INDEX IF EXISTS idx_users_email;
```

**子查询与 CTE**：

子查询和公共表表达式（CTE）用于构建复杂的查询逻辑。

```sql
-- 子查询
SELECT name, email FROM users
WHERE id IN (SELECT user_id FROM orders WHERE amount > 100);

-- CTE（WITH 子句）
WITH high_value_users AS (
  SELECT user_id, SUM(amount) as total
  FROM orders
  GROUP BY user_id
  HAVING total > 1000
)
SELECT u.name, h.total
FROM users u
JOIN high_value_users h ON u.id = h.user_id;
```

**窗口函数**：

窗口函数可以在不改变结果集行数的情况下，对数据进行分组计算。

```sql
-- ROW_NUMBER：为每行分配一个序号
SELECT name, age, ROW_NUMBER() OVER (ORDER BY age DESC) as rank
FROM users;

-- 分组排名
SELECT name, department, salary,
  RANK() OVER (PARTITION BY department ORDER BY salary DESC) as dept_rank
FROM employees;
```

### 5.2 事务与隔离级别

事务是保证数据一致性的基本机制。bun:sqlite 完全支持 SQLite 的事务特性。

**事务的基本操作**：

```typescript
// 隐式事务（每个语句自动提交）
db.run("INSERT INTO users VALUES (1, '张三')");

// 显式事务
db.run("BEGIN TRANSACTION");
try {
  db.run("INSERT INTO users VALUES (2, '李四')");
  db.run("UPDATE accounts SET balance = balance - 100 WHERE user_id = 2");
  db.run("COMMIT"); // 提交事务
} catch (e) {
  db.run("ROLLBACK"); // 回滚事务
  throw e;
}
```

**使用 bun:sqlite 的 transaction API**：

bun:sqlite 提供了更便捷的事务 API：

```typescript
const insertUser = db.prepare("INSERT INTO users (name) VALUES (?)");
const insertLog = db.prepare("INSERT INTO logs (message) VALUES (?)");

const addUser = db.transaction((name: string) => {
  insertUser.run(name);
  insertLog.run(`Created user: ${name}`);
});

// 事务内执行
addUser("王五");
```

**隔离级别**：

SQLite 支持四种隔离级别，但在默认配置下，SQLite 的隔离级别是 SERIALIZABLE（可序列化）。这是最高的隔离级别，可以防止脏读、不可重复读和幻读。

| 隔离级别 | 脏读 | 不可重复读 | 幻读 |
|---------|------|-----------|------|
| READ UNCOMMITTED | 可能 | 可能 | 可能 |
| READ COMMITTED | 避免 | 可能 | 可能 |
| REPEATABLE READ | 避免 | 避免 | 可能 |
| SERIALIZABLE | 避免 | 避免 | 避免 |

在 SQLite 中，由于锁机制的实现，默认提供了 SERIALIZABLE 级别的隔离。在 WAL 模式下，读取操作可以看到在读取开始前已经提交的所有写入操作，提供了快照隔离（Snapshot Isolation）级别的保护。

**事务的最佳实践**：

1. **事务尽可能短**：长时间持有事务会阻塞其他操作的执行。
2. **不要在事务中执行网络请求**：网络延迟会显著延长事务时间。
3. **合理选择事务类型**：
   - DEFERRED：默认模式，直到第一次写操作才获取锁。
   - IMMEDIATE：在事务开始时获取写锁，避免死锁。
   - EXCLUSIVE：在事务开始时获取排他锁，其他连接无法读取。

```typescript
db.run("BEGIN IMMEDIATE TRANSACTION");
// 确保事务开始时立即获取写锁
```

### 5.3 连接池原理

连接池是数据库访问中的重要概念，虽然 bun:sqlite 在单进程场景下通常只需要单个连接，但理解连接池的原理有助于设计更健壮的应用架构。

**为什么需要连接池**：

创建数据库连接是一个相对昂贵的操作。对于 bun:sqlite，虽然创建 Database 实例的开销比网络数据库连接小得多，但在高并发场景下，频繁创建和销毁连接仍然会影响性能。连接池通过维护一组可复用的连接来解决这个问题。

**连接池的核心参数**：

| 参数 | 说明 | 建议值 |
|------|------|--------|
| minSize | 最小连接数 | 1-2 |
| maxSize | 最大连接数 | 5-20 |
| acquireTimeout | 获取连接超时 | 5000ms |
| idleTimeout | 空闲连接超时 | 60000ms |
| maxLifetime | 连接最大生命周期 | 1800000ms |

**bun:sqlite 的连接池实现**：

虽然 bun:sqlite 没有内置的连接池，但开发者可以根据需要实现简单的连接池。对于大多数单进程应用，维护单个数据库连接就足够了，因为 SQLite 的内部锁机制已经提供了并发控制。

在以下场景中，使用连接池可能有益：

1. **多线程访问**：当多个线程需要同时访问数据库时，为每个线程分配独立的连接可以减少锁竞争。
2. **读写分离**：使用一个连接进行写入操作，其他连接进行读取操作。
3. **命名空间隔离**：不同的模块使用不同的数据库连接，避免相互影响。

### 5.4 ORM 与原生 SQL 的选择

在 bun:sqlite 应用开发中，开发者需要在 ORM（对象关系映射）和原生 SQL 之间做出选择。两种方式各有优缺点。

**原生 SQL 的优势**：

1. **完全的控制权**：开发者可以精确控制执行的 SQL 语句，包括优化查询计划和使用 SQLite 特有的功能。
2. **最小的性能开销**：没有 ORM 的映射和转换开销，查询性能最优。
3. **简单的依赖**：不需要引入额外的 ORM 库，减少依赖管理的复杂度。
4. **更容易调试**：可以直接复制 SQL 语句到数据库管理工具中执行和调试。

**原生 SQL 的劣势**：

1. **代码冗余**：需要手动编写大量的 SQL 语句，特别是对于复杂的 CRUD 操作。
2. **类型安全性差**：SQL 语句是字符串，容易写错，编译时无法检查。
3. **维护成本高**：当数据库模式变化时，需要手动更新所有相关的 SQL 语句。
4. **缺乏迁移工具**：需要自己实现或集成数据库迁移工具。

**ORM 的优势**：

1. **开发效率高**：通过面向对象的方式操作数据库，减少样板代码。
2. **类型安全**：现代 ORM（如 Drizzle、Prisma）提供了类型安全的查询 API。
3. **迁移管理**：提供了数据库迁移工具，可以自动生成和管理迁移脚本。
4. **关系管理**：自动处理表之间的关系，减少 JOIN 操作的复杂度。

**ORM 的劣势**：

1. **性能开销**：ORM 的查询生成和结果映射会带来额外的性能开销。
2. **学习曲线**：需要学习 ORM 的查询 API 和配置方式。
3. **抽象泄漏**：复杂的查询可能需要使用原生 SQL 回退，导致混合使用两种方式。
4. **调试困难**：ORM 生成的 SQL 语句可能不如手写的 SQL 直观，调试起来更困难。

**选择建议**：

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| 小型项目/原型 | 原生 SQL | 简单快速，不需要额外依赖 |
| 中型项目 | Drizzle ORM | 类型安全，性能开销小 |
| 大型项目 | Prisma 或 Drizzle | 完整的迁移工具和类型安全 |
| 高性能要求 | 原生 SQL | 完全控制查询执行 |
| 复杂查询 | 原生 SQL | ORM 难以表达复杂查询 |
| 标准 CRUD | ORM | 开发效率高，代码简洁 |

**在 bun:sqlite 中使用 ORM**：

虽然 bun:sqlite 主要面向原生 SQL 使用，但也可以与 ORM 库结合使用。Drizzle ORM 提供了对 bun:sqlite 的原生支持：

```typescript
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

const sqlite = new Database("app.db");
const db = drizzle(sqlite);

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name"),
  age: integer("age"),
});

// 类型安全的查询
const result = await db.select().from(users).where(eq(users.age, 30));
```

## 6. 示例代码与配置

### 6.1 sqlite-basics.ts 详解

`examples/01-basic/sqlite-basics.ts` 是 bun:sqlite 的入门示例，展示了最基本的数据库操作。

**代码结构分析**：

这个示例程序由四个主要步骤组成：

**第一步：创建数据库连接**

```typescript
import { Database } from "bun:sqlite";
const db = new Database(":memory:");
```

`import { Database } from "bun:sqlite"` 是 bun:sqlite 的入口。`Database` 类封装了与 SQLite 数据库文件的所有交互。`new Database(":memory:")` 创建了一个在内存中运行的数据库实例。使用 `:memory:` 作为数据库路径意味着数据库完全运行在内存中，不会创建任何磁盘文件。这种模式适合测试和临时数据处理场景，因为数据库在程序退出后自动销毁。

如果希望数据持久化到磁盘，可以传入文件路径：

```typescript
const db = new Database("data.db"); // 创建或打开文件 data.db
```

`Database` 构造函数还支持选项参数：

```typescript
const db = new Database("data.db", {
  readwrite: true,  // 以读写模式打开
  create: true,     // 如果文件不存在则创建
  strict: true,     // 启用严格模式（更严格的类型检查）
});
```

**第二步：创建表和插入数据**

```typescript
db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)");
db.run("INSERT INTO users (name, age) VALUES ('Alice', 30), ('Bob', 25)");
```

`db.run()` 方法用于执行不返回结果集的 SQL 语句，如 CREATE TABLE、INSERT、UPDATE、DELETE 等。它返回一个 `Database.RunResult` 对象，包含 `changes`（影响的行数）和 `lastInsertRowid`（最后插入行的 ID）属性。

`db.run()` 支持参数化查询，可以防止 SQL 注入：

```typescript
// 使用 ? 占位符
db.run("INSERT INTO users (name, age) VALUES (?, ?)", "Charlie", 35);

// 使用命名参数
db.run("INSERT INTO users (name, age) VALUES ($name, $age)", {
  $name: "David",
  $age: 28,
});
```

**第三步：查询数据**

```typescript
const rows = db.query("SELECT * FROM users").all();
console.table(rows);
```

`db.query()` 方法用于执行返回结果集的 SQL 语句，返回一个 `Statement` 对象。`Statement` 对象提供了多种方法来获取结果：

- `all()`：返回所有结果行的数组。
- `get()`：返回第一行结果，如果没有结果则返回 `undefined`。
- `asIterator()`：返回一个迭代器，可以逐行处理结果。
- `values()`：返回所有结果行的二维数组（不包含列名）。

`console.table()` 是一个强大的调试工具，可以将二维数据结构以表格形式打印到控制台。对于 bun:sqlite 的查询结果，它会自动识别列名并格式化输出。

**第四步：使用预编译语句**

```typescript
const stmt = db.prepare("SELECT * FROM users WHERE age > ?");
const older = stmt.all(27);
console.log("Users older than 27:", older);
```

`db.prepare()` 创建了一个预编译语句对象。预编译语句的优势在于：

1. **性能**：SQL 语句只需要编译一次，可以多次执行。
2. **安全**：参数值在编译后绑定，不会影响 SQL 语法结构，天然防止 SQL 注入。
3. **类型安全**：bun:sqlite 会自动处理参数值的类型转换。

预编译语句的完整生命周期包括：

```typescript
// 1. 创建预编译语句
const stmt = db.prepare("SELECT * FROM users WHERE age > ? AND name LIKE ?");

// 2. 绑定参数并执行（多次）
stmt.all(30, "A%");     // 查询年龄 > 30 且名字以 A 开头的用户
stmt.get(25, "B%");     // 查询年龄 > 25 且名字以 B 开头的用户（只返回第一行）

// 3. 释放资源（可选，bun:sqlite 会自动管理）
stmt.finalize();
```

**第五步：关闭数据库连接**

```typescript
db.close();
```

`db.close()` 释放数据库连接占用的所有资源，包括文件句柄、内存缓存和预编译语句缓存。关闭后，数据库对象不能再被使用。

### 6.2 transactions.ts 详解

`examples/02-advanced/transactions.ts` 展示了 bun:sqlite 的事务处理能力，是处理批量数据操作的典型模式。

**代码结构分析**：

这个示例展示了 bun:sqlite 事务 API 的核心用法：

**事务的定义**：

```typescript
const tx = db.transaction((items: [string, number][]) => {
  for (const [item, qty] of items) {
    insert.run(item, qty);
  }
});
```

`db.transaction()` 是 bun:sqlite 提供的高级事务 API。它接受一个回调函数，这个回调函数内的所有数据库操作会在一个事务中执行。如果回调函数抛出异常，事务会自动回滚；如果回调函数正常返回，事务会自动提交。

`db.transaction()` 返回一个函数，这个函数的行为与普通函数类似，但会在事务上下文中执行：

```typescript
// 事务外的操作
console.log("准备插入数据...");

// 事务内的操作
tx([["Apple", 10], ["Banana", 5], ["Cherry", 20]]);

// 事务外的操作
console.log("数据插入完成");
```

**事务的原子性保证**：

事务的一个重要特性是原子性：要么所有操作都成功，要么所有操作都不生效。如果在事务执行过程中发生错误，之前的操作会被自动回滚：

```typescript
const tx = db.transaction((items: [string, number][]) => {
  for (const [item, qty] of items) {
    insert.run(item, qty);
    if (qty < 0) {
      throw new Error("数量不能为负数");
    }
  }
});

try {
  tx([["Apple", 10], ["Invalid", -1], ["Cherry", 20]]);
} catch (e) {
  // 事务回滚，"Apple" 和 "Invalid" 的插入都不会生效
  console.log("事务回滚:", e.message);
}
```

**事务的性能优势**：

使用事务进行批量插入可以显著提升性能。在没有事务的情况下，每次 `insert.run()` 调用都会触发一次磁盘写入操作。在事务中，所有的写入操作在事务提交时才一次性写入磁盘。

性能对比数据（插入 10000 条记录）：

| 方式 | 耗时 | 说明 |
|------|------|------|
| 逐条插入（无事务） | 约 5000ms | 每次插入触发磁盘写入 |
| 单条事务 | 约 800ms | 每次插入仍触发事务 |
| 批量事务（10000 条） | 约 8ms | 所有插入一次性写入 |

**事务的类型**：

bun:sqlite 支持三种事务类型：

1. **DEFERRED**（默认）：事务开始时不获取锁，直到第一次读或写操作才获取需要的锁。这是最灵活的模式，但在高并发场景下可能导致死锁。

2. **IMMEDIATE**：事务开始时立即获取写锁。其他连接可以读取但不能写入，直到事务结束。这是推荐的模式，可以避免死锁。

3. **EXCLUSIVE**：事务开始时获取排他锁。其他连接既不能读取也不能写入，直到事务结束。这是最严格的模式，适用于关键操作。

```typescript
// 使用 IMMEDIATE 模式
db.run("BEGIN IMMEDIATE TRANSACTION");
try {
  // 数据库操作
  db.run("COMMIT");
} catch {
  db.run("ROLLBACK");
}
```

**事务后的数据验证**：

示例中在事务执行后验证了数据的一致性：

```typescript
const count = db.query("SELECT COUNT(*) as count FROM orders").get() as { count: number };
console.log(`Inserted ${count.count} orders via transaction`);
```

`db.query().get()` 返回结果集中的第一行。`as { count: number }` 是 TypeScript 的类型断言，告诉编译器结果对象的类型。

### 6.3 drizzle-app.ts 详解

`examples/03-production/drizzle-app.ts` 展示了如何在 bun:sqlite 中模拟 ORM 风格的开发模式。

**代码结构分析**：

这个示例展示了 bun:sqlite 与 Drizzle ORM 的集成方式。虽然示例中使用的是原生 SQL，但它展示了 ORM 风格开发的核心模式：

**模拟 Drizzle 的查询构建**：

```typescript
const db = new Database(":memory:");
db.run("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)");
db.run("INSERT INTO products VALUES (1, 'Laptop', 999.99), (2, 'Mouse', 29.99)");
```

在实际的 Drizzle ORM 中，表定义使用链式 API：

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, lt } from "drizzle-orm";

const products = sqliteTable("products", {
  id: integer("id").primaryKey(),
  name: text("name"),
  price: real("price"),
});

const db = drizzle(sqlite);
const result = await db.select()
  .from(products)
  .where(lt(products.price, 100));
```

**参数化查询**：

```typescript
const products = db.query("SELECT * FROM products WHERE price < ?").all(100);
```

参数化查询是防止 SQL 注入的标准做法。bun:sqlite 支持多种参数绑定方式：

```typescript
// 位置参数
db.query("SELECT * FROM products WHERE price < ? AND name LIKE ?").all(100, "M%");

// 多个参数数组
db.query("SELECT * FROM products WHERE price < ? AND name LIKE ?").all([100, "M%"]);

// 命名参数
db.query("SELECT * FROM products WHERE price < $price AND name LIKE $pattern").all({
  $price: 100,
  $pattern: "M%",
});
```

**结果格式化**：

```typescript
console.table(products);
```

`console.table()` 的输出格式如下：

```
┌─────┬─────┬───────┬───────┐
│ (idx) │ id │ name  │ price │
├─────┼─────┼───────┼───────┤
│   0   │  2 │ Mouse │ 29.99 │
└─────┴─────┴───────┴───────┘
```

**从示例到生产**：

这个简单的示例可以扩展为完整的数据访问层。以下是 Drizzle ORM 配合 bun:sqlite 的生产级使用示例：

```typescript
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { eq, lt, desc } from "drizzle-orm";

// 1. 创建 SQLite 连接
const sqlite = new Database("shop.db");
sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA busy_timeout = 5000");

// 2. 定义数据模型
const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  price: real("price").notNull(),
  category: text("category"),
  stock: integer("stock").default(0),
});

// 3. 创建 Drizzle 实例
const db = drizzle(sqlite);

// 4. CRUD 操作
// 创建
await db.insert(products).values({
  name: "Keyboard",
  price: 79.99,
  category: "Peripherals",
  stock: 100,
});

// 读取
const cheapProducts = await db.select()
  .from(products)
  .where(lt(products.price, 50))
  .orderBy(desc(products.price));

// 更新
await db.update(products)
  .set({ price: 69.99 })
  .where(eq(products.name, "Keyboard"));

// 删除
await db.delete(products)
  .where(eq(products.id, 1));
```

## 总结

bun:sqlite 作为 Bun 运行时的内置数据库引擎，为 JavaScript/TypeScript 开发者提供了高性能、零配置的本地数据存储方案。本章详细介绍了 bun:sqlite 的使用场景、实现原理、潜在风险与优化策略、典型问题处理方法以及必备的开发技能。

通过三个实践示例，我们展示了从基础的 CRUD 操作到高级的事务处理，再到生产级的 ORM 集成，帮助开发者全面掌握 bun:sqlite 的使用方法。在实际应用中，开发者应根据具体的业务需求、性能要求和部署环境，合理选择 bun:sqlite 的功能特性，构建高效可靠的数据库应用。
