# 附录B Jest 速查表

## B.1 概述

Jest 是 Node.js 生态中最流行的测试框架，由 Facebook（现 Meta）开发。本附录以速查表的形式汇总 Jest 最常用的 Matcher、Mock API 和配置选项，作为日常测试编写的快速参考。

## B.2 值匹配

| Matcher | 作用 | 示例 |
|:--|:--|:--|
| `toBe(value)` | 原始值比较（使用 `Object.is`） | `expect(1 + 1).toBe(2)` |
| `toEqual(value)` | 对象深度比较 | `expect({a: 1}).toEqual({a: 1})` |
| `toStrictEqual(value)` | 严格对比（检查 undefined 属性、类型） | `expect({a: 1, b: undefined}).toStrictEqual({a: 1})` // 会失败 |

```javascript
// toBe vs toEqual vs toStrictEqual 的区别
describe('值匹配', () => {
  test('toBe 使用 Object.is', () => {
    expect(2).toBe(2);          // 通过
    expect({ a: 1 }).not.toBe({ a: 1 }); // 不通过：对象引用不同
  });

  test('toEqual 深度比较', () => {
    expect({ a: 1, b: { c: 2 } }).toEqual({ a: 1, b: { c: 2 } }); // 通过
    expect([1, 2, 3]).toEqual([1, 2, 3]); // 通过
  });

  test('toStrictEqual 更严格', () => {
    class A { constructor() { this.a = 1; } }
    class B { constructor() { this.a = 1; } }
    expect(new A()).toEqual(new B());         // 通过
    expect(new A()).not.toStrictEqual(new B()); // 不通过：类不同
  });
});
```

## B.3 布尔匹配

| Matcher | 作用 | 通过条件 |
|:--|:--|:--|
| `toBeNull()` | 是否为 null | `value === null` |
| `toBeUndefined()` | 是否为 undefined | `value === undefined` |
| `toBeDefined()` | 是否不是 undefined | `value !== undefined` |
| `toBeTruthy()` | 是否真值 | `if (value)` 为 true |
| `toBeFalsy()` | 是否假值 | `if (value)` 为 false |

```javascript
describe('布尔匹配', () => {
  test('null / undefined', () => {
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
    expect(1).toBeDefined();
  });

  test('真值 / 假值', () => {
    expect(1).toBeTruthy();
    expect('hello').toBeTruthy();
    expect(0).toBeFalsy();
    expect('').toBeFalsy();
    expect(false).toBeFalsy();
  });
});
```

## B.4 数字匹配

| Matcher | 作用 | 示例 |
|:--|:--|:--|
| `toBeGreaterThan(n)` | 大于 | `expect(5).toBeGreaterThan(3)` |
| `toBeGreaterThanOrEqual(n)` | 大于等于 | `expect(5).toBeGreaterThanOrEqual(5)` |
| `toBeLessThan(n)` | 小于 | `expect(3).toBeLessThan(5)` |
| `toBeLessThanOrEqual(n)` | 小于等于 | `expect(3).toBeLessThanOrEqual(3)` |
| `toBeCloseTo(n, digits)` | 浮点数近似 | `expect(0.1 + 0.2).toBeCloseTo(0.3, 5)` |

```javascript
describe('数字匹配', () => {
  test('浮点数比较必须使用 toBeCloseTo', () => {
    // ❌ 错误方式
    // expect(0.1 + 0.2).toBe(0.3); // 浮点数精度问题导致失败

    // ✅ 正确方式
    expect(0.1 + 0.2).toBeCloseTo(0.3, 5); // 检查小数点后 5 位
  });
});
```

## B.5 字符串匹配

| Matcher | 作用 | 示例 |
|:--|:--|:--|
| `toMatch(regexp | string)` | 正则或子串匹配 | `expect('hello@example.com').toMatch(/^[\w.-]+@[\w.-]+\.\w+$/)` |
| `toMatchSnapshot()` | 快照测试 | `expect(renderToString(component)).toMatchSnapshot()` |

