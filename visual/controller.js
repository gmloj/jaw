import { effectiveQuality, particleCount, profiles, sceneFor, slowSample, visualQuality } from './policy.js';
import { mountCampfire } from './campfire.js';
export function createVisuals(document) {
    const window = document.defaultView;
    const root = document.documentElement;
    const lifecycle = new AbortController();
    const { signal } = lifecycle;
    const updateCampfire = mountCampfire(document, signal);
    if (window.IntersectionObserver) {
        const scenes = new window.IntersectionObserver((entries) => {
            for (const entry of entries) {
                entry.target.toggleAttribute('data-isco-visible', entry.intersectionRatio >= .12);
            }
        }, { threshold: .12 });
        for (const scene of document.querySelectorAll('[data-isco-scene]'))
            scenes.observe(scene);
        signal.addEventListener('abort', () => scenes.disconnect(), { once: true });
    }
    const environment = document.createElement('div');
    environment.className = 'jaw-environment';
    environment.setAttribute('aria-hidden', 'true');
    environment.innerHTML = '<div class="jaw-layer"></div><div class="jaw-layer"></div><div class="jaw-ambient"></div>';
    document.body.prepend(environment);
    const layers = [...environment.querySelectorAll('.jaw-layer')];
    const ambient = environment.lastElementChild;
    for (let i = 0; i < 8; i++) {
        const light = document.createElement('i');
        light.style.setProperty('--i', String(i));
        light.style.setProperty('--y', String(14 + i * 17 % 72) + '%');
        ambient.append(light);
    }
    let requested = 'balanced';
    let quality = 'balanced';
    let reduced = false;
    let sluggish = false;
    let batteryLow = false;
    let scene;
    let activeLayer = 1;
    let previousLayerTimer = 0;
    let frame = 0;
    let sampled = false;
    let samplePending = false;
    let effect;
    let effectAnchor;
    let cleanupTimer = 0;
    let countdown;
    let countdownTimer = 0;
    function clearEvent() {
        window.clearTimeout(cleanupTimer);
        effect?.remove();
        effect = undefined;
        effectAnchor?.removeAttribute('data-jaw-light');
        effectAnchor = undefined;
    }
    function skipCountdown() {
        window.clearTimeout(countdownTimer);
        countdown?.remove();
        countdown = undefined;
    }
    function syncCampfire() { updateCampfire?.(quality); }
    function update() {
        const next = effectiveQuality(requested, reduced, sluggish || batteryLow);
        if (quality !== next || reduced || document.hidden)
            clearEvent();
        if (next === 'low' || document.hidden)
            skipCountdown();
        quality = next;
        root.dataset.visualQuality = quality;
        root.toggleAttribute('data-visual-paused', document.hidden);
        syncCampfire();
    }
    function sample() {
        if (sampled || samplePending || requested === 'low' || reduced || document.hidden)
            return;
        samplePending = true;
        let previous = 0;
        let frames = 0;
        let slow = 0;
        let samples = 0;
        let slowWindows = 0;
        const measure = (timestamp) => {
            if (document.hidden || reduced || requested === 'low') {
                samplePending = false;
                return;
            }
            if (previous) {
                frames++;
                if (timestamp - previous > 27)
                    slow++;
            }
            previous = timestamp;
            if (frames === 42) {
                if (slowSample(frames, slow))
                    slowWindows++;
                frames = 0;
                slow = 0;
                samples++;
            }
            if (samples < 2)
                frame = window.requestAnimationFrame(measure);
            else {
                sampled = true;
                samplePending = false;
                sluggish = slowWindows === 2;
                update();
            }
        };
        frame = window.requestAnimationFrame(measure);
    }
    function apply(value, useReduced) {
        if (visualQuality(value) !== requested) {
            sampled = false;
            sluggish = false;
        }
        requested = visualQuality(value);
        reduced = useReduced;
        update();
        sample();
    }
    function atmosphere(profile, phase) {
        const next = sceneFor(profile, phase);
        if (scene === next)
            return;
        const previously = scene;
        scene = next;
        const palette = profiles[next];
        const layer = layers[activeLayer ^= 1];
        layer.style.setProperty('--scene-a', palette.primary.join(' '));
        layer.style.setProperty('--scene-b', palette.secondary.join(' '));
        layer.style.setProperty('--scene-beam', palette.beam);
        layer.dataset.active = 'true';
        const previous = layers[activeLayer ^ 1];
        previous.style.removeProperty('transition');
        previous.dataset.active = 'false';
        delete layer.dataset.idle;
        window.clearTimeout(previousLayerTimer);
        previousLayerTimer = window.setTimeout(() => { previous.dataset.idle = 'true'; }, 550);
        if (!previously)
            layer.style.transition = 'none';
        else
            layer.style.removeProperty('transition');
        root.dataset.atmosphere = scene;
        ambient.dataset.motif = 'motif' in palette ? palette.motif : '';
    }
    function emit(event, anchor, side) {
        if (document.hidden || reduced || signal.aborted)
            return;
        clearEvent();
        if (anchor && event !== 'intro') {
            effectAnchor = anchor;
            effectAnchor.setAttribute('data-jaw-light', event);
        }
        const layer = document.createElement('div');
        layer.className = 'jaw-event';
        layer.dataset.event = event;
        layer.setAttribute('aria-hidden', 'true');
        const bounds = anchor?.getBoundingClientRect();
        if (bounds && bounds.width && bounds.bottom > 0 && bounds.top < window.innerHeight) {
            const bias = side === undefined ? .5 : side === 0 ? .72 : .28;
            layer.style.setProperty('--event-x', Math.round(bounds.left + bounds.width * bias) + 'px');
            layer.style.setProperty('--event-y', Math.round(Math.max(0, bounds.top) + Math.min(bounds.height, 150) * .45) + 'px');
        }
        const total = particleCount(event, quality, reduced);
        for (let i = 0; i < total; i++) {
            const point = document.createElement('i');
            const angle = i * 2.39996;
            const distance = 28 + i % 5 * 14;
            point.style.setProperty('--dx', Math.round(Math.cos(angle) * distance) + 'px');
            point.style.setProperty('--dy', Math.round(Math.sin(angle) * distance + (event === 'win' ? 35 : 0)) + 'px');
            point.style.setProperty('--delay', String(i % 4 * 32) + 'ms');
            layer.append(point);
        }
        environment.append(layer);
        effect = layer;
        cleanupTimer = window.setTimeout(clearEvent, 1400);
    }
    function startRound(stage) {
        skipCountdown();
        if (reduced || quality === 'low' || document.hidden)
            return;
        countdown = document.createElement('span');
        countdown.className = 'jaw-countdown';
        countdown.setAttribute('aria-hidden', 'true');
        stage.prepend(countdown);
        let value = 3;
        const tick = () => {
            if (!countdown?.isConnected || !value)
                return skipCountdown();
            const digit = document.createElement('span');
            digit.textContent = '٣٢١'[3 - value--];
            countdown.replaceChildren(digit);
            countdownTimer = window.setTimeout(tick, 270);
        };
        tick();
    }
    // Players can dismiss the nonblocking opening just by using any control.
    document.addEventListener('pointerdown', skipCountdown, { passive: true, signal });
    document.addEventListener('keydown', skipCountdown, { signal });
    document.addEventListener('visibilitychange', () => {
        update();
        if (!document.hidden)
            sample();
    }, { signal });
    const navigator = window.navigator;
    void navigator.getBattery?.().then((battery) => {
        if (signal.aborted)
            return;
        const check = () => {
            batteryLow = !battery.charging && battery.level <= .18;
            update();
        };
        battery.addEventListener('chargingchange', check, { signal });
        battery.addEventListener('levelchange', check, { signal });
        check();
    }).catch(() => { });
    atmosphere('jaw');
    return {
        apply, atmosphere, emit, clearEvent, startRound, skipCountdown, syncCampfire,
        destroy() {
            lifecycle.abort();
            window.cancelAnimationFrame(frame);
            window.clearTimeout(previousLayerTimer);
            skipCountdown();
            clearEvent();
            environment.remove();
        },
    };
}
