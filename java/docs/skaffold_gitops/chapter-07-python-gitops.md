# 第7章 Python脚本实现GitOps自动化

## 7.1 概述

GitOps 的核心思想是将声明式基础设施和应用程序配置存储在 Git 仓库中，并以 Git 作为单一事实来源。然而，在实际生产环境中，完全依赖手动操作 Git 仓库是不现实的。我们需要自动化脚本来完成镜像标签更新、环境提升、健康检查、回滚、漂移检测等重复性操作。

Python 凭借其丰富的生态库（GitPython、PyYAML、kubernetes、boto3、requests），成为实现 GitOps 自动化脚本的理想语言。本章将深入讲解如何用 Python 构建一套完整的 GitOps 自动化工具链。

---

## 7.2 Git 仓库操作自动化

### 7.2.1 解决的问题

在 GitOps 工作流中，CI/CD 管道需要频繁与 Git 仓库交互：克隆代码、创建分支、提交变更、推送远程、创建 Pull Request、对比差异。手动执行这些操作效率低下且容易出错，尤其在多环境、多仓库的场景下。

### 7.2.2 核心原理

GitPython 库封装了底层 Git 命令，提供面向对象的 API。核心流程为：

1. 使用 `Repo.clone_from()` 克隆远程仓库
2. 使用 `repo.create_head()` 或 `repo.head.reference` 切换分支
3. 使用 `repo.index.add()` 暂存变更
4. 使用 `repo.index.commit()` 提交
5. 使用 `repo.remote().push()` 推送远程
6. 通过 GitHub/GitLab API 创建 PR

### 7.2.3 代码实现

```python
#!/usr/bin/env python3
"""
gitops_git_utils.py — Git 仓库操作工具集
"""

import os
import logging
from pathlib import Path
from typing import Optional

import git
from git import Repo, GitCommandError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class GitOpsRepo:
    """封装 Git 仓库的常见操作"""

    def __init__(self, repo_url: str, repo_path: str | Path, branch: str = "main"):
        self.repo_url = repo_url
        self.repo_path = Path(repo_path)
        self.branch = branch
        self.repo: Optional[Repo] = None

    def clone(self, depth: int = 1) -> Repo:
        """克隆仓库到本地路径"""
        if self.repo_path.exists():
            logger.info(f"仓库已存在: {self.repo_path}，执行 pull 更新")
            self.repo = Repo(self.repo_path)
            self.repo.remotes.origin.pull()
        else:
            logger.info(f"克隆仓库 {self.repo_url} -> {self.repo_path}")
            self.repo = Repo.clone_from(
                self.repo_url, self.repo_path, depth=depth, branch=self.branch
            )
        return self.repo

    def checkout_branch(self, branch_name: str, create: bool = False) -> None:
        """切换分支，可选创建新分支"""
        if create:
            logger.info(f"创建并切换到分支: {branch_name}")
            self.repo.create_head(branch_name, self.repo.head.commit)
        self.repo.git.checkout(branch_name)
        logger.info(f"已切换到分支: {branch_name}")

    def commit_changes(
        self, message: str, files: Optional[list[str]] = None
    ) -> str:
        """暂存并提交变更，返回 commit SHA"""
        if files:
            self.repo.index.add(files)
        else:
            # 暂存所有变更（不包括未跟踪文件）
            self.repo.index.add(
                [item.a_path for item in self.repo.index.diff(None)]
            )
            # 添加未跟踪文件
            untracked = self.repo.untracked_files
            if untracked:
                self.repo.index.add(untracked)

        if self.repo.index.diff("HEAD"):
            commit = self.repo.index.commit(message)
            logger.info(f"提交成功: {commit.hexsha[:8]} - {message}")
            return commit.hexsha
        else:
            logger.info("无变更需要提交")
            return ""

    def push(self, remote: str = "origin", branch: str = "") -> None:
        """推送到远程仓库"""
        branch = branch or self.repo.active_branch.name
        logger.info(f"推送 {branch} 到 {remote}")
        self.repo.remote(remote).push(branch)

    def diff_between_branches(
        self, base: str, head: str, paths: Optional[list[str]] = None
    ) -> list[str]:
        """对比两个分支的差异，返回变更文件列表"""
        self.repo.git.fetch()
        diff = self.repo.git.diff(f"{base}..{head}", name_only=True).split("\n")
        result = [f.strip() for f in diff if f.strip()]
        if paths:
            result = [f for f in result if any(f.startswith(p) for p in paths)]
        return result

    def get_current_commit(self) -> str:
        """获取当前 HEAD 的 commit SHA"""
        return self.repo.head.commit.hexsha

    def cleanup(self) -> None:
        """清理本地仓库"""
        if self.repo_path.exists():
            import shutil
            shutil.rmtree(self.repo_path)
            logger.info(f"已清理本地仓库: {self.repo_path}")


# ========== 使用示例 ==========
if __name__ == "__main__":
    # 克隆配置仓库并提交变更
    repo = GitOpsRepo(
        repo_url="https://github.com/example/gitops-config.git",
        repo_path="/tmp/gitops-config",
        branch="main",
    )
    repo.clone()
    repo.checkout_branch("feat/update-app-v2", create=True)

    # 修改 values 文件
    values_path = repo.repo_path / "helm/values.yaml"
    content = values_path.read_text()
    content = content.replace("tag: v1.0.0", "tag: v2.0.0")
    values_path.write_text(content)

    repo.commit_changes("feat: update app image tag to v2.0.0", ["helm/values.yaml"])
    repo.push()
```

### 7.2.4 使用场景

- CI/CD 管道自动更新配置仓库
- 批量跨仓库更新镜像标签
- 自动创建环境提升 PR
- 审计和合规性检查的差异对比

### 7.2.5 潜在风险与注意事项

- **认证方式**：推荐使用 SSH 密钥或 Personal Access Token，避免密码明文存储
- **并发冲突**：多个管道同时操作同一仓库时可能产生冲突，建议使用分支隔离
- **大仓库性能**：使用 `depth=1` 浅克隆减少传输量
- **提交签名**：生产环境建议启用 GPG 签名提交

### 7.2.6 本章小结

GitPython 提供了简洁的面向对象 API 来操作 Git 仓库。通过封装 `GitOpsRepo` 类，我们可以将克隆、分支、提交、推送、差异对比等操作标准化，为后续的自动化脚本提供坚实基础。

---

## 7.3 Helm Values 自动更新

### 7.3.1 解决的问题

Helm Chart 的 `values.yaml` 文件是 GitOps 配置仓库的核心。每次部署新版本时，需要更新镜像标签、副本数、环境变量等参数。手动编辑 YAML 文件容易引入格式错误或遗漏字段。

### 7.3.2 核心原理

使用 `PyYAML` 库解析和生成 YAML 文件。YAML 的字典/列表结构天然映射到 Python 的 `dict`/`list`，我们可以通过键路径（如 `image.tag`）精确定位并修改值，然后序列化写回文件。

### 7.3.3 代码实现

