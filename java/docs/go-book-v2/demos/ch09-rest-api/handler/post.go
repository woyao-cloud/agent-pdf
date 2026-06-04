package handler

import (
	"net/http"
	"strconv"

	"go-book/demo/rest-api/model"

	"github.com/gin-gonic/gin"
)

// PostHandler handles HTTP requests for the /api/posts resource.
type PostHandler struct {
	Store *model.PostStore
}

// NewPostHandler creates a new PostHandler.
func NewPostHandler(store *model.PostStore) *PostHandler {
	return &PostHandler{Store: store}
}

// CreatePostRequest is the expected JSON body for creating a post.
type CreatePostRequest struct {
	Title   string `json:"title" binding:"required"`
	Content string `json:"content" binding:"required"`
	Author  string `json:"author" binding:"required"`
}

// UpdatePostRequest is the expected JSON body for updating a post.
type UpdatePostRequest struct {
	Title   string `json:"title" binding:"required"`
	Content string `json:"content" binding:"required"`
}

// ListPosts handles GET /api/posts — returns all posts.
func (h *PostHandler) ListPosts(c *gin.Context) {
	posts, err := h.Store.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch posts"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": posts})
}

// GetPost handles GET /api/posts/:id — returns a single post.
func (h *PostHandler) GetPost(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid post id"})
		return
	}

	post, err := h.Store.GetByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch post"})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "post not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": post})
}

// CreatePost handles POST /api/posts — creates a new post.
func (h *PostHandler) CreatePost(c *gin.Context) {
	var req CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	post, err := h.Store.Create(req.Title, req.Content, req.Author)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create post"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": post})
}

// UpdatePost handles PUT /api/posts/:id — updates an existing post.
func (h *PostHandler) UpdatePost(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid post id"})
		return
	}

	var req UpdatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	post, err := h.Store.Update(id, req.Title, req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update post"})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "post not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": post})
}

// DeletePost handles DELETE /api/posts/:id — deletes a post.
func (h *PostHandler) DeletePost(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid post id"})
		return
	}

	affected, err := h.Store.Delete(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete post"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "post not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "post deleted"})
}