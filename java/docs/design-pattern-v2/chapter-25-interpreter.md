# 第25章 解释器模式（Interpreter）

**解释器模式**给定一门语言，定义它的文法的一种表示，并定义一个解释器，这个解释器使用该表示来解释语言中的句子。

## 25.1 解决的问题与应用场景

### 25.1.1 问题分析

在业务系统中，经常遇到需要解析和执行某种"语言"的情况。这种语言可能是简单的数学表达式、布尔规则、查询条件，或者是领域特定的 DSL（Domain Specific Language）。

**传统实现的困境：**

```java
// 解析条件表达式: "salary > 10000 AND age < 30"
public boolean evaluate(String expression, Map<String, Object> context) {
    // 用字符串拼接和正则解析，难以维护
    String[] parts = expression.split(" AND ");
    for (String part : parts) {
        if (part.contains(">")) {
            String[] cond = part.split(">");
            double value = Double.parseDouble(context.get(cond[0].trim()).toString());
            double expected = Double.parseDouble(cond[1].trim());
            if (!(value > expected)) return false;
        }
        if (part.contains("<")) {
            // 每个运算符都需要 if-else 分支
        }
    }
    return true;
}
```

这种字符串解析方式的问题：
- 条件复杂时，if-else 成倍增长
- 难以支持括号嵌套和运算符优先级
- 添加新运算符需要修改核心解析逻辑
- 代码难以测试每个独立的语法规则

### 25.1.2 典型应用场景

**1. 数学表达式计算器**：解析 `(3 + 5) * 2 - 8 / 4` 并计算结果。

**2. 规则引擎**：业务用户编写规则如 `salary > 10000 AND department = "IT"`，系统据此进行决策。

**3. 搜索查询解析**：支持 `tag:java AND (author:张三 OR date>2024-01-01)` 的高级搜索语法。

**4. 模板引擎**：解析 `Hello, {{user.name}}, your order {{order.id}} is {{status}}` 并替换占位符。

**5. SQL 解析器**：解析简单的 SELECT 语句，提取表名、列名、条件等。

## 25.2 实现原理与UML

### 25.2.1 核心概念

解释器模式将语言的文法规则表示为类层次结构：

- **TerminalExpression（终结符表达式）**：文法中的最小单元，没有子表达式。例如数字 `100`、标识符 `salary`。
- **NonTerminalExpression（非终结符表达式）**：由其他表达式组合而成。例如加法 `a + b`、AND 条件 `a AND b`。

### 25.2.2 表达式树的递归求值

```
表达式: (3 + 5) * 2

解析为表达式树:
        *
       / \
      +   2
     / \
    3   5

求值过程:
    eval(*) → eval(+) * eval(2)
             → (eval(3) + eval(5)) * 2
             → (3 + 5) * 2
             → 8 * 2
             → 16
```

### 25.2.3 UML类图

```
┌──────────────────────────────────────────────────────────┐
│                     Expression                           │
│                     (抽象表达式)                          │
├──────────────────────────────────────────────────────────┤
│ + interpret(Context ctx): Object                        │
└────────────────────────┬─────────────────────────────────┘
                         │
        ┌────────────────┼────────────────────┐
        │                │                     │
        ▼                ▼                     ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   TerminalExpr    │ │ NonTerminalExpr │ │  NonTerminalExpr │
│   (终结符表达式)   │ │  (非终结符)      │ │  (非终结符)      │
├──────────────────┤ ├──────────────────┤ ├──────────────────┤
│ - value          │ │ - left: Expression│ │ - left: Expression│
│ + interpret()    │ │ - right: Expr     │ │ - right: Expr    │
└──────────────────┘ │ + interpret()    │ │ + interpret()    │
                     └──────────────────┘ └──────────────────┘
                                                  │
                    ┌─────────────────────────────┼──────────┐
                    │              │              │          │
                    ▼              ▼              ▼          ▼
            ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────┐
            │   AddExpr  │ │  SubExpr   │ │  MulExpr   │ │DivExpr │
            │  (加法)     │ │  (减法)    │ │  (乘法)    │ │(除法)  │
            └────────────┘ └────────────┘ └────────────┘ └────────┘

                    ┌──────────────────────────────┐
                    │           Context             │
                    │           上下文              │
                    ├──────────────────────────────┤
                    │ + variables: Map<String, Obj>│
                    │ + getValue(key): Object      │
                    └──────────────────────────────┘
```

### 25.2.4 递归下降解析

解释器模式通常与**递归下降解析器**配合使用。每个文法规则对应一个解析方法：

```
文法规则:
    expr     → term (("+" | "-") term)*
    term     → factor (("*" | "/") factor)*
    factor   → NUMBER | "(" expr ")" | "-" factor

解析方法:
    parseExpr()  → parseTerm() + 处理 +/- 运算符
    parseTerm()  → parseFactor() + 处理 * / 运算符
    parseFactor() → 解析数字 | 括号表达式 | 一元负号

递归下降解析后生成表达式树的根节点。
```

## 25.3 代码实现

### 25.3.1 算术表达式计算器

