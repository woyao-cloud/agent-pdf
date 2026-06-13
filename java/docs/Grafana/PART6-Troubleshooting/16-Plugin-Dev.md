# 第16章 插件开发：当Grafana满足不了你的需求时

## 场景故事：我们需要一个3D拓扑图

> **"老大，客户想看网络拓扑的可视化。"**
>
> 产品经理小张拿着需求文档找到 Grafana 负责人老李。需求很简单：用一张 3D 拓扑图展示数据中心里所有网络设备的连接关系，设备状态用颜色表示——绿色的在线、红色的宕机、黄色的有告警。
>
> "Grafana 里有什么现成的面板插件能实现吗？"
>
> 老李翻了一遍 Grafana 的插件市场：
> - 折线图 ✅ — 有时序数据
> - 柱状图 ✅ — 适合对比
> - 饼图 ✅ — 适合占比
> - 仪表盘 ✅ — 适合单个指标
> - 表格 ✅ — 适合详细数据
> - **3D 拓扑图** ❌ — Grafana 没有！
>
> "要么我们改需求，用表格展示设备列表算了。"小张试探性地问。
>
> "不行，"老李摇摇头，"表格没法直观展示连接关系。如果交换机 A 连着 20 台服务器，表格里就是 20 行数据，没人能看出拓扑结构。"
>
> "那怎么办？"
>
> "我们自己写一个插件。"

这就是插件开发的典型场景——Grafana 自带的 Panel 和社区插件都无法满足业务需求时，自己动手，丰衣足食。

---

## 16.1 什么是 Grafana 插件

### 16.1.1 原理比喻：从"精装房"到"毛坯房"

想象你买了一套房子：

- **Grafana 内置面板** = 精装房：开发商已经给你配好了家具、电器、装修。你直接拎包入住就行。但如果开发商的装修风格你不喜欢，你没法改。
- **社区插件** = 宜家家具：你可以买现成的家具组件，选择很多，但不一定能完全满足你的需求。有时候你想要的款式宜家没有。
- **自己开发插件** = 自己打家具：你有完全的控制权，想做成什么样子就做成什么样子。但需要你懂木工活，花时间和精力。

Grafana 的插件体系让你从"使用者"变成"创造者"。

### 16.1.2 插件类型

| 类型 | 用途 | 类比 |
|---|---|---|
| **Panel Plugin** | 可视化面板，如折线图、仪表盘 | 房子里的不同家具 |
| **Data Source Plugin** | 连接新的数据源，如自定义 API | 房子的水电管道接口 |
| **App Plugin** | 包含多个 Panel 和 Data Source 的完整应用 | 整套智能家居系统 |

---

## 16.2 插件开发环境搭建

### 16.2.1 前置要求

| 工具 | 版本要求 | 用途 |
|---|---|---|
| Node.js | 18.x 或更高 | JavaScript 运行时 |
| npm / yarn | 最新稳定版 | 包管理 |
| Git | 任意版本 | 版本控制 |
| Docker | 任意版本 | 本地 Grafana 环境 |
| Go（仅 Data Source 插件） | 1.19+ | 后端开发 |

### 16.2.2 手把手：从零搭建插件开发环境

**步骤 1：安装 Node.js**

```bash
# 下载 Node.js 18+（推荐使用 nvm 管理版本）
# Windows: https://nodejs.org/
# macOS: brew install node
# Linux: 使用包管理器

# 验证安装
node --version  # 应 >= 18.x
npm --version   # 应 >= 8.x
```

**步骤 2：安装 Grafana Plugin Tools**

```bash
# 全局安装 Grafana 插件开发工具
npm install -g @grafana/create-plugin

# 验证安装
npx @grafana/create-plugin --help
```

**步骤 3：创建插件脚手架**

```bash
# 进入你的开发目录
cd D:\学习\大模型\pdf\java\docs\Grafana\PART6-Troubleshooting

# 创建新插件
npx @grafana/create-plugin
```

你会看到交互式提示：

```
? What type of plugin? › 
  ❯ panel        # 选择 Panel 类型
  datasource
  app

? What's the name of your plugin? › network-topology-3d
  # 输入插件名称

? Enter the organization name › my-company
  # 输入组织名，将作为插件 ID 的前缀

? Add Github workflow to automatically build and test the plugin? › No
  # 生产环境选 Yes，本地开发选 No
```

**步骤 4：查看生成的目录结构**

