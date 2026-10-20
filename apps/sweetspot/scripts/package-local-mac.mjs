import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
const distDir = path.join(projectDir, 'dist');
mkdirSync(distDir, { recursive: true });
const prefix = `release-${version}-build-`;
const numbers = readdirSync(distDir)
  .filter((name) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))
  .map((name) => Number(name.slice(prefix.length)));
let build = Math.max(0, ...numbers) + 1;
let output;
for (;;) {
  output = path.join(distDir, `${prefix}${String(build).padStart(3, '0')}`);
  try {
    mkdirSync(output);
    break;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    build++;
  }
}

console.log(`Building ${version}, build ${build}: ${output}`);
const result = spawnSync('pnpm', [
  'exec', 'electron-builder', '--mac', 'zip', '--publish', 'never',
  '-c.appId=ooo.bkk.sweetspot.local', '-c.productName=Sweet Spot Local',
  '-c.extraMetadata.sweetspotLocalBuild=true', '-c.mac.identity=-', '-c.mac.notarize=false',
  '-c.mac.entitlements=build/entitlements.mac.local.plist',
  '-c.mac.entitlementsInherit=build/entitlements.mac.local.plist',
  ...process.argv.slice(2), `-c.directories.output=${output}`,
], {
  cwd: projectDir,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
