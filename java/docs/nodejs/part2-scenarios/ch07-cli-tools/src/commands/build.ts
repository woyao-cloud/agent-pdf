import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'node:child_process';

interface BuildOptions {
  watch?: boolean;
}

export async function buildCommand(options: BuildOptions) {
  const spinner = ora({
    text: chalk.cyan('Building project...'),
    color: 'cyan',
  }).start();

  try {
    const args = ['npx', 'tsc'];
    if (options.watch) {
      args.push('--watch');
    }

    execSync(args.join(' '), {
      stdio: options.watch ? 'inherit' : 'pipe',
      cwd: process.cwd(),
    });

    spinner.succeed(chalk.green('Build completed successfully'));
  } catch (err) {
    spinner.fail(chalk.red('Build failed'));
    if (err instanceof Error) {
      console.error(chalk.red(err.message));
    }
    process.exit(1);
  }
}