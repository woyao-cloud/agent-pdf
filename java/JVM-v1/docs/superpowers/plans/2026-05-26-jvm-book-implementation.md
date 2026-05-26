# 《深入理解 Java 虚拟机》实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成一本约 420 页的《深入理解 Java 虚拟机》技术书籍，包含实验环境、13 章正文、4 个附录，以及所有配套案例代码。

**Architecture:** 三篇式结构——工具篇（Ch1-5）、JVM 子系统与专项案例篇（Ch6-10）、综合大案例篇（Ch11-13）。每章包含文稿（Markdown）+ 案例代码（Java/Maven）。实验环境通过 Docker 容器化提供，docker compose 一键启动。

**Tech Stack:** JDK 21 (Eclipse Temurin), Docker + docker compose, Maven, JFR (内置), async-profiler v3.x, Arthas, JMH, Spring Boot 3.x, wrk/k6

---

## Phase 0: 项目脚手架与实验环境

### Task 0.1: 创建目录结构

**Files:**
- Create: `D:\学习\大模型\pdf\java\JVM-v1\jvm-lab\docker-compose.yml`
- Create: `D:\学习\大模型\pdf\java\JVM-v1\jvm-lab\Dockerfile`
- Create: `D:\学习\大模型\pdf\java\JVM-v1\jvm-lab\scripts\build.sh`
- Create: `D:\学习\大模型\pdf\java\JVM-v1\jvm-lab\scripts\benchmark.sh`
- Create: `D:\学习\大模型\pdf\java\JVM-v1\jvm-lab\cases\pom.xml`
- Create: `D:\学习\大模型\pdf\java\JVM-v1\manuscript\README.md`

- [ ] **Step 1: 创建目录结构**

```bash
cd "D:\学习\大模型\pdf\java\JVM-v1"
mkdir -p jvm-lab/cases/{ch02-jfr,ch03-async-profiler,ch04-arthas,ch05-jmh,ch06-classloader,ch07-oom,ch08-gc,ch09-jit,ch10-concurrency,comprehensive/{case01-order,case02-gateway,case03-bigmem}}
mkdir -p jvm-lab/scripts
mkdir -p manuscript/{part-01-tools,part-02-jvm-subsystems,part-03-comprehensive,appendices}
```

- [ ] **Step 2: 编写 Dockerfile**

文件：`jvm-lab/Dockerfile`

```dockerfile
FROM ubuntu:22.04

ENV JAVA_HOME=/opt/jdk-21
ENV PATH=$JAVA_HOME/bin:$PATH
ENV MAVEN_HOME=/opt/maven
ENV PATH=$MAVEN_HOME/bin:$PATH

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git unzip zip build-essential \
    numactl linux-tools-common linux-tools-generic \
    && rm -rf /var/lib/apt/lists/*

# Install JDK 21 (Eclipse Temurin)
RUN curl -L -o /tmp/jdk.tar.gz \
    https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_linux_hotspot_21.0.2_13.tar.gz \
    && tar -xzf /tmp/jdk.tar.gz -C /opt/ \
    && mv /opt/jdk-21.0.2+13 $JAVA_HOME \
    && rm /tmp/jdk.tar.gz

# Install Maven
RUN curl -L -o /tmp/maven.tar.gz \
    https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz \
    && tar -xzf /tmp/maven.tar.gz -C /opt/ \
    && mv /opt/apache-maven-3.9.9 $MAVEN_HOME \
    && rm /tmp/maven.tar.gz

# Install async-profiler
RUN curl -L -o /tmp/async-profiler.tar.gz \
    https://github.com/async-profiler/async-profiler/releases/download/v3.0/async-profiler-3.0-linux-x64.tar.gz \
    && tar -xzf /tmp/async-profiler.tar.gz -C /opt/ \
    && mv /opt/async-profiler-3.0 /opt/async-profiler \
    && rm /tmp/async-profiler.tar.gz
ENV PATH=/opt/async-profiler/bin:$PATH

# Install Arthas
RUN curl -L -o /opt/arthas-boot.jar \
    https://arthas.aliyun.com/arthas-boot.jar

# Install wrk
RUN git clone https://github.com/wg/wrk.git /tmp/wrk \
    && cd /tmp/wrk && make -j$(nproc) \
    && cp wrk /usr/local/bin/wrk \
    && rm -rf /tmp/wrk

# Install k6
RUN curl -L -o /tmp/k6.tar.gz \
    https://github.com/grafana/k6/releases/download/v0.50.0/k6-v0.50.0-linux-amd64.tar.gz \
    && tar -xzf /tmp/k6.tar.gz -C /opt/ \
    && mv /opt/k6-v0.50.0-linux-amd64 /opt/k6 \
    && ln -s /opt/k6/k6 /usr/local/bin/k6 \
    && rm /tmp/k6.tar.gz

WORKDIR /workspace
COPY cases /workspace/cases
COPY scripts /workspace/scripts
RUN chmod +x /workspace/scripts/*.sh

# Verify installations
RUN java -version && mvn -version && wrk --version && k6 version

CMD ["bash"]
```

- [ ] **Step 3: 编写 docker-compose.yml**

文件：`jvm-lab/docker-compose.yml`

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

- [ ] **Step 4: 编写 cases/pom.xml （多模块 Maven 项目）**

文件：`jvm-lab/cases/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.jvmbook</groupId>
    <artifactId>jvm-cases</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>pom</packaging>

    <modules>
        <module>ch02-jfr</module>
        <module>ch03-async-profiler</module>
        <module>ch04-arthas</module>
        <module>ch05-jmh</module>
        <module>ch06-classloader</module>
        <module>ch07-oom</module>
        <module>ch08-gc</module>
        <module>ch09-jit</module>
        <module>ch10-concurrency</module>
    </modules>

    <properties>
        <maven.compiler.source>21</maven.compiler.source>
        <maven.compiler.target>21</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <spring-boot.version>3.2.5</spring-boot.version>
        <jmh.version>1.37</jmh.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-dependencies</artifactId>
                <version>${spring-boot.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <dependencies>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.12.1</version>
                <configuration>
                    <source>21</source>
                    <target>21</target>
                    <compilerArgs>
                        <arg>--enable-preview</arg>
                    </compilerArgs>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 5: 编写辅助脚本**

文件：`jvm-lab/scripts/build.sh`

```bash
#!/bin/bash
cd /workspace/cases
mvn clean package -DskipTests
echo "Build complete."
```

文件：`jvm-lab/scripts/benchmark.sh`

```bash
#!/bin/bash
# Usage: benchmark.sh <target-url> <duration-sec>
wrk -t4 -c100 -d${2:-30}s --latency $1
```

- [ ] **Step 6: 构建并验证 Docker 环境能正常启动**

```bash
cd "D:\学习\大模型\pdf\java\JVM-v1\jvm-lab"
docker compose build
docker compose run --rm jvm-lab java -version
docker compose run --rm jvm-lab mvn -version
docker compose run --rm jvm-lab profiler.sh --version
```

预期：各工具版本号正确打印，无错误信息。

- [ ] **Step 7: 初始化 Git 并提交**

```bash
cd "D:\学习\大模型\pdf\java\JVM-v1"
git init
git add -A
git commit -m "chore: scaffold project structure and Docker environment"
```

---

## Phase 1: 第一篇——实验环境与工具链（Ch1-Ch5）

### Task 1.1: 第 1 章——实验环境搭建

**Files:**
- Create: `manuscript/part-01-tools/ch01-environment.md`
- Create: `jvm-lab/cases/ch01-environment/pom.xml`
- Create: `jvm-lab/cases/ch01-environment/src/main/java/com/jvmbook/ch01/HelloJVM.java`

- [ ] **Step 1: 创建第 1 章案例代码**

文件：`jvm-lab/cases/ch01-environment/src/main/java/com/jvmbook/ch01/HelloJVM.java`

```java
package com.jvmbook.ch01;

