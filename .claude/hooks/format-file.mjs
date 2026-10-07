// PostToolUse hook (Edit|Write): runs Prettier on the file Claude just edited.
// Never blocks Claude: formatting errors are ignored (the typecheck hook catches real problems).
import { execFileSync } from 'node:child_process'

const FORMATTED = /\.(ts|tsx|js|mjs|json|css|md)$/

let input = ''
for await (const chunk of process.stdin) input += chunk

try {
  const filePath = JSON.parse(input).tool_input?.file_path
  if (filePath && FORMATTED.test(filePath) && !filePath.includes('node_modules')) {
    execFileSync('npx', ['prettier', '--write', '--log-level', 'warn', filePath], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
  }
} catch {
  // ignore: a formatting failure must not interrupt the work
}
