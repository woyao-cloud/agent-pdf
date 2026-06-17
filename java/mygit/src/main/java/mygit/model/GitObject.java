package mygit.model;

import mygit.util.HashUtils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Git 对象的抽象基类。
 * <p>
 * Git 中有四种对象类型：Blob、Tree、Commit、Tag。所有对象共享相同的存储格式：
 * <pre>
 *   [类型] + 空格 + [内容长度(字节)] + \\0 + [内容]
 * </pre>
 * 这个格式称为"对象头"。对象头 + 内容一起参与 SHA-1 哈希计算，
 * 但存储时只压缩内容部分（不含对象头）——不对，实际上 Git 压缩的是整个
 * "对象头 + 内容"的字节序列。
 * </p>
 *
 * <p>
 * 更准确地说，Git 存储对象时的流程是：
 * <ol>
 *   <li>将对象序列化为 "type length\\0content" 格式的字节数组</li>
 *   <li>计算这个字节数组的 SHA-1 哈希值</li>
 *   <li>用 zlib 压缩整个字节数组</li>
 *   <li>以哈希值的前 2 位为目录名，后 38 位为文件名，写入 .mygit/objects/ 下</li>
 * </ol>
 * </p>
 */
public abstract class GitObject {

    /** 对象类型常量 */
    public static final String TYPE_BLOB = "blob";
    public static final String TYPE_TREE = "tree";
    public static final String TYPE_COMMIT = "commit";
    public static final String TYPE_TAG = "tag";

    /**
     * 获取对象类型名称。
     *
     * @return 类型名称，如 "blob"、"tree"、"commit"、"tag"
     */
    public abstract String getType();

    /**
     * 序列化对象内容（不含对象头）。
     * 子类实现此方法返回各自的具体内容字节数组。
     *
     * @return 对象内容的字节数组
     * @throws IOException 如果序列化失败
     */
    public abstract byte[] serializeContent() throws IOException;

    /**
     * 将完整对象（对象头 + 内容）序列化为字节数组。
     * 格式为 "type length\\0content"。
     *
     * @return 完整对象的字节数组
     * @throws IOException 如果序列化失败
     */
    public byte[] serialize() throws IOException {
        byte[] content = serializeContent();
        String header = getType() + " " + content.length + "\0";
        byte[] headerBytes = header.getBytes(StandardCharsets.US_ASCII);

        ByteArrayOutputStream bos = new ByteArrayOutputStream(headerBytes.length + content.length);
        bos.write(headerBytes);
        bos.write(content);
        return bos.toByteArray();
    }

    /**
     * 计算对象的 SHA-1 哈希值。
     *
     * @return 40 位十六进制哈希字符串
     * @throws IOException 如果序列化失败
     */
    public String computeHash() throws IOException {
        return HashUtils.sha1Hex(serialize());
    }

    /**
     * 从序列化数据中解析对象。
     * 解析 "type length\\0content" 格式的字节数组，返回对应的 GitObject 实例。
     *
     * @param rawData 包含对象头的完整字节数组
     * @return 解析后的 GitObject 对象
     * @throws IOException 如果格式无效或不支持的类型
     */
    public static GitObject parse(byte[] rawData) throws IOException {
        // 查找 \\0 分隔符，分隔符之前是 "type length"
        int nullIndex = indexOfNull(rawData);
        if (nullIndex < 0) {
            throw new IOException("Invalid object format: no null byte found in header");
        }

        String header = new String(rawData, 0, nullIndex, StandardCharsets.US_ASCII);
        int spaceIndex = header.indexOf(' ');
        if (spaceIndex < 0) {
            throw new IOException("Invalid object header: " + header);
        }

        String type = header.substring(0, spaceIndex);
        // length 字段可用于验证，但这里暂不校验
        byte[] content = new byte[rawData.length - nullIndex - 1];
        System.arraycopy(rawData, nullIndex + 1, content, 0, content.length);

        return switch (type) {
            case TYPE_BLOB -> Blob.parse(content);
            case TYPE_TREE -> Tree.parse(content);
            case TYPE_COMMIT -> Commit.parse(content);
            case TYPE_TAG -> Tag.parse(content);
            default -> throw new IOException("Unknown object type: " + type);
        };
    }

    /**
     * 在字节数组中查找第一个 \\0 字节的位置。
     */
    private static int indexOfNull(byte[] data) {
        for (int i = 0; i < data.length; i++) {
            if (data[i] == 0) {
                return i;
            }
        }
        return -1;
    }
}