public class HelloJVM {
    public static void main(String[] args) {
        var rt = Runtime.getRuntime();
        System.out.println("=== JVM Environment ===");
        System.out.println("Java Version: " + System.getProperty("java.version"));
        System.out.println("JVM Name: " + System.getProperty("java.vm.name"));
        System.out.println("JVM Vendor: " + System.getProperty("java.vm.vendor"));
        System.out.println("Max Memory: " + (rt.maxMemory() / 1024 / 1024) + " MB");
        System.out.println("Total Memory: " + (rt.totalMemory() / 1024 / 1024) + " MB");
        System.out.println("Free Memory: " + (rt.freeMemory() / 1024 / 1024) + " MB");
        System.out.println("Available Processors: " + rt.availableProcessors());
        System.out.println("=== JCMD Check ===");
        System.out.println("Run: jcmd " + ProcessHandle.current().pid() + " VM.version");
    }
}
```

文件：`jvm-lab/cases/ch01-environment/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch01-environment</artifactId>
</project>
```

- [ ] **Step 2: 在 Docker 中验证 HelloJVM 能正确运行**

```bash
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch01-environment -am && java --enable-preview -cp ch01-environment/target/classes com.jvmbook.ch01.HelloJVM"
```

预期：打印 JDK 版本、JVM 厂商、内存信息等。

- [ ] **Step 3: 撰写第 1 章文稿**（~20 页内容）

文件：`manuscript/part-01-tools/ch01-environment.md`

文稿包含以下内容（3000-5000 字 + 代码/命令示例）：
1. Docker 基础概念（镜像、容器、Volume、端口映射）
2. Dockerfile 逐行解读（FROM、ENV、RUN、COPY、WORKDIR、CMD）
3. docker-compose.yml 解读（services、volumes、ports、cap_add）
4. 启动环境：`docker compose up -d`
5. 进入容器：`docker compose exec jvm-lab bash`
6. IDE 远程调试配置（IntelliJ Remote JVM Debug, port 5005）
7. 第一个 JVM 命令：`jcmd <pid> VM.version`、`jcmd <pid> VM.flags`
8. 案例项目结构总览

- [ ] **Step 4: 提交**

```bash
git add manuscript/part-01-tools/ch01-environment.md jvm-lab/cases/ch01-environment/
git commit -m "feat: chapter 1 - environment setup with Docker and first JVM commands"
```

### Task 1.2: 第 2 章——JFR 与 JMC

**Files:**
- Create: `manuscript/part-01-tools/ch02-jfr.md`
- Create: `jvm-lab/cases/ch02-jfr/pom.xml`
- Create: `jvm-lab/cases/ch02-jfr/src/main/java/com/jvmbook/ch02/GcSimulator.java`

- [ ] **Step 1: 创建 JFR 演示案例代码**

文件：`jvm-lab/cases/ch02-jfr/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch02-jfr</artifactId>
</project>
```

文件：`jvm-lab/cases/ch02-jfr/src/main/java/com/jvmbook/ch02/GcSimulator.java`

```java
package com.jvmbook.ch02;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class GcSimulator {
    private static final List<byte[]> CACHE = new ArrayList<>();
    private static final Random RANDOM = new Random();

    // Simulate GC pressure by allocating and partially retaining objects
    public static void main(String[] args) throws Exception {
        System.out.println("GC Simulator started. PID: " + ProcessHandle.current().pid());
        System.out.println("Recording JFR events. Use jcmd to dump when ready.");
        int cycle = 0;
        while (true) {
            // Allocate burst — 10 MB per cycle
            for (int i = 0; i < 10; i++) {
                byte[] chunk = new byte[1024 * 1024]; // 1 MB
                RANDOM.nextBytes(chunk);
                // Keep ~30% of allocations to simulate memory pressure
                if (i % 3 == 0) {
                    CACHE.add(chunk);
                }
            }
            // Periodically clear half the cache to generate GC activity
            if (++cycle % 5 == 0) {
                int retain = CACHE.size() / 2;
                CACHE.subList(0, retain).clear();
                System.out.println("Cycle " + cycle + ": trimmed cache, size=" + CACHE.size());
            }
            if (cycle % 10 == 0) {
                System.gc(); // Suggest GC to create mixed GC events
                System.out.println("Cycle " + cycle + ": System.gc() called");
            }
            Thread.sleep(500);
        }
    }
}
```

- [ ] **Step 2: 编写 JFR 录制/转储脚本**

文件：`jvm-lab/scripts/jfr-demo.sh`

```bash
#!/bin/bash
# Usage: ./jfr-demo.sh <pid> <duration-sec>
PID=$1
DURATION=${2:-60}
OUTPUT="/workspace/cases/ch02-jfr/recording.jfr"

echo "Starting JFR recording for PID=$PID, duration=${DURATION}s"
jcmd "$PID" JFR.start name=demo duration="${DURATION}s" filename="$OUTPUT" settings=profile
echo "Recording will be saved to $OUTPUT"

# Alternative: manual dump approach
echo ""
echo "Or use manual control:"
echo "  jcmd $PID JFR.start name=demo settings=profile"
echo "  sleep $DURATION"
echo "  jcmd $PID JFR.dump name=demo filename=$OUTPUT"
echo "  jcmd $PID JFR.stop name=demo"
```

- [ ] **Step 3: 验证 JFR 录制在 Docker 中正常工作**

```bash
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch02-jfr -am && java --enable-preview -cp ch02-jfr/target/classes com.jvmbook.ch02.GcSimulator &  sleep 10 && jcmd $(pgrep -f GcSimulator) JFR.start name=demo duration=30s filename=/workspace/cases/ch02-jfr/recording.jfr settings=profile && sleep 35 && ls -lh /workspace/cases/ch02-jfr/recording.jfr && kill %1"
```

预期：生成的 recording.jfr 文件存在且大小 > 100KB。

- [ ] **Step 4: 撰写第 2 章文稿**（~20 页）

文件：`manuscript/part-01-tools/ch02-jfr.md`

内容：
1. JFR 架构：事件类型（即时事件、持续事件、采样事件）、环形缓冲区、转储机制
2. 启用方式：`-XX:StartFlightRecording` 启动参数、jcmd 动态开启、Docker 中的 `JAVA_OPTS` 配置
3. JDK 21 JFR 新增事件：虚拟线程事件、GC 阶段细分
4. JMC GUI 核心视图：飞行记录器文件打开、内存/Method Profiling/GC/线程/异常/VM 操作
5. 持续记录策略：`-XX:FlightRecorderOptions=defaultrecording=true`
6. **专项案例：** 用 JFR 抓取 GcSimulator 的 GC 停顿事件，从录制到分析全流程
   - jcmd 启动录制
   - 等待 GC 发生
   - jcmd 转储录制文件
   - JMC 打开分析：GC 停顿时间、分配压力、对象类型分布

- [ ] **Step 5: 提交**

```bash
git add manuscript/part-01-tools/ch02-jfr.md jvm-lab/cases/ch02-jfr/ jvm-lab/scripts/jfr-demo.sh
git commit -m "feat: chapter 2 - JFR and JMC with GC simulation case"
```

### Task 1.3: 第 3 章——async-profiler 性能剖析

**Files:**
- Create: `manuscript/part-01-tools/ch03-async-profiler.md`
- Create: `jvm-lab/cases/ch03-async-profiler/pom.xml`
- Create: `jvm-lab/cases/ch03-async-profiler/src/main/java/com/jvmbook/ch03/CpuHotspotDemo.java`

- [ ] **Step 1: 创建 async-profiler 演示案例**

文件：`jvm-lab/cases/ch03-async-profiler/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch03-async-profiler</artifactId>
</project>
```

文件：`jvm-lab/cases/ch03-async-profiler/src/main/java/com/jvmbook/ch03/CpuHotspotDemo.java`

```java
package com.jvmbook.ch03;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class CpuHotspotDemo {
    private static final Random RANDOM = new Random();
    private static final List<Double> DATA = new ArrayList<>();

    public static void main(String[] args) throws Exception {
        System.out.println("CPU Hotspot Demo started. PID: " + ProcessHandle.current().pid());
        // async-profiler command:
        // profiler.sh -e cpu -d 60 -f /workspace/cases/ch03-async-profiler/flamegraph.html <PID>

        while (true) {
            double result = expensiveCalculation();
            DATA.add(result);
            if (DATA.size() > 100_000) {
                DATA.clear();
            }
            Thread.sleep(10);
        }
    }

    // Multiple methods with different CPU intensities to create visible flame graph tiers
    private static double expensiveCalculation() {
        double sum = 0;
        for (int i = 0; i < 1000; i++) {
            sum += heavyTrigOperation(i);
            sum += matrixMultiplication(i);
        }
        return sum;
    }

    private static double heavyTrigOperation(int seed) {
        double result = 0;
        for (int i = 0; i < 500; i++) {
            result += Math.sin(seed * i * 0.001) * Math.cos(seed * i * 0.002);
            result += Math.tan(seed * i * 0.003) * Math.sqrt(Math.abs(seed * i * 0.004));
        }
        return result;
    }

    private static double matrixMultiplication(int seed) {
        int size = 50;
        double[][] a = new double[size][size];
        double[][] b = new double[size][size];
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                a[i][j] = RANDOM.nextDouble();
                b[i][j] = RANDOM.nextDouble();
            }
        }
        double result = 0;
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                for (int k = 0; k < size; k++) {
                    result += a[i][k] * b[k][j];
                }
            }
        }
        return result;
    }
}
```

- [ ] **Step 2: 编写 async-profiler 脚本**

文件：`jvm-lab/scripts/profiler-demo.sh`

```bash
#!/bin/bash
# Usage: ./profiler-demo.sh <pid> <mode:cpu|alloc|wall> <duration-sec>
PID=$1
MODE=${2:-cpu}
DURATION=${3:-30}
OUTPUT_DIR="/workspace/cases/ch03-async-profiler"
OUTPUT_FILE="$OUTPUT_DIR/profile-${MODE}.html"