```java
// ============ 上下文 ============
// 上下文可以存储变量值，也可以为空（纯数值计算）
public class Context {
    private final Map<String, Object> variables = new HashMap<>();

    public void setVariable(String name, Object value) {
        variables.put(name, value);
    }

    public Object getVariable(String name) {
        Object val = variables.get(name);
        if (val == null) {
            throw new IllegalArgumentException("未定义的变量: " + name);
        }
        return val;
    }
}

// ============ 抽象表达式 ============
public interface Expression {
    int interpret(Context context);
}

// ============ 终结符表达式 ============
// 数字
public class NumberExpression implements Expression {
    private final int value;

    public NumberExpression(int value) {
        this.value = value;
    }

    @Override
    public int interpret(Context context) {
        return value;
    }

    @Override
    public String toString() {
        return String.valueOf(value);
    }
}

// 变量
public class VariableExpression implements Expression {
    private final String name;

    public VariableExpression(String name) {
        this.name = name;
    }

    @Override
    public int interpret(Context context) {
        Object value = context.getVariable(name);
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        throw new RuntimeException("变量 " + name + " 的值不是数字: " + value);
    }

    @Override
    public String toString() {
        return name;
    }
}

// ============ 非终结符表达式 ============
// 加法
public class AddExpression implements Expression {
    private final Expression left;
    private final Expression right;

    public AddExpression(Expression left, Expression right) {
        this.left = left;
        this.right = right;
    }

    @Override
    public int interpret(Context context) {
        int leftVal = left.interpret(context);
        int rightVal = right.interpret(context);
        System.out.printf("  ADD: %d + %d = %d%n", leftVal, rightVal, leftVal + rightVal);
        return leftVal + rightVal;
    }

    @Override
    public String toString() {
        return "(" + left + " + " + right + ")";
    }
}

// 减法
public class SubtractExpression implements Expression {
    private final Expression left;
    private final Expression right;

    public SubtractExpression(Expression left, Expression right) {
        this.left = left;
        this.right = right;
    }

    @Override
    public int interpret(Context context) {
        int leftVal = left.interpret(context);
        int rightVal = right.interpret(context);
        System.out.printf("  SUB: %d - %d = %d%n", leftVal, rightVal, leftVal - rightVal);
        return leftVal - rightVal;
    }

    @Override
    public String toString() {
        return "(" + left + " - " + right + ")";
    }
}

// 乘法
public class MultiplyExpression implements Expression {
    private final Expression left;
    private final Expression right;

    public MultiplyExpression(Expression left, Expression right) {
        this.left = left;
        this.right = right;
    }

    @Override
    public int interpret(Context context) {
        int leftVal = left.interpret(context);
        int rightVal = right.interpret(context);
        System.out.printf("  MUL: %d * %d = %d%n", leftVal, rightVal, leftVal * rightVal);
        return leftVal * rightVal;
    }

    @Override
    public String toString() {
        return "(" + left + " * " + right + ")";
    }
}

// 除法
public class DivideExpression implements Expression {
    private final Expression left;
    private final Expression right;

    public DivideExpression(Expression left, Expression right) {
        this.left = left;
        this.right = right;
    }

    @Override
    public int interpret(Context context) {
        int leftVal = left.interpret(context);
        int rightVal = right.interpret(context);
        if (rightVal == 0) {
            throw new ArithmeticException("除数不能为0");
        }
        System.out.printf("  DIV: %d / %d = %d%n", leftVal, rightVal, leftVal / rightVal);
        return leftVal / rightVal;
    }

    @Override
    public String toString() {
        return "(" + left + " / " + right + ")";
    }
}

// 一元负号
public class NegateExpression implements Expression {
    private final Expression inner;

    public NegateExpression(Expression inner) {
        this.inner = inner;
    }

    @Override
    public int interpret(Context context) {
        int val = inner.interpret(context);
        System.out.printf("  NEG: -(%d) = %d%n", val, -val);
        return -val;
    }

    @Override
    public String toString() {
        return "(-" + inner + ")";
    }
}

// ============ 词法分析器（Lexer） ============
public class Lexer {
    private final String input;
    private int pos = 0;

    public Lexer(String input) {
        this.input = input.replaceAll("\\s+", ""); // 去除所有空白
    }

    public List<Token> tokenize() {
        List<Token> tokens = new ArrayList<>();
        while (pos < input.length()) {
            char c = input.charAt(pos);

            if (Character.isDigit(c)) {
                tokens.add(readNumber());
            } else if (Character.isLetter(c)) {
                tokens.add(readIdentifier());
            } else {
                switch (c) {
                    case '+': tokens.add(new Token(TokenType.PLUS, "+")); pos++; break;
                    case '-': tokens.add(new Token(TokenType.MINUS, "-")); pos++; break;
                    case '*': tokens.add(new Token(TokenType.STAR, "*")); pos++; break;
                    case '/': tokens.add(new Token(TokenType.SLASH, "/")); pos++; break;
                    case '(': tokens.add(new Token(TokenType.LPAREN, "(")); pos++; break;
                    case ')': tokens.add(new Token(TokenType.RPAREN, ")")); pos++; break;
                    default:
                        throw new RuntimeException("未知字符: " + c);
                }
            }
        }
        tokens.add(new Token(TokenType.EOF, ""));
        return tokens;
    }

    private Token readNumber() {
        StringBuilder sb = new StringBuilder();
        while (pos < input.length() && Character.isDigit(input.charAt(pos))) {
            sb.append(input.charAt(pos));
            pos++;
        }
        return new Token(TokenType.NUMBER, sb.toString());
    }

    private Token readIdentifier() {
        StringBuilder sb = new StringBuilder();
        while (pos < input.length()
                && (Character.isLetterOrDigit(input.charAt(pos))
                    || input.charAt(pos) == '_')) {
            sb.append(input.charAt(pos));
            pos++;
        }
        return new Token(TokenType.IDENTIFIER, sb.toString());
    }
}

// ============ 词法单元 ============
public enum TokenType {
    NUMBER, IDENTIFIER,
    PLUS, MINUS, STAR, SLASH,
    LPAREN, RPAREN,
    EOF
}

public class Token {
    public final TokenType type;
    public final String value;

    public Token(TokenType type, String value) {
        this.type = type;
        this.value = value;
    }

    @Override
    public String toString() {
        return type + "(" + value + ")";
    }
}

// ============ 递归下降解析器（Parser） ============
// 文法:
//   expr     → term (("+" | "-") term)*
//   term     → factor (("*" | "/") factor)*
//   factor   → NUMBER | IDENTIFIER | "(" expr ")" | "-" factor
public class Parser {
    private final List<Token> tokens;
    private int pos = 0;

    public Parser(List<Token> tokens) {
        this.tokens = tokens;
    }

    // 解析完整的表达式
    public Expression parse() {
        Expression expr = parseExpr();
        if (current().type != TokenType.EOF) {
            throw new RuntimeException("意外的词法单元: " + current());
        }
        return expr;
    }

    // expr → term (("+" | "-") term)*
    private Expression parseExpr() {
        Expression expr = parseTerm();

        while (current().type == TokenType.PLUS
                || current().type == TokenType.MINUS) {
            Token op = consume();
            Expression right = parseTerm();
            if (op.type == TokenType.PLUS) {
                expr = new AddExpression(expr, right);
            } else {
                expr = new SubtractExpression(expr, right);
            }
        }
        return expr;
    }

    // term → factor (("*" | "/") factor)*
    private Expression parseTerm() {
        Expression expr = parseFactor();

        while (current().type == TokenType.STAR
                || current().type == TokenType.SLASH) {
            Token op = consume();
            Expression right = parseFactor();
            if (op.type == TokenType.STAR) {
                expr = new MultiplyExpression(expr, right);
            } else {
                expr = new DivideExpression(expr, right);
            }
        }
        return expr;
    }

    // factor → NUMBER | IDENTIFIER | "(" expr ")" | "-" factor
    private Expression parseFactor() {
        Token token = current();

        if (token.type == TokenType.NUMBER) {
            consume();
            return new NumberExpression(Integer.parseInt(token.value));
        }

        if (token.type == TokenType.IDENTIFIER) {
            consume();
            return new VariableExpression(token.value);
        }

        if (token.type == TokenType.LPAREN) {
            consume(); // 消费 '('
            Expression expr = parseExpr();
            if (current().type != TokenType.RPAREN) {
                throw new RuntimeException("缺少右括号");
            }
            consume(); // 消费 ')'
            return expr;
        }

        if (token.type == TokenType.MINUS) {
            consume(); // 消费 '-'
            Expression expr = parseFactor();
            return new NegateExpression(expr);
        }

        throw new RuntimeException("意外的词法单元: " + token);
    }

    private Token current() {
        return tokens.get(pos);
    }

    private Token consume() {
        return tokens.get(pos++);
    }
}

// ============ 客户端 ============
public class ArithmeticDemo {
    public static void main(String[] args) {
        // 示例1: 纯数值表达式
        String expr1 = "(3 + 5) * 2 - 8 / 4";
        System.out.println("表达式: " + expr1);
        int result1 = evaluate(expr1, new Context());
        System.out.println("结果: " + result1 + " (期望: 14)");
        System.out.println();

        // 示例2: 带变量的表达式
        String expr2 = "x * (y + 10)";
        Context ctx = new Context();
        ctx.setVariable("x", 3);
        ctx.setVariable("y", 5);
        System.out.println("表达式: " + expr2 + " (x=3, y=5)");
        int result2 = evaluate(expr2, ctx);
        System.out.println("结果: " + result2 + " (期望: 45)");
        System.out.println();

        // 示例3: 一元负号
        String expr3 = "-5 + 3";
        System.out.println("表达式: " + expr3);
        int result3 = evaluate(expr3, new Context());
        System.out.println("结果: " + result3 + " (期望: -2)");
        System.out.println();

        // 示例4: 复杂嵌套
        String expr4 = "((2 + 3) * (10 - 4)) / (1 + 2)";
        System.out.println("表达式: " + expr4);
        int result4 = evaluate(expr4, new Context());
        System.out.println("结果: " + result4 + " (期望: 10)");
    }

    public static int evaluate(String expression, Context context) {
        Lexer lexer = new Lexer(expression);
        List<Token> tokens = lexer.tokenize();
        System.out.println("词法分析结果: " + tokens);
        Parser parser = new Parser(tokens);
        Expression ast = parser.parse();
        System.out.println("抽象语法树: " + ast);
        System.out.println("求值过程:");
        return ast.interpret(context);
    }
}
```

