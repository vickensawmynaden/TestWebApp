// Copies the Last Mile game from ../manor-game into www/ for the native app shell.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(root, '../manor-game');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
const copy = (from, to = from) => fs.cpSync(path.join(src, from), path.join(out, to), { recursive: true });
['css/style.css', 'css/run.css', 'js/run.js', 'js/textures.js', 'js/models.js', 'js/zombie.js', 'js/audio.js',
  'vendor/three/three.module.min.js', 'vendor/three/LICENSE', 'vendor/three/addons', 'models', 'icons'].forEach(f => copy(f));
copy('run.html', 'index.html');
console.log('Copied Last Mile into', out);
