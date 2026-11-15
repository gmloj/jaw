export const hideoutPlaces = [
  'استراحة', 'مول بعد الإغلاق', 'فندق كبير', 'بيت شعبي', 'ملاهي',
  'سوق قديم', 'مخيم في البر', 'ملعب كرة', 'محطة قطار', 'مزرعة',
];
export const hideoutLimits = { hiding: 30_000, searching: 60_000, questions: 2, guesses: 3 };
export const hideoutTextLimit = 80;

const isText = (text) => typeof text === 'string' && text.trim().length > 0 && text.length <= hideoutTextLimit;
const clean = (text) => typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
const hidingTeam = (team) => team.turn % 2;
const roster = (team) => team.squads[hidingTeam(team)].players;
const indexBelongsTo = (index, team) => Number.isInteger(index) && index >= 0 && index < roster(team).length;

export function emptyHideout() {
  return { place: '', spots: [], questions: 0, guesses: [], pending: null };
}

function change(round, phase, fields) {
  return { ...round, phase, team: { ...round.team, ...fields } };
}

function updateSearch(round, hideout, fields = {}) {
  return change(round, 'team-play', { hideout, ...fields });
}

function settle(round, hideout = round.team.hideout) {
  const { team } = round;
  const side = hidingTeam(team);
  const caught = hideout.guesses.filter(({ correct }) => correct).length;
  const points = side === 0 ? [roster(team).length - caught, caught] : [caught, roster(team).length - caught];
  return change(round, 'team-summary', {
    hideout, scores: team.scores.map((score, index) => score + points[index]), endsAt: null, remaining: null,
  });
}

function canGuess(team, player) {
  const { guesses } = team.hideout;
  return indexBelongsTo(player, team) && !guesses.some((guess) => guess.correct && guess.player === player);
}

function search(round, action, value, now) {
  const { team } = round;
  const { hideout, endsAt, remaining } = team;
  const expired = endsAt !== null && now >= endsAt;
  const running = endsAt !== null && !expired;

  if ((action === 'tick' && expired) || action === 'finish') {
    return hideout.pending ? updateSearch(round, hideout, { endsAt: null, remaining: null }) : settle(round);
  }
  if (action === 'hide-verdict' && hideout.pending && typeof value === 'boolean') {
    const guesses = [...hideout.guesses, { ...hideout.pending, correct: value }];
    const next = { ...hideout, guesses, pending: null };
    const allCaught = guesses.filter(({ correct }) => correct).length === roster(team).length;
    return allCaught || guesses.length === hideoutLimits.guesses || expired || (endsAt === null && remaining === null)
      ? settle(round, next) : updateSearch(round, next);
  }
  if (action === 'resume' && remaining !== null) {
    return updateSearch(round, hideout, { endsAt: now + remaining, remaining: null });
  }
  if (!running) return round;
  if (action === 'pause') return updateSearch(round, hideout, { endsAt: null, remaining: endsAt - now });
  if (hideout.pending) return round;
  if (action === 'hide-question' && hideout.questions < hideoutLimits.questions) {
    return updateSearch(round, { ...hideout, questions: hideout.questions + 1 });
  }
  if (action === 'hide-guess' && canGuess(team, value?.player) && hideout.guesses.length < hideoutLimits.guesses) {
    const text = clean(value.text);
    if (isText(text)) return updateSearch(round, { ...hideout, pending: { player: value.player, text } });
  }
  return round;
}

export function reduceHideout(round, action, value, now) {
  const { phase, team } = round;
  if (phase === 'team-ready' && action === 'hide-start') {
    const place = clean(value);
    if (!isText(place)) return round;
    return change(round, 'hide-spots', {
      hideout: { ...team.hideout, place, spots: roster(team).map(() => '') },
      endsAt: now + hideoutLimits.hiding,
    });
  }
  if (phase === 'hide-spots') {
    if (action === 'hide-draft' && indexBelongsTo(value?.player, team) && typeof value.text === 'string') {
      const spots = team.hideout.spots.map((spot, index) =>
        index === value.player ? value.text.slice(0, hideoutTextLimit) : spot);
      return change(round, phase, { hideout: { ...team.hideout, spots } });
    }
    if (action === 'hide-lock' && Array.isArray(value) && value.length === roster(team).length) {
      const spots = Array.from(value, clean);
      if (spots.every(isText)) return change(round, 'team-play', {
        hideout: { ...team.hideout, spots }, endsAt: now + hideoutLimits.searching,
      });
    }
  }
  if (phase === 'team-play') return search(round, action, value, now);
  if (phase === 'team-summary' && action === 'next') {
    const turn = team.turn + 1;
    if (turn === team.total) return change(round, 'team-result', {});
    return change(round, 'team-ready', { turn, hideout: emptyHideout() });
  }
  return round;
}

export function hideoutIsValid({ phase, team }) {
  if (!['team-ready', 'hide-spots', 'team-play', 'team-summary', 'team-result'].includes(phase)) return false;
  const { hideout, endsAt, remaining } = team;
  const { place, spots, questions, guesses, pending } = hideout ?? {};
  if (!Array.isArray(spots) || !Array.isArray(guesses) || guesses.length > hideoutLimits.guesses ||
      !Number.isInteger(questions) || questions < 0 || questions > hideoutLimits.questions) return false;
  const setup = phase === 'team-ready';
  if (setup ? place !== '' || spots.length : !isText(place) || spots.length !== roster(team).length) return false;
  const collecting = phase === 'hide-spots';
  if (!Array.from(spots).every((spot) => collecting
    ? typeof spot === 'string' && spot.length <= hideoutTextLimit : isText(spot))) return false;
  if ((setup || collecting) && (questions || guesses.length || pending !== null)) return false;

  const caught = new Set();
  const validGuess = (guess) => indexBelongsTo(guess?.player, team) && isText(guess.text) && !caught.has(guess.player);
  for (const guess of guesses) {
    if (!validGuess(guess) || typeof guess.correct !== 'boolean') return false;
    if (guess.correct) caught.add(guess.player);
  }

  if (phase === 'team-play') {
    if (guesses.length === hideoutLimits.guesses || caught.size === roster(team).length ||
        (pending !== null && !validGuess(pending))) return false;
    if (Number.isFinite(endsAt)) return remaining === null;
    return endsAt === null && (remaining === null
      ? pending !== null : Number.isFinite(remaining) && remaining > 0 && remaining <= hideoutLimits.searching);
  }
  return pending === null && remaining === null && (collecting ? Number.isFinite(endsAt) : endsAt === null);
}
