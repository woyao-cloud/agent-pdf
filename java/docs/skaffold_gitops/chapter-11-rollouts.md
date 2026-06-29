# 第11章 渐进式交付与流量管理

> 在生产环境中，发布新版本从来不是"一键切换"那么简单。当故障发生时，每秒钟的延迟都意味着真金白银的损失。本章将深入探讨如何利用 Skaffold、Helm 和 Python 构建一套完整的渐进式交付体系，涵盖灰度发布、蓝绿部署、自动回滚和流量管理，让每一次发布都变得安全、可控、可观测。

---

## 11.1 Skaffold + Helm Rollout 机制

### 11.1.1 解决的问题

传统的 `helm upgrade` 执行后，用户只能被动等待 Pod 启动，缺乏对发布过程的主动控制。当新版本启动失败时，旧版本可能已被终止，导致服务中断。Skaffold + Helm 的 Rollout 机制解决了以下问题：

- **发布原子性**：确保发布要么完全成功，要么完全回滚，不存在中间状态
- **等待与健康检查**：等待所有 Pod 就绪后再标记发布完成
- **历史版本管理**：保留足够的历史版本用于快速回滚
- **发布后验证**：通过 Helm test hooks 验证发布是否正确

### 11.1.2 核心原理

Helm 的 Rollout 机制基于三个核心能力：

**`--atomic` 标志**：当发布失败时自动执行回滚。Helm 会监控发布状态，如果 Deployment 未能达到就绪状态，自动调用 `helm rollback` 恢复到上一个版本。

**`--wait` 标志**：阻塞 `helm upgrade` 命令直到所有资源都处于就绪状态。对于 Deployment，这意味着所有 Pod 都通过就绪探针；对于 Service，这意味着端点已就绪。

**`maxHistory` 配置**：控制 Helm 保留的旧版本数量。每个版本都包含完整的 Release 资源清单，保留足够的历史版本是回滚能力的基础。

### 11.1.3 代码/配置实现

#### Helm Chart 配置

```yaml
# myapp/Chart.yaml
apiVersion: v2
name: myapp
version: 0.1.0
appVersion: "1.0.0"
```

```yaml
# myapp/values.yaml
replicaCount: 3

image:
  repository: myapp
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 200m
    memory: 256Mi

livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5

maxHistory: 5
```

```yaml
# myapp/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    app: {{ include "myapp.name" . }}
    release: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  revisionHistoryLimit: {{ .Values.maxHistory }}
  selector:
    matchLabels:
      app: {{ include "myapp.name" . }}
      release: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ include "myapp.name" . }}
        release: {{ .Release.Name }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: 8080
          livenessProbe:
            httpGet:
              path: {{ .Values.livenessProbe.httpGet.path }}
              port: {{ .Values.livenessProbe.httpGet.port }}
            initialDelaySeconds: {{ .Values.livenessProbe.initialDelaySeconds }}
            periodSeconds: {{ .Values.livenessProbe.periodSeconds }}
          readinessProbe:
            httpGet:
              path: {{ .Values.readinessProbe.httpGet.path }}
              port: {{ .Values.readinessProbe.httpGet.port }}
            initialDelaySeconds: {{ .Values.readinessProbe.initialDelaySeconds }}
            periodSeconds: {{ .Values.readinessProbe.periodSeconds }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

#### Skaffold 配置

```yaml
# skaffold.yaml
apiVersion: skaffold/v4beta7
kind: Config
build:
  artifacts:
    - image: myapp
      docker:
        dockerfile: Dockerfile
deploy:
  helm:
    releases:
      - name: myapp
        chartPath: myapp
        namespace: production
        createNamespace: true
        upgradeFlags:
          - --atomic
          - --wait
          - --timeout=5m
          - --cleanup-on-fail
        setValueTemplates:
          image.tag: "{{ .DIGEST }}"
        valuesFiles:
          - myapp/values.yaml
```

关键参数说明：

| 参数 | 作用 |
|------|------|
| `--atomic` | 失败时自动回滚，确保发布原子性 |
| `--wait` | 等待所有资源就绪 |
| `--timeout=5m` | 设置超时时间，避免无限等待 |
| `--cleanup-on-fail` | 失败时清理新创建的资源 |
| `revisionHistoryLimit` | 控制保留的历史版本数量 |

#### Helm Test Hooks

```yaml
# myapp/templates/test-connection.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "myapp.fullname" . }}-test-connection"
  labels:
    app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
  annotations:
    "helm.sh/hook": test
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  containers:
    - name: test-connection
      image: curlimages/curl:latest
      command:
        - sh
        - -c
        - |
          set -e
          echo "Testing service connectivity..."
          curl -sf http://{{ include "myapp.fullname" . }}:{{ .Values.service.port }}/healthz
          echo "Health check passed"
          curl -sf http://{{ include "myapp.fullname" . }}:{{ .Values.service.port }}/readyz
          echo "Readiness check passed"
          curl -sf http://{{ include "myapp.fullname" . }}:{{ .Values.service.port }}/api/version
          echo "Version endpoint passed"
  restartPolicy: Never
```

```yaml
# myapp/templates/test-database.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "myapp.fullname" . }}-test-database"
  annotations:
    "helm.sh/hook": test
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  containers:
    - name: test-database
      image: postgres:15-alpine
      env:
        - name: PGHOST
          value: "{{ .Values.database.host }}"
        - name: PGPORT
          value: "{{ .Values.database.port }}"
        - name: PGDATABASE
          value: "{{ .Values.database.name }}"
        - name: PGUSER
          value: "{{ .Values.database.user }}"
        - name: PGPASSWORD
          valueFrom:
            secretKeyRef:
              name: {{ .Values.database.secretName }}
              key: password
      command:
        - sh
        - -c
        - |
          set -e
          pg_isready -h $PGHOST -p $PGPORT
          echo "Database is ready"
          psql -c "SELECT 1" > /dev/null
          echo "Query executed successfully"
  restartPolicy: Never
```

#### 完整的 Rollout 脚本

```bash
#!/bin/bash
# scripts/rollout.sh

set -euo pipefail

NAMESPACE="${NAMESPACE:-production}"
RELEASE_NAME="${RELEASE_NAME:-myapp}"
CHART_PATH="${CHART_PATH:-myapp}"
NEW_TAG="${1:?Usage: $0 <new-image-tag>}"

echo "=== Starting Rollout: $RELEASE_NAME @ $NEW_TAG ==="

# 1. 执行 Helm 升级（原子发布）
echo "--- Step 1: Helm Upgrade (atomic) ---"
helm upgrade "$RELEASE_NAME" "$CHART_PATH" \
  --namespace "$NAMESPACE" \
  --atomic \
  --wait \
  --timeout 5m \
  --cleanup-on-fail \
  --set "image.tag=$NEW_TAG" \
  --set "image.pullPolicy=Always"

# 2. 运行 Helm Test
echo "--- Step 2: Helm Test ---"
helm test "$RELEASE_NAME" --namespace "$NAMESPACE" --logs

# 3. 验证发布状态
echo "--- Step 3: Verify Release Status ---"
RELEASE_STATUS=$(helm status "$RELEASE_NAME" --namespace "$NAMESPACE" -o json | jq -r '.info.status')
if [ "$RELEASE_STATUS" = "deployed" ]; then
  echo "Release $RELEASE_NAME deployed successfully (status: $RELEASE_STATUS)"
else
  echo "ERROR: Release status is $RELEASE_STATUS, expected 'deployed'"
  exit 1
fi

echo "=== Rollout completed successfully ==="
```

#### 回滚脚本

```bash
#!/bin/bash
# scripts/rollback.sh

set -euo pipefail

NAMESPACE="${NAMESPACE:-production}"
RELEASE_NAME="${RELEASE_NAME:-myapp}"
TARGET_REVISION="${1:-}"

echo "=== Rollback: $RELEASE_NAME ==="

# 列出历史版本
echo "--- Available Revisions ---"
helm history "$RELEASE_NAME" --namespace "$NAMESPACE"

if [ -n "$TARGET_REVISION" ]; then
  echo "--- Rolling back to revision $TARGET_REVISION ---"
  helm rollback "$RELEASE_NAME" "$TARGET_REVISION" \
    --namespace "$NAMESPACE" \
    --atomic \
    --wait \
    --timeout 5m \
    --cleanup-on-fail
else
  echo "--- Rolling back to previous revision ---"
  helm rollback "$RELEASE_NAME" \
    --namespace "$NAMESPACE" \
    --atomic \
    --wait \
    --timeout 5m \
    --cleanup-on-fail
fi

echo "--- Running tests after rollback ---"
helm test "$RELEASE_NAME" --namespace "$NAMESPACE" --logs

