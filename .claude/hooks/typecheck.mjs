// Stop hook: runs `npm run typecheck` when Claude finishes a turn.
// If it fails, Claude is asked to fix the errors before stopping (once, to avoid loops).
import { execSync } from 'node:child_process'

let input = ''
for await (const chunk of process.stdin) input += chunk

let alreadyRetried = false
try {
  alreadyRetried = JSON.parse(input).stop_hook_active === true
} catch {
  // no input: treat as a normal stop
}

try {
  execSync('npm run typecheck', {
    stdio: 'pipe',
    cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  })
} catch (error) {
  if (!alreadyRetried) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.slice(-3000)
    console.log(
      JSON.stringify({
        decision: 'block',
        reason: `npm run typecheck failed. Fix these TypeScript errors before finishing:\n${output}`,
      }),
    )
  }
}
