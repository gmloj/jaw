import { gameProfile, gameProfiles, motionLevel } from './policy.js';
import { registerGestures } from './gestures.js';
const frames = {
    fade: [{ opacity: .65 }, { opacity: 1 }],
    rise: [{ opacity: .35, transform: 'translateY(var(--motion-distance, 10px))' }, { opacity: 1, transform: 'translateY(0)' }],
    flip: [{ opacity: .30, transform: 'perspective(620px) rotateY(28deg) scale(.97)' }, { opacity: 1, transform: 'perspective(620px) rotateY(0deg) scale(1)' }],
    pop: [{ opacity: .55, transform: 'scale(.973) translateY(5px)' }, { opacity: 1, transform: 'scale(1) translateY(0)' }],
    select: [{ transform: 'scale(.982)' }, { transform: 'scale(1)' }],
    error: [{ opacity: .5, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'translateY(0)' }],
    tick: [{ transform: 'scale(.93)' }, { transform: 'scale(1)' }],
    win: [{ opacity: .65, transform: 'scale(.97)' }, { opacity: 1, transform: 'scale(1)' }],
    loss: [{ opacity: .57 }, { opacity: 1 }],
};
const tones = {
    press: [330], select: [430, 540], reveal: [330, 510], timeout: [330, 250],
    vote: [440, 495], win: [440, 550, 660], loss: [430, 295], round: [], success: [460, 610], error: [240, 190],
};
const vibration = {
    select: 9, reveal: [10, 28, 12], timeout: [24, 36, 24], vote: 10, win: [14, 38, 18], loss: 20, success: 10, error: 17,
};
export function createMotion(document, preferences) {
    const win = document.defaultView;
    const root = document.documentElement;
    const system = win.matchMedia('(prefers-reduced-motion: reduce)');
    const listeners = new AbortController();
    const { signal } = listeners;
    const active = new Map();
    const leaveGhosts = new Set();
    let seenCards = new WeakSet();
    let audio;
    let level = motionLevel(preferences.motion, system.matches);
    let lastFeedback = 0;
    let feedbackPriority = 0;
    const observedCards = new WeakSet();
    const duration = (token, style) => parseFloat(style.getPropertyValue('--motion-' + token)) || 1;
    function play(element, preset, timing = 'ui') {
        if (!element?.isConnected || typeof element.animate !== 'function' || level === 'reduced')
            return;
        active.get(element)?.cancel();
        const style = win.getComputedStyle(element);
        const easeToken = preset === 'flip' || preset === 'pop' || preset === 'select' || preset === 'win' ? '--motion-spring' : '--motion-out';
        const time = duration(timing, style);
        const easing = style.getPropertyValue(easeToken).trim() || 'ease-out';
        const animation = element.animate(frames[preset], { duration: time, easing });
        active.set(element, animation);
        const forget = () => { if (active.get(element) === animation)
            active.delete(element); };
        animation.addEventListener('finish', forget, { once: true });
        animation.addEventListener('cancel', forget, { once: true });
    }
    function clear(container) {
        for (const [element, animation] of active) {
            if (!element.isConnected || !container || container.contains(element)) {
                animation.cancel();
                active.delete(element);
            }
        }
    }
    function apply(next) {
        preferences = next;
        const requested = motionLevel(preferences.motion, system.matches);
        if (requested !== level)
            clear();
        level = requested;
        root.dataset.motion = level;
        root.dataset.systemMotion = system.matches ? 'reduced' : 'normal';
        if (level === 'reduced') {
            for (const ghost of leaveGhosts)
                ghost.remove();
            leaveGhosts.clear();
        }
        if (!preferences.sound && audio?.state === 'running')
            void audio.suspend().catch(() => { });
    }
    function unlockAudio() {
        if (!preferences.sound || typeof AudioContext !== 'function')
            return;
        try {
            audio ??= new AudioContext();
            if (audio.state === 'suspended')
                void audio.resume().catch(() => { });
        }
        catch {
            // Visual feedback is available independently of device audio.
        }
    }
    function feedback(event) {
        if (document.hidden || event === 'round')
            return;
        const priority = event === 'press' ? 0 : 1;
        const now = win.performance.now();
        if (now - lastFeedback < 110 && priority <= feedbackPriority && lastFeedback)
            return;
        lastFeedback = now;
        feedbackPriority = priority;
        const pattern = vibration[event];
        if (preferences.vibration && level !== 'reduced' && pattern)
            win.navigator.vibrate?.(pattern);
        if (!preferences.sound || audio?.state !== 'running')
            return;
        const start = audio.currentTime;
        tones[event].forEach((hz, i) => {
            const offset = start + i * .064;
            const tone = audio.createOscillator();
            const gain = audio.createGain();
            tone.type = 'sine';
            tone.frequency.value = hz;
            gain.gain.setValueAtTime(.001, offset);
            gain.gain.linearRampToValueAtTime(.035, offset + .013);
            gain.gain.exponentialRampToValueAtTime(.001, offset + .09);
            tone.connect(gain).connect(audio.destination);
            tone.start(offset);
            tone.stop(offset + .1);
            tone.addEventListener('ended', () => { tone.disconnect(); gain.disconnect(); }, { once: true });
        });
    }
    function round(element, profile, timing, event) {
        const theme = gameProfiles[gameProfile(profile)];
        element.style.setProperty('--motion-distance', theme.distance);
        element.dataset.motionEffect = theme.effects;
        if (event === 'win' || event === 'loss' || event === 'timeout') {
            element.dataset.motionOutcome = event;
            const panel = element.querySelector('.result-panel');
            play(panel, event === 'win' ? 'win' : 'loss', event === 'win' ? 'victory' : 'card');
        }
        else if (event === 'reveal') {
            play(element.querySelector('.secret-card, .anonymous-reveal, .know-answer, .clue-open:last-child') ?? element, theme.reveal, 'reveal');
        }
        else {
            play(element, theme.enter, timing);
        }
        feedback(event);
    }
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting)
                continue;
            observer?.unobserve(entry.target);
            if (seenCards.has(entry.target))
                continue;
            seenCards.add(entry.target);
            play(entry.target, 'rise', 'card');
        }
    }, { threshold: .22 }) : null;
    function observeCards(container) {
        if (!observer)
            return;
        for (const card of container.querySelectorAll('.game-card, [data-motion-enter="once"]')) {
            if (!seenCards.has(card) && !observedCards.has(card)) {
                observedCards.add(card);
                observer.observe(card);
            }
        }
    }
    function modalExit(dialog) {
        if (level === 'reduced' || !dialog.open || !dialog.animate)
            return;
        const { x, y, width, height } = dialog.getBoundingClientRect();
        if (!width || !height)
            return;
        // A decorative outline can finish the departure without retaining the dialog's focus or content.
        const shell = document.createElement('div');
        shell.className = 'motion-modal-exit';
        shell.setAttribute('aria-hidden', 'true');
        Object.assign(shell.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' });
        document.body.append(shell);
        leaveGhosts.add(shell);
        const style = win.getComputedStyle(shell);
        const animation = shell.animate([{ opacity: .58 }, { opacity: 0, transform: 'scale(.985) translateY(6px)' }], {
            duration: duration('ui', style), easing: 'ease-out',
        });
        const cleanup = () => { leaveGhosts.delete(shell); shell.remove(); };
        animation.addEventListener('finish', cleanup, { once: true });
        animation.addEventListener('cancel', cleanup, { once: true });
    }
    const controlSelector = 'button, a[href], input[type="button"], input[type="submit"], summary, [role="button"]';
    document.addEventListener('click', (event) => {
        if (!event.isTrusted || !(event.target instanceof Element))
            return;
        const control = event.target.closest(controlSelector);
        if (!control || control.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]'))
            return;
        unlockAudio();
        // Forms and game actions report accepted results separately from generic presses.
        if (!control.dataset.action && !control.matches('[type="submit"]'))
            feedback('press');
    }, { capture: true, signal });
    document.addEventListener('invalid', (event) => {
        if (event.target instanceof HTMLElement)
            play(event.target, 'error', 'ui');
        feedback('error');
    }, { capture: true, signal });
    system.addEventListener('change', () => {
        apply(preferences);
        document.dispatchEvent(new Event('jaw:motion-preference'));
    }, { signal });
    registerGestures(document, signal);
    apply(preferences);
    return { apply, play, clear, feedback, round, observeCards, modalExit, unlockAudio,
        get reduced() { return level === 'reduced'; },
        get systemReduced() { return system.matches; },
        destroy() {
            listeners.abort();
            observer?.disconnect();
            seenCards = new WeakSet();
            clear();
            for (const ghost of leaveGhosts)
                ghost.remove();
            leaveGhosts.clear();
            if (audio)
                void audio.close().catch(() => { });
        },
    };
}
