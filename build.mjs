// BasAkor Akademi tek dosyalık demo üretimi. Harici bağımlılık yok.
import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync('index.html','utf8');
const css=readFileSync('styles.css','utf8');
const music=readFileSync('music.mjs','utf8').replace(/^export\s+/gm,'');
const midi=readFileSync('midi-file.mjs','utf8').replace(/^export\s+/gm,'');
const midiPlayer=readFileSync('midi-player.mjs','utf8').replace(/^export\s+/gm,'');
const app=readFileSync('app.mjs','utf8')
  .replace(/^import\s*\{[^}]+\}\s*from\s*['"]\.\/(?:music|midi-file|midi-player)\.mjs['"];\s*/gm,'')
  .replace(/\s*if\('serviceWorker' in navigator && \^https\?:\.test\(location\.protocol\)\)navigator\.serviceWorker\.register\('\.\/sw\.js'\)\.catch\(\(\)=>\{\}\);/,'');
const compiled=source
  .replace('  <link rel="manifest" href="./manifest.webmanifest">\n','')
  .replace('  <link rel="icon" href="./icon.svg" type="image/svg+xml">\n','')
  .replace('  <link rel="stylesheet" href="./styles.css">','  <style>\n'+css+'\n  </style>')
  .replace(/<script type="module" src="\.\/app\.mjs(?:\?[^\"]*)?"><\/script>/,'<script>\n'+music+'\n'+midi+'\n'+midiPlayer+'\n'+app+'\n</script>');
if(/<script type="module"/.test(compiled)||/import\s*\{/.test(compiled))throw new Error('Demo henüz tamamen birleştirilmedi.');
writeFileSync('basakor-akademi-demo.html',compiled);
console.log('Demo üretildi: '+Buffer.byteLength(compiled)+' bytes');