echo "=== Rollback completed ==="
```

### 11.1.4 使用场景

- **自动化 CI/CD 流水线**：在 Jenkins、GitLab CI 或 GitHub Actions 中集成原子发布
- **多环境部署**：开发、预发布、生产环境使用相同的 Rollout 机制，仅参数不同
- **紧急回滚**：当监控告警触发时，快速回滚到已知良好的版本
- **合规审计**：通过 `helm history` 追踪每次发布的变更记录

### 11.1.5 潜在风险与注意事项

- **`--atomic` 的副作用**：如果回滚本身也失败，Release 会进入 `failed` 状态，需要手动干预
- **超时设置**：`--timeout` 过短会导致正常发布被误判为失败；过长则延迟故障发现
- **`revisionHistoryLimit` 与存储**：每个历史版本都存储完整的资源清单，保留过多版本会占用 etcd 存储
- **Test Hook 的可靠性**：Test Pod 可能因集群资源不足而无法调度，导致误报
- **跨版本回滚**：回滚到非相邻版本时，数据库 schema 变更可能导致兼容性问题

### 11.1.6 本章小结

Skaffold + Helm 的 Rollout 机制为 Kubernetes 发布提供了原子性保障。通过 `--atomic`、`--wait` 和 Helm test hooks 的组合，可以构建一个"发布-验证-回滚"的闭环。但原子发布只是渐进式交付的起点，真正的流量控制需要更精细的灰度策略。

---

## 11.2 Python 灰度发布脚本

### 11.2.1 解决的问题

Helm 的原子发布是全量切换——新版本要么全部上线，要么全部回滚。对于高流量生产环境，全量切换的风险仍然很高。灰度发布（Canary Release）允许将新版本逐步暴露给一小部分用户，在确认稳定后再逐步扩大流量比例，将爆炸半径控制在最小范围。

### 11.2.2 核心原理

灰度发布的核心思想是"逐步替换"：

1. **创建 Canary Deployment**：部署新版本的一个 Pod 子集（例如 1 个 Pod vs 旧版本的 3 个 Pod）
2. **更新 Service Selector**：让 Service 同时将流量路由到旧版本和新版本 Pod
3. **监控指标**：在灰度期间持续监控错误率、延迟、CPU 等关键指标
4. **决策**：根据指标决定是继续扩大灰度比例还是回滚

### 11.2.3 代码/配置实现

#### Python 灰度发布脚本

```python
#!/usr/bin/env python3
"""
canary_release.py - 灰度发布管理脚本

用法:
  python canary_release.py promote    --namespace production --app myapp --new-version v2.0.0
  python canary_release.py rollback   --namespace production --app myapp
  python canary_release.py status     --namespace production --app myapp
"""

import argparse
import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from typing import Optional

import requests
import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("canary")


