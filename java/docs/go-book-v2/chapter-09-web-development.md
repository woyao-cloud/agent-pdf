# 第9章 Web应用开发

## 概述

"我想用Go写一个Web API" — 这是Go语言最经典的应用场景。凭借出色的并发模型、快速的编译速度和简洁的部署方式，Go已经成为构建后端服务的主流选择之一。

Go的标准库 `net/http` 提供了构建Web服务所需的核心能力，包括HTTP路由、请求处理、响应输出等。许多流行的Web框架（如Gin、Echo、Fiber）也在此基础上封装了更便捷的开发体验。

本章将从标准库原理开始，逐步带你掌握如何使用Go开发RESTful API，涵盖路由设计、数据库操作、JWT认证等关键主题，并通过一个完整的博客API项目串联全部知识点。

---

## 9.1 net/http标准库原理

Go的标准库 `net/http` 是构建Web服务的基石。理解它的设计理念，能让你在使用任何Web框架时都更加得心应手。

### 9.1.1 Handler接口

`net/http` 的核心是一个接口：`http.Handler`。任何实现了该接口的类型都可以处理HTTP请求：

```go
type Handler interface {
    ServeHTTP(w http.ResponseWriter, r *http.Request)
}
```

`http.ResponseWriter` 用于构建响应（写入状态码、Header、Body），`*http.Request` 则包含了客户端的请求信息（方法、URL、Header、Body等）。

下面是一个最简单的HTTP服务器：

```go
package main

import (
    "fmt"
    "net/http"
)

type helloHandler struct{}

func (h helloHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Hello, %s!", r.URL.Path[1:])
}

func main() {
    http.Handle("/", helloHandler{})
    http.ListenAndServe(":8080", nil)
}
```

`http.HandleFunc` 是一个便捷包装，让普通函数也能作为Handler使用：

```go
http.HandleFunc("/hello", func(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("Hello, World!"))
})
```

### 9.1.2 ServeMux路由

`http.ServeMux` 是标准库内置的路由器（multiplexer）。它将请求的URL路径匹配到对应的Handler：

```go
mux := http.NewServeMux()
mux.HandleFunc("/api/users", listUsers)
mux.HandleFunc("/api/posts", handlePosts)
http.ListenAndServe(":8080", mux)
```

注意：标准库的ServeMux只支持路径匹配，不支持路径参数（如 `/api/posts/:id`）和方法路由。你需要手动从 `r.Method` 和 `r.URL.Path` 中解析，这也是为什么在实际项目中通常选择第三方框架的原因。

### 9.1.3 中间件模式

中间件（Middleware）是Web开发中非常实用的模式，用于在请求处理前后执行通用逻辑（日志、认证、恢复等）。

中间件的本质是一个函数，接收一个 `http.Handler`，返回一个新的 `http.Handler`：

```go
func loggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 请求前
        start := time.Now()

        // 调用下一个Handler
        next.ServeHTTP(w, r)

        // 请求后
        log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
    })
}
```

多个中间件可以链式组合：

```go
http.ListenAndServe(":8080", loggingMiddleware(authMiddleware(mux)))
```

---

## 9.2 典型框架对比

虽然标准库已经足够强大，但在实际项目中，使用成熟的Web框架能显著提升开发效率。以下是几个最流行的Go Web框架：

| 框架 | 特点 | 适合场景 |
|------|------|----------|
| **Gin** | 最流行的Go框架，性能优秀，文档丰富，社区庞大 | 通用Web API，RESTful服务 |
| **Echo** | 性能比Gin略高，API更简洁，内置中间件丰富 | 对性能有较高要求的场景 |
| **Fiber** | 灵感来自Express.js，API风格相似，零内存分配 | Node.js转Go的开发者，熟悉Express |

本书的Demo将使用 **Gin**，因为它拥有最大的社区和最丰富的学习资源。

---

## 9.3 RESTful API开发

RESTful API是目前最主流的Web API设计风格。本节以Gin框架为例，演示如何实现一套完整的RESTful API。

### 9.3.1 路由设计

Gin使用直观的API来注册路由：

```go
r := gin.Default()

// 资源列表
r.GET("/api/posts", listPosts)

// 单个资源
r.GET("/api/posts/:id", getPost)

// 创建资源
r.POST("/api/posts", createPost)

// 更新资源
r.PUT("/api/posts/:id", updatePost)

// 删除资源
r.DELETE("/api/posts/:id", deletePost)
```

`:id` 是路径参数，Gin会自动将其解析到 `c.Param("id")`。

### 9.3.2 请求参数绑定

Gin支持自动将请求参数绑定到结构体，支持JSON、表单、查询参数等：

```go
type CreatePostInput struct {
    Title   string `json:"title" binding:"required"`
    Content string `json:"content" binding:"required"`
    Author  string `json:"author" binding:"required"`
}

func createPost(c *gin.Context) {
    var input CreatePostInput
    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    // 使用input创建文章...
}
```

