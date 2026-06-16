#!/usr/bin/env bun

/**
 * Chapter 20: 未来展望与 Web 标准
 * Example 02 - React Server Components (RSC) on Bun
 *
 * Demonstrates RSC concepts and how Bun supports
 * React Server Components and streaming SSR.
 */

import * as os from "os";

// ─── Simulated RSC Runtime ──────────────────────────────────────────────

interface RSCComponent {
  type: "server" | "client";
  name: string;
  props: Record<string, any>;
  children?: RSCComponent[];
}

interface RSCPayload {
  tree: RSCComponent[];
  metadata: {
    version: string;
    timestamp: string;
  };
}

// ─── Server Components (run on server, no JS shipped) ───────────────────

function createServerComponent(name: string, props: Record<string, any> = {}): RSCComponent {
  return {
    type: "server",
    name,
    props,
  };
}

// Simulated server components
function NoteListPage(): RSCComponent {
  return createServerComponent("NoteListPage", {
    title: "My Notes",
    description: "A server-rendered list of notes",
  });
}

function NoteCard({ id, title, content }: { id: number; title: string; content: string }): RSCComponent {
  return createServerComponent("NoteCard", {
    id,
    title,
    content: content.substring(0, 100) + "...",
    preview: true,
  });
}

function ServerTimestamp(): RSCComponent {
  return createServerComponent("ServerTimestamp", {
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    server: "Bun",
  });
}

// ─── Client Components (interactive, JS shipped to browser) ─────────────

function createClientComponent(name: string, props: Record<string, any> = {}): RSCComponent {
  return {
    type: "client",
    name,
    props,
  };
}

function LikeButton({ noteId, initialLikes }: { noteId: number; initialLikes: number }): RSCComponent {
  return createClientComponent("LikeButton", {
    noteId,
    initialLikes,
    interactive: true,
  });
}

function CommentForm({ noteId }: { noteId: number }): RSCComponent {
  return createClientComponent("CommentForm", {
    noteId,
    placeholder: "Write a comment...",
  });
}

function SearchBar(): RSCComponent {
  return createClientComponent("SearchBar", {
    placeholder: "Search notes...",
    debounce: 300,
  });
}

// ─── RSC Payload Builder ────────────────────────────────────────────────