echo "Starting async-profiler (mode=$MODE) for PID=$PID, duration=${DURATION}s"
profiler.sh -e "$MODE" -d "$DURATION" -f "$OUTPUT_FILE" "$PID"
echo "Flame graph saved to $OUTPUT_FILE"
```

- [ ] **Step 3: 验证 async-profiler 能生成火焰图**

```bash
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch03-async-profiler -am && java -cp ch03-async-profiler/target/classes com.jvmbook.ch03.CpuHotspotDemo &  sleep 5 && profiler.sh -e cpu -d 15 -f /workspace/cases/ch03-async-profiler/flame-cpu.html \$(pgrep -f CpuHotspotDemo) && ls -lh /workspace/cases/ch03-async-profiler/flame-cpu.html && kill %1"
```

预期：flame-cpu.html 文件生成，大小 > 10KB（有效的火焰图）。

- [ ] **Step 4: 撰写第 3 章文稿**（~20 页）

文件：`manuscript/part-01-tools/ch03-async-profiler.md`

内容：
1. async-profiler 工作原理：AsyncGetCallTrace + perf_events
2. CPU 采样模式（`-e cpu`）：定位 CPU 密集方法
3. 分配采样模式（`-e alloc`）：定位高频对象分配点
4. Wall-Clock 模式（`-e wall`）：排查线程停滞、锁等待
5. 火焰图解读：栈帧层次、顶宽表示 CPU 消耗
6. Docker 环境注意事项：SYS_PTRACE、seccomp:unconfined、`-XX:+UsePerfData`
7. **专项案例：** 对 CpuHotspotDemo 采集 CPU 火焰图，识别 heavyTrigOperation 和 matrixMultiplication 是热点

- [ ] **Step 5: 提交**

```bash
git add manuscript/part-01-tools/ch03-async-profiler.md jvm-lab/cases/ch03-async-profiler/ jvm-lab/scripts/profiler-demo.sh
git commit -m "feat: chapter 3 - async-profiler and flame graph analysis"
```

### Task 1.4: 第 4 章——Arthas 在线诊断

**Files:**
- Create: `manuscript/part-01-tools/ch04-arthas.md`
- Create: `jvm-lab/cases/ch04-arthas/pom.xml`
- Create: `jvm-lab/cases/ch04-arthas/src/main/java/com/jvmbook/ch04/DeadlockDemo.java`

- [ ] **Step 1: 创建 Arthas 演示案例（死锁场景）**

文件：`jvm-lab/cases/ch04-arthas/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch04-arthas</artifactId>
</project>
```

文件：`jvm-lab/cases/ch04-arthas/src/main/java/com/jvmbook/ch04/DeadlockDemo.java`

```java
package com.jvmbook.ch04;

public class DeadlockDemo {
    private static final Object LOCK_A = new Object();
    private static final Object LOCK_B = new Object();

