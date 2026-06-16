# 第5章 bun test 与 Mock 机制

## 5.1 使用场景

### 单元测试：替代Jest

Bun内置的测试运行器bun test是Bun生态系统中最具吸引力的功能之一，它提供了一个与Jest高度兼容的测试框架，无需额外安装jest、@types/jest、ts-jest或babel-jest等依赖包。在传统的Node.js项目中，要搭建一个可用的TypeScript测试环境，开发者需要安装并配置jest、ts-jest、@types/jest、esbuild-jest或babel-jest等多个包，并且需要编写jest.config.js或jest.config.ts配置文件，指定transform映射、模块名称映射、测试环境等参数。而在Bun项目中，只需要运行bun test命令，所有配置都是零成本的——Bun原生支持TypeScript、JSX、CommonJS和ES模块，无需任何转译器或类型声明文件。这意味着从项目初始化到编写第一个测试用例的时间被大幅缩短，开发者可以将更多的精力集中在测试逻辑本身，而不是在工具链的配置上。这种零配置的开发体验对于新项目启动和快速原型开发尤为重要，开发者可以在几分钟内建立起完整的测试基础设施。

从性能角度来看，bun test的执行速度远超Jest。根据Bun官方团队发布的基准测试数据，对于一个包含1000个测试用例的中型项目，bun test的启动时间约为8毫秒，而Jest在相同项目上的启动时间约为800毫秒到2秒不等，这取决于项目中文件的数量和复杂度。在测试执行阶段，bun test利用其原生多线程架构，可以在约200毫秒内完成全部测试的执行，而Jest通常需要3到8秒才能完成相同的测试套件。这意味着bun test的整体测试周期（从启动到完成）通常比Jest快10到50倍，对于大型项目而言，这种性能差异会带来显著的开发体验提升。当一个开发者每天运行测试数十次时，每次节省的数秒累积起来就是大量的时间和精力，这种效率提升在紧张的项目周期中尤为宝贵。

迁移一个现有的Jest项目到bun test通常是一个相对直接的过程。首先，需要移除项目中与Jest相关的依赖包，包括jest、@types/jest、ts-jest、babel-jest、jest-environment-jsdom等。然后，删除jest.config.js或jest.config.ts配置文件，因为bun test不需要这些配置。接着，需要对测试文件中的导入语句进行调整——在Jest中，describe、it、expect、jest.mock等全局函数是自动可用的，不需要显式导入，而bun test同样提供了这些全局函数，并且行为与Jest高度一致。然而，在某些情况下，如果代码中使用了TypeScript的严格类型检查，可能需要从bun:test模块中显式导入这些函数以获得正确的类型推断。此外，如果项目中使用了jest.fn()、jest.spyOn()、jest.mock()等Mock API，需要将其替换为bun:test中对应的API，即mock()、spyOn()、mock.module()等。

下面是一个典型的Jest到bun test迁移示例。假设有一个使用Jest编写的测试文件：

```typescript
// Jest版本
import { sum, multiply } from './math';
import axios from 'axios';

jest.mock('axios');

describe('数学函数测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sum函数应正确计算两数之和', () => {
    expect(sum(1, 2)).toBe(3);
    expect(sum(-1, 1)).toBe(0);
    expect(sum(0, 0)).toBe(0);
    expect(sum(1.5, 2.5)).toBe(4);
  });

  test('multiply函数应正确计算两数之积', () => {
    expect(multiply(3, 4)).toBe(12);
    expect(multiply(-2, 3)).toBe(-6);
    expect(multiply(0, 5)).toBe(0);
  });

  test('axios.get应被正确调用', async () => {
    const mockData = { data: { id: 1, name: '测试' } };
    (axios.get as jest.Mock).mockResolvedValue(mockData);

    const result = await fetchUserData(1);
    expect(result).toEqual(mockData.data);
    expect(axios.get).toHaveBeenCalledWith('/api/users/1');
  });
});
```

迁移到bun test后的版本如下：

```typescript
// bun test版本
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { sum, multiply, fetchUserData } from './math';
import axios from 'axios';

mock.module('axios', () => ({
  get: mock(() => Promise.resolve({ data: { id: 1, name: '测试' } })),
}));

describe('数学函数测试', () => {
  beforeEach(() => {
    mock.restore();
  });

  test('sum函数应正确计算两数之和', () => {
    expect(sum(1, 2)).toBe(3);
    expect(sum(-1, 1)).toBe(0);
    expect(sum(0, 0)).toBe(0);
    expect(sum(1.5, 2.5)).toBe(4);
  });

  test('multiply函数应正确计算两数之积', () => {
    expect(multiply(3, 4)).toBe(12);
    expect(multiply(-2, 3)).toBe(-6);
    expect(multiply(0, 5)).toBe(0);
  });

  test('fetchUserData应正确获取用户数据', async () => {
    const result = await fetchUserData(1);
    expect(result).toEqual({ id: 1, name: '测试' });
  });
});
```

需要注意的是，bun test的mock.module()机制与Jest的jest.mock()在行为上有一些差异。jest.mock()使用自动提升（hoisting）机制，会将mock声明自动提升到文件顶部，而bun test的mock.module()则是一个普通的函数调用，需要在测试文件中按照正常的执行顺序放置。此外，bun test的mock.module()在模块模拟方面采用了更为底层的方式，它直接在Bun的模块解析层进行拦截，这意味着它能够模拟任何模块，包括Node.js内置模块和第三方包，而不需要像Jest那样使用特殊的模块映射配置。

在类型支持方面，bun test提供了完整的TypeScript类型定义。当从bun:test模块导入describe、test、expect等函数时，TypeScript能够自动推断参数类型和返回值类型。例如，test函数的回调函数可以自动推断done回调的类型，以及异步函数的Promise类型。expect函数提供了完整的类型链式调用支持，包括toBe、toEqual、toStrictEqual、toContain、toMatch、toThrow等匹配器，并且所有匹配器都具有正确的类型签名。

从Jest迁移到bun test的过程中，开发者还需要注意一些细节问题。第一个问题是关于全局变量的处理方式。在Jest中，describe、it、expect、jest等全局变量是自动注入到全局作用域中的，开发者不需要手动导入它们。然而在Bun中，虽然这些函数在运行时也是全局可用的，但为了获得TypeScript类型支持，建议从bun:test模块中显式导入。这意味着每个测试文件都需要添加一行import语句。虽然这增加了少量代码量，但也带来了好处：测试文件的依赖关系更加明确，代码审查时可以看到每个测试文件使用了哪些测试工具函数。第二个问题是关于匹配器的兼容性。Bun实现了Jest中绝大多数常用的匹配器，但一些较少使用的匹配器可能行为略有不同。例如，toStrictEqual匹配器在Bun和Jest中的行为差异就值得注意——Bun的toStrictEqual在检查对象类型时更加严格，会额外检查属性的可枚举性。第三个问题是关于异步测试的支持。Bun对异步测试的支持非常完善，支持async/await、Promise链、回调等多种异步模式。Bun的异步测试超时机制与Jest类似，但默认超时时间可能不同，建议在迁移时明确设置超时时间以避免测试在CI环境中意外超时。第四个问题是关于测试过滤和选择执行。Bun支持使用describe.only和test.only来仅执行特定的测试用例，也支持使用describe.skip和test.skip来跳过特定的测试用例。这些功能的使用方式与Jest完全一致，开发者不需要额外学习。此外，Bun还支持使用--filter标志来按模式过滤测试文件，以及使用--test-name-pattern标志来按测试名称模式过滤测试用例。

### API集成测试

Bun的bun test与Bun的内置HTTP服务器Bun.serve()相结合，为API集成测试提供了一个极为优雅的解决方案。在传统的Node.js测试环境中，开发者通常需要使用supertest或类似的库来发送HTTP请求并断言响应，同时还需要手动管理服务器的启动和关闭。而在Bun中，由于Bun.serve()是运行时的一部分，无需安装任何额外的依赖即可创建HTTP服务器，并且bun test的生命周期钩子（beforeAll、afterAll）可以无缝地管理服务器的生命周期。这种集成的深度使得开发者可以编写出既简洁又高效的API测试代码，不再需要在测试工具和HTTP客户端库之间切换上下文。

下面是一个完整的API集成测试示例。假设有一个使用Bun.serve()构建的REST API服务器：

```typescript
// server.ts
export function createServer(port: number = 3000) {
  return Bun.serve({
    port,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const method = request.method;

      if (method === 'GET' && url.pathname === '/api/users') {
        const users = [
          { id: 1, name: '张三', email: 'zhangsan@example.com' },
          { id: 2, name: '李四', email: 'lisi@example.com' },
        ];
        return new Response(JSON.stringify(users), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (method === 'GET' && url.pathname.startsWith('/api/users/')) {
        const id = parseInt(url.pathname.split('/')[3]);
        const user = { id, name: `用户${id}`, email: `user${id}@example.com` };
        return new Response(JSON.stringify(user), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (method === 'POST' && url.pathname === '/api/users') {
        const body = await request.json();
        const newUser = { id: Date.now(), ...body };
        return new Response(JSON.stringify(newUser), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not Found', { status: 404 });
    },
  });
}
```

对应的测试文件如下：

```typescript
// api.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createServer } from './server';

let server: ReturnType<typeof createServer>;
const BASE_URL = 'http://localhost:3001';

beforeAll(() => {
  server = createServer(3001);
});

afterAll(() => {
  server.stop();
});

describe('用户API集成测试', () => {
  test('GET /api/users 应返回用户列表', async () => {
    const response = await fetch(`${BASE_URL}/api/users`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0]).toHaveProperty('id');
    expect(body[0]).toHaveProperty('name');
    expect(body[0]).toHaveProperty('email');
  });

  test('GET /api/users/:id 应返回单个用户', async () => {
    const response = await fetch(`${BASE_URL}/api/users/42`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      id: 42,
      name: '用户42',
    });
  });

  test('POST /api/users 应创建新用户', async () => {
    const newUser = { name: '王五', email: 'wangwu@example.com' };

    const response = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject(newUser);
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('number');
  });

  test('访问不存在的路由应返回404', async () => {
    const response = await fetch(`${BASE_URL}/api/nonexistent`);
    expect(response.status).toBe(404);
  });
});
```

这种测试模式的优势在于其简洁性和自包含性。测试文件同时包含了服务器的创建、HTTP请求的发送和响应的断言，所有操作都在同一个Bun运行时中完成，没有额外的网络开销。Bun的fetch()函数是基于原生实现的，性能极高，并且与Bun.serve()共享底层的网络栈，这意味着测试中的HTTP请求实际上是在进程内部完成的，不需要经过真正的网络堆栈，从而进一步提升了测试速度。这种进程内通信机制是Bun API集成测试性能优越的关键因素之一。与传统的localhost网络通信相比，进程内通信避免了TCP/IP协议栈的开销、减少了数据拷贝次数、消除了网络延迟，使得API测试的执行速度接近于单元测试。

对于更复杂的API测试场景，例如需要测试身份认证、请求验证、错误处理等，可以扩展上述模式。可以在beforeAll钩子中创建测试用的身份令牌，在请求头中携带认证信息，并测试各种边缘情况。Bun的fetch()函数支持所有标准的HTTP功能，包括自定义请求头、请求体、重定向处理、Cookie管理等，足以应对大多数API测试需求。

需要注意的是，在并行测试中，每个测试文件在单独的Worker线程中运行，因此如果多个测试文件都创建了HTTP服务器，需要确保它们使用不同的端口，以避免端口冲突。一种常见的做法是使用端口0，让操作系统自动分配一个可用端口，然后通过Bun.serve()返回的server实例获取实际分配的端口号。