function buildRSCPayload(components: RSCComponent[]): RSCPayload {
  return {
    tree: components,
    metadata: {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── SSR (Server-Side Rendering) Simulation ─────────────────────────────

function renderComponentToHTML(component: RSCComponent, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  const prefix = component.type === "server" ? "// [Server Component]" : "// [Client Component]";

  switch (component.name) {
    case "NoteListPage":
      return `${indent}${prefix}
${indent}<html>
${indent}  <head><title>${component.props.title}</title></head>
${indent}  <body>
${indent}    <h1>${component.props.title}</h1>
${indent}    <p>${component.props.description}</p>
${indent}    <div class="notes-grid">
${indent}      <!-- Server components rendered here -->
${indent}    </div>
${indent}  </body>
${indent}</html>`;

    case "NoteCard":
      return `${indent}${prefix}
${indent}<article class="note-card" data-id="${component.props.id}">
${indent}  <h3>${component.props.title}</h3>
${indent}  <p>${component.props.content}</p>
${indent}  <div class="note-actions">
${indent}    <button class="like-btn" data-note-id="${component.props.id}">
${indent}      ♥ <span class="like-count">0</span>
${indent}    </button>
${indent}  </div>
${indent}</article>`;

    case "ServerTimestamp":
      return `${indent}${prefix}
${indent}<div class="server-timestamp">
${indent}  <span>Server time: ${component.props.timestamp}</span>
${indent}  <span>Timezone: ${component.props.timezone}</span>
${indent}  <span>Runtime: ${component.props.server}</span>
${indent}</div>`;

    case "LikeButton":
      return `${indent}${prefix}
${indent}<!-- Client component: LikeButton -->
${indent}<button class="like-btn" data-note-id="${component.props.noteId}"
${indent}        data-initial="${component.props.initialLikes}">
${indent}  ♥ <span>${component.props.initialLikes}</span>
${indent}</button>
${indent}<script type="module">
${indent}  // Client-side hydration code would be here
${indent}  // import { LikeButton } from './components/LikeButton';
${indent}</script>`;

    case "CommentForm":
      return `${indent}${prefix}
${indent}<!-- Client component: CommentForm -->
${indent}<form class="comment-form" data-note-id="${component.props.noteId}">
${indent}  <textarea placeholder="${component.props.placeholder}"></textarea>
${indent}  <button type="submit">Post Comment</button>
${indent}</form>`;

    case "SearchBar":
      return `${indent}${prefix}
${indent}<!-- Client component: SearchBar -->
${indent}<div class="search-bar">
${indent}  <input type="search" placeholder="${component.props.placeholder}"
${indent}         data-debounce="${component.props.debounce}" />
${indent}  <div class="search-results"></div>
${indent}</div>`;

    default:
      return `${indent}${prefix}\n${indent}<${component.name.toLowerCase()} />`;
  }
}

// ─── RSC Stream Simulation ──────────────────────────────────────────────

async function simulateRSCStream(payload: RSCPayload): Promise<void> {
  console.log("\n  ─── RSC Stream (Chunked Response) ───\n");

  console.log("  Streaming RSC payload chunks:");
  console.log("  ────────────────────────────────────────────────────────\n");

  // Simulate streaming chunks
  const chunks = [
    { id: 1, content: '<div id="root">', delay: 0 },
    { id: 2, content: '  <header><h1>My Notes App</h1></header>', delay: 2 },
    { id: 3, content: '  <main>', delay: 1 },
    { id: 4, content: '    <div class="notes-list">', delay: 3 },
    { id: 5, content: '      <!-- Server components streamed inline -->', delay: 1 },
    { id: 6, content: '      <article class="note-card">...</article>', delay: 5 },
    { id: 7, content: '      <article class="note-card">...</article>', delay: 4 },
    { id: 8, content: '      <article class="note-card">...</article>', delay: 3 },
    { id: 9, content: '    </div>', delay: 1 },
    { id: 10, content: '  </main>', delay: 1 },
    { id: 11, content: '  <footer>Powered by Bun + React</footer>', delay: 2 },
    { id: 12, content: '</div>', delay: 1 },
  ];

  for (const chunk of chunks) {
    await new Promise((r) => setTimeout(r, chunk.delay));
    console.log(`  [chunk ${chunk.id.toString().padStart(2, "0")}] ${chunk.content}`);
  }

  console.log("\n  ────────────────────────────────────────────────────────");
  console.log(`  Total chunks: ${chunks.length}`);
  const totalSize = chunks.reduce((sum, c) => sum + c.content.length, 0);
  console.log(`  Total size: ~${totalSize} bytes`);
  console.log(`  RSC payload version: ${payload.metadata.version}`);
  console.log(`  Generated at: ${payload.metadata.timestamp}`);
}

// ─── RSC vs Traditional SSR Comparison ──────────────────────────────────

function printRSCvsSSR(): void {
  console.log("\n  ─── RSC vs Traditional SSR vs SPA ───\n");

  const comparison = [
    { aspect: "首次加载 (FCP)", ssr: "✅ 快", spa: "❌ 慢", rsc: "✅ 最快" },
    { aspect: "交互性 (TTI)", ssr: "✅ 快", spa: "❌ 需下载JS", rsc: "✅ 渐进式" },
    { aspect: "JS 体积", ssr: "✅ 小", spa: "❌ 大", rsc: "✅ 仅客户端组件" },
    { aspect: "数据新鲜度", ssr: "✅ 服务端", spa: "⚠ 需API", rsc: "✅ 服务端" },
    { aspect: "SEO", ssr: "✅ 好", spa: "⚠ 需SSR", rsc: "✅ 好" },
    { aspect: "交互体验", ssr: "⚠ 页面跳转", spa: "✅ SPA", rsc: "✅ SPA-like" },
    { aspect: "缓存策略", ssr: "⚠ 有限", spa: "✅ API缓存", rsc: "✅ 组件级" },
    { aspect: "流式渲染", ssr: "⚠ 需额外配置", spa: "❌", rsc: "✅ 原生支持" },
    { aspect: "服务端状态", ssr: "✅ 直接", spa: "⚠ 需API", rsc: "✅ 直接" },
    { aspect: "学习曲线", ssr: "✅ 低", spa: "⚠ 中", rsc: "⚠ 中高" },
    { aspect: "Bun 支持", ssr: "✅", spa: "✅", rsc: "✅ 通过 Hono/Next" },
  ];

  console.log("  Aspect              | SSR         | SPA         | RSC         ");
  console.log("  ─────────────────────────────────────────────────────────────────");
  for (const row of comparison) {
    console.log(`  ${row.aspect.padEnd(21)}| ${row.ssr.padEnd(12)}| ${row.spa.padEnd(12)}| ${row.rsc}`);
  }
  console.log("  ─────────────────────────────────────────────────────────────────");
}

// ─── Bun RSC Setup Guide ────────────────────────────────────────────────

function printRSCSetup(): void {
  console.log("\n  ─── Setting Up RSC with Bun ───\n");

  console.log("  Option 1: Using Next.js (stable RSC support)");
  console.log("  ```bash");
  console.log("  bunx create-next-app my-app --typescript");
  console.log("  cd my-app");
  console.log("  bun run dev");
  console.log("  ```");
  console.log("");
  console.log("  Option 2: Using Hono (lightweight RSC)");
  console.log("  ```bash");
  console.log("  mkdir my-rsc-app && cd my-rsc-app");
  console.log("  bun init");
  console.log("  bun add hono react @hono/react-server");
  console.log("  ```");
  console.log("");
  console.log("  Option 3: Custom RSC setup");
  console.log("  ```bash");
  console.log("  bun add react react-dom");
  console.log("  bun add @rsc-parser/core # RSC parser");
  console.log("  ```");
  console.log("");
  console.log("  Key files for RSC:");
  console.log("  • app/page.tsx — Server Component (default)");
  console.log("  • app/NoteCard.tsx — Server Component");
  console.log("  • app/LikeButton.tsx — Client Component (use 'use client')");
  console.log("  • app/layout.tsx — Root layout");
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  React Server Components (RSC) on Bun");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Bun version: ${Bun.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. Build RSC component tree
  console.log("  1. Building RSC Component Tree...\n");

  const page = NoteListPage();
  const notes = [
    { id: 1, title: "Learning Bun", content: "Bun is a fast JavaScript runtime..." },
    { id: 2, title: "RSC Concepts", content: "React Server Components allow..." },
    { id: 3, title: "Web Standards", content: "WinterCG is standardizing..." },
  ];

  const components: RSCComponent[] = [
    page,
    ServerTimestamp(),
    SearchBar(),
    ...notes.map((n) => NoteCard(n)),
    LikeButton({ noteId: 1, initialLikes: 42 }),
    LikeButton({ noteId: 2, initialLikes: 17 }),
    CommentForm({ noteId: 1 }),
  ];

  console.log(`  Component tree:`);
  for (const comp of components) {
    const typeIcon = comp.type === "server" ? "🖥" : "🖱";
    console.log(`  ${typeIcon} [${comp.type}] ${comp.name}`);
  }

  // 2. Build RSC payload
  const payload = buildRSCPayload(components);
  console.log(`\n  RSC payload built: ${components.length} components`);
  console.log(`  Version: ${payload.metadata.version}`);

  // 3. Simulate streaming
  await simulateRSCStream(payload);

  // 4. Render to HTML (SSR fallback)
  console.log("\n  ─── SSR HTML Output (Component Rendering) ───\n");
  for (const comp of components.slice(0, 4)) {
    console.log(renderComponentToHTML(comp));
    console.log("");
  }

  // 5. RSC vs SSR vs SPA comparison
  printRSCvsSSR();

  // 6. Setup guide
  printRSCSetup();

  // 7. Future of RSC
  console.log("\n  ─── RSC Future on Bun ───\n");
  console.log("  • Bun 原生支持 JSX 和 TypeScript，无需额外配置");
  console.log("  • Bun.serve() 支持流式响应，适合 RSC 流式渲染");
  console.log("  • Bun.SQLite 可作为 RSC 的数据层");
  console.log("  • Bun 的快速启动使 RSC 开发体验更流畅");
  console.log("  • Web 标准 API (fetch, Request, Response) 完美配合 RSC");
  console.log("");
  console.log("  Framework support:");
  console.log("  • Next.js 14+ — 完整 RSC 支持（App Router）");
  console.log("  • Hono — 实验性 RSC 支持");
  console.log("  • Waku — 专注于 RSC 的 React 框架");
  console.log("  • Custom — 使用 @rsc-parser 自行搭建");

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  RSC demo complete.");
  console.log("  See Chapter 20 README for detailed RSC + Bun analysis.");
  console.log("═══════════════════════════════════════════════════════\n");
}

await main();
