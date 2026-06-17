package mygit;

import mygit.model.*;
import mygit.store.Index;
import mygit.store.ObjectStore;
import mygit.store.Repository;
import mygit.util.CompressUtils;
import mygit.util.HashUtils;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * MyGit 核心功能单元测试。
 * <p>
 * 测试覆盖了 Git 对象模型、对象存储、索引管理、
 * 仓库操作以及所有命令的实现。
 * </p>
 */
class MyGitTest {

    // ========== 工具类测试 ==========

    @Test
    void testSha1Hex() {
        // 测试已知字符串的 SHA-1
        byte[] data = "hello".getBytes(StandardCharsets.UTF_8);
        String hash = HashUtils.sha1Hex(data);
        // "hello" 的 SHA-1 应该是 aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
        assertEquals("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d", hash);
    }

    @Test
    void testBytesToHex() {
        byte[] bytes = {(byte) 0xAB, (byte) 0xCD, (byte) 0xEF};
        assertEquals("abcdef", HashUtils.bytesToHex(bytes));
    }

    @Test
    void testHexToBytes() {
        String hex = "abcdef";
        byte[] bytes = HashUtils.hexToBytes(hex);
        assertEquals(3, bytes.length);
        assertEquals((byte) 0xAB, bytes[0]);
        assertEquals((byte) 0xCD, bytes[1]);
        assertEquals((byte) 0xEF, bytes[2]);
    }

    @Test
    void testHexToBytesRoundTrip() {
        String original = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
        byte[] bytes = HashUtils.hexToBytes(original);
        String result = HashUtils.bytesToHex(bytes);
        assertEquals(original, result);
    }

    @Test
    void testHexToBytesInvalidLength() {
        assertThrows(IllegalArgumentException.class,
                () -> HashUtils.hexToBytes("abc"));
    }

    @Test
    void testCompressDecompress() throws IOException {
        String original = "Hello, MyGit! This is a test of zlib compression.";
        byte[] compressed = CompressUtils.compress(original.getBytes(StandardCharsets.UTF_8));
        byte[] decompressed = CompressUtils.decompress(compressed);
        String result = new String(decompressed, StandardCharsets.UTF_8);
        assertEquals(original, result);
    }

    // ========== Blob 测试 ==========

    @Test
    void testBlobCreate() {
        byte[] data = "file content".getBytes(StandardCharsets.UTF_8);
        Blob blob = new Blob(data);
        assertEquals("blob", blob.getType());
        assertArrayEquals(data, blob.getData());
    }

    @Test
    void testBlobSerialize() throws IOException {
        byte[] data = "hello".getBytes(StandardCharsets.UTF_8);
        Blob blob = new Blob(data);
        byte[] serialized = blob.serialize();
        // 检查格式: "blob 5\0hello"
        String header = new String(serialized, 0, 7, StandardCharsets.US_ASCII);
        assertEquals("blob 5\0", header);
        assertEquals('h', serialized[7]);
    }

    @Test
    void testBlobParse() {
        byte[] content = "test data".getBytes(StandardCharsets.UTF_8);
        Blob blob = Blob.parse(content);
        assertArrayEquals(content, blob.getData());
    }

    @Test
    void testBlobHash() throws IOException {
        Blob blob1 = new Blob("same content".getBytes(StandardCharsets.UTF_8));
        Blob blob2 = new Blob("same content".getBytes(StandardCharsets.UTF_8));
        // 相同内容的 Blob 应该有相同的哈希
        assertEquals(blob1.computeHash(), blob2.computeHash());
    }

    // ========== Tree 测试 ==========

    @Test
    void testTreeCreate() {
        Tree tree = new Tree();
        assertTrue(tree.getEntries().isEmpty());
    }

    @Test
    void testTreeAddEntry() {
        Tree tree = new Tree();
        tree.addEntry(new Tree.TreeEntry("100644", "test.txt",
                "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"));
        assertEquals(1, tree.getEntries().size());
    }

    @Test
    void testTreeEntryValidation() {
        assertThrows(IllegalArgumentException.class,
                () -> new Tree.TreeEntry("100644", "test.txt", "short"));
    }

