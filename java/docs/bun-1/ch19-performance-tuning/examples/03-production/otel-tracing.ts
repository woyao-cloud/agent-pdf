#!/usr/bin/env bun

/**
 * Chapter 19: 性能调优与监控
 * Example 03 - OpenTelemetry Tracing
 *
 * Demonstrates OpenTelemetry integration for distributed tracing in Bun:
 * - Manual span creation
 * - Automatic HTTP instrumentation
 * - Trace context propagation
 * - Export to Jaeger/Zipkin
 */

import * as os from "os";
import * as crypto from "crypto";

// ─── Simple Tracer Implementation (OTel-like API) ────────────────────────

interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

interface SpanAttribute {
  key: string;
  value: string | number | boolean;
}

interface SpanEvent {
  name: string;
  timestamp: number;
  attributes: SpanAttribute[];
}

type SpanStatus = "OK" | "ERROR" | "UNSET";

interface Span {
  name: string;
  context: SpanContext;
  startTime: number;
  endTime?: number;
  attributes: SpanAttribute[];
  events: SpanEvent[];
  status: SpanStatus;
  statusMessage?: string;
  end(): void;
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  setStatus(status: SpanStatus, message?: string): void;
}

// ─── ID Generation ───────────────────────────────────────────────────────

function generateTraceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateSpanId(): string {
  return crypto.randomBytes(8).toString("hex");
}

// ─── Simple Span Implementation ──────────────────────────────────────────

class SimpleSpan implements Span {
  name: string;
  context: SpanContext;
  startTime: number;
  endTime?: number;
  attributes: SpanAttribute[] = [];
  events: SpanEvent[] = [];
  status: SpanStatus = "UNSET";
  statusMessage?: string;

  constructor(name: string, parentContext?: SpanContext) {
    this.name = name;
    this.context = {
      traceId: parentContext?.traceId || generateTraceId(),
      spanId: generateSpanId(),
      parentSpanId: parentContext?.spanId,
      sampled: true,
    };
    this.startTime = performance.now();
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes.push({ key, value });
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    const event: SpanEvent = {
      name,
      timestamp: Date.now(),
      attributes: attributes
        ? Object.entries(attributes).map(([key, value]) => ({ key, value }))
        : [],
    };
    this.events.push(event);
  }

  setStatus(status: SpanStatus, message?: string): void {
    this.status = status;
    this.statusMessage = message;
  }

  end(): void {
    this.endTime = performance.now();
  }

  get durationMs(): number {
    return (this.endTime || performance.now()) - this.startTime;
  }

  toJSON(): Record<string, any> {
    return {
      name: this.name,
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this.context.parentSpanId,
      startTime: this.startTime,
      durationMs: this.durationMs,
      attributes: Object.fromEntries(this.attributes.map((a) => [a.key, a.value])),
      events: this.events.map((e) => ({
        name: e.name,
        timestamp: new Date(e.timestamp).toISOString(),
        attributes: Object.fromEntries(e.attributes.map((a) => [a.key, a.value])),
      })),
      status: this.status,
      statusMessage: this.statusMessage,
    };
  }
}

// ─── Simple Tracer ───────────────────────────────────────────────────────

class SimpleTracer {
  private spans: SimpleSpan[] = [];
  private spanStack: SpanContext[] = [];

  startSpan(name: string): SimpleSpan {
    const parentContext = this.spanStack[this.spanStack.length - 1];
    const span = new SimpleSpan(name, parentContext);
    this.spans.push(span);
    this.spanStack.push(span.context);
    return span;
  }

  endSpan(span: SimpleSpan): void {
    span.end();
    const idx = this.spanStack.findIndex(
      (c) => c.spanId === span.context.spanId
    );
    if (idx >= 0) {
      this.spanStack.splice(idx, 1);
    }
  }

  getSpans(): SimpleSpan[] {
    return this.spans;
  }

  clear(): void {
    this.spans = [];
    this.spanStack = [];
  }

  export(): string {
    return JSON.stringify(this.spans.map((s) => s.toJSON()), null, 2);
  }