```javascript
describe('字符串匹配', () => {
  test('toMatch 使用正则', () => {
    expect('Hello World').toMatch(/World/);
    expect('hello@example.com').toMatch(/^[\w.-]+@[\w.-]+\.\w+$/);
  });

  test('toMatchSnapshot 记录输出快照', () => {
    const output = JSON.stringify({ user: 'Alice', age: 30 }, null, 2);
    expect(output).toMatchSnapshot();
    // 首次运行时创建快照文件，后续运行与之对比
  });
});
```

## B.6 数组匹配

| Matcher | 作用 | 示例 |
|:--|:--|:--|
| `toContain(item)` | 数组是否包含某项 | `expect(['a', 'b']).toContain('a')` |
| `toHaveLength(n)` | 数组/字符串长度 | `expect([1, 2, 3]).toHaveLength(3)` |
| `toContainEqual(item)` | 是否包含某个对象 | `expect([{a: 1}]).toContainEqual({a: 1})` |

```javascript
describe('数组/可迭代对象匹配', () => {
  const colors = ['red', 'green', 'blue'];

  test('toContain', () => {
    expect(colors).toContain('red');
    expect(colors).not.toContain('yellow');
  });

  test('toHaveLength', () => {
    expect(colors).toHaveLength(3);
  });

  test('toContainEqual 对象数组', () => {
    const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
    expect(users).toContainEqual({ id: 1, name: 'Alice' });
  });
});
```

## B.7 异常匹配

| Matcher | 作用 | 示例 |
|:--|:--|:--|
| `toThrow()` | 是否抛出异常 | `expect(() => { throw new Error() }).toThrow()` |
| `toThrowError(message)` | 是否抛出指定错误 | `expect(fn).toThrowError('Invalid input')` |

```javascript
describe('异常匹配', () => {
  function divide(a, b) {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  }

  test('toThrow 捕获异常', () => {
    expect(() => divide(1, 0)).toThrow();
    expect(() => divide(1, 0)).toThrowError('Division by zero');
    expect(() => divide(1, 0)).toThrowError(/zero/);
  });

  test('异步异常', async () => {
    await expect(Promise.reject(new Error('fail'))).rejects.toThrow('fail');

    const asyncThrow = async () => { throw new Error('async error'); };
    await expect(asyncThrow()).rejects.toThrow('async error');
  });
});
```

## B.8 Mock 函数

| API | 作用 | 示例 |
|:--|:--|:--|
| `jest.fn()` | 创建 Mock 函数 | `const mock = jest.fn()` |
| `jest.mock(module)` | Mock 整个模块 | `jest.mock('axios')` |
| `jest.spyOn(obj, method)` | 监视已有方法 | `jest.spyOn(console, 'log')` |

### 返回值控制

```javascript
describe('Mock 返回值控制', () => {
  test('mockReturnValue / mockReturnValueOnce', () => {
    const mock = jest.fn();
    mock.mockReturnValueOnce(10).mockReturnValueOnce(20).mockReturnValue(30);

    expect(mock()).toBe(10);   // 第一次
    expect(mock()).toBe(20);   // 第二次
    expect(mock()).toBe(30);   // 第三次及以后
    expect(mock()).toBe(30);   // 一直返回 30
  });

  test('mockResolvedValue / mockRejectedValue', async () => {
    const mock = jest.fn().mockResolvedValue('success');
    const result = await mock();
    expect(result).toBe('success');

    const mockFail = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(mockFail()).rejects.toThrow('fail');
  });

  test('mockImplementation', () => {
    const mock = jest.fn().mockImplementation((a, b) => a + b);
    expect(mock(1, 2)).toBe(3);
    expect(mock(10, 20)).toBe(30);
  });
});
```

## B.9 调用验证

| Matcher/API | 作用 | 示例 |
|:--|:--|:--|
| `toHaveBeenCalled()` | 是否至少被调用一次 | `expect(mock).toHaveBeenCalled()` |
| `toHaveBeenCalledTimes(n)` | 调用次数 | `expect(mock).toHaveBeenCalledTimes(2)` |
| `toHaveBeenCalledWith(...)` | 是否以特定参数调用 | `expect(mock).toHaveBeenCalledWith('a', 1)` |
| `toHaveBeenLastCalledWith(...)` | 最后一次调用的参数 | `expect(mock).toHaveBeenLastCalledWith('b', 2)` |
| `mock.calls` | 获取所有调用参数数组 | `mock.calls[0][0]`（第一次调用的第一个参数） |

