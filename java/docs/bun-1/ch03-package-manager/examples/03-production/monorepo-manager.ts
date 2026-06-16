interface Package {
  name: string;
  path: string;
  version: string;
  dependencies: Record<string, string>;
}

class MonorepoManager {
  packages: Package[] = [];

  async scan(rootDir: string): Promise<void> {
    const { readdir, stat } = require("fs").promises;
    const entries = await readdir(rootDir);

    for (const entry of entries) {
      const pkgPath = `${rootDir}/${entry}`;
      const pkgJsonPath = `${pkgPath}/package.json`;
      const stats = await stat(pkgPath).catch(() => null);
      if (stats?.isDirectory()) {
        const pkgJson = Bun.file(pkgJsonPath);
        if (await pkgJson.exists()) {
          const pkg = await pkgJson.json();
          this.packages.push({
            name: pkg.name,
            path: pkgPath,
            version: pkg.version,
            dependencies: pkg.dependencies || {},
          });
        }
      }
    }
  }

  list(): void {
    console.log("Monorepo Packages:");
    console.table(this.packages.map(p => ({
      name: p.name,
      version: p.version,
      deps: Object.keys(p.dependencies).length,
    })));
  }

  findDependents(packageName: string): string[] {
    return this.packages
      .filter(p => Object.keys(p.dependencies).includes(packageName))
      .map(p => p.name);
  }

  detectCycles(): string[][] {
    // Simple cycle detection via DFS
    const visited = new Set<string>();
    const cycles: string[][] = [];

    function dfs(current: string, path: string[], pkgs: Map<string, Package>): void {
      if (path.includes(current)) {
        cycles.push([...path.slice(path.indexOf(current)), current]);
        return;
      }
      if (visited.has(current)) return;
      visited.add(current);

      const pkg = pkgs.get(current);
      if (pkg) {
        for (const dep of Object.keys(pkg.dependencies)) {
          dfs(dep, [...path, current], pkgs);
        }
      }
    }

    const pkgMap = new Map(this.packages.map(p => [p.name, p]));
    for (const pkg of this.packages) {
      dfs(pkg.name, [], pkgMap);
    }

    return cycles;
  }
}

// Demo
const manager = new MonorepoManager();
await manager.scan("/app/examples/03-production/mock-repo");
manager.list();

const cycles = manager.detectCycles();
if (cycles.length > 0) {
  console.log("Detected circular dependencies:", cycles);
} else {
  console.log("No circular dependencies detected.");
}
