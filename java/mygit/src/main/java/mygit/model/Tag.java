package mygit.model;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

/**
 * Tag 对象：为某个提交创建一个固定的引用（标签）。
 * <p>
 * Git 有两种标签：轻量标签（lightweight tag）和注解标签（annotated tag）。
 * 轻量标签只是 refs/tags/ 下的一个文件，指向某个提交的 SHA-1。
 * 注解标签是一个完整的 Git 对象，包含标签名、标签消息、打标签者信息，
 * 以及指向的提交（或其他对象）的引用。
 * </p>
 *
 * <p>
 * 本教学工具同时支持两种标签。Tag 类表示注解标签对象。
 * </p>
 *
 * <p>
 * Tag 的序列化格式（类似于 Commit）：
 * <pre>
 *   object <target_hash>
 *   type <target_type>
 *   tag <tag_name>
 *   tagger <name> <<email>> <timestamp> <timezone>
 *
 *   <tag message>
 * </pre>
 * </p>
 */
public class Tag extends GitObject {

    /** 指向的目标对象的 SHA-1 哈希 */
    private final String targetHash;

    /** 目标对象的类型 */
    private final String targetType;

    /** 标签名称 */
    private final String tagName;

    /** 打标签者姓名 */
    private final String taggerName;

    /** 打标签者邮箱 */
    private final String taggerEmail;

    /** 标签消息 */
    private final String message;

    /**
     * 创建一个注解标签对象。
     *
     * @param targetHash  目标对象的 SHA-1 哈希
     * @param targetType  目标对象类型（通常为 "commit"）
     * @param tagName     标签名称
     * @param taggerName  打标签者姓名
     * @param taggerEmail 打标签者邮箱
     * @param message     标签消息
     */
    public Tag(String targetHash, String targetType, String tagName,
               String taggerName, String taggerEmail, String message) {
        this.targetHash = Objects.requireNonNull(targetHash, "targetHash must not be null");
        this.targetType = Objects.requireNonNull(targetType, "targetType must not be null");
        this.tagName = Objects.requireNonNull(tagName, "tagName must not be null");
        this.taggerName = Objects.requireNonNull(taggerName, "taggerName must not be null");
        this.taggerEmail = Objects.requireNonNull(taggerEmail, "taggerEmail must not be null");
        this.message = Objects.requireNonNull(message, "message must not be null");

        if (targetHash.length() != 40) {
            throw new IllegalArgumentException("Hash must be 40 hex characters: " + targetHash);
        }
    }

    public String getTargetHash() {
        return targetHash;
    }

    public String getTargetType() {
        return targetType;
    }

    public String getTagName() {
        return tagName;
    }

    public String getTaggerName() {
        return taggerName;
    }

    public String getTaggerEmail() {
        return taggerEmail;
    }

    public String getMessage() {
        return message;
    }

    @Override
    public String getType() {
        return TYPE_TAG;
    }

    @Override
    public byte[] serializeContent() throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("object ").append(targetHash).append("\n");
        sb.append("type ").append(targetType).append("\n");
        sb.append("tag ").append(tagName).append("\n");
        sb.append("tagger ").append(taggerName).append(" <").append(taggerEmail).append(">\n");
        sb.append("\n").append(message).append("\n");
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /**
     * 从 Tag 内容中解析出 Tag 对象。
     *
     * @param content 去掉对象头后的内容字节数组
     * @return Tag 对象
     * @throws IOException 如果解析失败
     */
    public static Tag parse(byte[] content) throws IOException {
        String text = new String(content, StandardCharsets.UTF_8);
        String[] lines = text.split("\n", -1);

        String targetHash = null;
        String targetType = null;
        String tagName = null;
        String taggerName = null;
        String taggerEmail = null;
        StringBuilder message = new StringBuilder();

        int i = 0;

        // 解析头部
        while (i < lines.length && !lines[i].isEmpty()) {
            String line = lines[i];

            if (line.startsWith("object ")) {
                targetHash = line.substring(7).trim();
            } else if (line.startsWith("type ")) {
                targetType = line.substring(5).trim();
            } else if (line.startsWith("tag ")) {
                tagName = line.substring(4).trim();
            } else if (line.startsWith("tagger ")) {
                String rest = line.substring(7).trim();
                int emailStart = rest.indexOf('<');
                int emailEnd = rest.indexOf('>');
                if (emailStart >= 0 && emailEnd >= 0) {
                    taggerName = rest.substring(0, emailStart).trim();
                    taggerEmail = rest.substring(emailStart + 1, emailEnd);
                } else {
                    taggerName = rest;
                    taggerEmail = "";
                }
            }

            i++;
        }

        // 跳过空行
        while (i < lines.length && lines[i].isEmpty()) {
            i++;
        }

        // 标签消息
        while (i < lines.length) {
            if (message.length() > 0) {
                message.append("\n");
            }
            message.append(lines[i]);
            i++;
        }

        if (targetHash == null || targetType == null || tagName == null) {
            throw new IOException("Invalid tag object: missing required fields");
        }

        return new Tag(targetHash, targetType, tagName,
                taggerName != null ? taggerName : "Unknown",
                taggerEmail != null ? taggerEmail : "",
                message.toString());
    }

    @Override
    public String toString() {
        return "Tag{tag=" + tagName + ", target=" + targetHash.substring(0, 7)
                + ", type=" + targetType + "}";
    }
}
