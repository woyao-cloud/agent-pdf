# 第1章 实验环境搭建

> 工欲善其事，必先利其器。本章将引导你搭建一套完整、可复现的 JVM 实验环境，让你能够亲自动手验证书中所有的 JVM 原理与调优技巧。

对于 Java 工程师而言，理解 JVM 不能仅停留在理论层面。GC 日志如何解读？JIT 编译如何观察？内存泄漏如何定位？这些问题的答案只有在真实的实验环境中动手操作，才能真正内化为自己的能力。

本书所有实验案例均基于 Docker 容器化环境运行，这意味着你不需要在自己的操作系统上安装复杂的依赖，也无需担心不同平台之间的差异——只要你的电脑上装有 Docker，整个实验环境就可以在一分钟内启动完毕。

---

## 1.1 Docker 基础概念

Docker 是一种容器化技术，它可以将应用及其全部依赖打包到一个轻量级的、可移植的容器中。对于本书的实验环境而言，Docker 解决了"在我机器上能跑"的经典问题——无论你使用的是 Windows、macOS 还是 Linux，容器内的环境完全一致。

以下是与本书实验密切相关的四个核心概念。

### 1.1.1 镜像（Image）

镜像是容器的模板，它包含了运行应用所需的全部文件——操作系统层、JDK、Maven、各种性能分析工具等。你可以把镜像理解为一个"快照"或"类（Class）"，镜像是静态的、只读的。

在本书的实验中，我们提供了一个预配置的 Docker 镜像，其中包含了：

- Ubuntu 22.04 LTS 操作系统
- JDK 21（Eclipse Temurin）
- Apache Maven 3.9.9
- async-profiler 3.0（性能分析工具）
- Arthas（在线诊断工具）
- wrk / k6（压力测试工具）

### 1.1.2 容器（Container）

容器是镜像的运行实例——你可以把它理解为一个"进程"或"对象（Instance）"。每个容器彼此隔离，拥有独立的文件系统、网络栈和进程空间。容器是动态的、可读写的，你可以在容器中执行命令、编译代码、运行 Java 程序。

### 1.1.3 数据卷（Volume）

容器默认是临时的——容器被删除后，内部所有的文件变更也随之消失。Volume 是 Docker 提供的持久化机制，它可以将宿主机（你的电脑）上的目录映射到容器内部。本书的实验使用 Volume 将本地的 Java 源代码目录映射到容器内，这样你在宿主机上用 IDE 编辑代码，容器内即可实时看到变更。

### 1.1.4 端口映射（Port Mapping）

容器拥有自己独立的网络空间。为了让宿主机能够访问容器内的服务（例如后面章节中的 Spring Boot 应用），需要将容器的端口映射到宿主机的端口。例如，`8080:8080` 表示将容器的 8080 端口映射到宿主机的 8080 端口。

---

## 1.2 Dockerfile 逐行解读

Dockerfile 是构建镜像的"配方"。让我们逐行分析本书实验环境的 Dockerfile，理解每一行指令的作用。

```dockerfile
FROM ubuntu:22.04
```

**`FROM`** 指定基础镜像。我们选择 Ubuntu 22.04 LTS 作为底层操作系统，它稳定且拥有广泛的软件包支持。

```dockerfile
ENV JAVA_HOME=/opt/jdk-21
ENV PATH=$JAVA_HOME/bin:$PATH
ENV MAVEN_HOME=/opt/maven
ENV PATH=$MAVEN_HOME/bin:$PATH
```

