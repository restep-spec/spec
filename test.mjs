// The reference server must pass restep-check, writes included.
//   node test.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = String(18000 + Math.floor(Math.random() * 1000));
const server = spawn(process.execPath, [join(here, 'ref/restep-server.mjs')], { env: { ...process.env, PORT: port }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, ko) => { server.stdout.once('data', ok); server.once('exit', () => ko(new Error('The reference server did not start'))); });
const check = spawn(process.execPath, [join(here, 'vendor/restep-check.mjs'), `http://localhost:${port}/`, '--writes'], { stdio: 'inherit' });
const code = await new Promise((ok) => check.on('exit', ok));
server.kill();
process.exit(code);
