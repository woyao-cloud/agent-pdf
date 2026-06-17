import { Stream, Effect, Console, Chunk, pipe, Schedule, Duration, Option, Either, Array, Tuple, HashMap, StreamEmit } from "effect"
import * as fs from "fs"
import * as readline from "readline"

// ============================================================
// 03-production: GB 级 CSV 处理 —— 生产级流处理实战
// ============================================================

// --- 3.1 从文件读取流：逐行处理大文件 ---

// 创建一个从文件逐行读取的流
// 使用 Node.js readline 接口，通过 Stream.async 包装为 Effect Stream
const fileLineStream = (filePath: string): Stream.Stream<string, Error> =>
  Stream.async<string, Error>((emit) => {
    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
      })

      rl.on("line", (line: string) => {
        emit(Effect.succeed(Chunk.of(line)))
      })

      rl.on("close", () => {
        emit(Effect.succeed(Chunk.empty)) // 流结束
      })

      rl.on("error", (err: Error) => {
        emit(Effect.fail(err))
      })
    } catch (err) {
      emit(Effect.fail(err instanceof Error ? err : new Error(String(err))))
    }
  })

// --- 3.2 CSV 解析器：将行解析为结构化数据 ---

interface CsvRow {
  headers: string[]
  values: string[]
}

const parseCsvLine = (line: string, headers: string[]): Option.Option<CsvRow> => {
  if (line.trim().length === 0) return Option.none()
  const values = line.split(",").map((v) => v.trim())
  if (values.length !== headers.length) return Option.none()
  return Option.some({ headers, values })
}

const parseCsvHeader = (line: string): string[] =>
  line.split(",").map((h) => h.trim())

// --- 3.3 分块处理：使用 Chunk 批量解析 ---

// 将行流转换为 Chunk 流，每 1000 行一个 Chunk
const chunkedCsvStream = (filePath: string): Stream.Stream<Chunk.Chunk<CsvRow>, Error> =>
  pipe(
    fileLineStream(filePath),
    Stream.splitOnChunk(1000), // 每 1000 行切一个 Chunk
    Stream.map((linesChunk) => {
      // 第一行是表头
      const lines = Chunk.toReadonlyArray(linesChunk)
      if (lines.length === 0) return Chunk.empty()
      const headers = parseCsvHeader(lines[0])
      const dataLines = lines.slice(1)
      const rows = dataLines
        .map((line) => parseCsvLine(line, headers))
        .filter(Option.isSome)
        .map((opt) => opt.value)
      return Chunk.fromIterable(rows)
    })
  )

// --- 3.4 聚合分析：按列分组统计 ---

interface AggResult {
  count: number
  sum: number
  min: number
  max: number
}

const aggregateByColumn = (
  rows: Chunk.Chunk<CsvRow>,
  groupCol: string,
  valueCol: string
): HashMap.HashMap<string, AggResult> => {
  const map = HashMap.empty<string, AggResult>()
  return Chunk.reduce(rows, map, (acc, row) => {
    const groupIdx = row.headers.indexOf(groupCol)
    const valueIdx = row.headers.indexOf(valueCol)
    if (groupIdx === -1 || valueIdx === -1) return acc
    const groupKey = row.values[groupIdx]
    const numericValue = parseFloat(row.values[valueIdx])
    if (isNaN(numericValue)) return acc
    const existing = HashMap.get(acc, groupKey)
    const updated: AggResult = Option.match(existing, {
      onNone: () => ({
        count: 1,
        sum: numericValue,
        min: numericValue,
        max: numericValue,
      }),
      onSome: (prev) => ({
        count: prev.count + 1,
        sum: prev.sum + numericValue,
        min: Math.min(prev.min, numericValue),
        max: Math.max(prev.max, numericValue),
      }),
    })
    return HashMap.set(acc, groupKey, updated)
  })
}

// --- 3.5 流式写入：将结果分批写出 ---

const writeResultsToConsole = (results: HashMap.HashMap<string, AggResult>): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log("\n=== Aggregation Results ===")
    console.log("Group\tCount\tSum\tAvg\tMin\tMax")
    HashMap.forEach(results, (value, key) => {
      const avg = value.sum / value.count
      console.log(
        `${key}\t${value.count}\t${value.sum.toFixed(2)}\t${avg.toFixed(2)}\t${value.min}\t${value.max}`
      )
    })
  })

