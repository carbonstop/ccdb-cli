import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releases = resolve(root, 'dist/releases');
await mkdir(releases, { recursive: true });
async function run(command, args, cwd = root) {
  return new Promise((yes, no) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', no);
    child.on('exit', (code) => (code === 0 ? yes(stdout) : no(Error(stderr || `Exit ${code}`))));
  });
}
// npm_execpath is supplied by npm run, so no Windows shell argument interpolation is needed.
if (!process.env.npm_execpath) throw Error('Use npm run pack:local');
const files = [];
for (const name of ['ccdb-cli']) {
  await stat(resolve(root, `packages/${name}/dist/main.mjs`));
  const text = await run(
    process.execPath,
    [
      process.env.npm_execpath,
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      releases,
    ],
    resolve(root, 'packages', name),
  );
  files.push(JSON.parse(text)[0].filename);
}
const checksums = {};
for (const file of files)
  checksums[file] = createHash('sha256')
    .update(await readFile(resolve(releases, file)))
    .digest('hex');
await writeFile(resolve(releases, 'SHA256SUMS.json'), JSON.stringify(checksums, null, 2) + '\n');
console.log(JSON.stringify({ directory: releases, files }, null, 2));
