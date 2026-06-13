import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

interface InitOptions {
  name?: string;
  template: 'ts' | 'js';
}

interface Answers {
  projectName: string;
  templateType: 'ts' | 'js';
  initGit: boolean;
}

export async function initCommand(name: string | undefined, options: InitOptions) {
  const answers = await inquirer.prompt<Answers>([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: name || 'my-project',
      validate: (input: string) => {
        if (!input.trim()) return 'Project name cannot be empty';
        if (!/^[a-z0-9_-]+$/i.test(input.trim())) return 'Project name must only contain letters, numbers, hyphens, and underscores';
        return true;
      },
    },
    {
      type: 'list',
      name: 'templateType',
      message: 'Template type:',
      choices: [
        { name: 'TypeScript', value: 'ts' },
        { name: 'JavaScript', value: 'js' },
      ],
      default: options.template,
    },
    {
      type: 'confirm',
      name: 'initGit',
      message: 'Initialize a git repository?',
      default: true,
    },
  ]);

  const projectDir = path.resolve(process.cwd(), answers.projectName);
  const spinner = ora('Creating project...').start();

  try {
    await fs.mkdir(projectDir, { recursive: true });

    const packageJson = {
      name: answers.projectName,
      version: '0.1.0',
      private: true,
      type: answers.templateType === 'ts' ? 'module' : 'commonjs',
      scripts: {
        start: answers.templateType === 'ts' ? 'tsx src/index.ts' : 'node src/index.js',
      },
    };

    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    );

    const srcDir = path.join(projectDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    const ext = answers.templateType === 'ts' ? 'ts' : 'js';
    const entryContent = answers.templateType === 'ts'
      ? 'console.log("Hello, TypeScript!");\n'
      : 'console.log("Hello, JavaScript!");\n';

    await fs.writeFile(path.join(srcDir, `index.${ext}`), entryContent);

    if (answers.templateType === 'ts') {
      const tsconfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          outDir: 'dist',
          rootDir: 'src',
        },
        include: ['src/**/*'],
      };
      await fs.writeFile(
        path.join(projectDir, 'tsconfig.json'),
        JSON.stringify(tsconfig, null, 2),
      );
    }

    if (answers.initGit) {
      spinner.text = 'Initializing git repository...';
      try {
        execSync('git init', { cwd: projectDir, stdio: 'ignore' });
        await fs.writeFile(
          path.join(projectDir, '.gitignore'),
          'node_modules/\ndist/\n.env\n',
        );
      } catch {
        spinner.warn('Git not available, skipping git init');
      }
    }

    spinner.succeed(`Project "${answers.projectName}" created at ${projectDir}`);
  } catch (err) {
    spinner.fail('Failed to create project');
    throw err;
  }
}