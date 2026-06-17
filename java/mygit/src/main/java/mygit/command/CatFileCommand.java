package mygit.command;

import mygit.model.GitObject;
import mygit.store.Repository;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * mygit cat-file 命令：查看 Git 对象的内容。
 * <p>
 * 根据对象的 SHA-1 哈希值，从对象存储中读取并显示对象内容。
 * -p 选项用于以人类可读的格式打印对象内容。
 * </p>
 *
 * 用法:
 *   mygit cat-file -p <object_hash>
 */
public class CatFileCommand implements Command {

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("用法: mygit cat-file -p <object_hash>");
            return;
        }

        boolean prettyPrint = false;
        String hash = null;

        for (int i = 0; i < args.length; i++) {
            if ("-p".equals(args[i])) {
                prettyPrint = true;
            } else {
                hash = args[i];
            }
        }

        if (hash == null) {
            System.err.println("用法: mygit cat-file -p <object_hash>");
            return;
        }

        GitObject object = repo.getObjectStore().read(hash);

        if (prettyPrint) {
            String content = new String(object.serializeContent(), StandardCharsets.UTF_8);
            System.out.print(content);
            // 确保输出以换行结束
            if (!content.endsWith("\n")) {
                System.out.println();
            }
        } else {
            // 默认显示类型和大小信息
            byte[] serialized = object.serialize();
            System.out.println("类型: " + object.getType());
            System.out.println("大小: " + serialized.length + " 字节");
        }
    }
}
