package com.jvmbook.ch03;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class CpuHotspotDemo {
    private static final Random RANDOM = new Random();
    private static final List<Double> DATA = new ArrayList<>();

    public static void main(String[] args) throws Exception {
        System.out.println("CPU Hotspot Demo started. PID: " + ProcessHandle.current().pid());
        while (true) {
            double result = expensiveCalculation();
            DATA.add(result);
            if (DATA.size() > 100_000) {
                DATA.clear();
            }
            Thread.sleep(10);
        }
    }

    private static double expensiveCalculation() {
        double sum = 0;
        for (int i = 0; i < 1000; i++) {
            sum += heavyTrigOperation(i);
            sum += matrixMultiplication(i);
        }
        return sum;
    }

    private static double heavyTrigOperation(int seed) {
        double result = 0;
        for (int i = 0; i < 500; i++) {
            result += Math.sin(seed * i * 0.001) * Math.cos(seed * i * 0.002);
            result += Math.tan(seed * i * 0.003) * Math.sqrt(Math.abs(seed * i * 0.004));
        }
        return result;
    }

    private static double matrixMultiplication(int seed) {
        int size = 50;
        double[][] a = new double[size][size];
        double[][] b = new double[size][size];
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                a[i][j] = RANDOM.nextDouble();
                b[i][j] = RANDOM.nextDouble();
            }
        }
        double result = 0;
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                for (int k = 0; k < size; k++) {
                    result += a[i][k] * b[k][j];
                }
            }
        }
        return result;
    }
}
