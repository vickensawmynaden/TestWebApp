// Offline cache for the installed Last Mile web app: cache-first for game files.
const CACHE = 'lastmile-v2';
const FILES = ['run.html', 'run.webmanifest', 'css/style.css', 'css/run.css', 'js/run.js', 'js/textures.js', 'js/models.js',
  'js/zombie.js', 'js/humans.js', 'js/audio.js', 'vendor/three/three.module.min.js', 'vendor/three/addons/loaders/GLTFLoader.js', 'vendor/three/addons/utils/SkeletonUtils.js',
  'vendor/three/addons/utils/BufferGeometryUtils.js', 'models/lawman.glb', 'models/ogre.glb', 'models/werewolf.glb', 'models/zombie_soldier.glb', 'models/zombie_woman.glb',
  'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
