/* Service worker (F7): network-first para el app shell.
   - Con internet, cada archivo de la app se pide a la red (así siempre corre
     la última versión publicada) y se guarda una copia.
   - Sin red, si la red falla o si tarda más de NETWORK_TIMEOUT_MS, se usa la
     copia guardada. Con el sitio protegido por login de Netlify, una respuesta
     no-OK (401, redirect) también cae a la copia.
   - Las llamadas al Web App de Apps Script nunca pasan por acá: siempre van a
     la red (la copia local de los datos la maneja app.js).
   CACHE_NAME se sigue subiendo con cada cambio en public/ para limpiar copias
   viejas, pero ya no es lo que hace llegar la versión nueva. */

const CACHE_NAME = 'gastos-shell-v37';
const NETWORK_TIMEOUT_MS = 3000;
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/calc.js',
  './js/api.js',
  './js/app.js',
  './js/charts.js',
  './js/views/mensual.js',
  './js/views/proyeccion.js',
  './js/views/promedio.js',
  './js/views/gastos.js',
  './js/views/config.js',
  './js/views/revisar.js',
  './vendor/chart.umd.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then((res) => {
      clearTimeout(timer);
      if (!res || !res.ok) { reject(new Error('respuesta ' + (res && res.status))); return; }
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      resolve(res);
    }, (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar llamadas a la API de Apps Script.
  if (url.hostname.includes('script.google') || url.hostname.includes('googleusercontent')) return;

  // Solo GETs del mismo origen (el app shell).
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fromNetwork(event.request).catch(() =>
      caches.match(event.request, { ignoreSearch: true }).then((cached) =>
        cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined) || fetch(event.request)
      )
    )
  );
});
