package mygit.util;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * SHA-1 哈希工具类。
 * <p>
 * Git 使用 SHA-1 作为对象的唯一标识符。每个 Git 对象（Blob、Tree、Commit、Tag）
 * 的内容经过 SHA-1 哈希后得到一个 40 位的十六进制字符串，用作对象文件的文件名。
 * </p>
 * <p>
 * 虽然 Git 社区已经在向 SHA-256 过渡，但本教学工具仍使用 SHA-1 以保持与经典 Git 的兼容性。
 * </p>
 */
public final class HashUtils {

    private static final char[] HEX_CHARS = "0123456789abcdef".toCharArray();

    private HashUtils() {
        // 工具类，禁止实例化
    }

    /**
     * 计算字节数组的 SHA-1 哈希值，返回 40 位小写十六进制字符串。
     *
     * @param data 输入数据
     * @return 40 位小写十六进制 SHA-1 哈希值
     */
    public static String sha1Hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(data);
            return bytesToHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-1 是 Java 标准算法，理论上不会抛出此异常
            throw new RuntimeException("SHA-1 algorithm not available", e);
        }
    }

    /**
     * 将字节数组转换为小写十六进制字符串。
     *
     * @param bytes 字节数组
     * @return 十六进制字符串
     */
    public static String bytesToHex(byte[] bytes) {
        char[] hex = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xFF;
            hex[i * 2] = HEX_CHARS[v >>> 4];
            hex[i * 2 + 1] = HEX_CHARS[v & 0x0F];
        }
        return new String(hex);
    }

    /**
     * 将十六进制字符串解析为字节数组。
     *
     * @param hex 十六进制字符串
     * @return 字节数组
     * @throws IllegalArgumentException 如果字符串长度不是偶数或包含非法字符
     */
    public static byte[] hexToBytes(String hex) {
        int len = hex.length();
        if (len % 2 != 0) {
            throw new IllegalArgumentException("Hex string must have even length: " + len);
        }
        byte[] bytes = new byte[len / 2];
        for (int i = 0; i < bytes.length; i++) {
            int high = Character.digit(hex.charAt(i * 2), 16);
            int low = Character.digit(hex.charAt(i * 2 + 1), 16);
            if (high == -1 || low == -1) {
                throw new IllegalArgumentException("Invalid hex character at position " + (i * 2));
            }
            bytes[i] = (byte) ((high << 4) | low);
        }
        return bytes;
    }
}
