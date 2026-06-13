import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '..', 'src', 'cli.ts');

describe('CLI', () => {
  it('should show help', async () => {
    const { stdout } = await execa('npx', ['tsx', cliPath, '--help']);
    expect(stdout).toContain('my-cli');
    expect(stdout).toContain('init');
    expect(stdout).toContain('build');
  });

  it('should show version', async () => {
    const { stdout } = await execa('npx', ['tsx', cliPath, '--version']);
    expect(stdout).toContain('1.0.0');
  });

  it('should list init command options', async () => {
    const { stdout } = await execa('npx', ['tsx', cliPath, 'init', '--help']);
    expect(stdout).toContain('project name');
    expect(stdout).toContain('--template');
  });

  it('should list build command options', async () => {
    const { stdout } = await execa('npx', ['tsx', cliPath, 'build', '--help']);
    expect(stdout).toContain('--watch');
  });
});