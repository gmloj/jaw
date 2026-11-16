import { emptyHideout, hideoutIsValid, reduceHideout } from './hideout.js';
import { auctionPrompts, tabooCards } from './team-prompts.js';

const decks = { taboo: tabooCards, auction: auctionPrompts };
export const teamKinds = [...Object.keys(decks), 'hideout'];

const durations = { taboo: 45_000, auction: 20_000 };
const defaultNames = ['الفريق الأول', 'الفريق الثاني'];
const phases = ['team-ready', 'team-bid', 'team-play', 'team-summary', 'team-result'];

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isTeamIndex = (value) => value === 0 || value === 1;
const isAmount = (value) => Number.isInteger(value) && value >= 1 && value <= 20;
const activeTeam = ({ turn }) => turn % 2;

function makeSquads(players, names, assignments) {
  const choices = Array.isArray(assignments) ? [...assignments] : [];
  const first = choices.filter((assignment) => assignment === 0).length;
  const balanced = choices.length === players.length && choices.every(isTeamIndex) &&
    Math.abs(first * 2 - players.length) <= 1;
  const squads = defaultNames.map((fallback, index) => ({
    name: isText(names?.[index]) ? names[index].trim() : fallback,
    players: [],
  }));
  players.forEach((player, index) => squads[balanced ? choices[index] : index % 2].players.push(player));
  return squads;
}

function promptKey(kind, prompt) {
  return kind === 'taboo' ? prompt?.word : prompt;
}

function validPrompt(kind, prompt) {
  return kind === 'taboo'
    ? isText(prompt?.word) && Array.isArray(prompt.ban) && prompt.ban.length > 0 && prompt.ban.every(isText)
    : isText(prompt);
}

function playableDeck(kind, deck) {
  const unique = new Map();
  for (const prompt of Array.isArray(deck) ? deck : []) {
    if (validPrompt(kind, prompt)) unique.set(promptKey(kind, prompt), prompt);
  }
  return unique;
}

