package com.graphdb.demo.storage;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

public class WALDemo {

    public enum OperationType {
        ADD_NODE,
        ADD_EDGE,
        DELETE_NODE,
        DELETE_EDGE
    }

    public static class LogRecord {
        private final long sequence;
        private final OperationType opType;
        private final long timestamp;
        private final String data;

        public LogRecord(long sequence, OperationType opType, long timestamp, String data) {
            this.sequence = sequence;
            this.opType = opType;
            this.timestamp = timestamp;
            this.data = data;
        }

        public long getSequence() { return sequence; }
        public OperationType getOpType() { return opType; }
        public long getTimestamp() { return timestamp; }
        public String getData() { return data; }

        public String serialize() {
            return sequence + "|" + opType.name() + "|" + timestamp + "|" + data;
        }

        public static LogRecord deserialize(String line) {
            int p1 = line.indexOf('|');
            int p2 = line.indexOf('|', p1 + 1);
            int p3 = line.indexOf('|', p2 + 1);
            long seq = Long.parseLong(line.substring(0, p1));
            OperationType op = OperationType.valueOf(line.substring(p1 + 1, p2));
            long ts = Long.parseLong(line.substring(p2 + 1, p3));
            String data = line.substring(p3 + 1);
            return new LogRecord(seq, op, ts, data);
        }

        @Override
        public String toString() {
            return "LogRecord{seq=" + sequence + ", op=" + opType + ", ts=" + timestamp + ", data='" + data + "'}";
        }
    }

    public static class WriteAheadLog {
        private final Path walPath;
        private final Path checkpointPath;
        private RandomAccessFile walFile;
        private long currentSequence = 0;
        private long lastCheckpointSeq = 0;

        public WriteAheadLog(String walDir) throws IOException {
            Path dir = Paths.get(walDir);
            Files.createDirectories(dir);
            this.walPath = dir.resolve("wal.log");
            this.checkpointPath = dir.resolve("checkpoint.dat");
            openWalFile();
        }

        private void openWalFile() throws IOException {
            walFile = new RandomAccessFile(walPath.toFile(), "rw");
            walFile.seek(walFile.length());
        }

        public synchronized long append(OperationType opType, String data) throws IOException {
            currentSequence++;
            LogRecord record = new LogRecord(currentSequence, opType, System.currentTimeMillis(), data);
            String line = record.serialize() + "\n";
            walFile.write(line.getBytes(StandardCharsets.UTF_8));
            walFile.getFD().sync();
            return currentSequence;
        }

        public synchronized void checkpoint(AdjacencyListStore.GraphStore graph) throws IOException {
            System.out.println("  [WAL] 开始创建检查点...");
            Path tmpPath = checkpointPath.resolveSibling("checkpoint.tmp");
            try (BufferedWriter writer = Files.newBufferedWriter(tmpPath, StandardCharsets.UTF_8)) {
                writer.write("CHECKPOINT_SEQ=" + currentSequence);
                writer.newLine();
                writer.write("NODE_COUNT=" + graph.getNodeCount());
                writer.newLine();
                for (AdjacencyListStore.Node node : graph.getAllNodes()) {
                    StringBuilder sb = new StringBuilder();
                    sb.append("NODE|").append(node.getId());
                    for (Map.Entry<String, Object> p : node.getProperties().entrySet()) {
                        sb.append("|").append(p.getKey()).append("=").append(p.getValue());
                    }
                    writer.write(sb.toString());
                    writer.newLine();
                }
                for (AdjacencyListStore.Edge edge : graph.getAllEdges()) {
                    StringBuilder sb = new StringBuilder();
                    sb.append("EDGE|").append(edge.getId())
                            .append("|").append(edge.getSourceId())
                            .append("|").append(edge.getTargetId())
                            .append("|").append(edge.getType());
                    for (Map.Entry<String, Object> p : edge.getProperties().entrySet()) {
                        sb.append("|").append(p.getKey()).append("=").append(p.getValue());
                    }
                    writer.write(sb.toString());
                    writer.newLine();
                }
            }
            Files.move(tmpPath, checkpointPath, StandardCopyOption.REPLACE_EXISTING);
            lastCheckpointSeq = currentSequence;
            System.out.println("  [WAL] 检查点完成, 已记录到序列号 " + currentSequence);
        }

