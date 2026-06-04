package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"go-book/demo/rest-api/handler"
	"go-book/demo/rest-api/middleware"
	"go-book/demo/rest-api/model"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

func main() {
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "postgres")
	dbName := getEnv("DB_NAME", "blog")
	jwtSecret := getEnv("JWT_SECRET", "my-secret-key")

	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Connected to PostgreSQL")

	// Initialize dependencies
	postStore := model.NewPostStore(db)
	postHandler := handler.NewPostHandler(postStore)
	authHandler := handler.NewAuthHandler(jwtSecret)

	// Setup Gin router
	r := gin.Default()

	// Public routes
	r.POST("/api/login", authHandler.Login)

	// Protected routes
	api := r.Group("/api", middleware.JWTAuth(jwtSecret))
	{
		api.GET("/posts", postHandler.ListPosts)
		api.GET("/posts/:id", postHandler.GetPost)
		api.POST("/posts", postHandler.CreatePost)
		api.PUT("/posts/:id", postHandler.UpdatePost)
		api.DELETE("/posts/:id", postHandler.DeletePost)
	}

	port := getEnv("PORT", "8080")
	log.Printf("Server starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}