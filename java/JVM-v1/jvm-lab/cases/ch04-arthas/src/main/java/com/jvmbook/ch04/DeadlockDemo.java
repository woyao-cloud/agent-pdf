package com.jvmbook.ch04;

public class DeadlockDemo {
    private static final Object LOCK_A = new Object();
    private static final Object LOCK_B = new Object();

    public static void main(String[] args) throws Exception {
        System.out.println("Deadlock Demo started. PID: " + ProcessHandle.current().pid());
        System.out.println("Arthas: java -jar /opt/arthas-boot.jar " + ProcessHandle.current().pid());

        Thread t1 = new Thread(() -> {
            synchronized (LOCK_A) {
                sleep(100);
                synchronized (LOCK_B) { }
            }
        }, "Worker-1");

        Thread t2 = new Thread(() -> {
            synchronized (LOCK_B) {
                sleep(100);
                synchronized (LOCK_A) { }
            }
        }, "Worker-2");

        t1.start(); t2.start();
        t1.join(); t2.join();
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
