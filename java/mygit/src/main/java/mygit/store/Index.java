package mygit.store;

import mygit.model.Tree;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Git 索引（Index）管理器。
 * <p>
 * 索引（也称为暂存区 / staging area）是工作目录和 Git 仓库之间的中间层。
 * 当执行 {@code git add} 时，文件内容被写入对象存储，文件路径和对应的
 * SHA-1 哈希被记录在索引中。当执行 {@code git commit} 时，根据索引
 * 创建一个 Tree 对象来表示目录快照。
 * </p>
 *
 * <p>
 * 本教学工具使用简化的文本格式存储索引，每行一个条目：
 * <pre>
 *   <mode> <sha1> <path>
 * </pre>
 * 其中 path 是相对于仓库根目录的文件路径。
 * </p>
 *
 * <p>
 * 注意：真正的 Git 索引使用复杂的二进制格式，包含时间戳、文件大小等信息。
 * 本教学工具为了简洁和可读性，使用了简化的文本格式。
 * </p>
 */
public class Index {

    /** 索引文件的路径 */
    private final Path indexFile;

    /** 索引条目列表 */
    private final List<IndexEntry> entries;

    /**
     * 创建一个索引管理器。
     *
     * @param mygitDir .mygit 目录的路径
     */
    public Index(Path mygitDir) {
        this.indexFile = mygitDir.resolve("index");
        this.entries = new ArrayList<>();
    }

