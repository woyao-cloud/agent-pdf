package mygit.command;

import mygit.model.Commit;
import mygit.model.GitObject;
import mygit.model.Tag;
import mygit.store.Repository;

import java.io.IOException;

/**
 * mygit tag 命令：管理标签。
 * <p>
 * 支持以下操作：
 * <ul>
 *   <li>列出所有标签</li>
 *   <li>创建轻量标签（默认）</li>
 *   <li>创建注解标签 (-a + -m)</li>
 *   <li>删除标签 (-d)</li>
 * </ul>
 * </p>
 *
 * 用法:
 *   mygit tag                          -- 列出标签
 *   mygit tag <name>                   -- 创建轻量标签
 *   mygit tag -a <name> -m "<msg>"     -- 创建注解标签
 *   mygit tag -d <name>                -- 删除标签
 */
public class TagCommand implements Command {

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        if (args.length == 0) {
            // 列出标签
            listTags(repo);
        } else if ("-d".equals(args[0])) {
            // 删除标签
            if (args.length < 2) {
                System.err.println("用法: mygit tag -d <tag-name>");
                return;
            }
            deleteTag(repo, args[1]);
        } else if ("-a".equals(args[0])) {
            // 创建注解标签
            createAnnotatedTag(repo, args);
        } else {
            // 创建轻量标签
            createLightweightTag(repo, args[0]);
        }
    }

    /**
     * 列出所有标签。
     */
    private void listTags(Repository repo) throws Exception {
        var tags = repo.listTags();
        if (tags.isEmpty()) {
            System.out.println("(暂无标签)");
            return;
        }
        for (String tag : tags) {
            String ref = repo.getTagRef(tag);
            System.out.println(tag + " -> " + (ref != null ? ref.substring(0, 7) : "?"));
        }
    }

    /**
     * 创建轻量标签。
     */
    private void createLightweightTag(Repository repo, String tagName) throws Exception {
        String commitHash = getCurrentCommitHash(repo);
        if (commitHash == null) {
            System.err.println("错误: 无法创建标签，当前没有提交记录。");
            return;
        }
        repo.createLightweightTag(tagName, commitHash);
        System.out.println("已创建标签: " + tagName + " -> " + commitHash.substring(0, 7));
    }

    /**
     * 创建注解标签。
     */
    private void createAnnotatedTag(Repository repo, String[] args) throws Exception {
        String tagName = null;
        String message = null;

        for (int i = 1; i < args.length; i++) {
            switch (args[i]) {
                case "-m" -> {
                    if (i + 1 < args.length) {
                        message = args[++i];
                    }
                }
                default -> {
                    if (tagName == null) {
                        tagName = args[i];
                    }
                }
            }
        }

        if (tagName == null || message == null) {
            System.err.println("用法: mygit tag -a <tag-name> -m \"<message>\"");
            return;
        }

        String commitHash = getCurrentCommitHash(repo);
        if (commitHash == null) {
            System.err.println("错误: 无法创建标签，当前没有提交记录。");
            return;
        }

        // 创建 Tag 对象并存储
        Tag tag = new Tag(commitHash, "commit", tagName,
                System.getenv().getOrDefault("MYGIT_AUTHOR_NAME", "MyGit User"),
                System.getenv().getOrDefault("MYGIT_AUTHOR_EMAIL", "user@mygit.local"),
                message);
        String tagHash = repo.getObjectStore().store(tag);

        // 同时在 refs/tags/ 下创建引用
        repo.createLightweightTag(tagName, tagHash);

        System.out.println("已创建注解标签: " + tagName
                + " -> " + commitHash.substring(0, 7)
                + " (对象: " + tagHash.substring(0, 7) + ")");
    }

    /**
     * 删除标签。
     */
    private void deleteTag(Repository repo, String tagName) throws Exception {
        repo.deleteTag(tagName);
        System.out.println("已删除标签: " + tagName);
    }

    /**
     * 获取当前提交的哈希值。
     */
    private String getCurrentCommitHash(Repository repo) throws IOException {
        String currentBranch = repo.getCurrentBranch();
        if (currentBranch != null) {
            return repo.getBranchRef(currentBranch);
        }
        return repo.getHEAD();
    }
}
