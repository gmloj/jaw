import { gestureDirection, gestureIntent } from './policy.js';
const interactive = 'button, a, input, textarea, select, summary, [role="button"], [contenteditable]';
export function registerGestures(document, signal) {
    let pointer;
    let dragged = null;
    const cancel = () => {
        clearTimeout(pointer?.hold);
        pointer = undefined;
    };
    const emit = (element, name, detail) => element.dispatchEvent(new CustomEvent('jaw:' + name, { bubbles: true, detail }));
    document.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || !['touch', 'pen'].includes(event.pointerType) || !(event.target instanceof Element))
            return;
        const element = event.target.closest('[data-gesture="swipe"], [data-gesture="hold"], [data-gesture="pull"]');
        if (!element || element.matches('[aria-disabled="true"], :disabled') ||
            (event.target.closest(interactive) && !element.matches('[data-gesture="hold"]')))
            return;
        cancel();
        pointer = { element, id: event.pointerId, x: event.clientX, y: event.clientY, fired: false };
        if (element.dataset.gesture === 'hold') {
            const current = pointer;
            current.hold = window.setTimeout(() => {
                if (!element.isConnected || pointer !== current)
                    return;
                current.fired = true;
                emit(element, 'hold');
            }, 500);
        }
    }, { passive: true, signal });
    document.addEventListener('pointermove', (event) => {
        if (pointer?.id !== event.pointerId)
            return;
        const dx = event.clientX - pointer.x;
        const dy = event.clientY - pointer.y;
        if (Math.hypot(dx, dy) > 9)
            clearTimeout(pointer.hold);
        if (pointer.element.dataset.gesture === 'swipe' && gestureIntent(dx, dy) === 'cancel')
            cancel();
    }, { passive: true, signal });
    document.addEventListener('pointerup', (event) => {
        const current = pointer;
        if (!current || current.id !== event.pointerId)
            return;
        cancel();
        if (!current.element.isConnected || current.fired)
            return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (current.element.dataset.gesture === 'swipe' && gestureIntent(dx, dy) === 'swipe') {
            emit(current.element, 'swipe', { direction: gestureDirection(dx, getComputedStyle(current.element).direction === 'rtl') });
        }
        if (current.element.dataset.gesture === 'pull' && dy > 64 && dy > Math.abs(dx) * 1.5)
            emit(current.element, 'pull');
    }, { passive: true, signal });
    document.addEventListener('pointercancel', cancel, { passive: true, signal });
    document.addEventListener('visibilitychange', cancel, { signal });
    signal.addEventListener('abort', cancel, { once: true });
    document.addEventListener('dragstart', (event) => {
        dragged = event.target instanceof HTMLElement ? event.target.closest('[draggable="true"][data-gesture="drag"]') : null;
        if (!dragged)
            return;
        event.dataTransfer?.setData('text/plain', 'jaw-card');
        dragged.dataset.dragging = 'true';
    }, { signal });
    document.addEventListener('dragover', (event) => {
        if (dragged && event.target instanceof Element && event.target.closest('[data-drop]'))
            event.preventDefault();
    }, { signal });
    const clearDrag = () => {
        if (dragged)
            delete dragged.dataset.dragging;
        dragged = null;
    };
    document.addEventListener('drop', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-drop]') : null;
        if (!dragged || !target)
            return;
        event.preventDefault();
        emit(target, 'drop', { source: dragged });
        clearDrag();
    }, { signal });
    document.addEventListener('dragend', clearDrag, { signal });
    signal.addEventListener('abort', clearDrag, { once: true });
}