### 快照测试

快照测试是一种自动化测试技术，用于确保代码的输出不会发生意外变化。其工作原理是：首次运行时，将测试输出序列化为一个字符串（即快照），并将其保存到文件中；后续运行时，将当前输出与保存的快照进行比较，如果两者不匹配，则测试失败。快照测试特别适用于测试大型数据结构、UI组件的渲染输出、序列化结果等场景。

Bun test支持快照测试，通过expect(value).toMatchSnapshot()匹配器实现。当第一次运行包含toMatchSnapshot()的测试时，Bun会在测试文件所在目录下创建一个__snapshots__目录，并在其中生成一个以测试文件命名的快照文件（例如math.test.ts.snap）。快照文件中包含了每个快照的标识符和序列化后的值。当后续运行测试时，Bun会将当前值与快照文件中的值进行比较，如果一致则测试通过，否则测试失败并显示差异。

下面是一个快照测试的示例：

```typescript
// snapshot.test.ts
import { describe, test, expect } from 'bun:test';

interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
  roles: string[];
  metadata: Record<string, unknown>;
}

function createUser(id: number): User {
  return {
    id,
    name: `用户${id}`,
    email: `user${id}@example.com`,
    createdAt: new Date('2024-01-01'),
    roles: ['admin', 'editor'],
    metadata: {
      lastLogin: null,
      preferences: {
        theme: 'dark',
        language: 'zh-CN',
        notifications: true,
      },
    },
  };
}

describe('快照测试示例', () => {
  test('createUser应生成一致的输出', () => {
    const user = createUser(1);
    expect(user).toMatchSnapshot();
  });

  test('用户配置信息快照', () => {
    const user = createUser(2);
    expect(user.metadata.preferences).toMatchSnapshot();
  });
});
```

当运行bun test时，会生成如下内容的快照文件：

```
exports[`快照测试示例 > createUser应生成一致的输出 1`] = `
{
  "createdAt": "2024-01-01T00:00:00.000Z",
  "email": "user1@example.com",
  "id": 1,
  "metadata": {
    "lastLogin": null,
    "preferences": {
      "language": "zh-CN",
      "notifications": true,
      "theme": "dark"
    }
  },
  "name": "用户1",
  "roles": [
    "admin",
    "editor"
  ]
}
`;

exports[`快照测试示例 > 用户配置信息快照 1`] = `
{
  "language": "zh-CN",
  "notifications": true,
  "theme": "dark"
}
`;
```

与Jest的快照测试相比，Bun的快照测试在以下方面存在差异。首先，Bun的快照序列化使用Bun内置的格式化器，而Jest使用pretty-format包。Bun的格式化器在输出格式上略有不同，例如对象属性的排序可能不同，这可能导致从Jest迁移快照文件时需要先更新所有快照。其次，Bun的快照文件格式与Jest的格式不兼容，不能直接复制使用。Jest使用exports[`测试名`]的格式，而Bun也使用了类似的格式，但在某些边缘情况下存在差异。第三，Bun不支持内联快照（toMatchInlineSnapshot），这是一个已知的API缺口。第四，Bun的快照更新机制通过bun test --update-snapshots命令实现，与Jest的jest --updateSnapshot类似。

快照测试的最佳实践包括：快照文件应该纳入版本控制，因为它们是对代码输出的预期记录；快照应该保持小巧和专注，避免生成巨大的快照文件；当快照更新时，应该仔细审查差异，确保变更是有意为之的；快照测试不应该作为唯一的测试手段，而应该与传统的断言式测试配合使用。在实际项目中，快照测试最常见的误用场景是将快照作为验证组件正确性的唯一手段。快照测试只能检测到输出发生了变化，但不能判断变化后的输出是否正确。因此，快照测试应该与传统的断言式测试配合使用，断言测试验证逻辑正确性，快照测试检测意外变化。另一种常见的误用场景是生成过大的快照文件。当一个快照文件包含数百行甚至数千行内容时，代码审查变得非常困难，审查者很难发现快照中的细微变化。建议将大型快照拆分为多个小型快照，或者使用toMatchObject、toContain等更精确的匹配器来替代快照测试。

### DOM测试与happy-dom

在Bun环境中进行DOM测试时，需要使用DOM实现来模拟浏览器环境。Bun官方推荐使用happy-dom作为DOM实现，因为happy-dom是用TypeScript编写的，性能比jsdom更好，并且与Bun的架构更加契合。happy-dom是一个轻量级的DOM实现，实现了Web标准的子集，包括DOM Core、HTML DOM、CSS样式计算、事件处理等核心功能。

在Bun中启用happy-dom只需要在测试文件中添加一行特殊的注释或导入即可。Bun通过一种名为"环境指令"（environment pragma）的机制来指定测试环境。在测试文件的顶部添加// @happy-dom注释，Bun就会自动使用happy-dom作为DOM环境来执行该文件。或者，也可以在bunfig.toml配置文件中设置默认的测试环境。

下面是一个使用happy-dom进行DOM测试的示例：

```typescript
// @happy-dom
import { describe, test, expect } from 'bun:test';

describe('DOM操作测试', () => {
  test('创建和操作DOM元素', () => {
    const div = document.createElement('div');
    div.textContent = 'Hello, Bun!';
    div.className = 'greeting';
    div.id = 'main-greeting';

    expect(div.tagName).toBe('DIV');
    expect(div.textContent).toBe('Hello, Bun!');
    expect(div.className).toBe('greeting');
    expect(div.id).toBe('main-greeting');
    expect(div.innerHTML).toBe('Hello, Bun!');
  });

  test('DOM事件处理', () => {
    const button = document.createElement('button');
    let clickCount = 0;

    button.addEventListener('click', () => {
      clickCount++;
    });

    button.click();
    expect(clickCount).toBe(1);

    button.click();
    button.click();
    expect(clickCount).toBe(3);
  });

  test('CSS样式操作', () => {
    const element = document.createElement('div');
    element.style.color = 'red';
    element.style.fontSize = '16px';
    element.style.backgroundColor = 'blue';

    expect(element.style.color).toBe('red');
    expect(element.style.fontSize).toBe('16px');
    expect(element.style.backgroundColor).toBe('blue');
    expect(element.style.cssText).toContain('color: red');
    expect(element.style.cssText).toContain('font-size: 16px');
  });

  test('DOM查询方法', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <ul id="list">
        <li class="item">项目1</li>
        <li class="item">项目2</li>
        <li class="item">项目3</li>
      </ul>
    `;

    document.body.appendChild(container);

    const list = document.getElementById('list');
    expect(list).not.toBeNull();
    expect(list!.tagName).toBe('UL');

    const items = document.querySelectorAll('.item');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe('项目1');
    expect(items[1].textContent).toBe('项目2');
    expect(items[2].textContent).toBe('项目3');

    const firstItem = document.querySelector('.item');
    expect(firstItem?.textContent).toBe('项目1');
  });
});
```

happy-dom与jsdom的主要差异体现在以下几个方面。在API覆盖率方面，jsdom实现时间更长，对Web标准的覆盖更全面，特别是在一些边缘API（如SVG、Canvas、History API、Storage API等）方面，jsdom的支持更为完善。happy-dom则专注于最常用的DOM API，覆盖了大约80%到90%的常用功能，但在一些较少使用的API上可能存在缺失。在性能方面，happy-dom通常比jsdom快2到5倍，这主要是因为happy-dom使用TypeScript编写，采用了更高效的数据结构和算法，并且针对Bun运行时进行了优化。在兼容性方面，happy-dom与Bun的集成更加自然，不需要额外的配置或垫片，而jsdom在Bun中运行可能需要一些额外的设置。

如果项目中需要使用jsdom而非happy-dom，可以通过// @jsdom注释来指定。不过需要注意的是，jsdom在Bun中的运行可能不如在Node.js中稳定，因为jsdom依赖一些Node.js特有的API和行为，而Bun在某些实现细节上可能与Node.js存在差异。

针对DOM测试中可能遇到的典型问题，这里提供一些具体的解决方案。第一个问题是关于事件处理的差异。happy-dom的事件系统实现了DOM事件规范的核心功能，但在事件传播的某些细节上与浏览器行为存在差异。例如，happy-dom对事件捕获阶段的支持有限，某些事件在捕获阶段可能不会按预期触发。解决这个问题的方法是避免在测试中依赖事件捕获阶段的行为，或者使用disptachEvent方法手动触发事件。第二个问题是关于样式计算的差异。happy-dom的getComputedStyle实现与浏览器的CSS计算存在差异，特别是在处理CSS继承、级联和简写属性时。如果测试需要验证精确的样式计算结果，建议使用内联样式而非CSS类，因为内联样式在happy-dom中的行为更加可预测。第三个问题是关于布局信息的差异。happy-dom不实现浏览器的布局引擎，因此getBoundingClientRect、offsetWidth、offsetHeight等布局相关API返回的值可能不准确。对于需要验证布局信息的测试，建议使用E2E测试工具（如Playwright）在真实浏览器中运行。第四个问题是关于Canvas和SVG的支持。happy-dom对Canvas API和SVG的支持有限，如果测试涉及这些技术，建议将相关的渲染逻辑与业务逻辑分离，在测试中只验证业务逻辑，或者使用专门的Canvas/SVG测试工具。

### 基准测试

Bun test内置了基准测试功能，通过bench()函数实现。bench()与test()类似，但专门用于测量代码的性能。bench()函数会多次执行回调函数，并统计每次执行的时间，最终输出统计结果，包括平均执行时间、最小执行时间、最大执行时间、执行次数等指标。

下面是一个基准测试的示例：

```typescript
import { bench, describe } from 'bun:test';

describe('字符串拼接性能对比', () => {
  bench('使用+运算符', () => {
    let result = '';
    for (let i = 0; i < 100; i++) {
      result = 'Hello' + ' ' + 'World' + '!';
    }
    return result;
  });

  bench('使用数组join', () => {
    let result = '';
    for (let i = 0; i < 100; i++) {
      result = ['Hello', 'World', '!'].join(' ');
    }
    return result;
  });

  bench('使用模板字符串', () => {
    let result = '';
    for (let i = 0; i < 100; i++) {
      result = `${'Hello'} ${'World'}${'!'}`;
    }
    return result;
  });
});

describe('数组操作性能对比', () => {
  const largeArray = Array.from({ length: 100000 }, (_, i) => i);

  bench('for循环遍历', () => {
    let sum = 0;
    for (let i = 0; i < largeArray.length; i++) {
      sum += largeArray[i];
    }
    return sum;
  });

  bench('forEach遍历', () => {
    let sum = 0;
    largeArray.forEach(item => {
      sum += item;
    });
    return sum;
  });

  bench('reduce方法', () => {
    return largeArray.reduce((acc, item) => acc + item, 0);
  });
});
```

运行bun test时会输出类似如下的基准测试结果：

```
bun test v1.x.x

  ✓ 字符串拼接性能对比 > 使用+运算符 [50.2ms] 19980 iterations
  ✓ 字符串拼接性能对比 > 使用数组join [82.1ms] 12180 iterations
  ✓ 字符串拼接性能对比 > 使用模板字符串 [48.5ms] 20620 iterations
  ✓ 数组操作性能对比 > for循环遍历 [2.1ms] 1 iteration
  ✓ 数组操作性能对比 > forEach遍历 [5.3ms] 1 iteration
  ✓ 数组操作性能对比 > reduce方法 [4.8ms] 1 iteration
