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
WORKDIR /workspace
COPY cases /workspace/cases
COPY scripts /workspace/scripts
# Install JDK 21 (Eclipse Temurin)
COPY tars /tmp/tars
RUN  tar -xzf /tmp/tars/jdk.tar.gz -C /opt/ \
    && mv /opt/jdk-21.0.2+13 $JAVA_HOME \
    && rm /tmp/tars/jdk.tar.gz

# Install Maven
RUN curl -L -o /tmp/maven.tar.gz \
    https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz \
    && tar -xzf /tmp/maven.tar.gz -C /opt/ \
    && mv /opt/apache-maven-3.9.9 $MAVEN_HOME \
    && rm /tmp/tars/maven.tar.gz

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


RUN chmod +x /workspace/scripts/*.sh

# Verify installations
RUN java -version && mvn -version && wrk --version && k6 version

CMD ["bash"]
