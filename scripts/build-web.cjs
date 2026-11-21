const { spawnSync } = require('node:child_process');
const { cpSync, rmSync, statSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const web = resolve(root, 'apps/web');
const deployDir = resolve(root, 'dist');
const buildDir = resolve(web, 'dist');
const command = process.argv[2];

rmSync(deployDir, { recursive: true, force: true });
const build = spawnSync(process.execPath, [process.env.npm_execpath, '--prefix', web, 'run', command], {
  stdio: 'inherit',
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

if (command !== 'clean') {
  const entry = statSync(resolve(buildDir, 'index.js'), { throwIfNoEntry: false });
  if (!entry?.isFile() || entry.size === 0) {
    throw new Error('BroJS did not produce a non-empty apps/web/dist/index.js');
  }
  cpSync(buildDir, deployDir, { recursive: true });
}