```

bench()函数在内部会自动决定需要执行多少次迭代才能获得稳定的统计结果。对于非常快的操作（如字符串拼接），bench()会执行成千上万次迭代；对于较慢的操作（如大型数组遍历），则执行较少的迭代。bench()使用高精度计时器来测量时间，精度可达纳秒级别。

基准测试的使用场景包括：比较不同算法或实现的性能差异；检测代码变更是否引入了性能回退；为性能优化工作提供数据支持；在代码审查中验证性能相关的修改。需要注意的是，基准测试应该作为一个参考指标，而不是绝对真理，因为测试结果可能受到系统负载、CPU频率缩放、垃圾回收等多种因素的影响。

基准测试在实践中有一些重要的注意事项。第一，基准测试需要足够多的迭代次数才能获得稳定的统计结果。对于执行时间极短的操作，可能需要数十万次迭代才能消除偶然误差。Bun的bench()函数会自动调整迭代次数，但开发者也可以手动指定迭代次数来获得更精确的结果。第二，基准测试应该在相对稳定的环境中运行。CPU频率缩放、后台进程、垃圾回收等因素都会影响基准测试的结果。建议在运行基准测试时关闭不必要的后台程序，并将CPU电源管理设置为高性能模式。第三，基准测试的结果应该以相对值而非绝对值来解读。由于硬件和系统环境的差异，不同机器上的基准测试绝对数值可能差异很大，但同一次运行中的相对比较（如算法A比算法B快多少）具有更高的参考价值。第四，基准测试应该关注趋势而非单次结果。在代码演进过程中，定期运行基准测试并记录结果，可以及时发现性能回退。Bun的bench()函数输出中包含详细的统计信息，包括平均值、最小值和最大值，这些信息可以帮助判断性能变化是否在正常波动范围内。

### 使用场景对比表

| 特性 | bun test | Jest | Vitest |
|------|----------|------|--------|
| 启动时间 | 约8ms | 800ms-2s | 100-300ms |
| 1000个测试执行时间 | 约200ms | 3-8s | 500ms-2s |
| TypeScript原生支持 | 是（零配置） | 需要ts-jest或babel | 是（零配置） |
| JSX支持 | 是 | 需要配置 | 是 |
| ES模块支持 | 原生 | 需要配置 | 原生 |
| 内置Mock | mock() / spyOn() | jest.fn() / jest.spyOn() | vi.fn() / vi.spyOn() |
| 模块Mock | mock.module() | jest.mock() | vi.mock() |
| 快照测试 | 支持（有限） | 完整支持 | 完整支持 |
| 内联快照 | 不支持 | 支持 | 支持 |
| 自定义匹配器 | 支持 | 支持 | 支持 |
| DOM环境 | happy-dom / jsdom | jest-environment-jsdom | jsdom / happy-dom |
| 基准测试 | 内置bench() | 需要第三方库 | 内置bench() |
| 并行执行 | 原生多线程 | worker_threads | worker_threads |
| 代码覆盖率 | 内置 | 需要babel插件 | 内置 |
| 监视模式 | 支持 | 支持 | 支持 |
| 配置文件 | bunfig.toml（可选） | jest.config.js（必需） | vite.config.ts（可选） |
| 依赖安装 | 无（Bun内置） | 10+个包 | 5+个包 |
| CI环境友好度 | 优秀（无需安装） | 一般 | 良好 |

从对比表可以看出，bun test在性能方面具有显著优势，特别是在启动时间和测试执行速度方面。对于大型项目，这种性能差异可以大幅缩短测试反馈周期，提升开发效率。然而，bun test在某些高级功能方面（如内联快照、自定义测试环境等）的覆盖不如Jest和Vitest全面，因此在选择测试框架时需要根据项目需求进行权衡。

在选择测试框架时，除了考虑功能覆盖和性能指标外，还需要考虑团队的技术栈和现有的测试基础设施。对于已经深度使用Jest生态系统的项目，迁移到bun test需要评估迁移成本和收益。迁移成本包括修改测试代码的时间成本、团队学习新工具的学习成本、以及可能出现的兼容性问题排查成本。迁移收益包括测试执行速度的提升、配置复杂度的降低、以及CI资源消耗的减少。对于大多数项目而言，迁移收益远大于迁移成本，特别是对于那些测试执行时间较长的大型项目。对于新项目，如果已经选择Bun作为主要运行时，那么bun test显然是测试框架的最佳选择。它不仅提供了零配置的测试体验，还与Bun的其他内置功能（如Bun.serve、Bun.file等）深度集成，提供了其他测试框架无法比拟的开发体验。对于需要与Vite生态集成的项目，Vitest可能是更好的选择。Vitest可以复用Vite的配置和插件，减少重复配置。同时，Vitest在API覆盖面上更广，对Jest的兼容性更高，特别是在定时器模拟和模块模拟方面。但需要注意的是，Vitest依赖于Vite和esbuild，这意味着项目中需要安装额外的依赖包，而且Vitest的启动速度和执行速度虽然比Jest快，但仍然慢于bun test。

## 5.2 实现原理

### bun:test模块内部架构

bun:test模块是Bun运行时中一个深度集成的组件，其实现跨越了Zig和C++两个层次，并与Bun的JavaScript引擎JavaScriptCore（WebKit的JavaScript引擎）紧密协作。理解bun:test的内部架构，有助于开发者更好地掌握其性能优势的来源，以及在特定场景下的行为特点。

在最高层次上，bun:test模块由以下几个核心组件构成。第一个组件是测试调度器（Test Scheduler），它负责管理整个测试生命周期，包括测试文件的发现、测试套件的组织、测试用例的调度和执行。测试调度器运行在主线程中，使用Bun的文件系统API来扫描测试文件（默认匹配*.test.{ts,tsx,js,jsx}、*_test.{ts,tsx,js,jsx}、*.spec.{ts,tsx,js,jsx}等模式），并根据文件路径对测试进行分组。

第二个组件是Worker线程池（Worker Pool）。Bun的测试执行模型是基于原生线程的并行架构。当测试调度器发现测试文件后，它会将这些文件分发到一个Worker线程池中执行。每个Worker线程运行在独立的操作系统线程中，拥有自己的JavaScriptCore堆栈和事件循环。这种架构与Jest的worker_threads模型类似，但由于Bun使用原生线程而非Node.js的worker_threads，因此线程创建和通信的开销更低。Worker线程池的大小默认等于CPU核心数，但可以通过--test-threads标志进行配置。

第三个组件是JavaScript API层，即开发者直接使用的describe、test、expect、mock等函数。这一层是用Zig编写的，通过JavaScriptCore的FFI（Foreign Function Interface）暴露给JavaScript。每个函数在Zig中都有对应的实现，负责处理参数验证、状态管理、结果收集等任务。例如，test()函数在Zig中的实现会创建一个测试用例对象，将其注册到当前测试套件中，并将其状态报告给测试调度器。

第四个组件是匹配器系统（Matcher System），即expect()函数返回的对象及其上的各种匹配方法（toBe、toEqual、toContain等）。匹配器系统的实现在Zig层面，通过JavaScriptCore的Proxy机制或直接的方法绑定来提供链式调用的API。每个匹配器方法都包含了对实际值和期望值的比较逻辑，以及在比较失败时生成详细错误信息的能力。

第五个组件是快照管理系统（Snapshot Management System），负责快照的创建、序列化、比较和更新。快照管理系统在首次运行测试时生成快照文件，在后续运行中加载快照并与当前值进行比较，在更新模式下重新生成快照文件。

第六个组件是覆盖率收集器（Coverage Collector）。当启用覆盖率收集时（通过--coverage标志），Bun会在每个Worker线程中注入覆盖率仪器代码，收集代码执行的行号、分支覆盖等信息。覆盖率数据的收集依赖于JavaScriptCore的调试API和Bun自定义的代码仪器化机制。

测试的生命周期如下。当用户运行bun test命令时，首先初始化测试调度器，扫描指定的测试目录或文件。然后，调度器根据文件数量创建一个Worker线程池。每个Worker线程被分配一个或多个测试文件，并开始执行。在每个Worker线程中，测试文件被加载到JavaScriptCore引擎中执行，这会触发describe、test等调用，从而注册测试用例。Worker线程按照嵌套顺序执行测试用例，先执行外层的beforeAll，然后依次执行每个describe块中的beforeEach、测试用例、afterEach，最后执行afterAll。在每个测试用例执行前后，Worker线程会收集测试结果（通过、失败、跳过等），并将其发送回主线程的调度器。调度器汇总所有Worker线程的结果，并在控制台输出测试报告。

关于测试执行顺序，Bun遵循了一套明确的规则。首先，describe块可以无限嵌套，但为了代码可读性，建议嵌套层次不超过三层。外层describe块的beforeAll钩子在内层describe块的所有测试之前执行。内层describe块的beforeAll钩子在该describe块内的测试之前执行。beforeEach钩子的执行顺序是从外层到内层逐层执行。afterEach钩子的执行顺序是从内层到外层逐层执行。这种嵌套规则与Jest完全一致，确保了从Jest迁移时测试行为的一致性。Bun还支持describe块的异步初始化，即在describe块的回调函数中可以使用异步操作来准备测试环境。Bun会在执行describe块内的测试之前等待异步初始化完成。这种机制特别适用于需要在测试之前建立数据库连接、加载配置文件或初始化外部服务的场景。

### Jest兼容层

Bun的测试运行器设计了一个Jest兼容层，使得大量现有的Jest测试代码可以在不做修改或仅做少量修改的情况下在Bun中运行。这个兼容层位于bun:test模块的内部，通过将Jest的全局API映射到Bun自己的实现上来实现兼容性。

从架构角度来看，兼容层主要处理以下几个方面的映射。首先是全局API的映射。在Jest中，describe、test/it、expect、beforeAll、afterAll、beforeEach、afterEach等函数是全局可用的，不需要导入。Bun同样将这些函数设置为全局变量，因此大部分现有的Jest测试代码可以直接运行。然而，为了获得更好的类型支持，Bun也允许从bun:test模块显式导入这些函数。

其次是Mock API的映射。Jest提供了jest.fn()、jest.spyOn()、jest.mock()、jest.clearAllMocks()等一系列Mock API。Bun的兼容层将这些API映射到bun:test的mock()、spyOn()、mock.module()等函数。映射关系如下表所示：

| Jest API | Bun API | 说明 |
|----------|---------|------|
| jest.fn() | mock() | 创建Mock函数，行为基本相同 |
| jest.fn(impl) | mock(impl) | 带实现的Mock函数 |
| jest.spyOn(obj, method) | spyOn(obj, method) | 监视对象方法 |
| jest.mock(module, factory) | mock.module(module, factory) | 模块级Mock |
| jest.unmock(module) | mock.module(module, undefined) | 取消模块Mock |
| jest.clearAllMocks() | mock.restore() | 清除所有Mock状态 |
| jest.resetAllMocks() | mock.restore() | 重置所有Mock |
| jest.restoreAllMocks() | mock.restore() | 恢复所有原始实现 |
| jest.useFakeTimers() | 不支持 | 需要使用第三方库 |
| jest.setTimeout() | 不支持 | 使用bun:test配置 |
| jest.requireActual() | 不支持 | 需要直接import |

第三是匹配器API的映射。Bun实现了Jest中大部分常用的匹配器，包括toBe()、toEqual()、toStrictEqual()、toBeNull()、toBeUndefined()、toBeDefined()、toBeTruthy()、toBeFalsy()、toBeGreaterThan()、toBeGreaterThanOrEqual()、toBeLessThan()、toBeLessThanOrEqual()、toContain()、toContainEqual()、toHaveLength()、toMatch()、toMatchObject()、toThrow()、toThrowError()等。对于这些匹配器，Bun的行为与Jest基本一致，但在一些边缘情况下可能存在细微差异。

兼容层的实现策略是"尽可能兼容，但有明确文档的差异"。Bun团队认识到，完全的API兼容性是几乎不可能实现的，因为底层运行时（JavaScriptCore vs V8）和语言实现（Zig/C++ vs Node.js/C++）存在根本性的差异。因此，Bun采取了务实的态度：覆盖95%以上的常用API，对于无法实现的API提供清晰的替代方案和文档说明。这种务实的兼容策略意味着开发者在迁移测试时不需要修改大部分测试代码，但需要了解少数不兼容API的替代方案。在实际迁移项目中，最常见的兼容性问题涉及jest.mock的使用、jest.useFakeTimers的使用和jest.requireActual的使用。这三个API的替代方案已经在前面章节中详细讨论过。对于其他不常用的Jest API，如jest.isolateModules、jest.retryTimes等，由于在项目中使用频率较低，迁移时的影响相对有限。

### Mock函数拦截机制

Bun的Mock函数机制是bun:test模块的核心功能之一，其实现基于JavaScriptCore引擎的底层拦截能力。理解Mock函数的内部工作机制，有助于开发者更有效地使用Mock功能，并理解其限制。

mock()函数是创建Mock函数的主要方式。当调用mock()时，Bun会在JavaScriptCore层面创建一个特殊的函数对象，这个对象具有以下特性。第一，它是一个可调用的函数，可以像普通函数一样被调用。第二，它维护了调用历史记录，包括每次调用的参数（calls）、返回值（results）和this上下文（instances）。第三，它允许自定义实现，通过mock(() => impl)的形式传入一个替代实现。第四，它支持链式调用和返回值控制，如mockFn.mockReturnValue()、mockFn.mockResolvedValue()、mockFn.mockImplementation()等方法。

Mock函数拦截机制的实现依赖于JavaScriptCore的元编程能力。具体来说，Bun在Zig层面创建了一个C++级别的函数包装器，这个包装器在JavaScriptCore中注册为一个原生函数。当这个原生函数被调用时，它会执行以下操作：

第一步，记录调用信息。在函数被调用时，拦截器会记录调用时传入的参数数组（arguments对象）、this指向、以及调用时间戳。这些信息被存储在一个内部的数据结构中，可以通过mockFn.mock.calls、mockFn.mock.instances和mockFn.mock.results属性访问。

第二步，执行自定义实现。如果用户通过mock(impl)提供了自定义实现，拦截器会调用这个实现，并将返回值存储在results中。如果没有提供自定义实现，拦截器默认返回undefined。

第三步，处理特殊配置。如果用户通过mockFn.mockReturnValue()或mockFn.mockResolvedValue()等设置了特殊的返回值配置，拦截器会在调用自定义实现之前检查这些配置，并优先使用配置的返回值。

第四步，执行完毕后，拦截器返回给调用者。整个过程是同步的，不会引入额外的异步延迟。

spyOn()函数的实现与mock()类似，但多了一个额外的步骤：它需要替换目标对象上的方法。当调用spyOn(obj, method)时，Bun会执行以下操作：

第一步，获取原始方法。Bun会从目标对象上获取指定的方法，并保存其引用以便后续恢复。

第二步，创建Mock函数。Bun会创建一个新的Mock函数，这个函数与原始函数具有相同的签名。

第三步，替换对象上的方法。Bun将目标对象上的原始方法替换为Mock函数，使得所有对该方法的调用都被拦截。

第四步，在Mock函数内部，spyOn默认会调用原始实现（与Jest的行为一致），但也可以通过mockImplementation()等方式改变行为。

当调用mock.restore()时，所有通过spyOn创建的Mock都会被恢复为原始实现，所有通过mock()创建的Mock的调用历史都会被清空。

mock.module()函数的实现机制与mock()和spyOn()完全不同。mock.module()在Bun的模块解析层面工作，而不是在函数调用层面。当调用mock.module('axios', factory)时，Bun会在其模块缓存中注册一个自定义的模块解析规则。此后，当任何代码通过import或require导入axios模块时，Bun的模块解析器会检查这个注册表，如果发现匹配的规则，则返回factory函数的返回值，而不是实际加载axios包。

这种模块级别的Mock机制与Jest的jest.mock()在实现上存在重要差异。Jest的jest.mock()使用自动提升（hoisting）机制，通过Babel插件将mock声明移动到文件顶部，在模块加载之前执行。而Bun的mock.module()不依赖任何转译器，它直接在运行时层面进行拦截，因此不需要hoisting。这意味着在Bun中，mock.module()可以在文件中的任何位置调用，只要在导入被Mock的模块之前执行即可。在实际使用中，建议将mock.module()调用放在文件顶部、import语句之前，这样可以确保Mock在模块加载之前生效，避免因模块缓存导致的Mock失效问题。

### 快照比较算法

Bun的快照测试实现包含两个核心算法：序列化算法和比较算法。

序列化算法的任务是将任意JavaScript值转换为一个字符串表示。Bun使用其内置的格式化器（Bun.inspect()的底层实现）来进行序列化。这个格式化器与Jest使用的pretty-format包在行为上存在一些差异。Bun的序列化算法具有以下特点：

第一，它能够处理各种JavaScript数据类型，包括基本类型、对象、数组、Map、Set、Date、RegExp、Error、Promise、TypedArray等。对于每种类型，格式化器都有专门的序列化逻辑。

第二，它采用缩进格式输出，使得快照文件具有良好的可读性。默认缩进为2个空格。

第三，它能够处理循环引用。当检测到循环引用时，格式化器会使用[Circular]标记来表示，而不是陷入无限递归。

第四，它对对象属性的排序与Jest不同。Bun按照属性名的字符串顺序排序，而Jest按照属性定义的顺序排序。这是导致Bun和Jest快照格式不兼容的主要原因之一。

第五，它会对一些特殊值进行规范化处理。例如，Date对象会被序列化为ISO 8601字符串格式，NaN和Infinity会被序列化为字符串表示。

比较算法的任务是将当前序列化后的值与快照文件中保存的值进行比较。Bun的比较算法相对简单直接：它使用字符串精确匹配。如果当前序列化后的字符串与快照文件中的字符串完全相同，则测试通过；否则测试失败。

当测试失败时，Bun会输出详细的差异信息。差异信息的生成使用了一种类似于diff算法的实现，能够显示两个字符串之间的逐行差异。输出格式类似于Unix的diff命令，使用+和-符号表示新增和删除的行。

当使用bun test --update-snapshots（或简写为bun test -u）运行时，Bun会进入快照更新模式。在这种模式下，比较算法被跳过，所有快照都会被重新生成。Bun会遍历所有测试文件，重新执行包含toMatchSnapshot()的测试用例，并将当前值序列化后写入新的快照文件。旧的快照文件会被覆盖。

### 并行执行模型

Bun test的并行执行模型是其性能优势的关键来源。这个模型基于以下设计原则：

第一，文件级隔离。Bun将每个测试文件视为一个独立的工作单元，在单独的Worker线程中执行。这与Jest的默认行为一致，也是实现并行的基础。文件级隔离意味着每个测试文件都有自己的全局作用域、模块缓存和事件循环，测试文件之间的状态不会相互干扰。

第二，原生线程。Bun使用操作系统原生线程（pthreads或Windows线程）来创建Worker线程池，而不是使用Node.js的worker_threads模块。原生线程的创建和通信开销更低，特别是在大量小测试文件的场景下，这种优势更加明显。

第三，共享无状态。Worker线程之间不共享任何可变状态。所有通信都通过主线程进行，主线程负责分发测试文件、收集结果和输出报告。这种设计消除了锁竞争和同步开销，使得并行扩展几乎是线性的。

第四，动态负载均衡。测试调度器使用动态负载均衡策略来分配测试文件。当某个Worker线程完成了当前文件的执行后，调度器会立即为其分配下一个文件，而不是预先将所有文件分配给所有Worker。这种策略能够适应不同测试文件执行时间的不均匀性，最大化CPU利用率。

第五，智能排序。在分配测试文件之前，调度器会根据文件的大小、历史执行时间等信息进行智能排序，将预计执行时间较长的文件优先分配，以便在最终阶段减少空闲等待时间。

Worker线程的通信机制基于Bun内部的消息传递系统。当Worker线程完成一个测试文件的执行后，它会将测试结果序列化为一个消息，通过一个共享的环形缓冲区（ring buffer）发送给主线程。主线程异步地读取这些消息，并更新测试报告。这种通信机制是零拷贝的，不需要额外的内存分配或序列化/反序列化操作。

需要注意的是，虽然测试文件之间是并行的，但单个测试文件内部的测试用例是顺序执行的。这是设计上的选择，因为同一个文件内的测试用例通常共享状态（如beforeAll中创建的数据库连接、服务器实例等），顺序执行可以避免竞态条件。

## 5.3 潜在风险与优化

### Jest API覆盖缺口

尽管Bun的测试运行器在API兼容性方面做了大量工作，但与Jest相比仍然存在一些API覆盖缺口。了解这些缺口对于从Jest迁移的项目至关重要，可以避免在迁移过程中遇到意外的问题。

以下是Bun test中已知的API缺口及其替代方案的详细列表：

| 缺失的Jest API | Bun中的状态 | 替代方案 |
|----------------|-------------|----------|
| jest.useFakeTimers() | 不支持 | 使用第三方库如@sinonjs/fake-timers |
| jest.setTimeout() | 不支持 | 通过bunfig.toml配置全局超时 |
| jest.requireActual() | 不支持 | 在mock.module之前先保存原始模块引用 |
| jest.retryTimes() | 不支持 | 需要手动实现重试逻辑 |
| jest.createMockFromModule() | 不支持 | 使用mock.module配合自动模拟 |
| jest.replaceProperty() | 不支持 | 使用Object.defineProperty |
| toMatchInlineSnapshot() | 不支持 | 使用toMatchSnapshot()替代 |
| toThrowErrorMatchingSnapshot() | 不支持 | 使用try-catch + toMatchSnapshot() |
| toThrowErrorMatchingInlineSnapshot() | 不支持 | 手动断言错误消息 |
| expect.addSnapshotSerializer() | 不支持 | 暂无替代方案 |
| expect.extend() | 支持有限 | 使用自定义辅助函数 |
| test.concurrent() | 不支持 | 使用Promise.all手动实现 |
| test.each() | 支持有限 | 使用数组遍历 |
| describe.each() | 支持有限 | 使用数组遍历 |
| jest.isolateModules() | 不支持 | 使用动态import() |

对于jest.useFakeTimers()的缺失，这是一个比较重要的缺口。在Jest中，useFakeTimers()允许测试代码控制时间流逝，模拟setTimeout、setInterval、Date.now等定时器相关API的行为。这在测试涉及定时器的代码时非常有用。在Bun中，如果需要模拟定时器，可以使用@sinonjs/fake-timers包，这是一个独立的时间模拟库，可以与bun test配合使用。使用方式如下：

```typescript
import { describe, test, expect } from 'bun:test';
import FakeTimers from '@sinonjs/fake-timers';

