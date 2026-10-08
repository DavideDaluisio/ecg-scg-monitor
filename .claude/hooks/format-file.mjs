// PostToolUse hook (Edit|Write): runs Prettier on the file Claude just edited.
// Never blocks Claude: on failure it exits with code 1, which Claude Code shows to the user as a non-blocking error.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const FORMATTED = /\.(ts|tsx|js|mjs|json|css|md)$/
// Prettier's CLI is run with node directly, without a shell: through a shell (needed for `npx` on Windows) a path
// with spaces, like "NJIT Research", was split in two and Prettier silently formatted nothing.
const PRETTIER_CLI = fileURLToPath(
  new URL('../../node_modules/prettier/bin/prettier.cjs', import.meta.url),
)

let input = ''
for await (const chunk of process.stdin) input += chunk

let filePath
try {
  filePath = JSON.parse(input).tool_input?.file_path
} catch {
  process.exit(0) // no tool input: nothing to format
}

if (filePath && FORMATTED.test(filePath) && !filePath.includes('node_modules')) {
  try {
    execFileSync(process.execPath, [PRETTIER_CLI, '--write', '--log-level', 'warn', filePath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  } catch (error) {
    console.error(`Prettier could not format ${filePath}:\n${error.stderr ?? error.message}`)
    process.exit(1)
  }
}