**`ENV`** 设置环境变量。这里配置了 `JAVA_HOME` 指向 JDK 安装目录，并将 `java` 和 `mvn` 命令所在的目录加入 `PATH`，使得我们能够在容器中直接使用这些命令。

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git unzip zip build-essential \
    numactl linux-tools-common linux-tools-generic \
    && rm -rf /var/lib/apt/lists/*
```

**`RUN`** 在镜像构建过程中执行命令。这里使用 apt-get 安装了一系列工具：

- `curl` / `wget`：用于下载文件
- `git`：版本控制
- `unzip` / `zip`：压缩解压
- `build-essential`：编译工具链（编译 wrk 等工具时需要）
- `numactl` / `linux-tools-*`：性能分析相关工具

末尾的 `rm -rf /var/lib/apt/lists/*` 用于清理 apt 缓存，这是一个常见的镜像瘦身技巧。

```dockerfile
RUN curl -L -o /tmp/jdk.tar.gz \
    https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_linux_hotspot_21.0.2_13.tar.gz \
    && tar -xzf /tmp/jdk.tar.gz -C /opt/ \
    && mv /opt/jdk-21.0.2+13 $JAVA_HOME \
    && rm /tmp/jdk.tar.gz
```

安装 JDK 21。我们从 Adoptium 项目（Eclipse Temurin）的 GitHub Release 页面下载 JDK 21，解压到 `/opt/` 目录，然后重命名为标准的 `/opt/jdk-21` 路径。注意这三步使用 `&&` 连接，确保一气呵成——如果任何一步失败，整个 `RUN` 指令都会失败，避免产生不完整的中间状态。

```dockerfile
RUN curl -L -o /tmp/maven.tar.gz \
    https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz \
    && tar -xzf /tmp/maven.tar.gz -C /opt/ \
    && mv /opt/apache-maven-3.9.9 $MAVEN_HOME \
    && rm /tmp/maven.tar.gz
```

安装 Maven 3.9.9，过程与 JDK 类似：下载、解压、重命名、清理。

```dockerfile
RUN curl -L -o /tmp/async-profiler.tar.gz \
    https://github.com/async-profiler/async-profiler/releases/download/v3.0/async-profiler-3.0-linux-x64.tar.gz \
    && tar -xzf /tmp/async-profiler.tar.gz -C /opt/ \
    && mv /opt/async-profiler-3.0 /opt/async-profiler \
    && rm /tmp/async-profiler.tar.gz
ENV PATH=/opt/async-profiler/bin:$PATH
```

安装 async-profiler 3.0，这是一个低开销的 Java 性能分析工具，我们在第 3 章会详细使用它。安装后将其 `bin` 目录加入 `PATH`。

```dockerfile
RUN curl -L -o /opt/arthas-boot.jar \
    https://arthas.aliyun.com/arthas-boot.jar
```

下载 Arthas 的启动 JAR 包。Arthas 是阿里巴巴开源的 Java 在线诊断工具，我们在第 4 章会深入使用。

```dockerfile
RUN git clone https://github.com/wg/wrk.git /tmp/wrk \
    && cd /tmp/wrk && make -j$(nproc) \
    && cp wrk /usr/local/bin/wrk \
    && rm -rf /tmp/wrk
```

从源码编译 wrk——一个轻量级的 HTTP 压力测试工具。这里使用 `$(nproc)` 自动获取 CPU 核心数来并行编译，加速构建过程。

```dockerfile
RUN curl -L -o /tmp/k6.tar.gz \
    https://github.com/grafana/k6/releases/download/v0.50.0/k6-v0.50.0-linux-amd64.tar.gz \
    && tar -xzf /tmp/k6.tar.gz -C /opt/ \
    && mv /opt/k6-v0.50.0-linux-amd64 /opt/k6 \
    && ln -s /opt/k6/k6 /usr/local/bin/k6 \
    && rm /tmp/k6.tar.gz
```

安装 k6——另一个优秀的压力测试工具。wrk 和 k6 会在第 5 章（JMH 微基准测试）和第 8 章（GC 调优）中被用来产生负载。

```dockerfile
WORKDIR /workspace
COPY cases /workspace/cases
COPY scripts /workspace/scripts
RUN chmod +x /workspace/scripts/*.sh
```

**`WORKDIR`** 设置工作目录，后续所有命令都将在这个目录下执行。**`COPY`** 将宿主机上的源代码和脚本复制到镜像中。注意，这里的 `COPY` 是在构建镜像时执行的，后续我们会通过 Volume 覆盖这些目录，从而实现"宿主机编辑、容器内运行"的开发流程。

```dockerfile
RUN java -version && mvn -version && wrk --version && k6 version
```

验证安装。如果任何一条命令失败，镜像构建过程就会中止。这是一个简单的"健康检查"，确保所有工具都正确安装。

```dockerfile
CMD ["bash"]
```

**`CMD`** 指定容器启动时默认执行的命令。这里我们启动 bash，这样容器运行后会进入一个交互式 Shell。

## 1.3 docker-compose.yml 解读

Docker Compose 是一个用于定义和运行多容器 Docker 应用的工具。虽然本书的实验只涉及一个容器，但我们仍然使用 Docker Compose，因为它提供了更清晰、更易于维护的配置方式。

```yaml
version: "3.9"

services:
  jvm-lab:
    build:
      context: .
      dockerfile: Dockerfile
    image: jvm-lab:latest
    container_name: jvm-lab
    volumes:
      - ./cases:/workspace/cases
      - ./scripts:/workspace/scripts
      - ~/.m2:/root/.m2
    ports:
      - "8080:8080"
      - "5005:5005"
    environment:
      - JAVA_OPTS=
    cap_add:
      - SYS_PTRACE
      - SYS_ADMIN
    security_opt:
      - seccomp:unconfined
    stdin_open: true
    tty: true
```

让我们逐段解读这份配置。

### services

`services` 定义了一个名为 `jvm-lab` 的服务。这是我们的核心实验容器。

### build

```
build:
  context: .
  dockerfile: Dockerfile
image: jvm-lab:latest
```

`build.context` 指定构建上下文为当前目录（`jvm-lab/`），`build.dockerfile` 指定 Dockerfile 的文件名。`image` 为构建出的镜像指定名称和标签，这里命名为 `jvm-lab:latest`。如果你以后修改了 Dockerfile，Docker Compose 会自动重新构建镜像。

### volumes

```
volumes:
  - ./cases:/workspace/cases
  - ./scripts:/workspace/scripts
  - ~/.m2:/root/.m2
```

Volume 挂载是实现"宿主机编辑、容器内运行"的关键：

- `./cases:/workspace/cases`：将本地的 `cases/` 目录（包含所有章节的 Maven 项目）挂载到容器内的 `/workspace/cases`。你在宿主机上用 IDE 修改代码后，容器内立即生效。
- `./scripts:/workspace/scripts`：将本地脚本目录挂载到容器内。
- `~/.m2:/root/.m2`：将宿主机的 Maven 本地仓库挂载到容器的 Maven 仓库路径。这样，Maven 依赖只需要下载一次，容器销毁后不会丢失。

### ports

```
ports:
  - "8080:8080"
  - "5005:5005"
```

端口映射：

- `8080:8080`：后续章节中的 Spring Boot 应用将运行在容器的 8080 端口上，映射到宿主机的 8080 端口后，你可以通过 `http://localhost:8080` 访问。
- `5005:5005`：这是 JDWP（Java Debug Wire Protocol）的调试端口。在 1.6 节中，我们会配置 IntelliJ IDEA 通过这个端口进行远程调试。

### cap_add 与 security_opt

```
cap_add:
  - SYS_PTRACE
  - SYS_ADMIN
security_opt:
  - seccomp:unconfined
```

这两项配置对本书的实验至关重要。`SYS_PTRACE` 权限允许容器使用 `jstack`、`jcmd` 等 JVM 诊断工具，以及 async-profiler 进行采样分析。`SYS_ADMIN` 和 `seccomp:unconfined` 则是某些性能分析工具（如 perf）正常运行的必要条件。如果没有这些配置，你在后面章节中执行某些 JVM 诊断命令时会遇到"Permission denied"错误。

### stdin_open 与 tty

```
stdin_open: true
tty: true
```

这两项等价于 `docker run -it`，保持容器的标准输入打开并分配一个伪终端，让容器启动后保持在后台运行，等待我们通过 `docker compose exec` 进入。

---

## 1.4 启动环境

现在，让我们启动实验环境。请确保你已经安装了 Docker Desktop（或 Docker Engine），然后打开终端，进入 `jvm-lab` 目录：

```bash
cd jvm-lab
docker build  -t jvm-lab:latest .
docker compose up -d
```

`docker compose up -d` 的意思是"启动所有服务并在后台运行"（`-d` 即 detached 模式）。第一次执行时，Docker 会读取 `jvm-lab` 目录下的 `docker-compose.yml` 和 `Dockerfile`，然后执行以下步骤：

1. **构建镜像**：按 Dockerfile 中的指令逐条执行。这一步耗时最长（取决于你的网络速度，通常需要 3-8 分钟），因为需要下载 JDK、Maven 以及多个工具。
2. **创建并启动容器**：镜像构建完成后，Docker 会根据 docker-compose.yml 中的配置创建并启动容器。

启动后，你可以使用以下命令查看容器状态：

```bash
docker compose ps
```

如果一切正常，你会看到类似下面的输出：

```
NAME                IMAGE               COMMAND                  SERVICE             CREATED             STATUS              PORTS
jvm-lab             jvm-lab:latest      "bash"                   jvm-lab             1 minute ago        Up 1 minute          0.0.0.0:5005->5005/tcp, 0.0.0.0:8080->8080/tcp
```

---

## 1.5 进入容器

容器启动后，我们需要进入容器内部进行操作。使用 `docker compose exec` 命令：

```bash
docker compose exec jvm-lab bash
```

这个命令的意思是"在名为 `jvm-lab` 的服务对应的容器中执行 `bash` 命令"。执行后，你会进入容器的 Shell 环境，提示符变为类似 `root@<容器ID>:/workspace#` 的形式。

在容器内，首先验证所有工具是否正确安装：

```bash
java -version
mvn -version
```

你应该能看到 JDK 21 和 Maven 3.9.9 的版本信息。接下来，编译运行本章的示例程序来验证整个环境：

```bash
cd /workspace/cases/ch01-environment
mvn compile exec:java -Dexec.mainClass="com.jvmbook.ch01.HelloJVM"
```

如果环境配置正确，你将看到类似如下的输出：

```
=== JVM Environment ===
Java Version: 21.0.2
JVM Name: OpenJDK 64-Bit Server VM
JVM Vendor: Eclipse Adoptium
Max Memory: 4096 MB
Total Memory: 256 MB
Free Memory: 240 MB
Available Processors: 8
=== JCMD Check ===
Run: jcmd 123 VM.version
```

> **提示**：`var rt = Runtime.getRuntime()` 是 Java 10 引入的局部变量类型推断特性。`rt.maxMemory()` 返回 JVM 能够使用的最大内存（默认约为宿主机内存的 1/4），而 `rt.totalMemory()` 返回当前已向操作系统申请的内存大小。

### 离开容器

当你完成实验后，使用 `exit` 命令退出容器 Shell：

```bash
exit
```

这只会断开与容器的连接，容器本身仍在后台运行。如果你想完全停止并移除容器，可以使用：

```bash
docker compose down
```

---

## 1.6 IDE 远程调试配置

JVM 的远程调试能力是本书实验中极为重要的一环。通过远程调试，你可以在 IDE 中设置断点、单步执行、观察变量值，而目标 Java 进程却在容器内运行。这让理解 JVM 内部行为变得直观而高效。

### 1.6.1 理解 JDWP

JDWP（Java Debug Wire Protocol）是 JVM 提供的调试协议。要让 JVM 应用支持远程调试，需要在启动时添加以下参数：

```
-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
```

各参数含义：

| 参数 | 含义 |
|------|------|
| `transport=dt_socket` | 使用 Socket 方式传输调试数据 |
| `server=y` | 当前 JVM 作为调试服务器 |
| `suspend=n` | 不等待调试器连接就启动应用（设为 `y` 则会等待调试器连接后才开始执行）|
| `address=*:5005` | 监听所有网络接口的 5005 端口 |

请注意 `address=*:5005` 中的 `*`。从 JDK 9 开始，默认只监听 localhost。在容器场景下，调试器从容器外部连接，所以必须显式指定 `*` 以监听所有网络接口。docker-compose.yml 中已经将容器的 5005 端口映射到了宿主机，所以你的 IDE 可以通过 `localhost:5005` 连接到容器内的 JVM 进程。

### 1.6.2 IntelliJ IDEA 配置

如果你是 IntelliJ IDEA 用户，请按以下步骤配置远程调试：

1. 打开菜单 **Run** > **Edit Configurations...**
2. 点击左上角的 **+** 号，选择 **Remote JVM Debug**
3. 配置以下参数：
   - **Name**：`jvm-lab (Remote Debug)`
   - **Host**：`localhost`
   - **Port**：`5005`
   - **Use module classpath**：选择 `ch01-environment`
4. IDEA 会自动生成命令行参数，你应该能看到类似上面 JDWP 格式的配置
5. 点击 **OK** 保存

使用方式：

1. 在 HelloJVM.java 中设置断点（点击行号右侧的灰色区域）
2. 在容器内启动带调试参数的 Java 进程。例如：
   ```bash
   java -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:5005 \
        -cp target/classes com.jvmbook.ch01.HelloJVM
   ```
   注意这里 `suspend=y`，表示 JVM 会在启动时暂停，等待调试器连接。
3. 在 IDEA 中点击 **Run** > **Debug 'jvm-lab (Remote Debug)'**（或点击工具栏上的 Debug 按钮）
4. IDEA 连接到 JVM 后，程序会在 main 方法入口处暂停（由于我们设了断点）
5. 你可以单步执行（F8）、步入方法（F7）、查看变量值等

> **警告**：如果遇到"Connection refused"错误，请检查：容器是否正在运行？端口映射是否正确？JDWP 地址是否配置为 `*:5005` 而不是 `localhost:5005`？

### 1.6.3 VS Code 配置

VS Code 用户需要先安装 **Extension Pack for Java**（包含 Debugger for Java 扩展），然后在 `.vscode/launch.json` 中添加如下配置：

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "java",
            "name": "Remote Debug (jvm-lab)",
            "request": "attach",
            "hostName": "localhost",
            "port": 5005
        }
    ]
}
```

使用方法与 IntelliJ IDEA 类似：设置断点后，执行 F5 启动调试。

---

## 1.7 第一个 JVM 命令：jcmd

`jcmd` 是 JDK 内置的诊断工具，它可以向运行中的 JVM 发送诊断命令。相比于 `jstack`、`jmap`、`jinfo` 等传统工具，`jcmd` 是一个"瑞士军刀"式的统一入口——它不仅涵盖了上述工具的大部分功能，还提供了许多额外的诊断能力。

### 1.7.1 查找 JVM 进程

首先，启动 HelloJVM 程序（可以保持它在容器前台运行，或者在后台运行）：

```bash
# 在容器内执行
cd /workspace/cases/ch01-environment
mvn compile
java -cp target/classes com.jvmbook.ch01.HelloJVM &
```

`&` 符号让程序在后台运行。现在，使用 `jcmd` 列出所有 JVM 进程：

```bash
jcmd -l
```

输出类似：

```
123 jdk.jcmd/sun.tools.jcmd.JCmd -l
456 com.jvmbook.ch01.HelloJVM
```

第一列是进程 ID（PID），第二列是进程的描述信息。`456` 就是我们刚刚启动的 HelloJVM 程序。

### 1.7.2 查看 JVM 版本信息

```bash
jcmd 456 VM.version
```

输出示例：

```
456:
OpenJDK 64-Bit Server VM version 21.0.2+13-LTS
JDK 21.0.2
```

### 1.7.3 查看 JVM 启动参数

使用 `VM.flags` 命令查看 JVM 的启动标志：

```bash
jcmd 456 VM.flags
```

输出示例：

```
456:
-XX:CICompilerCount=4 -XX:InitialHeapSize=268435456 ...
```

这些标志反映了 JVM 的当前配置，包括堆大小、垃圾回收器选择、编译线程数等关键参数。在后续章节中，我们会在启动 Java 程序时添加各种 JVM 参数，然后用这个命令验证它们是否生效。

### 1.7.4 获取帮助

`jcmd` 支持通过 `help` 命令查看某个特定进程可用的所有诊断命令：

```bash
jcmd 456 help
```

你会看到非常多的命令，涵盖线程分析（`Thread.print`）、堆转储（`GC.heap_dump`）、系统属性（`VM.system_properties`）、JFR 记录（`JFR.start`）等。本书后面的章节会逐一深入这些命令的使用。

要查看某个命令的具体用法：

```bash
jcmd 456 help GC.heap_dump
```

### 1.7.5 jcmd 核心命令速查

以下是 `jcmd` 中最常用的命令，建议你在阅读后续章节前先熟悉它们：

| 命令 | 功能 | 对应章节 |
|------|------|---------|
| `VM.version` | 查看 JVM 版本 | 本章 |
| `VM.flags` | 查看 JVM 启动标志 | 本章 |
| `VM.uptime` | 查看 JVM 运行时间 | 第 7 章 |
| `VM.system_properties` | 查看系统属性 | 第 6 章 |
| `Thread.print` | 打印线程栈 | 第 6、10 章 |
| `GC.heap_dump` | 生成堆转储 | 第 7 章 |
| `GC.class_histogram` | 查看类统计 | 第 6 章 |
| `GC.run` / `GC.run_finalization` | 触发 GC | 第 8 章 |
| `JFR.start` / `JFR.dump` | JFR 记录控制 | 第 2 章 |
| `VM.native_memory` | 查看本地内存 | 第 7 章 |

---

## 1.8 案例项目结构总览

本书的所有实验案例组织在 `jvm-lab/cases/` 目录下，每个章节对应一个 Maven 子模块。在完成本章的环境搭建后，你将拥有以下目录结构：

```
jvm-lab/
├── docker-compose.yml          # Docker Compose 配置文件
├── Dockerfile                  # Docker 镜像构建文件
├── scripts/
│   ├── build.sh                # 构建所有模块
│   └── benchmark.sh            # 性能测试脚本
└── cases/
    ├── pom.xml                 # 父 POM，聚合所有子模块
    ├── ch01-environment/       # [本章] 环境验证
    ├── ch02-jfr/               # 第2章 JFR & JMC
    ├── ch03-async-profiler/    # 第3章 async-profiler
    ├── ch04-arthas/            # 第4章 Arthas
    ├── ch05-jmh/               # 第5章 JMH 微基准测试
    ├── ch06-classloader/       # 第6章 类加载机制
    ├── ch07-oom/               # 第7章 内存溢出分析
    ├── ch08-gc/                # 第8章 GC 调优
    ├── ch09-jit/               # 第9章 JIT 编译
    └── ch10-concurrency/       # 第10章 并发与锁
```

每个子模块都是一个独立的 Maven 项目，继承自父 POM `jvm-cases`。父 POM 配置了统一的 JDK 版本（21）、编译选项（启用预览特性 `--enable-preview`）以及公共依赖（JUnit Jupiter）。

在本书的后续章节中，我们按照以下路径进入各个实验模块：

```bash
# 进入容器后
cd /workspace/cases/ch0X-<module-name>
```

每个模块都可以独立编译和运行，彼此之间没有依赖关系。你可以根据自己的兴趣选择任意章节开始实验，不必严格按章节顺序进行。

---

## 总结

在本章中，我们完成了以下工作：

1. **理解了 Docker 的核心概念**：镜像、容器、Volume 和端口映射，掌握了它们在实验环境中的作用
2. **逐行解读了 Dockerfile**：理解了每个指令（FROM、ENV、RUN、COPY、WORKDIR、CMD）的作用，以及镜像中预装了哪些工具
3. **分析了 docker-compose.yml 配置**：了解了 Volume 挂载、端口映射、cap_add 等配置项的含义
4. **启动并进入了实验容器**：使用 `docker compose up -d` 和 `docker compose exec` 操作容器
5. **配置了 IDE 远程调试**：在 IntelliJ IDEA 和 VS Code 中配置了 Remote JVM Debug，为后续调试 JVM 行为做好准备
6. **运行了第一个 JVM 诊断命令**：使用 `jcmd` 查看了 JVM 的版本信息和启动参数
7. **了解了全书案例的项目结构**：掌握了实验代码的组织方式

从下一章开始，我们将正式进入 JVM 性能分析的世界，首先学习 JFR（Java Flight Recorder）和 JMC（Java Mission Control）——这是 Oracle 官方提供的两把性能分析"利器"。

---

## 扩展阅读

- Docker 官方文档：https://docs.docker.com/
- Eclipse Temurin（Adoptium）JDK：https://adoptium.net/
- Apache Maven 官方文档：https://maven.apache.org/guides/
- JDWP 协议规范：https://docs.oracle.com/javase/8/docs/technotes/guides/jpda/jdwp-spec.html
- `jcmd` 使用指南：https://docs.oracle.com/en/java/javase/21/docs/specs/man/jcmd.html
