const { existsSync, mkdirSync, symlinkSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

for (const dependency of ['@brojs/fire.app', '@brojs/templates']) {
  const target = resolve(__dirname, '../node_modules', dependency);
  if (existsSync(target)) continue;
  const source = dirname(require.resolve(`${dependency}/package.json`));
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target, 'junction');
}
