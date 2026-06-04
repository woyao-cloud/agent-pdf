# RESTful Blog API

A demo RESTful blog API built with Go and Gin, featuring JWT authentication and PostgreSQL storage.

## Quick Start

```bash
docker-compose up --build
```

This starts both the Go API server (port 8080) and a PostgreSQL instance.

## API Endpoints

### Authentication

Login with demo credentials to get a JWT token:

```bash
curl -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'
```

Response:
```json
{"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Posts (require Authorization header)

**Create a post:**
```bash
curl -X POST http://localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"title":"Hello World","content":"This is my first post","author":"Alice"}'
```

**List all posts:**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8080/api/posts
```

**Get a single post:**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8080/api/posts/1
```

**Update a post:**
```bash
curl -X PUT http://localhost:8080/api/posts/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"title":"Updated Title","content":"Updated content"}'
```

**Delete a post:**
```bash
curl -X DELETE http://localhost:8080/api/posts/1 \
  -H "Authorization: Bearer <TOKEN>"
```

## Quick Test Script

```bash
# Step 1: Login
TOKEN=$(curl -s -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}' | jq -r '.token')

# Step 2: Create a post
curl -X POST http://localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Demo Post","content":"Hello from curl","author":"Admin"}'

# Step 3: List posts
curl -s http://localhost:8080/api/posts \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## Project Structure

```
ch09-rest-api/
├── main.go              # Entry point, router setup
├── go.mod / go.sum      # Go module files
├── Dockerfile           # Multi-stage build
├── docker-compose.yml   # App + PostgreSQL
├── init.sql             # Database schema
├── handler/
│   ├── post.go          # Post CRUD handlers
│   └── auth.go          # Login handler
├── middleware/
│   ├── jwt.go           # JWT authentication middleware
│   └── logging.go       # Request logging middleware
└── model/
    └── post.go          # Post struct and database operations
```