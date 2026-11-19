/* Construye qa/out/harness.html: la app real (ReKonoce) de apps-script/ con un servidor simulado en el navegador.
   El servidor simulado ejecuta el mismo Logic.gs, así la QA prueba el mismo código que corre en Google. */
const fs = require('fs'), path = require('path');
const { TEAM } = require('./load.js');
const dir = path.join(__dirname, '..', 'apps-script');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

const REASONS = [
  'Armó la guía de traspaso y la compartió con todo el equipo antes de que alguien la pidiera.',
  'Cerró la entrega del viernes y dejó todo documentado para el lunes, sin que nadie se lo pidiera.',
  'En la retro más difícil del año dejó hablar a todos y frenó las interrupciones con mucho tino.',
  'Durante la caída del ambiente mandó un resumen cada hora y nadie quedó sin saber qué pasaba.',
  'Se quedó una tarde completa ayudándome a ordenar los contratos del proyecto y me explicó todo.'
];

const fakeServer = `
<script>${fs.readFileSync(path.join(__dirname, 'memstore.js'), 'utf8')}</script>
<script>${read('Logic.gs')}</script>
<script>
(function(){
  var TEAM=${JSON.stringify(TEAM)};
  var REASONS=${JSON.stringify(REASONS)};
  var STORE=makeMemStore(TEAM,'5591'), AUTH=makeMemAuth();
  var clock=0; // desfase del reloj del servidor simulado
  function h(name){var a=[].slice.call(arguments,1);var r=JSON.parse(RK.handle(STORE,AUTH,name,a,Date.now()+clock));if(!r.ok)throw new Error(name+': '+r.error);return r.data}
  var DAY=864e5, P=RK.PILLARS;
  function noms(map){var o={};P.forEach(function(p){o[p]=map[p]?{nominee:map[p],reason:REASONS[(map[p].charCodeAt(0)+p.length)%REASONS.length]}:{skip:true}});return o}
  var token=null;function tk(){return token||(token=h('adminLogin','5591').token)}
  var NOM=[['rm',{colaboracion:'et',responsabilidad:'vc',respeto:'mc',comunicacion:'bb'}],['bb',{colaboracion:'rm',responsabilidad:'vc',respeto:'mc',comunicacion:'pr'}],
    ['mb',{colaboracion:'rm',responsabilidad:'mr',respeto:'mc',comunicacion:'bb'}],['vc',{colaboracion:'rm',responsabilidad:'mr',respeto:'na',comunicacion:'mb'}],
    ['na',{colaboracion:'et',responsabilidad:'vc',respeto:'mc',comunicacion:'bb'}],['mc',{colaboracion:'dm',responsabilidad:'rj',respeto:'na',comunicacion:'mb'}],
    ['mr',{colaboracion:'rm',responsabilidad:'vc',respeto:'mc',comunicacion:'pr'}],['et',{colaboracion:'dm',responsabilidad:'mr',respeto:'na',comunicacion:'bb'}],
    ['pr',{colaboracion:'et',responsabilidad:'rj',respeto:'mc',comunicacion:'mb'}],['rj',{colaboracion:'et',responsabilidad:'vc',respeto:'na',comunicacion:'pr'}],
    ['dm',{colaboracion:'rm',responsabilidad:'vc',respeto:'mc',comunicacion:'bb'}]];
  var SCEN={
    idle:function(){},
    nom:function(){h('adminOpen',tk(),'Noviembre 2026',Date.now()+3*DAY+5*3600e3);NOM.forEach(function(r){h('vote',r[0],noms(r[1]))})},
    'nom-expired':function(){SCEN.nom();clock=4*DAY},
    cerrado:function(){SCEN.nom();h('adminClose',tk())},
    revelado:function(){SCEN.cerrado();h('adminReveal',tk())},
    historia:function(){SCEN.revelado();h('adminArchive',tk())}
  };
  var name=(location.hash||'#nom').slice(1).split('|');
  SCEN[name[0]]();
  try{localStorage.clear();sessionStorage.clear()}catch(e){}
  if(name[1]==='admin'){try{sessionStorage.setItem('rk-token',tk())}catch(e){}}
  else if(name[1]){try{localStorage.setItem('rk-who',name[1])}catch(e){}}
  if(name[2]){try{localStorage.setItem('rk-draft-'+name[1],decodeURIComponent(name[2]))}catch(e){}}
  window.__server={h:h,STORE:STORE,token:tk};
  function runner(ok,ko){return {withSuccessHandler:function(f){return runner(f,ko)},withFailureHandler:function(f){return runner(ok,f)},
    rkApi:function(n,args){setTimeout(function(){var r;try{r=RK.handle(STORE,AUTH,n,JSON.parse(JSON.stringify(args)),Date.now()+clock)}catch(e){ko&&ko(e);return}ok&&ok(r)},40)}}}
  window.google={script:{run:runner(null,null)}};
})();
</script>`;

let html = read('Index.html').replace(/<\?!= include\('(\w+)'\); \?>/g, (_, f) => (f === 'Pins' ? fakeServer : '') + read(f + '.html'));
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'harness.html'), html);
console.log('qa/out/harness.html', (html.length / 1024).toFixed(0) + ' KB');

/* Demo publicable (docs/mockup/index.html): la misma app con servidor simulado, como fragmento para el visor de Artifacts. */
let demo = html
  .replace(/<!DOCTYPE html>\s*<html[^>]*>\s*<head>\s*<base target="_top">\s*<meta charset="utf-8">(<meta name="viewport"[^>]*>)?/, '')
  .replace(/<title>[^<]*<\/title>/, '<title>ReKonoce Demo</title>')
  .replace(/<\/head>\s*<body>/, '<style>.app{height:100%}</style>')
  .replace(/<\/body>\s*<\/html>\s*$/, '');
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'mockup', 'index.html'), demo.trimStart());
console.log('docs/mockup/index.html', (demo.length / 1024).toFixed(0) + ' KB');
