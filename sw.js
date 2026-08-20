/* 个人记账本 PWA Service Worker
 * 策略：对同源 GET 请求走「缓存优先，网络兜底」；
 * 首次加载后页面与资源被缓存，断网仍可从主屏图标打开。
 */
const CACHE = 'personal-ledger-app-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './index.tsx'])).catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 开发态的热更新请求不缓存。
  if (url.pathname.includes('/@vite/') || url.pathname.includes('/@fs/') || url.search.includes('t=') || url.search.includes('v=')) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    }),
  );
});