    /**
     * 从磁盘加载索引文件。
     *
     * @throws IOException 如果读取失败
     */
    public void load() throws IOException {
        entries.clear();
        if (!Files.exists(indexFile)) {
            return;
        }
        List<String> lines = Files.readAllLines(indexFile, StandardCharsets.UTF_8);
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            String[] parts = line.split(" ", 3);
            if (parts.length == 3) {
                entries.add(new IndexEntry(parts[0], parts[1], parts[2]));
            }
        }
    }

    /**
     * 将索引写入磁盘。
     *
     * @throws IOException 如果写入失败
     */
    public void save() throws IOException {
        List<String> lines = new ArrayList<>();
        for (IndexEntry entry : entries) {
            lines.add(entry.getMode() + " " + entry.getHash() + " " + entry.getPath());
        }
        Files.write(indexFile, lines, StandardCharsets.UTF_8);
    }

    /**
     * 添加或更新一个索引条目。
     *
     * @param mode 文件模式（如 "100644"）
     * @param hash 文件内容的 SHA-1 哈希
     * @param path 文件路径（相对于仓库根目录）
     */
    public void addEntry(String mode, String hash, String path) {
        // 标准化路径分隔符
        String normalizedPath = path.replace('\\', '/');
        // 移除已存在的相同路径的条目
        entries.removeIf(e -> e.getPath().equals(normalizedPath));
        entries.add(new IndexEntry(mode, hash, normalizedPath));
    }

    /**
     * 根据文件路径查找索引条目。
     *
     * @param path 文件路径
     * @return 索引条目，如果不存在则返回 null
     */
    public IndexEntry getEntry(String path) {
        String normalizedPath = path.replace('\\', '/');
        for (IndexEntry entry : entries) {
            if (entry.getPath().equals(normalizedPath)) {
                return entry;
            }
        }
        return null;
    }

    /**
     * 移除指定路径的索引条目。
     *
     * @param path 文件路径
     */
    public void removeEntry(String path) {
        String normalizedPath = path.replace('\\', '/');
        entries.removeIf(e -> e.getPath().equals(normalizedPath));
    }

    /**
     * 获取所有索引条目。
     *
     * @return 不可修改的条目列表
     */
    public List<IndexEntry> getEntries() {
        return List.copyOf(entries);
    }

    /**
     * 清空索引。
     */
    public void clear() {
        entries.clear();
    }

    /**
     * 根据索引内容构建一个 Tree 对象。
     * <p>
     * 这个方法将索引中的扁平条目列表转换为分层的 Tree 结构。
     * 例如，索引中有 "src/main/Main.java" 和 "src/main/Utils.java"，
     * 会创建 src/ -> main/ -> (Main.java, Utils.java) 这样的嵌套 Tree。
     * </p>
     *
     * @param objectStore 对象存储，用于存储中间 Tree 对象
     * @return 根 Tree 对象的 SHA-1 哈希
     * @throws IOException 如果构建失败
     */
    public String buildTree(ObjectStore objectStore) throws IOException {
        // 对条目按路径排序（确保 Tree 条目有序）
        List<IndexEntry> sortedEntries = new ArrayList<>(entries);
        sortedEntries.sort(Comparator.comparing(IndexEntry::getPath));

        // 使用 TreeBuilder 来构建分层的 Tree 结构
        TreeBuilder builder = new TreeBuilder(objectStore);
        for (IndexEntry entry : sortedEntries) {
            String path = entry.getPath();
            String[] parts = path.split("/");
            builder.addFile(parts, 0, entry.getMode(), entry.getHash());
        }

        return builder.build();
    }

    /**
     * 索引条目类。
     * 每个条目记录一个文件的模式、SHA-1 哈希和路径。
     */
    public static class IndexEntry {
        private final String mode;
        private final String hash;
        private final String path;

        public IndexEntry(String mode, String hash, String path) {
            this.mode = mode;
            this.hash = hash;
            this.path = path;
        }

        public String getMode() { return mode; }
        public String getHash() { return hash; }
        public String getPath() { return path; }

        @Override
        public String toString() {
            return mode + " " + hash + " " + path;
        }
    }

    /**
     * Tree 构建器：将扁平路径列表转换为分层的 Tree 结构。
     * <p>
     * 例如，对于 ["a/b/c.txt", "a/d.txt"] 会生成：
     * <pre>
     *   root/
     *     a/  (Tree)
     *       b/  (Tree)
     *         c.txt  (Blob)
     *       d.txt    (Blob)
     * </pre>
     * </p>
     */
    private static class TreeBuilder {
        private final ObjectStore objectStore;
        private final Map<String, Object> children = new TreeMap<>();

        TreeBuilder(ObjectStore objectStore) {
            this.objectStore = objectStore;
        }

        /**
         * 添加一个文件到树中。
         *
         * @param parts   路径各部分（如 ["src", "main", "Main.java"]）
         * @param index   当前处理的路径部分索引
         * @param mode    文件模式
         * @param hash    文件内容的 SHA-1 哈希
         */
        void addFile(String[] parts, int index, String mode, String hash) {
            if (index == parts.length - 1) {
                // 最后一个部分是文件名
                children.put(parts[index], new FileEntry(mode, hash));
            } else {
                // 中间部分是目录
                String dirName = parts[index];
                TreeBuilder subBuilder = (TreeBuilder) children.get(dirName);
                if (subBuilder == null) {
                    subBuilder = new TreeBuilder(objectStore);
                    children.put(dirName, subBuilder);
                }
                subBuilder.addFile(parts, index + 1, mode, hash);
            }
        }

        /**
         * 构建 Tree 并返回其 SHA-1 哈希。
         * 递归地构建子树。
         */
        String build() throws IOException {
            Tree tree = new Tree();
            for (Map.Entry<String, Object> entry : children.entrySet()) {
                String name = entry.getKey();
                Object value = entry.getValue();

                if (value instanceof FileEntry fe) {
                    tree.addEntry(new Tree.TreeEntry(fe.mode, name, fe.hash));
                } else if (value instanceof TreeBuilder subBuilder) {
                    String subTreeHash = subBuilder.build();
                    tree.addEntry(new Tree.TreeEntry(Tree.MODE_DIRECTORY, name, subTreeHash));
                }
            }
            return objectStore.store(tree);
        }
    }

    /**
     * 文件条目（TreeBuilder 内部使用）。
     */
    private record FileEntry(String mode, String hash) {}
}
