// Stop hook: run `npm run typecheck` before Claude ends its turn.
// If it fails, exit code 2 sends the errors back to Claude so it fixes them.
// Does nothing until dependencies are installed (before milestone M0 there is no node_modules).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const input = JSON.parse(readFileSync(0, 'utf8') || '{}');

// Avoid an endless loop: if Claude is already continuing because of this hook, let it stop.
if (input.stop_hook_active || !existsSync(join(projectDir, 'node_modules'))) {
  process.exit(0);
}

try {
  execSync('npm run typecheck --silent', { cwd: projectDir, stdio: 'pipe' });
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.slice(-4000);
  process.stderr.write(`TypeScript errors, fix them before finishing:\n${out}`);
  process.exit(2);
}
