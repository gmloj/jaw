export const profiles = {
    jaw: { primary: [151, 63, 255], secondary: [255, 146, 69], beam: '-19deg' },
    mafia: { primary: [166, 36, 65], secondary: [102, 32, 134], beam: '-30deg' },
    'mafia-night': { primary: [129, 21, 48], secondary: [50, 38, 115], beam: '-35deg' },
    'mafia-day': { primary: [213, 83, 64], secondary: [239, 155, 85], beam: '-14deg' },
    mystery: { primary: [157, 66, 255], secondary: [107, 93, 222], beam: '-26deg', motif: '؟' },
    court: { primary: [213, 140, 47], secondary: [177, 76, 38], beam: '-13deg' },
    split: { primary: [161, 64, 255], secondary: [39, 182, 234], beam: '25deg' },
    party: { primary: [148, 66, 228], secondary: [219, 77, 148], beam: '16deg' },
    competition: { primary: [87, 93, 226], secondary: [42, 186, 188], beam: '-29deg' },
};
export function visualProfile(value) {
    return typeof value === 'string' && Object.hasOwn(profiles, value) ? value : 'jaw';
}
export function sceneFor(profile, phase) {
    const scene = visualProfile(profile);
    if (scene !== 'mafia')
        return scene;
    if (phase === 'night')
        return 'mafia-night';
    if (['day', 'dayResult', 'voting'].includes(phase ?? ''))
        return 'mafia-day';
    return scene;
}
export function visualQuality(value) {
    return value === 'high' || value === 'low' ? value : 'balanced';
}
export function effectiveQuality(quality, reduced, constrained) {
    if (reduced || quality === 'low')
        return 'low';
    if (!constrained)
        return quality;
    return quality === 'high' ? 'balanced' : 'low';
}
export function particleCount(event, quality, reduced) {
    if (reduced || quality === 'low')
        return 0;
    const counts = {
        intro: 5, start: 5, reveal: 8, select: 4, vote: 5, win: 18, loss: 0, timeout: 0, achievement: 14, special: 8,
    };
    return quality === 'high' ? counts[event] : Math.ceil(counts[event] / 2);
}
export function slowSample(frames, slow) {
    return frames >= 30 && slow / frames >= .28;
}
export function campfireCanPlay({ opening, finished, pageHidden, quality }) {
    return opening && !finished && !pageHidden && quality !== 'low';
}