```
network-topology-3d/
├── src/
│   ├── components/        # React 组件
│   │   ├── App.tsx        # 主组件
│   │   └── App.test.tsx   # 测试文件
│   ├── module.ts          # 插件入口
│   ├── plugin.json        # 插件元数据
│   └── types.ts           # TypeScript 类型定义
├── package.json           # 依赖管理
├── tsconfig.json          # TypeScript 配置
├── jest.config.js         # 测试配置
├── .github/               # CI/CD
└── README.md              # 文档
```

**步骤 5：启动开发环境**

```bash
# 安装依赖
cd network-topology-3d
npm install

# 启动开发模式
npm run dev

# 你会看到：
# ✔ Compiling...
# ✔ Build finished: network-topology-3d
# ✔ Watching for changes...
```

**步骤 6：配置本地 Grafana**

```bash
# 创建一个 docker-compose.yml 在插件目录旁边
```

```yaml
# docker-compose.yml
# 为什么这样写：挂载插件目录到 Grafana 容器，实现热加载
version: '3.8'

services:
  grafana:
    image: grafana/grafana:latest
    container_name: grafana-plugin-dev
    ports:
      - "3000:3000"
    environment:
      - GF_DEFAULT_APP_MODE=development  # 开启开发模式
      - GF_LOG_LEVEL=debug               # 详细日志
    volumes:
      # 挂载插件目录，Grafana 会自动检测
      - ./network-topology-3d:/var/lib/grafana/plugins/network-topology-3d
    restart: unless-stopped
```

```bash
# 启动 Grafana
docker-compose up -d

# 查看日志，确认插件被加载
docker-compose logs -f grafana | grep "plugin"
# 应看到：Registering plugin: my-company-network-topology-3d
```

**步骤 7：在 Grafana 中验证**

1. 打开浏览器，访问 `http://localhost:3000`
2. 登录（admin / admin）
3. 进入 **Configuration > Plugins**
4. 搜索 "network-topology-3d"
5. 应该能看到你的插件

---

## 16.3 开发你的第一个 Panel 插件

### 16.3.1 理解插件架构

```
┌─────────────────────────────────────────────┐
│              Grafana 前端                    │
│  ┌───────────────────────────────────────┐  │
│  │          Panel Plugin                 │  │
│  │  ┌─────────┐    ┌─────────────────┐  │  │
│  │  │ Options │    │   Components    │  │  │
│  │  │ (配置)   │───▶│ (React 渲染)    │  │  │
│  │  └─────────┘    └─────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│                     │                        │
│                     ▼                        │
│  ┌───────────────────────────────────────┐  │
│  │          Data Query                   │  │
│  │  (通过 Grafana API 查询数据源)        │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 16.3.2 配置插件元数据

```json
// src/plugin.json
// 为什么这样写：告诉 Grafana 这个插件的信息
{
  "$schema": "https://raw.githubusercontent.com/grafana/grafana/main/docs/sources/developers/plugins/plugin.schema.json",
  "type": "panel",                    // 插件类型：panel
  "name": "Network Topology 3D",       // 显示名称
  "id": "my-company-network-topology-3d-panel",  // 唯一 ID
  "info": {
    "description": "3D 网络拓扑可视化面板",
    "author": {
      "name": "My Company"
    },
    "keywords": ["network", "topology", "3d"],
    "logos": {
      "small": "img/logo-small.png",
      "large": "img/logo-large.png"
    },
    "links": [
      {"name": "GitHub", "url": "https://github.com/my-company/network-topology-3d"}
    ],
    "screenshots": [
      {"name": "Topology View", "path": "img/screenshot.png"}
    ],
    "version": "0.1.0",
    "updated": "2024-01-15"
  },
  // 支持的查询选项
  "queryOptions": {
    "maxDataPoints": true,
    "minInterval": true
  }
}
```

### 16.3.3 定义插件类型

```typescript
// src/types.ts
// 为什么这样写：定义插件的数据结构和配置项类型

// 网络设备节点
export interface NetworkNode {
  id: string;           // 唯一标识
  name: string;         // 显示名称
  type: 'switch' | 'router' | 'server' | 'firewall' | 'loadbalancer';
  status: 'online' | 'offline' | 'warning' | 'error';
  ip: string;           // IP 地址
  x?: number;           // 3D 坐标 X
  y?: number;           // 3D 坐标 Y
  z?: number;           // 3D 坐标 Z
  metrics?: {
    cpu: number;        // CPU 使用率
    memory: number;     // 内存使用率
    traffic: number;    // 流量
  };
}

