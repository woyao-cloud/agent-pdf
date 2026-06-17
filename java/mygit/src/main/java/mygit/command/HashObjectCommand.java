package mygit.command;

import mygit.model.Blob;
import mygit.store.Repository;
import mygit.util.HashUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * mygit hash-object 命令：计算文件的 SHA-1 哈希值。
 * <p>
 * 计算指定文件内容的 SHA-1 哈希值（以 Git 对象格式计算）。
 * 如果指定了 -w 选项，还会将对象写入对象存储。
 * </p>
 *
 * 用法:
 *   mygit hash-object [-w] <file>
 */
public class HashObjectCommand implements Command {

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        boolean write = false;
        String filePath = null;

        for (int i = 0; i < args.length; i++) {
            if ("-w".equals(args[i])) {
                write = true;
            } else {
                filePath = args[i];
            }
        }

        if (filePath == null) {
            System.err.println("用法: mygit hash-object [-w] <file>");
            return;
        }

        Path path = repo.getWorkingDir().resolve(filePath).normalize();
        if (!Files.exists(path)) {
            throw new IOException("文件不存在: " + path);
        }

        byte[] data = Files.readAllBytes(path);
        Blob blob = new Blob(data);

        String hash;
        if (write) {
            hash = repo.getObjectStore().store(blob);
        } else {
            hash = HashUtils.sha1Hex(blob.serialize());
        }

        System.out.println(hash);
    }
}
