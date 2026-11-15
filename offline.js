let installPrompt;
let updateReady = false;
let registration;

export const installed = () => window.matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone);
export const hasUpdate = () => updateReady;

export function enableOffline({ onInstallChange, onUpdate, canReload }) {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    onInstallChange();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    onInstallChange();
  });

  const workers = navigator.serviceWorker;
  let previousController = workers?.controller;
  let activatedUpdate = false;
  let manualUpdate = false;
  let reloading = false;
  let lastCheck = -Infinity;

  function reload() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }

  function refreshWhenIdle() {
    if (activatedUpdate && installed() && navigator.onLine && !document.hidden && canReload()) reload();
  }

  window.addEventListener('jaw-activate-update', () => {
    if (!navigator.onLine) return;
    if (!registration?.waiting) {
      reload();
      return;
    }
    manualUpdate = true;
    registration.waiting.postMessage('activate-update');
  });

  if (!workers) return refreshWhenIdle;

  function notifyUpdate() {
    if (updateReady) return;
    updateReady = true;
    onUpdate();
  }

  workers.addEventListener('controllerchange', () => {
    const controller = workers.controller;
    const replaced = previousController && controller && previousController !== controller;
    previousController = controller;
    if (manualUpdate && controller) {
      reload();
      return;
    }
    if (!replaced) return;
    activatedUpdate = true;
    notifyUpdate();
    refreshWhenIdle();
  });

  function checkForUpdate() {
    if (!navigator.onLine || document.hidden) return;
    if (registration && !reloading && performance.now() - lastCheck >= 15_000) {
      lastCheck = performance.now();
      void registration.update().catch(() => {});
    }
    refreshWhenIdle();
  }

  window.addEventListener('online', checkForUpdate);
  window.addEventListener('pageshow', checkForUpdate);
  document.addEventListener('visibilitychange', checkForUpdate);

  const register = async () => {
    try {
      registration = await workers.register('./sw.js', { updateViaCache: 'none' });
      const checkWaiting = () => {
        if (registration.waiting && workers.controller) notifyUpdate();
      };
      const watchInstalling = () => registration.installing?.addEventListener('statechange', checkWaiting);
      checkWaiting();
      watchInstalling();
      registration.addEventListener('updatefound', watchInstalling);
    } catch {
      // A blocked service worker does not interrupt an open local game.
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', register, { once: true });
  return refreshWhenIdle;
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