### 25.3.2 布尔规则引擎

```java
// ============ 布尔表达式 ============
public interface BooleanExpression {
    boolean evaluate(Context context);
}

// ============ 比较表达式（终结符） ============
public class ComparisonExpression implements BooleanExpression {
    public enum Operator { GT, GTE, LT, LTE, EQ, NEQ }

    private final String field;
    private final Operator operator;
    private final String expectedValue;

    public ComparisonExpression(String field, Operator operator, String expectedValue) {
        this.field = field;
        this.operator = operator;
        this.expectedValue = expectedValue;
    }

    @Override
    public boolean evaluate(Context context) {
        Object actualValue = context.getValue(field);
        System.out.printf("  比较: %s(%s) %s %s",
                field, actualValue, operator, expectedValue);

        int cmp;
        if (actualValue instanceof Number && isNumeric(expectedValue)) {
            cmp = Double.compare(((Number) actualValue).doubleValue(),
                    Double.parseDouble(expectedValue));
        } else {
            cmp = actualValue.toString().compareTo(expectedValue);
        }

        boolean result = switch (operator) {
            case GT  -> cmp > 0;
            case GTE -> cmp >= 0;
            case LT  -> cmp < 0;
            case LTE -> cmp <= 0;
            case EQ  -> cmp == 0;
            case NEQ -> cmp != 0;
        };

        System.out.println(" → " + result);
        return result;
    }

    private boolean isNumeric(String str) {
        try {
            Double.parseDouble(str);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }
}

// ============ AND 表达式 ============
public class AndExpression implements BooleanExpression {
    private final BooleanExpression left;
    private final BooleanExpression right;

    public AndExpression(BooleanExpression left, BooleanExpression right) {
        this.left = left;
        this.right = right;
    }

    @Override
    public boolean evaluate(Context context) {
        System.out.printf("  AND: 左=%s, 右=%s%n", left, right);
        boolean leftResult = left.evaluate(context);
        // 短路求值：如果左为 false，不再计算右
        if (!leftResult) {
            System.out.println("  左为false, 短路");
            return false;
        }
        boolean rightResult = right.evaluate(context);
        return rightResult;
    }

    @Override
    public String toString() {
        return "(AND " + left + " " + right + ")";
    }
}

// ============ OR 表达式 ============
public class OrExpression implements BooleanExpression {
    private final BooleanExpression left;
    private final BooleanExpression right;

    public OrExpression(BooleanExpression left, BooleanExpression right) {
        this.left = left;
        this.right = right;
    }

    @Override
    public boolean evaluate(Context context) {
        System.out.printf("  OR: 左=%s, 右=%s%n", left, right);
        boolean leftResult = left.evaluate(context);
        // 短路求值：如果左为 true，不再计算右
        if (leftResult) {
            System.out.println("  左为true, 短路");
            return true;
        }
        return right.evaluate(context);
    }

    @Override
    public String toString() {
        return "(OR " + left + " " + right + ")";
    }
}

// ============ NOT 表达式 ============
public class NotExpression implements BooleanExpression {
    private final BooleanExpression inner;

    public NotExpression(BooleanExpression inner) {
        this.inner = inner;
    }

    @Override
    public boolean evaluate(Context context) {
        boolean result = inner.evaluate(context);
        System.out.println("  NOT: " + result + " → " + !result);
        return !result;
    }

    @Override
    public String toString() {
        return "(NOT " + inner + ")";
    }
}

// ============ 上下文 ============
public class RuleContext {
    private final Map<String, Object> data = new HashMap<>();

    public void setValue(String key, Object value) {
        data.put(key, value);
    }

    public Object getValue(String key) {
        Object val = data.get(key);
        if (val == null) {
            throw new IllegalArgumentException("未定义的字段: " + key);
        }
        return val;
    }
}

// ============ 规则解析器 ============
// 简化的规则语法:
//   rule     → comparison (("AND" | "OR") comparison)*
//   comparison → field op value
//   op       → ">" | ">=" | "<" | "<=" | "=" | "!="
//   field    → 标识符
//   value    → 数字 | 带引号的字符串
public class RuleParser {
    private final String input;
    private int pos = 0;

    public RuleParser(String input) {
        this.input = input;
    }

    public BooleanExpression parse() {
        return parseRule();
    }

    private BooleanExpression parseRule() {
        BooleanExpression expr = parseComparison();

        while (pos < input.length()) {
            skipWhitespace();
            if (pos + 3 <= input.length()
                    && input.substring(pos, pos + 3).equalsIgnoreCase("AND")) {
                pos += 3;
                BooleanExpression right = parseComparison();
                expr = new AndExpression(expr, right);
            } else if (pos + 2 <= input.length()
                    && input.substring(pos, pos + 2).equalsIgnoreCase("OR")) {
                pos += 2;
                BooleanExpression right = parseComparison();
                expr = new OrExpression(expr, right);
            } else {
                break;
            }
        }
        return expr;
    }

    private BooleanExpression parseComparison() {
        skipWhitespace();

        // 可选 NOT
        if (pos + 3 <= input.length()
                && input.substring(pos, pos + 3).equalsIgnoreCase("NOT")) {
            pos += 3;
            // 括号表达式或比较
            skipWhitespace();
            if (input.charAt(pos) == '(') {
                pos++; // 消费 '('
                BooleanExpression inner = parseRule();
                skipWhitespace();
                if (input.charAt(pos) != ')') {
                    throw new RuntimeException("缺少右括号");
                }
                pos++; // 消费 ')'
                return new NotExpression(inner);
            }
            return new NotExpression(parseComparison());
        }

        // 括号表达式
        if (input.charAt(pos) == '(') {
            pos++; // 消费 '('
            BooleanExpression expr = parseRule();
            skipWhitespace();
            if (input.charAt(pos) != ')') {
                throw new RuntimeException("缺少右括号");
            }
            pos++; // 消费 ')'
            return expr;
        }

        // 解析 field op value
        String field = parseIdentifier();
        skipWhitespace();

        ComparisonExpression.Operator op = parseOperator();
        skipWhitespace();

        String value;
        if (input.charAt(pos) == '"' || input.charAt(pos) == '\'') {
            value = parseQuotedString();
        } else {
            value = parseIdentifier();
        }

        return new ComparisonExpression(field, op, value);
    }

    private String parseIdentifier() {
        StringBuilder sb = new StringBuilder();
        while (pos < input.length()
                && (Character.isLetterOrDigit(input.charAt(pos))
                    || input.charAt(pos) == '_' || input.charAt(pos) == '.')) {
            sb.append(input.charAt(pos));
            pos++;
        }
        if (sb.isEmpty()) {
            throw new RuntimeException("期望标识符，实际: " + input.charAt(pos));
        }
        return sb.toString();
    }

    private ComparisonExpression.Operator parseOperator() {
        if (pos + 2 <= input.length()) {
            String twoChar = input.substring(pos, pos + 2);
            switch (twoChar) {
                case ">=": pos += 2; return ComparisonExpression.Operator.GTE;
                case "<=": pos += 2; return ComparisonExpression.Operator.LTE;
                case "!=": pos += 2; return ComparisonExpression.Operator.NEQ;
            }
        }
        if (pos < input.length()) {
            char c = input.charAt(pos);
            switch (c) {
                case '>': pos++; return ComparisonExpression.Operator.GT;
                case '<': pos++; return ComparisonExpression.Operator.LT;
                case '=': pos++; return ComparisonExpression.Operator.EQ;
            }
        }
        throw new RuntimeException("期望运算符，实际: " + input.charAt(pos));
    }

    private String parseQuotedString() {
        char quote = input.charAt(pos);
        pos++; // 消费引号
        StringBuilder sb = new StringBuilder();
        while (pos < input.length() && input.charAt(pos) != quote) {
            sb.append(input.charAt(pos));
            pos++;
        }
        if (pos >= input.length()) {
            throw new RuntimeException("字符串未闭合");
        }
        pos++; // 消费引号
        return sb.toString();
    }

    private void skipWhitespace() {
        while (pos < input.length() && Character.isWhitespace(input.charAt(pos))) {
            pos++;
        }
    }
}

// ============ 客户端 ============
public class RuleEngineDemo {
    public static void main(String[] args) {
        RuleContext context = new RuleContext();
        context.setValue("salary", 15000);
        context.setValue("age", 28);
        context.setValue("department", "IT");
        context.setValue("yearsOfService", 3);
        context.setValue("performance", "A");

        String[] rules = {
            "salary > 10000 AND age < 30 AND department = IT",
            "salary > 20000 OR performance = A",
            "NOT (department = HR)",
            "salary >= 15000 AND (yearsOfService > 2 OR performance = A)"
        };

        for (String rule : rules) {
            System.out.println("规则: " + rule);
            RuleParser parser = new RuleParser(rule);
            BooleanExpression expr = parser.parse();
            boolean result = expr.evaluate(context);
            System.out.println("评估结果: " + result);
            System.out.println();
        }
    }
}
```

