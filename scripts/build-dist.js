/* Arma lo que se publica:
   dist/apps-script/Code.gs (+ appsscript.json) → se pega en el editor de Apps Script (servidor de datos)
   dist/netlify/index.html                     → se sube a Netlify (la app, con estilos, pines y fotos incluidos) */
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'apps-script'), out = path.join(__dirname, '..', 'dist');
const read = f => fs.readFileSync(path.join(src, f), 'utf8');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'apps-script'), { recursive: true });
fs.mkdirSync(path.join(out, 'netlify'), { recursive: true });
fs.writeFileSync(path.join(out, 'apps-script', 'Code.gs'), read('Logic.gs') + '\n\n' + read('Code.gs'));
fs.copyFileSync(path.join(src, 'appsscript.json'), path.join(out, 'apps-script', 'appsscript.json'));
let html = read('Index.html').replace(/<\?!= include\('(\w+)'\); \?>/g, (_, f) => read(f + '.html'));
html = html.replace('<base target="_top">\n', '').replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n  <meta name="theme-color" content="#F9F8F7">');
if (/<\?/.test(html)) throw new Error('Quedó un scriptlet sin resolver');
fs.writeFileSync(path.join(out, 'netlify', 'index.html'), html);
for (const d of ['apps-script', 'netlify']) for (const f of fs.readdirSync(path.join(out, d)))
  console.log(`dist/${d}/${f}`, (fs.statSync(path.join(out, d, f)).size / 1024).toFixed(0) + ' KB');
