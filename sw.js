/*
 * Минимальный service worker PWA.
 * Задача — установка приложения и офлайн-загрузка оболочки: навигация с сети
 * с откатом на кэш, статика сборки и иконки — по стратегии «кэш, затем сеть».
 * Данные заказов приходят с сервера и при офлайне приложение покажет
 * корректное состояние ошибки, а не «белый экран».
 */
const VERSION = "logus-v2";
const NETWORK_TIMEOUT = 8000;
const SHELL = ["./", "./index.html", "./site.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];

// Сетевой запрос с жёстким таймаутом. Без него «подвисший» origin (например,
// origin недоступен без VPN) держит fetch в SW вечно, из-за чего запрос
// страницы не завершается и событие load не наступает — Safari «грузит вечно».
function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener("abort", () => controller.abort());
    }
  } catch (_) {}
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return /\/assets\/app-/.test(url.pathname) || /(?:^|\/)icon-.*\.png$/.test(url.pathname) || /\.(?:css|woff2?)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Навигация: сеть в приоритете, при офлайне — сохранённая оболочка.
  if (request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(request, 10000)
        .then((response) => {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html").then((cached) => cached || Response.error())),
    );
    return;
  }

  // Ассеты сборки и иконки: кэш, затем сеть (с докэшированием). Сеть — с
  // таймаутом, чтобы «зависший» origin не блокировал выпуск события load.
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetchWithTimeout(request, 8000)
            .then((response) => {
              if (response.ok) {
                const copy = response.clone();
                void caches.open(VERSION).then((cache) => cache.put(request, copy));
              }
              return response;
            })
            .catch(() => Response.error()),
      ),
    );
  }
});
