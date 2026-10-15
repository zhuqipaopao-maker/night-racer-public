import * as esbuild from 'esbuild';
import fs from 'fs';

const watch = process.argv.includes('--watch');
async function bundle() {
  const r = await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, minify: !watch, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = fs.readFileSync('index.template.html', 'utf8').replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/index.html', html);
  fs.cpSync('public', 'dist', { recursive: true });   // models and other files served next to the page
  console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
}
await bundle();
if (watch) fs.watch('src', { recursive: true }, () => bundle().catch(e => console.error(e.message)));
