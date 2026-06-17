package mygit.store;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Git 仓库管理器。
 * <p>
 * 负责管理 .mygit/ 目录的结构，包括：
 * <ul>
 *   <li>初始化仓库（创建 .mygit/ 目录结构）</li>
 *   <li>管理 HEAD 文件（当前分支引用）</li>
 *   <li>管理 refs/heads/（本地分支引用）</li>
 *   <li>管理 refs/tags/（标签引用）</li>
 * </ul>
 * </p>
 *
 * <p>
 * .mygit/ 目录结构：
 * <pre>
 *   .mygit/
 *     HEAD           -- 指向当前分支的引用（如 "ref: refs/heads/master"）
 *     index          -- 暂存区索引文件
 *     objects/       -- 对象存储目录
 *       XX/          -- 前 2 位哈希作为目录名
 *         YYYY...    -- 后 38 位哈希作为文件名
 *     refs/
 *       heads/       -- 本地分支
 *         master     -- master 分支的最新提交哈希
 *         feature    -- feature 分支的最新提交哈希
 *       tags/        -- 标签
 *         v1.0       -- v1.0 标签指向的提交哈希
 * </pre>
 * </p>
 */
public class Repository {

    /** .mygit 目录的路径 */
    private final Path mygitDir;

    /** 仓库根目录的路径 */
    private final Path workingDir;

    /** 对象存储 */
    private final ObjectStore objectStore;

    /** 索引 */
    private final Index index;

    /**
     * 创建一个仓库管理器。
     *
     * @param workingDir 仓库的工作目录（包含 .mygit 的目录）
     */
    public Repository(Path workingDir) {
        this.workingDir = workingDir.toAbsolutePath().normalize();
        this.mygitDir = this.workingDir.resolve(".mygit");
        this.objectStore = new ObjectStore(mygitDir);
        this.index = new Index(mygitDir);
    }

    /**
     * 获取 .mygit 目录路径。
     */
    public Path getMygitDir() {
        return mygitDir;
    }

    /**
     * 获取工作目录路径。
     */
    public Path getWorkingDir() {
        return workingDir;
    }

    /**
     * 获取对象存储。
     */
    public ObjectStore getObjectStore() {
        return objectStore;
    }

    /**
     * 获取索引。
     */
    public Index getIndex() {
        return index;
    }

    // ========== 仓库初始化 ==========

    /**
     * 初始化一个新的 Git 仓库。
     * 创建 .mygit/ 目录结构，包括 objects/、refs/heads/、refs/tags/，
     * 以及默认的 HEAD 文件。
     *
     * @throws IOException 如果初始化失败
     */
    public void init() throws IOException {
        // 创建目录结构
        Files.createDirectories(mygitDir.resolve("objects"));
        Files.createDirectories(mygitDir.resolve("refs").resolve("heads"));
        Files.createDirectories(mygitDir.resolve("refs").resolve("tags"));

        // 创建默认 HEAD，指向 master 分支
        Path headFile = mygitDir.resolve("HEAD");
        if (!Files.exists(headFile)) {
            setHEAD("ref: refs/heads/master");
        }

        // 创建空的 index 文件
        Path indexFile = mygitDir.resolve("index");
        if (!Files.exists(indexFile)) {
            Files.writeString(indexFile, "", StandardCharsets.UTF_8);
        }
    }

    /**
     * 检查当前目录是否是一个已经初始化好的仓库。
     *
     * @return 如果是有效的仓库则返回 true
     */
    public boolean isValid() {
        return Files.isDirectory(mygitDir)
                && Files.isDirectory(mygitDir.resolve("objects"))
                && Files.isDirectory(mygitDir.resolve("refs").resolve("heads"))
                && Files.isDirectory(mygitDir.resolve("refs").resolve("tags"))
                && Files.exists(mygitDir.resolve("HEAD"));
    }

    // ========== HEAD 管理 ==========

    /**
     * 读取 HEAD 文件的内容。
     * HEAD 文件可能包含：
     * <ul>
     *   <li>"ref: refs/heads/master" —— 表示处于某个分支上</li>
     *   <li>"a1b2c3d4..." —— 表示处于分离头指针状态</li>
     * </ul>
     *
     * @return HEAD 文件的内容（去除换行）
     * @throws IOException 如果读取失败
     */
    public String getHEAD() throws IOException {
        if (!Files.exists(mygitDir.resolve("HEAD"))) {
            return null;
        }
        return Files.readString(mygitDir.resolve("HEAD"), StandardCharsets.UTF_8).trim();
    }

    /**
     * 写入 HEAD 文件。
     *
     * @param content HEAD 内容（如 "ref: refs/heads/master" 或一个哈希值）
     * @throws IOException 如果写入失败
     */
    public void setHEAD(String content) throws IOException {
        Files.writeString(mygitDir.resolve("HEAD"), content + "\n", StandardCharsets.UTF_8);
    }