### 25.3.3 简易SQL解析器

```java
// ============ SQL 查询的 AST 节点 ============
public class SelectStatement {
    private final List<String> columns;     // SELECT 后的列名
    private final String table;              // FROM 后的表名
    private final BooleanExpression where;   // WHERE 条件（可选）

    public SelectStatement(List<String> columns, String table, BooleanExpression where) {
        this.columns = columns;
        this.table = table;
        this.where = where;
    }

    public List<String> getColumns() { return columns; }
    public String getTable() { return table; }
    public BooleanExpression getWhere() { return where; }

    @Override
    public String toString() {
        return "SELECT " + columns + " FROM " + table
                + (where != null ? " WHERE " + where : "");
    }
}

// 简易 SQL 解析器（仅支持 SELECT 语句）
public class SimpleSqlParser {
    private final String sql;
    private int pos = 0;

    public SimpleSqlParser(String sql) {
        this.sql = sql;
    }

    public SelectStatement parse() {
        // SELECT
        expectKeyword("SELECT");
        skipWhitespace();

        // columns
        List<String> columns = parseColumnList();
        skipWhitespace();

        // FROM
        expectKeyword("FROM");
        skipWhitespace();

        // table
        String table = parseIdentifier();
        skipWhitespace();

        // WHERE (optional)
        BooleanExpression where = null;
        if (pos < sql.length() && sql.substring(pos).toUpperCase().startsWith("WHERE")) {
            pos += 5; // 消费 "WHERE"
            skipWhitespace();
            String whereClause = sql.substring(pos);
            RuleParser ruleParser = new RuleParser(whereClause);
            where = ruleParser.parse();
            // 更新 pos
            pos = sql.length();
        }

        return new SelectStatement(columns, table, where);
    }

    private void expectKeyword(String keyword) {
        skipWhitespace();
        if (!sql.substring(pos).toUpperCase().startsWith(keyword)) {
            throw new RuntimeException("期望 " + keyword + "，实际: "
                    + sql.substring(pos, Math.min(pos + 20, sql.length())));
        }
        pos += keyword.length();
    }

    private List<String> parseColumnList() {
        List<String> columns = new ArrayList<>();
        columns.add(parseIdentifier());
        skipWhitespace();
        while (pos < sql.length() && sql.charAt(pos) == ',') {
            pos++; // 消费 ','
            skipWhitespace();
            columns.add(parseIdentifier());
            skipWhitespace();
        }
        return columns;
    }

    private String parseIdentifier() {
        StringBuilder sb = new StringBuilder();
        while (pos < sql.length()
                && (Character.isLetterOrDigit(sql.charAt(pos))
                    || sql.charAt(pos) == '_' || sql.charAt(pos) == '*')) {
            sb.append(sql.charAt(pos));
            pos++;
        }
        if (sb.isEmpty()) {
            throw new RuntimeException("期望标识符，位置: " + pos);
        }
        return sb.toString();
    }

    private void skipWhitespace() {
        while (pos < sql.length() && Character.isWhitespace(sql.charAt(pos))) {
            pos++;
        }
    }
}
```

