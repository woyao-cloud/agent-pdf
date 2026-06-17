package mygit.command;

import mygit.model.Blob;
import mygit.store.Index;
import mygit.store.Repository;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * mygit add 命令：将文件暂存到索引中。
 * <p>
 * 将指定文件的内容写入对象存储（创建 Blob 对象），
 * 并将文件路径和对应的 SHA-1 哈希记录到索引中。
 * </p>
 *
 * 用法:
 *   mygit add <file>...
 */
public class AddCommand implements Command {

    @Override
    public void execute(Repository repo, String[] args) throws Exception {
        if (args.length == 0) {
            System.err.println("用法: mygit add <file>...");
            return;
        }

        // 加载当前索引
        repo.getIndex().load();

        for (String filePath : args) {
            Path path = repo.getWorkingDir().resolve(filePath).normalize();

            if (!Files.exists(path)) {
                System.err.println("警告: 文件不存在，已跳过: " + filePath);
                continue;
            }

            if (Files.isDirectory(path)) {
                // 如果是目录，递归添加目录下所有文件
                addDirectory(repo, path, repo.getWorkingDir());
            } else {
                addFile(repo, path, repo.getWorkingDir());
            }
        }

        // 保存索引
        repo.getIndex().save();
    }

    /**
     * 递归添加目录下的所有文件。
     */
    private void addDirectory(Repository repo, Path dir, Path baseDir) throws IOException {
        try (var stream = Files.list(dir)) {
            var files = stream.toList();
            for (Path file : files) {
                if (Files.isDirectory(file)) {
                    addDirectory(repo, file, baseDir);
                } else {
                    addFile(repo, file, baseDir);
                }
            }
        }
    }

    /**
     * 添加单个文件到索引。
     */
    private void addFile(Repository repo, Path file, Path baseDir) throws IOException {
        byte[] data = Files.readAllBytes(file);
        Blob blob = new Blob(data);
        String hash = repo.getObjectStore().store(blob);

        // 计算相对路径
        String relativePath = baseDir.relativize(file).toString().replace('\\', '/');

        // 判断文件是否可执行（简单判断：文件所有者有执行权限）
        // 在 Windows 下，所有文件默认可视为不可执行
        String mode = Index.IndexEntry.MODE_REGULAR_FILE;

        repo.getIndex().addEntry(mode, hash, relativePath);
        System.out.println("添加: " + relativePath + " (" + hash.substring(0, 7) + "...)");
    }
}
