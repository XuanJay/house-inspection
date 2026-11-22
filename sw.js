// 讓網頁沒網路也打得開：每次先上網拿新版，3 秒內沒「整份」拿到（斷線、很慢、伺服器出錯）就用上次存在手機的那份，拿到的新版存起來下次用。
// 只管本站的檔；Google 的登入、上傳、讀進度都不經過這裡。勾選和照片本來就存在手機（localStorage、IndexedDB），不在這裡。
const C = 'yanwu-v1', FILES = ['./', './privacy.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
// 一個網頁只存一份：拿掉 ? 後面（LINE 之類會加參數），index.html 跟 ./ 當同一個
const key = url => { const u = new URL(url); return u.origin + u.pathname.replace(/\/index\.html$/, '/'); };
// 每個請求發出時取號（安裝時預存的也算）。同一個網址，比較晚發出的已經存過了，比較早發出、比較晚回來的就不存（不然會把新版蓋回舊版）
// 存之前一定先把內容整份讀完（full），檢查順序和寫入之間就不會再等網路
let seq = 0; const last = {};
const full = async res => { const b = await res.blob(); return () => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }); };
const save = (k, my, res) => { if ((last[k] || 0) >= my) return; last[k] = my; return caches.open(C).then(c => c.put(k, res)).catch(() => {}); };
// 各檔分開存：其中一個失敗（例如圖示）或 10 秒沒回，都不擋 Service Worker 裝好
self.addEventListener('install', e => e.waitUntil(Promise.all(FILES.map(f => { const u = new URL(f, location).href, my = ++seq;
    return Promise.race([fetch(u).then(async res => res.ok && save(key(u), my, (await full(res))())).catch(() => {}), new Promise(ok => setTimeout(ok, 10000))]); }))
  .then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  const k = key(r.url), my = ++seq;
  let saved;
  // 內容整份讀完才算拿到：標頭先到、內容卡住，一樣 3 秒後改用手機上的那份
  const net = fetch(r).then(async res => {
    if (!res.ok) return res;
    const copy = await full(res);
    saved = save(k, my, copy());
    return copy();
  });
  e.waitUntil(net.then(() => saved, () => {}));   // 先回了手機上的那份，也讓新版存完
  e.respondWith(caches.match(k, { ignoreVary: true }).then(hit => hit
    // 伺服器出錯用手機上的那份；網址搬家（轉址）照轉，不然會一直停在舊的那份
    ? Promise.race([net.then(res => res.ok || res.type === 'opaqueredirect' ? res : hit, () => hit), new Promise(ok => setTimeout(() => ok(hit), 3000))])
    : net));
});
