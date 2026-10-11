/*
 * Минимальный service worker PWA.
 * Задача — установка приложения и офлайн-загрузка оболочки: навигация с сети
 * с откатом на кэш, статика сборки и иконки — по стратегии «кэш, затем сеть».
 * Данные заказов приходят с сервера и при офлайне приложение покажет
 * корректное состояние ошибки, а не «белый экран».
 */
const VERSION = "logus-v1";
const SHELL = ["./", "./index.html", "./site.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];

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
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  // Ассеты сборки и иконки: кэш, затем сеть (с докэшированием).
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
