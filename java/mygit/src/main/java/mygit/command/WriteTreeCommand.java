package mygit.command;

import mygit.store.Repository;

/**
 * mygit write-tree 命令：根据索引构建 Tree 对象。
 * <p>
 * 读取当前索引中的条目，构建分层的 Tree 结构，
 * 将 Tree 对象写入对象存储，并输出根 Tree 的 SHA-1 哈希。
 * </p>
 *
 * 用法:
 *   mygit write-tree
 */
public class WriteTreeCommand implements Command {

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        // 加载索引
        repo.getIndex().load();

        if (repo.getIndex().getEntries().isEmpty()) {
            System.err.println("错误: 索引为空。请先用 mygit add 添加文件。");
            return;
        }

        // 构建 Tree
        String treeHash = repo.getIndex().buildTree(repo.getObjectStore());
        System.out.println(treeHash);
    }
}
