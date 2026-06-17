package mygit.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.DataFormatException;
import java.util.zip.Deflater;
import java.util.zip.Inflater;

/**
 * zlib 压缩/解压工具类。
 * <p>
 * Git 使用 zlib 格式压缩对象数据。每个对象在存储前会先序列化为
 * "type length\\0content" 格式的字节数组，然后使用 zlib 压缩后写入磁盘。
 * Java 的 {@link java.util.zip.Deflater} 默认输出 zlib 格式（2 字节头部 +
 * deflate 数据 + 4 字节 Adler-32 校验和），与 Git 完全兼容。
 * </p>
 */
public final class CompressUtils {

    private CompressUtils() {
        // 工具类，禁止实例化
    }

    /**
     * 使用 zlib 压缩数据。
     *
     * @param data 原始数据
     * @return 压缩后的数据
     */
    public static byte[] compress(byte[] data) {
        Deflater deflater = new Deflater(Deflater.BEST_SPEED);
        deflater.setInput(data);
        deflater.finish();

        ByteArrayOutputStream bos = new ByteArrayOutputStream(data.length);
        byte[] buffer = new byte[8192];
        while (!deflater.finished()) {
            int count = deflater.deflate(buffer);
            bos.write(buffer, 0, count);
        }
        deflater.end();
        return bos.toByteArray();
    }

    /**
     * 使用 zlib 解压数据。
     *
     * @param compressed 压缩数据
     * @return 原始数据
     * @throws IOException 如果解压失败
     */
    public static byte[] decompress(byte[] compressed) throws IOException {
        Inflater inflater = new Inflater();
        inflater.setInput(compressed);

        ByteArrayOutputStream bos = new ByteArrayOutputStream(compressed.length * 2);
        byte[] buffer = new byte[8192];
        try {
            while (!inflater.finished()) {
                int count = inflater.inflate(buffer);
                if (count == 0) {
                    // 理论上不应发生，但以防死循环
                    break;
                }
                bos.write(buffer, 0, count);
            }
        } catch (DataFormatException e) {
            throw new IOException("zlib decompression failed: data may be corrupted", e);
        } finally {
            inflater.end();
        }
        return bos.toByteArray();
    }
}
