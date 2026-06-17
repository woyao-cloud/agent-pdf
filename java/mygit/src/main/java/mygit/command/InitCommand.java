package mygit.command;

import mygit.store.Repository;

/**
 * mygit init 命令：初始化一个新的 Git 仓库。
 * <p>
 * 在当前目录下创建 .mygit/ 目录结构。
 * 如果目录已存在，会显示提示信息。
 * </p>
 *
 * 用法: mygit init
 */
public class InitCommand implements Command {

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        if (repo.isValid()) {
            System.out.println("重新初始化已存在的 MyGit 仓库: "
                    + repo.getMygitDir().toAbsolutePath());
        } else {
            repo.init();
            System.out.println("初始化空的 MyGit 仓库: "
                    + repo.getMygitDir().toAbsolutePath());
        }
    }
}
