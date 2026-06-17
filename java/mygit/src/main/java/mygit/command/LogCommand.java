package mygit.command;

import mygit.model.Commit;
import mygit.store.Repository;

import java.util.ArrayList;
import java.util.List;

/**
 * mygit log 命令：显示提交历史。
 * <p>
 * 从当前分支的最新提交开始，沿着父提交链回溯，
 * 打印每次提交的哈希值、作者、日期和提交信息。
 * </p>
 *
 * <p>
 * 支持 --oneline 选项简化输出。
 * </p>
 *
 * 用法:
 *   mygit log
 *   mygit log --oneline
 */
public class LogCommand implements Command {

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        boolean oneline = false;

        for (String arg : args) {
            if ("--oneline".equals(arg)) {
                oneline = true;
            }
        }

        // 确定从哪个提交开始遍历
        String startHash = null;

        // 检查是否指定了分支或提交参数
        String currentBranch = repo.getCurrentBranch();
        if (currentBranch != null) {
            startHash = repo.getBranchRef(currentBranch);
        } else {
            startHash = repo.getHEAD();
        }

        if (startHash == null) {
            System.out.println("当前分支没有提交记录。");
            return;
        }

        // 收集提交历史（沿着 parent 链回溯）
        List<LogEntry> history = new ArrayList<>();
        String hash = startHash;

        while (hash != null) {
            try {
                Commit commit = (Commit) repo.getObjectStore().read(hash);
                history.add(new LogEntry(hash, commit));
                // 取第一个父提交
                List<String> parents = commit.getParentHashes();
                hash = parents.isEmpty() ? null : parents.get(0);
            } catch (Exception e) {
                break;
            }
        }

        // 输出
        if (history.isEmpty()) {
            System.out.println("当前分支没有提交记录。");
            return;
        }

        for (int i = 0; i < history.size(); i++) {
            LogEntry entry = history.get(i);

            if (oneline) {
                System.out.println(entry.hash().substring(0, 7) + " " + entry.commit().getMessage());
            } else {
                if (i > 0) {
                    System.out.println();
                }
                System.out.println("提交: " + entry.hash());
                System.out.println("作者: " + entry.commit().getAuthorName()
                        + " <" + entry.commit().getAuthorEmail() + ">");
                System.out.println("日期: " + entry.commit().getFormattedTimestamp());
                System.out.println();
                System.out.println("    " + entry.commit().getMessage());
            }
        }
    }

    /**
     * 日志条目。
     */
    private record LogEntry(String hash, Commit commit) {}
}