```python
#!/usr/bin/env python3
"""
helm_values_updater.py — Helm values.yaml 自动更新工具
"""

import os
import sys
import copy
import logging
from pathlib import Path
from typing import Any, Optional

import yaml

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class HelmValuesUpdater:
    """Helm values.yaml 更新器"""

    def __init__(self, values_path: str | Path):
        self.values_path = Path(values_path)
        self.data: dict = {}
        self._load()

    def _load(self) -> None:
        """加载 YAML 文件"""
        if not self.values_path.exists():
            raise FileNotFoundError(f"values 文件不存在: {self.values_path}")
        with open(self.values_path, "r", encoding="utf-8") as f:
            self.data = yaml.safe_load(f) or {}
        logger.info(f"已加载 values 文件: {self.values_path}")

    def save(self, backup: bool = True) -> None:
        """写回 YAML 文件，可选创建备份"""
        if backup:
            backup_path = self.values_path.with_suffix(".yaml.bak")
            self.values_path.rename(backup_path)
            logger.info(f"已创建备份: {backup_path}")

        with open(self.values_path, "w", encoding="utf-8") as f:
            yaml.dump(self.data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        logger.info(f"已保存 values 文件: {self.values_path}")

    @staticmethod
    def _nested_get(d: dict, keys: list[str]) -> Any:
        """按键路径获取嵌套字典的值"""
        current = d
        for k in keys:
            if isinstance(current, dict):
                current = current.get(k)
            else:
                return None
        return current

    @staticmethod
    def _nested_set(d: dict, keys: list[str], value: Any) -> None:
        """按键路径设置嵌套字典的值"""
        current = d
        for k in keys[:-1]:
            if k not in current:
                current[k] = {}
            current = current[k]
        current[keys[-1]] = value

    def update_image_tag(self, image_name: str, new_tag: str) -> bool:
        """
        更新指定镜像的标签。
        支持两种 values 结构：
          image: { repository: nginx, tag: v1 }
          images: [{ name: nginx, tag: v1 }, ...]
        """
        updated = False

        # 结构一: image.repository + image.tag
        if "image" in self.data and isinstance(self.data["image"], dict):
            repo = self.data["image"].get("repository", "")
            if image_name in repo:
                old_tag = self.data["image"].get("tag", "")
                self.data["image"]["tag"] = new_tag
                logger.info(f"镜像 {repo}: {old_tag} -> {new_tag}")
                updated = True

        # 结构二: images 列表
        if "images" in self.data and isinstance(self.data["images"], list):
            for img in self.data["images"]:
                if img.get("name") == image_name:
                    old_tag = img.get("tag", "")
                    img["tag"] = new_tag
                    logger.info(f"镜像 {image_name}: {old_tag} -> {new_tag}")
                    updated = True

        return updated

    def update_replica_count(self, replica_key: str, count: int) -> None:
        """更新副本数，支持自定义键路径如 'autoscaling.minReplicas'"""
        keys = replica_key.split(".")
        old = self._nested_get(self.data, keys)
        self._nested_set(self.data, keys, count)
        logger.info(f"副本数 {replica_key}: {old} -> {count}")

    def update_env_vars(self, env_updates: dict[str, str]) -> None:
        """
        更新环境变量。
        env_updates 格式: { "KEY": "VALUE" }
        支持 env: [{ name: KEY, value: VAL }] 和 env: { KEY: VAL } 两种结构
        """
        env_list = self.data.get("env", [])
        if isinstance(env_list, list):
            name_to_idx = {
                item["name"]: idx
                for idx, item in enumerate(env_list)
                if "name" in item
            }
            for key, val in env_updates.items():
                if key in name_to_idx:
                    old = env_list[name_to_idx[key]].get("value", "")
                    env_list[name_to_idx[key]]["value"] = val
                else:
                    env_list.append({"name": key, "value": val})
                logger.info(f"环境变量 {key}: 已更新为 {val}")
        elif isinstance(env_list, dict):
            for key, val in env_updates.items():
                old = env_list.get(key, "")
                env_list[key] = val
                logger.info(f"环境变量 {key}: {old} -> {val}")

    def get_value(self, key_path: str) -> Any:
        """按点分键路径获取值，如 'image.tag'"""
        return self._nested_get(self.data, key_path.split("."))

    def set_value(self, key_path: str, value: Any) -> None:
        """按点分键路径设置值"""
        old = self.get_value(key_path)
        self._nested_set(self.data, key_path.split("."), value)
        logger.info(f"{key_path}: {old} -> {value}")


# ========== 使用示例 ==========
if __name__ == "__main__":
    updater = HelmValuesUpdater("helm/values.yaml")

    # 更新镜像标签
    updater.update_image_tag("nginx", "v2.1.0")

    # 更新副本数
    updater.update_replica_count("replicaCount", 5)

    # 更新环境变量
    updater.update_env_vars({"LOG_LEVEL": "debug", "MAX_CONNECTIONS": "200"})

    # 保存
    updater.save(backup=True)
```

### 7.3.4 使用场景

- CI/CD 管道在构建完成后自动更新部署配置
- 多环境（dev/staging/prod）的配置同步
- 蓝绿部署和金丝雀发布中的参数调整
- 自动扩缩容时的副本数调整

### 7.3.5 潜在风险与注意事项

- **YAML 格式保持**：`yaml.dump` 可能改变原始格式（如注释丢失），建议使用 `ruamel.yaml` 保留注释
- **类型安全**：YAML 中的数字和布尔值在序列化时可能改变类型，需显式处理
- **备份策略**：修改前务必创建备份，以便快速恢复
- **并发写入**：避免多个进程同时修改同一文件

### 7.3.6 本章小结

`HelmValuesUpdater` 封装了 values.yaml 的常见更新操作，支持镜像标签、副本数、环境变量等字段的精确修改。通过键路径机制，可以灵活定位任意深度的嵌套字段。

---

## 7.4 镜像标签自动更新

### 7.4.1 解决的问题

每次 CI 构建生成新镜像后，需要将镜像标签更新到 GitOps 配置仓库中。手动查找最新标签并更新多个配置文件（Kustomize、Helm）效率低下且容易出错。

### 7.4.2 核心原理

1. 使用 AWS ECR（或 Docker Registry）API 列出所有镜像标签
2. 使用语义化版本（SemVer）解析器排序，找到最新版本
3. 同时更新 Kustomize 的 `kustomization.yaml` 和 Helm 的 `values.yaml`
4. 提交并推送变更到 Git 仓库

### 7.4.3 代码实现