        public synchronized long recover(AdjacencyListStore.GraphStore graph) throws IOException {
            System.out.println("  [WAL] 开始恢复...");
            long checkpointSeq = loadCheckpoint(graph);
            System.out.println("  [WAL] 检查点恢复至序列号 " + checkpointSeq);

            long count = 0;
            try (BufferedReader reader = Files.newBufferedReader(walPath, StandardCharsets.UTF_8)) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) continue;
                    LogRecord record = LogRecord.deserialize(line);
                    if (record.getSequence() <= checkpointSeq) continue;
                    replayRecord(record, graph);
                    count++;
                    currentSequence = record.getSequence();
                }
            }
            System.out.println("  [WAL] 重放 " + count + " 条日志记录");
            System.out.println("  [WAL] 恢复完成, 当前图状态: " + graph.getNodeCount() + " 节点, " + graph.getEdgeCount() + " 边");
            return count;
        }

        private long loadCheckpoint(AdjacencyListStore.GraphStore graph) throws IOException {
            if (!Files.exists(checkpointPath)) {
                System.out.println("  [WAL] 未找到检查点文件, 从空状态开始");
                return 0;
            }
            long checkpointSeq = 0;
            try (BufferedReader reader = Files.newBufferedReader(checkpointPath, StandardCharsets.UTF_8)) {
                String line = reader.readLine();
                if (line != null && line.startsWith("CHECKPOINT_SEQ=")) {
                    checkpointSeq = Long.parseLong(line.substring("CHECKPOINT_SEQ=".length()));
                }
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("NODE_COUNT=")) continue;
                    if (line.startsWith("NODE|")) {
                        String[] parts = line.split("\\|");
                        long nodeId = Long.parseLong(parts[1]);
                        Map<String, Object> props = new HashMap<>();
                        for (int i = 2; i < parts.length; i++) {
                            String[] kv = parts[i].split("=", 2);
                            if (kv.length == 2) props.put(kv[0], kv[1]);
                        }
                        graph.addNodeWithId(nodeId, props);
                    } else if (line.startsWith("EDGE|")) {
                        String[] parts = line.split("\\|");
                        long edgeId = Long.parseLong(parts[1]);
                        long src = Long.parseLong(parts[2]);
                        long tgt = Long.parseLong(parts[3]);
                        String type = parts[4];
                        Map<String, Object> props = new HashMap<>();
                        for (int i = 5; i < parts.length; i++) {
                            String[] kv = parts[i].split("=", 2);
                            if (kv.length == 2) props.put(kv[0], kv[1]);
                        }
                        graph.addEdge(src, tgt, type, props);
                    }
                }
            }
            return checkpointSeq;
        }

        private void replayRecord(LogRecord record, AdjacencyListStore.GraphStore graph) {
            switch (record.getOpType()) {
                case ADD_NODE -> {
                    Map<String, Object> props = parseDataToMap(record.getData());
                    Object idObj = props.remove("id");
                    if (idObj != null) {
                        long nodeId = Long.parseLong(idObj.toString());
                        graph.addNodeWithId(nodeId, props);
                    } else {
                        graph.addNode(props);
                    }
                }
                case ADD_EDGE -> {
                    String[] parts = record.getData().split(",");
                    long src = Long.parseLong(parts[0]);
                    long tgt = Long.parseLong(parts[1]);
                    String type = parts[2];
                    Map<String, Object> props = new HashMap<>();
                    for (int i = 3; i < parts.length; i++) {
                        String[] kv = parts[i].split("=", 2);
                        if (kv.length == 2) props.put(kv[0], kv[1]);
                    }
                    graph.addEdge(src, tgt, type, props);
                }
                default -> System.out.println("  [WAL] 跳过不支持的操作: " + record.getOpType());
            }
        }

        private Map<String, Object> parseDataToMap(String data) {
            Map<String, Object> map = new HashMap<>();
            String[] pairs = data.split(",");
            for (String pair : pairs) {
                String[] kv = pair.split("=", 2);
                if (kv.length == 2) map.put(kv[0], kv[1]);
            }
            return map;
        }

        public synchronized void close() throws IOException {
            if (walFile != null) {
                walFile.close();
                walFile = null;
            }
        }

        public long getCurrentSequence() { return currentSequence; }
    }

    public static void main(String[] args) throws Exception {
        System.out.println("========== WAL (预写日志) 存储引擎演示 ==========");
        System.out.println();

        String walDir = "target/wal-demo";
        Path dirPath = Paths.get(walDir);
        if (Files.exists(dirPath)) {
            try (var stream = Files.walk(dirPath)) {
                stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                });
            }
        }

        System.out.println("--- 阶段1: 正常写入数据 ---");
        WriteAheadLog wal = new WriteAheadLog(walDir);
        AdjacencyListStore.GraphStore graph = new AdjacencyListStore.GraphStore();

        long seq1 = wal.append(OperationType.ADD_NODE, "id=1,name=Alice,age=30,city=北京");
        System.out.println("  写入: ADD_NODE seq=" + seq1);
        long seq2 = wal.append(OperationType.ADD_NODE, "id=2,name=Bob,age=25,city=上海");
        System.out.println("  写入: ADD_NODE seq=" + seq2);
        long seq3 = wal.append(OperationType.ADD_NODE, "id=3,name=Carol,age=35,city=深圳");
        System.out.println("  写入: ADD_NODE seq=" + seq3);

        long seq4 = wal.append(OperationType.ADD_EDGE, "1,2,FOLLOWS,since=2023-01");
        System.out.println("  写入: ADD_EDGE seq=" + seq4);
        long seq5 = wal.append(OperationType.ADD_EDGE, "1,3,FOLLOWS,since=2023-03");
        System.out.println("  写入: ADD_EDGE seq=" + seq5);

        System.out.println("  当前 WAL 序列号: " + wal.getCurrentSequence());
        System.out.println();

        System.out.println("--- 阶段2: 将 WAL 数据应用到内存图 ---");
        wal.recover(graph);
        System.out.println();

        System.out.println("--- 阶段3: 创建检查点 (快照) ---");
        wal.checkpoint(graph);
        System.out.println();

        System.out.println("--- 阶段4: 检查点后继续写入 ---");
        long seq6 = wal.append(OperationType.ADD_NODE, "name=Dave,age=28,city=北京");
        System.out.println("  写入: ADD_NODE seq=" + seq6);
        long seq7 = wal.append(OperationType.ADD_EDGE, "2,4,FOLLOWS,since=2024-06");
        System.out.println("  写入: ADD_EDGE seq=" + seq7);
        long seq8 = wal.append(OperationType.ADD_EDGE, "3,1,FOLLOWS,since=2024-01");
        System.out.println("  写入: ADD_EDGE seq=" + seq8);
        System.out.println("  当前 WAL 序列号: " + wal.getCurrentSequence());
        System.out.println();

        wal.close();

        System.out.println("--- 阶段4: 模拟崩溃 ---");
        System.out.println("  [模拟] 系统崩溃, 内存数据丢失...");
        System.out.println("  [模拟] WAL 文件保留: " + walDir + "/wal.log");
        System.out.println("  [模拟] 检查点文件保留: " + walDir + "/checkpoint.dat");
        System.out.println();

        System.out.println("--- 阶段5: 重启并从 WAL 恢复 ---");
        WriteAheadLog wal2 = new WriteAheadLog(walDir);
        AdjacencyListStore.GraphStore recoveredGraph = new AdjacencyListStore.GraphStore();

        long replayed = wal2.recover(recoveredGraph);
        System.out.println();

        System.out.println("--- 恢复后的图状态 ---");
        System.out.println("  节点数: " + recoveredGraph.getNodeCount());
        System.out.println("  边数: " + recoveredGraph.getEdgeCount());
        System.out.println();
        for (AdjacencyListStore.Node node : recoveredGraph.getAllNodes()) {
            System.out.println("  " + node);
        }
        for (AdjacencyListStore.Edge edge : recoveredGraph.getAllEdges()) {
            System.out.println("  " + edge);
        }
        System.out.println();

        System.out.println("--- WAL 机制说明 ---");
        System.out.println("  1. 每次写操作先追加到 WAL 文件 (append-only)");
        System.out.println("  2. 调用 file sync 确保日志落盘");
        System.out.println("  3. 定期创建检查点 (快照), 记录当前完整状态");
        System.out.println("  4. 崩溃恢复: 加载检查点 + 重放检查点后的 WAL 记录");
        System.out.println("  5. 检查点之前的 WAL 记录可安全删除 (GC)");
        System.out.println();

        wal2.close();

        System.out.println("========== WAL 演示结束 ==========");
    }
}
