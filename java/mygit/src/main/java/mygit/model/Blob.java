package mygit.model;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Blob 对象：存储文件内容。
 * <p>
 * Blob 是 Git 中最简单的对象类型，它只存储文件的内容，不存储文件名或元数据。
 * 文件名由 Tree 对象管理。两个内容完全相同的文件（即使路径不同）会共享同一个 Blob 对象，
 * 这是 Git 去重存储的基础。
 * </p>
 *
 * <p>
 * Blob 的序列化格式：
 * <pre>
 *   blob <内容长度>\0<文件内容>
 * </pre>
 * 内容就是文件的原始字节，不做任何编码转换。
 * </p>
 */
public class Blob extends GitObject {

    /** 文件内容的原始字节 */
    private final byte[] data;

    /**
     * 创建一个 Blob 对象。
     *
     * @param data 文件内容的原始字节
     */
    public Blob(byte[] data) {
        this.data = data;
    }

    /**
     * 获取文件内容。
     *
     * @return 文件内容的字节数组
     */
    public byte[] getData() {
        return data;
    }

    @Override
    public String getType() {
        return TYPE_BLOB;
    }

    @Override
    public byte[] serializeContent() throws IOException {
        return data;
    }

    /**
     * 从 Blob 内容字节数组中解析出 Blob 对象。
     * 对于 Blob，内容就是原始文件数据。
     *
     * @param content 去掉对象头后的内容字节数组
     * @return Blob 对象
     */
    public static Blob parse(byte[] content) {
        return new Blob(content);
    }

    @Override
    public String toString() {
        // 只显示前 100 字节，避免打印大文件内容
        int showLen = Math.min(data.length, 100);
        String preview = new String(data, 0, showLen, StandardCharsets.UTF_8);
        if (data.length > 100) {
            preview += "...";
        }
        return "Blob{size=" + data.length + ", data='" + preview + "'}";
    }
}