### 9.3.3 响应格式化

统一的响应格式能让API更规范：

```go
func SuccessResponse(c *gin.Context, data interface{}) {
    c.JSON(200, gin.H{"code": 0, "message": "success", "data": data})
}

func ErrorResponse(c *gin.Context, status int, msg string) {
    c.JSON(status, gin.H{"code": -1, "message": msg})
}
```

---

## 9.4 数据库操作

### 9.4.1 database/sql标准库

Go标准库 `database/sql` 提供了通用的SQL数据库操作接口。配合具体的数据库驱动（如 `lib/pq` for PostgreSQL），可以执行SQL查询：

```go
import (
    "database/sql"
    _ "github.com/lib/pq"
)

db, err := sql.Open("postgres", "host=localhost port=5432 user=postgres password=postgres dbname=blog sslmode=disable")
if err != nil {
    log.Fatal(err)
}
defer db.Close()

// 查询单行
var title string
err = db.QueryRow("SELECT title FROM posts WHERE id = $1", 1).Scan(&title)

// 查询多行
rows, err := db.Query("SELECT id, title, content FROM posts")
if err != nil {
    log.Fatal(err)
}
defer rows.Close()

for rows.Next() {
    var p Post
    err := rows.Scan(&p.ID, &p.Title, &p.Content)
    // ...
}
```

### 9.4.2 GORM基础

GORM是Go最流行的ORM框架，提供了更便捷的操作方式：

```go
import "gorm.io/gorm"

type Post struct {
    ID        uint      `gorm:"primaryKey"`
    Title     string
    Content   string
    Author    string
    CreatedAt time.Time
}

// CRUD操作
db.Create(&Post{Title: "Hello", Content: "World", Author: "Alice"})

var post Post
db.First(&post, 1)

db.Model(&post).Update("Title", "New Title")

db.Delete(&post)
```

---

## 9.5 认证与授权

JWT（JSON Web Token）是目前最流行的无状态认证方案。在Gin中实现JWT中间件的核心代码如下：

```go
func AuthMiddleware(jwtSecret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        tokenStr := c.GetHeader("Authorization")
        if tokenStr == "" || !strings.HasPrefix(tokenStr, "Bearer ") {
            c.JSON(401, gin.H{"error": "unauthorized"})
            c.Abort()
            return
        }

        tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")
        token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
            if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                return nil, fmt.Errorf("unexpected signing method")
            }
            return []byte(jwtSecret), nil
        })

        if err != nil || !token.Valid {
            c.JSON(401, gin.H{"error": "invalid token"})
            c.Abort()
            return
        }

        c.Next()
    }
}
```

登录生成Token：

```go
func loginHandler(c *gin.Context) {
    // 验证用户名密码...
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
        "username": "admin",
        "exp":      time.Now().Add(24 * time.Hour).Unix(),
    })
    tokenStr, _ := token.SignedString([]byte("your-secret"))
    c.JSON(200, gin.H{"token": tokenStr})
}
```

---

## 常见问题与处理

### 1. JSON序列化小写字段

Go结构体字段默认以大写字母开头（公开字段），但JSON通常使用小写或驼峰命名。通过struct tag解决：

```go
type Post struct {
    ID        int64     `json:"id"`
    Title     string    `json:"title"`
    Content   string    `json:"content"`
    CreatedAt time.Time `json:"created_at"`
}
```

### 2. 数据库连接泄漏

使用 `database/sql` 查询多行数据时，必须调用 `rows.Close()`，否则会导致连接泄漏：

```go
rows, err := db.Query("SELECT ...")
if err != nil {
    return err
}
// 重要：及时关闭
defer rows.Close()

for rows.Next() {
    // 处理数据...
}
// 检查迭代错误
if err = rows.Err(); err != nil {
    return err
}
```

### 3. CORS跨域配置

前后端分离时，前端请求通常会触发浏览器的CORS机制。Gin中可以使用社区中间件：

```go
import "github.com/gin-contrib/cors"

r := gin.Default()
r.Use(cors.New(cors.Config{
    AllowOrigins:     []string{"http://localhost:3000"},
    AllowMethods:     []string{"GET", "POST", "PUT", "DELETE"},
    AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
    AllowCredentials: true,
}))
```

---

## 小结

本章涵盖了Go Web开发的核心内容：

- **net/http标准库**：理解了Handler接口、ServeMux路由和中间件模式的设计哲学
- **常用框架**：Gin、Echo、Fiber的简要对比
- **RESTful API设计**：路由注册、参数绑定、响应格式化
- **数据库操作**：`database/sql`标准库和GORM的CRUD用法
- **JWT认证**：基于Token的无状态认证实现
- **常见问题**：JSON序列化、连接泄漏、CORS配置

本章配套的Demo项目 `demos/ch09-rest-api/` 是一个完整的RESTful博客API，使用Gin + PostgreSQL + JWT，可以通过 Docker Compose 一键启动。