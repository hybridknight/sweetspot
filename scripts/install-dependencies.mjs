import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let token = process.env.NODE_AUTH_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  const auth = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  token = auth.status === 0 ? auth.stdout.trim() : undefined;
}
if (!token) {
  console.error('GitHub Packages access is required. Run gh auth login, then gh auth refresh -s read:packages, or provide NODE_AUTH_TOKEN.');
  process.exit(1);
}

// Derive private registry scopes from locked tarballs rather than hardcoding owners.
const lockfile = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
const githubScopes = new Set(
  Array.from(lockfile.matchAll(/https:\/\/npm\.pkg\.github\.com\/download\/(@[a-z0-9_.-]+)\//gi), (match) => match[1]),
);
const registryConfig = [
  ...Array.from(githubScopes, (scope) => `${scope}:registry=https://npm.pkg.github.com`),
  '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}',
].join('\n') + '\n';

const directory = mkdtempSync(path.join(tmpdir(), 'sweetspot-install-'));
try {
  const userConfig = path.join(directory, 'npmrc');
  writeFileSync(userConfig, registryConfig, { mode: 0o600 });
  // pnpm/setup can install a native executable on Windows, without pnpm.cmd.
  // Let the Windows shell resolve either form through PATH / PATHEXT.
  const result = spawnSync('pnpm',
    ['install', '--frozen-lockfile', ...process.argv.slice(2)], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, NODE_AUTH_TOKEN: token, npm_config_userconfig: userConfig, NPM_CONFIG_USERCONFIG: userConfig },
    });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
