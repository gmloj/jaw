let installPrompt;
let updateReady = false;
let registration;

export const installed = () => window.matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone);
export const hasUpdate = () => updateReady;

export function enableOffline({ onInstallChange, onUpdate }) {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    onInstallChange();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    onInstallChange();
  });
  if (!('serviceWorker' in navigator)) return;

  let upgrading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (upgrading) window.location.reload();
  });
  window.addEventListener('jaw-activate-update', () => {
    if (!registration?.waiting) return;
    upgrading = true;
    registration.waiting.postMessage('activate-update');
  });

  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      const check = () => {
        if (!registration.waiting || !navigator.serviceWorker.controller) return;
        updateReady = true;
        onUpdate();
      };
      check();
      registration.installing?.addEventListener('statechange', check);
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', check);
      });
    } catch {
      // A blocked service worker does not interrupt an open local game.
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', register, { once: true });
}

export async function requestInstall() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice.outcome === 'accepted';
  } catch {
    return false;
  }
}

export function activateUpdate() {
  window.dispatchEvent(new Event('jaw-activate-update'));
}