```python
#!/usr/bin/env python3
"""
image_tag_auto_updater.py — 镜像标签自动发现与更新
"""

import re
import json
import logging
import subprocess
from pathlib import Path
from typing import Optional

import boto3
import yaml

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class SemVer:
    """简易语义化版本比较"""

    def __init__(self, version: str):
        self.raw = version
        self.prefix = ""
        parsed = self._parse(version)
        self.major = parsed["major"]
        self.minor = parsed["minor"]
        self.patch = parsed["patch"]
        self.prerelease = parsed["prerelease"]
        self.build = parsed["build"]

    @staticmethod
    def _parse(v: str) -> dict:
        # 匹配 v1.2.3, 1.2.3, v1.2.3-rc.1, 1.2.3+build.123
        pattern = r"^([vV]?)(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?(?:\+([\w.]+))?$"
        m = re.match(pattern, v.strip())
        if not m:
            raise ValueError(f"无效的语义化版本: {v}")
        return {
            "prefix": m.group(1),
            "major": int(m.group(2)),
            "minor": int(m.group(3)),
            "patch": int(m.group(4)),
            "prerelease": m.group(5) or "",
            "build": m.group(6) or "",
        }

    def __lt__(self, other: "SemVer") -> bool:
        if self.major != other.major:
            return self.major < other.major
        if self.minor != other.minor:
            return self.minor < other.minor
        if self.patch != other.patch:
            return self.patch < other.patch
        # 有 prerelease 的版本小于正式版
        if self.prerelease and not other.prerelease:
            return True
        if not self.prerelease and other.prerelease:
            return False
        return self.prerelease < other.prerelease

    def __eq__(self, other: "SemVer") -> bool:
        return (
            self.major == other.major
            and self.minor == other.minor
            and self.patch == other.patch
            and self.prerelease == other.prerelease
        )

    def __str__(self) -> str:
        return self.raw


class ECRImageLister:
    """从 AWS ECR 获取镜像标签列表"""

    def __init__(self, region: str = "ap-northeast-1", profile: str = ""):
        session = boto3.Session(profile_name=profile) if profile else boto3.Session()
        self.client = session.client("ecr", region_name=region)

    def list_tags(self, repository_name: str) -> list[str]:
        """列出指定仓库的所有镜像标签"""
        tags = []
        paginator = self.client.get_paginator("describe_images")
        for page in paginator.paginate(repositoryName=repository_name):
            for image in page.get("imageDetails", []):
                tags.extend(image.get("imageTags", []))
        return tags

    def find_latest_semver(self, repository_name: str) -> Optional[str]:
        """按语义化版本找到最新标签"""
        tags = self.list_tags(repository_name)
        valid_versions = []
        for tag in tags:
            try:
                valid_versions.append(SemVer(tag))
            except ValueError:
                logger.debug(f"跳过非 SemVer 标签: {tag}")

        if not valid_versions:
            return None

        valid_versions.sort(reverse=True)
        latest = valid_versions[0]
        logger.info(f"仓库 {repository_name} 最新标签: {latest}")
        return str(latest)


class KustomizeImageUpdater:
    """更新 Kustomize kustomization.yaml 中的镜像标签"""

    def __init__(self, kustomize_path: str | Path):
        self.path = Path(kustomize_path) / "kustomization.yaml"

    def update_image(self, image_name: str, new_tag: str) -> bool:
        """更新 kustomization.yaml 中的镜像标签"""
        if not self.path.exists():
            logger.warning(f"kustomization.yaml 不存在: {self.path}")
            return False

        with open(self.path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        images = data.get("images", [])
        updated = False
        for img in images:
            if img.get("name") == image_name:
                old_tag = img.get("newTag", "")
                img["newTag"] = new_tag
                logger.info(f"Kustomize 镜像 {image_name}: {old_tag} -> {new_tag}")
                updated = True

        if updated:
            with open(self.path, "w", encoding="utf-8") as f:
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            logger.info(f"已更新 kustomization.yaml: {self.path}")
        return updated


class ImageTagAutoUpdater:
    """镜像标签自动更新编排器"""

    def __init__(
        self,
        ecr_region: str,
        ecr_profile: str = "",
        repo_url: str = "",
        repo_path: str | Path = "/tmp/gitops-config",
        git_branch: str = "main",
    ):
        self.ecr = ECRImageLister(region=ecr_region, profile=ecr_profile)
        self.repo_url = repo_url
        self.repo_path = Path(repo_path)
        self.git_branch = git_branch

    def run(
        self,
        ecr_repo: str,
        image_name: str,
        helm_values_path: str | Path = "",
        kustomize_path: str | Path = "",
    ) -> bool:
        """执行完整的镜像标签自动更新流程"""
        # 1. 查找最新标签
        latest_tag = self.ecr.find_latest_semver(ecr_repo)
        if not latest_tag:
            logger.error(f"未找到有效的 SemVer 标签: {ecr_repo}")
            return False

        # 2. 克隆配置仓库
        from gitops_git_utils import GitOpsRepo

        git_repo = GitOpsRepo(self.repo_url, self.repo_path, self.git_branch)
        git_repo.clone()
        git_repo.checkout_branch(f"auto/update-{image_name}-{latest_tag}", create=True)

        # 3. 更新 Helm values
        if helm_values_path:
            from helm_values_updater import HelmValuesUpdater

            updater = HelmValuesUpdater(Path(self.repo_path) / helm_values_path)
            updater.update_image_tag(image_name, latest_tag)
            updater.save(backup=True)

        # 4. 更新 Kustomize
        if kustomize_path:
            kustomize_updater = KustomizeImageUpdater(Path(self.repo_path) / kustomize_path)
            kustomize_updater.update_image(image_name, latest_tag)

        # 5. 提交并推送
        commit_msg = f"chore: auto-update image {image_name} to {latest_tag}"
        git_repo.commit_changes(commit_msg)
        git_repo.push()

        logger.info(f"镜像标签更新完成: {image_name} -> {latest_tag}")
        return True


# ========== 使用示例 ==========
if __name__ == "__main__":
    updater = ImageTagAutoUpdater(
        ecr_region="ap-northeast-1",
        repo_url="https://github.com/example/gitops-config.git",
        repo_path="/tmp/gitops-config",
    )
    updater.run(
        ecr_repo="myapp",
        image_name="myapp",
        helm_values_path="helm/prod/values.yaml",
        kustomize_path="kustomize/overlays/prod",
    )
```

### 7.4.4 使用场景

- CI 构建完成后自动触发镜像标签更新
- 多环境（dev/staging/prod）的镜像版本同步
- 安全补丁发布时快速更新所有环境的镜像版本
- 镜像清理策略中识别可删除的旧版本

### 7.4.5 潜在风险与注意事项

- **ECR 认证**：确保运行环境有正确的 AWS 凭证（IAM Role 或 Profile）
- **标签过滤**：并非所有标签都是 SemVer 格式，需要合理过滤（如 `latest`、`sha-xxxxx`）
- **并发更新**：多个镜像同时更新时，应使用独立分支避免冲突
- **回滚策略**：更新后应触发健康检查，失败时自动回滚

### 7.4.6 本章小结

镜像标签自动更新是 GitOps 自动化的核心场景。通过 ECR API 获取最新标签、SemVer 解析排序、同时更新 Helm 和 Kustomize 配置，实现了从镜像构建到配置更新的全自动化闭环。

---

## 7.5 环境提升脚本

### 7.5.1 解决的问题

在 GitOps 实践中，应用需要经过 dev → staging → prod 的逐步提升。手动执行环境提升容易遗漏步骤，且缺乏自动化的健康检查和回滚机制。

### 7.5.2 核心原理

环境提升是一个多步骤的管道：

1. 从源环境分支获取当前配置
2. 将配置合并到目标环境分支
3. 更新目标环境的 values.yaml（镜像标签、副本数、环境变量等）
4. 提交并推送变更
5. 等待 ArgoCD/Flux 同步
6. 执行健康检查
7. 健康检查失败时自动回滚

### 7.5.3 代码实现

```python
#!/usr/bin/env python3
"""
environment_promoter.py — 环境提升自动化脚本
"""

import os
import sys
import time
import json
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

import requests
import yaml

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class EnvironmentConfig:
    """环境配置"""
    name: str
    branch: str
    helm_values_path: str
    kustomize_path: str = ""
    health_check_url: str = ""
    required_replicas: int = 3
    namespace: str = "default"
    promotion_approval_required: bool = False


class EnvironmentPromoter:
    """环境提升编排器"""

    def __init__(
        self,
        repo_url: str,
        repo_path: str | Path = "/tmp/gitops-config",
        environments: Optional[dict[str, EnvironmentConfig]] = None,
    ):
        self.repo_url = repo_url
        self.repo_path = Path(repo_path)
        self.envs = environments or self._default_environments()
        self.rollback_commit: Optional[str] = None

    @staticmethod
    def _default_environments() -> dict[str, EnvironmentConfig]:
        return {
            "dev": EnvironmentConfig(
                name="dev",
                branch="dev",
                helm_values_path="helm/dev/values.yaml",
                health_check_url="https://dev.example.com/health",
                required_replicas=1,
                namespace="dev",
            ),
            "staging": EnvironmentConfig(
                name="staging",
                branch="staging",
                helm_values_path="helm/staging/values.yaml",
                health_check_url="https://staging.example.com/health",
                required_replicas=2,
                namespace="staging",
            ),
            "prod": EnvironmentConfig(
                name="prod",
                branch="main",
                helm_values_path="helm/prod/values.yaml",
                health_check_url="https://example.com/health",
                required_replicas=3,
                namespace="prod",
                promotion_approval_required=True,
            ),
        }

    def promote(
        self,
        source_env: str,
        target_env: str,
        image_tag: str = "",
        replica_count: int = 0,
        env_vars: Optional[dict[str, str]] = None,
        skip_health_check: bool = False,
    ) -> bool:
        """
        执行环境提升流程

        参数:
            source_env: 源环境名称
            target_env: 目标环境名称
            image_tag: 可选，指定镜像标签
            replica_count: 可选，指定副本数
            env_vars: 可选，环境变量更新
            skip_health_check: 是否跳过健康检查
        """
        if target_env not in self.envs:
            logger.error(f"未知的目标环境: {target_env}")
            return False

        target = self.envs[target_env]

        # 1. 检查是否需要审批
        if target.promotion_approval_required:
            logger.warning(f"环境 {target_env} 需要审批，请手动批准后重试")
            return False

        # 2. 克隆仓库并切换到目标分支
        from gitops_git_utils import GitOpsRepo

        git_repo = GitOpsRepo(self.repo_url, self.repo_path, target.branch)
        git_repo.clone()
        git_repo.checkout_branch(target.branch)

        # 记录回滚点
        self.rollback_commit = git_repo.get_current_commit()
        logger.info(f"回滚点: {self.rollback_commit}")

        # 3. 创建提升分支
        branch_name = f"promote/{source_env}-to-{target_env}-{int(time.time())}"
        git_repo.checkout_branch(branch_name, create=True)

        # 4. 更新 Helm values
        from helm_values_updater import HelmValuesUpdater

        values_path = self.repo_path / target.helm_values_path
        updater = HelmValuesUpdater(values_path)

        if image_tag:
            updater.update_image_tag("myapp", image_tag)

        if replica_count > 0:
            updater.update_replica_count("replicaCount", replica_count)

        if env_vars:
            updater.update_env_vars(env_vars)

        updater.save(backup=True)

        # 5. 提交并推送
        commit_msg = f"promote: {source_env} -> {target_env}"
        if image_tag:
            commit_msg += f" [image: {image_tag}]"
        git_repo.commit_changes(commit_msg)
        git_repo.push(branch=branch_name)

        # 6. 创建 PR 并等待合并（简化实现，直接合并）
        # 生产环境应通过 GitHub/GitLab API 创建 PR
        # 此处模拟直接合并到目标分支
        git_repo.checkout_branch(target.branch)
        git_repo.repo.git.merge(branch_name)
        git_repo.push()

        # 7. 健康检查
        if not skip_health_check and target.health_check_url:
            logger.info(f"开始健康检查: {target.health_check_url}")
            success = self._wait_for_health(
                target.health_check_url, max_retries=30, interval=10
            )
            if not success:
                logger.error(f"健康检查失败，执行回滚")
                self._rollback(git_repo, target.branch)
                return False
            logger.info(f"健康检查通过")

        logger.info(f"环境提升完成: {source_env} -> {target_env}")
        return True

    def _wait_for_health(
        self, url: str, max_retries: int = 30, interval: int = 10
    ) -> bool:
        """等待健康检查通过"""
        for i in range(max_retries):
            try:
                resp = requests.get(url, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    status = data.get("status", "")
                    if status == "ok" or status == "healthy":
                        return True
                    logger.info(f"健康检查第 {i+1} 次: status={status}")
                else:
                    logger.info(f"健康检查第 {i+1} 次: HTTP {resp.status_code}")
            except requests.RequestException as e:
                logger.info(f"健康检查第 {i+1} 次: 连接失败 - {e}")
            time.sleep(interval)
        return False

    def _rollback(self, git_repo, branch: str) -> None:
        """回滚到之前的提交"""
        if self.rollback_commit:
            logger.info(f"回滚到 {self.rollback_commit}")
            git_repo.repo.git.reset("--hard", self.rollback_commit)
            git_repo.push(branch=branch, force=True)
            logger.info("回滚完成")


# ========== 使用示例 ==========
if __name__ == "__main__":
    promoter = EnvironmentPromoter(
        repo_url="https://github.com/example/gitops-config.git",
    )
    success = promoter.promote(
        source_env="dev",
        target_env="staging",
        image_tag="v2.1.0",
        replica_count=2,
        env_vars={"ENVIRONMENT": "staging"},
    )
    sys.exit(0 if success else 1)
```

