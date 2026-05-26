# 附录C 环境故障排查指南

> 本附录汇总了在使用 JVM 工具链和 Docker 容器化部署 Java 应用时常见的问题及解决方案。

---

## C.1 Docker 环境问题

### C.1.1 Docker Desktop 内存不足导致容器 OOM Killed

**现象**：容器被 Docker 守护进程强制终止，`docker logs` 中无 Java 进程的错误日志，`docker inspect` 显示状态为 `OOMKilled: true`。

**原因**：Docker Desktop 运行在虚拟机中，虚拟机有固定的内存上限（默认为 2GB）。当所有容器的总内存使用超过此上限时，Docker 会 OOM kill 最"违规"的容器。这种现象在 macOS 和 Windows 的 Docker Desktop 环境中尤为常见，而 Linux 原生 Docker 则没有这一层虚拟机开销。

**排查步骤**：

1. 运行 `docker inspect <container>`，查看 `State.OOMKilled` 字段
2. 运行 `docker stats` 观察容器的实时内存使用
3. 检查 Docker Desktop 设置中的资源限制（Settings > Resources > Memory）

**解决方案**：

- **方案一**：增加 Docker Desktop 的虚拟机内存上限。打开 Docker Desktop Settings > Resources，将 Memory 从默认的 2GB 增加到 4GB 或 8GB。
- **方案二**：为容器设置明确的内存限制，避免单个容器占用过多内存：
  ```bash
  docker run -m 4g --memory-reservation 2g ...
  ```
- **方案三**：减少 Java 应用的最大堆内存，确保总堆使用在容器内存限制的 70%~80% 以内。

---

### C.1.2 Seccomp 限制导致 Async-Profiler 无法工作

**现象**：在容器中使用 async-profiler 时出现 `Failed to create perf event` 或 `Operation not permitted` 错误。

**原因**：Docker 默认的 seccomp 安全配置禁用了 `perf_event_open` 系统调用，而 async-profiler 需要此系统调用来获取硬件性能计数器。

**排查步骤**：

1. 运行 `docker run --security-opt seccomp=unconfined <image>` 测试
2. 如问题消失，则确认是 seccomp 限制导致

**解决方案**：

- **方案一（推荐）**：使用 `--cap-add SYS_PTRACE` 和 `--cap-add SYS_ADMIN`：
  ```bash
  docker run --cap-add SYS_PTRACE --cap-add SYS_ADMIN ...
  ```
- **方案二**：使用自定义 seccomp 配置文件，允许 perf_event_open：
  ```bash
  docker run --security-opt seccomp=custom-profile.json ...
  ```
  自定义配置可以从 Docker 默认配置中去除 `perf_event_open` 的禁止规则。
- **方案三**：完全禁用 seccomp（安全性降低，仅用于调试环境）：
  ```bash
  docker run --security-opt seccomp=unconfined ...
  ```

---

### C.1.3 `--privileged` vs `--cap-add SYS_PTRACE`

**容易混淆的问题**：很多文档在介绍容器内调试时建议使用 `--privileged`，但这个权限过大。

**区别**：

| 对比项 | `--privileged` | `--cap-add SYS_PTRACE` |
|--------|---------------|----------------------|
| 权限范围 | 所有 Linux capabilities | 仅 ptrace 能力 |
| 安全性 | 极高风险，容器可访问宿主机所有设备 | 低风险 |
| 适用场景 | 几乎不需要使用 | 仅需要 ptrace 时（如 jstack, async-profiler） |
| 对 JVM 工具支持 | 完整支持 | 支持 async-profiler, jattach, jstack 等 |

**建议**：在生产环境或半生产环境中，优先使用 `--cap-add SYS_PTRACE`。仅在确认需要额外能力时再添加单独的 `--cap-add`。避免使用 `--privileged` 除非明确知道其安全后果。

---

### C.1.4 Docker 网络端口映射问题

**现象**：宿主机无法访问容器中的 Java 调试端口或 JMX 端口。

**原因**：Docker 的端口映射不当时，应用绑定在 `127.0.0.1` 而非 `0.0.0.0` 上，导致宿主机无法通过映射端口访问。

**排查步骤**：

1. 在容器内执行 `netstat -tlnp` 检查 Java 进程监听的地址
2. 检查是否绑定到 `127.0.0.1`（容器内 localhost）而非 `0.0.0.0`

**解决方案**：