  // OTLP-like export format
  exportOTLP(): Record<string, any> {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "bun-demo-service" } },
              { key: "telemetry.sdk.name", value: { stringValue: "bun-otel-demo" } },
              { key: "telemetry.sdk.language", value: { stringValue: "typescript" } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "bun-demo", version: "1.0.0" },
              spans: this.spans.map((s) => ({
                traceId: s.context.traceId,
                spanId: s.context.spanId,
                parentSpanId: s.context.parentSpanId || undefined,
                name: s.name,
                kind: 1, // INTERNAL
                startTimeUnixNano: BigInt(s.startTime * 1e6).toString(),
                endTimeUnixNano: s.endTime
                  ? BigInt(s.endTime * 1e6).toString()
                  : "0",
                attributes: s.attributes.map((a) => ({
                  key: a.key,
                  value: {
                    [typeof a.value === "string"
                      ? "stringValue"
                      : typeof a.value === "number"
                      ? "intValue"
                      : "boolValue"]: a.value,
                  },
                })),
                status: {
                  code: s.status === "OK" ? 1 : s.status === "ERROR" ? 2 : 0,
                  message: s.statusMessage || "",
                },
              })),
            },
          ],
        },
      ],
    };
  }
}

// ─── Demo: HTTP Request Tracing ──────────────────────────────────────────

async function simulateHttpRequestTrace(tracer: SimpleTracer): Promise<void> {
  console.log("\n  ─── Scenario 1: HTTP Request Tracing ───\n");

  // Root span: incoming HTTP request
  const rootSpan = tracer.startSpan("HTTP POST /api/users");
  rootSpan.setAttribute("http.method", "POST");
  rootSpan.setAttribute("http.url", "/api/users");
  rootSpan.setAttribute("http.request_id", crypto.randomUUID());
  rootSpan.addEvent("request.received", { contentLength: 512 });

  // Authentication middleware
  const authSpan = tracer.startSpan("auth.middleware");
  authSpan.setAttribute("auth.type", "jwt");
  await new Promise((resolve) => setTimeout(resolve, 5));
  authSpan.setAttribute("auth.user_id", "user_12345");
  authSpan.setAttribute("auth.role", "admin");
  authSpan.addEvent("auth.verified");
  authSpan.setStatus("OK");
  tracer.endSpan(authSpan);

  // Input validation
  const validationSpan = tracer.startSpan("validation");
  validationSpan.setAttribute("schema", "CreateUserRequest");
  await new Promise((resolve) => setTimeout(resolve, 3));
  validationSpan.addEvent("validation.passed", { fields: ["name", "email", "role"] });
  validationSpan.setStatus("OK");
  tracer.endSpan(validationSpan);

  // Database query
  const dbSpan = tracer.startSpan("db.query.createUser");
  dbSpan.setAttribute("db.system", "sqlite");
  dbSpan.setAttribute("db.statement", "INSERT INTO users (name, email, role) VALUES (?, ?, ?)");
  dbSpan.addEvent("query.started");
  await new Promise((resolve) => setTimeout(resolve, 10));
  dbSpan.addEvent("query.completed", { rowsAffected: 1 });
  dbSpan.setAttribute("db.user_id", "user_12345");
  dbSpan.setStatus("OK");
  tracer.endSpan(dbSpan);

  // Response serialization
  const serializeSpan = tracer.startSpan("response.serialize");
  serializeSpan.setAttribute("response.format", "json");
  await new Promise((resolve) => setTimeout(resolve, 2));
  serializeSpan.setStatus("OK");
  tracer.endSpan(serializeSpan);

  // Complete root span
  rootSpan.setAttribute("http.status_code", 201);
  rootSpan.setStatus("OK");
  rootSpan.addEvent("response.sent", { statusCode: 201 });
  tracer.endSpan(rootSpan);

  console.log("  Trace completed: HTTP POST /api/users");
}

// ─── Demo: Background Job Tracing ────────────────────────────────────────