### 7.5.4 使用场景

- 开发环境验证通过后自动提升到 staging
- staging 测试通过后提升到生产环境
- 紧急修复的快速提升通道
- 多环境一致性保障

### 7.5.5 潜在风险与注意事项

- **审批门禁**：生产环境提升应要求人工审批，可通过 GitHub PR Review 实现
- **健康检查超时**：设置合理的超时时间和重试次数，避免无限等待
- **回滚原子性**：确保回滚操作完整，包括 Git 回滚和 Kubernetes 资源回滚
- **数据迁移**：数据库 schema 变更的环境提升需要额外处理

### 7.5.6 本章小结

环境提升脚本将多步骤的发布流程自动化，包括配置更新、分支合并、健康检查和自动回滚。通过 `EnvironmentPromoter` 类，我们可以定义不同环境的提升策略，确保发布过程的可控性和安全性。

---

## 7.6 健康检查与回滚脚本

### 7.6.1 解决的问题

应用部署后，需要验证 Deployment 是否成功滚动更新、Pod 是否 Ready、Service 是否正常响应端点。如果部署失败，需要自动回滚到上一个稳定版本。

### 7.6.2 核心原理

使用 `kubernetes` Python 客户端直接与 Kubernetes API 交互：

1. 检查 Deployment 的 `status.conditions` 确认滚动更新完成
2. 检查 Pod 的 `status.conditions` 确认所有 Pod Ready
3. 检查 Service 的 `status.loadBalancer.ingress` 确认端点就绪
4. 使用 `rollout undo` 或 `apps/v1` API 回滚 Deployment

### 7.6.3 代码实现

```python
#!/usr/bin/env python3
"""
health_check_rollback.py — Kubernetes 健康检查与自动回滚
"""

import os
import sys
import time
import logging
from typing import Optional

from kubernetes import client, config, watch
from kubernetes.client.rest import ApiException

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class K8sHealthChecker:
    """Kubernetes 资源健康检查器"""

    def __init__(self, kubeconfig: str = "", in_cluster: bool = False):
        if in_cluster:
            config.load_incluster_config()
        else:
            config.load_kube_config(config_file=kubeconfig or None)
        self.apps_v1 = client.AppsV1Api()
        self.core_v1 = client.CoreV1Api()

    def check_deployment_rollout(
        self, name: str, namespace: str = "default", timeout: int = 300
    ) -> bool:
        """
        检查 Deployment 滚动更新状态。
        等待所有条件满足：Available=True, Progressing=True, ReplicaFailure=False
        """
        w = watch.Watch()
        deadline = time.time() + timeout

        logger.info(f"监控 Deployment {namespace}/{name} 滚动更新状态...")

        for event in w.stream(
            self.apps_v1.list_namespaced_deployment,
            namespace=namespace,
            field_selector=f"metadata.name={name}",
            timeout_seconds=timeout,
        ):
            dep = event["object"]
            conditions = dep.status.conditions or []

            status_map = {c.type: c.status for c in conditions}
            available = status_map.get("Available") == "True"
            progressing = status_map.get("Progressing") == "True"

            # 检查副本状态
            desired = dep.spec.replicas or 0
            ready = dep.status.ready_replicas or 0
            available_replicas = dep.status.available_replicas or 0
            updated = dep.status.updated_replicas or 0

            logger.info(
                f"  desired={desired} ready={ready} available={available_replicas} "
                f"updated={updated} available_cond={available} progressing={progressing}"
            )

            if available and progressing and ready == desired and updated == desired:
                w.stop()
                logger.info(f"Deployment {name} 滚动更新完成")
                return True

            if time.time() > deadline:
                w.stop()
                logger.error(f"Deployment {name} 滚动更新超时")
                return False

        return False

    def check_pod_readiness(
        self,
        label_selector: str,
        namespace: str = "default",
        expected_pods: int = 0,
        timeout: int = 120,
    ) -> bool:
        """检查 Pod 是否全部 Ready"""
        w = watch.Watch()
        deadline = time.time() + timeout

        logger.info(f"监控 Pod {label_selector} 就绪状态...")

        for event in w.stream(
            self.core_v1.list_namespaced_pod,
            namespace=namespace,
            label_selector=label_selector,
            timeout_seconds=timeout,
        ):
            pod = event["object"]
            pod_name = pod.metadata.name
            phase = pod.status.phase

            # 检查 Pod 条件
            ready_condition = None
            for cond in pod.status.conditions or []:
                if cond.type == "Ready":
                    ready_condition = cond.status
                    break

            logger.info(f"  Pod {pod_name}: phase={phase} ready={ready_condition}")

            # 统计 Ready Pod 数量
            pods = self.core_v1.list_namespaced_pod(
                namespace=namespace, label_selector=label_selector
            )
            ready_count = sum(
                1 for p in pods.items
                if any(
                    c.type == "Ready" and c.status == "True"
                    for c in (p.status.conditions or [])
                )
            )
            total = len(pods.items)

            if expected_pods > 0:
                if ready_count >= expected_pods:
                    w.stop()
                    logger.info(f"Pod 就绪: {ready_count}/{total}")
                    return True
            elif total > 0 and ready_count == total:
                w.stop()
                logger.info(f"所有 Pod 就绪: {ready_count}/{total}")
                return True

            if time.time() > deadline:
                w.stop()
                logger.error(f"Pod 就绪检查超时: {ready_count}/{total}")
                return False

        return False

    def check_service_endpoints(
        self, service_name: str, namespace: str = "default", timeout: int = 60
    ) -> bool:
        """检查 Service 是否有可用端点"""
        deadline = time.time() + timeout

        while time.time() < deadline:
            try:
                endpoints = self.core_v1.read_namespaced_endpoints(
                    service_name, namespace
                )
                subsets = endpoints.subsets or []
                if subsets:
                    ready_count = sum(
                        len(s.addresses or []) for s in subsets
                    )
                    if ready_count > 0:
                        logger.info(f"Service {service_name} 端点就绪: {ready_count}")
                        return True
                logger.info(f"Service {service_name} 无可用端点，等待...")
            except ApiException as e:
                logger.warning(f"获取端点失败: {e}")
            time.sleep(5)

        logger.error(f"Service {service_name} 端点检查超时")
        return False

    def get_previous_revision(self, name: str, namespace: str = "default") -> Optional[int]:
        """获取 Deployment 的上一个修订版本号"""
        try:
            rollout_history = self.apps_v1.read_namespaced_deployment(name, namespace)
            annotations = rollout_history.metadata.annotations or {}
            revision = annotations.get("deployment.kubernetes.io/revision", "0")
            return max(0, int(revision) - 1)
        except (ApiException, ValueError) as e:
            logger.error(f"获取修订版本失败: {e}")
            return None

    def rollback_deployment(
        self, name: str, namespace: str = "default", revision: Optional[int] = None
    ) -> bool:
        """
        回滚 Deployment 到指定修订版本。
        如果未指定 revision，回滚到上一个版本。
        """
        if revision is None:
            revision = self.get_previous_revision(name, namespace)
            if revision is None or revision == 0:
                logger.error("没有可回滚的版本")
                return False

        logger.info(f"回滚 Deployment {namespace}/{name} 到 revision {revision}")

        # 使用 rollout undo 命令
        import subprocess

        cmd = [
            "kubectl", "rollout", "undo",
            f"deployment/{name}",
            f"--namespace={namespace}",
            f"--to-revision={revision}",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"回滚失败: {result.stderr}")
            return False

        logger.info(f"回滚命令已执行: {result.stdout.strip()}")

        # 等待回滚完成
        return self.check_deployment_rollout(name, namespace, timeout=300)

    def full_health_check(
        self,
        deployment_name: str,
        service_name: str,
        namespace: str = "default",
        label_selector: str = "",
        expected_pods: int = 0,
        auto_rollback: bool = True,
    ) -> bool:
        """
        执行完整的健康检查流程：
        1. 检查 Deployment 滚动更新
        2. 检查 Pod 就绪
        3. 检查 Service 端点
        4. 失败时自动回滚
        """
        if not label_selector:
            label_selector = f"app={deployment_name}"

        # 1. Deployment 检查
        logger.info("=== 阶段 1: Deployment 滚动更新检查 ===")
        if not self.check_deployment_rollout(deployment_name, namespace):
            if auto_rollback:
                logger.warning("Deployment 检查失败，执行回滚")
                self.rollback_deployment(deployment_name, namespace)
            return False

        # 2. Pod 检查
        logger.info("=== 阶段 2: Pod 就绪检查 ===")
        if not self.check_pod_readiness(label_selector, namespace, expected_pods):
            if auto_rollback:
                logger.warning("Pod 检查失败，执行回滚")
                self.rollback_deployment(deployment_name, namespace)
            return False

        # 3. Service 检查
        logger.info("=== 阶段 3: Service 端点检查 ===")
        if not self.check_service_endpoints(service_name, namespace):
            if auto_rollback:
                logger.warning("Service 检查失败，执行回滚")
                self.rollback_deployment(deployment_name, namespace)
            return False

        logger.info("=== 所有健康检查通过 ===")
        return True


# ========== 使用示例 ==========
if __name__ == "__main__":
    checker = K8sHealthChecker()

    # 执行完整健康检查
    success = checker.full_health_check(
        deployment_name="myapp",
        service_name="myapp-service",
        namespace="production",
        label_selector="app=myapp",
        expected_pods=3,
        auto_rollback=True,
    )

    if not success:
        logger.error("部署验证失败，已执行回滚")
        sys.exit(1)
    else:
        logger.info("部署验证通过")
        sys.exit(0)
```

