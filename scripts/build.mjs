import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = [['packages/ccdb-cli/src/main.ts', 'packages/ccdb-cli/dist/main.mjs']];
for (const [input, output] of entries) {
  await build({
    absWorkingDir: root,
    entryPoints: [input],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: false,
    legalComments: 'eof',
    banner: {
      js: '#!/usr/bin/env node\nimport { createRequire as __ccdbCreateRequire } from "node:module"; const require = __ccdbCreateRequire(import.meta.url);',
    },
    logLevel: 'warning',
  });
}
// Preserve third-party licenses in every standalone deliverable.
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
let notices = 'CCDB Connect third-party dependency notices\n\n';
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || metadata.dev) continue;
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license']) {
    try {
      const text = await readFile(resolve(root, path, name), 'utf8');
      notices += `\n=== ${path} ${metadata.version} ===\n${text}\n`;
      break;
    } catch {}
  }
}
for (const directory of ['packages/ccdb-cli/dist']) {
  await mkdir(resolve(root, directory), { recursive: true });
  await writeFile(resolve(root, directory, 'THIRD_PARTY_NOTICES.txt'), notices);
}
console.log(
  'Built independent CLI bundle. Includes the pinned ccdb-client npm dependency; no separate runtime install.',
);
