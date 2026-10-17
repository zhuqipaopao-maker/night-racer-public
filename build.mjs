import * as esbuild from 'esbuild';
import fs from 'fs';
import { execFileSync } from 'child_process';

// node build.mjs                → dist/ (the site on Cloudflare Pages)
// node build.mjs --crazygames   → dist-cg/ and night-racer-crazygames.zip for the CrazyGames portal: their SDK, no
//                                 film map (players' photos), no online rooms (invite links lead off-portal), no gift codes
const watch = process.argv.includes('--watch');
const CG = process.argv.includes('--crazygames');
const OUT = CG ? 'dist-cg' : 'dist';
async function bundle() {
  const r = await esbuild.build({ entryPoints: [CG ? 'src/cg-entry.js' : 'src/main.js'], bundle: true, minify: !watch, format: 'iife', write: false, target: 'es2020', legalComments: 'none', define: { __CG__: String(CG) } });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  let html = fs.readFileSync('index.template.html', 'utf8').replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
  if (CG) html = html.replace('</head>', '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n</head>');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/index.html`, html);
  // models and other files served next to the page
  fs.cpSync('public', OUT, { recursive: true, filter: src => !(CG && /public\/(film(\/|$)|models\/film\.glb$)/.test(src)) });
  console.log(`${OUT}/index.html  ${(html.length / 1024).toFixed(0)} KB`);
  if (CG) {
    fs.rmSync('night-racer-crazygames.zip', { force: true });
    execFileSync('zip', ['-qr', '../night-racer-crazygames.zip', '.'], { cwd: OUT });
    console.log(`night-racer-crazygames.zip  ${(fs.statSync('night-racer-crazygames.zip').size / 1048576).toFixed(1)} MB`);
  }
}
await bundle();
if (watch) fs.watch('src', { recursive: true }, () => bundle().catch(e => console.error(e.message)));