### 7.6.4 使用场景

- CI/CD 管道部署后的自动验证
- 金丝雀发布中的渐进式健康检查
- 定时巡检集群资源健康状态
- 自动故障恢复

### 7.6.5 潜在风险与注意事项

- **API 限流**：频繁调用 Kubernetes API 可能触发限流，建议使用 Watch 机制替代轮询
- **回滚数据丢失**：回滚 Deployment 不会自动回滚数据库变更，需要额外处理
- **权限控制**：确保 ServiceAccount 有足够的 RBAC 权限
- **Watch 超时**：Kubernetes Watch 连接可能意外断开，需要实现重连逻辑

### 7.6.6 本章小结

`K8sHealthChecker` 提供了完整的部署后验证能力，从 Deployment 滚动更新、Pod 就绪到 Service 端点，逐层检查。失败时自动触发回滚，确保集群始终处于健康状态。

---

## 7.7 定时同步与漂移检测

### 7.7.1 解决的问题

GitOps 的核心承诺是 Git 仓库状态等于集群状态。但在实际运行中，手动操作（如 `kubectl edit`）、控制器异常、资源驱逐等事件会导致集群状态偏离 Git 配置。需要定期检测并修复这种漂移。

### 7.7.2 核心原理

1. 从 Git 仓库获取期望的资源配置（Kustomize build 或 Helm template）
2. 从 Kubernetes 集群获取实际运行的资源
3. 对比两者的差异（使用 `kubectl diff` 或逐字段比较）
4. 自动应用 Git 配置以修复漂移
5. 记录差异报告

### 7.7.3 代码实现

