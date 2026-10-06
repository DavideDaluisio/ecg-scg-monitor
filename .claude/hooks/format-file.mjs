// PostToolUse hook: format + lint-fix the TS/TSX file Claude just edited.
// Does nothing until dependencies are installed (before milestone M0 there is no node_modules).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const file = input?.tool_input?.file_path;

if (!file || !/\.(ts|tsx)$/.test(file) || !existsSync(join(projectDir, 'node_modules'))) {
  process.exit(0);
}

const run = (args) => {
  try {
    execFileSync('npx', args, { cwd: projectDir, stdio: 'ignore', shell: true });
  } catch {
    // Formatting problems must never block the edit. Lint errors show up in `npm run lint`.
  }
};

run(['prettier', '--write', JSON.stringify(file)]);
run(['eslint', '--fix', JSON.stringify(file)]);
