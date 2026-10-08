import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Проверяем договорённость о границах модулей автоматически, а не только в README.
test('слои не импортируют внутренности соседей; домен независим от платформы', async () => {
  for (const layer of ['domain', 'ui', 'scene', 'input', 'persistence']) {
    for (const file of await readdir(`src/${layer}`)) {
      if (!file.endsWith('.ts')) continue;
      const source = await readFile(`src/${layer}/${file}`, 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const name of imports) {
        if (name.startsWith('../') && !name.startsWith('../../.generated/'))
          assert(name.endsWith('/index.js'), `${layer}/${file} imports private module ${name}`);
        if (layer === 'domain') assert(name.startsWith('./'), `Domain depends on ${name}`);
      }
      if (layer === 'domain')
        assert(!/\b(window|document|localStorage|requestAnimationFrame)\s*[.(]/.test(source));
    }
  }
});