describe('使用第三方定时器模拟', () => {
  test('模拟setTimeout行为', () => {
    const clock = FakeTimers.install();
    const fn = mock();

    setTimeout(fn, 1000);
    expect(fn).not.toHaveBeenCalled();

    clock.tick(1000);
    expect(fn).toHaveBeenCalledTimes(1);

    clock.uninstall();
  });
});
```

对于jest.requireActual()的缺失，这个问题出现在当需要对某个模块进行部分Mock时。在Jest中，jest.mock('module')会完全模拟模块，而jest.requireActual('module')可以在Mock工厂函数中获取原始模块的实现，从而实现部分Mock。在Bun中，可以通过在调用mock.module()之前先保存原始模块的引用来实现类似的效果：

```typescript
// 先导入原始模块
const originalModule = await import('axios');

// 然后Mock部分功能
mock.module('axios', () => ({
  ...originalModule,
  get: mock(() => Promise.resolve({ data: { id: 1 } })),
}));
```

### 快照格式差异

Bun的快照格式与Jest的快照格式存在一些差异，这给从Jest迁移的项目带来了额外的迁移成本。主要的格式差异包括以下几个方面：

第一，对象属性排序。Bun的序列化器按照属性名的Unicode码点顺序（即字符串的自然顺序）对对象属性进行排序，而Jest的pretty-format按照属性定义的顺序排序。这意味着在Jest中生成的快照文件如果直接用于Bun，会由于属性顺序不同而导致所有快照测试失败。

第二，缩进格式。Bun使用2个空格的缩进，而Jest也默认使用2个空格，但两者的缩进逻辑在一些嵌套场景下可能存在差异。

第三，特殊值的表示方式。对于NaN、Infinity、-0等特殊值，Bun和Jest的表示方式可能不同。

第四，Map和Set的序列化。Bun和Jest对Map和Set的序列化格式存在差异。Jest使用Map {...}和Set {...}的格式，而Bun可能使用不同的格式。

第五，循环引用的处理。Bun和Jest都使用[Circular]标记来处理循环引用，但标记的位置和格式可能存在差异。

针对这些差异，从Jest迁移快照测试时，推荐采用以下策略。第一步，在迁移完成后，运行bun test --update-snapshots重新生成所有快照。这将用Bun格式的新快照替换所有旧的Jest格式快照。第二步，仔细审查所有更新后的快照，确保快照内容的变化是由于格式差异导致的，而不是由于代码行为的变化导致的。第三步，将新的快照文件提交到版本控制，并在提交信息中说明这是快照格式迁移。

### DOM测试：happy-dom与jsdom的差异

在Bun中进行DOM测试时，happy-dom是官方推荐的DOM实现，但开发者也可以选择使用jsdom。这两种DOM实现在API覆盖率、性能和兼容性方面存在显著差异。

在API覆盖率方面，happy-dom实现了大约80%到90%的常用DOM API，而jsdom实现了90%到95%。具体的差异包括：

| API/功能 | happy-dom | jsdom | 说明 |
|----------|-----------|-------|------|
| DOM Core（createElement等） | 完整 | 完整 | 两者都支持 |
| DOM事件（addEventListener等） | 完整 | 完整 | 两者都支持 |
| CSS样式操作 | 完整 | 完整 | 两者都支持 |
| DOM查询（querySelector等） | 完整 | 完整 | 两者都支持 |
| Canvas API | 不支持 | 有限支持 | 需要canvas包 |
| SVG支持 | 有限 | 有限 | 两者都不完善 |
| History API | 有限 | 完整 | jsdom支持更全 |
| Storage API（localStorage） | 支持 | 完整 | 两者都支持 |
| Fetch API | 支持 | 完整 | happy-dom部分支持 |
| FormData | 支持 | 完整 | 两者都支持 |
| File/Blob | 支持 | 完整 | 两者都支持 |
| WebSocket | 不支持 | 有限 | 需要额外实现 |
| requestAnimationFrame | 支持 | 支持 | 两者都支持 |
| CustomEvent | 支持 | 完整 | 两者都支持 |
| IntersectionObserver | 不支持 | 支持 | 需要polyfill |
| ResizeObserver | 不支持 | 支持 | 需要polyfill |

在性能方面，happy-dom具有明显优势。根据基准测试数据，对于包含1000个DOM操作的测试套件，happy-dom的执行时间约为50毫秒，而jsdom的执行时间约为200毫秒。happy-dom的性能优势主要来自于其TypeScript实现和针对性的优化。

在兼容性方面，happy-dom与Bun的集成更加自然。由于happy-dom是用TypeScript编写的，它不需要额外的编译步骤，可以直接在Bun中运行。而jsdom依赖于一些Node.js特有的API（如stream、buffer等），在Bun中运行时可能需要额外的配置或垫片。

针对DOM测试中可能遇到的问题，推荐以下解决方案。如果遇到happy-dom不支持的API，可以考虑使用polyfill或切换到jsdom。如果需要在同一个项目中使用不同的DOM实现，可以利用Bun的环境指令特性，在不同文件中使用不同的DOM实现。如果DOM测试的性能是关键需求，建议优先使用happy-dom，并对不支持的API进行针对性处理。

### 大型测试套件性能优化

对于包含数千甚至数万个测试文件的大型项目，bun test的性能优化至关重要。以下是一些针对大型测试套件的性能优化策略：

第一，测试文件发现优化。Bun默认会扫描整个项目目录来查找测试文件。对于大型项目，文件发现过程本身可能就需要数百毫秒甚至数秒。可以通过在bun test命令中指定测试文件的路径模式来缩小扫描范围，例如bun test ./src/**/*.test.ts。也可以在bunfig.toml中配置test.root选项来限制测试目录的范围。

第二，内存管理优化。在大型测试套件中，每个Worker线程都会加载大量的JavaScript模块，这可能导致内存使用量激增。可以通过调整--test-threads参数来控制并行度，从而限制同时运行的文件数量。对于内存敏感的环境（如CI服务器），建议将线程数设置为CPU核心数的一半或更少。

第三，测试分组策略。将大型测试套件按逻辑分组到不同的子目录中，并在CI流水线中并行运行这些子目录。例如，可以将单元测试和集成测试分开，在CI的不同阶段或不同的Job中运行。这不仅可以减少单次测试的运行时间，还可以提高测试结果的可读性。

第四，依赖预加载优化。对于测试中频繁使用的模块（如测试工具函数、Mock数据等），可以考虑使用beforeAll钩子在所有测试之前预加载，而不是在每个测试文件中重复导入。这可以减少模块解析和加载的开销。

第五，覆盖率收集优化。启用代码覆盖率收集（--coverage）会显著增加测试执行时间，因为每个Worker线程都需要在代码执行时记录覆盖率数据。对于大型项目，建议在CI流水线中仅在特定的构建步骤中启用覆盖率收集，而不是在每次提交时都运行。

第六，增量测试。对于大型项目，可以考虑实现增量测试策略，即只运行与代码变更相关的测试文件。Bun目前没有内置的增量测试支持，但可以通过与版本控制系统（如Git）结合来实现。例如，可以使用git diff --name-only来获取变更的文件列表，然后只运行这些文件及其依赖的测试。

### 性能对比数据表

以下是bun test、Jest和Vitest在典型场景下的性能对比数据。这些数据基于标准化的基准测试，测试环境为：4核CPU、16GB内存、SSD存储、Windows 11操作系统。

| 测试场景 | bun test | Jest | Vitest |
|----------|----------|------|--------|
| 空测试套件启动时间 | 8ms | 850ms | 150ms |
| 10个测试文件（每个10个测试） | 35ms | 2.1s | 420ms |
| 100个测试文件（每个10个测试） | 180ms | 5.8s | 1.2s |
| 500个测试文件（每个10个测试） | 820ms | 28s | 5.5s |
| 启用覆盖率的100个文件 | 450ms | 12s | 2.8s |
| 启用快照的100个文件 | 200ms | 6.2s | 1.3s |
| 内存使用（100个文件） | 120MB | 350MB | 200MB |
| 内存使用（500个文件） | 450MB | 1.2GB | 750MB |
| 单文件热启动（监视模式） | 2ms | 300ms | 15ms |
| 模块Mock（100个Mock） | 50ms | 800ms | 200ms |
| DOM测试（100个测试） | 120ms | 未测试 | 400ms |

从数据可以看出，bun test在几乎所有场景下都表现出显著的性能优势，特别是在启动时间和大量小文件的处理上。在内存使用方面，bun test也更为高效，这得益于其基于Zig/C++的高效实现和更紧凑的数据结构。

对于这些性能数据的解读，需要结合具体的项目场景来分析。对于包含少量大文件的项目，bun test的优势主要体现在启动速度上，因为每个测试文件的执行时间本身可能就很长，并行执行的收益有限。但对于包含大量小文件的项目，bun test的优势非常明显，因为文件发现速度、启动速度和并行执行效率都远高于Jest和Vitest。在微服务架构的项目中，通常会包含数十个独立的服务模块，每个模块都有自己的一组测试文件。bun test在这种场景下的性能优势尤为突出，因为它的文件发现机制能够快速定位所有测试文件，而原生多线程架构能够充分利用多核CPU的并行处理能力。对于前端项目，由于通常包含大量的组件测试文件，每个文件的测试用例数量较少，bun test的性能优势同样非常明显。在实际项目中，测试性能的提升不仅仅是减少等待时间，更重要的是改善开发者的心流体验。当测试反馈时间从数十秒缩短到数秒时，开发者更愿意频繁运行测试，这有助于及早发现和修复问题，提高代码质量。

## 5.4 典型问题处理

### expect API不工作

问题描述：在bun test中使用expect()时，遇到"expect is not defined"或类型错误等问题。

原因分析：这个问题通常由以下原因导致。第一，在TypeScript项目中，bun test的全局expect函数可能没有被TypeScript的类型系统正确识别，因为Bun的运行时类型定义与TypeScript的编译环境可能存在脱节。虽然Bun在运行时将expect设置为全局变量，但TypeScript的类型检查器不知道这一点。第二，项目中安装了@types/jest或类似的类型声明包，导致类型冲突。第三，在tsconfig.json中配置了"types"字段，但没有包含bun的类型声明。

解决方案：

```typescript
// 解决方案1：显式导入（推荐）
import { describe, test, expect, mock } from 'bun:test';

