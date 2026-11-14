import { campfireCanPlay } from './policy.js';
export function mountCampfire(document, signal) {
    const video = document.querySelector('.jaw-campfire');
    const window = document.defaultView;
    const source = video?.dataset.src;
    if (!video?.parentElement || !source || !window?.IntersectionObserver)
        return;
    const mobile = window.matchMedia('(max-width: 639px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    let quality = 'low';
    const sync = () => {
        if (!campfireCanPlay({
            mobile: mobile.matches,
            inView,
            pageHidden: document.hidden,
            quality: reduced.matches ? 'low' : quality,
        })) {
            video.pause();
            return;
        }
        if (!video.hasAttribute('src'))
            video.src = source;
        if (video.paused)
            void video.play().catch(() => { });
    };
    const observer = new window.IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRatio >= .2;
        sync();
    }, { threshold: .2 });
    video.muted = true;
    video.addEventListener('playing', () => video.setAttribute('data-ready', ''), { signal });
    mobile.addEventListener('change', sync, { signal });
    reduced.addEventListener('change', sync, { signal });
    signal.addEventListener('abort', () => {
        observer.disconnect();
        video.pause();
    }, { once: true });
    observer.observe(video.parentElement);
    return (level) => {
        quality = level;
        sync();
    };
}