    public static void main(String[] args) throws Exception {
        System.out.println("Deadlock Demo started. PID: " + ProcessHandle.current().pid());
        System.out.println("Arthas command: java -jar /opt/arthas-boot.jar " + ProcessHandle.current().pid());

        Thread t1 = new Thread(() -> {
            synchronized (LOCK_A) {
                sleep(100);
                System.out.println("Thread-1: acquired LOCK_A, waiting for LOCK_B...");
                synchronized (LOCK_B) {
                    System.out.println("Thread-1: acquired both locks");
                }
            }
        }, "Worker-1");

        Thread t2 = new Thread(() -> {
            synchronized (LOCK_B) {
                sleep(100);
                System.out.println("Thread-2: acquired LOCK_B, waiting for LOCK_A...");
                synchronized (LOCK_A) {
                    System.out.println("Thread-2: acquired both locks");
                }
            }
        }, "Worker-2");

        t1.start();
        t2.start();
        t1.join();
        t2.join();
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
```

- [ ] **Step 2: 编写 Arthas 诊断脚本**

文件：`jvm-lab/scripts/arthas-demo.sh`

```bash
#!/bin/bash
# Usage: ./arthas-demo.sh <pid>
# Automatically runs Arthas commands to diagnose deadlock
PID=$1

echo "=== Arthas Deadlock Diagnosis ==="
echo "Target PID: $PID"

# Use arthas via pipe mode (non-interactive)
echo "thread -b" | java -jar /opt/arthas-boot.jar "$PID" &
sleep 5
kill %1 2>/dev/null
```

- [ ] **Step 3: 验证死锁可被 Arthas 检测**

```bash
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch04-arthas -am && java -cp ch04-arthas/target/classes com.jvmbook.ch04.DeadlockDemo &  sleep 3 && echo 'thread -b' | java -jar /opt/arthas-boot.jar \$(pgrep -f DeadlockDemo) 2>&1 || true && kill %1 2>/dev/null || true"
```

预期：Arthas 输出死锁信息，显示 Worker-1 和 Worker-2 互相等待。

- [ ] **Step 4: 撰写第 4 章文稿**（~20 页）

文件：`manuscript/part-01-tools/ch04-arthas.md`

内容：
1. Arthas 安装与启动方式、Dashboard 概览
2. 核心命令实战：
   - `thread` / `thread -b`：线程信息与死锁检测
   - `sc` / `sm`：搜索类和查看方法
   - `watch`：观测方法调用参数、返回值和异常
   - `tt`：时空隧道，记录方法调用的上下文
   - `ognl`：运行时表达式求值
   - `vmtool`：查看 JVM 内存对象
3. 无侵入排查流程
4. Arthas Tunnel Server 远程连接配置
5. **专项案例：** 用 Arthas `thread -b` 检测死锁，`watch` 监控方法耗时

- [ ] **Step 5: 提交**

```bash
git add manuscript/part-01-tools/ch04-arthas.md jvm-lab/cases/ch04-arthas/ jvm-lab/scripts/arthas-demo.sh
git commit -m "feat: chapter 4 - Arthas online diagnostics with deadlock detection"
```

### Task 1.5: 第 5 章——JMH 基准测试

**Files:**
- Create: `manuscript/part-01-tools/ch05-jmh.md`
- Create: `jvm-lab/cases/ch05-jmh/pom.xml`
- Create: `jvm-lab/cases/ch05-jmh/src/main/java/com/jvmbook/ch05/ListBenchmark.java`

- [ ] **Step 1: 创建 JMH 基准测试案例**

文件：`jvm-lab/cases/ch05-jmh/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch05-jmh</artifactId>

    <dependencies>
        <dependency>
            <groupId>org.openjdk.jmh</groupId>
            <artifactId>jmh-core</artifactId>
            <version>${jmh.version}</version>
        </dependency>
        <dependency>
            <groupId>org.openjdk.jmh</groupId>
            <artifactId>jmh-generator-annprocess</artifactId>
            <version>${jmh.version}</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.5.1</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals><goal>shade</goal></goals>
                        <configuration>
                            <transformers>
                                <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">
                                    <mainClass>org.openjdk.jmh.Main</mainClass>
                                </transformer>
                            </transformers>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

文件：`jvm-lab/cases/ch05-jmh/src/main/java/com/jvmbook/ch05/ListBenchmark.java`

```java
package com.jvmbook.ch05;

import org.openjdk.jmh.annotations.*;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@BenchmarkMode(Mode.Throughput)
@OutputTimeUnit(TimeUnit.SECONDS)
@State(Scope.Thread)
@Warmup(iterations = 3, time = 2)
@Measurement(iterations = 5, time = 3)
@Fork(1)
public class ListBenchmark {

    @Param({"1000", "10000"})
    private int size;

    private List<String> arrayList;
    private List<String> linkedList;

    @Setup
    public void setup() {
        arrayList = new ArrayList<>();
        linkedList = new LinkedList<>();
        for (int i = 0; i < size; i++) {
            String val = "item-" + i;
            arrayList.add(val);
            linkedList.add(val);
        }
    }

    @Benchmark
    public String arrayListGet() {
        return arrayList.get(size / 2);
    }

    @Benchmark
    public String linkedListGet() {
        return linkedList.get(size / 2);
    }

    @Benchmark
    public int arrayListIterate() {
        int sum = 0;
        for (String s : arrayList) {
            sum += s.length();
        }
        return sum;
    }

    @Benchmark
    public int linkedListIterate() {
        int sum = 0;
        for (String s : linkedList) {
            sum += s.length();
        }
        return sum;
    }

    @TearDown
    public void tearDown() {
        arrayList = null;
        linkedList = null;
    }
}
```

- [ ] **Step 2: 在 Docker 中运行 JMH 基准测试**

```bash
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn package -pl ch05-jmh -am && java -jar ch05-jmh/target/ch05-jmh-1.0-SNAPSHOT.jar -f 1 -wi 2 -i 3"
```

预期：输出 benchmark 结果，ArrayList.get 远快于 LinkedList.get，迭代性能接近。

- [ ] **Step 3: 撰写第 5 章文稿**（~20 页）

文件：`manuscript/part-01-tools/ch05-jmh.md`

内容：
1. JMH 核心概念：@Benchmark、@BenchmarkMode（Throughput/AverageTime）、@State（Scope.Thread/Scope.Benchmark）、@Warmup/@Measurement
2. 防编译器优化：Blackhole（消费返回值）、@CompilerControl
3. 常见陷阱：循环优化、死代码消除、常量折叠、分叉 Fork
4. JMH 结果解读：吞吐量（ops/s）、平均时间、百分位延迟、分数
5. **专项案例：** ArrayList vs LinkedList 随机访问和迭代性能对比

- [ ] **Step 4: 提交**

```bash
git add manuscript/part-01-tools/ch05-jmh.md jvm-lab/cases/ch05-jmh/
git commit -m "feat: chapter 5 - JMH benchmarking with list performance comparison"
```

---

## Phase 2: 第二篇——JVM 子系统与专项案例（Ch6-Ch10）

### Task 2.1: 第 6 章——类加载机制与调优

**Files:**
- Create: `manuscript/part-02-jvm-subsystems/ch06-classloader.md`
- Create: `jvm-lab/cases/ch06-classloader/pom.xml`
- Create: `jvm-lab/cases/ch06-classloader/src/main/java/com/jvmbook/ch06/NoSuchMethodDemo.java`
- Create: `jvm-lab/cases/ch06-classloader/src/main/java/com/jvmbook/ch06/HotDeployClassLoader.java`

- [ ] **Step 1: 创建类加载案例代码**

文件：`jvm-lab/cases/ch06-classloader/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch06-classloader</artifactId>
</project>
```

文件：`jvm-lab/cases/ch06-classloader/src/main/java/com/jvmbook/ch06/NoSuchMethodDemo.java`

```java
package com.jvmbook.ch06;

import java.lang.reflect.Method;

public class NoSuchMethodDemo {
    public static void main(String[] args) throws Exception {
        System.out.println("=== NoSuchMethodError Simulation ===");
        System.out.println("PID: " + ProcessHandle.current().pid());
        System.out.println("Run: jcmd " + ProcessHandle.current().pid() + " VM.classloaders");
        System.out.println("Run: jcmd " + ProcessHandle.current().pid() + " GC.class_stats");

        // Simulate: two versions of the same class loaded from different classloaders
        ClassLoader parent = NoSuchMethodDemo.class.getClassLoader();
        // Child classloader that delegates to parent but can isolate
        ClassLoader child = new java.net.URLClassLoader(
            new java.net.URL[]{((java.net.URLClassLoader)parent).getURLs()[0]},
            parent
        );

        // Load the same class with different classloaders
        Class<?> clazz1 = Class.forName("com.jvmbook.ch06.DemoService");
        Class<?> clazz2 = Class.forName("com.jvmbook.ch06.DemoService", true, child);

        System.out.println("Class 1 loader: " + clazz1.getClassLoader());
        System.out.println("Class 2 loader: " + clazz2.getClassLoader());

        // Check method availability
        for (Method m : clazz1.getMethods()) {
            if (m.getName().startsWith("process")) {
                System.out.println("Class 1 has: " + m);
            }
        }
        for (Method m : clazz2.getMethods()) {
            if (m.getName().startsWith("process")) {
                System.out.println("Class 2 has: " + m);
            }
        }
    }
}
```

文件：`jvm-lab/cases/ch06-classloader/src/main/java/com/jvmbook/ch06/DemoService.java`

```java
package com.jvmbook.ch06;

public class DemoService {
    public String processV1(String input) {
        return "V1: " + input;
    }

    // Simulate an API evolution: V2 adds a new overload
    // public String processV1(String input, boolean flag) {
    //     return "V1-flag: " + input + " " + flag;
    // }
}
```

文件：`jvm-lab/cases/ch06-classloader/src/main/java/com/jvmbook/ch06/HotDeployClassLoader.java`

```java
package com.jvmbook.ch06;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class HotDeployClassLoader extends ClassLoader {
    private final Path classesDir;

    public HotDeployClassLoader(Path classesDir, ClassLoader parent) {
        super(parent);
        this.classesDir = classesDir;
    }

    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
        String fileName = name.replace('.', '/') + ".class";
        Path classFile = classesDir.resolve(fileName);
        if (Files.exists(classFile)) {
            try {
                byte[] bytes = Files.readAllBytes(classFile);
                return defineClass(name, bytes, 0, bytes.length);
            } catch (IOException e) {
                throw new ClassNotFoundException(name, e);
            }
        }
        throw new ClassNotFoundException(name);
    }

    public static void main(String[] args) throws Exception {
        Path tmpDir = Paths.get("/workspace/cases/ch06-classloader/target/hotdeploy");
        Files.createDirectories(tmpDir);
        System.out.println("HotDeploy demo started. Watching: " + tmpDir);
        System.out.println("PID: " + ProcessHandle.current().pid());

        // Load initial version
        HotDeployClassLoader loader = new HotDeployClassLoader(tmpDir, ClassLoader.getSystemClassLoader());
        Class<?> clazz = loader.loadClass("com.jvmbook.ch06.HotDeployWorker");
        Object instance = clazz.getDeclaredConstructor().newInstance();
        Method executeMethod = clazz.getMethod("execute");
        System.out.println("Initial: " + executeMethod.invoke(instance));

        // Simulated "code change": recreate classloader to hot-reload
        // In practice, this would be triggered by file watcher
        loader = new HotDeployClassLoader(tmpDir, ClassLoader.getSystemClassLoader());
        clazz = loader.loadClass("com.jvmbook.ch06.HotDeployWorker");
        instance = clazz.getDeclaredConstructor().newInstance();
        executeMethod = clazz.getMethod("execute");
        System.out.println("After reload: " + executeMethod.invoke(instance));
    }
}
```

文件：`jvm-lab/cases/ch06-classloader/src/main/java/com/jvmbook/ch06/HotDeployWorker.java`

```java
package com.jvmbook.ch06;

public class HotDeployWorker {
    public String execute() {
        return "Version 1: Hello from HotDeployWorker";
    }
}
```

- [ ] **Step 2: 编译并验证类加载案例**

```bash
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch06-classloader -am && java -cp ch06-classloader/target/classes -XX:+TraceClassLoading com.jvmbook.ch06.NoSuchMethodDemo 2>&1 | head -50"
```

预期：打印类加载轨迹，显示 DemoService 的加载来源。

- [ ] **Step 3: 撰写第 6 章文稿**（~36 页）

文件：`manuscript/part-02-jvm-subsystems/ch06-classloader.md`

内容：
- 核心原理：类加载生命周期、双亲委派模型、打破双亲委派、JDK 9+ 模块化
- 案例 6-1：NoSuchMethodError 排查（依赖冲突、maven-enforcer-plugin）
- 案例 6-2：自定义 ClassLoader 实现热部署（文件监控触发 reload）

- [ ] **Step 4: 提交**

```bash
git add manuscript/part-02-jvm-subsystems/ch06-classloader.md jvm-lab/cases/ch06-classloader/
git commit -m "feat: chapter 6 - classloader mechanism and troubleshooting cases"
```

### Task 2.2: 第 7 章——内存管理与 OOM 排查

**Files:**
- Create: `manuscript/part-02-jvm-subsystems/ch07-memory.md`
- Create: `jvm-lab/cases/ch07-oom/pom.xml`
- Create: `jvm-lab/cases/ch07-oom/src/main/java/com/jvmbook/ch07/HeapLeakDemo.java`
- Create: `jvm-lab/cases/ch07-oom/src/main/java/com/jvmbook/ch07/StackOverflowDemo.java`
- Create: `jvm-lab/cases/ch07-oom/src/main/java/com/jvmbook/ch07/MetaspaceOomDemo.java`

- [ ] **Step 1: 创建 OOM 案例代码**

```java
// HeapLeakDemo.java
package com.jvmbook.ch07;

import java.lang.management.ManagementFactory;
import java.util.ArrayList;
import java.util.List;

public class HeapLeakDemo {
    private static final List<byte[]> LEAK = new ArrayList<>();

    public static void main(String[] args) throws Exception {
        System.out.println("Heap Leak Demo. PID: " + ProcessHandle.current().pid());
        System.out.println("JFR: jcmd " + ProcessHandle.current().pid() + " JFR.start name=heap-leak duration=120s filename=/workspace/cases/ch07-oom/heap-leak.jfr settings=profile");
        System.out.println("Heap dump: jcmd " + ProcessHandle.current().pid() + " GC.heap_dump /workspace/cases/ch07-oom/heap.hprof");
        try {
            while (true) {
                LEAK.add(new byte[1024 * 512]); // 512 KB per iteration
                Thread.sleep(50);
            }
        } catch (OutOfMemoryError e) {
            System.out.println("OOM caught after " + LEAK.size() + " allocations");
        }
    }
}
```

```java
// StackOverflowDemo.java
package com.jvmbook.ch07;

public class StackOverflowDemo {
    private static int depth = 0;

    public static void main(String[] args) {
        System.out.println("Stack Overflow Demo. PID: " + ProcessHandle.current().pid());
        System.out.println("Current -Xss: " + ManagementFactory.getRuntimeMXBean().getInputArguments().stream().filter(a -> a.contains("Xss")).findFirst().orElse("default (~1MB)"));
        try {
            recursiveCall();
        } catch (StackOverflowError e) {
            System.out.println("StackOverflowError at depth: " + depth);
        }
    }

    private static void recursiveCall() {
        depth++;
        if (depth % 10000 == 0) {
            System.out.println("Depth: " + depth);
        }
        recursiveCall(); // deliberate infinite recursion
    }
}
```

```java
// MetaspaceOomDemo.java
package com.jvmbook.ch07;

import net.sf.cglib.proxy.Enhancer;
import net.sf.cglib.proxy.NoOp;

public class MetaspaceOomDemo {
    public static void main(String[] args) {
        System.out.println("Metaspace OOM Demo. PID: " + ProcessHandle.current().pid());
        try {
            while (true) {
                Enhancer enhancer = new Enhancer();
                enhancer.setSuperclass(MetaspaceOomDemo.class);
                enhancer.setUseCache(false);
                enhancer.setCallback(NoOp.INSTANCE);
                enhancer.create();
            }
        } catch (Error e) {
            System.out.println("Error after creating proxies: " + e.getClass().getName());
        }
    }
}
```

- [ ] **Step 2: 添加 cglib 依赖到 ch07-oom/pom.xml**

文件：`jvm-lab/cases/ch07-oom/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch07-oom</artifactId>
    <dependencies>
        <dependency>
            <groupId>cglib</groupId>
            <artifactId>cglib</artifactId>
            <version>3.3.0</version>
        </dependency>
    </dependencies>
</project>
```

- [ ] **Step 3: 验证各 OOM 场景**

```bash
# 堆泄漏（限制堆大小确保 OOM）
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch07-oom -am && java -Xmx128m -cp ch07-oom/target/classes com.jvmbook.ch07.HeapLeakDemo"
预期：最终抛出 OutOfMemoryError: Java heap space

# 栈溢出
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && java -Xss256k -cp ch07-oom/target/classes com.jvmbook.ch07.StackOverflowDemo"
预期：在 depth ~2000 左右抛出 StackOverflowError
```

- [ ] **Step 4: 撰写第 7 章文稿**（~36 页）

内容：
- 核心原理：运行时数据区、对象分配流程、GC Roots、引用类型、JDK 21 String Dedup
- 案例 7-1：堆内存泄漏（ThreadLocal 未清理，MAT 分析）
- 案例 7-2：栈溢出（递归过深，-Xss 调整）
- 案例 7-3：元空间 OOM（CGLIB 动态代理不受控）

- [ ] **Step 5: 提交**

### Task 2.3: 第 8 章——GC 算法选择与调优

**Files:**
- Create: `manuscript/part-02-jvm-subsystems/ch08-gc.md`
- Create: `jvm-lab/cases/ch08-gc/pom.xml`
- Create: `jvm-lab/cases/ch08-gc/src/main/java/com/jvmbook/ch08/G1TuningDemo.java`
- Create: `jvm-lab/cases/ch08-gc/src/main/java/com/jvmbook/ch08/GcLogAnalyzer.java`

- [ ] **Step 1: 创建 GC 调优演示代码**

文件：`jvm-lab/cases/ch08-gc/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch08-gc</artifactId>
</project>
```

文件：`jvm-lab/cases/ch08-gc/src/main/java/com/jvmbook/ch08/G1TuningDemo.java`

```java
package com.jvmbook.ch08;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class G1TuningDemo {
    private static final List<byte[]> LIVE_DATA = new ArrayList<>();
    private static final Random RANDOM = new Random();

    public static void main(String[] args) throws Exception {
        System.out.println("G1 Tuning Demo. PID: " + ProcessHandle.current().pid());
        System.out.println("Simulating high-allocation service. Press Ctrl+C to stop.");
        System.out.println("GC log: -Xlog:gc*:file=/workspace/cases/ch08-gc/gc.log");

        // Keep ~500MB of live data to simulate a moderate-heap app
        while (true) {
            // Allocate 5 MB in varied-sized chunks
            for (int i = 0; i < 50; i++) {
                int size = 16 + RANDOM.nextInt(100) * 1024; // 16KB - 100KB
                LIVE_DATA.add(new byte[size]);
            }
            // Keep only 60% of allocations to create mixed GC pressure
            while (LIVE_DATA.size() > 10_000) {
                int remove = RANDOM.nextInt(LIVE_DATA.size());
                LIVE_DATA.set(remove, null);
            }
            LIVE_DATA.removeIf(x -> x == null);
            Thread.sleep(200);
        }
    }
}
```

文件：`jvm-lab/cases/ch08-gc/src/main/java/com/jvmbook/ch08/GcLogAnalyzer.java`

```java
package com.jvmbook.ch08;

import java.io.*;
import java.util.regex.*;

public class GcLogAnalyzer {
    // Parse G1 GC log lines into structured data
    private static final Pattern GC_PAUSE = Pattern.compile(
        "\\[GC pause \\(.*?\\) .*?([0-9.]+)ms"
    );

    public static void main(String[] args) throws Exception {
        String logFile = args.length > 0 ? args[0] : "/workspace/cases/ch08-gc/gc.log";
        BufferedReader reader = new BufferedReader(new FileReader(logFile));
        String line;
        int pauseCount = 0;
        double totalPause = 0;
        double maxPause = 0;

        while ((line = reader.readLine()) != null) {
            Matcher m = GC_PAUSE.matcher(line);
            if (m.find()) {
                double pause = Double.parseDouble(m.group(1));
                pauseCount++;
                totalPause += pause;
                maxPause = Math.max(maxPause, pause);
                System.out.printf("GC pause #%d: %.1fms%n", pauseCount, pause);
            }
        }
        reader.close();
        System.out.println("=== Summary ===");
        System.out.println("Total pauses: " + pauseCount);
        System.out.printf("Avg pause: %.1fms%n", totalPause / Math.max(1, pauseCount));
        System.out.printf("Max pause: %.1fms%n", maxPause);
    }
}
```

- [ ] **Step 2: 使用不同 GC 参数运行并对比**

```bash
# 默认 G1 参数
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch08-gc -am && timeout 30 java -Xmx1g -Xms1g -Xlog:gc*:file=/workspace/cases/ch08-gc/gc-default.log -cp ch08-gc/target/classes com.jvmbook.ch08.G1TuningDemo && java -cp ch08-gc/target/classes com.jvmbook.ch08.GcLogAnalyzer /workspace/cases/ch08-gc/gc-default.log"

# 调优后 G1 参数
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && timeout 30 java -Xmx1g -Xms1g -XX:G1HeapRegionSize=4m -XX:InitiatingHeapOccupancyPercent=70 -XX:G1MixedGCLiveThresholdPercent=85 -XX:MaxGCPauseMillis=50 -Xlog:gc*:file=/workspace/cases/ch08-gc/gc-tuned.log -cp ch08-gc/target/classes com.jvmbook.ch08.G1TuningDemo && java -cp ch08-gc/target/classes com.jvmbook.ch08.GcLogAnalyzer /workspace/cases/ch08-gc/gc-tuned.log"
```

预期：调优后最大 GC 停顿显著降低。

- [ ] **Step 3: 撰写第 8 章文稿**（~36 页）

内容：
- 核心原理：GC 演进路线、分代理论、STW vs 并发、不可能三角
- 案例 8-1：G1 停顿时间调优（IHOP、Region Size、Mixed GC 阈值）
- 案例 8-2：ZGC 大堆配置（ConcGCThreads、分配尖峰、NUMA、分代 ZGC）
- 案例 8-3：GC 日志分析与自动化告警（GCeasy、Prometheus + Grafana）

- [ ] **Step 4: 提交**

```bash
git add manuscript/part-02-jvm-subsystems/ch08-gc.md jvm-lab/cases/ch08-gc/
git commit -m "feat: chapter 8 - GC algorithm selection and tuning with G1/ZGC cases"
```

### Task 2.4: 第 9 章——JIT 编译优化

**Files:**
- Create: `manuscript/part-02-jvm-subsystems/ch09-jit.md`
- Create: `jvm-lab/cases/ch09-jit/pom.xml`
- Create: `jvm-lab/cases/ch09-jit/src/main/java/com/jvmbook/ch09/InlineFailureDemo.java`
- Create: `jvm-lab/cases/ch09-jit/src/main/java/com/jvmbook/ch09/EscapeAnalysisDemo.java`

- [ ] **Step 1: 创建 JIT 编译演示代码**

文件：`jvm-lab/cases/ch09-jit/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch09-jit</artifactId>
</project>
```

文件：`jvm-lab/cases/ch09-jit/src/main/java/com/jvmbook/ch09/InlineFailureDemo.java`

```java
package com.jvmbook.ch09;

public class InlineFailureDemo {
    public static void main(String[] args) throws Exception {
        System.out.println("Inline Failure Demo. PID: " + ProcessHandle.current().pid());
        System.out.println("Compilation log: -Xlog:jit+compilation*=debug:file=/workspace/cases/ch09-jit/compilation.log");
        System.out.println("PrintInlining: -XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining");

        Processor inlineProcessor = new InlineProcessor();
        Processor megamorphic1 = new InlineProcessor();
        Processor megamorphic2 = new InlineProcessor();
        Processor megamorphic3 = new InlineProcessor();

        long sum = 0;
        // Warmup: force JIT compilation
        for (int i = 0; i < 200_000; i++) {
            // Monomorphic dispatch — will be inlined
            sum += inlineProcessor.process(i);
            // Megamorphic dispatch — likely NOT inlined
            sum += processBimorphic(i % 2 == 0 ? megamorphic1 : megamorphic2, i);
        }
        System.out.println("Sum: " + sum);
    }

    private static int processBimorphic(Processor p, int input) {
        return p.process(input);
    }

    interface Processor {
        int process(int input);
    }

    static class InlineProcessor implements Processor {
        @Override
        public int process(int input) {
            return expensiveOp(input);
        }
    }

    private static int expensiveOp(int x) {
        int result = 0;
        for (int i = 0; i < 100; i++) {
            result += (x * i) ^ (x >> 2);
        }
        return result;
    }
}
```

文件：`jvm-lab/cases/ch09-jit/src/main/java/com/jvmbook/ch09/EscapeAnalysisDemo.java`

```java
package com.jvmbook.ch09;

public class EscapeAnalysisDemo {
    public static void main(String[] args) throws Exception {
        System.out.println("Escape Analysis Demo. PID: " + ProcessHandle.current().pid());
        System.out.println("Run with -XX:+PrintEscapeAnalysis to see analysis results");

        long sum = 0;
        for (int i = 0; i < 200_000; i++) {
            // Point is allocation that escapes the method — stays on heap
            sum += allocateEscaping(i);
            // Point2 is a scalar-replaceable candidate — stack allocated
            sum += allocateNonEscaping(i);
        }
        System.out.println("Sum: " + sum);
    }

    // Object is returned and escapes — requires heap allocation
    private static int allocateEscaping(int value) {
        Point p = new Point(value, value * 2);
        return p.x + p.y;
    }

    // Object never escapes — candidate for scalar replacement
    private static int allocateNonEscaping(int value) {
        Point p = new Point(value, value * 2);
        return p.x + p.y;
    }

    record Point(int x, int y) {}
}
```

- [ ] **Step 2: 运行并观察编译日志**

```bash
# 查看编译日志（内联决策）
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch09-jit -am && java -XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining -Xlog:jit+compilation*=debug:file=/workspace/cases/ch09-jit/compilation.log -cp ch09-jit/target/classes com.jvmbook.ch09.InlineFailureDemo 2>&1 | grep -E 'inline|InlineFailureDemo' | head -30"
```

预期：打印 JIT 内联决策，显示哪些方法被内联、哪些因多态分发未内联。

```bash
# 对比逃逸分析开启/关闭的性能差异
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch09-jit -am && time java -cp ch09-jit/target/classes com.jvmbook.ch09.EscapeAnalysisDemo"
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && time java -XX:-DoEscapeAnalysis -cp ch09-jit/target/classes com.jvmbook.ch09.EscapeAnalysisDemo"
```

预期：关闭逃逸分析后，由于堆分配增加，执行时间上升 20-50%。

- [ ] **Step 3: 撰写第 9 章文稿**（~36 页）

内容：
- 核心原理：解释 vs 编译、分层编译、热点检测、优化技术（内联/逃逸分析/锁消除）
- 案例 9-1：方法内联失效（多态接口导致内联失败，MaxInlineLevel/InlineSmallCode 调整）
- 案例 9-2：逃逸分析关闭后的性能回退（栈上分配失效→堆分配激增）

- [ ] **Step 4: 提交**

```bash
git add manuscript/part-02-jvm-subsystems/ch09-jit.md jvm-lab/cases/ch09-jit/
git commit -m "feat: chapter 9 - JIT compilation optimization with inline and escape analysis cases"
```

### Task 2.5: 第 10 章——并发与锁优化

**Files:**
- Create: `manuscript/part-02-jvm-subsystems/ch10-concurrency.md`
- Create: `jvm-lab/cases/ch10-concurrency/pom.xml`
- Create: `jvm-lab/cases/ch10-concurrency/src/main/java/com/jvmbook/ch10/LockContentionDemo.java`
- Create: `jvm-lab/cases/ch10-concurrency/src/main/java/com/jvmbook/ch10/VirtualThreadDemo.java`

- [ ] **Step 1: 创建并发演示代码**

文件：`jvm-lab/cases/ch10-concurrency/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>ch10-concurrency</artifactId>
</project>
```

文件：`jvm-lab/cases/ch10-concurrency/src/main/java/com/jvmbook/ch10/LockContentionDemo.java`

```java
package com.jvmbook.ch10;

import java.util.concurrent.*;
import java.util.concurrent.atomic.LongAdder;

public class LockContentionDemo {
    private static final int THREADS = 8;
    private static final int ITERATIONS = 1_000_000;

    public static void main(String[] args) throws Exception {
        System.out.println("Lock Contention Demo. PID: " + ProcessHandle.current().pid());

        // Warmup first
        runSynchronized();
        runStripedLock();
        runLockFree();

        // Measured run
        System.out.println("\n=== Benchmark Results ===");
        System.out.printf("synchronized: %d ms%n", measure(() -> runSynchronized()));
        System.out.printf("striped lock: %d ms%n", measure(() -> runStripedLock()));
        System.out.printf("lock-free:    %d ms%n", measure(() -> runLockFree()));
    }

    // Approach 1: Single synchronized map
    private static final ConcurrentHashMap<String, Long> SYNC_MAP = new ConcurrentHashMap<>();

    private static void runSynchronized() {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        for (int t = 0; t < THREADS; t++) {
            pool.submit(() -> {
                for (int i = 0; i < ITERATIONS; i++) {
                    String key = "key-" + (i % 1000);
                    synchronized (LockContentionDemo.class) {
                        SYNC_MAP.merge(key, 1L, Long::sum);
                    }
                }
            });
        }
        pool.shutdown();
        try { pool.awaitTermination(30, TimeUnit.SECONDS); } catch (InterruptedException e) {}
    }

    // Approach 2: Striped lock via ConcurrentHashMap compute
    private static final ConcurrentHashMap<String, LongAdder> STRIPED_MAP = new ConcurrentHashMap<>();

    private static void runStripedLock() {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        for (int t = 0; t < THREADS; t++) {
            pool.submit(() -> {
                for (int i = 0; i < ITERATIONS; i++) {
                    String key = "key-" + (i % 1000);
                    STRIPED_MAP.computeIfAbsent(key, k -> new LongAdder()).increment();
                }
            });
        }
        pool.shutdown();
        try { pool.awaitTermination(30, TimeUnit.SECONDS); } catch (InterruptedException e) {}
    }

    // Approach 3: Lock-free via LongAdder per thread + sum at end
    private static final LongAdder[] LOCK_FREE_COUNTERS = new LongAdder[THREADS];

    static { for (int i = 0; i < THREADS; i++) LOCK_FREE_COUNTERS[i] = new LongAdder(); }

    private static void runLockFree() {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        for (int t = 0; t < THREADS; t++) {
            int threadId = t;
            pool.submit(() -> {
                long sum = 0;
                for (int i = 0; i < ITERATIONS; i++) {
                    sum += (i % 1000);
                }
                LOCK_FREE_COUNTERS[threadId].add(sum);
            });
        }
        pool.shutdown();
        try { pool.awaitTermination(30, TimeUnit.SECONDS); } catch (InterruptedException e) {}
        long total = 0;
        for (LongAdder la : LOCK_FREE_COUNTERS) total += la.sum();
    }

    private static long measure(Runnable task) {
        long start = System.nanoTime();
        task.run();
        return (System.nanoTime() - start) / 1_000_000;
    }
}
```

文件：`jvm-lab/cases/ch10-concurrency/src/main/java/com/jvmbook/ch10/VirtualThreadDemo.java`

```java
package com.jvmbook.ch10;

import java.util.concurrent.*;
import java.util.stream.IntStream;

public class VirtualThreadDemo {
    private static final int TASK_COUNT = 10_000;

    public static void main(String[] args) throws Exception {
        System.out.println("Virtual Thread Demo. PID: " + ProcessHandle.current().pid());

        // Platform threads (fixed pool)
        long platformTime = measurePlatformThreads();
        // Virtual threads
        long virtualTime = measureVirtualThreads();

        System.out.println("\n=== Results (IO-bound tasks: 10ms simulated I/O each) ===");
        System.out.printf("Platform threads (100 pool): %d ms%n", platformTime);
        System.out.printf("Virtual threads:             %d ms%n", virtualTime);
        System.out.printf("Speedup: %.1fx%n", (double) platformTime / virtualTime);
    }

    private static long measurePlatformThreads() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(100);
        long start = System.nanoTime();
        CountDownLatch latch = new CountDownLatch(TASK_COUNT);
        IntStream.range(0, TASK_COUNT).forEach(i ->
            pool.submit(() -> {
                ioOperation();
                latch.countDown();
            })
        );
        latch.await(30, TimeUnit.SECONDS);
        pool.shutdown();
        return (System.nanoTime() - start) / 1_000_000;
    }

    private static long measureVirtualThreads() throws Exception {
        long start = System.nanoTime();
        CountDownLatch latch = new CountDownLatch(TASK_COUNT);
        IntStream.range(0, TASK_COUNT).forEach(i ->
            Thread.startVirtualThread(() -> {
                ioOperation();
                latch.countDown();
            })
        );
        latch.await(30, TimeUnit.SECONDS);
        return (System.nanoTime() - start) / 1_000_000;
    }

    private static void ioOperation() {
        try { Thread.sleep(10); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
```

- [ ] **Step 2: 编译并运行锁争用对比**

```bash
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn compile -pl ch10-concurrency -am && java -cp ch10-concurrency/target/classes com.jvmbook.ch10.LockContentionDemo"
```

预期：lock-free > striped lock > synchronized（按性能从高到低）。

- [ ] **Step 3: 运行虚拟线程对比**

```bash
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && java --enable-preview -cp ch10-concurrency/target/classes com.jvmbook.ch10.VirtualThreadDemo"
```

预期：虚拟线程在 IO 密集型场景下远快于固定线程池（10-50x）。

- [ ] **Step 4: 撰写第 10 章文稿**（~36 页）

内容：
- 核心原理：JMM、synchronized 演进、AQS、锁升级、虚拟线程
- 案例 10-1：线程转储分析死锁（jstack/Arthas thread -b）
- 案例 10-2：锁竞争导致吞吐下降（分段锁、LongAdder、无锁化对比）
- 案例 10-3：虚拟线程 vs 传统线程池（IO 密集型场景吞吐对比）

- [ ] **Step 5: 提交**

```bash
git add manuscript/part-02-jvm-subsystems/ch10-concurrency.md jvm-lab/cases/ch10-concurrency/
git commit -m "feat: chapter 10 - concurrency and lock optimization with virtual thread cases"
```

---

## Phase 3: 第三篇——综合大案例（Ch11-Ch13）

### Task 3.1: 第 11 章——高并发订单系统 GC 调优

**Files:**
- Create: `manuscript/part-03-comprehensive/ch11-order-system.md`
- Create: `jvm-lab/cases/comprehensive/case01-order/pom.xml`
- Create: `jvm-lab/cases/comprehensive/case01-order/src/main/java/com/jvmbook/case01/OrderApplication.java`
- Create: `jvm-lab/cases/comprehensive/case01-order/src/main/java/com/jvmbook/case01/OrderProcessor.java`
- Create: `jvm-lab/cases/comprehensive/case01-order/src/main/java/com/jvmbook/case01/Order.java`
- Create: `jvm-lab/cases/comprehensive/case01-order/src/main/resources/application.properties`
- Create: `jvm-lab/scripts/load-test-order.sh`

- [ ] **Step 1: 创建订单服务案例代码**

文件：`jvm-lab/cases/comprehensive/case01-order/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>case01-order</artifactId>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <version>${spring-boot.version}</version>
            </plugin>
        </plugins>
    </build>
</project>
```

文件：`jvm-lab/cases/comprehensive/case01-order/src/main/java/com/jvmbook/case01/Order.java`

```java
package com.jvmbook.case01;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record Order(
    String orderId,
    long userId,
    BigDecimal amount,
    int itemCount,
    Instant createdAt
) {
    public static Order create(long userId, BigDecimal amount, int itemCount) {
        return new Order(
            UUID.randomUUID().toString().substring(0, 8),
            userId, amount, itemCount, Instant.now()
        );
    }
}
```

文件：`jvm-lab/cases/comprehensive/case01-order/src/main/java/com/jvmbook/case01/OrderProcessor.java`

```java
package com.jvmbook.case01;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.util.concurrent.ConcurrentLinkedDeque;

@Component
public class OrderProcessor {
    private static final Logger log = LoggerFactory.getLogger(OrderProcessor.class);
    private final ConcurrentLinkedDeque<Order> orderStore = new ConcurrentLinkedDeque<>();
    private long totalProcessed = 0;

    public String processOrder(long userId, BigDecimal amount, int itemCount) {
        Order order = Order.create(userId, amount, itemCount);
        orderStore.addLast(order);
        totalProcessed++;

        // Simulate business logic: validation, inventory check, payment
        simulateCpuWork(5_000);
        simulateCpuWork(3_000);

        // Periodically purge to simulate "order shipped"
        if (orderStore.size() > 100_000) {
            int purgeCount = orderStore.size() / 3;
            for (int i = 0; i < purgeCount; i++) {
                orderStore.pollFirst();
            }
        }
        return order.orderId();
    }

    private void simulateCpuWork(int iterations) {
        double acc = 0;
        for (int i = 0; i < iterations; i++) {
            acc += Math.sin(i * 0.001) * Math.cos(i * 0.002);
        }
    }

    public long getProcessedCount() { return totalProcessed; }
    public int getPendingOrders() { return orderStore.size(); }
}
```

文件：`jvm-lab/cases/comprehensive/case01-order/src/main/java/com/jvmbook/case01/OrderApplication.java`

```java
package com.jvmbook.case01;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@SpringBootApplication
@RestController
public class OrderApplication {
    private final OrderProcessor processor;

    public OrderApplication(OrderProcessor processor) {
        this.processor = processor;
    }

    @PostMapping("/order")
    public String createOrder(@RequestParam long userId,
                              @RequestParam double amount,
                              @RequestParam int items) {
        return processor.processOrder(userId, BigDecimal.valueOf(amount), items);
    }

    @GetMapping("/stats")
    public String stats() {
        return "Processed: " + processor.getProcessedCount()
            + ", Pending: " + processor.getPendingOrders();
    }

    public static void main(String[] args) {
        SpringApplication.run(OrderApplication.class, args);
    }
}
```

文件：`jvm-lab/cases/comprehensive/case01-order/src/main/resources/application.properties`

```properties
server.port=8080
spring.application.name=order-service
```

文件：`jvm-lab/scripts/load-test-order.sh`

```bash
#!/bin/bash
# Usage: ./load-test-order.sh <target-url> <duration-sec>
URL=${1:-http://localhost:8080}
DURATION=${2:-60}

echo "Starting load test against $URL for ${DURATION}s"
echo "Order endpoint: $URL/order"

k6 run --duration "${DURATION}s" --vus 50 - <<EOF
import http from 'k6/http';
import { check, sleep } from 'k6';

export default function () {
  const userId = Math.floor(Math.random() * 10000);
  const amount = (Math.random() * 1000).toFixed(2);
  const items = Math.floor(Math.random() * 5) + 1;
  const res = http.post(\`${URL}/order?userId=\${userId}&amount=\${amount}&items=\${items}\`);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.01);
}
EOF
```

- [ ] **Step 2: 启动服务并用 k6 压测**

```bash
# 先编译
docker compose run --rm jvm-lab bash -c "cd /workspace/cases && mvn package -pl comprehensive/case01-order -am -DskipTests"

# 后台启动服务
docker compose run --rm -d --name order-svc jvm-lab bash -c "cd /workspace/cases && java -Xmx512m -Xlog:gc*:file=/workspace/cases/comprehensive/case01-order/gc.log -jar comprehensive/case01-order/target/case01-order-1.0-SNAPSHOT.jar"

# 运行压测
docker compose exec jvm-lab bash /workspace/scripts/load-test-order.sh "http://order-svc:8080" 30

# 停止服务后分析 GC 日志
docker compose stop order-svc
docker compose run --rm jvm-lab bash -c "java -cp ch08-gc/target/classes com.jvmbook.ch08.GcLogAnalyzer /workspace/cases/comprehensive/case01-order/gc.log"
```

预期：GC 日志显示 Mixed GC 频繁，停顿时间 > 100ms。

- [ ] **Step 3: 使用调优参数重新压测对比**

```bash
docker compose run --rm -d --name order-svc-tuned jvm-lab bash -c "cd /workspace/cases && java -Xmx512m -XX:G1HeapRegionSize=4m -XX:InitiatingHeapOccupancyPercent=70 -XX:G1MixedGCLiveThresholdPercent=85 -XX:MaxGCPauseMillis=50 -Xlog:gc*:file=/workspace/cases/comprehensive/case01-order/gc-tuned.log -jar comprehensive/case01-order/target/case01-order-1.0-SNAPSHOT.jar"

docker compose exec jvm-lab bash /workspace/scripts/load-test-order.sh "http://order-svc-tuned:8080" 30

docker compose stop order-svc-tuned
docker compose run --rm jvm-lab bash -c "java -cp ch08-gc/target/classes com.jvmbook.ch08.GcLogAnalyzer /workspace/cases/comprehensive/case01-order/gc-tuned.log"
```

预期：调优后最大 GC 停顿显著降低（< 80ms）。

- [ ] **Step 4: 撰写第 11 章文稿**（~40 页）

内容：完整记录从现象发现、工具采集、数据分析、根因定位、解决方案到效果验证的全流程。

### Task 3.2: 第 12 章——微服务网关性能瓶颈排查

**Files:**
- Create: `manuscript/part-03-comprehensive/ch12-gateway.md`
- Create: `jvm-lab/cases/comprehensive/case02-gateway/pom.xml`
- Create: `jvm-lab/cases/comprehensive/case02-gateway/src/main/java/com/jvmbook/case02/GatewayApplication.java`
- Create: `jvm-lab/cases/comprehensive/case02-gateway/src/main/java/com/jvmbook/case02/RouteHandler.java`
- Create: `jvm-lab/scripts/load-test-gateway.sh`

- [ ] **Step 1: 创建网关模拟代码**

文件：`jvm-lab/cases/comprehensive/case02-gateway/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.jvmbook</groupId>
        <artifactId>jvm-cases</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>case02-gateway</artifactId>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webflux</artifactId>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <version>${spring-boot.version}</version>
            </plugin>
        </plugins>
    </build>
</project>
```

（GatewayApplication.java 和 RouteHandler.java 实现一个简单的路由转发模拟 + 序列化/反序列化 CPU 热点，具体代码按照 spec 中的案例描述实现）

- [ ] **Step 2: 编译并启动网关**
- [ ] **Step 3: 使用 wrk 压测 + async-profiler 采集火焰图**
- [ ] **Step 4: 优化后对比**
- [ ] **Step 5: 撰写第 12 章文稿**

### Task 3.3: 第 13 章——大内存 ZGC 实战

**Files:**
- Create: `manuscript/part-03-comprehensive/ch13-bigmem.md`
- Create: `jvm-lab/cases/comprehensive/case03-bigmem/pom.xml`
- Create: `jvm-lab/cases/comprehensive/case03-bigmem/src/main/java/com/jvmbook/case03/BigMemoryProcessor.java`
- Create: `jvm-lab/scripts/run-zgc-test.sh`

（纯 Java 数据处理引擎 + 大堆 ZGC 配置，演示 NUMA 绑定和分代 ZGC 调优）

- [ ] **Step 1: 创建大内存数据处理案例**
- [ ] **Step 2: 使用不同 ZGC 配置运行对比**
- [ ] **Step 3: 撰写第 13 章文稿**

---

## Phase 4: 附录与收尾

### Task 4.1: 附录 A——常用 JVM 参数速查表

**Files:**
- Create: `manuscript/appendices/appendix-a-jvm-params.md`

按场景分类的参数表：

```
## 内存配置
| 参数 | 默认值 | 说明 |
|------|--------|------|
| -Xms | OS 分派 | 初始堆大小 |
| -Xmx | OS 分派 | 最大堆大小 |
| -Xmn | 堆的 1/3 | 新生代大小 |
| -Xss | 1MB (Linux) | 线程栈大小 |
| -XX:MaxMetaspaceSize | 无限制 | 元空间最大大小 |

## GC 配置
...

## JIT 编译
...

## 诊断与日志
...

## 性能调优
...
```

### Task 4.2: 附录 B——JFR 事件类型参考手册

### Task 4.3: 附录 C——环境故障排查指南

### Task 4.4: 附录 D——扩展阅读清单

---

## 验收标准

1. **实验环境：** `docker compose up` 一键启动，所有工具命令可用
2. **章节完成：** 13 章 + 4 个附录全部完稿，每章包含完整案例代码
3. **代码可运行：** 所有案例代码在 Docker 环境编译运行通过
4. **案例可复现：** 每个案例的"问题→诊断→解决→验证"闭环可在 Docker 复现
5. **提交历史：** 每章独立 Commit，Commit Message 规范
6. **文档结构：** manuscript/、jvm-lab/、docs/ 三部分齐全