### 25.3.4 表达式构建器（Fluent API）

```java
// 提供流式 API 构建表达式，避免手动 new 大量对象
public class Expr {
    // 数值字面量
    public static Expression val(int value) {
        return new NumberExpression(value);
    }

    // 变量
    public static Expression var(String name) {
        return new VariableExpression(name);
    }

    // 算术运算
    public static Expression add(Expression a, Expression b) {
        return new AddExpression(a, b);
    }

    public static Expression sub(Expression a, Expression b) {
        return new SubtractExpression(a, b);
    }

    public static Expression mul(Expression a, Expression b) {
        return new MultiplyExpression(a, b);
    }

    public static Expression div(Expression a, Expression b) {
        return new DivideExpression(a, b);
    }

    public static Expression neg(Expression expr) {
        return new NegateExpression(expr);
    }
}

// 使用流式 API 构建表达式树
Expression expr = Expr.add(
    Expr.mul(Expr.val(3), Expr.val(5)),
    Expr.sub(Expr.val(10), Expr.val(4))
);
// 等价于: (3 * 5) + (10 - 4)
System.out.println(expr.interpret(context)); // 输出: 21
```

## 25.4 JDK/框架源码解析

### 25.4.1 java.util.regex.Pattern

`Pattern.compile()` 将正则表达式字符串解析为内部的模式匹配解释器：

