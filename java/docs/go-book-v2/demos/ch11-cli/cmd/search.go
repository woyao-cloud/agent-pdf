package cmd

import (
	"fmt"
	"os"
	"strings"
	"time"

	"go-book/demo/cli/pkg/searcher"
	"go-book/demo/cli/pkg/spinner"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	extFilter string
	colorOut  bool
	maxDepth  int
)

// searchCmd represents the search command.
var searchCmd = &cobra.Command{
	Use:   "search [pattern] [directory]",
	Short: "Search files for a pattern",
	Long: `Recursively search files in a directory matching the given pattern.

If no directory is provided, the current working directory is used.
Use --ext to filter by file extension (comma-separated, e.g. ".go,.md").
Use --color to enable/disable colored output.
Use --max-depth to limit directory recursion depth (-1 = unlimited).`,
	Args: cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		pattern := args[0]

		dir := "."
		if len(args) > 1 {
			dir = args[1]
		}

		// Validate directory.
		info, err := os.Stat(dir)
		if err != nil {
			return fmt.Errorf("cannot access directory %q: %w", dir, err)
		}
		if !info.IsDir() {
			return fmt.Errorf("%q is not a directory", dir)
		}

		// Parse extension filter.
		var exts []string
		if extFilter != "" {
			exts = strings.Split(extFilter, ",")
			for i := range exts {
				exts[i] = strings.TrimSpace(exts[i])
				if !strings.HasPrefix(exts[i], ".") {
					exts[i] = "." + exts[i]
				}
			}
		}

		if verbose {
			fmt.Printf("Searching for %q in %s (ext=%v, depth=%d)\n", pattern, dir, exts, maxDepth)
		}

		// Start spinner in background.
		sp := spinner.New("Searching...")
		done := make(chan struct{})
		go sp.Run(done)

		start := time.Now()
		results, err := searcher.Search(dir, pattern, exts, maxDepth)
		close(done)
		// Wait for spinner to flush.
		time.Sleep(50 * time.Millisecond)
		// Clear spinner line.
		fmt.Print("\r" + strings.Repeat(" ", 40) + "\r")

		if err != nil {
			return fmt.Errorf("search error: %w", err)
		}

		// Print results.
		elapsed := time.Since(start)
		if len(results) == 0 {
			fmt.Printf("No matches found for %q (%.2fs)\n", pattern, elapsed.Seconds())
			return nil
		}

		fmt.Printf("Found %d match(es) in %.2fs:\n\n", len(results), elapsed.Seconds())
		for _, r := range results {
			printResult(r)
		}

		return nil
	},
}

func printResult(r searcher.Result) {
	if colorOut && color.NoColor == false {
		cyan := color.New(color.FgCyan).SprintFunc()
		yellow := color.New(color.FgYellow).SprintFunc()
		red := color.New(color.FgRed).SprintFunc()
		fmt.Printf("%s:%s: %s\n", cyan(r.File), yellow(fmt.Sprintf("%d", r.Line)), red(r.Content))
	} else {
		fmt.Printf("%s:%d: %s\n", r.File, r.Line, r.Content)
	}
}

func init() {
	searchCmd.Flags().StringVar(&extFilter, "ext", "", "file extension filter (e.g. \".go,.md\")")
	searchCmd.Flags().BoolVar(&colorOut, "color", true, "enable color output")
	searchCmd.Flags().IntVar(&maxDepth, "max-depth", -1, "max search depth (-1 = unlimited)")

	rootCmd.AddCommand(searchCmd)
}