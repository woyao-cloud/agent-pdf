package com.jvmbook.ch05;

import org.openjdk.jmh.annotations.*;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@BenchmarkMode(Mode.Throughput)
@OutputTimeUnit(TimeUnit.SECONDS)
@State(Scope.Thread)
@Warmup(iterations = 3, time = 2)
@Measurement(iterations = 5, time = 3)
@Fork(1)
public class ListBenchmark {

    @Param({"1000", "10000"})
    private int size;

    private List<String> arrayList;
    private List<String> linkedList;

    @Setup
    public void setup() {
        arrayList = new ArrayList<>();
        linkedList = new LinkedList<>();
        for (int i = 0; i < size; i++) {
            String val = "item-" + i;
            arrayList.add(val);
            linkedList.add(val);
        }
    }

    @Benchmark
    public String arrayListGet() {
        return arrayList.get(size / 2);
    }

    @Benchmark
    public String linkedListGet() {
        return linkedList.get(size / 2);
    }

    @Benchmark
    public int arrayListIterate() {
        int sum = 0;
        for (String s : arrayList) { sum += s.length(); }
        return sum;
    }

    @Benchmark
    public int linkedListIterate() {
        int sum = 0;
        for (String s : linkedList) { sum += s.length(); }
        return sum;
    }

    @TearDown
    public void tearDown() {
        arrayList = null;
        linkedList = null;
    }
}