```java
// 正则表达式的"文法"远复杂于算术表达式
Pattern pattern = Pattern.compile("^(\\d{3,4}-)?\\d{7,8}$");
// Pattern 内部将正则表达式解析为 Node 树（类似表达式树）
// 节点类型包括：CharProperty, Node, Branch, GroupHead, etc.

Matcher matcher = pattern.matcher("010-12345678");
// Matcher 遍历 Node 树并对输入字符串进行匹配
boolean matches = matcher.matches();
```

### 25.4.2 java.text.Format 层次

```java
// DateFormat 内部解释日期格式模式
DateFormat df = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
// 将模式字符串 yyyy-MM-dd HH:mm:ss 解析为内部的 FieldDelegate 树
// yyyy → 四位年份, MM → 月份, dd → 日, ...

// 每个格式字符对应一个解释步骤
// 类似解释器模式中的 TerminalExpression

// NumberFormat 同理
NumberFormat nf = NumberFormat.getCurrencyInstance(Locale.CHINA);
String formatted = nf.format(12345.67); // "¥12,345.67"
```

### 25.4.3 Spring Expression Language (SpEL)

Spring 的 SpEL 是解释器模式在工业界的完整实现：

```java
// SpEL 解析引擎
ExpressionParser parser = new SpelExpressionParser();

// 解析并求值
Expression exp = parser.parseExpression("'Hello ' + name");
// parser.parseExpression() 将字符串解析为 SpelNodeImpl 树
// SpelNodeImpl 层次包括：
//   - OpPlus, OpMinus, OpMultiply, OpDivide  (算术运算符)
//   - OpEQ, OpNE, OpGT, OpLT, OpLE, OpGE     (关系运算符)
//   - MethodReference                          (方法调用)
//   - PropertyOrFieldReference                 (属性访问)
//   - InlineList, InlineMap                    (集合字面量)
// 这正对应了解释器模式的 NonTerminalExpression 子类

StandardEvaluationContext ctx = new StandardEvaluationContext();
ctx.setVariable("name", "World");
String result = exp.getValue(ctx, String.class);
// result = "Hello World"

// 更复杂的表达式
Expression complex = parser.parseExpression(
    "users?.stream().filter(u -> u.age > 20).collect(toList())"
);
```

