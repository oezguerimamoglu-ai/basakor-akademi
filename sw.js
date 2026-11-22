const CACHE = 'basakor-akademi-v0.2.4';
const ASSETS = ['./','./index.html','./styles.css','./app.mjs','./music.mjs','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./assets/bass/finger-A.wav','./assets/bass/finger-B.wav','./assets/bass/finger-Dsharp.wav','./assets/bass/pick-A.wav','./assets/bass/pick-B.wav','./assets/bass/pick-E2.wav','./assets/epiano/ep1-C4.wav','./assets/epiano/ep1-Fsharp4.wav','./assets/epiano/ep1-C5.wav','./assets/epiano/ep2-C4.wav','./assets/epiano/ep2-Fsharp4.wav','./assets/epiano/ep2-C5.wav'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('basakor-akademi-')&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{if(resp.ok){const clone=resp.clone();caches.open(CACHE).then(c=>c.put(req,clone));}return resp;})));
});
