const welcomeKey = 'jaw-welcome-v7';
const openingLength = 7000;
const audioStartGrace = 900;
const soundPreparationLimit = 3500;

export function mountWelcome(dialog, { content, onEnter, syncCampfire }) {
  const audio = dialog.querySelector('audio');
  const film = dialog.querySelector('video');
  const sound = dialog.querySelector('.welcome-sound');
  const skip = dialog.querySelector('.welcome-skip');
  const start = dialog.querySelector('.welcome-start');
  const tools = dialog.querySelector('.welcome-tools');
  const mediaRequest = new AbortController();
  let entered = false;
  let started = false;
  let soundUrl;
  let openedAt = 0;
  let closeTimer;
  let sceneTimer;
  let replayOnSound = false;

  function isRequired() {
    try {
      return !sessionStorage.getItem(welcomeKey);
    } catch {
      return true;
    }
  }

  async function prepareSound() {
    const preparationTimer = setTimeout(() => mediaRequest.abort(), soundPreparationLimit);
    try {
      const response = await fetch(audio.dataset.src, { signal: mediaRequest.signal });
      if (!response.ok) return;
      const clip = await response.blob();
      if (!clip.size || started || entered) return;
      soundUrl = URL.createObjectURL(clip);
      audio.src = soundUrl;
    } catch {
      // The first tap can still play directly from the media URL.
    } finally {
      clearTimeout(preparationTimer);
      if (!entered) start.disabled = false;
    }
  }

  function startScene(elapsed = 0) {
    if (entered) return;
    clearTimeout(sceneTimer);
    if (dialog.hasAttribute('data-sequence')) {
      dialog.removeAttribute('data-sequence');
      // Let the drawing animation restart with the recording.
      void dialog.offsetWidth;
    }
    dialog.setAttribute('data-sequence', '');
    if (film.readyState) film.currentTime = elapsed;
    scheduleEntry(elapsed * 1000);
    syncCampfire();
  }

  function scheduleEntry(elapsed = 0) {
    clearTimeout(closeTimer);
    openedAt = performance.now() - elapsed;
    closeTimer = setTimeout(enter, Math.max(0, openingLength - elapsed));
  }

  function updateSoundControl() {
    const playing = !audio.paused && !audio.ended;
    sound.setAttribute('aria-pressed', String(playing));
    sound.title = playing ? 'كتم العود' : 'تشغيل العود';
  }

  function requestSound() {
    audio.currentTime = 0;
    replayOnSound = true;
    void audio.play().catch(() => {
      replayOnSound = false;
      updateSoundControl();
      if (!dialog.hasAttribute('data-sequence')) startScene();
    });
  }

  start.addEventListener('click', () => {
    if (started || entered) return;
    started = true;
    start.hidden = true;
    tools.hidden = false;
    if (!audio.hasAttribute('src')) {
      mediaRequest.abort();
      audio.src = audio.dataset.src;
    }
    sceneTimer = setTimeout(startScene, audioStartGrace);
    // Call play in the click handler so the tap unlocks sound in the browser.
    requestSound();
    skip.focus({ preventScroll: true });
  });

  sound.addEventListener('click', () => {
    if (!started || entered) return;
    if (audio.paused) requestSound();
    else {
      replayOnSound = false;
      audio.pause();
    }
  });

  audio.addEventListener('playing', () => {
    updateSoundControl();
    if (!replayOnSound || entered) return;
    replayOnSound = false;
    startScene(audio.currentTime);
  });
  audio.addEventListener('pause', updateSoundControl);
  audio.addEventListener('ended', updateSoundControl);
  skip.addEventListener('click', enter);

  function enter() {
    if (entered) return;
    entered = true;
    clearTimeout(closeTimer);
    clearTimeout(sceneTimer);
    mediaRequest.abort();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (soundUrl) URL.revokeObjectURL(soundUrl);
    try {
      sessionStorage.setItem(welcomeKey, '1');
    } catch { /* The application still opens when storage is disabled. */ }
    dialog.close();
    content.inert = false;
    syncCampfire();
    onEnter();
  }

  document.addEventListener('visibilitychange', () => {
    if (!dialog.open) return;
    if (document.hidden) audio.pause();
    else if (dialog.hasAttribute('data-sequence') && performance.now() - openedAt >= openingLength) enter();
  });
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  dialog.addEventListener('close', () => {
    if (!entered) enter();
  });

  return {
    isRequired,
    open() {
      content.inert = true;
      dialog.showModal();
      void prepareSound();
    },
  };
}