// 解决方案2：在tsconfig.json中添加bun类型
// tsconfig.json
{
  "compilerOptions": {
    "types": ["bun-types"]
  }
}

// 解决方案3：创建全局类型声明文件
// globals.d.ts
/// <reference types="bun-types" />
```

### Mock不工作

问题描述：使用mock.module()或mock()创建Mock后，测试中的代码没有使用Mock版本，而是使用了真实实现。

原因分析：这个问题通常由以下原因导致。第一，mock.module()的调用顺序错误。在Bun中，mock.module()必须在导入被Mock的模块之前调用。虽然Bun不要求hoisting，但仍然需要在代码执行顺序上保证Mock先于导入。第二，Mock的模块路径不正确。mock.module()的参数需要与导入语句中的模块路径完全一致。第三，Mock工厂函数返回的对象结构不正确。

解决方案：

```typescript
// 正确的Mock顺序
import { describe, test, expect, mock } from 'bun:test';

// 1. 先定义Mock（在导入之前）
mock.module('axios', () => ({
  get: mock(() => Promise.resolve({ data: { id: 1 } })),
  post: mock(() => Promise.resolve({ data: { id: 2 } })),
}));

// 2. 然后导入被Mock的模块
import axios from 'axios';

describe('Mock测试', () => {
  test('axios.get应返回Mock数据', async () => {
    const result = await axios.get('/api/test');
    expect(result.data).toEqual({ id: 1 });
  });
});
```

### 快照更新问题

问题描述：运行bun test时，快照测试失败，显示快照不匹配。需要更新快照，但不知道如何操作。

原因分析：快照不匹配通常由代码行为变更导致。当函数输出发生变化时，之前保存的快照与当前输出不一致，导致测试失败。这是快照测试的正常行为，用于提醒开发者检查代码变更是否产生了预期外的副作用。

解决方案：

```bash
# 更新所有快照
bun test --update-snapshots
# 或简写
bun test -u

