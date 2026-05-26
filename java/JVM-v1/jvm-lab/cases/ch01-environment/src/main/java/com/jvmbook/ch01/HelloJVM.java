package com.jvmbook.ch01;

public class HelloJVM {
    public static void main(String[] args) {
        var rt = Runtime.getRuntime();
        System.out.println("=== JVM Environment ===");
        System.out.println("Java Version: " + System.getProperty("java.version"));
        System.out.println("JVM Name: " + System.getProperty("java.vm.name"));
        System.out.println("JVM Vendor: " + System.getProperty("java.vm.vendor"));
        System.out.println("Max Memory: " + (rt.maxMemory() / 1024 / 1024) + " MB");
        System.out.println("Total Memory: " + (rt.totalMemory() / 1024 / 1024) + " MB");
        System.out.println("Free Memory: " + (rt.freeMemory() / 1024 / 1024) + " MB");
        System.out.println("Available Processors: " + rt.availableProcessors());
        System.out.println("=== JCMD Check ===");
        System.out.println("Run: jcmd " + ProcessHandle.current().pid() + " VM.version");
    }
}
