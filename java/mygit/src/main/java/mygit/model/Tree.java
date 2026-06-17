package mygit.model;

import mygit.util.HashUtils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * Tree 对象：存储目录结构。
 * <p>
 * Tree 对象对应文件系统中的一个目录。它包含多个条目（TreeEntry），
 * 每个条目记录了一个子文件或子目录的信息：模式（mode）、文件名、以及指向的
 * Git 对象的 SHA-1 哈希值。
 * </p>
 *
 * <p>
 * Tree 的序列化格式是二进制的，不是文本格式：
 * <pre>
 *   [mode] 空格 [文件名] \\0 [20 字节 SHA-1] ...
 * </pre>
 * 其中 mode 是 ASCII 字符串（如 "100644"、"40000"），
 * 文件名是 ASCII/UTF-8 字符串，SHA-1 是 20 字节的原始二进制哈希值。
 * </p>
 *
 * <p>
 * Tree 中的条目必须按文件名排序（字节序）。这与 Git 的行为一致。
 * </p>
 */
public class Tree extends GitObject {

    /** 常规文件的模式 */
    public static final String MODE_REGULAR_FILE = "100644";
    /** 可执行文件的模式 */
    public static final String MODE_EXECUTABLE_FILE = "100755";
    /** 符号链接的模式 */
    public static final String MODE_SYMLINK = "120000";
    /** 目录的模式（实际就是 Tree 对象） */
    public static final String MODE_DIRECTORY = "040000";

    /** Tree 中的条目列表 */
    private final List<TreeEntry> entries;

    /**
     * 创建一个空的 Tree 对象。
     */
    public Tree() {
        this.entries = new ArrayList<>();
    }

    /**
     * 创建一个包含指定条目的 Tree 对象。
     *
     * @param entries 条目列表
     */
    public Tree(List<TreeEntry> entries) {
        this.entries = new ArrayList<>(entries);
    }

    /**
     * 获取所有条目。
     *
     * @return 条目列表（不可修改）
     */
    public List<TreeEntry> getEntries() {
        return List.copyOf(entries);
    }

    /**
     * 添加一个条目到 Tree 中。
     * 添加后会自动按文件名排序。
     *
     * @param entry 要添加的条目
     */
    public void addEntry(TreeEntry entry) {
        entries.add(entry);
        sortEntries();
    }

    /**
     * 按文件名（字节序）对条目排序。
     * Git 要求 Tree 条目必须排序。
     */
    private void sortEntries() {
        entries.sort(Comparator.comparing(TreeEntry::getName));
    }

    @Override
    public String getType() {
        return TYPE_TREE;
    }

    @Override
    public byte[] serializeContent() throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        for (TreeEntry entry : entries) {
            // 格式：mode name\\0 + 20 字节 SHA-1
            String modeAndName = entry.getMode() + " " + entry.getName() + "\0";
            bos.write(modeAndName.getBytes(StandardCharsets.US_ASCII));
            bos.write(HashUtils.hexToBytes(entry.getHash()));
        }
        return bos.toByteArray();
    }

    /**
     * 从 Tree 内容字节数组中解析出 Tree 对象。
     *
     * @param content 去掉对象头后的内容字节数组
     * @return Tree 对象
     * @throws IOException 如果解析失败
     */
    public static Tree parse(byte[] content) throws IOException {
        List<TreeEntry> entries = new ArrayList<>();
        int pos = 0;

        while (pos < content.length) {
            // 查找空格，确定 mode 的结束位置
            int spaceIndex = indexOf(content, (byte) ' ', pos);
            if (spaceIndex < 0) {
                throw new IOException("Invalid tree entry: no space found at position " + pos);
            }
            String mode = new String(content, pos, spaceIndex - pos, StandardCharsets.US_ASCII);

            // 查找 \\0，确定文件名的结束位置
            int nullIndex = indexOf(content, (byte) 0, spaceIndex + 1);
            if (nullIndex < 0) {
                throw new IOException("Invalid tree entry: no null byte found after space");
            }
            String name = new String(content, spaceIndex + 1, nullIndex - spaceIndex - 1,
                    StandardCharsets.UTF_8);

            // 接下来的 20 字节是 SHA-1 哈希值
            int hashStart = nullIndex + 1;
            if (hashStart + 20 > content.length) {
                throw new IOException("Invalid tree entry: truncated SHA-1 at entry '" + name + "'");
            }
            byte[] hashBytes = new byte[20];
            System.arraycopy(content, hashStart, hashBytes, 0, 20);
            String hash = HashUtils.bytesToHex(hashBytes);

            entries.add(new TreeEntry(mode, name, hash));
            pos = hashStart + 20;
        }

        return new Tree(entries);
    }

    /**
     * 在字节数组中从指定位置开始查找指定字节。
     */
    private static int indexOf(byte[] data, byte b, int fromIndex) {
        for (int i = fromIndex; i < data.length; i++) {
            if (data[i] == b) {
                return i;
            }
        }
        return -1;
    }

    @Override
    public String toString() {
        return "Tree{entries=" + entries.size() + "}";
    }

    /**
     * Tree 中的一个条目。
     * 每个条目表示一个文件或子目录。
     */
    public static class TreeEntry {
        private final String mode;
        private final String name;
        private final String hash;

        /**
         * 创建一个 Tree 条目。
         *
         * @param mode 文件模式（如 "100644"、"40000"）
         * @param name 文件名或目录名
         * @param hash 指向的 Git 对象的 SHA-1 哈希值
         */
        public TreeEntry(String mode, String name, String hash) {
            this.mode = Objects.requireNonNull(mode, "mode must not be null");
            this.name = Objects.requireNonNull(name, "name must not be null");
            this.hash = Objects.requireNonNull(hash, "hash must not be null");

            if (hash.length() != 40) {
                throw new IllegalArgumentException("Hash must be 40 hex characters: " + hash);
            }
        }

        public String getMode() {
            return mode;
        }

        public String getName() {
            return name;
        }

        public String getHash() {
            return hash;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            TreeEntry entry = (TreeEntry) o;
            return mode.equals(entry.mode) && name.equals(entry.name) && hash.equals(entry.hash);
        }

        @Override
        public int hashCode() {
            return Objects.hash(mode, name, hash);
        }

        @Override
        public String toString() {
            return mode + " " + name + " (" + hash.substring(0, 7) + "...)";
        }
    }
}
