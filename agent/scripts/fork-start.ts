// npm run fork:start [-- extra anvil args, e.g. --block-time 1]
// anvil --fork-url $MONAD_RPC_URL --port 8545, keeping chain id 143. Works on Windows too: finds anvil in
// ~/.foundry/bin when it is not on PATH, and reads MONAD_RPC_URL from .env.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const envFile = join(import.meta.dirname, '..', '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
const local = join(homedir(), '.foundry', 'bin', process.platform === 'win32' ? 'anvil.exe' : 'anvil')
const args = ['--fork-url', process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz', '--port', '8545', '--chain-id', '143', ...process.argv.slice(2)]
spawn(existsSync(local) ? local : 'anvil', args, { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 1))