```python
#!/usr/bin/env python3
"""
drift_detector.py — GitOps 漂移检测与自动修复
"""

import os
import sys
import json
import time
import difflib
import logging
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional
from dataclasses import dataclass, field

import yaml
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class DriftReport:
    """漂移检测报告"""
    timestamp: str = ""
    environment: str = ""
    total_resources: int = 0
    drifted_resources: int = 0
    drifts: list[dict] = field(default_factory=list)
    auto_reconciled: bool = False
    reconciliation_success: bool = False

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "environment": self.environment,
            "total_resources": self.total_resources,
            "drifted_resources": self.drifted_resources,
            "drifts": self.drifts,
            "auto_reconciled": self.auto_reconciled,
            "reconciliation_success": self.reconciliation_success,
        }

    def summary(self) -> str:
        lines = [
            f"漂移检测报告 - {self.timestamp}",
            f"环境: {self.environment}",
            f"资源总数: {self.total_resources}",
            f"漂移资源数: {self.drifted_resources}",
            f"自动修复: {'是' if self.auto_reconciled else '否'}",
            f"修复结果: {'成功' if self.reconciliation_success else '失败'}",
            "",
        ]
        for drift in self.drifts:
            lines.append(f"  - {drift['kind']}/{drift['name']} ({drift['namespace']})")
            lines.append(f"    差异: {drift.get('diff_summary', 'N/A')}")
        return "\n".join(lines)


class DriftDetector:
    """GitOps 漂移检测器"""

    def __init__(
        self,
        repo_path: str | Path,
        kubeconfig: str = "",
        manifests_dir: str = "manifests",
    ):
        self.repo_path = Path(repo_path)
        self.manifests_dir = manifests_dir
        self.kubeconfig = kubeconfig

    def _run_kubectl(
        self, args: list[str], input_data: Optional[str] = None
    ) -> subprocess.CompletedProcess:
        """执行 kubectl 命令"""
        cmd = ["kubectl"]
        if self.kubeconfig:
            cmd.extend(["--kubeconfig", self.kubeconfig])
        cmd.extend(args)

        result = subprocess.run(
            cmd,
            input=input_data,
            capture_output=True,
            text=True,
            timeout=60,
        )
        return result

    def _get_git_manifests(self, environment: str = "") -> list[dict]:
        """从 Git 仓库获取期望的资源配置"""
        manifests_path = self.repo_path / self.manifests_dir
        if environment:
            manifests_path = manifests_path / environment

        if not manifests_path.exists():
            logger.error(f"Manifests 目录不存在: {manifests_path}")
            return []

        # 使用 kustomize build 渲染最终资源
        kustomization = manifests_path / "kustomization.yaml"
        if kustomization.exists():
            result = self._run_kubectl([
                "kustomize", str(manifests_path),
            ])
            if result.returncode != 0:
                logger.error(f"Kustomize build 失败: {result.stderr}")
                return []
            return self._parse_yaml_docs(result.stdout)
        else:
            # 直接读取 YAML 文件
            resources = []
            for yaml_file in manifests_path.glob("*.yaml"):
                with open(yaml_file, "r", encoding="utf-8") as f:
                    resources.extend(self._parse_yaml_docs(f.read()))
            return resources

    @staticmethod
    def _parse_yaml_docs(content: str) -> list[dict]:
        """解析包含多个 YAML 文档的内容"""
        docs = []
        for doc in yaml.safe_load_all(content):
            if doc and doc.get("kind") and doc.get("apiVersion"):
                docs.append(doc)
        return docs

    def _get_cluster_resources(self, resources: list[dict]) -> list[dict]:
        """从集群获取实际运行的资源"""
        cluster_resources = []
        for res in resources:
            kind = res["kind"]
            api_version = res.get("apiVersion", "")
            name = res["metadata"]["name"]
            namespace = res["metadata"].get("namespace", "default")

            # 确定 API 组和版本
            api_group = ""
            if "/" in api_version:
                api_group, _ = api_version.split("/", 1)

            # 构建资源类型
            resource_type = kind.lower()
            if kind == "Deployment":
                resource_type = "deployment"
            elif kind == "Service":
                resource_type = "service"
            elif kind == "ConfigMap":
                resource_type = "configmap"
            elif kind == "Secret":
                resource_type = "secret"
            elif kind == "Namespace":
                resource_type = "namespace"

            # 获取集群资源
            args = ["get", resource_type, name, "-n", namespace, "-o", "json"]
            result = self._run_kubectl(args)

            if result.returncode == 0:
                try:
                    cluster_res = json.loads(result.stdout)
                    cluster_resources.append(cluster_res)
                except json.JSONDecodeError:
                    logger.warning(f"解析集群资源失败: {kind}/{name}")
            else:
                logger.warning(f"获取集群资源失败: {kind}/{name}: {result.stderr}")

        return cluster_resources

    @staticmethod
    def _normalize_resource(resource: dict) -> dict:
        """规范化资源，移除运行时字段以便比较"""
        normalized = yaml.safe_load(yaml.dump(resource))

        # 移除 Kubernetes 自动添加的运行时字段
        metadata = normalized.get("metadata", {})
        metadata.pop("creationTimestamp", None)
        metadata.pop("generation", None)
        metadata.pop("resourceVersion", None)
        metadata.pop("uid", None)
        metadata.pop("managedFields", None)
        metadata.pop("annotations", None)

        # 移除 status
        normalized.pop("status", None)

        return normalized

    def _diff_resources(
        self, git_res: dict, cluster_res: dict
    ) -> Optional[str]:
        """对比 Git 资源和集群资源的差异"""
        git_normalized = self._normalize_resource(git_res)
        cluster_normalized = self._normalize_resource(cluster_res)

        git_yaml = yaml.dump(git_normalized, default_flow_style=False, sort_keys=True)
        cluster_yaml = yaml.dump(cluster_normalized, default_flow_style=False, sort_keys=True)

        if git_yaml == cluster_yaml:
            return None

        # 生成差异
        diff = difflib.unified_diff(
            cluster_yaml.splitlines(keepends=True),
            git_yaml.splitlines(keepends=True),
            fromfile="cluster (current)",
            tofile="git (desired)",
        )
        return "".join(diff)

    def detect_drift(
        self,
        environment: str = "",
        auto_reconcile: bool = False,
    ) -> DriftReport:
        """执行漂移检测"""
        report = DriftReport(
            timestamp=datetime.utcnow().isoformat(),
            environment=environment or "default",
        )

        # 1. 获取 Git 期望状态
        git_resources = self._get_git_manifests(environment)
        report.total_resources = len(git_resources)
        logger.info(f"Git 资源数: {report.total_resources}")

        # 2. 获取集群实际状态
        cluster_resources = self._get_cluster_resources(git_resources)
        logger.info(f"集群资源数: {len(cluster_resources)}")

        # 3. 逐资源对比
        for git_res, cluster_res in zip(git_resources, cluster_resources):
            kind = git_res["kind"]
            name = git_res["metadata"]["name"]
            namespace = git_res["metadata"].get("namespace", "default")

            diff = self._diff_resources(git_res, cluster_res)
            if diff:
                report.drifted_resources += 1
                report.drifts.append({
                    "kind": kind,
                    "name": name,
                    "namespace": namespace,
                    "diff": diff,
                    "diff_summary": f"差异长度: {len(diff)} 字符",
                })
                logger.warning(f"发现漂移: {kind}/{name} ({namespace})")

        # 4. 自动修复
        if auto_reconcile and report.drifted_resources > 0:
            report.auto_reconciled = True
            report.reconciliation_success = self._reconcile(environment)

        logger.info(
            f"漂移检测完成: {report.drifted_resources}/{report.total_resources} 资源存在漂移"
        )
        return report

    def _reconcile(self, environment: str = "") -> bool:
        """自动修复漂移：应用 Git 配置到集群"""
        manifests_path = self.repo_path / self.manifests_dir
        if environment:
            manifests_path = manifests_path / environment

        kustomization = manifests_path / "kustomization.yaml"
        if kustomization.exists():
            result = self._run_kubectl([
                "apply", "-k", str(manifests_path),
            ])
        else:
            result = self._run_kubectl([
                "apply", "-f", str(manifests_path), "--recursive",
            ])

        if result.returncode == 0:
            logger.info(f"自动修复成功: {result.stdout}")
            return True
        else:
            logger.error(f"自动修复失败: {result.stderr}")
            return False

    def report_to_file(self, report: DriftReport, output_path: str | Path) -> None:
        """将漂移报告写入文件"""
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(report.summary())
            f.write("\n\n--- 详细差异 ---\n\n")
            for drift in report.drifts:
                f.write(f"### {drift['kind']}/{drift['name']}\n\n")
                f.write(f"命名空间: {drift['namespace']}\n\n")
                f.write("```diff\n")
                f.write(drift["diff"])
                f.write("\n```\n\n")

        logger.info(f"漂移报告已写入: {output_path}")


class ScheduledSync:
    """定时同步调度器"""

    def __init__(
        self,
        detector: DriftDetector,
        interval_seconds: int = 300,
        environments: Optional[list[str]] = None,
        report_dir: str | Path = "drift_reports",
        auto_reconcile: bool = False,
    ):
        self.detector = detector
        self.interval = interval_seconds
        self.environments = environments or ["default"]
        self.report_dir = Path(report_dir)
        self.auto_reconcile = auto_reconcile
        self.running = False

    def run_once(self) -> list[DriftReport]:
        """执行一次同步检查"""
        reports = []
        for env in self.environments:
            logger.info(f"=== 检查环境: {env} ===")
            report = self.detector.detect_drift(
                environment=env, auto_reconcile=self.auto_reconcile
            )
            report_path = self.report_dir / env / f"drift_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.md"
            self.detector.report_to_file(report, report_path)
            reports.append(report)
        return reports

    def run_loop(self) -> None:
        """进入定时循环"""
        self.running = True
        logger.info(f"启动定时同步，间隔: {self.interval}秒")

        while self.running:
            try:
                self.run_once()
                logger.info(f"等待 {self.interval} 秒后下一次检查...")
                time.sleep(self.interval)
            except KeyboardInterrupt:
                logger.info("收到中断信号，停止定时同步")
                self.running = False
            except Exception as e:
                logger.error(f"同步异常: {e}")
                time.sleep(self.interval)

    def stop(self) -> None:
        """停止定时同步"""
        self.running = False


# ========== 使用示例 ==========
if __name__ == "__main__":
    detector = DriftDetector(
        repo_path="/tmp/gitops-config",
        manifests_dir="manifests/overlays",
    )

    # 单次漂移检测
    report = detector.detect_drift(
        environment="production",
        auto_reconcile=True,
    )
    detector.report_to_file(report, "drift_reports/production/latest.md")

    # 定时同步
    scheduler = ScheduledSync(
        detector=detector,
        interval_seconds=600,  # 每 10 分钟
        environments=["dev", "staging", "production"],
        auto_reconcile=True,
    )
    scheduler.run_once()