function shuffle(cards, rng) {
  for (let index = cards.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
  return cards;
}

function deal(team) {
  // Replay the shuffled cycle after exhaustion, including across turns or a reload.
  const hasCards = team.queue.length > 0;
  const [prompt, ...queue] = hasCards ? team.queue : team.used;
  const used = hasCards ? [...team.used, prompt] : [prompt];
  return { ...team, prompt, queue, used };
}

function turnFields() {
  return { pointCount: 0, skipped: 0, bid: null, bidding: null, explanation: null, endsAt: null, remaining: null };
}

export function makeTeamGame(kind, { players, names, assignments, turns } = {}, rng = Math.random, deck = decks[kind]) {
  if (!teamKinds.includes(kind) || !validRoster(players)) return null;
  const turnsPerTeam = Number.isInteger(turns) ? Math.max(1, Math.min(5, turns)) : 2;
  const team = {
    squads: makeSquads(players, names, assignments),
    scores: [0, 0], turn: 0, turns: turnsPerTeam, total: turnsPerTeam * 2,
    ...turnFields(),
  };
  if (kind === 'hideout') return { kind, phase: 'team-ready', team: { ...team, hideout: emptyHideout() } };
  const queue = shuffle([...playableDeck(kind, deck).values()], rng);
  if (!queue.length) return null;
  return {
    kind,
    phase: 'team-ready',
    team: deal({ ...team, queue, used: [] }),
  };
}

function change(round, phase, fields = {}) {
  return { ...round, phase, team: { ...round.team, ...fields } };
}

function settle(round, result, recipient, points) {
  const scores = round.team.scores.map((score, index) => index === recipient ? score + points : score);
  return change(round, 'team-summary', {
    scores, explanation: { result, team: recipient, points }, endsAt: null, remaining: null,
  });
}

function finishTimedTurn(round) {
  const { kind, team } = round;
  if (kind === 'auction') return settle(round, 'auction-lost', 1 - team.bid.team, 1);
  return settle(round, 'taboo', team.pointCount ? activeTeam(team) : null, team.pointCount);
}

function answerKey(answer) {
  return answer.normalize('NFKC').toLocaleLowerCase('ar')
    .replace(/[\u061C\u0640\u064B-\u065F\u0670\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .trim().replace(/\s+/g, ' ');
}

function play(round, action, value, now) {
  const { kind, team } = round;
  const expired = team.endsAt !== null && now >= team.endsAt;
  if (action === 'finish' || (action === 'tick' && expired)) return finishTimedTurn(round);
  if (action === 'resume' && team.remaining !== null) {
    return change(round, round.phase, { endsAt: now + team.remaining, remaining: null });
  }
  if (kind === 'auction' && action === 'undo' && team.accepted?.length && !expired) {
    return change(round, round.phase, { accepted: team.accepted.slice(0, -1), pointCount: team.pointCount - 1 });
  }
  if (team.endsAt === null || expired) return round;
  if (action === 'pause') {
    return change(round, round.phase, { endsAt: null, remaining: team.endsAt - now });
  }
  if (kind === 'taboo') {
    if (action === 'correct') return change(round, round.phase, deal({ ...team, pointCount: team.pointCount + 1 }));
    if (action === 'skip') return change(round, round.phase, deal({ ...team, skipped: team.skipped + 1 }));
    if (action === 'violation') return change(round, round.phase, deal({ ...team, violations: (team.violations ?? 0) + 1 }));
  } else if (action === 'correct') {
    const answer = typeof value === 'string' ? value.trim() : '';
    const key = answerKey(answer);
    if (!key || answer.length > 80 || team.accepted?.some((item) => answerKey(item) === key)) return round;
    const accepted = [...(team.accepted ?? []), answer];
    const updated = change(round, round.phase, { pointCount: team.pointCount + 1, accepted });
    if (updated.team.pointCount === team.bid.amount) {
      return settle(change(updated, round.phase, { undoTime: team.endsAt - now }), 'auction-won', team.bid.team, 1);
    }
    return updated;
  }
  return round;
}

export function reduceTeamGame(round, action, value, now = Date.now()) {
  if (!round?.team || !teamKinds.includes(round.kind) || !Number.isFinite(now)) return round;
  const { kind, phase, team } = round;
  if (kind === 'hideout') return reduceHideout(round, action, value, now);
  if (phase === 'team-ready' && action === 'start') {
    if (kind === 'auction') return change(round, 'team-bid', { bidding: activeTeam(team) });
    return change(round, 'team-play', { endsAt: now + durations.taboo });
  }
  if (phase === 'team-bid') {
    if (action === 'bid' && isAmount(value) && value > (team.bid?.amount ?? 0)) {
      return change(round, phase, { bid: { amount: value, team: team.bidding }, bidding: 1 - team.bidding });
    }
    if (action === 'challenge' && team.bid) {
      return change(round, 'team-play', { bidding: null, endsAt: now + durations.auction });
    }
  }
  if (phase === 'team-play') return play(round, action, value, now);
  if (kind === 'auction' && phase === 'team-summary' && action === 'undo' && team.undoTime > 0 && team.accepted?.length) {
    return change(round, 'team-play', {
      scores: team.scores.map((score, i) => i === team.bid.team ? score - 1 : score),
      pointCount: team.pointCount - 1, accepted: team.accepted.slice(0, -1),
      explanation: null, undoTime: null, remaining: team.undoTime,
    });
  }
  if (phase === 'team-summary' && action === 'next') {
    const turn = team.turn + 1;
    if (turn === team.total) return change(round, 'team-result');
    return change(round, 'team-ready', deal({ ...team, turn, ...turnFields(), accepted: [], undoTime: null, violations: 0 }));
  }
  return round;
}

function validSquads(squads) {
  if (!Array.isArray(squads) || squads.length !== 2) return false;
  const valid = [...squads].every((squad) => isText(squad?.name) && Array.isArray(squad.players) &&
    squad.players.length >= 2 && [...squad.players].every(isText));
  return valid && Math.abs(squads[0].players.length - squads[1].players.length) <= 1 &&
    validRoster(squads.flatMap((squad) => squad.players));
}

function validRoster(players) {
  return Array.isArray(players) && players.length >= 4 && [...players].every(isText) &&
    new Set(players).size === players.length;
}

function validDeckState(kind, team, deck) {
  if (!Array.isArray(team.queue) || !Array.isArray(team.used) || !team.used.length) return false;
  const known = playableDeck(kind, deck);
  const cycle = [...team.used, ...team.queue];
  const keys = cycle.map((prompt) => promptKey(kind, prompt));
  if (cycle.length !== known.size || new Set(keys).size !== known.size) return false;

  const matchesDeck = (prompt) => {
    if (!validPrompt(kind, prompt)) return false;
    const original = known.get(promptKey(kind, prompt));
    return Boolean(original) && (kind !== 'taboo' || (prompt.ban.length === original.ban.length &&
      prompt.ban.every((word, index) => word === original.ban[index])));
  };
  return matchesDeck(team.prompt) && promptKey(kind, team.prompt) === promptKey(kind, team.used.at(-1)) &&
    cycle.every(matchesDeck);
}

function validTimer(kind, phase, { endsAt, remaining }) {
  if (phase !== 'team-play') return endsAt === null && remaining === null;
  if (endsAt !== null) return Number.isFinite(endsAt) && remaining === null;
  return Number.isFinite(remaining) && remaining > 0 && remaining <= durations[kind];
}

function validBid(kind, phase, { bid, bidding, pointCount, turn }) {
  if (kind !== 'auction' || phase === 'team-ready') return bid === null && bidding === null;
  if (phase === 'team-bid' && bid === null) return bidding === turn % 2 && pointCount === 0;
  if (!isAmount(bid?.amount) || !isTeamIndex(bid.team)) return false;
  if (phase === 'team-bid') return bidding === 1 - bid.team && pointCount === 0;
  if (phase === 'team-play') return bidding === null && pointCount < bid.amount;
  return bidding === null && pointCount <= bid.amount;
}

function validExplanation(kind, phase, team) {
  const { explanation, pointCount, bid, scores } = team;
  if (phase !== 'team-summary' && phase !== 'team-result') return explanation === null;
  const { result, team: recipient, points } = explanation ?? {};
  if (!isCount(points) || (points > 0 ? !isTeamIndex(recipient) || scores[recipient] < points : recipient !== null)) {
    return false;
  }
  if (kind === 'taboo') return result === 'taboo' && points === pointCount && (points === 0 || recipient === activeTeam(team));
  if (points !== 1) return false;
  return pointCount === bid.amount
    ? result === 'auction-won' && recipient === bid.team
    : result === 'auction-lost' && recipient === 1 - bid.team;
}

export function teamRoundIsValid(round, deck = decks[round?.kind]) {
  if (!round?.team || !teamKinds.includes(round.kind)) return false;
  const { kind, phase, team } = round;
  const { turn, turns, total, pointCount, skipped, scores, squads } = team;
  if (!validSquads(squads) || !Array.isArray(scores) || scores.length !== 2 || !scores.every(isCount) ||
      !isCount(turns) || turns < 1 || turns > 5 || total !== turns * 2 || !isCount(turn) || turn >= total ||
      !isCount(pointCount) || !isCount(skipped)) return false;
  if (phase === 'team-result' && turn + 1 !== total) return false;
  if (kind === 'hideout') return hideoutIsValid(round);
  if (!phases.includes(phase)) return false;
  if (phase === 'team-bid' && kind !== 'auction') return false;
  if (kind !== 'taboo' && skipped !== 0) return false;
  if (phase === 'team-ready' && pointCount !== 0) return false;
  if (phase === 'team-ready' && skipped !== 0) return false;
  if (team.violations !== undefined && !isCount(team.violations)) return false;
  if (team.accepted !== undefined && (!Array.isArray(team.accepted) || team.accepted.length > pointCount ||
      !team.accepted.every((answer) => isText(answer) && answer.length <= 80 && answerKey(answer)) ||
      new Set(team.accepted.map(answerKey)).size !== team.accepted.length)) return false;
  if (team.undoTime != null && (!Number.isFinite(team.undoTime) || team.undoTime <= 0 || team.undoTime > durations.auction ||
      kind !== 'auction' || !['team-summary', 'team-result'].includes(phase) || team.explanation?.result !== 'auction-won')) return false;
  return validDeckState(kind, team, deck) && validTimer(kind, phase, team) && validBid(kind, phase, team) &&
    validExplanation(kind, phase, team);
}
