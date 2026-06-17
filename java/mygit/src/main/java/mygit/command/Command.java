package mygit.command;

import mygit.store.Repository;

/**
 * Git 命令接口。
 * <p>
 * 所有命令实现此接口。每个命令接收仓库对象和参数列表，
 * 执行对应的操作，并输出结果到控制台。
 * </p>
 */
public interface Command {

    /**
     * 执行命令。
     *
     * @param repo 仓库对象
     * @param args 命令行参数（不包含命令本身）
     * @throws Exception 如果执行过程中发生错误
     */
    void execute(Repository repo, String[] args) throws Exception;
}