```

### 7.7.4 使用场景

- 生产环境定时漂移巡检（每 10-30 分钟）
- CI/CD 部署后的漂移验证
- 合规审计的漂移报告生成
- 多集群配置一致性保障

### 7.7.5 潜在风险与注意事项

- **资源规范化**：Kubernetes 会自动添加 `metadata.managedFields`、`status` 等字段，比较前必须移除
- **Secret 数据**：Secret 的 `data` 字段在集群中会被 Base64 编码，Git 中可能是明文，需要特殊处理
- **自动修复风险**：自动 `kubectl apply` 可能覆盖手动操作，建议生产环境仅生成报告不自动修复
- **性能开销**：大量资源的全量对比可能消耗较多 API 资源，建议使用增量对比

### 7.7.6 本章小结

漂移检测是 GitOps 的"审计日志"。通过对比 Git 期望状态和集群实际状态，我们可以及时发现并修复配置漂移。`DriftDetector` 支持定时巡检、自动修复和报告生成，确保集群始终与 Git 配置保持一致。

---

## 7.8 潜在风险与最佳实践

### 7.8.1 Git 冲突解决

**问题**：多个 CI 管道同时修改同一 Git 仓库时，推送可能因冲突而失败。

**解决方案**：

```python
#!/usr/bin/env python3
"""
git_conflict_handler.py — Git 冲突自动处理
"""

import logging
import time
from pathlib import Path
from typing import Optional

from git import Repo, GitCommandError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class GitConflictHandler:
    """Git 冲突自动处理"""

    def __init__(self, repo_path: str | Path, max_retries: int = 3):
        self.repo_path = Path(repo_path)
        self.repo = Repo(repo_path)
        self.max_retries = max_retries

    def push_with_retry(
        self, branch: str, remote: str = "origin", base_branch: str = "main"
    ) -> bool:
        """
        带冲突处理的推送策略：
        1. 先尝试直接推送
        2. 失败后 rebase 到目标分支
        3. 解决冲突后重试
        """
        for attempt in range(1, self.max_retries + 1):
            try:
                self.repo.remote(remote).push(branch)
                logger.info(f"推送成功 (尝试 {attempt})")
                return True
            except GitCommandError as e:
                logger.warning(f"推送失败 (尝试 {attempt}): {e}")

                if attempt >= self.max_retries:
                    logger.error("达到最大重试次数")
                    return False

                # 拉取最新代码并 rebase
                try:
                    self.repo.remote(remote).fetch()
                    self.repo.git.checkout(branch)
                    self.repo.git.rebase(f"{remote}/{base_branch}")
                except GitCommandError as rebase_error:
                    logger.warning(f"Rebase 失败: {rebase_error}")
                    # 如果 rebase 冲突，使用我们自己的版本
                    self._auto_resolve_conflicts()
                    self.repo.git.rebase("--continue")

                time.sleep(2)

        return False

    def _auto_resolve_conflicts(self) -> None:
        """自动解决冲突：始终使用当前分支的版本"""
        try:
            unmerged = self.repo.index.unmerged_blobs()
            for path, blobs in unmerged.items():
                # 取当前分支的版本（stage 0 或 stage 2）
                for stage, blob in blobs:
                    if stage in (0, 2):
                        self.repo.index.add([path])
                        logger.info(f"自动解决冲突: {path}")
                        break
        except Exception as e:
            logger.error(f"自动解决冲突失败: {e}")
            raise
```

### 7.8.2 并发脚本执行

**问题**：多个脚本实例同时操作同一资源可能导致竞态条件。

**解决方案**：使用文件锁或分布式锁（Redis/etcd）。

```python
#!/usr/bin/env python3
"""
script_locker.py — 脚本执行锁
"""

import os
import fcntl
import time
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class FileLock:
    """基于文件锁的互斥执行"""

    def __init__(self, lock_path: str | Path, timeout: int = 300):
        self.lock_path = Path(lock_path)
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        self.timeout = timeout
        self.fp = None

    def __enter__(self):
        self.fp = open(self.lock_path, "w")
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            try:
                fcntl.flock(self.fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                logger.info(f"获取锁成功: {self.lock_path}")
                return self
            except IOError:
                logger.info(f"等待锁释放: {self.lock_path}")
                time.sleep(5)
        raise TimeoutError(f"获取锁超时: {self.lock_path}")

    def __exit__(self, *args):
        if self.fp:
            fcntl.flock(self.fp.fileno(), fcntl.LOCK_UN)
            self.fp.close()
            self.lock_path.unlink(missing_ok=True)
            logger.info(f"释放锁: {self.lock_path}")


# 使用示例
def main_with_lock():
    lock = FileLock("/tmp/gitops-update.lock", timeout=120)
    with lock:
        logger.info("执行 GitOps 更新操作...")
        time.sleep(10)
        logger.info("更新完成")
```

### 7.8.3 API 速率限制

**问题**：GitHub/GitLab API 和 Kubernetes API 都有速率限制，频繁调用可能导致请求被拒绝。

**解决方案**：

```python
#!/usr/bin/env python3
"""
rate_limiter.py — API 速率限制器
"""

import time
import logging
from collections import deque
from threading import Lock

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class RateLimiter:
    """令牌桶速率限制器"""

    def __init__(self, max_calls: int = 30, period: float = 60.0):
        self.max_calls = max_calls
        self.period = period
        self.calls: deque[float] = deque()
        self.lock = Lock()

    def wait_if_needed(self) -> None:
        """如果需要，等待直到可以发起请求"""
        with self.lock:
            now = time.time()
            # 移除过期记录
            while self.calls and self.calls[0] < now - self.period:
                self.calls.popleft()

            if len(self.calls) >= self.max_calls:
                wait_time = self.calls[0] + self.period - now
                logger.info(f"达到速率限制，等待 {wait_time:.1f} 秒")
                time.sleep(wait_time)
                # 清理过期记录
                while self.calls and self.calls[0] < time.time() - self.period:
                    self.calls.popleft()

            self.calls.append(time.time())

    def __call__(self, func):
        """作为装饰器使用"""
        def wrapper(*args, **kwargs):
            self.wait_if_needed()
            return func(*args, **kwargs)
        return wrapper


# 使用示例
rate_limiter = RateLimiter(max_calls=30, period=60)

@rate_limiter
def call_github_api(endpoint: str) -> dict:
    """模拟 GitHub API 调用"""
    import requests
    resp = requests.get(f"https://api.github.com{endpoint}")
    return resp.json()
```

### 7.8.4 凭据管理

**问题**：Git 凭据、云服务 AK/SK、Kubernetes kubeconfig 等敏感信息需要安全管理。

**最佳实践**：

```python
#!/usr/bin/env python3
"""
credential_manager.py — 凭据安全管理
"""

import os
import base64
import logging
from pathlib import Path
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class CredentialManager:
    """
    凭据管理器

    凭据来源优先级（从高到低）：
    1. 环境变量
    2. Vault/Secrets Manager
    3. 加密配置文件
    """

    def __init__(self):
        self._cache: dict[str, str] = {}

    def get_git_token(self) -> Optional[str]:
        """获取 Git 访问令牌"""
        # 1. 环境变量
        token = os.environ.get("GIT_TOKEN") or os.environ.get("GITHUB_TOKEN")
        if token:
            return token

        # 2. 文件
        token_path = Path.home() / ".gitops" / "git_token"
        if token_path.exists():
            return token_path.read_text().strip()

        logger.warning("未找到 Git 令牌，请设置 GIT_TOKEN 环境变量")
        return None

    def get_aws_credentials(self) -> dict:
        """获取 AWS 凭据"""
        return {
            "aws_access_key_id": os.environ.get("AWS_ACCESS_KEY_ID", ""),
            "aws_secret_access_key": os.environ.get("AWS_SECRET_ACCESS_KEY", ""),
            "aws_session_token": os.environ.get("AWS_SESSION_TOKEN", ""),
            "region": os.environ.get("AWS_REGION", "ap-northeast-1"),
        }

    def get_kubeconfig_path(self) -> str:
        """获取 kubeconfig 路径"""
        return os.environ.get("KUBECONFIG", str(Path.home() / ".kube" / "config"))

    def validate_credentials(self) -> bool:
        """验证所有必要凭据是否就绪"""
        missing = []

        if not self.get_git_token():
            missing.append("GIT_TOKEN")

        aws = self.get_aws_credentials()
        if not aws["aws_access_key_id"]:
            missing.append("AWS_ACCESS_KEY_ID")

        if not Path(self.get_kubeconfig_path()).exists():
            missing.append("KUBECONFIG")

        if missing:
            logger.error(f"缺少凭据: {', '.join(missing)}")
            return False
        return True
```

### 7.8.5 脚本执行安全建议

| 风险类别 | 风险描述 | 缓解措施 |
|---------|---------|---------|
| 凭据泄露 | 脚本中硬编码密码或 Token | 使用环境变量或 Secrets Manager |
| 注入攻击 | 用户输入直接拼接到 Git 命令 | 使用 GitPython API 而非 shell 命令 |
| 权限越界 | 脚本拥有过多 RBAC 权限 | 遵循最小权限原则 |
| 资源耗尽 | 脚本无限循环或内存泄漏 | 设置超时和资源限制 |
| 数据丢失 | 错误操作导致配置丢失 | 操作前创建备份，支持回滚 |
| 供应链攻击 | 依赖库存在漏洞 | 定期更新依赖，使用锁定文件 |

---

## 7.9 综合实战：端到端 GitOps 自动化管道

### 7.9.1 完整工作流

将本章所有脚本组合成一个完整的端到端管道：

```python
#!/usr/bin/env python3
"""
gitops_pipeline.py — 端到端 GitOps 自动化管道
"""

import os
import sys
import json
import time
import logging
from pathlib import Path
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("gitops_pipeline.log"),
    ],
)
logger = logging.getLogger(__name__)


