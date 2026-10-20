import { build } from 'esbuild';
import { copyFileSync } from 'node:fs';

// Runtime artifacts are committed so installing a release needs no fork build tools.
for (const name of ['main', 'renderer']) {
  for (const format of ['cjs', 'esm']) {
    await build({
      entryPoints: [`vendor/electron-trpc/src/${name}/index.ts`],
      outfile: `vendor/electron-trpc/dist/${name}.${format === 'esm' ? 'mjs' : 'cjs'}`,
      bundle: true, platform: name === 'main' ? 'node' : 'browser',
      format, packages: 'external', target: 'es2022',
    });
  }
  copyFileSync(`vendor/electron-trpc/dist/${name}.d.ts`, `vendor/electron-trpc/${name}.d.ts`);
}