- **JMX 连接**：确保 JMX 配置的 `-Djava.rmi.server.hostname` 设置为宿主机可访问的 IP 地址：
  ```bash
  -Dcom.sun.management.jmxremote
  -Dcom.sun.management.jmxremote.port=9090
  -Dcom.sun.management.jmxremote.rmi.port=9090
  -Djava.rmi.server.hostname=<容器宿主机的 IP>
  -Dcom.sun.management.jmxremote.local.only=false
  ```
- **调试端口**：确保 `-agentlib:jdwp` 的地址为 `*:8000`（JDK 9+）而非 `127.0.0.1:8000`。
- **端口映射**：使用 `-p 9090:9090` 进行端口映射，确保容器端口和宿主机端口一一对应。

> **注意**：从 JDK 16+ 开始，JMX 默认只允许本地连接，需要在启动参数中显式设置 `-Dcom.sun.management.jmxremote.local.only=false`。

---

### C.1.5 容器内文件权限问题

**现象**：Java 进程无法写入日志文件或堆转储文件，或提示 `Permission denied`。

**原因**：容器内的 Java 进程以非 root 用户运行，但挂载的宿主机目录权限不匹配。

**排查步骤**：

1. 在容器内执行 `id` 查看运行用户 UID
2. 执行 `ls -la /path/to/mount` 查看目录权限
3. 确认 UID 是否对目录有写权限

**解决方案**：

- **方案一**：在 Dockerfile 中创建与宿主机 UID 匹配的用户：
  ```dockerfile
  RUN groupadd -g 1000 appuser && \
      useradd -r -u 1000 -g appuser appuser
  USER appuser
  ```
- **方案二**：使用 Docker 的 `--user` 参数：
  ```bash
  docker run --user 1000:1000 -v /host/data:/app/data ...
  ```
- **方案三**：在宿主机上调整目录权限：
  ```bash
  chmod 777 /host/data  # 不推荐，仅用于临时调试
  chown 1000:1000 /host/data  # 推荐
  ```
- **方案四**：挂载时使用命名卷（named volume），由 Docker 自动处理权限：
  ```bash
  docker run -v app-data:/app/data ...
  ```

---

### C.1.6 卷挂载性能问题

**现象**：容器内大量 IO 操作的 Java 应用运行缓慢，尤其是文件读写和日志写入。

**原因**：在 macOS 和 Windows 上，Docker Desktop 的 bind mount 通过文件共享机制（osxfs/gRPC FUSE）实现，性能远低于宿主机的原生文件系统。Linux 原生 Docker 影响较小。

**排查步骤**：

1. 对比 bind mount 和命名卷的性能差异：先后挂载同一目录和复制数据到命名卷中运行
2. 使用 iostat 或 JFR 观察文件读写耗时

**解决方案**：

- **方案一**：对于大量 IO 的路径（如日志、数据文件），使用 Docker 命名卷（named volume）而非 bind mount：
  ```bash
  docker run -v log-volume:/app/logs ...
  ```
- **方案二**：在 Linux 上使用 bind mount 影响较小，尽量在 Linux 上进行性能测试。
- **方案三**：减少日志同步刷盘频率，使用异步日志框架（如 Log4j2 的 Async Appender）。
- **方案四**：在 macOS 上考虑将数据复制到容器内部运行，而非通过挂载目录。

---

## C.2 JDK 问题

### C.2.1 JDK 版本不兼容（`--enable-preview`）

**现象**：编译或运行时出现 `Error: classes in module ... cannot access class ...` 或 `Unsupported class file major version`。

**原因**：项目使用了特定 JDK 版本的预览功能（如 Record Pattern、Virtual Threads 预览版），或在较新的 JDK 上运行了为旧 JDK 编译的代码。

**解决方案**：

- **编译时使用预览功能**：
  ```bash
  javac --release 21 --enable-preview Main.java
  ```
- **运行时使用预览功能**：
  ```bash
  java --enable-preview -jar app.jar
  ```
- **Maven 配置预览功能**：
  ```xml
  <plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <configuration>
      <release>21</release>
      <compilerArgs>
        <arg>--enable-preview</arg>
      </compilerArgs>
    </configuration>
  </plugin>
  ```
- **版本兼容性速查**：

  | JDK 版本 | 主要预览功能 |
  |---------|-------------|
  | JDK 21 (LTS) | Virtual Threads (稳定), Record Patterns, Pattern Matching for switch |
  | JDK 17 (LTS) | Sealed Classes, Pattern Matching for instanceof |
  | JDK 11 (LTS) | 无预览功能，但模块系统已是标准 |

---

### C.2.2 Maven 编译内存不足

**现象**：Maven 编译过程中出现 `java.lang.OutOfMemoryError: Java heap space` 或 `GC overhead limit exceeded`。

