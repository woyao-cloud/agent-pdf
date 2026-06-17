import { Effect, Console, pipe } from "effect";

// ============================================================
// 01-basic/acquire-release.ts
// 基础：acquireUseRelease 模式
// ============================================================

// --- 第1步：模拟资源（文件句柄） ---
class FileHandle {
  constructor(readonly path: string) {
    console.log(`[ACQUIRE] 打开文件: ${path}`);
  }

  read(): Effect.Effect<string> {
    return Effect.sync(() => {
      console.log(`[READ] 读取文件: ${this.path}`);
      return `这是 ${this.path} 的内容`;
    });
  }

  close(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log(`[RELEASE] 关闭文件: ${this.path}`);
    });
  }
}

// --- 第2步：模拟资源获取和释放 ---
const openFile = (path: string): Effect.Effect<FileHandle> =>
  Effect.sync(() => new FileHandle(path));

const closeFile = (handle: FileHandle): Effect.Effect<void> =>
  handle.close();

// --- 第3步：使用 acquireUseRelease ---
const readFile = (path: string) =>
  Effect.acquireUseRelease(
    openFile(path),           // acquire: 获取资源
    (handle) => handle.read(), // use: 使用资源
    (handle, exit) =>         // release: 无论成功失败都释放
      closeFile(handle).pipe(
        Effect.flatMap(() =>
          Effect.sync(() =>
            console.log(`释放完成, 退出状态: ${exit._tag}`)
          )
        )
      )
  );

// --- 第4步：运行 ---
const program = readFile("/data/config.json").pipe(
  Effect.flatMap((content) => Console.log(`文件内容: ${content}`))
);

Effect.runPromise(program).then(() => console.log("资源管理演示完成"));

// ============================================================
// 关键概念：
// 1. acquireUseRelease(acquire, use, release)
//    - acquire: 获取资源的 Effect
//    - use: 使用资源的 Effect
//    - release: 释放资源的 Effect（无论成功/失败/中断都会执行）
// 2. 资源安全：即使 use 阶段抛出异常，release 也会执行
// 3. 类型安全：acquireUseRelease 的返回类型是 use 的返回类型
// ============================================================
