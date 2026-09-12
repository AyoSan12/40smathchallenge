import { readFile, writeFile } from 'node:fs/promises';

const path = 'index.html';
let html = await readFile(path, 'utf8');

html = html.replace(
  /\.language-switcher\s*\{[^}]*left:\s*14px;[^}]*\}/s,
  (block) => block.replace(/left:\s*14px;/, 'left: 50%;\n    transform: translateX(-50%);')
);

html = html.replace(
  /\.language-switcher\s*\{\s*top:\s*10px;\s*left:\s*10px;\s*\}/,
  '.language-switcher { top: 10px; left: 50%; transform: translateX(-50%); }'
);

await writeFile(path, html, 'utf8');
console.log('Centered language switcher for deployment.');
