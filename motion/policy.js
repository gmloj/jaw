export function motionPreferences(saved) {
    const requested = saved?.motion;
    const motion = requested === 'full' ? 'full' : requested === false || requested === 'reduced' ? 'reduced' : 'balanced';
    return { motion, sound: saved?.sound === true, vibration: saved?.vibration !== false };
}
export function motionLevel(level, systemReduced) {
    return systemReduced ? 'reduced' : level;
}
export const gameProfiles = {
    mystery: { enter: 'rise', reveal: 'flip', effects: 'gold', distance: '14px' },
    party: { enter: 'pop', reveal: 'pop', effects: 'purple', distance: '10px' },
    drama: { enter: 'rise', reveal: 'rise', effects: 'orange', distance: '20px' },
    competition: { enter: 'rise', reveal: 'pop', effects: 'gold', distance: '8px' },
    casual: { enter: 'fade', reveal: 'rise', effects: 'purple', distance: '6px' },
};
export function gameProfile(value) {
    return typeof value === 'string' && Object.hasOwn(gameProfiles, value)
        ? value : 'casual';
}
const actionFeedback = {
    'choice-pick': 'select', 'know-answer': 'select', 'know-guess': 'select', 'begin-vote': 'vote',
    'vote-form': 'vote', 'reveal': 'reveal', 'anonymous-open': 'reveal', 'evidence-clue': 'reveal',
};
export function feedbackForAction(action) {
    return Object.hasOwn(actionFeedback, action) ? actionFeedback[action] : 'press';
}
export function resultFeedback(round, evidenceAnswer) {
    switch (round.kind) {
        case 'evidence':
            return round.guess === null ? 'timeout' : round.guess === evidenceAnswer ? 'win' : 'loss';
        case 'court':
            return round.ending === 'guilty' ? 'win' : 'round';
        case 'social':
        case 'reverse':
            return round.votes?.some((vote) => vote !== null) ? 'win' : 'round';
        case 'challenge':
        case 'choice':
        case 'know':
            return Object.values(round.scores ?? {}).some((points) => points > 0) ? 'win' : 'round';
        default:
            return round.ending ? 'win' : 'round';
    }
}
export function gestureIntent(dx, dy, heldMs = 0) {
    if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.5)
        return 'swipe';
    if (Math.abs(dy) >= 16 && Math.abs(dy) >= Math.abs(dx))
        return 'cancel';
    if (heldMs >= 500 && Math.hypot(dx, dy) <= 9)
        return 'hold';
    return null;
}
export function gestureDirection(dx, rtl) {
    return (rtl ? dx > 0 : dx < 0) ? 'next' : 'previous';
}
