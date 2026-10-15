// 讓遊戲存在手機裡（2026-10-15 使用者：「希望加載速度可以極致快速」）：
// 第二次打開不用再下載 Phaser（0.3 MB），沒網路也能玩。
// 首頁先等網路最多 2.5 秒（有新版就拿新版），等不到就用存著的；其他檔案的網址帶 ?v=版本，存了就直接用。
const CACHE = 'nm-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate';
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    if (isPage) {
      const net = fetch(req).then((r) => { if (r.ok) cache.put('page', r.clone()); return r; });
      const old = await cache.match('page');
      if (!old) return net;
      return Promise.race([net.catch(() => old), new Promise((res) => setTimeout(() => res(old), 2500))]);
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok && /[?&]v=/.test(req.url)) {
      cache.put(req, r.clone());
      // 同一個檔案的舊版本刪掉，免得越存越多
      const base = req.url.split('?')[0];
      for (const k of await cache.keys()) if (k.url.split('?')[0] === base && k.url !== req.url) cache.delete(k);
    }
    return r;
  }));
});
