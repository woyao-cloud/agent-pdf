package com.jvmbook.ch08;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * G1 GC 日志分析器。
 *
 * 读取 G1 GC 日志文件，解析 GC 停顿时间，
 * 统计总停顿次数、总时间、平均时间和最大停顿时间。
 *
 * 用法：java com.jvmbook.ch08.GcLogAnalyzer [gc-log-path]
 *       默认路径：/workspace/cases/ch08-gc/gc.log
 */
public class GcLogAnalyzer {

    // 匹配 G1 GC pause 行，捕获停顿时间（毫秒）
    // 示例匹配行：[GC pause (G1 Evacuation Pause) 0.008s, 0.008ms]
    // 示例匹配行：[GC pause (G1 Humongous Allocation) 0.012s, 0.012ms]
    private static final Pattern GC_PAUSE_PATTERN =
            Pattern.compile("\\[GC pause \\(.*?\\) .*?([0-9.]+)ms");

    private final String logPath;
    private final List<Double> pauseTimes = new ArrayList<>();

    public GcLogAnalyzer(String logPath) {
        this.logPath = logPath;
    }

    public static void main(String[] args) {
        String logPath = args.length > 0 ? args[0] : "/workspace/cases/ch08-gc/gc.log";
        GcLogAnalyzer analyzer = new GcLogAnalyzer(logPath);
        try {
            analyzer.parse();
            analyzer.printReport();
        } catch (IOException e) {
            System.err.println("Error reading GC log: " + e.getMessage());
            System.exit(1);
        }
    }

    /**
     * 解析 GC 日志文件，提取所有 GC pause 事件的停顿时间。
     */
    public void parse() throws IOException {
        try (BufferedReader reader = new BufferedReader(new FileReader(logPath))) {
            String line;
            while ((line = reader.readLine()) != null) {
                Matcher matcher = GC_PAUSE_PATTERN.matcher(line);
                while (matcher.find()) {
                    double pauseMs = Double.parseDouble(matcher.group(1));
                    pauseTimes.add(pauseMs);
                }
            }
        }
    }

    /**
     * 打印 GC 停顿统计报告。
     */
    public void printReport() {
        if (pauseTimes.isEmpty()) {
            System.out.println("No GC pause events found in log: " + logPath);
            return;
        }

        double total = 0;
        double max = 0.0;
        for (double pt : pauseTimes) {
            total += pt;
            if (pt > max) {
                max = pt;
            }
        }
        double avg = total / pauseTimes.size();

        System.out.println("=== GC Log Analysis Report ===");
        System.out.println("Log file: " + logPath);
        System.out.println("Total GC pauses: " + pauseTimes.size());
        System.out.printf("Total pause time: %.2f ms%n", total);
        System.out.printf("Average pause time: %.2f ms%n", avg);
        System.out.printf("Max pause time: %.2f ms%n", max);
        System.out.println("================================");
    }

    /**
     * 返回解析到的所有停顿时间列表（用于程序化处理）。
     */
    public List<Double> getPauseTimes() {
        return new ArrayList<>(pauseTimes);
    }
}
