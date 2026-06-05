package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

const defaultConfig = `# fsearch configuration
# Default search directory (empty = current directory)
default_dir: ""
# Default file extension filter (e.g. ".go,.md")
default_ext: ""
# Default max depth (-1 = unlimited)
default_max_depth: -1
# Enable color output by default
color: true
`

func configDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".config", "fsearch")
	return dir, nil
}

func configPath() (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.yaml"), nil
}

// configCmd represents the config command.
var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage fsearch configuration",
	Long:  `View and manage fsearch configuration defaults.`,
}

// configInitCmd represents the 'config init' sub-command.
var configInitCmd = &cobra.Command{
	Use:   "init",
	Short: "Create a default config file",
	Long:  `Create a default configuration file in ~/.config/fsearch/config.yaml.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		dir, err := configDir()
		if err != nil {
			return err
		}
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("cannot create config directory: %w", err)
		}

		path, err := configPath()
		if err != nil {
			return err
		}

		if _, err := os.Stat(path); err == nil {
			return fmt.Errorf("config file already exists at %s", path)
		}

		if err := os.WriteFile(path, []byte(defaultConfig), 0644); err != nil {
			return fmt.Errorf("cannot write config file: %w", err)
		}

		fmt.Printf("Default config created at %s\n", path)
		return nil
	},
}

// configShowCmd represents the 'config show' sub-command.
var configShowCmd = &cobra.Command{
	Use:   "show",
	Short: "Display current configuration",
	Long:  `Display the contents of the fsearch configuration file.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		path, err := configPath()
		if err != nil {
			return err
		}

		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("config file not found at %s (use 'fsearch config init' to create one)", path)
			}
			return fmt.Errorf("cannot read config file: %w", err)
		}

		fmt.Printf("Config file: %s\n", path)
		fmt.Println("---")
		fmt.Print(string(data))
		return nil
	},
}

func init() {
	configCmd.AddCommand(configInitCmd)
	configCmd.AddCommand(configShowCmd)

	rootCmd.AddCommand(configCmd)
}