# 附录 B：ESLint 企业级配置

## 1. 基础配置

```typescript
// .eslintrc.json
{
  "root": true,
  "env": {
    "node": true,
    "browser": true,
    "es2022": true
  },
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    }
  },
  "plugins": [
    "@typescript-eslint",
    "import",
    "prettier"
  ],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier"
  ]
}
```

## 2. 类型安全规则

```typescript
{
  "rules": {
    // 禁止 any
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-return": "error",

    // 严格 null 检查
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",

    // 类型一致性
    "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/prefer-as-const": "error",
    "@typescript-eslint/prefer-enum-initializers": "error",

    // 函数
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/explicit-member-accessibility": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

## 3. 导入规则

```typescript
{
  "rules": {
    "import/order": [
      "error",
      {
        "groups": [
          "builtin",    // Node.js 内置模块
          "external",   // 第三方包
          "internal",   // 内部模块
          "parent",     // 父目录
          "sibling",    // 同级
          "index"       // index 文件
        ],
        "newlines-between": "always",
        "alphabetize": {
          "order": "asc",
          "caseInsensitive": true
        }
      }
    ],
    "import/no-duplicates": "error",
    "import/no-unused-modules": "warn",
    "import/no-cycle": "warn",
    "import/no-self-import": "error"
  }
}
```

## 4. 项目特定规则

```typescript
{
  "overrides": [
    // 测试文件宽松规则
    {
      "files": ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "import/no-extraneous-dependencies": "off"
      }
    },
    // 配置文件宽松规则
    {
      "files": ["*.config.ts", "*.config.js"],
      "rules": {
        "@typescript-eslint/explicit-function-return-type": "off"
      }
    }
  ]
}
```

## 5. 性能优化

```typescript
// 对于大型项目，启用类型检查规则会降低 lint 速度
// 建议分两步运行：

// 第一步：快速 lint（无类型检查）
// .eslintrc.fast.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ]
}

// 第二步：完整 lint（含类型检查）
// .eslintrc.full.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ]
}

// package.json
{
  "scripts": {
    "lint:fast": "eslint src --config .eslintrc.fast.json",
    "lint:full": "eslint src --config .eslintrc.full.json",
    "lint": "npm run lint:full"
  }
}
```

## 6. 与 Prettier 集成

```typescript
// .prettierrc
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}

// 使用 eslint-config-prettier 禁用冲突规则
// 使用 eslint-plugin-prettier 将 Prettier 作为 ESLint 规则运行
```

## 7. 推荐配置总结

```typescript
// 最小推荐配置
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/consistent-type-imports": "error"
  }
}

// 企业级配置
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "import/order": ["error", { "groups": ["builtin", "external", "internal", "parent", "sibling", "index"], "newlines-between": "always" }],
    "import/no-duplicates": "error"
  }
}
```
