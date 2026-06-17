package mygit.model;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * Commit 对象：存储一次提交的快照信息。
 * <p>
 * Commit 是 Git 中最重要的对象之一，它记录了：
 * <ul>
 *   <li>当前目录快照（指向一个 Tree 对象）</li>
 *   <li>父提交（可以没有、一个或多个）</li>
 *   <li>作者信息（姓名、邮箱、时间戳）</li>
 *   <li>提交者信息（通常与作者相同）</li>
 *   <li>提交消息</li>
 * </ul>
 * </p>
 *
 * <p>
 * Commit 的序列化格式是文本格式：
 * <pre>
 *   tree <tree_hash>
 *   parent <parent_hash>    （可选的，首次提交没有）
 *   author <name> <<email>> <timestamp> <timezone>
 *   committer <name> <<email>> <timestamp> <timezone>
 *
 *   <commit message>
 * </pre>
 * </p>
 */
public class Commit extends GitObject {

    /** 作者/提交者信息的日期时间格式：Unix 时间戳 + 时区 */
    private static final DateTimeFormatter TIMESTAMP_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss Z");

    /** 指向的 Tree 对象的 SHA-1 哈希 */
    private final String treeHash;

    /** 父提交的 SHA-1 哈希列表（首次提交为空列表） */
    private final List<String> parentHashes;

    /** 作者姓名 */
    private final String authorName;

    /** 作者邮箱 */
    private final String authorEmail;

    /** 提交时间戳（自 1970-01-01 以来的秒数） */
    private final long timestamp;

    /** 时区偏移（分钟） */
    private final int timezoneOffset;

    /** 提交消息 */
    private final String message;

    /**
     * 创建一个新的 Commit 对象。
     *
     * @param treeHash       指向的 Tree 对象的 SHA-1 哈希
     * @param parentHashes   父提交的 SHA-1 哈希列表（可以为空）
     * @param authorName     作者姓名
     * @param authorEmail    作者邮箱
     * @param message        提交消息
     * @param timestamp      时间戳（秒），-1 表示使用当前时间
     * @param timezoneOffset 时区偏移（分钟），Integer.MAX_VALUE 表示使用系统默认时区
     */
    public Commit(String treeHash, List<String> parentHashes,
                  String authorName, String authorEmail,
                  String message, long timestamp, int timezoneOffset) {
        this.treeHash = Objects.requireNonNull(treeHash, "treeHash must not be null");
        this.parentHashes = parentHashes != null
                ? List.copyOf(parentHashes)
                : List.of();
        this.authorName = Objects.requireNonNull(authorName, "authorName must not be null");
        this.authorEmail = Objects.requireNonNull(authorEmail, "authorEmail must not be null");
        this.message = Objects.requireNonNull(message, "message must not be null");

        if (timestamp < 0) {
            this.timestamp = Instant.now().getEpochSecond();
        } else {
            this.timestamp = timestamp;
        }

        if (timezoneOffset == Integer.MAX_VALUE) {
            this.timezoneOffset = ZonedDateTime.now().getOffset().getTotalSeconds() / 60;
        } else {
            this.timezoneOffset = timezoneOffset;
        }
    }

    /**
     * 创建提交的简化方法，使用当前时间和默认时区。
     */
    public Commit(String treeHash, List<String> parentHashes,
                  String authorName, String authorEmail,
                  String message) {
        this(treeHash, parentHashes, authorName, authorEmail, message, -1, Integer.MAX_VALUE);
    }

    public String getTreeHash() {
        return treeHash;
    }

    public List<String> getParentHashes() {
        return parentHashes;
    }

    public String getAuthorName() {
        return authorName;
    }