// 网络连接线
export interface NetworkLink {
  source: string;       // 源节点 ID
  target: string;       // 目标节点 ID
  bandwidth: number;    // 带宽 (Mbps)
  utilization: number;  // 利用率 (%)
  status: 'up' | 'down' | 'degraded';
}

// 插件配置项
export interface TopologyOptions {
  backgroundColor: string;     // 背景色
  nodeSize: number;            // 节点大小
  showLabels: boolean;         // 显示标签
  autoRotate: boolean;         // 自动旋转
  layout: 'force' | 'hierarchical' | 'circular';  // 布局方式
  colorScheme: {
    online: string;            // 在线颜色
    offline: string;           // 离线颜色
    warning: string;           // 告警颜色
    error: string;             // 错误颜色
  };
}
```

### 16.3.4 实现主组件

```typescript
// src/components/App.tsx
// 为什么这样写：这是插件的核心渲染逻辑

import React, { useEffect, useRef } from 'react';
import { PanelProps } from '@grafana/data';
import { TopologyOptions, NetworkNode, NetworkLink } from '../types';

// 假设我们已经实现了一个 3D 渲染引擎
// 实际项目中可以使用 Three.js、D3.js 等库
import { Topology3DRenderer } from './Topology3DRenderer';

// PanelProps 是 Grafana 提供的通用属性接口
// 它包含了数据、配置、尺寸等信息
interface Props extends PanelProps<TopologyOptions> {}

export function App({ data, options, width, height }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Topology3DRenderer | null>(null);

  // 从 Grafana 的查询结果中提取节点和连接数据
  // 旁白：data.series 是 Grafana 标准化后的时序数据格式
  const nodes: NetworkNode[] = extractNodesFromSeries(data.series);
  const links: NetworkLink[] = extractLinksFromSeries(data.series);

  // 初始化 3D 渲染器
  useEffect(() => {
    if (containerRef.current && !rendererRef.current) {
      // 创建 3D 渲染引擎实例
      rendererRef.current = new Topology3DRenderer(containerRef.current);
    }
    return () => {
      // 清理资源，防止内存泄漏
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // 当数据或配置变化时更新渲染
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.update({
        nodes,
        links,
        options,
        width,
        height,
      });
    }
  }, [nodes, links, options, width, height]);

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        backgroundColor: options.backgroundColor || '#1b1b1b',
      }}
    />
  );
}

// 从时序数据中提取节点信息
// 旁白：这里假设数据源返回的格式是特定的
// 实际开发中需要根据你的数据源格式调整
function extractNodesFromSeries(series: any[]): NetworkNode[] {
  return series
    .filter(s => s.meta?.type === 'node')
    .map(s => ({
      id: s.fields[0].values[0],
      name: s.fields[1].values[0],
      type: s.fields[2].values[0],
      status: s.fields[3].values[0],
      ip: s.fields[4].values[0],
      metrics: {
        cpu: s.fields[5]?.values[0] || 0,
        memory: s.fields[6]?.values[0] || 0,
        traffic: s.fields[7]?.values[0] || 0,
      },
    }));
}

function extractLinksFromSeries(series: any[]): NetworkLink[] {
  return series
    .filter(s => s.meta?.type === 'link')
    .map(s => ({
      source: s.fields[0].values[0],
      target: s.fields[1].values[0],
      bandwidth: s.fields[2].values[0],
      utilization: s.fields[3].values[0],
      status: s.fields[4].values[0],
    }));
}
```

### 16.3.5 实现配置组件

```typescript
// src/components/TopologyOptions.tsx
// 为什么这样写：用户通过这个界面配置插件的外观和行为

import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { TopologyOptions } from '../types';