### 25.4.4 Hibernate Criteria API

Hibernate 的 Criteria API 将 Java 对象构建的查询条件解释为 SQL：

```java
// Criteria API - 以面向对象方式构建查询
CriteriaBuilder cb = entityManager.getCriteriaBuilder();
CriteriaQuery<User> query = cb.createQuery(User.class);
Root<User> root = query.from(User.class);

// 条件表达式
Predicate condition = cb.and(
    cb.greaterThan(root.get("salary"), 10000),
    cb.lessThan(root.get("age"), 30),
    cb.equal(root.get("department"), "IT")
);

query.select(root).where(condition);
// 最终解释为 SQL:
// SELECT * FROM users WHERE salary > 10000 AND age < 30 AND department = 'IT'
```

### 25.4.5 MVEL 表达式语言

MVEL 是一个强大的表达式解释器：

```java
// MVEL 解释执行表达式
String expression = "firstName + ' ' + lastName";
Map<String, Object> vars = new HashMap<>();
vars.put("firstName", "John");
vars.put("lastName", "Doe");

// 编译 + 执行
Serializable compiled = MVEL.compileExpression(expression);
String result = (String) MVEL.executeExpression(compiled, vars);
// result = "John Doe"
```

## 25.5 使用场景与案例

### 25.5.1 业务规则引擎

业务系统中，规则通常需要由非技术人员维护。解释器模式使业务规则可以用接近自然语言的 DSL 编写：

```java
// 保险核保规则
String rule = "age >= 18 AND age <= 65 AND healthStatus = GOOD AND NOT hasChronicDisease";

// 促销规则
String promotion = "orderAmount > 500 AND (isNewUser OR memberLevel = GOLD)";

// 风控规则
String riskRule = "loginCountLastHour > 20 OR amount > 10000 AND deviceRiskLevel = HIGH";
```

### 25.5.2 搜索查询解析

```java
// 高级搜索语法解析
String searchQuery = "tag:java AND (author:张三 OR date>2024-01-01) AND NOT status:archived";

// 解析为布尔表达式树
// 求值时，从搜索索引中查询每个条件的结果，然后进行布尔运算
```

### 25.5.3 Cron 表达式解析

```java
// Cron 表达式: "0 0/5 * * * ?" (每5分钟执行一次)
// 每个位置对应: 秒 分 时 日 月 周

// 解释器将 Cron 表达式解析为时间匹配规则：
// - 0       → 秒 Terminal: matchSecond(0)
// - 0/5     → 分 NonTerminal: matchEveryN(0, 5)
// - *       → 时 Terminal: matchAny()
// - *       → 日 Terminal: matchAny()
// - *       → 月 Terminal: matchAny()
// - ?       → 周 Terminal: matchAny()
```

### 25.5.4 JSONPath 求值

```java
// JSONPath 表达式: "$.store.book[0].title"
// 解析为路径解释器：
// $          → RootExpression
// .store     → ChildExpression("store")
// .book      → ChildExpression("book")
// [0]        → ArrayIndexExpression(0)
// .title     → ChildExpression("title")

// 求值时顺序执行每个步骤，在 JSON 树中导航
```

## 25.6 潜在风险与问题

### 25.6.1 复杂文法导致类爆炸

对于简单文法（如算术表达式），解释器模式非常优雅。但当语言复杂时，每个文法规则都需要一个类：

```
简单文法: +, -, *, /, 数字         →  约 5 个表达式类
中级文法: +, -, *, /, %, ^, 函数调用  →  约 15 个表达式类
复杂文法: 完整编程语言                  →  数百个表达式类
```

每增加一个运算符或语法结构，就需要新增一个 NonTerminalExpression 类。

### 25.6.2 AST 遍历性能

表达式树在求值时需要递归遍历所有节点。对于深层嵌套的表达式，递归调用栈可能很深：

```java
// 表达式树深度 = 运算符嵌套层数
// 深度 1000 的树可能导致 StackOverflowError

// 优化: 将递归改为迭代（使用显式栈）
```

### 25.6.3 调试困难

解释执行的过程很难调试——没有源代码行号映射，无法设置断点在"源代码的某一行"：

```java
// 输入的字符串:
String rule = "a > 10 AND (b < 20 OR c = 30) AND NOT d = 40";

// 执行到某一步出错时，只能知道是哪个表达式节点出错
// 无法知道是输入字符串的哪个位置导致的
// 需要做额外的位置追踪

// 改进：在 Token 中保存位置信息
public class Token {
    public final TokenType type;
    public final String value;
    public final int line;
    public final int column;  // 保存行列信息便于报错
}
```