    /**
     * 获取当前分支名。
     * 如果 HEAD 指向分支，返回分支名（如 "master"）。
     * 如果处于分离头指针状态，返回 null。
     *
     * @return 当前分支名，或 null
     * @throws IOException 如果读取失败
     */
    public String getCurrentBranch() throws IOException {
        String head = getHEAD();
        if (head == null) {
            return null;
        }
        if (head.startsWith("ref: refs/heads/")) {
            return head.substring("ref: refs/heads/".length());
        }
        // 分离头指针状态
        return null;
    }

    // ========== 分支管理 ==========

    /**
     * 获取分支引用文件的路径。
     *
     * @param branchName 分支名
     * @return 分支引用文件的路径
     */
    private Path getBranchPath(String branchName) {
        return mygitDir.resolve("refs").resolve("heads").resolve(branchName);
    }

    /**
     * 获取指定分支的最新提交哈希。
     *
     * @param branchName 分支名
     * @return 提交的 SHA-1 哈希，如果分支不存在则返回 null
     * @throws IOException 如果读取失败
     */
    public String getBranchRef(String branchName) throws IOException {
        Path branchPath = getBranchPath(branchName);
        if (!Files.exists(branchPath)) {
            return null;
        }
        return Files.readString(branchPath, StandardCharsets.UTF_8).trim();
    }

    /**
     * 更新分支引用，指向指定的提交。
     *
     * @param branchName 分支名
     * @param commitHash 提交的 SHA-1 哈希
     * @throws IOException 如果写入失败
     */
    public void setBranchRef(String branchName, String commitHash) throws IOException {
        Files.writeString(getBranchPath(branchName), commitHash + "\n", StandardCharsets.UTF_8);
    }

    /**
     * 创建新分支。
     *
     * @param branchName 新分支名
     * @param commitHash 分支指向的提交哈希
     * @throws IOException 如果创建失败
     */
    public void createBranch(String branchName, String commitHash) throws IOException {
        Path branchPath = getBranchPath(branchName);
        if (Files.exists(branchPath)) {
            throw new IOException("Branch already exists: " + branchName);
        }
        setBranchRef(branchName, commitHash);
    }

    /**
     * 删除分支。
     *
     * @param branchName 分支名
     * @throws IOException 如果删除失败
     */
    public void deleteBranch(String branchName) throws IOException {
        Path branchPath = getBranchPath(branchName);
        if (!Files.exists(branchPath)) {
            throw new IOException("Branch not found: " + branchName);
        }
        // 检查是否正在删除当前分支
        String currentBranch = getCurrentBranch();
        if (branchName.equals(currentBranch)) {
            throw new IOException("Cannot delete branch '" + branchName
                    + "' checked out at '" + workingDir + "'");
        }
        Files.delete(branchPath);
    }

    /**
     * 列出所有分支。
     *
     * @return 分支名列表
     * @throws IOException 如果列出失败
     */
    public List<String> listBranches() throws IOException {
        Path headsDir = mygitDir.resolve("refs").resolve("heads");
        try (var stream = Files.list(headsDir)) {
            return stream
                    .filter(Files::isRegularFile)
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .toList();
        }
    }

    // ========== 标签管理 ==========

    /**
     * 获取标签引用文件的路径。
     *
     * @param tagName 标签名
     * @return 标签引用文件的路径
     */
    private Path getTagPath(String tagName) {
        return mygitDir.resolve("refs").resolve("tags").resolve(tagName);
    }

    /**
     * 创建轻量标签（直接指向一个提交）。
     *
     * @param tagName    标签名
     * @param commitHash 提交的 SHA-1 哈希
     * @throws IOException 如果创建失败
     */
    public void createLightweightTag(String tagName, String commitHash) throws IOException {
        Path tagPath = getTagPath(tagName);
        if (Files.exists(tagPath)) {
            throw new IOException("Tag already exists: " + tagName);
        }
        Files.writeString(tagPath, commitHash + "\n", StandardCharsets.UTF_8);
    }

    /**
     * 获取标签指向的提交哈希。
     *
     * @param tagName 标签名
     * @return 提交的 SHA-1 哈希，如果标签不存在则返回 null
     * @throws IOException 如果读取失败
     */
    public String getTagRef(String tagName) throws IOException {
        Path tagPath = getTagPath(tagName);
        if (!Files.exists(tagPath)) {
            return null;
        }
        return Files.readString(tagPath, StandardCharsets.UTF_8).trim();
    }

    /**
     * 删除标签。
     *
     * @param tagName 标签名
     * @throws IOException 如果删除失败
     */
    public void deleteTag(String tagName) throws IOException {
        Path tagPath = getTagPath(tagName);
        if (!Files.exists(tagPath)) {
            throw new IOException("Tag not found: " + tagName);
        }
        Files.delete(tagPath);
    }

    /**
     * 列出所有标签。
     *
     * @return 标签名列表
     * @throws IOException 如果列出失败
     */
    public List<String> listTags() throws IOException {
        Path tagsDir = mygitDir.resolve("refs").resolve("tags");
        try (var stream = Files.list(tagsDir)) {
            return stream
                    .filter(Files::isRegularFile)
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .toList();
        }
    }
}
