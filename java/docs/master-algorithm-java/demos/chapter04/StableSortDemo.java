package masteralgo.chapter04;

import java.util.*;

/**
 * 排序稳定性演示
 *
 * 通过"先按成绩排序、再按姓名排序"的多关键字排序场景，
 * 对比稳定排序和不稳定排序对结果的影响。
 *
 * Student 类包含 name（姓名）和 grade（成绩）两个字段。
 * 多关键字排序的正确做法是：
 *   1. 先按次要关键字排序（姓名）
 *   2. 再按主要关键字排序（成绩），且第二步必须使用稳定排序
 *
 * 或者一步到位使用 Comparator 链式比较。
 */
public class StableSortDemo {

    /**
     * 学生类
     */
    static class Student {
        String name;
        int grade; // 成绩

        Student(String name, int grade) {
            this.name = name;
            this.grade = grade;
        }

        @Override
        public String toString() {
            return String.format("%s(%d)", name, grade);
        }
    }

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  排序稳定性演示 —— 多关键字排序");
        System.out.println("================================================");

        // ----------------------------------------------------------
        // 准备测试数据
        // ----------------------------------------------------------
        // 所有学生，按名称字母顺序排列（Alice < Bob < Charlie < David）
        List<Student> students = new ArrayList<>(Arrays.asList(
                new Student("Alice",   85),
                new Student("Bob",     92),
                new Student("Charlie", 85),
                new Student("David",   92),
                new Student("Eve",     78),
                new Student("Frank",   85)
        ));

        System.out.println("\n原始数据（按名称排序）：");
        students.forEach(s -> System.out.println("  " + s));

        System.out.println("\n目标：先按成绩升序，成绩相同按姓名升序");
        System.out.println("预期结果：Eve(78), Alice(85), Charlie(85), Frank(85), Bob(92), David(92)");
        System.out.println("  注意：成绩 85 的三个人应保持原始顺序 Alice → Charlie → Frank");
        System.out.println("        成绩 92 的两个人应保持原始顺序 Bob → David\n");

        // ----------------------------------------------------------
        // 方法一：稳定的两步排序（正确做法）
        // 第一步：按姓名排序（次要关键字）
        // 第二步：按成绩排序（主要关键字），使用稳定排序
        // ----------------------------------------------------------
        System.out.println("----- 方法一：稳定排序（正确）-----");

        List<Student> list1 = new ArrayList<>(students);

        // 第一步：按姓名排序
        list1.sort(Comparator.comparing(s -> s.name));
        System.out.println("  按姓名排序后：");
        list1.forEach(s -> System.out.println("    " + s));

        // 第二步：按成绩排序（使用稳定排序）
        list1.sort(Comparator.comparingInt(s -> s.grade));
        System.out.println("  再按成绩稳定排序后：");
        list1.forEach(s -> System.out.println("    " + s));

        boolean correct1 = checkOrder(list1);
        System.out.println("  结果" + (correct1 ? "✔ 正确" : "✘ 错误"));
        System.out.println();

        // ----------------------------------------------------------
        // 方法二：不稳定的两步排序（错误方式）
        // 用不稳定排序来做第二步，破坏了第一步的排序结果
        // ----------------------------------------------------------
        System.out.println("----- 方法二：不稳定排序（错误）-----");

        List<Student> list2 = new ArrayList<>(students);

        // 第一步：按姓名排序
        list2.sort(Comparator.comparing(s -> s.name));
        System.out.println("  按姓名排序后：");
        list2.forEach(s -> System.out.println("    " + s));

        // 第二步：按成绩排序（使用不稳定排序 —— 模拟不稳定行为）
        unstableSortByGrade(list2);
        System.out.println("  再按成绩不稳定排序后：");
        list2.forEach(s -> System.out.println("    " + s));

        boolean correct2 = checkOrder(list2);
        System.out.println("  结果" + (correct2 ? "✔ 正确" : "✘ 错误 —— 相同成绩的元素顺序被破坏！"));
        System.out.println();

        // ----------------------------------------------------------
        // 方法三：一步到位（最佳实践）
        // 使用 Comparator 链式比较，同时按成绩和姓名排序
        // 一次排序就能得到正确结果
        // ----------------------------------------------------------
        System.out.println("----- 方法三：Comparator 链式比较（最佳实践）-----");

        List<Student> list3 = new ArrayList<>(students);
        list3.sort(Comparator.comparingInt((Student s) -> s.grade)
                .thenComparing(s -> s.name));
        System.out.println("  一步排序结果：");
        list3.forEach(s -> System.out.println("    " + s));

        boolean correct3 = checkOrder(list3);
        System.out.println("  结果" + (correct3 ? "✔ 正确" : "✘ 错误"));
        System.out.println();

        // ----------------------------------------------------------
        // 方法四：JDK TimSort 演示 —— 本身就是稳定的
        // ----------------------------------------------------------
        System.out.println("----- 方法四：JDK TimSort 的稳定性验证 -----");

        List<Student> list4 = new ArrayList<>(students);
        // 先按姓名排序
        list4.sort(Comparator.comparing(s -> s.name));
        // Collections.sort() 底层也是 TimSort，稳定
        Collections.sort(list4, Comparator.comparingInt((Student s) -> s.grade));
        System.out.println("  Collections.sort() 的结果：");
        list4.forEach(s -> System.out.println("    " + s));

        boolean correct4 = checkOrder(list4);
        System.out.println("  结果" + (correct4 ? "✔ 正确" : "✘ 错误"));
        System.out.println("  (TimSort 是稳定排序，多关键字排序安全可靠)");

        // ----------------------------------------------------------
        // 总结
        // ----------------------------------------------------------
        System.out.println("\n================================================");
        System.out.println("  结论");
        System.out.println("================================================");
        System.out.println("- 多关键字排序必须使用稳定排序");
        System.out.println("- 或者用 Comparator.thenComparing() 一步完成");
        System.out.println("- TimSort（JDK 引用类型排序）是稳定的");
        System.out.println("- Dual-Pivot QuickSort（JDK 基本类型排序）是不稳定的");
        System.out.println("- 快速排序、堆排序、选择排序、希尔排序都是不稳定的");
        System.out.println("- 冒泡排序、插入排序、归并排序、计数排序、基数排序是稳定的");
    }

    /**
     * 使用不稳定排序按成绩排序（模拟不稳定的排序行为）
     *
     * 这里使用选择排序来实现 —— 选择排序是不稳定的
     */
    private static void unstableSortByGrade(List<Student> list) {
        Student[] arr = list.toArray(new Student[0]);
        int n = arr.length;

        // 选择排序（不稳定）
        for (int i = 0; i < n - 1; i++) {
            int minIdx = i;
            for (int j = i + 1; j < n; j++) {
                if (arr[j].grade < arr[minIdx].grade) {
                    minIdx = j;
                }
            }
            if (minIdx != i) {
                Student tmp = arr[i];
                arr[i] = arr[minIdx];
                arr[minIdx] = tmp;
            }
        }

        list.clear();
        Collections.addAll(list, arr);
    }

    /**
     * 验证排序结果是否符合预期
     * 预期：成绩升序，成绩相同按姓名升序
     */
    private static boolean checkOrder(List<Student> list) {
        for (int i = 1; i < list.size(); i++) {
            Student prev = list.get(i - 1);
            Student curr = list.get(i);
            if (curr.grade < prev.grade) return false;
            if (curr.grade == prev.grade && curr.name.compareTo(prev.name) < 0) {
                return false;
            }
        }
        return true;
    }
}