    public String getAuthorEmail() {
        return authorEmail;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public int getTimezoneOffset() {
        return timezoneOffset;
    }

    public String getMessage() {
        return message;
    }

    /**
     * 格式化时间戳为可读字符串。
     */
    public String getFormattedTimestamp() {
        ZoneId zone = ZoneId.ofOffset("UTC",
                java.time.ZoneOffset.ofTotalSeconds(timezoneOffset * 60));
        ZonedDateTime zdt = ZonedDateTime.ofInstant(
                Instant.ofEpochSecond(timestamp), zone);
        return zdt.format(TIMESTAMP_FORMAT);
    }

    @Override
    public String getType() {
        return TYPE_COMMIT;
    }

    @Override
    public byte[] serializeContent() throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("tree ").append(treeHash).append("\n");

        for (String parentHash : parentHashes) {
            sb.append("parent ").append(parentHash).append("\n");
        }

        // 格式化时区偏移为 "+0800" 格式
        String tz = formatTimezoneOffset(timezoneOffset);
        sb.append("author ").append(authorName).append(" <").append(authorEmail).append("> ")
                .append(timestamp).append(" ").append(tz).append("\n");
        sb.append("committer ").append(authorName).append(" <").append(authorEmail).append("> ")
                .append(timestamp).append(" ").append(tz).append("\n");
        sb.append("\n").append(message).append("\n");

        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /**
     * 将时区偏移（分钟）格式化为 "+0800" 或 "-0500" 格式。
     */
    private static String formatTimezoneOffset(int offsetMinutes) {
        int totalMinutes = Math.abs(offsetMinutes);
        int hours = totalMinutes / 60;
        int minutes = totalMinutes % 60;
        String sign = offsetMinutes >= 0 ? "+" : "-";
        return String.format("%s%02d%02d", sign, hours, minutes);
    }

    /**
     * 从 Commit 内容中解析出 Commit 对象。
     *
     * @param content 去掉对象头后的内容字节数组
     * @return Commit 对象
     * @throws IOException 如果解析失败
     */
    public static Commit parse(byte[] content) throws IOException {
        String text = new String(content, StandardCharsets.UTF_8);
        String[] lines = text.split("\n", -1);

        String treeHash = null;
        List<String> parentHashes = new ArrayList<>();
        String authorName = null;
        String authorEmail = null;
        long timestamp = 0;
        int timezoneOffset = 0;
        StringBuilder message = new StringBuilder();

        int i = 0;

        // 解析头部（tree / parent / author / committer 行）
        while (i < lines.length && !lines[i].isEmpty()) {
            String line = lines[i];

            if (line.startsWith("tree ")) {
                treeHash = line.substring(5).trim();
            } else if (line.startsWith("parent ")) {
                parentHashes.add(line.substring(7).trim());
            } else if (line.startsWith("author ")) {
                // 格式: author Name <email> timestamp timezone
                String rest = line.substring(7).trim();
                int emailStart = rest.indexOf('<');
                int emailEnd = rest.indexOf('>');
                if (emailStart < 0 || emailEnd < 0) {
                    throw new IOException("Invalid author format: " + rest);
                }
                authorName = rest.substring(0, emailStart).trim();
                authorEmail = rest.substring(emailStart + 1, emailEnd);
                // 解析时间戳和时区
                String afterEmail = rest.substring(emailEnd + 1).trim();
                String[] parts = afterEmail.split(" ");
                if (parts.length >= 2) {
                    timestamp = Long.parseLong(parts[0]);
                    timezoneOffset = parseTimezoneOffset(parts[1]);
                }
            } else if (line.startsWith("committer ")) {
                // 提交者信息，解析方式与 author 相同
                // 本教学工具中 committer 与 author 相同，此处略过
            }

            i++;
        }

        // 跳过空行
        while (i < lines.length && lines[i].isEmpty()) {
            i++;
        }

        // 剩余的为提交消息
        while (i < lines.length) {
            if (message.length() > 0) {
                message.append("\n");
            }
            message.append(lines[i]);
            i++;
        }

        if (treeHash == null) {
            throw new IOException("Commit object missing tree hash");
        }
        if (authorName == null || authorEmail == null) {
            throw new IOException("Commit object missing author information");
        }

        return new Commit(treeHash, parentHashes, authorName, authorEmail,
                message.toString(), timestamp, timezoneOffset);
    }

    /**
     * 解析时区偏移字符串（如 "+0800"）为分钟数。
     */
    private static int parseTimezoneOffset(String tz) {
        if (tz.length() < 3) return 0;
        int sign = tz.charAt(0) == '-' ? -1 : 1;
        int hours = Integer.parseInt(tz.substring(1, 3));
        int minutes = tz.length() > 3 ? Integer.parseInt(tz.substring(3)) : 0;
        return sign * (hours * 60 + minutes);
    }

    @Override
    public String toString() {
        return "Commit{tree=" + treeHash.substring(0, 7)
                + ", parents=" + parentHashes.size()
                + ", author=" + authorName
                + ", message='" + message.replace("\n", "\\n") + "'}";
    }
}
