const cacheName = 'jaw-home-discovery-v1';
const cachePrefixes = ['jaw-', 'dawrak-'];
const files = [
  '', 'style.css', 'home-discovery.css', 'home-discovery.js', 'motion.css', 'visual.css', 'founder.css', 'visual/policy.js', 'visual/controller.js', 'visual/campfire.js', 'motion/policy.js', 'motion/controller.js', 'motion/gestures.js', 'app.js', 'welcome.js', 'views.js', 'tutorial.js', 'content.js', 'choice-questions.js', 'choice-engine.js', 'party-content.js', 'team-prompts.js', 'team-engine.js', 'hideout.js', 'team-views.js', 'engine.js', 'offline.js',
  'manifest.webmanifest', 'vendor/gsap-3.15.1.min.js', 'assets/plex-arabic-400.woff2', 'assets/plex-arabic-700.woff2',
  'assets/plex-latin-400.woff2', 'assets/plex-latin-700.woff2', 'assets/jaw-wordmark.webp', 'assets/isco-jackaroo.webp',
  'assets/jaw-icon-v2-192.png', 'assets/jaw-icon-v2-512.png', 'assets/jaw-icon-v2-180.png',
  'assets/jaw-icon-v2-maskable.png', 'assets/jaw-campfire.webp', 'assets/jaw-opening-oud.mp3',
  'assets/jaw-lounge.webp', 'assets/jaw-lounge-small.webp', 'assets/jaw-game-0.webp',
  'assets/jaw-game-1.webp', 'assets/jaw-game-2.webp', 'assets/jaw-game-3.webp',
  'assets/jaw-evidence.webp', 'assets/jaw-reverse.webp', 'assets/jaw-know.webp',
  'assets/jaw-team-taboo.webp', 'assets/jaw-team-auction.webp', 'assets/jaw-team-hideout.webp',
  'assets/jaw-choice.webp', 'assets/jaw-anonymous.webp', 'assets/game-2.webp', 'assets/game-3.webp',
];
const localUrl = (file) => new URL(file, self.registration.scope).href;
const siteRoot = localUrl('');
const urls = new Set(files.map(localUrl));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(
    files.map((file) => new Request(localUrl(file), { cache: 'reload' })),
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => cachePrefixes.some((prefix) => key.startsWith(prefix)) && key !== cacheName).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'activate-update') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const pageUrl = url.origin + url.pathname;
  const isHome = request.mode === 'navigate' && [siteRoot, localUrl('index.html')].includes(pageUrl);
  if (!isHome && !urls.has(request.url)) return;
  const key = isHome ? siteRoot : request;
  const cache = caches.open(cacheName);
  const online = Promise.resolve().then(() => fetch(request, {
    cache: 'no-cache',
    signal: globalThis.AbortSignal?.timeout?.(4500),
  })).catch(() => null);

  if (!request.headers?.has('range')) {
    event.waitUntil?.(online.then(async (response) => {
      if (response?.status === 200 && !response.redirected) {
        await (await cache).put(key, response.clone());
      }
    }).catch(() => {}));
  }

  event.respondWith((async () => {
    const response = await online;
    if (response && response.status < 500) return response;

    const cached = await (await cache).match(key);
    if (!cached) return response || Response.error();
    if (isHome && cached.redirected) {
      return new Response(cached.body, { status: cached.status, headers: cached.headers });
    }
    return cached;
  })());
});
