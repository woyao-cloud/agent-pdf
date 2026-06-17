package mygit.command;

import mygit.model.Commit;
import mygit.model.GitObject;
import mygit.model.Tree;
import mygit.store.Repository;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * mygit checkout 命令：切换分支或恢复到指定提交。
 * <p>
 * 该命令会更新 HEAD 指向指定的分支或提交，
 * 并根据对应的 Tree 对象还原工作目录的文件。
 * </p>
 *
 * <p>
 * 注意：本教学工具的 checkout 实现较为简化：
 * <ul>
 *   <li>不会检查工作目录是否有未提交的更改</li>
 *   <li>不会保存当前索引状态</li>
 *   <li>会直接覆盖工作目录的文件</li>
 * </ul>
 * 这些简化有助于教学演示，但不适合生产环境使用。
 * </p>
 *
 * 用法:
 *   mygit checkout <branch>
 *   mygit checkout <commit-hash>
 */
public class CheckoutCommand implements Command {

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("用法: mygit checkout <branch|commit-hash>");
            return;
        }

        String target = args[0];

        // 先尝试按分支名解析
        String commitHash = repo.getBranchRef(target);

        if (commitHash != null) {
            // 切换到分支
            checkoutBranch(repo, target, commitHash);
        } else {
            // 尝试按提交哈希解析（可能需要前缀匹配）
            commitHash = resolveCommitHash(repo, target);
            if (commitHash != null) {
                checkoutCommit(repo, commitHash);
            } else {
                System.err.println("错误: 路径规格 '" + target + "' 不匹配任何分支或提交。");
            }
        }
    }

    /**
     * 切换到指定分支。
     */
    private void checkoutBranch(Repository repo, String branchName, String commitHash)
            throws Exception {
        // 更新 HEAD 指向分支
        repo.setHEAD("ref: refs/heads/" + branchName);

        // 恢复工作目录
        restoreWorkingDirectory(repo, commitHash);

        System.out.println("已切换到分支 '" + branchName + "'");
        System.out.println("最新提交: " + commitHash.substring(0, 7));
    }

    /**
     * 切换到指定提交（分离头指针状态）。
     */
    private void checkoutCommit(Repository repo, String commitHash) throws Exception {
        // 更新 HEAD 直接指向提交
        repo.setHEAD(commitHash);

        // 恢复工作目录
        restoreWorkingDirectory(repo, commitHash);

        System.out.println("注意: 处于分离头指针状态。");
        System.out.println("已切换到提交: " + commitHash.substring(0, 7));
    }

    /**
     * 根据提交哈希恢复工作目录。
     */
    private void restoreWorkingDirectory(Repository repo, String commitHash)
            throws IOException {
        // 读取 Commit 对象
        GitObject obj = repo.getObjectStore().read(commitHash);
        if (!(obj instanceof Commit commit)) {
            throw new IOException("对象不是提交: " + commitHash);
        }

        // 读取 Tree 对象
        Tree tree = (Tree) repo.getObjectStore().read(commit.getTreeHash());

        // 递归恢复文件
        restoreTree(repo, tree, repo.getWorkingDir());

        System.out.println("工作目录已恢复。");
    }

    /**
     * 递归恢复 Tree 中的文件到指定目录。
     */
    private void restoreTree(Repository repo, Tree tree, Path baseDir) throws IOException {
        for (Tree.TreeEntry entry : tree.getEntries()) {
            Path entryPath = baseDir.resolve(entry.getName());

            if (Tree.MODE_DIRECTORY.equals(entry.getMode())) {
                // 目录：递归处理子 Tree
                GitObject obj = repo.getObjectStore().read(entry.getHash());
                if (obj instanceof Tree subTree) {
                    Files.createDirectories(entryPath);
                    restoreTree(repo, subTree, entryPath);
                }
            } else {
                // 文件：读取 Blob 内容并写入
                GitObject obj = repo.getObjectStore().read(entry.getHash());
                if (obj instanceof mygit.model.Blob blob) {
                    Files.createDirectories(entryPath.getParent());
                    Files.write(entryPath, blob.getData());
                }
            }
        }
    }

    /**
     * 尝试解析提交哈希（支持前缀匹配）。
     */
    private String resolveCommitHash(Repository repo, String target) throws IOException {
        // 如果恰好是 40 位，直接返回
        if (target.length() == 40) {
            if (repo.getObjectStore().exists(target)) {
                return target;
            }
            return null;
        }

        // 前缀匹配：在 objects 目录下查找
        // 注意：这是一种简化的前缀匹配方式，完整 Git 支持 4-40 位前缀
        Path objectsDir = repo.getObjectStore().getObjectsDir();
        if (target.length() >= 4) {
            String prefixDir = target.substring(0, 2);
            String prefixFile = target.substring(2);
            Path dir = objectsDir.resolve(prefixDir);
            if (Files.isDirectory(dir)) {
                try (var stream = Files.list(dir)) {
                    List<Path> matches = stream
                            .filter(Files::isRegularFile)
                            .filter(p -> p.getFileName().toString().startsWith(prefixFile))
                            .toList();
                    if (matches.size() == 1) {
                        return prefixDir + matches.get(0).getFileName().toString();
                    }
                }
            }
        }

        return null;
    }
}