```javascript
describe('调用验证', () => {
  test('验证调用次数和参数', () => {
    const mock = jest.fn();
    mock('hello', 1);
    mock('world', 2);

    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock).toHaveBeenCalledWith('hello', 1);
    expect(mock).toHaveBeenCalledWith('world', 2);
    expect(mock).toHaveBeenLastCalledWith('world', 2);

    // 直接访问 mock.calls
    expect(mock.calls[0][0]).toBe('hello');
    expect(mock.calls[1][1]).toBe(2);
  });

  test('验证模块依赖被正确调用', () => {
    const sendMail = jest.fn();
    const service = new UserService(sendMail);

    service.register('test@example.com');

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      to: 'test@example.com',
      subject: 'Welcome!',
    });
  });
});
```

## B.10 定时器 Mock

| API | 作用 |
|:--|:--|
| `jest.useFakeTimers()` | 启用假时间（替换 setTimeout/setInterval） |
| `jest.useRealTimers()` | 恢复真实时间 |
| `advanceTimersByTime(ms)` | 快进指定毫秒 |
| `runAllTimers()` | 执行所有待处理的定时器 |
| `runOnlyPendingTimers()` | 执行当前待处理的定时器（不触发循环定时器） |

```javascript
describe('定时器 Mock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('advanceTimersByTime 快进时间', () => {
    const callback = jest.fn();
    setTimeout(callback, 1000);

    jest.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled(); // 还没到时间

    jest.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalled(); // 已触发
  });

  test('runAllTimers 执行所有定时器', () => {
    const callback = jest.fn();
    setTimeout(callback, 10000);

    jest.runAllTimers();
    expect(callback).toHaveBeenCalled();
  });

  test('测试 setInterval 循环', () => {
    const callback = jest.fn();
    setInterval(callback, 1000);

    jest.advanceTimersByTime(5000);
    expect(callback).toHaveBeenCalledTimes(5); // 5 秒内调用 5 次
  });
});
```

## B.11 生命周期钩子

| 钩子 | 作用 | 执行时机 |
|:--|:--|:--|
| `beforeEach(() => {...})` | 每个测试前执行 | 每个 test/it 之前 |
| `afterEach(() => {...})` | 每个测试后执行 | 每个 test/it 之后 |
| `beforeAll(() => {...})` | 所有测试前执行 | describe 块开始时 |
| `afterAll(() => {...})` | 所有测试后执行 | describe 块结束时 |

```javascript
describe('数据库操作', () => {
  let db;

  beforeAll(async () => {
    db = await createDatabase(); // 建立连接，仅一次
  });

  afterAll(async () => {
    await db.close(); // 关闭连接，仅一次
  });

  beforeEach(async () => {
    await db.clear(); // 每个测试前清理数据
  });

  test('插入用户', async () => {
    const user = await db.insert({ name: 'Alice' });
    expect(user.id).toBeDefined();
  });

  test('查询用户', async () => {
    await db.insert({ name: 'Alice' });
    const users = await db.findAll();
    expect(users).toHaveLength(1);
  });
});
```

## B.12 配置建议

```javascript
// jest.config.js — 推荐配置
module.exports = {
  // 测试环境
  testEnvironment: 'node',

  // 文件匹配
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],

  // 覆盖率
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/index.ts',          // 入口文件不需要覆盖
    '!src/types/**',           // 类型定义不需要覆盖
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // 模块别名（与 tsconfig 同步）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // 自动清理 Mock
  clearMocks: true,
  restoreMocks: true,

  // TypeScript 支持
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // 测试超时
  testTimeout: 10000,
};
```

---

## 附录小结

本附录以表格形式整理了 Jest 最常用的 Matcher、Mock API 和配置项。实际编写测试时，建议遵循以下原则：使用 `toEqual` 进行对象比较而非 `toBe`、使用 `toBeCloseTo` 处理浮点、使用 `pipeline` 与 `rejects` 处理异步异常、以及合理使用生命周期钩子来管理测试隔离。