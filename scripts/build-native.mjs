import { build } from 'esbuild';
import { inject } from 'postject';
import { mkdir, readFile, writeFile, copyFile, chmod, mkdtemp } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const major = Number(process.versions.node.split('.')[0]);
if (major !== 22 && major !== 24) throw Error('Build with Node.js 22 or 24 LTS');
const target = `${process.platform}-${process.arch}`;
if (!['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'win32-x64'].includes(target))
  throw Error(`Unsupported native target: ${target}`);
const releases = resolve(root, 'dist/native');
await mkdir(releases, { recursive: true });
// Each build injects only into a fresh copy, never the installed Node executable.
const work = await mkdtemp(resolve(releases, '.build-'));
const bundle = join(work, 'main.cjs');
const blob = join(work, 'sea.blob');
const config = join(work, 'sea.json');
const output = resolve(releases, target);
await mkdir(output, { recursive: true });
const binary = join(output, process.platform === 'win32' ? 'ccdb-cli.exe' : 'ccdb-cli');
await build({
  absWorkingDir: root,
  entryPoints: ['packages/ccdb-cli/src/main.ts'],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  legalComments: 'eof',
});
await writeFile(
  config,
  JSON.stringify({
    main: bundle,
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    execArgvExtension: 'none',
  }),
);
execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });
await copyFile(process.execPath, binary);
await chmod(binary, 0o755);
if (process.platform === 'darwin') execFileSync('codesign', ['--remove-signature', binary]);
await inject(binary, 'NODE_SEA_BLOB', await readFile(blob), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
});
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--sign', '-', binary]);
  execFileSync('codesign', ['--verify', binary]);
}
await copyFile(
  resolve(root, 'packages/ccdb-cli/dist/THIRD_PARTY_NOTICES.txt'),
  join(output, 'THIRD_PARTY_NOTICES.txt'),
);
// Redistributing the embedded Node runtime also requires its notices.
const response = await fetch(
  `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
  { signal: AbortSignal.timeout(30000) },
);
if (!response.ok) throw Error(`Cannot obtain Node runtime license: ${response.status}`);
await writeFile(join(output, 'NODE_LICENSE.txt'), await response.text());
const pkg = JSON.parse(await readFile(resolve(root, 'packages/ccdb-cli/package.json'), 'utf8'));
const sha256 = createHash('sha256')
  .update(await readFile(binary))
  .digest('hex');
await writeFile(
  join(output, 'BUILD.json'),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      target,
      node: process.version,
      sha256,
      signing: process.platform === 'darwin' ? 'ad-hoc (not notarized)' : 'unsigned',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Built ${binary}`);
