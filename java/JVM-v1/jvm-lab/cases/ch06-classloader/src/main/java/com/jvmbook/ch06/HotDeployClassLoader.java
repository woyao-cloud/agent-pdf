package com.jvmbook.ch06;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class HotDeployClassLoader extends ClassLoader {
    private final Path classesDir;

    public HotDeployClassLoader(Path classesDir, ClassLoader parent) {
        super(parent);
        this.classesDir = classesDir;
    }

    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
        String fileName = name.replace('.', '/') + ".class";
        Path classFile = classesDir.resolve(fileName);
        if (Files.exists(classFile)) {
            try {
                byte[] bytes = Files.readAllBytes(classFile);
                return defineClass(name, bytes, 0, bytes.length);
            } catch (IOException e) {
                throw new ClassNotFoundException(name, e);
            }
        }
        throw new ClassNotFoundException(name);
    }

    public static void main(String[] args) throws Exception {
        Path tmpDir = Paths.get("target/hotdeploy");
        Files.createDirectories(tmpDir);
        System.out.println("HotDeploy demo started. PID: " + ProcessHandle.current().pid());

        HotDeployClassLoader loader = new HotDeployClassLoader(tmpDir, ClassLoader.getSystemClassLoader());
        Class<?> clazz = loader.loadClass("com.jvmbook.ch06.HotDeployWorker");
        Object instance = clazz.getDeclaredConstructor().newInstance();
        Method executeMethod = clazz.getMethod("execute");
        System.out.println("Initial: " + executeMethod.invoke(instance));

        loader = new HotDeployClassLoader(tmpDir, ClassLoader.getSystemClassLoader());
        clazz = loader.loadClass("com.jvmbook.ch06.HotDeployWorker");
        instance = clazz.getDeclaredConstructor().newInstance();
        executeMethod = clazz.getMethod("execute");
        System.out.println("After reload: " + executeMethod.invoke(instance));
    }
}
