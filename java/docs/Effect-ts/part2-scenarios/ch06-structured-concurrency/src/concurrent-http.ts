import { Effect, Schedule } from "effect"

interface HttpResult {
  url: string
  status: number
  body: string
}

// 模拟 HTTP 请求
const httpGet = (url: string): Effect.Effect<HttpResult> =>
  Effect.sync(() => ({
    url,
    status: 200,
    body: `Response from ${url}`,
  }))

// 并发请求所有 URL
export const fetchAll = (urls: string[]): Effect.Effect<HttpResult[]> =>
  Effect.forEach(urls, (url) => httpGet(url), {
    concurrency: "unbounded",
  })

// 并发加超时
export const fetchAllWithTimeout = (urls: string[]): Effect.Effect<(HttpResult | null)[]> =>
  Effect.forEach(urls, (url) =>
    httpGet(url).pipe(
      Effect.timeout("3 seconds"),
      Effect.optionFromOptional,
    ), {
    concurrency: "unbounded",
  })

// 批量处理 + 指数退避重试
export const fetchWithRetrySchedule = (url: string): Effect.Effect<HttpResult> =>
  httpGet(url).pipe(
    Effect.retry(
      Schedule.exponential("100 millis", 2.0).pipe(
        Schedule.whileOutput((delay) => delay < "5 seconds"),
      ),
    ),
  )

// 扇出模式：请求最优的 API
export const fanOut = (urls: string[]): Effect.Effect<HttpResult> =>
  Effect.raceAll(urls.map((url) => httpGet(url)))

// 工作池模式
export const workerPool = <A, B>(
  items: A[],
  worker: (item: A) => Effect.Effect<B>,
  poolSize: number,
): Effect.Effect<B[]> =>
  Effect.forEach(items, worker, { concurrency: poolSize })