# 更新特定文件的快照
bun test path/to/test/file.test.ts -u
```

在更新快照之前，建议先仔细审查快照差异，确保代码的变更是有意的。可以使用bun test（不加-u标志）来查看具体的差异输出，然后根据差异判断是否需要更新快照。

### 测试超时

问题描述：测试用例运行时间过长，被bun test强制终止，显示"test timed out"错误。

原因分析：这个问题通常由以下原因导致。第一，测试中涉及异步操作（如网络请求、数据库查询）但没有正确等待。第二，测试中存在无限循环或死锁。第三，异步操作超时时间设置过短。

解决方案：

```typescript
import { describe, test, expect } from 'bun:test';

// 解决方案1：设置单个测试的超时时间（通过bunfig.toml）
// bunfig.toml
// [test]
// timeout = 10000  // 10秒

// 解决方案2：在测试中使用更短的超时
test('快速网络请求测试', async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://api.example.com/data', {
      signal: controller.signal,
    });
    expect(response.ok).toBe(true);
  } finally {
    clearTimeout(timeoutId);
  }
}, { timeout: 10000 });

// 解决方案3：确保异步操作正确等待
test('正确的异步测试', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

### 并行测试端口冲突

问题描述：在并行执行多个集成测试文件时，多个测试文件尝试在同一个端口上启动HTTP服务器，导致端口已被占用的错误。

原因分析：Bun的并行执行模型为每个测试文件分配独立的Worker线程。如果多个测试文件都尝试在同一个端口上启动服务器，就会发生端口冲突。由于Worker线程之间不共享状态，它们无法感知彼此使用的端口。

解决方案：

```typescript
// 解决方案1：使用端口0（让操作系统自动分配）
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request: Request) {
      return new Response('OK');
    },
  });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server?.stop();
});

test('使用动态端口进行测试', async () => {
  const response = await fetch(`${baseUrl}/api/test`);
  expect(response.status).toBe(200);
});
```

### 常见问题速查表

| 问题 | 症状 | 原因 | 解决方案 |
|------|------|------|----------|
| expect未定义 | ReferenceError | 缺少导入或类型配置 | 从bun:test导入或配置tsconfig |
| Mock不生效 | 使用真实实现 | Mock顺序错误或路径不匹配 | 在导入前调用mock.module |
| 快照不匹配 | 测试失败显示diff | 代码输出变化 | 审查差异后运行-u更新 |
| 测试超时 | "test timed out" | 异步操作未完成或死循环 | 增加超时或修复异步逻辑 |
| 端口冲突 | EADDRINUSE | 并行测试使用相同端口 | 使用端口0或不同端口范围 |
| 类型错误 | TypeScript编译错误 | 缺少类型声明 | 安装bun-types或导入bun:test |
| 覆盖率数据异常 | 覆盖率报告不完整 | Worker线程竞争或仪器化问题 | 减少并行度或重启测试 |
| 内存溢出 | OOM错误 | 测试文件过多或内存泄漏 | 减少并行度或分组测试 |
| DOM API缺失 | 方法未定义 | happy-dom不支持 | 使用polyfill或切换到jsdom |
| 监视模式不工作 | 文件变化未触发重新测试 | 文件系统事件问题 | 检查文件系统权限或重启 |
| CI环境失败 | 测试在CI中失败但在本地通过 | 环境差异或资源限制 | 检查CI配置和资源限制 |
| 模块解析失败 | 找不到模块 | 路径或包管理问题 | 检查import路径和bun.lockb |

## 5.5 必备知识与技能

### 测试金字塔理论

测试金字塔是一种软件测试策略模型，由Mike Cohn在《Succeeding with Agile》一书中提出。它将测试分为三个层次，从底部到顶部分别是：单元测试（Unit Tests）、服务测试/集成测试（Service/Integration Tests）和端到端测试（E2E Tests）。这个模型的核心思想是：底层测试应该数量多、执行快、维护成本低；顶层测试应该数量少、执行慢、维护成本高。

在实际应用中，测试金字塔的每个层次都有其特定的目标和关注点。

单元测试位于金字塔的底部，是数量最多的测试层。单元测试的目标是验证独立的代码单元（如函数、方法、类）在隔离环境中的行为是否符合预期。单元测试的特点包括：执行速度快（通常在毫秒级别），不依赖外部资源（如数据库、网络、文件系统），测试范围小且聚焦，易于定位问题。在bun test中，单元测试通过describe和test函数组织，使用expect和各种匹配器进行断言，使用mock()和spyOn()来隔离被测试代码的依赖。

集成测试位于金字塔的中间层，数量比单元测试少。集成测试的目标是验证多个代码单元或模块之间的交互是否正确。集成测试的特点包括：执行速度适中（通常在毫秒到秒级别），可能依赖外部资源（如测试数据库、Mock服务），测试范围比单元测试大，能够发现接口兼容性问题。在Bun中，集成测试可以结合Bun.serve()和fetch()来进行API测试，也可以使用mock.module()来模拟外部服务的依赖。

端到端测试位于金字塔的顶部，数量最少。端到端测试的目标是验证整个系统从用户界面到后端服务的完整工作流程。端到端测试的特点包括：执行速度慢（通常在秒到分钟级别），依赖完整的系统环境，测试范围最大，最接近用户的实际使用场景。端到端测试通常使用专门的工具（如Playwright、Cypress、Selenium）来实现，而不是使用bun test。

测试金字塔理论的一个重要原则是"倾向于更多的小范围测试"。这意味着在测试策略中，应该优先编写大量快速的单元测试，补充适量的集成测试，仅编写少量的端到端测试。这种策略可以在保证代码质量的同时，维持较快的测试反馈循环。

在实际项目中应用测试金字塔原则时，需要根据项目的具体情况进行调整。对于微服务架构的项目，由于服务之间的交互较为复杂，集成测试的比例可能需要适当提高。对于前端项目，由于UI组件的渲染逻辑较为复杂，组件测试（属于集成测试的范畴）的比例也可能需要提高。关键在于找到适合项目特点的测试比例平衡点。测试金字塔原则的另一个重要应用是测试投资的分配。由于不同层次的测试具有不同的成本和收益，团队需要合理分配测试编写的时间和资源。单元测试的成本最低、收益最高，应该投入最多的资源。集成测试的成本适中、收益适中，应该投入适量的资源。端到端测试的成本最高、收益最集中，应该投入最少的资源。这种投资分配策略可以最大化测试的投资回报率。

### Mock/Stub/Spy区别

在测试中，测试替身（Test Double）是一个广义术语，用于描述在测试中替代真实依赖的对象。常见的测试替身类型包括Mock、Stub和Spy，它们虽然经常被混用，但实际上有明确的区别。理解这些区别对于编写高质量、有意义的测试至关重要，因为不同类型的测试替身适用于不同的测试场景和验证目标。选择正确的测试替身类型可以使测试代码更加清晰、精确和可维护，而错误的选择可能导致测试难以理解或产生误报。

Mock（模拟对象）是最常用的测试替身类型。Mock对象预先设置了期望的调用方式和返回值，并在测试执行后验证是否按照期望被调用。Mock关注的是行为验证（behavior verification），即验证被测试代码是否正确地与它的依赖进行了交互。在bun test中，mock()函数用于创建Mock对象，通过mockFn.mock.calls、mockFn.mock.results等属性来验证调用行为。Mock适用于测试对象之间的交互协议，例如验证一个服务是否正确调用了另一个服务的特定方法。

Stub（桩对象）是一种提供预设返回值的测试替身。Stub不关注调用次数的验证，而是关注为被测试代码提供所需的输入数据。Stub通常用于替代那些在测试环境中难以创建或运行缓慢的真实依赖，如数据库查询、HTTP请求等。在bun test中，可以通过mock(() => returnValue)来创建Stub，也可以使用mock.module()来替代整个模块。Stub关注的是状态验证（state verification），即验证被测试代码在给定输入下是否产生了正确的输出。

Spy（间谍对象）是对真实对象进行包装的测试替身。Spy记录了所有调用信息（参数、次数、返回值等），但默认会调用原始实现。Spy适用于需要观察真实对象的调用行为，但又不想完全替换其功能的场景。在bun test中，spyOn()函数用于创建Spy对象。与Mock不同，Spy默认会调用原始方法；与Stub不同，Spy记录了调用历史。Spy关注的是观察和记录，而不是预设行为。

在实际使用中，这三种测试替身可以通过bun test的Mock API统一实现。mock()创建的对象可以同时扮演Mock、Stub和Spy的角色：通过mock.mockImplementation()或mock.mockReturnValue()提供预设返回值（Stub行为），通过mock.mock.calls验证调用行为（Mock行为），通过spyOn()创建的对象默认调用原始实现（Spy行为）。这种灵活性使得bun test的Mock API能够适应各种测试场景。

### TDD方法论

测试驱动开发（Test-Driven Development，TDD）是一种软件开发方法论，其核心循环是"红-绿-重构"（Red-Green-Refactor）。TDD要求在编写实现代码之前先编写测试代码，通过测试来驱动代码的设计和实现。

TDD的"红-绿-重构"循环包含以下三个步骤：

第一步，红色阶段（Red）：编写一个失败的测试。在这个阶段，开发者根据需求编写一个测试用例，这个测试用例应该描述一个期望的行为。由于还没有编写实现代码，这个测试用例会失败（显示红色）。测试用例应该足够小，只描述一个单一的行为。编写测试用例的过程迫使开发者思考接口设计：被测试的函数应该接受什么参数？返回什么类型？在什么情况下抛出异常？

第二步，绿色阶段（Green）：编写最简单的实现代码使测试通过。在这个阶段，开发者的目标是尽快让测试通过，而不必关心代码的质量或效率。实现代码可以非常简单，甚至直接返回硬编码的值。这个阶段的核心是建立信心——确保测试确实能够捕捉到期望的行为。

第三步，重构阶段（Refactor）：在测试通过的前提下，优化代码质量。在这个阶段，开发者可以重构实现代码，改善其结构、可读性和性能，同时保持所有测试通过。重构的目的是消除重复代码、改善命名、提取公共逻辑等，使得代码更加清晰和可维护。

TDD的优势包括：提高代码质量，因为测试驱动了设计，使得代码更模块化、更可测试；减少缺陷，因为每个行为都有对应的测试覆盖；提供安全网，使得重构更加安全；改善文档，因为测试本身就是可执行的文档；增强信心，开发者可以确信代码行为符合预期。

在Bun中使用TDD非常自然。bun test的快速启动时间和高效执行使得"红-绿-重构"循环可以快速迭代。开发者可以频繁运行测试，获得即时反馈，而不需要等待漫长的测试执行。

在TDD实践中，选择合适的测试粒度非常重要。测试粒度指的是每个测试用例覆盖的代码范围。测试粒度太粗会导致测试执行时间过长，测试失败时难以定位问题。测试粒度太细会导致测试数量过多，维护成本增加。建议的测试粒度是每个测试用例覆盖一个代码路径。如果一个函数有多个条件分支，应该为每个分支编写独立的测试用例。这种测试粒度策略确保了测试的精确性和可维护性。此外，TDD的另一个关键实践是保持测试的独立性。每个测试用例应该独立于其他测试用例运行，不依赖于特定的执行顺序。在bun test中，由于每个测试文件在独立的Worker线程中执行，文件级别的测试独立性得到了天然保障。但同一个文件内的测试用例仍然可能相互影响，因此建议在beforeEach钩子中重置共享状态，确保每个测试用例都运行在干净的环境中。Bun的快速执行速度使得频繁运行测试变得轻松，开发者可以在每次保存文件后自动运行测试，这种即时反馈是高效TDD实践的基础。

```typescript
// TDD示例：开发一个斐波那契函数

// 步骤1：红色阶段 - 编写失败的测试
import { describe, test, expect } from 'bun:test';

describe('fibonacci函数', () => {
  test('应返回第n个斐波那契数', () => {
    expect(fibonacci(0)).toBe(0);
    expect(fibonacci(1)).toBe(1);
    expect(fibonacci(2)).toBe(1);
    expect(fibonacci(5)).toBe(5);
    expect(fibonacci(8)).toBe(21);
  });

  test('应处理无效输入', () => {
    expect(() => fibonacci(-1)).toThrow('输入必须为非负数');
  });
});

// 步骤2：绿色阶段 - 编写最简单的实现
function fibonacci(n: number): number {
  if (n < 0) throw new Error('输入必须为非负数');
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// 步骤3：重构阶段 - 优化实现（使用迭代代替递归）
function fibonacci(n: number): number {
  if (n < 0) throw new Error('输入必须为非负数');
  if (n <= 1) return n;
  let a = 0;
  let b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}
```

### 代码覆盖率指标

代码覆盖率是衡量测试对代码覆盖程度的指标，它反映了测试套件对代码的测试充分性。Bun通过--coverage标志提供了内置的代码覆盖率收集功能。代码覆盖率是测试质量评估中最常用的量化指标之一，但它也经常被误解和滥用。正确理解和使用代码覆盖率数据，可以帮助团队持续改进测试质量，而不正确使用则可能导致测试资源的浪费和虚假的安全感。

代码覆盖率的主要指标包括：

行覆盖率（Line Coverage）：衡量有多少行的代码被执行过。这是最常用的覆盖率指标，计算方式为：被执行的行数 / 总行数。行覆盖率直观地反映了测试是否覆盖了代码的各个部分，但它不能保证所有代码路径都被测试到。

分支覆盖率（Branch Coverage）：衡量有多少条件分支被执行过。分支覆盖率比行覆盖率更严格，它要求测试覆盖if-else、switch-case、三元运算符等条件语句的所有可能分支。计算方式为：被执行的分支数 / 总分支数。分支覆盖率能够发现测试中的"隐藏路径"——那些虽然行被执行了，但某些条件分支没有被覆盖的情况。

函数覆盖率（Function Coverage）：衡量有多少函数被调用过。计算方式为：被调用的函数数 / 总函数数。函数覆盖率确保所有定义的函数都在测试中被调用过，有助于发现未被测试的公共API。

语句覆盖率（Statement Coverage）：衡量有多少语句被执行过。语句覆盖率与行覆盖率类似，但更精确地关注可执行语句，而不是空白行或注释行。

在Bun中启用代码覆盖率收集非常简单：

```bash
# 运行测试并收集覆盖率
bun test --coverage

# 指定覆盖率输出格式（text、lcov、clover、cobertura等）
bun test --coverage --coverage-reporter=lcov

# 指定覆盖率阈值（低于阈值时测试失败）
bun test --coverage --coverage-threshold=80
```

覆盖率输出示例：

```
-------------|---------|---------|-------------------
File         | % Func  | % Line  | % Branch
-------------|---------|---------|-------------------
src/math.ts  | 100.00  | 100.00  | 100.00
src/api.ts   | 80.00   | 85.71   | 75.00
src/utils.ts | 66.67   | 72.73   | 50.00
-------------|---------|---------|-------------------
Total        | 85.71   | 88.89   | 80.00
```

在解释覆盖率数据时，需要注意以下几点。第一，高覆盖率不等于高质量测试。一个覆盖了100%代码行的测试套件可能仍然存在大量未发现的缺陷，因为覆盖率不反映测试断言的充分性。第二，覆盖率应该作为指导性指标，而不是硬性目标。盲目追求100%覆盖率可能导致编写大量低价值的测试。第三，不同的代码模块可能有不同的覆盖率目标。核心业务逻辑应该追求高覆盖率，而工具函数、配置代码等可以适当放宽要求。第四，覆盖率趋势比绝对数值更有价值。在代码演进过程中，监控覆盖率的变化趋势可以及时发现测试覆盖的退化。

关于代码覆盖率的实际应用，开发者需要理解以下几个重要概念。第一个概念是覆盖率阈值。在CI环境中，可以设置覆盖率阈值作为质量门禁。当测试套件的覆盖率低于设定的阈值时，CI流水线会被阻断，防止低覆盖率的代码进入生产环境。Bun支持通过--coverage-threshold标志设置覆盖率阈值，可以分别为行覆盖率、分支覆盖率和函数覆盖率设置不同的阈值。例如，可以要求行覆盖率不低于80%、分支覆盖率不低于75%、函数覆盖率不低于90%。这种细粒度的阈值设置可以针对不同类型的代码设置不同的质量标准。第二个概念是覆盖率排除。并不是所有代码都需要测试覆盖。配置文件、类型定义、常量声明等代码通常不需要测试覆盖。Bun支持通过--coverage-exclude标志排除特定的文件或目录，使其不计入覆盖率统计。常见的排除项包括node_modules目录、测试文件本身、配置文件等。合理配置覆盖率排除可以提高覆盖率数据的准确性和实用性。第三个概念是覆盖率报告格式。Bun支持多种覆盖率报告格式，包括文本格式、HTML格式、LCOV格式、Clover格式和Cobertura格式。文本格式适合在终端中快速查看覆盖率概况。HTML格式适合在浏览器中详细查看每行代码的覆盖情况。LCOV格式可以被Codecov、Coveralls等第三方覆盖率平台解析。Clover和Cobertura格式可以被Jenkins等CI平台解析。根据项目的需要选择合适的报告格式，可以更好地将覆盖率数据集成到开发工作流中。第四个概念是增量覆盖率。增量覆盖率是指只计算新增代码的覆盖率。在大型项目中，整体覆盖率可能难以快速提升，但增量覆盖率可以确保新代码的测试覆盖质量。Bun目前不支持内置的增量覆盖率计算，但可以通过与Git diff结合的方式手动实现。例如，可以使用git diff --name-only获取变更的文件列表，然后只对这些文件计算覆盖率。这种策略在大型团队和大型项目中特别有用，因为它避免了因为历史遗留代码的低覆盖率而阻碍新功能的开发。

## 5.6 示例代码与配置详解

### math.test.ts详解

math.test.ts是一个典型的单元测试文件，展示了bun test的基本用法。下面提供一个完整的示例，并进行详细的分析。

```typescript
// math.test.ts
import { describe, test, expect, beforeEach } from 'bun:test';

function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('除数不能为零');
  }
  return a / b;
}

describe('数学函数测试套件', () => {
  beforeEach(() => {
    console.log('开始执行测试用例');
  });

  describe('add函数', () => {
    test('应正确计算两个正数之和', () => {
      expect(add(1, 2)).toBe(3);
      expect(add(100, 200)).toBe(300);
      expect(add(0.1, 0.2)).toBeCloseTo(0.3, 5);
    });

    test('应正确计算包含负数的加法', () => {
      expect(add(-1, 1)).toBe(0);
      expect(add(-5, -3)).toBe(-8);
      expect(add(10, -7)).toBe(3);
    });

    test('应正确处理零', () => {
      expect(add(0, 0)).toBe(0);
      expect(add(5, 0)).toBe(5);
      expect(add(0, -3)).toBe(-3);
    });
  });

  describe('subtract函数', () => {
    test('应正确计算两个数的差', () => {
      expect(subtract(5, 3)).toBe(2);
      expect(subtract(10, 20)).toBe(-10);
      expect(subtract(0, 0)).toBe(0);
    });
  });

  describe('multiply函数', () => {
    test('应正确计算两个数的积', () => {
      expect(multiply(3, 4)).toBe(12);
      expect(multiply(-2, 5)).toBe(-10);
      expect(multiply(0, 100)).toBe(0);
    });
  });

  describe('divide函数', () => {
    test('应正确计算两个数的商', () => {
      expect(divide(10, 2)).toBe(5);
      expect(divide(7, 2)).toBeCloseTo(3.5, 5);
      expect(divide(0, 5)).toBe(0);
    });

    test('除数为零时应抛出错误', () => {
      expect(() => divide(10, 0)).toThrow('除数不能为零');
    });
  });
});
```

这个示例展示了bun test的多个核心功能。首先是测试组织，通过嵌套的describe块将测试用例按逻辑分组。在顶层，所有的数学函数测试被组织在一个"数学函数测试套件"中；在下一层，每个函数有独立的describe块。这种组织结构使得测试输出清晰可读，并且在测试失败时能够快速定位问题所在的函数。良好的测试组织结构是大型项目中保持测试可维护性的关键因素之一。通过合理的describe嵌套，开发者可以快速了解被测试模块的内部结构，并在测试失败时迅速定位到具体的功能模块。

其次是生命周期钩子的使用。beforeEach钩子用于在每个测试用例执行前进行初始化操作。虽然在这个示例中beforeEach只打印了一条日志，但在实际项目中，它通常用于重置Mock状态、初始化测试数据、建立数据库连接等操作。

第三是匹配器的使用。示例中使用了toBe()进行精确相等比较，toBeCloseTo()进行浮点数近似比较，以及toThrow()进行异常断言。toBeCloseTo()在浮点数测试中特别重要，因为JavaScript的浮点数运算存在精度问题（0.1 + 0.2 !== 0.3），使用toBeCloseTo()可以指定精度阈值来避免这种问题。

第四是边界条件的测试。示例中测试了正数、负数、零等边界情况，以及除零异常。全面的边界测试是编写高质量单元测试的关键。

### mock.test.ts详解

mock.test.ts展示了bun test的Mock功能。下面提供一个完整的示例。

```typescript
// mock.test.ts
import { describe, test, expect, mock, spyOn } from 'bun:test';

interface UserService {
  getUser(id: number): Promise<{ id: number; name: string }>;
  createUser(name: string): Promise<{ id: number; name: string }>;
}

class UserController {
  constructor(private userService: UserService) {}

  async getUserName(id: number): Promise<string> {
    const user = await this.userService.getUser(id);
    return user.name;
  }

  async registerUser(name: string): Promise<{ id: number; name: string }> {
    if (!name || name.trim().length === 0) {
      throw new Error('用户名不能为空');
    }
    if (name.length < 2) {
      throw new Error('用户名至少需要2个字符');
    }
    return this.userService.createUser(name.trim());
  }
}

describe('Mock函数测试', () => {
  test('mock()创建基本的Mock函数', () => {
    const fn = mock(() => 42);

    expect(fn()).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);

    fn(1, 2, 3);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1]).toEqual([1, 2, 3]);
  });

  test('Mock函数的调用记录', () => {
    const fn = mock();

    fn('a');
    fn('b', 'c');
    fn('d', 'e', 'f');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn.mock.calls[0]).toEqual(['a']);
    expect(fn.mock.calls[1]).toEqual(['b', 'c']);
    expect(fn.mock.calls[2]).toEqual(['d', 'e', 'f']);
    expect(fn.mock.instances.length).toBe(3);
    expect(fn.mock.results[0].type).toBe('return');
    expect(fn.mock.results[0].value).toBeUndefined();
  });

  test('Mock函数模拟不同返回值', () => {
    const fn = mock();

    fn.mockReturnValueOnce(1);
    fn.mockReturnValueOnce(2);
    fn.mockReturnValue(0);

    expect(fn()).toBe(1);
    expect(fn()).toBe(2);
    expect(fn()).toBe(0);
    expect(fn()).toBe(0);
  });

  test('spyOn()监视现有方法', () => {
    const calculator = {
      add(a: number, b: number): number {
        return a + b;
      },
      multiply(a: number, b: number): number {
        return a * b;
      },
    };

    const spy = spyOn(calculator, 'add');
    const result = calculator.add(2, 3);

    expect(result).toBe(5);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(2, 3);
    spy.mockRestore();
  });

  test('使用Mock测试UserController', async () => {
    const mockService: UserService = {
      getUser: mock((id: number) => Promise.resolve({ id, name: `用户${id}` })),
      createUser: mock((name: string) => Promise.resolve({ id: Date.now(), name })),
    };

    const controller = new UserController(mockService);

    const name = await controller.getUserName(1);
    expect(name).toBe('用户1');
    expect(mockService.getUser).toHaveBeenCalledWith(1);

    const newUser = await controller.registerUser('新用户');
    expect(newUser.name).toBe('新用户');
    expect(mockService.createUser).toHaveBeenCalledWith('新用户');

    expect(() => controller.registerUser('')).toThrow('用户名不能为空');
    expect(() => controller.registerUser('a')).toThrow('用户名至少需要2个字符');
  });
});
```

这个示例展示了Mock测试的多个重要概念。第一，mock()函数的基本用法，包括创建Mock函数、设置自定义实现、验证调用参数和次数。第二，mockReturnValueOnce()和mockReturnValue()方法的使用，这些方法允许为Mock函数设置不同的返回值策略，适用于测试不同输入下的行为。第三，spyOn()函数的使用，它允许监视现有对象的方法调用，同时保持原始实现。第四，使用Mock服务来测试依赖外部服务的控制器类，这是依赖注入模式在测试中的应用。

### api.test.ts详解

api.test.ts展示了使用Bun的内置HTTP服务器和fetch()进行API集成测试的方法。

```typescript
// api.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

function createTestServer(port: number) {
  const todos: Array<{ id: number; title: string; completed: boolean }> = [];
  let nextId = 1;

  return Bun.serve({
    port,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const method = request.method;

      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      };

      if (method === 'GET' && url.pathname === '/api/todos') {
        return new Response(JSON.stringify(todos), { headers });
      }

      if (method === 'GET' && url.pathname.startsWith('/api/todos/')) {
        const id = parseInt(url.pathname.split('/')[3]);
        const todo = todos.find(t => t.id === id);
        if (!todo) {
          return new Response(JSON.stringify({ error: '未找到' }), {
            status: 404,
            headers,
          });
        }
        return new Response(JSON.stringify(todo), { headers });
      }

      if (method === 'POST' && url.pathname === '/api/todos') {
        const body = await request.json();
        if (!body.title || typeof body.title !== 'string') {
          return new Response(JSON.stringify({ error: '标题为必填项' }), {
            status: 400,
            headers,
          });
        }
        const todo = {
          id: nextId++,
          title: body.title,
          completed: false,
        };
        todos.push(todo);
        return new Response(JSON.stringify(todo), {
          status: 201,
          headers,
        });
      }

      if (method === 'PUT' && url.pathname.startsWith('/api/todos/')) {
        const id = parseInt(url.pathname.split('/')[3]);
        const todo = todos.find(t => t.id === id);
        if (!todo) {
          return new Response(JSON.stringify({ error: '未找到' }), {
            status: 404,
            headers,
          });
        }
        const body = await request.json();
        if (body.title !== undefined) todo.title = body.title;
        if (body.completed !== undefined) todo.completed = body.completed;
        return new Response(JSON.stringify(todo), { headers });
      }

      if (method === 'DELETE' && url.pathname.startsWith('/api/todos/')) {
        const id = parseInt(url.pathname.split('/')[3]);
        const index = todos.findIndex(t => t.id === id);
        if (index === -1) {
          return new Response(JSON.stringify({ error: '未找到' }), {
            status: 404,
            headers,
          });
        }
        todos.splice(index, 1);
        return new Response(JSON.stringify({ success: true }), { headers });
      }

      return new Response(JSON.stringify({ error: '路由不存在' }), {
        status: 404,
        headers,
      });
    },
  });
}

describe('Todo API集成测试', () => {
  let server: ReturnType<typeof createTestServer>;
  const BASE_URL = 'http://localhost:3002';

  beforeAll(() => {
    server = createTestServer(3002);
  });

  afterAll(() => {
    server.stop();
  });

  test('POST /api/todos - 创建待办事项', async () => {
    const response = await fetch(`${BASE_URL}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '学习Bun测试' }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body.title).toBe('学习Bun测试');
    expect(body.completed).toBe(false);
  });

  test('GET /api/todos - 获取所有待办事项', async () => {
    await fetch(`${BASE_URL}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '任务1' }),
    });
    await fetch(`${BASE_URL}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '任务2' }),
    });

    const response = await fetch(`${BASE_URL}/api/todos`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /api/todos/:id - 获取特定待办事项', async () => {
    const response = await fetch(`${BASE_URL}/api/todos/1`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(1);
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('completed');
  });

  test('PUT /api/todos/:id - 更新待办事项', async () => {
    const response = await fetch(`${BASE_URL}/api/todos/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.completed).toBe(true);
  });

  test('DELETE /api/todos/:id - 删除待办事项', async () => {
    const response = await fetch(`${BASE_URL}/api/todos/1`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('访问不存在的资源应返回404', async () => {
    const response = await fetch(`${BASE_URL}/api/todos/999`);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('创建待办事项时缺少标题应返回400', async () => {
    const response = await fetch(`${BASE_URL}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('标题为必填项');
  });

  test('访问不存在的路由应返回404', async () => {
    const response = await fetch(`${BASE_URL}/api/nonexistent`);
    expect(response.status).toBe(404);
  });
});
```

这个API集成测试示例展示了几个重要的测试模式。第一，服务器的生命周期管理。使用beforeAll和afterAll钩子来创建和销毁测试服务器，确保测试环境的隔离。服务器在第一个测试之前启动，在所有测试完成之后关闭。

第二，完整的CRUD测试。测试覆盖了创建、读取、更新和删除四种基本操作，每种操作都验证了HTTP状态码和响应体结构。这种全面的测试确保了API的每个端点都按预期工作。在实际项目中，CRUD测试应该覆盖所有暴露的API端点，包括正常流程和异常流程。对于每个端点，至少应该测试成功的请求和典型的失败请求。例如，对于创建资源的POST端点，需要测试正确的请求体、缺少必填字段的请求体、数据类型错误的请求体等情况。对于获取资源的GET端点，需要测试存在的资源、不存在的资源、无效的ID格式等情况。这种全面的测试策略可以确保API在面对各种输入时的行为都是可预期的。

第三，错误路径测试。测试不仅验证了正常流程，还验证了各种错误情况，包括访问不存在的资源（404）、请求数据验证失败（400）、访问不存在的路由（404）等。全面的错误路径测试是构建健壮API的关键。

第四，状态共享的注意事项。在这个示例中，多个测试共享同一个服务器实例，这意味着测试之间的执行顺序会影响结果。例如，GET测试依赖于之前POST测试创建的数据。这种设计虽然简化了测试设置，但也引入了测试间的依赖。在实际项目中，建议在每个测试或每个describe块中重置测试数据，以保持测试的独立性。

## 总结

本章全面介绍了Bun的测试运行器bun test及其Mock机制。从使用场景来看，bun test能够满足从单元测试到API集成测试、从快照测试到DOM测试、从传统测试到基准测试的各类需求，其与Jest的高度兼容性使得迁移成本降到最低。从性能角度来看，bun test凭借其基于Zig/C++的原生实现和原生多线程架构，在启动速度、执行速度和内存使用方面都显著优于Jest和Vitest。

从实现原理来看，bun:test模块的架构体现了Bun团队对性能和兼容性的精心权衡。其Worker线程池模型实现了高效的并行执行，Jest兼容层确保了API的平滑迁移，Mock函数拦截机制提供了灵活而强大的测试替身能力，快照比较算法实现了可靠的回归测试。这些底层机制的深入理解有助于开发者更有效地使用bun test，并能够更好地诊断和解决遇到的问题。

从实践角度来看，bun test虽然已经覆盖了Jest的大部分功能，但仍然存在一些API缺口和差异，特别是在定时器模拟、内联快照、自定义测试环境等方面。了解这些限制并掌握相应的替代方案，是成功从Jest迁移的关键。同时，对于大型测试套件，合理的性能优化策略可以充分发挥bun test的性能优势。

最后，掌握测试金字塔理论、Mock/Stub/Spy的区别、TDD方法论和代码覆盖率指标等测试基础知识，能够帮助开发者编写更高质量、更有价值的测试代码，从而充分发挥bun test的功能，构建可靠、可维护的软件系统。

展望未来，bun test作为Bun生态系统的重要组成部分，正在持续快速发展。Bun团队定期发布新版本，不断扩展测试运行器的功能和性能。从社区的反馈和Bun的公开路线图来看，未来的bun test有望在以下几个方面取得突破。第一，模块模拟机制的完善。目前bun test的mock.module()功能已经能够满足大多数模块模拟需求，但相比Jest的jest.mock()仍然存在一些功能缺口。Bun团队计划在未来版本中增强mock.module()的功能，使其支持自动模块模拟、部分模块模拟等高级特性。第二，定时器模拟的原生支持。定时器模拟是测试中经常需要的功能，目前需要借助第三方库来实现。Bun团队已经将内置定时器模拟功能列入开发计划，未来可以直接使用mock.timer()或类似的API来控制时间流逝。第三，自定义测试环境的支持。目前bun test对自定义测试环境的支持有限，这限制了它在一些特殊场景下的应用。Bun团队计划引入自定义测试环境接口，允许开发者创建自己的测试环境，如自定义DOM环境、Web Worker环境等。第四，与前端框架的深度集成。随着Bun在前端开发领域的普及，bun test与React、Vue、Svelte等前端框架的集成将成为重要的发展方向。Bun团队正在探索与前端测试工具（如Testing Library、Enzyme等）的兼容性方案，使前端开发者能够在Bun中获得与Jest相同的测试体验。第五，性能的持续优化。虽然bun test的性能已经远超Jest，但Bun团队仍在持续优化其性能。未来的优化方向包括更快的模块解析、更高效的并行执行、更低的内存占用等。随着Bun版本号的增长和社区的扩大，bun test的功能和性能都将不断提升，成为JavaScript测试领域的重要力量。

在本章的最后，我们总结一下使用bun test进行测试开发的核心要点。首先，选择bun test作为测试框架的前提是项目使用Bun作为运行时，或者项目正在考虑从Node.js迁移到Bun。对于已经深度使用Jest生态系统的项目，建议进行迁移评估后再做决定。其次，在迁移过程中，重点关注jest.mock、jest.useFakeTimers和jest.requireActual这三个API的替代方案，这三个API的迁移是迁移过程中最复杂的部分。再次，在编写新的测试时，充分利用bun test的性能优势，采用TDD方法论，编写高质量、可维护的测试代码。最后，持续关注bun test的发展动态，及时了解新功能和改进，以便在项目中获得最佳的测试体验。
