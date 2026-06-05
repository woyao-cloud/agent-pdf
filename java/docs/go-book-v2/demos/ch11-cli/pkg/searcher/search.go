package searcher

import (
	"bufio"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Result represents a single match found during search.
type Result struct {
	File    string
	Line    int
	Content string
}

// Search recursively walks the given directory and searches files for the pattern.
// It filters by extension (exts), limits recursion depth, and returns matching results.
func Search(rootDir, pattern string, exts []string, maxDepth int) ([]Result, error) {
	pattern = strings.ToLower(pattern)
	var results []Result

	err := filepath.WalkDir(rootDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			// Skip files/directories we cannot access.
			return nil
		}

		// Check depth.
		if maxDepth >= 0 {
			rel, err := filepath.Rel(rootDir, path)
			if err == nil && rel != "." {
				depth := len(strings.Split(rel, string(filepath.Separator)))
				if depth > maxDepth {
					if d.IsDir() {
						return fs.SkipDir
					}
					return nil
				}
			}
		}

		// Skip directories and hidden files.
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".") && d.Name() != "." {
				return fs.SkipDir
			}
			return nil
		}

		// Skip hidden files.
		if strings.HasPrefix(d.Name(), ".") {
			return nil
		}

		// Extension filter.
		if len(exts) > 0 {
			ext := filepath.Ext(d.Name())
			if !contains(exts, ext) {
				return nil
			}
		}

		// Search the file.
		fileResults, err := searchFile(path, pattern)
		if err != nil {
			return nil // skip unreadable files
		}
		results = append(results, fileResults...)
		return nil
	})

	return results, err
}

// searchFile opens a file and scans each line for the pattern.
func searchFile(path, pattern string) ([]Result, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var results []Result
	scanner := bufio.NewScanner(f)
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		if strings.Contains(strings.ToLower(line), pattern) {
			results = append(results, Result{
				File:    path,
				Line:    lineNum,
				Content: strings.TrimSpace(line),
			})
		}
	}

	if err := scanner.Err(); err != nil {
		return results, err
	}

	return results, nil
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}