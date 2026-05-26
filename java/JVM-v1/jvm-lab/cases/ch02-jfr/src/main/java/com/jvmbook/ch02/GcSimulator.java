package com.jvmbook.ch02;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class GcSimulator {
    private static final List<byte[]> CACHE = new ArrayList<>();
    private static final Random RANDOM = new Random();

    public static void main(String[] args) throws Exception {
        System.out.println("GC Simulator started. PID: " + ProcessHandle.current().pid());
        int cycle = 0;
        while (true) {
            for (int i = 0; i < 10; i++) {
                byte[] chunk = new byte[1024 * 1024];
                RANDOM.nextBytes(chunk);
                if (i % 3 == 0) {
                    CACHE.add(chunk);
                }
            }
            if (++cycle % 5 == 0) {
                int retain = CACHE.size() / 2;
                CACHE.subList(0, retain).clear();
            }
            if (cycle % 10 == 0) {
                System.gc();
            }
            Thread.sleep(500);
        }
    }
}