    @Test
    void testTreeSerializeAndParse() throws IOException {
        Tree tree = new Tree();
        String hash1 = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
        String hash2 = "8baef1b4abc478178b004d62031cf7fe6db3f23e";
        tree.addEntry(new Tree.TreeEntry("100644", "a.txt", hash1));
        tree.addEntry(new Tree.TreeEntry("100644", "b.txt", hash2));

        byte[] serialized = tree.serializeContent();
        Tree parsed = Tree.parse(serialized);

        List<Tree.TreeEntry> entries = parsed.getEntries();
        assertEquals(2, entries.size());
        // 检查排序：a.txt 应该在 b.txt 之前
        assertEquals("a.txt", entries.get(0).getName());
        assertEquals("b.txt", entries.get(1).getName());
        assertEquals(hash1, entries.get(0).getHash());
        assertEquals(hash2, entries.get(1).getHash());
    }

    @Test
    void testTreeAutoSort() {
        Tree tree = new Tree();
        tree.addEntry(new Tree.TreeEntry("100644", "z.txt",
                "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"));
        tree.addEntry(new Tree.TreeEntry("100644", "a.txt",
                "8baef1b4abc478178b004d62031cf7fe6db3f23e"));
        // 自动排序后，a.txt 应该在前
        assertEquals("a.txt", tree.getEntries().get(0).getName());
        assertEquals("z.txt", tree.getEntries().get(1).getName());
    }

    @Test
    void testTreeWithDirectory() throws IOException {
        Tree tree = new Tree();
        String subTreeHash = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
        tree.addEntry(new Tree.TreeEntry("040000", "subdir", subTreeHash));
        tree.addEntry(new Tree.TreeEntry("100644", "root.txt",
                "8baef1b4abc478178b004d62031cf7fe6db3f23e"));

        // 验证序列化再反序列化后条目不变
        byte[] serialized = tree.serializeContent();
        Tree parsed = Tree.parse(serialized);
        assertEquals(2, parsed.getEntries().size());
    }

    // ========== Commit 测试 ==========

    @Test
    void testCommitCreate() throws IOException {
        String treeHash = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
        Commit commit = new Commit(treeHash, List.of(),
                "Alice", "alice@example.com",
                "Initial commit");
        assertEquals("commit", commit.getType());
        assertEquals(treeHash, commit.getTreeHash());
        assertTrue(commit.getParentHashes().isEmpty());
        assertEquals("Initial commit", commit.getMessage());
    }

    @Test
    void testCommitWithParent() throws IOException {
        String treeHash = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
        String parentHash = "8baef1b4abc478178b004d62031cf7fe6db3f23e";
        Commit commit = new Commit(treeHash, List.of(parentHash),
                "Bob", "bob@example.com",
                "Second commit");
        assertEquals(1, commit.getParentHashes().size());
        assertEquals(parentHash, commit.getParentHashes().get(0));
    }

    @Test
    void testCommitSerializeAndParse() throws IOException {
        String treeHash = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
        String parentHash = "8baef1b4abc478178b004d62031cf7fe6db3f23e";

        Commit original = new Commit(treeHash, List.of(parentHash),
                "Alice", "alice@example.com",
                "Test commit message", 1234567890, 480);

        byte[] serialized = original.serializeContent();
        Commit parsed = Commit.parse(serialized);

        assertEquals(treeHash, parsed.getTreeHash());
        assertEquals(1, parsed.getParentHashes().size());
        assertEquals(parentHash, parsed.getParentHashes().get(0));
        assertEquals("Alice", parsed.getAuthorName());
        assertEquals("alice@example.com", parsed.getAuthorEmail());
        assertEquals(1234567890, parsed.getTimestamp());
        assertEquals(480, parsed.getTimezoneOffset());
        assertEquals("Test commit message", parsed.getMessage());
    }

    @Test
    void testCommitWithoutParent() throws IOException {
        String treeHash = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";

        Commit original = new Commit(treeHash, List.of(),
                "Alice", "alice@example.com",
                "Initial commit", 1234567890, 480);

        byte[] serialized = original.serializeContent();
        Commit parsed = Commit.parse(serialized);

        assertTrue(parsed.getParentHashes().isEmpty());
        assertEquals("Initial commit", parsed.getMessage());
    }

    // ========== Tag 测试 ==========

    @Test
    void testTagCreate() {
        Tag tag = new Tag(
                "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d",
                "commit", "v1.0",
                "Alice", "alice@example.com",
                "Version 1.0 release");
        assertEquals("tag", tag.getType());
        assertEquals("v1.0", tag.getTagName());
        assertEquals("commit", tag.getTargetType());
    }