### 25.6.4 解析器实现复杂度

实现一个健壮的解析器远比看上去复杂：

```java
// 需要考虑的边界情况:
// 1. 运算符优先级: a + b * c → a + (b * c) 不是 (a + b) * c
// 2. 结合性: a - b - c → (a - b) - c 不是 a - (b - c)
// 3. 括号嵌套: ((((a))))
// 4. 空白处理: "a>10" vs "a > 10"
// 5. 错误恢复: "a + + b" → 用户友好的错误提示
// 6. 空输入处理
```

## 25.7 优化策略

### 25.7.1 使用现成的表达式引擎

除非有特殊需求，否则优先选择现有的成熟引擎：

```java
// 1. Spring SpEL (Spring 项目首选)
ExpressionParser parser = new SpelExpressionParser();
Expression exp = parser.parseExpression("#salary > 10000 AND #age < 30");

// 2. MVEL (独立项目，轻量级)
Serializable compiled = MVEL.compileExpression("salary > 10000 && age < 30");

// 3. Groovy (完整脚本能力)
GroovyShell shell = new GroovyShell();
Object result = shell.evaluate("if (salary > 10000) { return 'high'; }");

// 4. Aviator (高性能表达式引擎)
Expression exp = AviatorEvaluator.compile("a > 10 && b < 20");
Map<String, Object> env = new HashMap<>();
env.put("a", 15);
env.put("b", 25);
Boolean result = (Boolean) exp.execute(env);
```

### 25.7.2 表达式缓存

对于频繁执行的表达式，缓存编译后的 AST：

```java
public class ExpressionCache {
    private final Map<String, Expression> cache = new ConcurrentHashMap<>();

    public Expression compile(String expression) {
        return cache.computeIfAbsent(expression, expr -> {
            Lexer lexer = new Lexer(expr);
            Parser parser = new Parser(lexer.tokenize());
            return parser.parse();
        });
    }

    // 使用: 解析一次，多次求值
    Expression ast = cache.compile("x * (y + 10)");
    for (int i = 0; i < 1000; i++) {
        context.setVariable("x", i);
        context.setVariable("y", i * 2);
        int result = ast.interpret(context);
    }
}
```

### 25.7.3 JIT 即时编译

对于热点表达式，可以将 AST 编译为 Java 字节码或生成 Java 代码：

```java
// 思路: 将表达式编译为 Java 代码字符串
// 表达式: "x * (y + 10)"
// 生成:
// public class GeneratedExpression implements Expression {
//     public int interpret(Context ctx) {
//         int x = (int) ctx.getVariable("x");
//         int y = (int) ctx.getVariable("y");
//         return x * (y + 10);
//     }
// }

// 使用 Java Compiler API 编译并加载
JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
// ... 编译生成的源码
// 生成的字节码执行效率接近手写代码
```

### 25.7.4 使用 ANTLR/JavaCC

对于复杂文法，使用解析器生成器：

```java
// ANTLR 文法定义 (Expr.g4):
/*
grammar Expr;

expr    : term (('+' | '-') term)* ;
term    : factor (('*' | '/') factor)* ;
factor  : NUMBER
        | IDENTIFIER
        | '(' expr ')'
        | '-' factor
        ;

NUMBER  : [0-9]+ ;
IDENTIFIER : [a-zA-Z_][a-zA-Z0-9_]* ;
WS      : [ \t\r\n]+ -> skip ;
*/

// ANTLR 自动生成 Lexer 和 Parser
// 手动实现 Visitor 或 Listener 来构建 AST
ExprLexer lexer = new ExprLexer(CharStreams.fromString("(3 + 5) * 2"));
CommonTokenStream tokens = new CommonTokenStream(lexer);
ExprParser parser = new ExprParser(tokens);
ParseTree tree = parser.expr();

// 使用 Visitor 模式访问解析树
Integer result = new EvalVisitor().visit(tree);
```

### 25.7.5 何时不该使用解释器模式

```java
// 不要用解释器模式的情况:

// 1. 简单 if-else 逻辑
// 反例: 用解释器模式解析 "type == A || type == B"
// 正例:
if (type == "A" || type == "B") { /* ... */ }

// 2. 规则固定不变
// 如果用不到 DSL 的灵活性，不要引入解释器
// 硬编码规则更简单、更高效

// 3. 规则由开发人员编写而非业务用户
// 开发人员可以直接写代码，不需要 DSL 解析
```

## 25.8 本章小结

解释器模式通过将文法规则映射为类层次结构，为 DSL 的解析和执行提供了优雅的解决方案。其核心是**表达式树**——每个语法结构对应一个节点，求值过程即递归遍历树的过程。

实际应用中，自制解释器通常只适用于简单文法。对于复杂需求，SpEL、MVEL、Groovy 等成熟引擎更值得信赖。当表达式性能至关重要时，可考虑将热点表达式 JIT 编译为字节码。

选择解释器模式的关键在于**权衡**：DSL 的灵活性能否抵消解析器的开发维护成本？如果规则数量有限且变化不频繁，硬编码或简单的配置驱动方案可能更合适。
