import { mkdir, copyFile, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'model.mjs']) {
  await copyFile(new URL(file, root), new URL(file, output));
}
console.log('Built four static app files in dist/.');
