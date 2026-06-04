package model

import (
	"database/sql"
	"time"
)

// Post represents a blog post entity.
type Post struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Author    string    `json:"author"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PostStore handles database operations for posts.
type PostStore struct {
	DB *sql.DB
}

// NewPostStore creates a new PostStore.
func NewPostStore(db *sql.DB) *PostStore {
	return &PostStore{DB: db}
}

// GetAll returns all posts ordered by creation time descending.
func (s *PostStore) GetAll() ([]Post, error) {
	rows, err := s.DB.Query(
		"SELECT id, title, content, author, created_at, updated_at FROM posts ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var p Post
		if err := rows.Scan(&p.ID, &p.Title, &p.Content, &p.Author, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		posts = append(posts, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if posts == nil {
		posts = []Post{}
	}
	return posts, nil
}

// GetByID returns a single post by its ID.
func (s *PostStore) GetByID(id int64) (*Post, error) {
	var p Post
	err := s.DB.QueryRow(
		"SELECT id, title, content, author, created_at, updated_at FROM posts WHERE id = $1", id,
	).Scan(&p.ID, &p.Title, &p.Content, &p.Author, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

// Create inserts a new post and returns it with the generated ID.
func (s *PostStore) Create(title, content, author string) (*Post, error) {
	var p Post
	err := s.DB.QueryRow(
		"INSERT INTO posts (title, content, author) VALUES ($1, $2, $3) RETURNING id, title, content, author, created_at, updated_at",
		title, content, author,
	).Scan(&p.ID, &p.Title, &p.Content, &p.Author, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// Update modifies an existing post and returns the updated row.
func (s *PostStore) Update(id int64, title, content string) (*Post, error) {
	var p Post
	err := s.DB.QueryRow(
		"UPDATE posts SET title = $1, content = $2, updated_at = NOW() WHERE id = $3 RETURNING id, title, content, author, created_at, updated_at",
		title, content, id,
	).Scan(&p.ID, &p.Title, &p.Content, &p.Author, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

// Delete removes a post by ID and returns the number of rows affected.
func (s *PostStore) Delete(id int64) (int64, error) {
	result, err := s.DB.Exec("DELETE FROM posts WHERE id = $1", id)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}