async function simulateBackgroundJob(tracer: SimpleTracer): Promise<void> {
  console.log("\n  ─── Scenario 2: Background Job Processing ───\n");

  const jobSpan = tracer.startSpan("job.processReport");
  jobSpan.setAttribute("job.id", "job_98765");
  jobSpan.setAttribute("job.type", "report_generation");
  jobSpan.addEvent("job.started");

  // Fetch data
  const fetchSpan = tracer.startSpan("job.fetchData");
  fetchSpan.setAttribute("data.source", "analytics_db");
  fetchSpan.setAttribute("data.time_range", "last_7_days");
  await new Promise((resolve) => setTimeout(resolve, 15));
  fetchSpan.addEvent("data.fetched", { rows: 2500 });
  fetchSpan.setStatus("OK");
  tracer.endSpan(fetchSpan);

  // Process data
  const processSpan = tracer.startSpan("job.processData");
  processSpan.setAttribute("processing.steps", 3);
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Sub-operation: aggregation
  const aggSpan = tracer.startSpan("job.aggregate");
  await new Promise((resolve) => setTimeout(resolve, 8));
  aggSpan.setAttribute("aggregation.type", "sum_by_category");
  aggSpan.setStatus("OK");
  tracer.endSpan(aggSpan);

  // Sub-operation: formatting
  const formatSpan = tracer.startSpan("job.formatReport");
  await new Promise((resolve) => setTimeout(resolve, 5));
  formatSpan.setAttribute("format", "pdf");
  formatSpan.setStatus("OK");
  tracer.endSpan(formatSpan);

  processSpan.addEvent("processing.completed", { outputSize: "2.4MB" });
  processSpan.setStatus("OK");
  tracer.endSpan(processSpan);

  // Store result
  const storeSpan = tracer.startSpan("job.storeResult");
  storeSpan.setAttribute("storage.type", "s3");
  storeSpan.setAttribute("storage.path", "/reports/2024/01/report_98765.pdf");
  await new Promise((resolve) => setTimeout(resolve, 5));
  storeSpan.setStatus("OK");
  tracer.endSpan(storeSpan);

  jobSpan.setStatus("OK");
  jobSpan.addEvent("job.completed", { duration: "52ms" });
  tracer.endSpan(jobSpan);

  console.log("  Trace completed: job.processReport");
}

// ─── Demo: Error Tracing ─────────────────────────────────────────────────

async function simulateErrorTrace(tracer: SimpleTracer): Promise<void> {
  console.log("\n  ─── Scenario 3: Error Tracing ───\n");

  const rootSpan = tracer.startSpan("HTTP GET /api/users/99999");
  rootSpan.setAttribute("http.method", "GET");
  rootSpan.setAttribute("http.url", "/api/users/99999");

  const dbSpan = tracer.startSpan("db.query.findUser");
  dbSpan.setAttribute("db.statement", "SELECT * FROM users WHERE id = ?");
  dbSpan.setAttribute("db.params", "99999");
  await new Promise((resolve) => setTimeout(resolve, 3));

  // Simulate error: user not found
  dbSpan.setStatus("ERROR", "User not found");
  dbSpan.addEvent("query.error", { code: "NOT_FOUND", message: "User with id 99999 does not exist" });
  tracer.endSpan(dbSpan);

  rootSpan.setAttribute("http.status_code", 404);
  rootSpan.setStatus("ERROR", "Resource not found");
  rootSpan.addEvent("error.response", { message: "User not found" });
  tracer.endSpan(rootSpan);

  console.log("  Trace completed with error: HTTP GET /api/users/99999 → 404");
}

// ─── Trace Visualization ────────────────────────────────────────────────

function visualizeTrace(tracer: SimpleTracer): void {
  console.log("\n  ─── Trace Visualization (Timeline) ───\n");

  const spans = tracer.getSpans();
  if (spans.length === 0) return;

  // Find root spans (no parent)
  const rootSpans = spans.filter((s) => !s.context.parentSpanId);
  const childSpans = spans.filter((s) => s.context.parentSpanId);

  for (const root of rootSpans) {
    printSpanTree(root, childSpans, 0);
  }
}

