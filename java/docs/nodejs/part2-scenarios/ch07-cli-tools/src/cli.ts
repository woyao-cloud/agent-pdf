#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { buildCommand } from './commands/build.js';

const program = new Command();
program
  .name('my-cli')
  .description('A scaffold CLI tool for Node.js projects')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize a new project')
  .argument('[name]', 'project name')
  .option('-t, --template <type>', 'template type (ts/js)', 'ts')
  .action(initCommand);

program
  .command('build')
  .description('Build the project')
  .option('-w, --watch', 'watch mode')
  .action(buildCommand);

program.parse();