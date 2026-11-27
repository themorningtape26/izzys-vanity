import { mkdir, copyFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'style.css']) await copyFile(new URL(file, root), new URL(file, output));
await build({ entryPoints: [new URL('app.js', root).pathname], outfile: new URL('app.js', output).pathname, bundle: true, format: 'esm', platform: 'browser', target: ['safari16.4','chrome110'], minify: true });
console.log('Built browser assets. API functions remain server-side.');
