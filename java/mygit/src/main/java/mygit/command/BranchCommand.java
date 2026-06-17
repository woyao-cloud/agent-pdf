package mygit.command;

import mygit.store.Repository;

import java.util.List;

/**
 * mygit branch 命令：管理分支。
 * <p>
 * 支持以下操作：
 * <ul>
 *   <li>列出所有分支（当前分支前标 *）</li>
 *   <li>创建新分支</li>
 *   <li>删除分支 (-d)</li>
 * </ul>
 * </p>
 *
 * 用法:
 *   mygit branch              -- 列出分支
 *   mygit branch <name>       -- 创建分支
 *   mygit branch -d <name>    -- 删除分支
 */
public class BranchCommand implements Command {

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        if (args.length == 0) {
            // 列出分支
            listBranches(repo);
        } else if ("-d".equals(args[0])) {
            // 删除分支
            if (args.length < 2) {
                System.err.println("用法: mygit branch -d <branch-name>");
                return;
            }
            deleteBranch(repo, args[1]);
        } else {
            // 创建分支
            createBranch(repo, args[0]);
        }
    }

    /**
     * 列出所有分支。
     */
    private void listBranches(Repository repo) throws Exception {
        List<String> branches = repo.listBranches();
        String currentBranch = repo.getCurrentBranch();

        if (branches.isEmpty()) {
            System.out.println("(暂无分支)");
            return;
        }

        for (String branch : branches) {
            if (branch.equals(currentBranch)) {
                System.out.println("* " + branch);
            } else {
                System.out.println("  " + branch);
            }
        }
    }

    /**
     * 创建新分支。
     */
    private void createBranch(Repository repo, String branchName) throws Exception {
        // 确定新分支指向哪个提交
        String commitHash = null;

        String currentBranch = repo.getCurrentBranch();
        if (currentBranch != null) {
            commitHash = repo.getBranchRef(currentBranch);
        } else {
            commitHash = repo.getHEAD();
        }

        if (commitHash == null) {
            System.err.println("错误: 无法创建分支，当前没有提交记录。");
            return;
        }

        repo.createBranch(branchName, commitHash);
        System.out.println("已创建分支: " + branchName);
    }

    /**
     * 删除分支。
     */
    private void deleteBranch(Repository repo, String branchName) throws Exception {
        repo.deleteBranch(branchName);
        System.out.println("已删除分支: " + branchName);
    }
}
