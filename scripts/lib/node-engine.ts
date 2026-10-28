import { spawn } from 'node:child_process'
import { Engine, type Transport } from '../../src/core/engine'
/** Real Stockfish (lite, single-thread WASM build) as a child process: the same Engine class the extension uses. */
export function nodeTransport(): Transport {
  const p = spawn(process.execPath, ['public/engine/stockfish-19-lite-single.js']); let cb = (_: string) => {}, buf = ''
  p.stdout.on('data', d => { buf += d; const ls = buf.split('\n'); buf = ls.pop()!; ls.forEach(l => cb(l)) })
  return { post: c => p.stdin.write(c + '\n'), onLine: f => { cb = f }, onError: f => p.on('error', f), terminate: () => p.kill() }
}
export async function newEngine(multipv = 2) { const e = new Engine(nodeTransport()); await e.init(multipv); return e }