// StandardEditorProps 是 Grafana 提供的标准配置编辑器接口
export function TopologyOptionsEditor({
  value,
  onChange,
}: StandardEditorProps<TopologyOptions>) {
  return (
    <div>
      {/* 节点大小配置 */}
      <div className="gf-form">
        <label className="gf-form-label">节点大小</label>
        <input
          type="range"
          min={10}
          max={100}
          value={value.nodeSize || 30}
          onChange={(e) =>
            onChange({ ...value, nodeSize: parseInt(e.target.value, 10) })
          }
        />
      </div>

      {/* 布局方式选择 */}
      <div className="gf-form">
        <label className="gf-form-label">布局方式</label>
        <select
          value={value.layout || 'force'}
          onChange={(e) =>
            onChange({ ...value, layout: e.target.value as any })
          }
        >
          <option value="force">力导向布局</option>
          <option value="hierarchical">层次布局</option>
          <option value="circular">环形布局</option>
        </select>
      </div>

      {/* 状态颜色配置 */}
      <div className="gf-form">
        <label className="gf-form-label">在线颜色</label>
        <input
          type="color"
          value={value.colorScheme?.online || '#00ff00'}
          onChange={(e) =>
            onChange({
              ...value,
              colorScheme: { ...value.colorScheme, online: e.target.value },
            })
          }
        />
      </div>

      {/* 显示标签 */}
      <div className="gf-form">
        <label className="gf-form-label">显示标签</label>
        <input
          type="checkbox"
          checked={value.showLabels !== false}
          onChange={(e) =>
            onChange({ ...value, showLabels: e.target.checked })
          }
        />
      </div>

      {/* 自动旋转 */}
      <div className="gf-form">
        <label className="gf-form-label">自动旋转</label>
        <input
          type="checkbox"
          checked={value.autoRotate || false}
          onChange={(e) =>
            onChange({ ...value, autoRotate: e.target.checked })
          }
        />
      </div>
    </div>
  );
}
```

### 16.3.6 注册插件

```typescript
// src/module.ts
// 为什么这样写：这是 Grafana 加载插件时的入口文件

import { PanelPlugin } from '@grafana/data';
import { App } from './components/App';
import { TopologyOptionsEditor } from './components/TopologyOptions';
import { TopologyOptions } from './types';

// 创建并注册 Panel 插件
export const plugin = new PanelPlugin<TopologyOptions>(App)
  // 设置配置面板
  .setPanelOptions((builder) => {
    builder
      .addCustomEditor({
        id: 'topology-config',
        path: '',
        name: '拓扑配置',
        description: '配置 3D 拓扑图的外观和行为',
        editor: TopologyOptionsEditor,
      })
      // 添加标准选项（所有 Panel 插件都有的选项）
      .addTextInput({
        path: 'backgroundColor',
        name: '背景色',
        description: '拓扑图背景颜色',
        defaultValue: '#1b1b1b',
      });
  });
```

---

## 16.4 构建和测试

### 16.4.1 手把手：构建插件

```bash
# 开发模式（自动监听文件变化）
npm run dev

# 生产模式（构建优化后的版本）
npm run build

# 构建产物在 dist/ 目录
# dist/
# ├── module.js        # 编译后的插件代码
# ├── plugin.json      # 插件元数据
# ├── README.md        # 文档
# └── img/             # 图片资源
```

### 16.4.2 手把手：在本地测试

**方法 1：使用 Docker 热加载**

```bash
# 确保 docker-compose.yml 已经挂载了插件目录
docker-compose up -d

# 修改代码后，npm run dev 会自动重新构建
# 刷新 Grafana 页面即可看到效果
```

**方法 2：使用 Grafana 的插件测试页面**

Grafana 提供了一个专门的测试页面：`http://localhost:3000/plugins/test`

1. 进入 **Configuration > Plugins**
2. 找到你的插件
3. 点击 **Test** 按钮
4. 在测试页面中，可以模拟各种数据输入

### 16.4.3 手把手：编写自动化测试

```typescript
// src/components/App.test.tsx
// 为什么这样写：确保插件在各种数据条件下都能正常工作

import React from 'react';
import { render } from '@testing-library/react';
import { App } from './App';
import { PanelProps } from '@grafana/data';
import { TopologyOptions } from '../types';

// 创建模拟数据
const mockProps: PanelProps<TopologyOptions> = {
  data: {
    series: [
      {
        meta: { type: 'node' },
        fields: [
          { values: ['switch-01'] },         // id
          { values: ['核心交换机 A'] },       // name
          { values: ['switch'] },             // type
          { values: ['online'] },             // status
          { values: ['10.0.1.1'] },           // ip
        ],
      },
    ],
  },
  options: {
    backgroundColor: '#1b1b1b',
    nodeSize: 30,
    showLabels: true,
    autoRotate: false,
    layout: 'force',
    colorScheme: {
      online: '#00ff00',
      offline: '#ff0000',
      warning: '#ffff00',
      error: '#ff0000',
    },
  },
  width: 800,
  height: 600,
  // ... 其他必需的 Props
} as any;

describe('Network Topology 3D Panel', () => {
  it('renders without crashing', () => {
    const { container } = render(<App {...mockProps} />);
    expect(container).toBeInTheDocument();
  });

  it('renders with empty data', () => {
    const emptyProps = {
      ...mockProps,
      data: { series: [] },
    };
    const { container } = render(<App {...emptyProps as any} />);
    expect(container).toBeInTheDocument();
  });
});
```

