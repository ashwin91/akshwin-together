const CACHE_NAME = "akshwin-static-v62";
const CORE_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "data/wedding.json",
  "manifest.webmanifest",
  "logo.png",
  "stamp.png",
  "entry.mp4",
  "assets/svg/marigold-cluster.svg",
  "assets/svg/temple-bell.svg",
  "assets/images/save-date-front.png",
  "assets/images/temple-wide.png",
  "assets/images/couple-portrait.png",
  "assets/images/procession.png",
  "assets/images/friends-blessing.png",
  "assets/images/sticker-couple.png",
  "assets/images/marigold-wallpaper-iphone-pro.png",
  "assets/images/our-story-poster-v2.jpg",
  "assets/images/our-story-poster-portrait.png",
  "assets/images/event-high-tea.jpg",
  "assets/images/event-sangeet.jpg",
  "assets/images/gallery/gallery-00-undated-img-1262.jpg",
  "assets/images/gallery/gallery-01-2024-11-16-175615.jpg",
  "assets/images/gallery/gallery-02-2024-11-16-182209.jpg",
  "assets/images/gallery/gallery-03-2026-02-27-092747.jpg",
  "assets/images/gallery/gallery-04-2026-02-27-115832.jpg",
  "assets/images/gallery/gallery-05-2026-02-28-163646.jpg",
  "assets/images/gallery/gallery-06-2026-03-02-135324.jpg",
  "assets/images/gallery/gallery-07-2026-03-28-085611.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Let the browser handle byte-range requests directly. Intercepting partial
  // video responses breaks seeking and can make playback unreliable on iOS.
  if (event.request.headers.has("range") || event.request.destination === "video") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("index.html")))
  );
});
