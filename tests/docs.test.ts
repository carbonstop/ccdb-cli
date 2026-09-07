import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('user-facing READMEs install the published package before local development artifacts', async () => {
  const pkg = JSON.parse(await readFile('packages/ccdb-cli/package.json', 'utf8'));
  for (const file of ['README.md', 'packages/ccdb-cli/README.md']) {
    const doc = await readFile(file, 'utf8');
    const firstInstall = /npm install -g (\S+)/.exec(doc);
    assert.equal(firstInstall?.[1], pkg.name, file);
    assert.ok(doc.includes(`${Object.keys(pkg.bin)[0]} --version`), file);
  }
});
