package mygit.command;

import mygit.model.Commit;
import mygit.model.Tree;
import mygit.store.Repository;

import java.io.IOException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * mygit commit 命令：创建一次提交。
 * <p>
 * 根据当前索引创建一个 Tree 对象，然后创建一个 Commit 对象指向该 Tree，
 * 最后更新当前分支引用指向新的提交。
 * </p>
 *
 * <p>
 * 提交信息的来源：
 * <ol>
 *   <li>通过 -m 选项直接指定</li>
 *   <li>如果没有 -m 选项，尝试从环境变量获取</li>
 * </ol>
 * </p>
 *
 * 用法:
 *   mygit commit -m "<message>"
 *   mygit commit --author "Name <email>" -m "<message>"
 */
public class CommitCommand implements Command {

    /** 默认作者名（可通过环境变量 MYGIT_AUTHOR_NAME 覆盖） */
    private static final String DEFAULT_AUTHOR_NAME = "MyGit User";
    /** 默认作者邮箱（可通过环境变量 MYGIT_AUTHOR_EMAIL 覆盖） */
    private static final String DEFAULT_AUTHOR_EMAIL = "user@mygit.local";

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        // 解析参数
        String message = null;
        String authorInfo = null;

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "-m" -> {
                    if (i + 1 < args.length) {
                        message = args[++i];
                    }
                }
                case "--author" -> {
                    if (i + 1 < args.length) {
                        authorInfo = args[++i];
                    }
                }
            }
        }

        if (message == null || message.isEmpty()) {
            System.err.println("用法: mygit commit -m \"<message>\"");
            System.err.println("      请使用 -m 选项指定提交信息。");
            return;
        }

        // 加载索引
        repo.getIndex().load();
        if (repo.getIndex().getEntries().isEmpty()) {
            System.err.println("错误: 索引为空。请先用 mygit add 添加文件。");
            return;
        }

        // 从索引构建 Tree
        String treeHash = repo.getIndex().buildTree(repo.getObjectStore());

        // 解析作者信息
        String authorName;
        String authorEmail;

        if (authorInfo != null) {
            // 格式: "Name <email>"
            int emailStart = authorInfo.indexOf('<');
            int emailEnd = authorInfo.indexOf('>');
            if (emailStart >= 0 && emailEnd >= 0) {
                authorName = authorInfo.substring(0, emailStart).trim();
                authorEmail = authorInfo.substring(emailStart + 1, emailEnd);
            } else {
                authorName = authorInfo;
                authorEmail = DEFAULT_AUTHOR_EMAIL;
            }
        } else {
            authorName = System.getenv().getOrDefault("MYGIT_AUTHOR_NAME", DEFAULT_AUTHOR_NAME);
            authorEmail = System.getenv().getOrDefault("MYGIT_AUTHOR_EMAIL", DEFAULT_AUTHOR_EMAIL);
        }

        // 获取当前分支的最新提交（作为父提交）
        List<String> parentHashes = new ArrayList<>();
        String currentBranch = repo.getCurrentBranch();
        if (currentBranch != null) {
            String branchRef = repo.getBranchRef(currentBranch);
            if (branchRef != null) {
                parentHashes.add(branchRef);
            }
        }

        // 创建 Commit 对象
        Commit commit = new Commit(treeHash, parentHashes, authorName, authorEmail, message);
        String commitHash = repo.getObjectStore().store(commit);

        // 更新当前分支引用
        if (currentBranch != null) {
            repo.setBranchRef(currentBranch, commitHash);
        } else {
            // 分离头指针状态，直接更新 HEAD
            repo.setHEAD(commitHash);
        }

        // 提交后清空索引
        repo.getIndex().clear();
        repo.getIndex().save();

        System.out.println("[" + (currentBranch != null ? currentBranch : "HEAD") + " "
                + commitHash.substring(0, 7) + "] " + message);
        System.out.println("  " + commit.getEntries().size() + " 个文件已变更");
    }
}