```bash
# 运行测试
npm test
```

---

## 16.5 发布插件

### 16.5.1 手把手：发布到 Grafana 插件市场

**步骤 1：准备发布**

```bash
# 更新版本号
npm version patch  # 0.1.0 -> 0.1.1

# 构建生产版本
npm run build

# 检查构建产物
ls dist/
# 应该包含：module.js, plugin.json, README.md
```

**步骤 2：打包插件**

```bash
# 将插件打包为 ZIP
cd ..
zip -r network-topology-3d.zip network-topology-3d/dist/
```

**步骤 3：签名插件（可选但推荐）**

签名后的插件可以在 Grafana 中安全安装：

```bash
# 需要 Grafana 的 API Key
npx @grafana/sign-plugin \
  --grafana-token <YOUR_API_KEY> \
  --plugin-id my-company-network-topology-3d-panel
```

**步骤 4：提交到插件市场**

1. 访问 https://grafana.com/plugins
2. 登录你的 Grafana 账号
3. 点击 **Publish a plugin**
4. 填写插件信息并上传 ZIP

### 16.5.2 企业内部使用

```bash
# 在企业内部 Grafana 中安装未签名的插件
# 需要在 grafana.ini 中配置：
[plugins]
allow_loading_unsigned_plugins = my-company-network-topology-3d-panel

# Docker 环境通过环境变量配置
environment:
  - GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=my-company-network-topology-3d-panel
```

---

## 16.6 Before/After 对比

### Before：没有自定义插件

```
业务需求: "我们要在 Grafana 中展示 3D 网络拓扑"
解决方案:
  ❌ 用表格展示设备列表（无法展示连接关系）
  ❌ 用静态图片（无法实时更新状态）
  ❌ 用文字描述（不够直观）
```

### After：开发自定义插件

```
业务需求: "我们要在 Grafana 中展示 3D 网络拓扑"
解决方案:
  ✅ 3D 拓扑图，设备连接关系一目了然
  ✅ 设备状态颜色实时更新
  ✅ 可交互（旋转、缩放、点击查看详情）
  ✅ 与 Grafana 的其他面板共享同一数据源
```

---

## 16.7 常见开发问题

| 问题 | 原因 | 解决方案 |
|---|---|---|
| 插件不显示 | plugin.json 配置错误 | 检查 plugin.json 格式和 ID 唯一性 |
| 数据获取不到 | 数据格式不匹配 | 在 Grafana Explore 中验证数据格式 |
| 热加载不生效 | 插件路径未正确挂载 | 检查 Docker volume 挂载 |
| 样式异常 | CSS 命名冲突 | 使用 CSS Modules 或 styled-components |
| 性能问题 | 渲染次数过多 | 使用 React.memo 和 useMemo 优化 |
| 发布失败 | 插件 ID 重复 | 确保 ID 在 Grafana 生态中唯一 |

---

## 16.8 插件开发最佳实践

1. **从简单开始**：先实现一个能显示 Hello World 的插件，再逐步增加功能
2. **利用 Grafana SDK**：`@grafana/data` 和 `@grafana/ui` 提供了大量工具函数和组件
3. **关注性能**：Grafana Dashboard 可能同时加载多个面板，你的插件不能成为性能瓶颈
4. **处理边缘情况**：空数据、错误数据、超大数据集都要有合理的展示
5. **提供良好的配置体验**：插件的配置界面应该直观、易用
6. **编写文档和测试**：尤其是企业内部插件，文档和测试能降低维护成本

---

## 16.9 练习

1. 使用 `@grafana/create-plugin` 创建一个 Panel 插件脚手架
2. 修改插件使其显示一个简单的 "Hello, World!" 文本
3. 从 Grafana 的查询数据中读取一个指标并在插件中展示
4. 为插件添加一个配置项（如字体大小、颜色等）
5. 在本地 Docker 环境中调试插件并验证热加载
6. 尝试将插件打包并在另一个 Grafana 实例中安装