class GitOpsPipeline:
    """GitOps 自动化管道"""

    def __init__(self, config_path: str | Path = "pipeline_config.json"):
        with open(config_path, "r", encoding="utf-8") as f:
            self.config = json.load(f)

        self.repo_url = self.config["repo_url"]
        self.repo_path = Path(self.config.get("repo_path", "/tmp/gitops-config"))
        self.ecr_region = self.config.get("ecr_region", "ap-northeast-1")

    def run_build_and_deploy(self, app_name: str, environment: str) -> bool:
        """
        完整的构建部署管道：
        1. 查找最新镜像标签
        2. 更新配置仓库
        3. 提交并推送
        4. 等待 ArgoCD 同步
        5. 健康检查
        6. 失败回滚
        """
        logger.info(f"=== 开始部署: {app_name} -> {environment} ===")

        # 1. 镜像标签更新
        from image_tag_auto_updater import ImageTagAutoUpdater

        image_updater = ImageTagAutoUpdater(
            ecr_region=self.ecr_region,
            repo_url=self.repo_url,
            repo_path=self.repo_path,
        )

        ecr_repo = self.config["apps"][app_name]["ecr_repo"]
        helm_values = self.config["apps"][app_name]["environments"][environment]["helm_values"]
        kustomize_path = self.config["apps"][app_name]["environments"][environment].get("kustomize_path", "")

        success = image_updater.run(
            ecr_repo=ecr_repo,
            image_name=app_name,
            helm_values_path=helm_values,
            kustomize_path=kustomize_path,
        )

        if not success:
            logger.error("镜像标签更新失败")
            return False

        # 2. 健康检查
        from health_check_rollback import K8sHealthChecker

        checker = K8sHealthChecker()
        env_config = self.config["apps"][app_name]["environments"][environment]

        health_ok = checker.full_health_check(
            deployment_name=env_config["deployment"],
            service_name=env_config["service"],
            namespace=env_config.get("namespace", "default"),
            expected_pods=env_config.get("replicas", 3),
            auto_rollback=True,
        )

        if not health_ok:
            logger.error(f"健康检查失败，已回滚 {app_name} 在 {environment}")
            return False

        logger.info(f"=== 部署完成: {app_name} -> {environment} ===")
        return True

    def run_environment_promotion(
        self, app_name: str, source_env: str, target_env: str
    ) -> bool:
        """执行环境提升"""
        from environment_promoter import EnvironmentPromoter

        promoter = EnvironmentPromoter(
            repo_url=self.repo_url,
            repo_path=self.repo_path,
        )

        return promoter.promote(
            source_env=source_env,
            target_env=target_env,
            image_tag="",  # 使用当前配置中的标签
        )

    def run_drift_detection(self, environment: str) -> None:
        """执行漂移检测"""
        from drift_detector import DriftDetector

        detector = DriftDetector(
            repo_path=self.repo_path,
            manifests_dir="manifests/overlays",
        )

        report = detector.detect_drift(
            environment=environment,
            auto_reconcile=self.config.get("auto_reconcile", False),
        )

        report_path = Path(f"drift_reports/{environment}/latest.md")
        detector.report_to_file(report, report_path)

        if report.drifted_resources > 0:
            logger.warning(f"发现 {report.drifted_resources} 个漂移资源")
        else:
            logger.info("无漂移，集群状态与 Git 一致")


# ========== 主入口 ==========
if __name__ == "__main__":
    pipeline = GitOpsPipeline("pipeline_config.json")

    action = sys.argv[1] if len(sys.argv) > 1 else ""

    if action == "deploy":
        app = sys.argv[2]
        env = sys.argv[3]
        success = pipeline.run_build_and_deploy(app, env)
        sys.exit(0 if success else 1)

    elif action == "promote":
        app = sys.argv[2]
        source = sys.argv[3]
        target = sys.argv[4]
        success = pipeline.run_environment_promotion(app, source, target)
        sys.exit(0 if success else 1)

    elif action == "drift-check":
        env = sys.argv[2] if len(sys.argv) > 2 else "production"
        pipeline.run_drift_detection(env)

    else:
        print("用法: python gitops_pipeline.py <deploy|promote|drift-check> [参数...]")
        sys.exit(1)
```

### 7.9.2 管道配置文件示例

```json
{
  "repo_url": "https://github.com/example/gitops-config.git",
  "repo_path": "/tmp/gitops-config",
  "ecr_region": "ap-northeast-1",
  "auto_reconcile": false,
  "apps": {
    "myapp": {
      "ecr_repo": "myapp",
      "environments": {
        "dev": {
          "helm_values": "helm/dev/values.yaml",
          "deployment": "myapp-dev",
          "service": "myapp-dev-svc",
          "namespace": "dev",
          "replicas": 1
        },
        "staging": {
          "helm_values": "helm/staging/values.yaml",
          "kustomize_path": "kustomize/overlays/staging",
          "deployment": "myapp-staging",
          "service": "myapp-staging-svc",
          "namespace": "staging",
          "replicas": 2
        },
        "prod": {
          "helm_values": "helm/prod/values.yaml",
          "kustomize_path": "kustomize/overlays/prod",
          "deployment": "myapp-prod",
          "service": "myapp-prod-svc",
          "namespace": "production",
          "replicas": 3
        }
      }
    }
  }
}
```

---

## 7.10 本章总结

本章系统性地介绍了如何用 Python 实现 GitOps 自动化，涵盖以下核心能力：

| 模块 | 核心功能 | 关键库 |
|------|---------|--------|
| Git 仓库操作 | 克隆、分支、提交、推送、PR、差异对比 | GitPython |
| Helm Values 更新 | 镜像标签、副本数、环境变量修改 | PyYAML |
| 镜像标签自动更新 | ECR 查询、SemVer 排序、Kustomize/Helm 更新 | boto3 |
| 环境提升 | 跨环境配置同步、健康检查、自动回滚 | requests |
| 健康检查与回滚 | Deployment/Pod/Service 检查、rollout undo | kubernetes |
| 漂移检测 | Git vs 集群对比、自动修复、报告生成 | kubectl diff |

**设计原则**：

1. **幂等性**：所有脚本应可重复执行而不产生副作用
2. **可观测性**：详细的日志和报告，便于问题排查
3. **安全性**：凭据从环境变量获取，不硬编码
4. **容错性**：失败时自动回滚，确保集群始终处于已知良好状态
5. **可扩展性**：模块化设计，便于添加新的环境或应用

**推荐的生产部署方式**：

- 将脚本打包为 Docker 镜像，在 CI/CD 管道中执行
- 使用 Kubernetes CronJob 运行定时漂移检测
- 将凭据存储在 Kubernetes Secret 或 Vault 中
- 集成告警系统（如 PagerDuty、Slack），在漂移或部署失败时通知

通过本章的 Python 脚本，你可以构建一套完整的 GitOps 自动化工具链，实现从镜像构建到生产部署的全自动化，同时确保集群状态始终与 Git 配置保持一致。