function printSpanTree(span: SimpleSpan, allSpans: SimpleSpan[], depth: number): void {
  const indent = "  ".repeat(depth);
  const duration = span.durationMs.toFixed(1);
  const statusIcon = span.status === "OK" ? "✓" : span.status === "ERROR" ? "✗" : "○";
  const bar = "▓".repeat(Math.min(Math.round(span.durationMs / 2), 40));

  console.log(`  ${indent}${bar} ${statusIcon} ${span.name} (${duration}ms)`);

  // Print attributes
  if (span.attributes.length > 0 && depth < 2) {
    const attrs = span.attributes.map((a) => `${a.key}=${a.value}`).join(", ");
    console.log(`  ${indent}  Attributes: ${attrs}`);
  }

  // Print events
  if (span.events.length > 0 && depth < 2) {
    for (const event of span.events) {
      console.log(`  ${indent}  ◇ ${event.name}`);
    }
  }

  // Print children
  const children = allSpans.filter(
    (s) => s.context.parentSpanId === span.context.spanId
  );
  for (const child of children) {
    printSpanTree(child, allSpans, depth + 1);
  }
}

// ─── OTel Export Simulation ──────────────────────────────────────────────

function simulateOTelExport(tracer: SimpleTracer): void {
  console.log("\n  ─── OTLP Export (to Jaeger/Zipkin) ───\n");

  const otlpPayload = tracer.exportOTLP();
  const spanCount = tracer.getSpans().length;

  console.log(`  Exporting ${spanCount} spans via OTLP protocol...`);
  console.log(`  Service name: ${otlpPayload.resourceSpans[0].resource.attributes[0].value.stringValue}`);
  console.log(`  Export format: OTLP/HTTP (protobuf)`);
  console.log(`  Target: Jaeger at http://localhost:4318/v1/traces`);
  console.log(`  (or Zipkin at http://localhost:9411/api/v2/spans)`);
  console.log("");
  console.log("  To receive traces, run:");
  console.log("  docker run -d --name jaeger \\");
  console.log("    -e COLLECTOR_OTLP_ENABLED=true \\");
  console.log("    -p 4318:4318 -p 16686:16686 \\");
  console.log("    jaegertracing/all-in-one:latest");
  console.log("");
  console.log("  Then view traces at http://localhost:16686");
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  OpenTelemetry Distributed Tracing in Bun");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("  This example simulates OpenTelemetry tracing without");
  console.log("  requiring actual OTel SDK or collector infrastructure.\n");

  const tracer = new SimpleTracer();

  // Scenario 1: HTTP request
  await simulateHttpRequestTrace(tracer);

  // Visualize
  visualizeTrace(tracer);

  // Scenario 2: Background job
  await simulateBackgroundJob(tracer);
  visualizeTrace(tracer);

  // Scenario 3: Error tracing
  await simulateErrorTrace(tracer);
  visualizeTrace(tracer);

  // OTel export simulation
  simulateOTelExport(tracer);

  // Summary
  console.log("\n  ─── Trace Summary ───\n");

  const allSpans = tracer.getSpans();
  const okSpans = allSpans.filter((s) => s.status === "OK").length;
  const errSpans = allSpans.filter((s) => s.status === "ERROR").length;
  const totalDuration = allSpans.reduce((sum, s) => sum + s.durationMs, 0);

  console.log(`  Total spans created: ${allSpans.length}`);
  console.log(`  Successful spans: ${okSpans}`);
  console.log(`  Error spans: ${errSpans}`);
  console.log(`  Total trace duration: ${totalDuration.toFixed(1)}ms`);

  const traceIds = [...new Set(allSpans.map((s) => s.context.traceId))];
  console.log(`  Unique traces: ${traceIds.length}`);
  for (const traceId of traceIds) {
    const traceSpans = allSpans.filter((s) => s.context.traceId === traceId);
    const traceDuration = Math.max(...traceSpans.map((s) => s.endTime || s.startTime)) -
      Math.min(...traceSpans.map((s) => s.startTime));
    console.log(`    Trace ${traceId.substring(0, 16)}...: ${traceSpans.length} spans, ${traceDuration.toFixed(1)}ms`);
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  OpenTelemetry tracing demo complete.");
  console.log("  See Chapter 19 README for production OTel setup.");
  console.log("═══════════════════════════════════════════════════════\n");
}

await main();
