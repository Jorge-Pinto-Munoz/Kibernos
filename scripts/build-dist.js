/* Empaqueta apps-script/ en 2 archivos para pegar en el editor de Apps Script:
   dist/Code.gs (Logic + Code) y dist/Index.html (estilos, app, pines y fotos incluidos). */
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'apps-script'), out = path.join(__dirname, '..', 'dist');
const read = f => fs.readFileSync(path.join(src, f), 'utf8');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'Code.gs'), read('Logic.gs') + '\n\n' + read('Code.gs'));
const html = read('Index.html').replace(/<\?!= include\('(\w+)'\); \?>/g, (_, f) => read(f + '.html'));
if (/<\?/.test(html)) throw new Error('Quedó un scriptlet sin resolver');
fs.writeFileSync(path.join(out, 'Index.html'), html);
fs.copyFileSync(path.join(src, 'appsscript.json'), path.join(out, 'appsscript.json'));
for (const f of fs.readdirSync(out)) console.log('dist/' + f, (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB');