**原因**：Maven 编译器进程的默认堆内存不足，尤其是在处理大型项目（模块数多、代码量大）时。

**解决方案**：

- **方案一**：通过 `MAVEN_OPTS` 或 `.mvn/jvm.config` 增加编译器内存：
  ```bash
  export MAVEN_OPTS="-Xms512m -Xmx2g"
  ```
  或者在项目根目录创建 `.mvn/jvm.config`：
  ```
  -Xms512m -Xmx2g
  ```
- **方案二**：使用 `-T` 参数并行编译，但注意总内存消耗增加：
  ```bash
  mvn clean install -T 4 -Dmaven.compiler.fork=true
  ```
- **方案三**：跳过测试编译以节省内存：
  ```bash
  mvn clean compile -DskipTests
  ```

---

### C.2.3 JFR 转储文件权限

**现象**：执行 `jcmd <pid> JFR.dump` 后提示 `Could not write file` 或 `Permission denied`。

**原因**：JFR 转储时，文件由 JVM 进程创建。如果 JVM 进程的运行用户对目标目录没有写权限，则转储失败。

**排查步骤**：

1. 确认 JVM 进程的运行用户：`ps aux | grep java`
2. 确认目标目录的权限：`ls -la /path/to/dump/`

**解决方案**：

- **方案一**：转储到 JVM 有写权限的目录：
  ```bash
  jcmd <pid> JFR.dump filename=/tmp/recording.jfr
  ```
- **方案二**：启动时预指定转储路径：
  ```bash
  -XX:StartFlightRecording=filename=/var/log/jfr/recording.jfr,disk=true
  ```
- **方案三**：使用 `jcmd JFR.dump` 后通过 `docker cp` 将文件从容器中复制出来：
  ```bash
  docker cp <container>:/tmp/recording.jfr ./recording.jfr
  ```

---

### C.2.4 堆转储文件过大打不开

**现象**：OOM 自动生成的堆转储文件（hprof）达到数 GB 甚至数十 GB，导致分析工具（如 Eclipse MAT、VisualVM）无法打开或直接 OOM。

**原因**：生产环境的堆通常很大（16GB+），完整堆转储文件的体积与堆大小相近，超出了分析工具的可用内存。

**解决方案**：

- **方案一**：增加分析工具的可用内存。以 Eclipse MAT 为例：
  ```bash
  # 修改 MemoryAnalyzer.ini
  -Xms4g
  -Xmx16g
  ```
- **方案二**：使用轻量级工具进行初步分析。`jhat`（JDK 9 前）或在线工具（如 gceasy.io）可快速查看基本信息。
- **方案三**：使用 JFR 的 Old Object Sample 事件进行内存泄漏检测，无需完整堆转储：
  ```bash
  jcmd <pid> JFR.start name=leak
  # 等待一段时间
  jcmd <pid> JFR.dump name=leak filename=leak.jfr
  ```
  使用 JDK Mission Control 打开 leak.jfr 可直接查看老年代对象的分配调用栈。
- **方案四**：使用 `-XX:+HeapDumpAfterFullGC` 只 dump Full GC 后的堆，减少文件体积。

---

### C.2.5 GC 日志轮转配置

**问题**：生产环境中 GC 日志文件不断增长，最终占满磁盘空间。

**解决方案**：使用 JDK 9+ 统一的 `-Xlog` 日志框架配置日志轮转（file size 和 file count）：

```bash
# JDK 9+ 统一日志框架
-Xlog:gc*:file=/opt/logs/gc.log:time,level,tags:filesize=10M,filecount=10

# 等效于旧的 GC 日志配置
-XX:+PrintGCDetails -XX:+PrintGCDateStamps -Xloggc:/opt/logs/gc.log
-XX:+UseGCLogFileRotation -XX:NumberOfGCLogFiles=10 -XX:GCLogFileSize=10M
```

配置说明：
- `filesize=10M`：每个日志文件最大 10MB
- `filecount=10`：保留最近 10 个文件，总日志量约 100MB
- 轮转策略：文件达到 size 上限后，自动滚动到下一个文件，最旧的文件被删除

> **注意**：JDK 9 移除了旧版的 GC 日志参数（`-XX:+PrintGCDetails` 等）。如果使用 JDK 9+，必须迁移到 `-Xlog` 格式。

---

### C.2.6 工具链版本对应关系

不同 JDK 版本需要的工具链版本对应：

