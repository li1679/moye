import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import opentype from 'opentype.js';

const FONT_URL = 'https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf';
const cacheDir = new URL('./.cache/', import.meta.url);
const fontFile = new URL('NotoSerifSC-Bold.otf', cacheDir);
const SEAL = '#B33A2E';
const PAPER = '#F6F1E7';

if (!existsSync(fontFile)) {
  await mkdir(cacheDir, { recursive: true });
  const response = await fetch(FONT_URL);
  if (!response.ok) throw new Error('字体下载失败：' + response.status);
  await writeFile(fontFile, Buffer.from(await response.arrayBuffer()));
}
const data = await readFile(fontFile);
const font = opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

/** 把"墨"字缩放进 (x, y) 起、边长 size 的正方形里，居中，返回 SVG 路径数据。 */
function glyphPath(x, y, size) {
  const path = font.getPath('墨', 0, 0, 1000);
  const box = path.getBoundingBox();
  const scale = size / Math.max(box.x2 - box.x1, box.y2 - box.y1);
  const dx = x + (size - (box.x2 - box.x1) * scale) / 2 - box.x1 * scale;
  const dy = y + (size - (box.y2 - box.y1) * scale) / 2 - box.y1 * scale;
  const n = value => Number(value.toFixed(2));
  const p = (px, py) => `${n(px * scale + dx)} ${n(py * scale + dy)}`;
  return path.commands.map(c =>
    c.type === 'M' ? `M${p(c.x, c.y)}` :
    c.type === 'L' ? `L${p(c.x, c.y)}` :
    c.type === 'Q' ? `Q${p(c.x1, c.y1)} ${p(c.x, c.y)}` :
    c.type === 'C' ? `C${p(c.x1, c.y1)} ${p(c.x2, c.y2)} ${p(c.x, c.y)}` : 'Z').join('');
}

// 108×108 画布。方印 46×46 放在正中，这样在圆形遮罩下也能完整显示；印里的字占 32×32。
const seal = 'M36 31H72A5 5 0 0 1 77 36V72A5 5 0 0 1 72 77H36A5 5 0 0 1 31 72V36A5 5 0 0 1 36 31Z';
const glyph = glyphPath(38, 38, 32);
const bigGlyph = glyphPath(34, 34, 40);   // 单色图层只画字，稍大一点

const vector = paths => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
${paths.map(([color, d]) => `    <path android:fillColor="${color}" android:pathData="${d}" />`).join('\n')}
</vector>
`;

const res = new URL('../android/app/src/main/res/drawable/', import.meta.url);
await mkdir(res, { recursive: true });
await writeFile(new URL('ic_launcher_foreground.xml', res), vector([[SEAL, seal], [PAPER, glyph]]));
await writeFile(new URL('ic_launcher_monochrome.xml', res), vector([['#FFFFFFFF', bigGlyph]]));
await writeFile(new URL('../app/public/brand/moye.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" rx="24" fill="${PAPER}"/><path fill="${SEAL}" d="${seal}"/><path fill="${PAPER}" d="${glyph}"/></svg>\n`);
console.log('已生成图标');