class KubernetesClient:
    """简化的 Kubernetes API 客户端封装"""

    def __init__(self, namespace: str):
        self.namespace = namespace

    def _kubectl(self, args: list[str]) -> str:
        cmd = ["kubectl", "-n", self.namespace] + args
        logger.debug("Running: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()

    def get_deployment(self, name: str) -> dict:
        output = self._kubectl(["get", "deployment", name, "-o", "json"])
        return json.loads(output)

    def get_service(self, name: str) -> dict:
        output = self._kubectl(["get", "service", name, "-o", "json"])
        return json.loads(output)

    def apply_yaml(self, yaml_content: str):
        proc = subprocess.Popen(
            ["kubectl", "-n", self.namespace, "apply", "-f", "-"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = proc.communicate(input=yaml_content)
        if proc.returncode != 0:
            raise RuntimeError(f"kubectl apply failed: {stderr}")
        logger.info("Applied resource: %s", stdout.strip())

    def delete_deployment(self, name: str):
        self._kubectl(["delete", "deployment", name, "--ignore-not-found"])

    def patch_service_selector(self, service_name: str, selectors: dict):
        patch = {"spec": {"selector": selectors}}
        self._kubectl([
            "patch", "service", service_name,
            "--type=merge", "-p", json.dumps(patch),
        ])

    def get_pods(self, label_selector: str) -> list[dict]:
        output = self._kubectl([
            "get", "pod", "-l", label_selector, "-o", "json",
        ])
        return json.loads(output).get("items", [])

    def wait_for_ready(self, label_selector: str, timeout: int = 180):
        self._kubectl([
            "wait", "--for=condition=ready", "pod",
            "-l", label_selector, f"--timeout={timeout}s",
        ])


class MetricsClient:
    """简化的指标查询客户端（示例使用 Prometheus API）"""

    def __init__(self, prometheus_url: str):
        self.prometheus_url = prometheus_url.rstrip("/")

    def query(self, query: str) -> list[dict]:
        resp = requests.get(
            f"{self.prometheus_url}/api/v1/query",
            params={"query": query},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if data["status"] != "success":
            raise RuntimeError(f"Prometheus query failed: {data}")
        return data["data"]["result"]

    def get_error_rate(self, app: str, version: str, duration: str = "5m") -> float:
        results = self.query(
            f'sum(rate(http_requests_total{{app="{app}", version="{version}", '
            f'status=~"5.."}}[{duration}])) / '
            f'sum(rate(http_requests_total{{app="{app}", version="{version}"}}[{duration}]))'
        )
        if not results or not results[0].get("value"):
            return 0.0
        return float(results[0]["value"][1])

    def get_latency_p99(self, app: str, version: str, duration: str = "5m") -> float:
        results = self.query(
            f'histogram_quantile(0.99, '
            f'sum(rate(http_request_duration_seconds_bucket{{app="{app}", '
            f'version="{version}"}}[{duration}])) by (le))'
        )
        if not results or not results[0].get("value"):
            return 0.0
        return float(results[0]["value"][1])


class CanaryRelease:
    """灰度发布管理器"""

    def __init__(
        self,
        namespace: str,
        app_name: str,
        new_version: str,
        canary_replicas: int = 1,
        stable_replicas: int = 3,
        prometheus_url: str = "http://localhost:9090",
        error_threshold: float = 0.01,
        latency_threshold: float = 0.5,
        observation_period: int = 300,
    ):
        self.k8s = KubernetesClient(namespace)
        self.metrics = MetricsClient(prometheus_url)
        self.namespace = namespace
        self.app_name = app_name
        self.new_version = new_version
        self.canary_replicas = canary_replicas
        self.stable_replicas = stable_replicas
        self.error_threshold = error_threshold
        self.latency_threshold = latency_threshold
        self.observation_period = observation_period
        self.stable_deployment = f"{app_name}-stable"
        self.canary_deployment = f"{app_name}-canary"
        self.service_name = app_name

    def _build_deployment_manifest(
        self,
        name: str,
        image_tag: str,
        replicas: int,
        version_label: str,
    ) -> dict:
        return {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": name, "namespace": self.namespace},
            "spec": {
                "replicas": replicas,
                "selector": {
                    "matchLabels": {
                        "app": self.app_name,
                        "version": version_label,
                    }
                },
                "template": {
                    "metadata": {
                        "labels": {
                            "app": self.app_name,
                            "version": version_label,
                        }
                    },
                    "spec": {
                        "containers": [
                            {
                                "name": self.app_name,
                                "image": f"{self.app_name}:{image_tag}",
                                "ports": [{"containerPort": 8080}],
                                "readinessProbe": {
                                    "httpGet": {
                                        "path": "/readyz",
                                        "port": 8080,
                                    },
                                    "initialDelaySeconds": 5,
                                    "periodSeconds": 5,
                                },
                                "livenessProbe": {
                                    "httpGet": {
                                        "path": "/healthz",
                                        "port": 8080,
                                    },
                                    "initialDelaySeconds": 10,
                                    "periodSeconds": 10,
                                },
                                "resources": {
                                    "requests": {
                                        "cpu": "200m",
                                        "memory": "256Mi",
                                    },
                                    "limits": {
                                        "cpu": "500m",
                                        "memory": "512Mi",
                                    },
                                },
                            }
                        ]
                    },
                },
            },
        }

    def _build_service_manifest(self) -> dict:
        return {
            "apiVersion": "v1",
            "kind": "Service",
            "metadata": {"name": self.service_name, "namespace": self.namespace},
            "spec": {
                "selector": {
                    "app": self.app_name,
                    "version": "stable",
                },
                "ports": [
                    {
                        "protocol": "TCP",
                        "port": 8080,
                        "targetPort": 8080,
                    }
                ],
            },
        }

    def _update_service_selector(self, versions: list[str]):
        selectors = {"app": self.app_name}
        if len(versions) == 1:
            selectors["version"] = versions[0]
        else:
            selectors["version-in"] = ",".join(versions)
        self.k8s.patch_service_selector(self.service_name, selectors)
        logger.info(
            "Service selector updated: app=%s, version in %s",
            self.app_name, versions,
        )

    def _observe_metrics(self) -> dict:
        """在观察期内持续监控指标"""
        logger.info(
            "Observing canary metrics for %d seconds...",
            self.observation_period,
        )
        samples = []
        end_time = time.time() + self.observation_period

        while time.time() < end_time:
            try:
                error_rate = self.metrics.get_error_rate(
                    self.app_name, self.new_version
                )
                latency = self.metrics.get_latency_p99(
                    self.app_name, self.new_version
                )
                samples.append({
                    "timestamp": datetime.now().isoformat(),
                    "error_rate": error_rate,
                    "latency_p99": latency,
                })
                logger.info(
                    "Canary metrics: error_rate=%.4f, p99_latency=%.2fs",
                    error_rate, latency,
                )

                if error_rate > self.error_threshold:
                    return {
                        "decision": "rollback",
                        "reason": f"Error rate {error_rate:.4f} exceeds threshold {self.error_threshold}",
                        "samples": samples,
                    }
                if latency > self.latency_threshold:
                    return {
                        "decision": "rollback",
                        "reason": f"P99 latency {latency:.2f}s exceeds threshold {self.latency_threshold}s",
                        "samples": samples,
                    }
            except Exception as e:
                logger.warning("Failed to query metrics: %s", e)

            time.sleep(15)

        return {"decision": "promote", "reason": "All metrics within thresholds", "samples": samples}

    def start(self):
        """启动灰度发布"""
        logger.info("=== Starting canary release ===")
        logger.info("App: %s, New version: %s", self.app_name, self.new_version)
        logger.info("Canary replicas: %d, Stable replicas: %d",
                     self.canary_replicas, self.stable_replicas)

        # 1. 创建 Canary Deployment
        logger.info("Step 1: Creating canary deployment...")
        canary_manifest = self._build_deployment_manifest(
            name=self.canary_deployment,
            image_tag=self.new_version,
            replicas=self.canary_replicas,
            version_label="canary",
        )
        self.k8s.apply_yaml(yaml.dump(canary_manifest))

        # 2. 等待 Canary Pod 就绪
        logger.info("Step 2: Waiting for canary pods to be ready...")
        self.k8s.wait_for_ready(
            f"app={self.app_name},version=canary", timeout=180
        )

        # 3. 将 Canary 加入 Service 流量
        logger.info("Step 3: Routing traffic to canary...")
        self._update_service_selector(["stable", "canary"])

        # 4. 观察指标
        logger.info("Step 4: Observing canary metrics...")
        result = self._observe_metrics()

        # 5. 决策
        if result["decision"] == "promote":
            self._promote()
        else:
            self._rollback(result["reason"])

        return result

    def _promote(self):
        """提升 Canary 为稳定版本"""
        logger.info("=== Promoting canary to stable ===")

        # 1. 创建新的 Stable Deployment
        stable_manifest = self._build_deployment_manifest(
            name=self.stable_deployment,
            image_tag=self.new_version,
            replicas=self.stable_replicas,
            version_label="stable",
        )
        self.k8s.apply_yaml(yaml.dump(stable_manifest))

        # 2. 等待新 Stable Pod 就绪
        self.k8s.wait_for_ready(
            f"app={self.app_name},version=stable", timeout=180
        )

        # 3. 切换 Service 到新版本
        self._update_service_selector(["stable"])

        # 4. 删除 Canary Deployment
        self.k8s.delete_deployment(self.canary_deployment)
        logger.info("Canary deployment deleted")

        logger.info("=== Promotion completed ===")

    def _rollback(self, reason: str):
        """回滚灰度发布"""
        logger.warning("=== Rolling back canary release ===")
        logger.warning("Reason: %s", reason)

        # 1. 从 Service 中移除 Canary
        self._update_service_selector(["stable"])

        # 2. 删除 Canary Deployment
        self.k8s.delete_deployment(self.canary_deployment)

        logger.warning("=== Rollback completed ===")

    def get_status(self) -> dict:
        """获取当前灰度发布状态"""
        status = {
            "namespace": self.namespace,
            "app": self.app_name,
            "stable_deployment": self.stable_deployment,
            "canary_deployment": self.canary_deployment,
        }

        try:
            stable = self.k8s.get_deployment(self.stable_deployment)
            status["stable"] = {
                "replicas": stable["spec"]["replicas"],
                "ready_replicas": stable["status"].get("readyReplicas", 0),
                "image": stable["spec"]["template"]["spec"]["containers"][0]["image"],
            }
        except subprocess.CalledProcessError:
            status["stable"] = None

        try:
            canary = self.k8s.get_deployment(self.canary_deployment)
            status["canary"] = {
                "replicas": canary["spec"]["replicas"],
                "ready_replicas": canary["status"].get("readyReplicas", 0),
                "image": canary["spec"]["template"]["spec"]["containers"][0]["image"],
            }
        except subprocess.CalledProcessError:
            status["canary"] = None

        return status


def main():
    parser = argparse.ArgumentParser(description="Canary Release Manager")
    parser.add_argument("action", choices=["promote", "rollback", "status"])
    parser.add_argument("--namespace", default="production")
    parser.add_argument("--app", required=True)
    parser.add_argument("--new-version", help="New version tag (required for promote)")
    parser.add_argument("--canary-replicas", type=int, default=1)
    parser.add_argument("--stable-replicas", type=int, default=3)
    parser.add_argument("--prometheus-url", default=os.getenv("PROMETHEUS_URL", "http://localhost:9090"))
    parser.add_argument("--error-threshold", type=float, default=0.01)
    parser.add_argument("--latency-threshold", type=float, default=0.5)
    parser.add_argument("--observation-period", type=int, default=300)

    args = parser.parse_args()

    canary = CanaryRelease(
        namespace=args.namespace,
        app_name=args.app,
        new_version=args.new_version or "",
        canary_replicas=args.canary_replicas,
        stable_replicas=args.stable_replicas,
        prometheus_url=args.prometheus_url,
        error_threshold=args.error_threshold,
        latency_threshold=args.latency_threshold,
        observation_period=args.observation_period,
    )

    if args.action == "promote":
        if not args.new_version:
            parser.error("--new-version is required for promote action")
        result = canary.start()
        if result["decision"] == "promote":
            logger.info("Canary release promoted successfully")
            sys.exit(0)
        else:
            logger.error("Canary release rolled back: %s", result["reason"])
            sys.exit(1)

    elif args.action == "rollback":
        canary._rollback("Manual rollback requested")
        logger.info("Manual rollback completed")

    elif args.action == "status":
        status = canary.get_status()
        print(json.dumps(status, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

#### 灰度发布流水线集成

```yaml
# .gitlab-ci.yml 中的灰度发布阶段
canary-release:
  stage: deploy
  script:
    - python scripts/canary_release.py promote \
        --namespace production \
        --app myapp \
        --new-version $CI_COMMIT_TAG \
        --canary-replicas 1 \
        --stable-replicas 3 \
        --prometheus-url http://prometheus.monitoring:9090 \
        --error-threshold 0.01 \
        --latency-threshold 0.5 \
        --observation-period 300
  only:
    - tags
  environment:
    name: production
  when: manual
```

### 11.2.4 使用场景

- **高流量生产环境**：每天处理百万级请求的服务，需要最小化发布风险
- **实验性功能验证**：新功能需要在小范围用户中验证后再全量发布
- **性能敏感型服务**：新版本可能引入性能退化，需要实时监控
- **多版本共存**：需要同时运行多个版本以支持 A/B 测试

### 11.2.5 潜在风险与注意事项

- **Service Selector 限制**：Kubernetes Service 的 selector 不支持 `version-in` 这种多值语法，实际实现需要使用额外的标签或改用 Service Mesh
- **指标延迟**：Prometheus 拉取模式存在 15s 的采集间隔，加上查询窗口（5m），指标反馈存在分钟级延迟
- **连接耗尽**：切换 Service selector 时，已有连接不会立即断开，可能导致请求继续发送到已移除的 Pod
- **资源浪费**：灰度期间同时运行两套 Deployment，需要额外的集群资源
- **Session 亲和性**：如果应用有状态，灰度期间用户请求可能在不同版本间漂移

### 11.2.6 本章小结

Python 灰度发布脚本提供了比 Helm 原子发布更精细的流量控制能力。通过创建独立的 Canary Deployment、动态更新 Service Selector 和基于 Prometheus 指标的自动决策，可以将发布风险降低一个数量级。但灰度发布也引入了额外的复杂性和资源开销，需要根据业务场景权衡使用。

---

## 11.3 蓝绿部署

### 11.3.1 解决的问题

灰度发布虽然安全，但灰度周期较长（通常 5-30 分钟），且新旧版本同时运行增加了资源消耗。蓝绿部署（Blue-Green Deployment）提供了一种"瞬间切换"的策略：同时维护两套完整的环境，切换时只需更新 Service 的标签选择器，实现零等待的版本切换。

### 11.3.2 核心原理

蓝绿部署的核心思想是"环境切换而非版本升级"：

1. **蓝色环境（当前生产）**：运行当前稳定版本，处理所有生产流量
2. **绿色环境（新版本）**：部署新版本，但不接收生产流量
3. **健康验证**：在绿色环境上运行完整的集成测试和健康检查
4. **流量切换**：更新 Service selector 指向绿色环境
5. **旧环境清理**：确认绿色环境稳定后，销毁蓝色环境

### 11.3.3 代码/配置实现

#### Python 蓝绿部署脚本

```python
#!/usr/bin/env python3
"""
blue_green.py - 蓝绿部署管理脚本

用法:
  python blue_green.py deploy    --namespace production --app myapp --new-version v2.0.0
  python blue_green.py switch    --namespace production --app myapp
  python blue_green.py rollback  --namespace production --app myapp
  python blue_green.py cleanup   --namespace production --app myapp
  python blue_green.py status    --namespace production --app myapp
"""

import argparse
import json
import logging
import subprocess
import sys
import time
from enum import Enum
from typing import Optional

import requests
import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("bluegreen")


class Color(Enum):
    BLUE = "blue"
    GREEN = "green"


class KubernetesClient:
    def __init__(self, namespace: str):
        self.namespace = namespace

    def _kubectl(self, args: list[str]) -> str:
        cmd = ["kubectl", "-n", self.namespace] + args
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()

    def apply_yaml(self, yaml_content: str):
        proc = subprocess.Popen(
            ["kubectl", "-n", self.namespace, "apply", "-f", "-"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )
        stdout, stderr = proc.communicate(input=yaml_content)
        if proc.returncode != 0:
            raise RuntimeError(f"kubectl apply failed: {stderr}")
        logger.info("Applied: %s", stdout.strip())

    def delete_deployment(self, name: str):
        self._kubectl(["delete", "deployment", name, "--ignore-not-found"])

    def get_deployment(self, name: str) -> Optional[dict]:
        try:
            output = self._kubectl(["get", "deployment", name, "-o", "json"])
            return json.loads(output)
        except subprocess.CalledProcessError:
            return None

    def get_service(self, name: str) -> dict:
        output = self._kubectl(["get", "service", name, "-o", "json"])
        return json.loads(output)

    def patch_service_selector(self, service_name: str, selectors: dict):
        patch = {"spec": {"selector": selectors}}
        self._kubectl([
            "patch", "service", service_name,
            "--type=merge", "-p", json.dumps(patch),
        ])

    def wait_for_ready(self, label_selector: str, timeout: int = 180):
        self._kubectl([
            "wait", "--for=condition=ready", "pod",
            "-l", label_selector, f"--timeout={timeout}s",
        ])

    def get_pods(self, label_selector: str) -> list[dict]:
        output = self._kubectl([
            "get", "pod", "-l", label_selector, "-o", "json",
        ])
        return json.loads(output).get("items", [])


class BlueGreenDeploy:
    """蓝绿部署管理器"""

    def __init__(
        self,
        namespace: str,
        app_name: str,
        new_version: str,
        replicas: int = 3,
        health_check_url: str = "/healthz",
        health_check_timeout: int = 30,
    ):
        self.k8s = KubernetesClient(namespace)
        self.namespace = namespace
        self.app_name = app_name
        self.new_version = new_version
        self.replicas = replicas
        self.health_check_url = health_check_url
        self.health_check_timeout = health_check_timeout
        self.service_name = app_name

    def _get_active_color(self) -> Color:
        """获取当前活跃的环境颜色"""
        svc = self.k8s.get_service(self.service_name)
        selector = svc["spec"]["selector"]
        color = selector.get("color", "blue")
        return Color(color)

    def _get_inactive_color(self) -> Color:
        active = self._get_active_color()
        return Color.GREEN if active == Color.BLUE else Color.BLUE

    def _build_deployment_manifest(self, color: Color, version: str) -> dict:
        return {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {
                "name": f"{self.app_name}-{color.value}",
                "namespace": self.namespace,
                "labels": {
                    "app": self.app_name,
                    "color": color.value,
                    "version": version,
                },
            },
            "spec": {
                "replicas": self.replicas,
                "selector": {
                    "matchLabels": {
                        "app": self.app_name,
                        "color": color.value,
                    }
                },
                "template": {
                    "metadata": {
                        "labels": {
                            "app": self.app_name,
                            "color": color.value,
                            "version": version,
                        }
                    },
                    "spec": {
                        "containers": [
                            {
                                "name": self.app_name,
                                "image": f"{self.app_name}:{version}",
                                "ports": [{"containerPort": 8080}],
                                "env": [
                                    {"name": "APP_COLOR", "value": color.value},
                                    {"name": "APP_VERSION", "value": version},
                                ],
                                "readinessProbe": {
                                    "httpGet": {
                                        "path": "/readyz",
                                        "port": 8080,
                                    },
                                    "initialDelaySeconds": 5,
                                    "periodSeconds": 5,
                                },
                                "livenessProbe": {
                                    "httpGet": {
                                        "path": "/healthz",
                                        "port": 8080,
                                    },
                                    "initialDelaySeconds": 10,
                                    "periodSeconds": 10,
                                },
                                "resources": {
                                    "requests": {"cpu": "200m", "memory": "256Mi"},
                                    "limits": {"cpu": "500m", "memory": "512Mi"},
                                },
                            }
                        ]
                    },
                },
            },
        }

    def _build_service_manifest(self) -> dict:
        active_color = self._get_active_color()
        return {
            "apiVersion": "v1",
            "kind": "Service",
            "metadata": {"name": self.service_name, "namespace": self.namespace},
            "spec": {
                "selector": {
                    "app": self.app_name,
                    "color": active_color.value,
                },
                "ports": [{"protocol": "TCP", "port": 8080, "targetPort": 8080}],
            },
        }

    def _health_check(self, color: Color) -> bool:
        """对指定环境执行健康检查"""
        pods = self.k8s.get_pods(f"app={self.app_name},color={color.value}")
        if not pods:
            logger.error("No pods found for color=%s", color.value)
            return False

        for pod in pods[:3]:
            pod_ip = pod["status"].get("podIP", "")
            if not pod_ip:
                continue
            try:
                resp = requests.get(
                    f"http://{pod_ip}:8080{self.health_check_url}",
                    timeout=self.health_check_timeout,
                )
                if resp.status_code == 200:
                    logger.info("Health check passed for pod %s", pod["metadata"]["name"])
                else:
                    logger.error(
                        "Health check failed for pod %s: %d",
                        pod["metadata"]["name"], resp.status_code,
                    )
                    return False
            except requests.RequestException as e:
                logger.error("Health check error for pod %s: %s",
                             pod["metadata"]["name"], e)
                return False

        return True

    def deploy_new(self):
        """部署新版本到非活跃环境"""
        inactive = self._get_inactive_color()
        logger.info("=== Deploying new version to %s environment ===", inactive.value)
        logger.info("App: %s, Version: %s", self.app_name, self.new_version)

        manifest = self._build_deployment_manifest(inactive, self.new_version)
        self.k8s.apply_yaml(yaml.dump(manifest))

        self.k8s.wait_for_ready(
            f"app={self.app_name},color={inactive.value}", timeout=180
        )

        if not self._health_check(inactive):
            raise RuntimeError(f"Health check failed for {inactive.value} environment")

        logger.info("=== Deployment to %s environment completed ===", inactive.value)

    def switch_traffic(self):
        """将流量切换到非活跃环境"""
        inactive = self._get_inactive_color()
        logger.info("=== Switching traffic to %s environment ===", inactive.value)

        self.k8s.patch_service_selector(
            self.service_name,
            {"app": self.app_name, "color": inactive.value},
        )

        logger.info("Traffic switched to %s", inactive.value)

        time.sleep(5)

        if not self._health_check(inactive):
            self._emergency_rollback()
            raise RuntimeError(
                f"Health check failed after switch, emergency rollback triggered"
            )

        logger.info("=== Traffic switch completed ===")

    def _emergency_rollback(self):
        """紧急回滚到上一个活跃环境"""
        previous = self._get_active_color()
        logger.warning("=== Emergency rollback to %s ===", previous.value)
        self.k8s.patch_service_selector(
            self.service_name,
            {"app": self.app_name, "color": previous.value},
        )

    def rollback(self):
        """手动回滚到上一个版本"""
        active = self._get_active_color()
        previous = Color.GREEN if active == Color.BLUE else Color.BLUE

        logger.info("=== Rolling back from %s to %s ===", active.value, previous.value)

        self.k8s.patch_service_selector(
            self.service_name,
            {"app": self.app_name, "color": previous.value},
        )

        logger.info("Traffic switched back to %s", previous.value)

    def cleanup_old(self):
        """清理非活跃环境"""
        inactive = self._get_inactive_color()
        logger.info("=== Cleaning up %s environment ===", inactive.value)

        self.k8s.delete_deployment(f"{self.app_name}-{inactive.value}")
        logger.info("Deleted deployment: %s-%s", self.app_name, inactive.value)

    def get_status(self) -> dict:
        active = self._get_active_color()
        inactive = self._get_inactive_color()

        status = {
            "namespace": self.namespace,
            "app": self.app_name,
            "active_color": active.value,
            "inactive_color": inactive.value,
        }

        for color in [Color.BLUE, Color.GREEN]:
            dep = self.k8s.get_deployment(f"{self.app_name}-{color.value}")
            if dep:
                status[color.value] = {
                    "version": dep["metadata"]["labels"].get("version", "unknown"),
                    "replicas": dep["spec"]["replicas"],
                    "ready_replicas": dep["status"].get("readyReplicas", 0),
                }
            else:
                status[color.value] = None

        return status


def main():
    parser = argparse.ArgumentParser(description="Blue-Green Deployment Manager")
    parser.add_argument("action", choices=["deploy", "switch", "rollback", "cleanup", "status"])
    parser.add_argument("--namespace", default="production")
    parser.add_argument("--app", required=True)
    parser.add_argument("--new-version", help="New version tag (required for deploy)")
    parser.add_argument("--replicas", type=int, default=3)

    args = parser.parse_args()

    bg = BlueGreenDeploy(
        namespace=args.namespace,
        app_name=args.app,
        new_version=args.new_version or "",
        replicas=args.replicas,
    )

    if args.action == "deploy":
        if not args.new_version:
            parser.error("--new-version is required for deploy action")
        bg.deploy_new()

    elif args.action == "switch":
        bg.switch_traffic()

    elif args.action == "rollback":
        bg.rollback()

    elif args.action == "cleanup":
        bg.cleanup_old()

    elif args.action == "status":
        status = bg.get_status()
        print(json.dumps(status, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

#### 完整的蓝绿部署流水线

```yaml
# .gitlab-ci.yml
stages:
  - deploy-green
  - test-green
  - switch
  - cleanup-blue

deploy-green:
  stage: deploy-green
  script:
    - python scripts/blue_green.py deploy \
        --namespace production \
        --app myapp \
        --new-version $CI_COMMIT_TAG \
        --replicas 3
  environment:
    name: production-green

test-green:
  stage: test-green
  script:
    - |
      GREEN_IP=$(kubectl get pod -n production -l app=myapp,color=green \
        -o jsonpath='{.items[0].status.podIP}')
      python scripts/run_smoke_tests.py --base-url http://$GREEN_IP:8080
  needs: [deploy-green]

switch-to-green:
  stage: switch
  script:
    - python scripts/blue_green.py switch \
        --namespace production \
        --app myapp
  needs: [test-green]
  when: manual

cleanup-blue:
  stage: cleanup-blue
  script:
    - python scripts/blue_green.py cleanup \
        --namespace production \
        --app myapp
  needs: [switch-to-green]
  when: manual
```

### 11.3.4 使用场景

- **数据库 schema 向后兼容**：蓝绿部署要求新旧版本能共享同一数据库，适合 schema 变更兼容的场景
- **无状态应用**：微服务、API 网关等无状态服务最适合蓝绿部署
- **需要快速回滚的场景**：切换 Service selector 即可回滚，秒级完成
- **大版本升级**：涉及重大架构变更的版本，需要在独立环境中充分验证

### 11.3.5 潜在风险与注意事项

- **数据库兼容性**：蓝绿部署要求数据库 schema 同时兼容新旧两个版本，否则切换后可能立即失败
- **资源翻倍**：同时运行两套完整环境，资源消耗翻倍，成本较高
- **连接 draining**：切换 Service 后，旧 Pod 上的已有连接需要优雅关闭，否则用户会感知到连接中断
- **缓存预热**：新环境启动时缓存是空的，切换后可能出现短暂的性能下降（冷启动问题）
- **有状态服务**：对于有状态服务（如 WebSocket 连接），蓝绿切换会导致所有连接断开

### 11.3.6 本章小结

蓝绿部署通过维护两套独立环境实现了零等待的版本切换，适合需要快速回滚能力和充分预验证的场景。与灰度发布相比，蓝绿部署的切换速度更快、验证更充分，但资源消耗也更大。选择哪种策略取决于业务对切换速度和资源成本的权衡。

---

## 11.4 自动回滚策略

### 11.4.1 解决的问题

手动回滚依赖运维人员的响应速度——在非工作时间，从告警到人工执行回滚可能需要 10-30 分钟。自动回滚策略将"发现故障→决策→执行回滚"的流程自动化，将 MTTR（平均修复时间）从分钟级降低到秒级。

### 11.4.2 核心原理

自动回滚策略基于"健康门限"的决策模型：

1. **健康检查失败阈值**：设定连续健康检查失败的次数阈值，超过则触发回滚
2. **指标退化检测**：监控错误率、延迟、吞吐量等关键指标，与基线对比
3. **自动执行**：检测到异常后自动执行回滚操作
4. **通知**：通过 Webhook、Slack、邮件等方式通知相关人员

### 11.4.3 代码/配置实现

#### 自动回滚控制器

```python
#!/usr/bin/env python3
"""
auto_rollback.py - 自动回滚控制器

持续监控发布状态，在检测到异常时自动执行回滚。
"""

import argparse
import json
import logging
import os
import subprocess
import time
from datetime import datetime
from typing import Optional

import requests
import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("auto-rollback")


class AutoRollbackController:
    """自动回滚控制器"""

    def __init__(
        self,
        namespace: str,
        release_name: str,
        prometheus_url: str = "http://localhost:9090",
        health_check_interval: int = 10,
        health_check_failure_threshold: int = 3,
        error_rate_threshold: float = 0.05,
        error_rate_window: str = "5m",
        latency_p99_threshold: float = 1.0,
        latency_window: str = "5m",
        observation_timeout: int = 600,
        webhook_url: Optional[str] = None,
    ):
        self.namespace = namespace
        self.release_name = release_name
        self.prometheus_url = prometheus_url.rstrip("/")
        self.health_check_interval = health_check_interval
        self.health_check_failure_threshold = health_check_failure_threshold
        self.error_rate_threshold = error_rate_threshold
        self.error_rate_window = error_rate_window
        self.latency_p99_threshold = latency_p99_threshold
        self.latency_window = latency_window
        self.observation_timeout = observation_timeout
        self.webhook_url = webhook_url
        self.failure_count = 0
        self.start_time = None

    def _kubectl(self, args: list[str]) -> str:
        cmd = ["kubectl", "-n", self.namespace] + args
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()

    def _get_service_endpoint(self) -> Optional[str]:
        """获取 Service 的 ClusterIP 和端口"""
        try:
            svc = json.loads(
                self._kubectl(["get", "service", self.release_name, "-o", "json"])
            )
            cluster_ip = svc["spec"].get("clusterIP")
            if not cluster_ip or cluster_ip == "None":
                return None
            port = svc["spec"]["ports"][0]["port"]
            return f"http://{cluster_ip}:{port}"
        except (subprocess.CalledProcessError, KeyError, IndexError):
            return None

    def _health_check(self) -> bool:
        """执行 HTTP 健康检查"""
        endpoint = self._get_service_endpoint()
        if not endpoint:
            logger.warning("No service endpoint available")
            return False

        try:
            resp = requests.get(
                f"{endpoint}/healthz",
                timeout=5,
            )
            if resp.status_code == 200:
                return True
            logger.warning("Health check returned %d", resp.status_code)
            return False
        except requests.RequestException as e:
            logger.warning("Health check failed: %s", e)
            return False

    def _query_prometheus(self, query: str) -> float:
        """查询 Prometheus 指标"""
        resp = requests.get(
            f"{self.prometheus_url}/api/v1/query",
            params={"query": query},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if data["status"] != "success":
            raise RuntimeError(f"Prometheus error: {data}")
        results = data["data"]["result"]
        if not results or not results[0].get("value"):
            return 0.0
        return float(results[0]["value"][1])

    def _check_metrics(self) -> tuple[bool, str]:
        """检查指标是否异常"""
        try:
            error_rate = self._query_prometheus(
                f'sum(rate(http_requests_total{{namespace="{self.namespace}",'
                f'app="{self.release_name}",status=~"5.."}}'
                f'[{self.error_rate_window}])) / '
                f'sum(rate(http_requests_total{{namespace="{self.namespace}",'
                f'app="{self.release_name}"}}[{self.error_rate_window}]))'
            )

            if error_rate > self.error_rate_threshold:
                return False, (
                    f"Error rate {error_rate:.4f} exceeds threshold "
                    f"{self.error_rate_threshold}"
                )

            latency = self._query_prometheus(
                f'histogram_quantile(0.99, '
                f'sum(rate(http_request_duration_seconds_bucket{{'
                f'namespace="{self.namespace}",app="{self.release_name}"}}'
                f'[{self.latency_window}])) by (le))'
            )

            if latency > self.latency_p99_threshold:
                return False, (
                    f"P99 latency {latency:.2f}s exceeds threshold "
                    f"{self.latency_p99_threshold}s"
                )

            return True, f"Metrics OK (error_rate={error_rate:.4f}, p99={latency:.2f}s)"

        except Exception as e:
            logger.warning("Metrics check failed: %s", e)
            return True, "Metrics check skipped (query error)"

    def _send_notification(self, title: str, message: str, severity: str = "warning"):
        """发送通知"""
        if not self.webhook_url:
            logger.info("[NOTIFICATION] %s: %s", title, message)
            return

        payload = {
            "text": f"*[{severity.upper()}] {title}*\n{message}",
            "attachments": [
                {
                    "color": "danger" if severity == "critical" else "warning",
                    "fields": [
                        {"title": "Namespace", "value": self.namespace, "short": True},
                        {"title": "Release", "value": self.release_name, "short": True},
                        {"title": "Time", "value": datetime.now().isoformat(), "short": True},
                    ],
                }
            ],
        }

        try:
            resp = requests.post(self.webhook_url, json=payload, timeout=5)
            logger.info("Notification sent (status=%d)", resp.status_code)
        except requests.RequestException as e:
            logger.warning("Failed to send notification: %s", e)

    def _execute_rollback(self, reason: str):
        """执行 Helm 回滚"""
        logger.warning("=== Executing auto-rollback ===")
        logger.warning("Reason: %s", reason)

        self._send_notification(
            "Auto-rollback triggered",
            f"Release {self.release_name} in {self.namespace} is being rolled back.\n"
            f"Reason: {reason}",
            severity="critical",
        )

        try:
            subprocess.run(
                [
                    "helm", "rollback", self.release_name,
                    "--namespace", self.namespace,
                    "--atomic", "--wait", "--timeout", "5m",
                ],
                check=True, capture_output=True, text=True,
            )
            logger.info("Rollback executed successfully")

            self._send_notification(
                "Auto-rollback completed",
                f"Release {self.release_name} has been rolled back successfully.",
                severity="warning",
            )

        except subprocess.CalledProcessError as e:
            logger.error("Rollback failed: %s", e.stderr)
            self._send_notification(
                "Auto-rollback FAILED",
                f"Rollback of {self.release_name} failed:\n{e.stderr}",
                severity="critical",
            )
            raise

    def monitor(self):
        """启动自动回滚监控循环"""
        logger.info("=== Starting auto-rollback monitor ===")
        logger.info("Release: %s/%s", self.namespace, self.release_name)
        logger.info("Health check interval: %ds", self.health_check_interval)
        logger.info("Failure threshold: %d", self.health_check_failure_threshold)
        logger.info("Error rate threshold: %.2f", self.error_rate_threshold)
        logger.info("P99 latency threshold: %.2fs", self.latency_p99_threshold)
        logger.info("Observation timeout: %ds", self.observation_timeout)

        self.start_time = time.time()
        self.failure_count = 0

        while True:
            elapsed = time.time() - self.start_time
            if elapsed > self.observation_timeout:
                logger.info(
                    "Observation period ended (%ds elapsed), no issues detected",
                    self.observation_timeout,
                )
                self._send_notification(
                    "Release stable",
                    f"Release {self.release_name} passed observation period "
                    f"({self.observation_timeout}s) without issues.",
                    severity="good",
                )
                return

            health_ok = self._health_check()
            metrics_ok, metrics_msg = self._check_metrics()

            if health_ok and metrics_ok:
                self.failure_count = 0
                logger.info(
                    "[%ds] All checks passed: %s",
                    int(elapsed), metrics_msg,
                )
            else:
                self.failure_count += 1
                failures = []
                if not health_ok:
                    failures.append("health check")
                if not metrics_ok:
                    failures.append(f"metrics ({metrics_msg})")

                logger.warning(
                    "[%ds] Check failed (%d/%d): %s",
                    int(elapsed),
                    self.failure_count,
                    self.health_check_failure_threshold,
                    ", ".join(failures),
                )

                if self.failure_count >= self.health_check_failure_threshold:
                    reason = (
                        f"Failed {self.failure_count} consecutive checks: "
                        + ", ".join(failures)
                    )
                    self._execute_rollback(reason)
                    return

            time.sleep(self.health_check_interval)


def main():
    parser = argparse.ArgumentParser(description="Auto-Rollback Controller")
    parser.add_argument("--namespace", default="production")
    parser.add_argument("--release", required=True)
    parser.add_argument("--prometheus-url", default=os.getenv("PROMETHEUS_URL", "http://localhost:9090"))
    parser.add_argument("--health-check-interval", type=int, default=10)
    parser.add_argument("--failure-threshold", type=int, default=3)
    parser.add_argument("--error-rate-threshold", type=float, default=0.05)
    parser.add_argument("--latency-threshold", type=float, default=1.0)
    parser.add_argument("--observation-timeout", type=int, default=600)
    parser.add_argument("--webhook-url", default=os.getenv("SLACK_WEBHOOK_URL"))

    args = parser.parse_args()

    controller = AutoRollbackController(
        namespace=args.namespace,
        release_name=args.release,
        prometheus_url=args.prometheus_url,
        health_check_interval=args.health_check_interval,
        health_check_failure_threshold=args.failure_threshold,
        error_rate_threshold=args.error_rate_threshold,
        latency_p99_threshold=args.latency_threshold,
        observation_timeout=args.observation_timeout,
        webhook_url=args.webhook_url,
    )

    controller.monitor()


if __name__ == "__main__":
    main()
```

#### 与灰度发布集成的自动回滚

```python
# 在灰度发布脚本中集成自动回滚
class CanaryWithAutoRollback(CanaryRelease):
    """带自动回滚的灰度发布"""

    def start_with_auto_rollback(self):
        """启动灰度发布并自动监控回滚"""
        result = self.start()

        if result["decision"] != "promote":
            return result

        controller = AutoRollbackController(
            namespace=self.namespace,
            release_name=self.app_name,
            prometheus_url=self.metrics.prometheus_url,
            health_check_interval=10,
            health_check_failure_threshold=3,
            error_rate_threshold=self.error_threshold,
            latency_p99_threshold=self.latency_threshold,
            observation_timeout=600,
        )

        controller.monitor()
        return result
```

#### Helm Chart 中的自动回滚配置

```yaml
# values.yaml 中的回滚策略配置
rollout:
  strategy: canary
  autoRollback:
    enabled: true
    healthCheckInterval: 10
    failureThreshold: 3
    errorRateThreshold: 0.05
    latencyP99Threshold: 1.0
    observationPeriod: 600
    notification:
      slack:
        enabled: true
        webhookUrl: "https://hooks.slack.com/services/xxx"
      pagerduty:
        enabled: false
        routingKey: ""
```

### 11.4.4 使用场景

- **无人值守发布**：夜间自动发布，无需运维人员值守
- **高可用要求**：SLA 要求 99.99% 以上的服务，需要秒级故障恢复
- **大规模集群**：成百上千个微服务的发布管理，人工无法及时响应
- **合规审计**：自动回滚记录可作为变更管理的审计证据

### 11.4.5 潜在风险与注意事项

- **误回滚**：网络抖动或 Prometheus 临时故障可能导致误触发回滚，需要设置合理的失败阈值和抖动容忍
- **回滚风暴**：多个微服务同时触发回滚可能导致集群不稳定，需要引入回滚冷却期
- **指标盲区**：某些故障模式（如数据损坏）在 HTTP 层面不可见，需要业务层面的健康检查
- **通知疲劳**：频繁的误报通知会导致团队对告警麻木，需要持续调优阈值
- **回滚失败**：回滚操作本身也可能失败（如镜像拉取失败），需要二级告警机制

### 11.4.6 本章小结

自动回滚策略是渐进式交付的安全网。通过健康检查、指标监控和自动执行的三层防护，可以在无人干预的情况下快速恢复服务。但自动回滚不是银弹——合理的阈值设置、充分的测试覆盖和可靠的通知机制同样重要。

---

## 11.5 流量管理

### 11.5.1 解决的问题

灰度发布和蓝绿部署解决了"如何部署"的问题，但"如何控制流量"是另一个维度的问题。Kubernetes Service 的流量路由能力有限——它只能做基于标签的轮询负载均衡，无法实现权重路由、基于请求头的路由或故障注入。Service Mesh 和高级 Ingress 控制器填补了这一空白。

### 11.5.2 核心原理

流量管理分为两个层次：

**Ingress 层（南北向流量）**：处理外部进入集群的流量。AWS ALB、NGINX Ingress Controller 等支持基于权重的路由和基于 Header 的路由。

**Service Mesh 层（东西向流量）**：处理服务之间的流量。Istio 提供完整的流量管理能力，包括权重路由、故障注入、超时重试、熔断等。

### 11.5.3 代码/配置实现

#### Istio 权重路由

```yaml
# istio/virtual-service-weight.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp
  namespace: production
spec:
  hosts:
    - myapp
  http:
    - match:
        - uri:
            prefix: /api
      route:
        - destination:
            host: myapp
            subset: v1
          weight: 90
        - destination:
            host: myapp
            subset: v2
          weight: 10
      timeout: 5s
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: connect-failure,refused-stream,unavailable
```

```yaml
# istio/destination-rule.yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: myapp
  namespace: production
spec:
  host: myapp
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 50
        http2MaxRequests: 100
    loadBalancer:
      simple: ROUND_ROBIN
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 60s
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

#### Istio Header 路由

```yaml
# istio/virtual-service-header.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp-canary
  namespace: production
spec:
  hosts:
    - myapp
  http:
    # Header 路由：仅特定用户进入新版本
    - match:
        - headers:
            x-canary:
              exact: "true"
            x-user-id:
              regex: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
      route:
        - destination:
            host: myapp
            subset: v2
      # 内部用户（通过 cookie）
    - match:
        - headers:
            cookie:
              regex: "^(.*;)?\\s*canary=true\\s*(;.*)?$"
      route:
        - destination:
            host: myapp
            subset: v2
    # 默认路由到稳定版本
    - route:
        - destination:
            host: myapp
            subset: v1
```

#### Istio 故障注入（用于验证灰度发布）

```yaml
# istio/fault-injection.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp-fault-test
  namespace: production
spec:
  hosts:
    - myapp
  http:
    - match:
        - headers:
            x-fault-test:
              exact: "enabled"
      fault:
        delay:
          percentage:
            value: 50
          fixedDelay: 3s
        abort:
          percentage:
            value: 10
          httpStatus: 500
      route:
        - destination:
            host: myapp
            subset: v2
    - route:
        - destination:
            host: myapp
            subset: v1
```

#### AWS ALB Ingress 权重路由

```yaml
# ingress/alb-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: production
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/actions.weighted-routing: |
      {
        "type": "forward",
        "forwardConfig": {
          "targetGroups": [
            {
              "serviceName": "myapp-v1",
              "servicePort": "80",
              "weight": 90
            },
            {
              "serviceName": "myapp-v2",
              "servicePort": "80",
              "weight": 10
            }
          ]
        }
      }
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp-v1
                port:
                  number: 80
```

#### Python 流量管理脚本

```python
#!/usr/bin/env python3
"""
traffic_manager.py - 流量管理脚本

支持 Istio VirtualService 权重调整和 Ingress 权重调整。
"""

import argparse
import json
import logging
import subprocess
import sys
import time

import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("traffic")


class TrafficManager:
    """流量管理器"""

    def __init__(self, namespace: str, app_name: str):
        self.namespace = namespace
        self.app_name = app_name

    def _kubectl(self, args: list[str]) -> str:
        cmd = ["kubectl", "-n", self.namespace] + args
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()

    def set_istio_weight(
        self,
        v1_subset: str,
        v2_subset: str,
        v1_weight: int,
        v2_weight: int,
        vs_name: Optional[str] = None,
    ):
        """设置 Istio VirtualService 的权重路由"""
        vs_name = vs_name or self.app_name

        logger.info(
            "Setting Istio weight: %s=%d%%, %s=%d%%",
            v1_subset, v1_weight, v2_subset, v2_weight,
        )

        vs = yaml.safe_load(
            self._kubectl(["get", "virtualservice", vs_name, "-o", "yaml"])
        )

        for http_route in vs["spec"]["http"]:
            for i, route in enumerate(http_route.get("route", [])):
                subset = route["destination"].get("subset", "")
                if subset == v1_subset:
                    http_route["route"][i]["weight"] = v1_weight
                elif subset == v2_subset:
                    http_route["route"][i]["weight"] = v2_weight

        self._kubectl([
            "apply", "-f", "-",
        ], input_data=yaml.dump(vs))

        logger.info("Istio weight updated")

    def gradual_shift(
        self,
        v1_subset: str,
        v2_subset: str,
        steps: list[tuple[int, int, int]],
        vs_name: Optional[str] = None,
    ):
        """逐步调整流量权重

        Args:
            steps: [(v1_weight, v2_weight, wait_seconds), ...]
        """
        logger.info("=== Starting gradual traffic shift ===")

        for i, (v1_w, v2_w, wait) in enumerate(steps):
            logger.info("Step %d: v1=%d%%, v2=%d%%, wait=%ds", i + 1, v1_w, v2_w, wait)
            self.set_istio_weight(v1_subset, v2_subset, v1_w, v2_w, vs_name)
            if wait > 0:
                logger.info("Waiting %d seconds...", wait)
                time.sleep(wait)

        logger.info("=== Gradual shift completed ===")

    def set_header_route(
        self,
        header_name: str,
        header_value: str,
        target_subset: str,
        vs_name: Optional[str] = None,
    ):
        """设置基于 Header 的路由规则"""
        vs_name = vs_name or self.app_name

        vs = yaml.safe_load(
            self._kubectl(["get", "virtualservice", vs_name, "-o", "yaml"])
        )

        header_rule = {
            "match": [
                {
                    "headers": {
                        header_name: {"exact": header_value}
                    }
                }
            ],
            "route": [
                {
                    "destination": {
                        "host": self.app_name,
                        "subset": target_subset,
                    }
                }
            ],
        }

        vs["spec"]["http"].insert(0, header_rule)

        self._kubectl([
            "apply", "-f", "-",
        ], input_data=yaml.dump(vs))

        logger.info(
            "Header route added: %s=%s -> %s",
            header_name, header_value, target_subset,
        )


def main():
    parser = argparse.ArgumentParser(description="Traffic Manager")
    parser.add_argument("--namespace", default="production")
    parser.add_argument("--app", required=True)

    subparsers = parser.add_subparsers(dest="action", required=True)

    # set-weight 子命令
    weight_parser = subparsers.add_parser("set-weight")
    weight_parser.add_argument("--v1-subset", default="v1")
    weight_parser.add_argument("--v2-subset", default="v2")
    weight_parser.add_argument("--v1-weight", type=int, required=True)
    weight_parser.add_argument("--v2-weight", type=int, required=True)
    weight_parser.add_argument("--vs-name")

    # gradual-shift 子命令
    shift_parser = subparsers.add_parser("gradual-shift")
    shift_parser.add_argument("--v1-subset", default="v1")
    shift_parser.add_argument("--v2-subset", default="v2")
    shift_parser.add_argument("--vs-name")

    # header-route 子命令
    header_parser = subparsers.add_parser("header-route")
    header_parser.add_argument("--header-name", required=True)
    header_parser.add_argument("--header-value", required=True)
    header_parser.add_argument("--target-subset", required=True)
    header_parser.add_argument("--vs-name")

    args = parser.parse_args()

    tm = TrafficManager(namespace=args.namespace, app_name=args.app)

    if args.action == "set-weight":
        tm.set_istio_weight(
            args.v1_subset, args.v2_subset,
            args.v1_weight, args.v2_weight,
            args.vs_name,
        )

    elif args.action == "gradual-shift":
        # 典型的渐进式流量迁移步骤
        steps = [
            (100, 0, 0),    # 初始：全部 v1
            (90, 10, 120),  # 10% 流量到 v2，观察 2 分钟
            (70, 30, 120),  # 30% 流量到 v2，观察 2 分钟
            (50, 50, 180),  # 50% 流量到 v2，观察 3 分钟
            (20, 80, 120),  # 80% 流量到 v2，观察 2 分钟
            (0, 100, 0),    # 全部切换到 v2
        ]
        tm.gradual_shift(
            args.v1_subset, args.v2_subset,
            steps, args.vs_name,
        )

    elif args.action == "header-route":
        tm.set_header_route(
            args.header_name, args.header_value,
            args.target_subset, args.vs_name,
        )


if __name__ == "__main__":
    main()
```

### 11.5.4 使用场景

- **金丝雀发布**：Istio 权重路由实现精确的流量百分比控制
- **A/B 测试**：基于 Header 或 Cookie 将特定用户路由到不同版本
- **多集群部署**：通过 DNS 权重或 Global Load Balancer 实现跨集群流量分配
- **故障演练**：通过 Istio 故障注入模拟网络延迟和服务故障

### 11.5.5 潜在风险与注意事项

- **Istio 控制面延迟**：VirtualService 变更后，Envoy Sidecar 需要时间同步配置（通常 5-30 秒）
- **ALB 权重精度**：AWS ALB 的权重路由基于 Target Group，最小权重为 1，对于低流量服务精度不足
- **Header 路由安全**：基于 Header 的路由可能被客户端伪造，需要服务端验证
- **Sidecar 资源开销**：Istio 为每个 Pod 注入 Envoy Sidecar，增加内存和 CPU 开销
- **调试复杂度**：流量经过多层路由后，问题定位变得困难，需要分布式追踪支持

### 11.5.6 本章小结

流量管理是渐进式交付的核心能力。Ingress 层处理南北向流量，适合外部用户的灰度发布；Service Mesh 层处理东西向流量，适合服务间的流量控制。Istio 的权重路由和 Header 路由为灰度发布和 A/B 测试提供了强大的基础设施，但也引入了额外的复杂性和资源开销。

---

## 11.6 潜在风险与应对

### 11.6.1 流量切换延迟

**问题**：更新 Service Selector 或 Istio VirtualService 后，流量不会立即切换到新版本。Kubernetes 的 iptables 规则更新、Envoy 的配置同步、DNS 缓存等都会引入延迟。

**应对方案**：
- 在切换后设置合理的等待时间（至少 5-10 秒）再执行健康检查
- 使用 preStop hook 优雅关闭旧 Pod，确保正在处理的请求完成
- 对于 Istio，使用 `--wait` 标志等待配置传播

```yaml
# Deployment 中的 preStop hook
lifecycle:
  preStop:
    exec:
      command:
        - sh
        - -c
        - |
          sleep 15
          kill -TERM 1
```

### 11.6.2 指标采集延迟

**问题**：Prometheus 的拉取间隔（默认 15s）和查询窗口（通常 5m）导致指标反馈存在分钟级延迟。在灰度发布的观察期内，可能已经发生了大量错误后才被检测到。

**应对方案**：
- 使用 Prometheus 的 `rate()` 函数配合短窗口（如 `[1m]`）加速检测
- 结合实时日志分析和健康检查作为补充
- 对于关键业务，使用流式指标（如 Prometheus Remote Write + Thanos Receive）减少延迟

### 11.6.3 灰度资源浪费

**问题**：灰度期间同时运行两套 Deployment，额外消耗 30%-100% 的集群资源。对于大规模集群，这种浪费可能非常显著。

**应对方案**：
- 使用 HPA（Horizontal Pod Autoscaler）自动缩减稳定版本的副本数
- 对于低流量服务，灰度副本数设为 1 即可
- 使用 Istio 的权重路由而非独立 Deployment，减少资源开销

```yaml
# 灰度期间自动缩减稳定版本
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-stable
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp-stable
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### 11.6.4 回滚数据一致性

**问题**：回滚到旧版本时，新版本可能已经写入了与旧版本不兼容的数据（如数据库 schema 变更、消息队列格式变化）。回滚后，旧版本无法正确处理这些数据。

**应对方案**：
- **数据库 schema 变更必须向后兼容**：只做 additive 变更（新增列而非删除/重命名列）
- **消息队列**：使用消息版本号或 schema registry，确保新旧版本都能解析
- **缓存**：回滚后清除可能包含新版本数据的缓存
- **数据修复脚本**：准备数据回滚脚本，在必要时执行

```python
# 回滚时的数据一致性检查
def check_data_compatibility(rollback_version: str, current_version: str) -> bool:
    """检查回滚目标版本是否兼容当前数据"""
    checks = [
        _check_db_schema_compatibility(rollback_version),
        _check_message_format_compatibility(rollback_version),
        _check_cache_key_compatibility(rollback_version),
    ]
    return all(checks)


def _check_db_schema_compatibility(version: str) -> bool:
    """检查数据库 schema 是否兼容指定版本"""
    schema_version = get_current_schema_version()
    required_version = get_required_schema_version(version)
    return schema_version >= required_version
```

### 11.6.5 连接耗尽与优雅关闭

**问题**：当 Service 从旧版本 Pod 切换到新版本 Pod 时，旧 Pod 上正在处理的请求可能被强制中断。如果应用没有实现优雅关闭，用户会收到 502 错误。

**应对方案**：
- 配置 `terminationGracePeriodSeconds`（建议 30-60 秒）
- 实现 preStop hook，在收到 SIGTERM 后等待一段时间再退出
- 在应用层面实现 draining 机制，拒绝新请求但完成正在处理的请求

```python
# Python 应用中的优雅关闭
import signal
import time
from flask import Flask

app = Flask(__name__)
shutting_down = False


@app.route("/healthz")
def healthz():
    if shutting_down:
        return "shutting down", 503
    return "ok", 200


def handle_sigterm(signum, frame):
    global shutting_down
    shutting_down = True
    time.sleep(10)


signal.signal(signal.SIGTERM, handle_sigterm)
```

### 11.6.6 风险矩阵总结

| 风险 | 影响 | 概率 | 检测手段 | 应对策略 |
|------|------|------|----------|----------|
| 流量切换延迟 | 部分用户仍访问旧版本 | 高 | 流量监控 | preStop hook + 等待窗口 |
| 指标采集延迟 | 故障发现滞后 | 中 | 多维度监控 | 短窗口 + 日志补充 |
| 灰度资源浪费 | 成本增加 | 高 | 资源监控 | HPA + 最小副本 |
| 数据不一致 | 回滚后服务异常 | 低 | 数据校验 | 向后兼容 + schema registry |
| 连接中断 | 用户感知错误 | 中 | 错误率监控 | 优雅关闭 + draining |

### 11.6.7 本章小结

渐进式交付的每个环节都有其固有的风险。理解这些风险不是要放弃渐进式交付，而是要在设计系统时提前考虑应对方案。流量切换延迟、指标采集延迟、资源浪费和数据一致性是四个最需要关注的风险维度。通过合理的架构设计（向后兼容、优雅关闭、多维度监控）和工具选择（Istio、Prometheus、HPA），可以将这些风险控制在可接受的范围内。

---

## 11.7 综合实践：完整的渐进式交付流水线

### 11.7.1 架构总览

将本章所有技术整合为一个完整的渐进式交付流水线：

```
代码提交 → CI 构建 → 镜像推送 → Helm 原子发布 → 灰度发布 → 流量迁移 → 自动回滚监控 → 完成
```

### 11.7.2 完整流水线脚本

```python
#!/usr/bin/env python3
"""
progressive_delivery.py - 完整的渐进式交付流水线

整合 Helm 原子发布、灰度发布、蓝绿部署、自动回滚和流量管理。
"""

import argparse
import json
import logging
import subprocess
import sys
import time
from enum import Enum
from typing import Optional

import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("progressive")


class Strategy(Enum):
    ATOMIC = "atomic"
    CANARY = "canary"
    BLUE_GREEN = "blue-green"


class ProgressiveDelivery:
    """渐进式交付流水线"""

    def __init__(
        self,
        namespace: str,
        release_name: str,
        chart_path: str,
        new_version: str,
        strategy: Strategy = Strategy.CANARY,
        replicas: int = 3,
        canary_replicas: int = 1,
        prometheus_url: str = "http://localhost:9090",
        error_threshold: float = 0.01,
        latency_threshold: float = 0.5,
        observation_period: int = 300,
        health_check_failure_threshold: int = 3,
        webhook_url: Optional[str] = None,
    ):
        self.namespace = namespace
        self.release_name = release_name
        self.chart_path = chart_path
        self.new_version = new_version
        self.strategy = strategy
        self.replicas = replicas
        self.canary_replicas = canary_replicas
        self.prometheus_url = prometheus_url
        self.error_threshold = error_threshold
        self.latency_threshold = latency_threshold
        self.observation_period = observation_period
        self.health_check_failure_threshold = health_check_failure_threshold
        self.webhook_url = webhook_url

    def _run_helm_upgrade(self):
        """执行 Helm 原子发布"""
        logger.info("=== Step 1: Helm Atomic Upgrade ===")

        cmd = [
            "helm", "upgrade", self.release_name, self.chart_path,
            "--namespace", self.namespace,
            "--atomic", "--wait",
            "--timeout", "5m",
            "--cleanup-on-fail",
            "--set", f"image.tag={self.new_version}",
            "--set", "image.pullPolicy=Always",
        ]

        subprocess.run(cmd, check=True)
        logger.info("Helm upgrade completed")

    def _run_helm_test(self):
        """运行 Helm test"""
        logger.info("=== Step 2: Helm Test ===")
        subprocess.run(
            ["helm", "test", self.release_name, "--namespace", self.namespace, "--logs"],
            check=True,
        )
        logger.info("Helm test passed")

    def _run_canary_release(self):
        """执行灰度发布"""
        logger.info("=== Step 3: Canary Release ===")

        from canary_release import CanaryRelease

        canary = CanaryRelease(
            namespace=self.namespace,
            app_name=self.release_name,
            new_version=self.new_version,
            canary_replicas=self.canary_replicas,
            stable_replicas=self.replicas,
            prometheus_url=self.prometheus_url,
            error_threshold=self.error_threshold,
            latency_threshold=self.latency_threshold,
            observation_period=self.observation_period,
        )

        result = canary.start()

        if result["decision"] != "promote":
            logger.error("Canary release failed: %s", result["reason"])
            sys.exit(1)

        logger.info("Canary release promoted")

    def _run_blue_green(self):
        """执行蓝绿部署"""
        logger.info("=== Step 3: Blue-Green Deployment ===")

        from blue_green import BlueGreenDeploy

        bg = BlueGreenDeploy(
            namespace=self.namespace,
            app_name=self.release_name,
            new_version=self.new_version,
            replicas=self.replicas,
        )

        bg.deploy_new()
        bg.switch_traffic()

        logger.info("Blue-green deployment completed")

    def _run_auto_rollback_monitor(self):
        """启动自动回滚监控"""
        logger.info("=== Step 4: Auto-Rollback Monitor ===")

        from auto_rollback import AutoRollbackController

        controller = AutoRollbackController(
            namespace=self.namespace,
            release_name=self.release_name,
            prometheus_url=self.prometheus_url,
            health_check_interval=10,
            health_check_failure_threshold=self.health_check_failure_threshold,
            error_rate_threshold=self.error_threshold,
            latency_p99_threshold=self.latency_threshold,
            observation_timeout=self.observation_period,
            webhook_url=self.webhook_url,
        )

        controller.monitor()
        logger.info("Auto-rollback monitor passed")

    def _run_traffic_shift(self):
        """执行流量迁移（仅 Istio 模式）"""
        logger.info("=== Step 5: Traffic Shift ===")

        from traffic_manager import TrafficManager

        tm = TrafficManager(namespace=self.namespace, app_name=self.release_name)

        steps = [
            (100, 0, 0),
            (90, 10, 120),
            (70, 30, 120),
            (50, 50, 180),
            (20, 80, 120),
            (0, 100, 0),
        ]

        tm.gradual_shift("v1", "v2", steps)
        logger.info("Traffic shift completed")

    def _cleanup_old(self):
        """清理旧版本资源"""
        logger.info("=== Step 6: Cleanup ===")

        if self.strategy == Strategy.BLUE_GREEN:
            from blue_green import BlueGreenDeploy
            bg = BlueGreenDeploy(
                namespace=self.namespace,
                app_name=self.release_name,
                new_version=self.new_version,
            )
            bg.cleanup_old()

        logger.info("Cleanup completed")

    def run(self):
        """执行完整的渐进式交付流水线"""
        start_time = time.time()
        logger.info("=" * 60)
        logger.info("Progressive Delivery Pipeline")
        logger.info("Release: %s/%s", self.namespace, self.release_name)
        logger.info("Version: %s", self.new_version)
        logger.info("Strategy: %s", self.strategy.value)
        logger.info("=" * 60)

        try:
            self._run_helm_upgrade()
            self._run_helm_test()

            if self.strategy == Strategy.CANARY:
                self._run_canary_release()
            elif self.strategy == Strategy.BLUE_GREEN:
                self._run_blue_green()

            self._run_auto_rollback_monitor()
            self._run_traffic_shift()
            self._cleanup_old()

            elapsed = time.time() - start_time
            logger.info("=" * 60)
            logger.info("Pipeline completed in %.0f seconds", elapsed)
            logger.info("=" * 60)

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error("Pipeline failed after %.0f seconds: %s", elapsed, e)
            sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Progressive Delivery Pipeline")
    parser.add_argument("--namespace", default="production")
    parser.add_argument("--release", required=True)
    parser.add_argument("--chart", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--strategy", choices=["atomic", "canary", "blue-green"], default="canary")
    parser.add_argument("--replicas", type=int, default=3)
    parser.add_argument("--canary-replicas", type=int, default=1)
    parser.add_argument("--prometheus-url", default="http://prometheus.monitoring:9090")
    parser.add_argument("--error-threshold", type=float, default=0.01)
    parser.add_argument("--latency-threshold", type=float, default=0.5)
    parser.add_argument("--observation-period", type=int, default=300)
    parser.add_argument("--failure-threshold", type=int, default=3)
    parser.add_argument("--webhook-url")

    args = parser.parse_args()

    pipeline = ProgressiveDelivery(
        namespace=args.namespace,
        release_name=args.release,
        chart_path=args.chart,
        new_version=args.version,
        strategy=Strategy(args.strategy),
        replicas=args.replicas,
        canary_replicas=args.canary_replicas,
        prometheus_url=args.prometheus_url,
        error_threshold=args.error_threshold,
        latency_threshold=args.latency_threshold,
        observation_period=args.observation_period,
        health_check_failure_threshold=args.failure_threshold,
        webhook_url=args.webhook_url,
    )

    pipeline.run()


if __name__ == "__main__":
    main()
```

### 11.7.3 策略选择指南

| 场景 | 推荐策略 | 原因 |
|------|----------|------|
| 低风险补丁发布 | 原子发布 | 简单快速，资源消耗最低 |
| 新功能上线 | 灰度发布 | 逐步暴露，风险可控 |
| 大版本升级 | 蓝绿部署 | 充分验证，快速回滚 |
| 实验性功能 | 灰度 + Header 路由 | 仅特定用户可见 |
| 紧急修复 | 原子发布 | 最快速度修复 |

### 11.7.4 监控与可观测性

```yaml
# 发布期间的 Grafana 仪表盘配置
apiVersion: v1
kind: ConfigMap
metadata:
  name: rollout-dashboard
  namespace: monitoring
data:
  rollout-dashboard.json: |
    {
      "title": "Rollout Monitor",
      "panels": [
        {
          "title": "Error Rate by Version",
          "type": "graph",
          "targets": [
            {
              "expr": "sum(rate(http_requests_total{app=\"myapp\",status=~\"5..\"}[1m])) by (version) / sum(rate(http_requests_total{app=\"myapp\"}[1m])) by (version)"
            }
          ]
        },
        {
          "title": "P99 Latency by Version",
          "type": "graph",
          "targets": [
            {
              "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{app=\"myapp\"}[1m])) by (le, version))"
            }
          ]
        },
        {
          "title": "Traffic Distribution",
          "type": "piechart",
          "targets": [
            {
              "expr": "sum(rate(http_requests_total{app=\"myapp\"}[1m])) by (version)"
            }
          ]
        }
      ]
    }
```

---

## 11.8 本章总结

渐进式交付是现代云原生应用发布的核心理念。本章从四个维度构建了完整的渐进式交付体系：

1. **Helm 原子发布**提供了发布的基础保障，通过 `--atomic`、`--wait` 和 test hooks 确保每次发布要么完全成功要么完全回滚。

2. **灰度发布**通过 Python 脚本实现了精细的流量控制，将新版本逐步暴露给用户，配合 Prometheus 指标监控实现自动决策。

3. **蓝绿部署**提供了瞬间切换能力，适合需要充分预验证的场景，但资源消耗更大。

4. **自动回滚策略**作为安全网，通过健康检查和指标监控实现秒级故障恢复。

5. **流量管理**通过 Istio Service Mesh 和 Ingress 控制器实现了权重路由和 Header 路由，为灰度发布和 A/B 测试提供了基础设施。

6. **风险意识**贯穿始终——流量切换延迟、指标采集延迟、资源浪费和数据一致性是每个实践者都需要认真对待的问题。

选择哪种策略取决于业务需求：追求简单选原子发布，追求安全选灰度发布，追求速度选蓝绿部署。在实际生产中，通常需要组合使用多种策略，并根据业务特点持续优化阈值和参数。

渐进式交付不是一次性工程，而是一个持续演进的过程。随着业务规模的增长和基础设施的成熟，发布策略也需要不断迭代——从全量发布到原子发布，再到灰度发布，最终实现完全自动化的渐进式交付。