| JDK 版本 | 编译目标 | Maven 编译器 | asm 库版本 | async-profiler |
|---------|---------|-------------|-----------|---------------|
| JDK 8 | 1.8 | 3.8.x | 5.x | 1.8.x |
| JDK 11 | 11 | 3.8.x+ | 7.x | 2.x |
| JDK 17 | 17 | 3.9.x+ | 9.x | 2.9+ |
| JDK 21 | 21 | 3.9.x+ | 9.4+ | 3.0+ |

> **注意**：使用不匹配的 asm 库版本会导致 `Unsupported class file major version` 错误。async-profiler 版本必须与 JDK 主版本匹配，否则 perf 事件无法正确解析。

---

## C.3 常用解决方案

### C.3.1 Docker 资源配置调整

推荐的生产环境 Docker 资源配置：

```bash
docker run \
  -m 4g \                    # 容器内存限制
  --memory-reservation 2g \  # 软限制（尽力保证）
  --cpus 2 \                 # CPU 核心数
  --cap-add SYS_PTRACE \     # JVM 工具所需
  --ulimit nofile=65536:65536 \  # 文件描述符限制
  --ulimit nproc=4096:4096 \     # 进程数限制
  ...
```

Kubernetes 资源限制配置：

```yaml
resources:
  requests:
    memory: "4Gi"
    cpu: "2"
  limits:
    memory: "4Gi"
    cpu: "4"
```

> **黄金法则**：容器的内存限制（limits）应为 JVM 最大堆（-Xmx）的 1.5~2 倍，以容纳堆外内存（元空间、线程栈、直接内存、代码缓存等）。

---

### C.3.2 内核参数优化

**`vm.max_map_count` 不足**

**现象**：使用 Elasticsearch、MongoDB 等对 mmap 有大量需求的应用时出现 `max virtual memory areas vm.max_map_count is too low`。

**解决方案**：

```bash
# 临时修改（立即生效）
sudo sysctl -w vm.max_map_count=262144

# 永久修改
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-max-map.conf
sudo sysctl -p /etc/sysctl.d/99-max-map.conf
```

**透明大页（Transparent HugePages）**

**现象**：GC 暂停时间异常增大，尤其是在 Linux 上使用 G1 收集器时。

**原因**：透明大页（THP）的碎片整理（defrag）过程会导致长时间的 STW 停顿。

**解决方案**：对延迟敏感的 Java 应用，建议关闭 THP：

```bash
# 关闭 THP（需要 root 权限）
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/defrag

# 在容器中需要 --privileged 权限才能修改
# 建议在宿主机层面统一配置
```

---

### C.3.3 容器内调试技巧

**技巧一：使用 `jattach` 动态加载诊断工具**

`jattach` 是一个轻量级的工具，可在容器内动态 attach 到 JVM 进程，无需容器外额外权限：

```bash
# 下载 jattach（无需编译）
wget https://github.com/jattach/jattach/releases/latest/download/jattach

# 动态加载 async-profiler
./jattach <pid> load /path/to/libasyncProfiler.so true

# 触发堆转储
./jattach <pid> dumpheap /tmp/heap.hprof
```

**技巧二：容器内直接使用 jcmd 诊断**

JDK 内置的 `jcmd` 是容器内最全能的诊断工具，无需任何额外权限：

```bash
# 列出所有诊断命令
jcmd <pid> help

# 查看系统属性
jcmd <pid> VM.system_properties

# 查看 JVM 启动参数
jcmd <pid> VM.flags -all

# 打印线程堆栈（不需要 SYS_PTRACE）
jcmd <pid> Thread.print

# 生成 JFR 记录（不需要额外权限）
jcmd <pid> JFR.start duration=60s filename=recording.jfr
```

**技巧三：容器内部署 Arthas**

Arthas 是阿里巴巴开源的 Java 诊断工具，对容器环境友好：

```bash
# 一行命令安装并启动
curl -O https://arthas.aliyun.com/arthas-boot.jar
java -jar arthas-boot.jar --target-ip 0.0.0.0

# 或在 Dockerfile 中预装
RUN curl -sL https://arthas.aliyun.com/install.sh | sh
```

**技巧四：获取容器内 JVM 的 PID**

在一个容器中通常只有一个 Java 进程，但有多个进程时可以用以下方式找到正确的 PID：

```bash
# 方法一：直接使用 jps
jps -l

# 方法二：查找 Java 进程
ps aux | grep java | grep -v grep

# 方法三：在 Docker 中直接使用进程名称
jcmd $(pgrep java) VM.version
```

---

> **排查故障的核心思路**：先确认环境边界（容器资源限制、操作系统配置、JDK 版本），再定位应用层问题。大部分 JVM 工具类故障的根因不在 JVM 本身，而在于环境限制阻止了工具的正常工作。
