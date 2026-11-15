import { campfireCanPlay } from './policy.js';
export function mountCampfire(document, signal) {
    const video = document.querySelector('.jaw-campfire');
    const welcome = video?.closest('dialog');
    const source = video?.dataset.src;
    if (!video || !welcome || !source)
        return;
    const sync = (quality) => {
        if (!campfireCanPlay({
            opening: welcome.open && welcome.hasAttribute('data-sequence'),
            finished: video.ended,
            pageHidden: document.hidden,
            quality,
        })) {
            video.pause();
            return;
        }
        if (!video.hasAttribute('src'))
            video.src = source;
        if (video.paused)
            void video.play().catch(() => { });
    };
    video.muted = true;
    video.addEventListener('playing', () => video.setAttribute('data-ready', ''), { signal });
    signal.addEventListener('abort', () => video.pause(), { once: true });
    return sync;
}
