package mygit.store;

import mygit.model.GitObject;
import mygit.util.CompressUtils;
import mygit.util.HashUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Git 对象存储管理器。
 * <p>
 * 负责在 .mygit/objects/ 目录下读写 Git 对象。对象以 zlib 压缩格式存储，
 * 文件路径为 .mygit/objects/XX/YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY，
 * 其中 XX 是 SHA-1 哈希的前 2 位，YYYY... 是后 38 位。
 * </p>
 *
 * <p>
 * 例如，一个 SHA-1 为 "a1b2c3d4..." 的对象存储在：
 * .mygit/objects/a1/b2c3d4...
 * </p>
 */
public class ObjectStore {

    /** .mygit/objects 目录的路径 */
    private final Path objectsDir;

    /**
     * 创建一个对象存储管理器。
     *
     * @param mygitDir .mygit 目录的路径
     */
    public ObjectStore(Path mygitDir) {
        this.objectsDir = mygitDir.resolve("objects");
    }

    /**
     * 获取 objects 目录路径。
     */
    public Path getObjectsDir() {
        return objectsDir;
    }

    /**
     * 将一个 Git 对象写入存储。
     * <ol>
     *   <li>序列化对象为 "type length\\0content" 格式</li>
     *   <li>计算 SHA-1 哈希</li>
     *   <li>用 zlib 压缩</li>
     *   <li>写入 .mygit/objects/XX/YYYY... 文件</li>
     * </ol>
     *
     * @param object 要存储的 Git 对象
     * @return 对象的 SHA-1 哈希值（40 位十六进制字符串）
     * @throws IOException 如果写入失败
     */
    public String store(GitObject object) throws IOException {
        byte[] serialized = object.serialize();
        String hash = HashUtils.sha1Hex(serialized);
        byte[] compressed = CompressUtils.compress(serialized);

        Path objectPath = getObjectPath(hash);
        Files.createDirectories(objectPath.getParent());
        Files.write(objectPath, compressed);

        return hash;
    }

    /**
     * 从存储中读取一个 Git 对象。
     *
     * @param hash 对象的 SHA-1 哈希值
     * @return 解析后的 Git 对象
     * @throws IOException 如果对象不存在或读取失败
     */
    public GitObject read(String hash) throws IOException {
        Path objectPath = getObjectPath(hash);
        if (!Files.exists(objectPath)) {
            throw new IOException("Object not found: " + hash
                    + " (expected at " + objectPath + ")");
        }

        byte[] compressed = Files.readAllBytes(objectPath);
        byte[] decompressed = CompressUtils.decompress(compressed);
        return GitObject.parse(decompressed);
    }

    /**
     * 检查对象是否存在于存储中。
     *
     * @param hash 对象的 SHA-1 哈希值
     * @return 如果对象存在则返回 true
     */
    public boolean exists(String hash) {
        return Files.exists(getObjectPath(hash));
    }

    /**
     * 根据哈希值计算对象文件的路径。
     * 路径格式：.mygit/objects/XX/YYYY...
     *
     * @param hash 40 位十六进制 SHA-1 哈希值
     * @return 对象文件的完整路径
     */
    private Path getObjectPath(String hash) {
        if (hash.length() != 40) {
            throw new IllegalArgumentException("Hash must be 40 hex characters: " + hash);
        }
        String dir = hash.substring(0, 2);
        String file = hash.substring(2);
        return objectsDir.resolve(dir).resolve(file);
    }
}
