package com.jvmbook.ch06;

import java.lang.reflect.Method;

public class NoSuchMethodDemo {
    public static void main(String[] args) throws Exception {
        System.out.println("=== NoSuchMethodError Simulation ===");
        System.out.println("PID: " + ProcessHandle.current().pid());

        ClassLoader parent = NoSuchMethodDemo.class.getClassLoader();
        ClassLoader child = new java.net.URLClassLoader(
            new java.net.URL[]{((java.net.URLClassLoader)parent).getURLs()[0]},
            parent
        );

        Class<?> clazz1 = Class.forName("com.jvmbook.ch06.DemoService");
        Class<?> clazz2 = Class.forName("com.jvmbook.ch06.DemoService", true, child);

        System.out.println("Class 1 loader: " + clazz1.getClassLoader());
        System.out.println("Class 2 loader: " + clazz2.getClassLoader());

        for (Method m : clazz1.getMethods()) {
            if (m.getName().startsWith("process")) System.out.println("Class 1 has: " + m);
        }
        for (Method m : clazz2.getMethods()) {
            if (m.getName().startsWith("process")) System.out.println("Class 2 has: " + m);
        }
    }
}