    @Test
    void testTagSerializeAndParse() throws IOException {
        Tag original = new Tag(
                "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d",
                "commit", "v1.0",
                "Alice", "alice@example.com",
                "Version 1.0 release");

        byte[] serialized = original.serializeContent();
        Tag parsed = Tag.parse(serialized);

        assertEquals("v1.0", parsed.getTagName());
        assertEquals("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d", parsed.getTargetHash());
        assertEquals("commit", parsed.getTargetType());
        assertEquals("Alice", parsed.getTaggerName());
        assertEquals("Version 1.0 release", parsed.getMessage());
    }

    // ========== 对象存储测试 ==========

    @Test
    void testObjectStoreStoreAndRead(@TempDir Path tempDir) throws IOException {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir.resolve("objects"));
        ObjectStore store = new ObjectStore(mygitDir);

        Blob blob = new Blob("test content".getBytes(StandardCharsets.UTF_8));
        String hash = store.store(blob);

        // 验证文件存在
        Path objectPath = mygitDir.resolve("objects")
                .resolve(hash.substring(0, 2))
                .resolve(hash.substring(2));
        assertTrue(Files.exists(objectPath));

        // 读取并验证
        Blob readBlob = (Blob) store.read(hash);
        assertArrayEquals("test content".getBytes(StandardCharsets.UTF_8), readBlob.getData());
    }

    @Test
    void testObjectStoreExists(@TempDir Path tempDir) throws IOException {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir.resolve("objects"));
        ObjectStore store = new ObjectStore(mygitDir);

        Blob blob = new Blob("data".getBytes(StandardCharsets.UTF_8));
        String hash = store.store(blob);

        assertTrue(store.exists(hash));
        assertFalse(store.exists("0000000000000000000000000000000000000000"));
    }

    @Test
    void testObjectStoreReadNotFound(@TempDir Path tempDir) {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir.resolve("objects"));
        ObjectStore store = new ObjectStore(mygitDir);

        assertThrows(IOException.class,
                () -> store.read("0000000000000000000000000000000000000000"));
    }

    @Test
    void testObjectStoreRoundTripAllTypes(@TempDir Path tempDir) throws IOException {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir.resolve("objects"));
        ObjectStore store = new ObjectStore(mygitDir);

        // Blob
        Blob blob = new Blob("blob data".getBytes(StandardCharsets.UTF_8));
        String blobHash = store.store(blob);
        assertEquals("blob", store.read(blobHash).getType());

        // Tree
        Tree tree = new Tree();
        tree.addEntry(new Tree.TreeEntry("100644", "file.txt", blobHash));
        String treeHash = store.store(tree);
        assertEquals("tree", store.read(treeHash).getType());

        // Commit
        Commit commit = new Commit(treeHash, List.of(),
                "Alice", "alice@example.com", "Test commit");
        String commitHash = store.store(commit);
        assertEquals("commit", store.read(commitHash).getType());

        // Tag
        Tag tag = new Tag(commitHash, "commit", "v1.0",
                "Alice", "alice@example.com", "Tag message");
        String tagHash = store.store(tag);
        assertEquals("tag", store.read(tagHash).getType());
    }

    // ========== 索引测试 ==========

    @Test
    void testIndexAddAndLoad(@TempDir Path tempDir) throws IOException {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir);

        Index index = new Index(mygitDir);
        index.addEntry("100644", "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d", "test.txt");
        index.save();

        // 重新加载
        Index loaded = new Index(mygitDir);
        loaded.load();
        assertEquals(1, loaded.getEntries().size());
        assertEquals("test.txt", loaded.getEntries().get(0).getPath());
    }

    @Test
    void testIndexUpdateEntry(@TempDir Path tempDir) throws IOException {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir);

        Index index = new Index(mygitDir);
        String hash1 = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
        String hash2 = "8baef1b4abc478178b004d62031cf7fe6db3f23e";

        index.addEntry("100644", hash1, "file.txt");
        // 更新同路径文件
        index.addEntry("100755", hash2, "file.txt");

        assertEquals(1, index.getEntries().size());
        assertEquals(hash2, index.getEntries().get(0).getHash());
    }

    @Test
    void testIndexGetAndRemoveEntry(@TempDir Path tempDir) throws IOException {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir);

        Index index = new Index(mygitDir);
        index.addEntry("100644", "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d", "test.txt");

        assertNotNull(index.getEntry("test.txt"));
        assertNull(index.getEntry("nonexistent.txt"));

        index.removeEntry("test.txt");
        assertNull(index.getEntry("test.txt"));
    }

    @Test
    void testIndexClear(@TempDir Path tempDir) throws IOException {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir);

        Index index = new Index(mygitDir);
        index.addEntry("100644", "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d", "test.txt");
        index.clear();
        assertTrue(index.getEntries().isEmpty());
    }

    // ========== 仓库测试 ==========

    @Test
    void testRepositoryInit(@TempDir Path tempDir) throws IOException {
        Repository repo = new Repository(tempDir);
        assertFalse(repo.isValid());

        repo.init();
        assertTrue(repo.isValid());
        assertTrue(Files.exists(tempDir.resolve(".mygit").resolve("HEAD")));
        assertTrue(Files.exists(tempDir.resolve(".mygit").resolve("objects")));
        assertTrue(Files.exists(tempDir.resolve(".mygit").resolve("refs").resolve("heads")));
        assertTrue(Files.exists(tempDir.resolve(".mygit").resolve("refs").resolve("tags")));
    }

    @Test
    void testRepositoryHEAD(@TempDir Path tempDir) throws IOException {
        Repository repo = new Repository(tempDir);
        repo.init();

        String head = repo.getHEAD();
        assertEquals("ref: refs/heads/master", head);
        assertEquals("master", repo.getCurrentBranch());
    }

    @Test
    void testRepositoryBranch(@TempDir Path tempDir) throws IOException {
        Repository repo = new Repository(tempDir);
        repo.init();

        String commitHash = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
        repo.createBranch("feature", commitHash);
        assertEquals(commitHash, repo.getBranchRef("feature"));

        // 检查不能创建同名分支
        assertThrows(IOException.class, () -> repo.createBranch("feature", commitHash));

        // 列出分支
        var branches = repo.listBranches();
        assertEquals(2, branches.size()); // master + feature
    }

    @Test
    void testRepositoryDeleteBranch(@TempDir Path tempDir) throws IOException {
        Repository repo = new Repository(tempDir);
        repo.init();

        repo.createBranch("feature", "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
        repo.deleteBranch("feature");
        assertNull(repo.getBranchRef("feature"));
    }

    @Test
    void testRepositoryCannotDeleteCurrentBranch(@TempDir Path tempDir) throws IOException {
        Repository repo = new Repository(tempDir);
        repo.init();
        assertThrows(IOException.class, () -> repo.deleteBranch("master"));
    }

    @Test
    void testRepositoryTag(@TempDir Path tempDir) throws IOException {
        Repository repo = new Repository(tempDir);
        repo.init();

        String commitHash = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";
        repo.createLightweightTag("v1.0", commitHash);
        assertEquals(commitHash, repo.getTagRef("v1.0"));

        // 检查不能创建同名标签
        assertThrows(IOException.class, () -> repo.createLightweightTag("v1.0", commitHash));

        // 列出标签
        var tags = repo.listTags();
        assertEquals(1, tags.size());
        assertEquals("v1.0", tags.get(0));
    }

    // ========== GitObject.parse 集成测试 ==========

    @Test
    void testGitObjectParseBlob() throws IOException {
        String content = "blob 4\0test";
        Blob blob = (Blob) GitObject.parse(content.getBytes(StandardCharsets.US_ASCII));
        assertArrayEquals("test".getBytes(StandardCharsets.UTF_8), blob.getData());
    }

    @Test
    void testGitObjectParseUnknownType() {
        String content = "unknown 0\0";
        assertThrows(IOException.class,
                () -> GitObject.parse(content.getBytes(StandardCharsets.US_ASCII)));
    }

    @Test
    void testGitObjectParseInvalidFormat() {
        byte[] data = "no null byte".getBytes(StandardCharsets.UTF_8);
        assertThrows(IOException.class, () -> GitObject.parse(data));
    }

    // ========== Index.buildTree 集成测试 ==========

    @Test
    void testIndexBuildTree(@TempDir Path tempDir) throws IOException {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir.resolve("objects"));
        ObjectStore store = new ObjectStore(mygitDir);
        Index index = new Index(mygitDir);

        // 先存储一个 Blob
        Blob blob = new Blob("content".getBytes(StandardCharsets.UTF_8));
        String blobHash = store.store(blob);

        index.addEntry("100644", blobHash, "file.txt");
        String treeHash = index.buildTree(store);

        // 验证 Tree 存在且正确
        Tree tree = (Tree) store.read(treeHash);
        assertEquals(1, tree.getEntries().size());
        assertEquals("file.txt", tree.getEntries().get(0).getName());
        assertEquals(blobHash, tree.getEntries().get(0).getHash());
    }

    @Test
    void testIndexBuildTreeWithSubdirectory(@TempDir Path tempDir) throws IOException {
        Path mygitDir = tempDir.resolve(".mygit");
        Files.createDirectories(mygitDir.resolve("objects"));
        ObjectStore store = new ObjectStore(mygitDir);
        Index index = new Index(mygitDir);

        // 存储两个 Blob
        Blob blob1 = new Blob("main".getBytes(StandardCharsets.UTF_8));
        Blob blob2 = new Blob("utils".getBytes(StandardCharsets.UTF_8));
        String hash1 = store.store(blob1);
        String hash2 = store.store(blob2);

        index.addEntry("100644", hash1, "src/main/Main.java");
        index.addEntry("100644", hash2, "src/main/Utils.java");

        String treeHash = index.buildTree(store);

        // 验证根 Tree 包含 src/ 目录
        Tree root = (Tree) store.read(treeHash);
        assertEquals(1, root.getEntries().size());
        assertEquals("src", root.getEntries().get(0).getName());
        assertEquals("040000", root.getEntries().get(0).getMode());

        // 验证 src/ 包含 main/ 目录
        Tree srcTree = (Tree) store.read(root.getEntries().get(0).getHash());
        assertEquals(1, srcTree.getEntries().size());
        assertEquals("main", srcTree.getEntries().get(0).getName());

        // 验证 main/ 包含两个文件
        Tree mainTree = (Tree) store.read(srcTree.getEntries().get(0).getHash());
        assertEquals(2, mainTree.getEntries().size());
    }

    // ========== 完整工作流测试 ==========

    @Test
    void testFullWorkflow(@TempDir Path tempDir) throws IOException {
        // 模拟完整的 Git 工作流：init -> add -> commit -> log -> branch -> checkout

        // 1. 初始化仓库
        Repository repo = new Repository(tempDir);
        repo.init();
        assertTrue(repo.isValid());

        // 2. 创建工作目录文件
        Path testFile = tempDir.resolve("hello.txt");
        Files.writeString(testFile, "Hello, MyGit!", StandardCharsets.UTF_8);

        // 3. hash-object（不写入）
        Blob blob = new Blob(Files.readAllBytes(testFile));
        String hashWithoutWrite = blob.computeHash();

        // 4. hash-object（写入）
        String storedHash = repo.getObjectStore().store(blob);
        assertEquals(hashWithoutWrite, storedHash);
        assertTrue(repo.getObjectStore().exists(storedHash));

        // 5. add 文件到索引
        repo.getIndex().load();
        repo.getIndex().addEntry("100644", storedHash, "hello.txt");
        repo.getIndex().save();

        // 6. write-tree
        String treeHash = repo.getIndex().buildTree(repo.getObjectStore());
        assertNotNull(treeHash);
        assertTrue(repo.getObjectStore().exists(treeHash));

        // 7. commit
        // 清空索引（commit 会做，但这里我们手动模拟）
        repo.getIndex().clear();
        repo.getIndex().save();

        Commit commit = new Commit(treeHash, List.of(),
                "Tester", "tester@mygit.local", "First commit");
        String commitHash = repo.getObjectStore().store(commit);
        repo.setBranchRef("master", commitHash);

        // 8. 验证提交
        assertNotNull(repo.getBranchRef("master"));
        assertEquals(commitHash, repo.getBranchRef("master"));

        // 9. 创建标签
        repo.createLightweightTag("v1.0", commitHash);
        assertEquals(commitHash, repo.getTagRef("v1.0"));

        // 10. 创建分支
        repo.createBranch("feature", commitHash);
        assertEquals(commitHash, repo.getBranchRef("feature"));

        // 11. 列出分支
        var branches = repo.listBranches();
        assertEquals(2, branches.size());

        // 12. 读取并验证提交
        Commit readCommit = (Commit) repo.getObjectStore().read(commitHash);
        assertEquals(treeHash, readCommit.getTreeHash());
        assertEquals("First commit", readCommit.getMessage());

        // 13. 读取并验证 Tree
        Tree readTree = (Tree) repo.getObjectStore().read(treeHash);
        assertEquals(1, readTree.getEntries().size());
        assertEquals("hello.txt", readTree.getEntries().get(0).getName());
    }
}