// --- 3.6 主流程：完整的 ETL 管道 ---

// 模拟生成一个大型 CSV 文件用于演示
const generateSampleCsv = (filePath: string, rowCount: number): Effect.Effect<void> =>
  Effect.sync(() => {
    const header = "id,category,amount,date,region"
    const categories = ["Electronics", "Clothing", "Food", "Books", "Sports"]
    const regions = ["North", "South", "East", "West"]
    const lines: string[] = [header]
    for (let i = 1; i <= rowCount; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)]
      const amount = (Math.random() * 1000).toFixed(2)
      const date = `2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`
      const region = regions[Math.floor(Math.random() * regions.length)]
      lines.push(`${i},${category},${amount},${date},${region}`)
    }
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8")
    console.log(`Generated ${rowCount} rows to ${filePath}`)
  })

// --- 3.7 带进度报告的流处理 ---

const processWithProgress = (filePath: string): Effect.Effect<void> =>
  pipe(
    chunkedCsvStream(filePath),
    Stream.mapAccumEffect(0, (processedCount, rowsChunk) => {
      const chunkSize = Chunk.size(rowsChunk)
      const newCount = processedCount + chunkSize
      // 每处理 10000 行报告一次进度
      const report = newCount % 10000 < chunkSize
        ? Console.log(`Progress: ${newCount} rows processed`)
        : Effect.void
      return report.pipe(Effect.andThen(newCount))
    }),
    Stream.runDrain
  )

// --- 3.8 容错处理：跳过坏行并记录 ---

const robustCsvStream = (filePath: string): Stream.Stream<CsvRow, Error> =>
  pipe(
    fileLineStream(filePath),
    Stream.mapAccum(
      { headers: [] as string[], errorCount: 0, isFirst: true },
      (state, line) => {
        if (state.isFirst) {
          const headers = parseCsvHeader(line)
          return [{ ...state, headers, isFirst: false }, Option.none()] as const
        }
        const parsed = parseCsvLine(line, state.headers)
        if (Option.isSome(parsed)) {
          return [state, Option.some(parsed.value)] as const
        }
        // 跳过坏行，记录错误
        const newState = { ...state, errorCount: state.errorCount + 1 }
        console.warn(`Skipped bad line: ${line.substring(0, 50)}...`)
        return [newState, Option.none()] as const
      }
    ),
    Stream.filterMap((opt) => opt)
  )

// --- 3.9 主函数 ---

const main = Effect.gen(function* (_) {
  const filePath = "/tmp/sample_data.csv"
  const rowCount = 50000

  // 1. 生成样本数据
  yield* _(generateSampleCsv(filePath, rowCount))

  // 2. 使用健壮的流处理
  console.log("\n=== Processing with robust stream ===")
  const results = yield* _(
    pipe(
      robustCsvStream(filePath),
      Stream.runFold(HashMap.empty<string, AggResult>(), (acc, row) => {
        const groupIdx = row.headers.indexOf("category")
        const valueIdx = row.headers.indexOf("amount")
        if (groupIdx === -1 || valueIdx === -1) return acc
        const groupKey = row.values[groupIdx]
        const numericValue = parseFloat(row.values[valueIdx])
        if (isNaN(numericValue)) return acc
        const existing = HashMap.get(acc, groupKey)
        const updated: AggResult = Option.match(existing, {
          onNone: () => ({ count: 1, sum: numericValue, min: numericValue, max: numericValue }),
          onSome: (prev) => ({
            count: prev.count + 1,
            sum: prev.sum + numericValue,
            min: Math.min(prev.min, numericValue),
            max: Math.max(prev.max, numericValue),
          }),
        })
        return HashMap.set(acc, groupKey, updated)
      })
    )
  )

  // 3. 输出结果
  yield* _(writeResultsToConsole(results))

  // 4. 清理
  yield* _(Effect.sync(() => fs.unlinkSync(filePath)))
  console.log("\nCleanup complete")
})

Effect.runPromise(main).then(
  () => console.log("Production pipeline completed successfully"),
  (err) => console.error("Pipeline failed:", err)
)
