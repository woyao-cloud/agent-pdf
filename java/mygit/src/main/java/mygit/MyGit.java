package mygit;

import mygit.command.*;
import mygit.store.Repository;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

/**
 * MyGit 主入口类。
 * <p>
 * MyGit 是一个教学工具，用于展示 Git 的核心运作原理。
 * 它用纯 Java 实现，不依赖任何第三方库。
 * </p>
 *
 * <p>
 * 支持的命令：
 * <ul>
 *   <li>init       - 初始化仓库</li>
 *   <li>hash-object - 计算文件哈希</li>
 *   <li>cat-file   - 查看对象内容</li>
 *   <li>add        - 暂存文件</li>
 *   <li>write-tree - 写入 Tree 对象</li>
 *   <li>commit     - 创建提交</li>
 *   <li>log        - 查看提交历史</li>
 *   <li>branch     - 管理分支</li>
 *   <li>checkout   - 切换分支/提交</li>
 *   <li>tag        - 管理标签</li>
 * </ul>
 * </p>
 *
 * <p>
 * 用法: mygit &lt;command&gt; [args...]
 * </p>
 */
public class MyGit {

    /** 命令名称到实现的映射 */
    private static final Map<String, Command> COMMANDS = Map.ofEntries(
            Map.entry("init", new InitCommand()),
            Map.entry("hash-object", new HashObjectCommand()),
            Map.entry("cat-file", new CatFileCommand()),
            Map.entry("add", new AddCommand()),
            Map.entry("write-tree", new WriteTreeCommand()),
            Map.entry("commit", new CommitCommand()),
            Map.entry("log", new LogCommand()),
            Map.entry("branch", new BranchCommand()),
            Map.entry("checkout", new CheckoutCommand()),
            Map.entry("tag", new TagCommand())
    );

    /**
     * 主入口方法。
     * <p>
     * 用法示例：
     * <pre>
     *   mygit init
     *   mygit hash-object -w test.txt
     *   mygit cat-file -p &lt;hash&gt;
     *   mygit add test.txt
     *   mygit write-tree
     *   mygit commit -m "first commit"
     *   mygit log
     *   mygit branch feature
     *   mygit checkout feature
     *   mygit tag v1.0
     * </pre>
     */
    public static void main(String[] args) {
        if (args.length < 1) {
            printUsage();
            return;
        }

        String commandName = args[0];

        // 特殊处理：init 命令不需要已初始化的仓库
        if ("init".equals(commandName)) {
            try {
                Repository repo = new Repository(Path.of("."));
                new InitCommand().execute(repo, new String[0]);
            } catch (Exception e) {
                System.err.println("错误: " + e.getMessage());
                System.exit(1);
            }
            return;
        }

        // 其他命令需要在已初始化的仓库中运行
        Repository repo = new Repository(Path.of("."));
        if (!repo.isValid()) {
            System.err.println("错误: 不是 MyGit 仓库（或 .mygit 目录不存在）。");
            System.err.println("请先运行: mygit init");
            System.exit(1);
        }

        Command command = COMMANDS.get(commandName);
        if (command == null) {
            System.err.println("错误: 未知命令 '" + commandName + "'");
            printUsage();
            System.exit(1);
        }

        try {
            // 提取剩余参数
            String[] commandArgs = new String[args.length - 1];
            System.arraycopy(args, 1, commandArgs, 0, commandArgs.length);
            command.execute(repo, commandArgs);
        } catch (Exception e) {
            System.err.println("错误: " + e.getMessage());
            System.exit(1);
        }
    }

    /**
     * 打印用法信息。
     */
    private static void printUsage() {
        System.out.println("用法: mygit <command> [<args>]");
        System.out.println();
        System.out.println("MyGit 教学工具 - 用纯 Java 实现的 Git 内核模拟器");
        System.out.println();
        System.out.println("可用命令:");
        System.out.println("   init              初始化一个新的仓库");
        System.out.println("   hash-object [-w]   计算文件 SHA-1 哈希值");
        System.out.println("   cat-file -p        查看对象内容");
        System.out.println("   add               暂存文件");
        System.out.println("   write-tree        根据索引写入 Tree 对象");
        System.out.println("   commit -m         创建提交");
        System.out.println("   log [--oneline]   查看提交历史");
        System.out.println("   branch [name]     管理分支");
        System.out.println("   checkout          切换分支或提交");
        System.out.println("   tag [name]        管理标签");
    }
}
