# fsearch — File Search CLI

A fast, recursive file search CLI tool built with Go and Cobra.

## Features

- Recursive directory search with pattern matching
- File extension filtering (`--ext`)
- Colorized output (`--color`)
- Configurable max depth (`--max-depth`)
- Progress spinner during search
- Configuration management (`config init` / `config show`)

## Quick Start

```bash
# Build
go build -o fsearch .

# Search current directory
./fsearch search "func main"

# Search a specific directory with .go extension filter
./fsearch search "http.Handle" ./myproject --ext ".go"

# Colored output (default: on)
./fsearch search "error" --color=true

# Limit recursion depth
./fsearch search "TODO" --max-depth 2
```

## Commands

```
fsearch search [pattern] [directory]   Search files for a pattern
fsearch config init                    Create default config
fsearch config show                    Display current config
```

## Flags

| Flag          | Type   | Default | Description                        |
|---------------|--------|---------|------------------------------------|
| `--ext`       | string | ""      | File extension filter              |
| `--color`     | bool   | true    | Enable/disable color output        |
| `--max-depth` | int    | -1      | Max recursion depth (-1 unlimited) |
| `--verbose`   | bool   | false   | Verbose output                     |
| `--config`    | string | ""      | Path to config file                |

## Docker Build

```bash
# Build the Docker image (~15MB)
docker build -t fsearch .

# Run in container
docker run --rm -v $(pwd):/data fsearch search "pattern" /data
```

## Config File

Default location: `~/.config/fsearch/config.yaml`

```yaml
default_dir: ""
default_ext: ".go,.md"
default_max_depth: -1
color: true
```