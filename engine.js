import { makeTeamGame, teamKinds, teamRoundIsValid } from './team-engine.js';
import { challenges, courtCases, difficulties, games, liarQuestions, pairBanks, pairs, roles, socialPrompts } from './content.js';
import { choiceSettings, makeChoiceRound, restoreChoiceRound } from './choice-engine.js';
export { beginChoiceRating, expireChoice, nextChoicePrompt, rateChoice, selectChoice, skipChoice } from './choice-engine.js';
import { evidenceCases, reversePrompts, knowPrompts } from './party-content.js';

export const maxPlayers = 10;
export const challengeDuration = 30_000;
export const discussionDurations = [0, 30, 60, 90, 120];
export const anonymousQuestionLimit = 360;
export const evidenceDuration = 120_000;
export const evidenceClueLimit = 3;
export const reverseQuestionLimit = 220;
export const liarAnswerLimit = 180;
const sessionVersion = 4;
const phases = {
  outsider: ['cards', 'questions', 'discussion', 'voting', 'runoff', 'result'],
  mafia: ['cards', 'night', 'day', 'voting', 'dayResult', 'result'],
  court: ['hearing', 'voting', 'result'],
  liar: ['cards', 'answers', 'discussion', 'voting', 'runoff', 'result'],
  anonymous: ['anonymous'],
  social: ['discussion', 'voting', 'result'],
  challenge: ['turn', 'result'],
  evidence: ['investigating', 'result'],
  reverse: ['composing', 'voting', 'result'],
  know: ['knowAnswer', 'knowGuesses', 'knowReveal', 'result'],
};
const defaultOptions = { difficulty: 'mixed', duration: 60 };

export function createSession() {
  return { version: sessionVersion, players: [], nextId: 1, mode: 'together', seen: {}, options: {}, outsiderHistory: [], round: null };
}

function cleanName(input) {
  return typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : '';
}

function canonicalName(name) {
  return name.normalize('NFKC').toLocaleLowerCase('ar')
    .replace(/[\u061C\u0640\u064B-\u065F\u0670\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function uniqueNames(names) {
  const keys = names.map(canonicalName);
  return names.every((name) => name.length <= 24) && keys.every(Boolean) && new Set(keys).size === keys.length;
}

export function configureSession(session, inputs, mode) {
  if (session.round || inputs.length > maxPlayers || !['together', 'remote'].includes(mode)) return false;
  const names = inputs.map(cleanName);
  if (!uniqueNames(names)) return false;
  const existing = new Map(session.players.map((player) => [canonicalName(player.name), player.id]));
  session.players = names.map((name) => ({ id: existing.get(canonicalName(name)) ?? session.nextId++, name }));
  session.mode = mode;
  return true;
}

export function addPlayer(session, input) {
  return configureSession(session, [...session.players.map((player) => player.name), input], session.mode);
}

export function removePlayer(session, id) {
  if (session.round || !session.players.some((player) => player.id === id)) return false;
  session.players = session.players.filter((player) => player.id !== id);
  return true;
}

export function leaveRound(session) {
  session.round = null;
}

function settingsFor(kind, options) {
  if (kind === 'choice') return choiceSettings(options);
  const difficulty = Object.hasOwn(difficulties, options?.difficulty) ? options.difficulty : defaultOptions.difficulty;
  const fallback = kind === 'mafia' ? 90 : defaultOptions.duration;
  const duration = discussionDurations.includes(options?.duration) ? options.duration : fallback;
  return { difficulty, duration };
}

function restoreRound(saved, players) {
  let round = saved.round;
  if (round?.kind === 'choice') return restoreChoiceRound(round, players, saved.version);
  if (teamKinds.includes(round?.kind)) {
    if (!teamRoundIsValid(round)) return null;
    const roster = round.team.squads.flatMap((squad) => squad.players);
    return roster.length === players.length && roster.every((name) => players.some((player) => player.name === name)) ? round : null;
  }
  if (!round || !Object.hasOwn(phases, round.kind) || !phases[round.kind].includes(round.phase)) return null;
  if (!Array.isArray(round.order) || !Array.isArray(round.votes) || round.order.length < games[round.kind].min ||
      round.order.length !== players.length || new Set(round.order).size !== players.length ||
      !round.order.every((id) => players.some((player) => player.id === id)) || !Number.isInteger(round.index) || round.index < 0) return null;
  if (round.phase === 'voting' && (!Array.isArray(round.voters) || !round.voters[round.index] ||
      round.votes.length !== round.index || !round.voters.every((id) => round.order.includes(id)))) return null;
  if (['cards', 'questions', 'answers', 'turn'].includes(round.phase) && !round.order[round.index]) return null;
  if (round.phase === 'cards' && round.delivered !== undefined && (!Array.isArray(round.delivered) ||
      round.delivered.length >= round.order.length || new Set(round.delivered).size !== round.delivered.length ||
      !round.delivered.every((id) => round.order.includes(id)) || round.delivered.includes(round.order[round.index]))) return null;
  if (round.kind === 'outsider' && (!Array.isArray(round.pair) || typeof round.pair[0] !== 'string' ||
      typeof round.pair[1] !== 'string' || !Array.isArray(round.pair[2]) || !round.order.includes(round.outsiderId))) return null;
  if (round.kind === 'mafia' && (!Array.isArray(round.alive) || !round.roles ||
      !round.order.every((id) => Object.hasOwn(roles, round.roles[id])) ||
      !round.alive.every((id) => round.order.includes(id)) || !Number.isInteger(round.day) || round.day < 1)) return null;
  if (round.kind === 'mafia' && ['day', 'voting', 'dayResult'].includes(round.phase) && !round.nightOutcome) return null;
  if (round.phase === 'dayResult' && !round.dayOutcome) return null;
  if (round.kind === 'mafia' && round.phase === 'result' && !['town', 'mafia'].includes(round.ending)) return null;
  if (round.kind === 'outsider' && round.phase === 'result' && !['group', 'outsider'].includes(round.ending)) return null;
  if (['social', 'challenge', 'court', 'liar'].includes(round.kind) && typeof round.prompt !== 'string') return null;
  if (round.kind === 'court') {
    const { judge, prosecutor, defendant } = round.court ?? {};
    const parties = [judge, prosecutor, defendant];
    if (new Set(parties).size !== 3 || !parties.every((id) => round.order.includes(id))) return null;
    if (round.phase === 'hearing' && (round.index > 2 || !round.clock)) return null;
    if (round.phase === 'result' && !['guilty', 'clear'].includes(round.ending)) return null;
  }
  if (round.kind === 'liar' && (typeof round.fakePrompt !== 'string' || !round.order.includes(round.liarId) ||
      (round.phase === 'result' && !['group', 'liar'].includes(round.ending)))) return null;
  if (round.kind === 'anonymous') {
    if (!Array.isArray(round.questions) || !round.questions.every((card) =>
      card && round.order.includes(card.recipient) && validAnonymousQuestion(card.question) && typeof card.opened === 'boolean'
    )) return null;
    round = { ...round, activeQuestion: null };
  }
  if (round.kind === 'challenge' && (!round.scores || typeof round.clock?.remaining !== 'number')) return null;
  if (round.kind === 'evidence' && !validEvidenceRound(round)) return null;
  if (round.kind === 'reverse' && !validReverseRound(round)) return null;
  if (round.kind === 'know' && !validKnowRound(round)) return null;
  if (round.phase === 'runoff' && !Array.isArray(round.runoffIds)) return null;
  if (round.runoffIds && (!Array.isArray(round.runoffIds) || round.runoffIds.length < 2 ||
      !round.runoffIds.every((id) => round.order.includes(id)))) return null;
  if (round.clock && (!Number.isFinite(round.clock.remaining) || round.clock.remaining < 0 ||
      (round.clock.endsAt !== null && !Number.isFinite(round.clock.endsAt)))) return null;
  const settings = settingsFor(round.kind, round.settings);
  return {
    ...round, settings,
    ...(saved.version === 1 && round.kind === 'outsider' ? { runoffIds: null } : {}),
    ...(['day', 'discussion'].includes(round.phase) && ['mafia', 'outsider', 'liar'].includes(round.kind) && !round.clock
      ? { clock: freshClock(settings.duration * 1000) } : {}),
  };
}

export function restoreSession(saved) {
  const session = createSession();
  if (![1, 2, 3, sessionVersion].includes(saved?.version) || !Array.isArray(saved.players)) return session;
  const seenIds = new Set();
  const usedNames = new Set();
  for (const player of saved.players.slice(0, maxPlayers)) {
    const name = cleanName(player?.name);
    const key = canonicalName(name);
    if (!key || name.length > 24 || usedNames.has(key) || !Number.isSafeInteger(player?.id) ||
        player.id < 1 || seenIds.has(player.id)) continue;
    session.players.push({ id: player.id, name });
    seenIds.add(player.id);
    usedNames.add(key);
  }
  session.nextId = Math.max(...seenIds, 0) + 1;
  if (Number.isSafeInteger(saved.nextId)) session.nextId = Math.max(saved.nextId, session.nextId);
  if (saved.mode === 'remote') session.mode = 'remote';
  for (const kind of Object.keys(games)) {
    // Saved prompts can resume, but old question indexes point into different decks.
    const sameBank = kind === 'outsider' || saved.version === sessionVersion;
    if (kind !== 'choice' && sameBank && Array.isArray(saved.seen?.[kind])) session.seen[kind] = saved.seen[kind].filter(Number.isInteger);
    if (saved.options?.[kind]) session.options[kind] = settingsFor(kind, saved.options[kind]);
  }
  if (Array.isArray(saved.outsiderHistory)) session.outsiderHistory = saved.outsiderHistory.filter(Number.isInteger).slice(-maxPlayers);
  session.round = restoreRound(saved, session.players);
  return session;
}

function choose(items, random) {
  return items[Math.floor(random() * items.length)];
}

function draw(session, key, bank, random) {
  const domain = bank.map((_, index) => index);
  const index = pickUnused(session, key, domain, random);
  return bank[index];
}

function pickUnused(session, key, domain, random, filter = () => true) {
  let seen = session.seen[key] || [];
  const used = new Set(seen);
  let available = domain.filter((index) => !used.has(index));
  if (!available.length) {
    const last = seen.filter((index) => domain.includes(index)).at(-1);
    seen = seen.filter((index) => !domain.includes(index) || index === last);
    available = domain.filter((index) => index !== last);
  }
  const preferred = available.filter(filter);
  const chosen = choose(preferred.length ? preferred : available, random);
  session.seen[key] = [...seen, chosen];
  return chosen;
}

function drawPair(session, difficulty, random) {
  const bank = pairBanks[difficulty] || pairs;
  const domain = bank.map((entry) => pairs.indexOf(entry));
  const recent = new Set((session.seen.outsider || []).slice(-4).flatMap((index) => pairs[index]?.slice(0, 2) || []));
  const index = pickUnused(session, 'outsider', domain, random, (candidate) => pairs[candidate].slice(0, 2).every((word) => !recent.has(word)));
  const [word, alternate, forbidden] = pairs[index];
  return random() < 0.5 ? [word, alternate, forbidden] : [alternate, word, forbidden];
}

function chooseOutsider(session, order, random) {
  let history = session.outsiderHistory.filter((id) => order.includes(id));
  let candidates = order.filter((id) => !history.includes(id));
  if (!candidates.length) {
    candidates = order.filter((id) => id !== history.at(-1));
    history = [];
  }
  const chosen = choose(candidates, random);
  session.outsiderHistory = [...history, chosen];
  return chosen;
}

function shuffled(list, random) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function startGame(session, kind, random = Math.random, options = session.options[kind]) {
  if (!Object.hasOwn(games, kind) || session.players.length < games[kind].min) return false;
  if (teamKinds.includes(kind)) {
    const round = makeTeamGame(kind, { ...options, players: session.players.map((player) => player.name) }, random);
    if (!round) return false;
    session.round = round;
    return true;
  }
  const order = session.players.map((player) => player.id);
  const settings = settingsFor(kind, options);
  if (kind === 'choice') {
    const match = makeChoiceRound(order, settings, random);
    if (!match) return false;
    session.options.choice = settings;
    session.round = match;
    return true;
  }
  const round = { kind, order, settings, phase: 'cards', index: 0, votes: [] };
  switch (kind) {
    case 'outsider':
      round.pair = drawPair(session, settings.difficulty, random);
      round.outsiderId = chooseOutsider(session, order, random);
      break;
    case 'mafia': {
      const pool = order.length >= 8 ? ['mafia', 'mafia'] : ['mafia'];
      pool.push('doctor', 'detective');
      while (pool.length < order.length) pool.push('citizen');
      const assignment = shuffled(pool, random);
      round.roles = Object.fromEntries(order.map((id, index) => [id, assignment[index]]));
      round.alive = [...order];
      round.day = 1;
      break;
    }
    case 'court': {
      const [judge, prosecutor, defendant] = shuffled(order, random);
      round.court = { judge, prosecutor, defendant };
      round.prompt = draw(session, kind, courtCases, random);
      round.phase = 'hearing';
      round.clock = freshClock(settings.duration * 1000);
      break;
    }
    case 'liar':
      [round.prompt, round.fakePrompt] = draw(session, kind, liarQuestions, random);
      if (random() >= 0.5) [round.prompt, round.fakePrompt] = [round.fakePrompt, round.prompt];
      round.liarId = choose(order, random);
      break;
    case 'anonymous':
      round.phase = 'anonymous';
      round.questions = [];
      round.activeQuestion = null;
      break;
    case 'social':
      round.phase = 'discussion';
      round.prompt = draw(session, kind, socialPrompts, random);
      break;
    case 'challenge':
      round.phase = 'turn';
      round.prompt = draw(session, kind, challenges, random);
      round.scores = {};
      round.challengeOutcomes = {};
      round.clock = freshClock(challengeDuration);
      break;
    case 'evidence':
      round.phase = 'investigating';
      round.caseIndex = pickUnused(session, kind, evidenceCases.map((_, index) => index), random);
      round.openedClues = [];
      round.clock = freshClock(evidenceDuration);
      break;
    case 'reverse':
      round.phase = 'composing';
      round.prompt = draw(session, kind, reversePrompts, random);
      round.entries = [];
      break;
    case 'know':
      round.scores = Object.fromEntries(order.map((id) => [id, 0]));
      prepareKnowTurn(session, round, random);
      break;
  }
  session.options[kind] = settings;
  session.round = round;
  return true;
}

export function currentPlayer(session) {
  const round = session.round;
  if (!round) return null;
  const order = round.phase === 'voting' ? round.voters : round.order;
  return session.players.find((player) => player.id === order[round.index]) || null;
}

export function playerCard(session, id = currentPlayer(session)?.id) {
  const round = session.round;
  const player = session.players.find((item) => item.id === id);
  if (round?.phase !== 'cards' || !player) return null;
  if (round.kind === 'outsider') {
    const [word, alternate, forbidden] = round.pair;
    return {
      title: player.id === round.outsiderId ? alternate : word,
      detail: 'جاوب بتلميح إذا سألك أحد عن كلمتك.',
      extra: 'الكلمات الممنوعة: ' + forbidden.join('، '),
    };
  }
  if (round.kind === 'liar') {
    return {
      title: player.id === round.liarId ? round.fakePrompt : round.prompt,
      detail: 'جهّز إجابة قصيرة وقلها لما يجي دورك بدون قراءة السؤال.',
    };
  }
  const role = round.roles[player.id];
  const partner = role === 'mafia'
    ? session.players.find(({ id }) => id !== player.id && round.roles[id] === 'mafia')
    : null;
  return { ...roles[role], extra: partner ? 'معك في المافيا: ' + partner.name : '' };
}

function prepareNight(round) {
  round.phase = 'night';
  round.nightChoices = {};
  round.clock = null;
}

export function advanceCard(session) {
  const round = session.round;
  if (round?.phase !== 'cards') return false;
  round.index++;
  if (round.index >= round.order.length) {
    round.index = 0;
    if (round.kind === 'mafia') prepareNight(round);
    else round.phase = round.kind === 'liar' ? 'answers' : 'questions';
  }
  return true;
}

export function deliveredCards(round) {
  return round.delivered ?? round.order.slice(0, round.index);
}

export function markCardDelivered(session, id) {
  const round = session.round;
  if (round?.phase !== 'cards' || session.mode !== 'remote' || !round.order.includes(id)) return false;
  round.delivered = [...new Set([...deliveredCards(round), id])];
  const next = round.order.findIndex((item) => !round.delivered.includes(item));
  if (next >= 0) {
    round.index = next;
    return true;
  }
  round.index = round.order.length - 1;
  return advanceCard(session);
}

export function questionTurn(session) {
  const round = session.round;
  if (round?.phase !== 'questions') return null;
  const { order, index } = round;
  return { from: order[index], to: order[(index + 1) % order.length], index, total: order.length };
}

export function advanceQuestion(session) {
  const round = session.round;
  if (round?.phase !== 'questions') return false;
  if (round.index === round.order.length - 1) return beginDiscussion(session);
  round.index++;
  return true;
}

export function beginDiscussion(session) {
  const round = session.round;
  if (round?.kind !== 'outsider' || round.phase !== 'questions') return false;
  round.phase = 'discussion';
  round.index = 0;
  round.clock = freshClock(round.settings.duration * 1000);
  return true;
}

export function advanceCourt(session) {
  const round = session.round;
  if (round?.kind !== 'court' || round.phase !== 'hearing' || round.index >= 2) return false;
  round.index++;
  round.clock = freshClock(round.settings.duration * 1000);
  return true;
}

export function advanceAnswer(session, input = '') {
  const round = session.round;
  if (round?.kind !== 'liar' || round.phase !== 'answers' || typeof input !== 'string') return false;
  const answer = input.trim();
  if (answer.length > liarAnswerLimit) return false;
  round.answers ??= {};
  if (answer) round.answers[round.order[round.index]] = answer;
  round.index++;
  if (round.index === round.order.length) {
    round.index = 0;
    round.phase = 'discussion';
    round.clock = freshClock(round.settings.duration * 1000);
  }
  return true;
}

export function beginVote(session, random = Math.random) {
  const round = session.round;
  if (!round) return false;
  if (round.kind === 'reverse') {
    if (round.phase !== 'composing' || round.entries.length < 2) return false;
    round.entries = shuffled(round.entries, random);
    round.voters = [...round.order];
  } else if (round.kind === 'court') {
    if (round.phase !== 'hearing' || round.index !== 2) return false;
    const { prosecutor, defendant } = round.court;
    round.voters = round.order.filter((id) => id !== prosecutor && id !== defendant);
  } else {
    if (!['discussion', 'day', 'runoff'].includes(round.phase)) return false;
    round.voters = [...(round.kind === 'mafia' ? round.alive : round.order)];
  }
  round.votes = [];
  round.index = 0;
  round.clock = null;
  round.phase = 'voting';
  return true;
}

export function voteResult(votes) {
  const count = new Map();
  for (const id of votes) {
    if (id !== null) count.set(id, (count.get(id) || 0) + 1);
  }
  const ranked = [...count].sort((first, second) => second[1] - first[1]);
  const top = ranked[0]?.[1] || 0;
  return { ranked, top, leaders: ranked.filter((row) => row[1] === top).map(([id]) => id) };
}

export function voteOptions(round, voterIndex) {
  if (round.kind === 'reverse') return round.entries.flatMap((entry, index) =>
    entry.author === round.voters[voterIndex] ? [] : [index]);
  if (round.kind === 'court') return [round.court.prosecutor, round.court.defendant];
  const candidates = round.runoffIds || round.voters;
  return ['outsider', 'liar', 'mafia'].includes(round.kind)
    ? candidates.filter((id) => id !== round.voters[voterIndex])
    : candidates;
}

export function castVoteBatch(session, votes) {
  const round = session.round;
  if (round?.phase !== 'voting' || !Array.isArray(votes) || votes.length !== round.voters.length - round.index ||
      !votes.every((vote, index) => vote === null || voteOptions(round, round.index + index).includes(vote))) return false;
  for (const vote of votes) castVote(session, vote);
  return true;
}

export function castVote(session, id) {
  const round = session.round;
  if (round?.phase !== 'voting' || (id !== null && !voteOptions(round, round.index).includes(id))) return false;
  if (round.kind === 'reverse') {
    round.votes.push(id);
    if (++round.index === round.voters.length) round.phase = 'result';
    return true;
  }
  round.votes.push(id);
  round.index++;
  if (round.index < round.voters.length) return true;

  const { leaders } = voteResult(round.votes);
  const leader = leaders.length === 1 ? leaders[0] : null;
  if (round.kind === 'mafia') {
    if (leader) round.alive = round.alive.filter((alive) => alive !== leader);
    round.dayOutcome = { eliminatedId: leader, tied: leaders.length > 1 };
    round.ending = mafiaWinner(round);
    round.phase = round.ending ? 'result' : 'dayResult';
  } else if (round.kind === 'court') {
    const guilty = round.votes.filter((id) => id === round.court.prosecutor).length;
    round.ending = guilty > round.voters.length / 2 ? 'guilty' : 'clear';
    round.phase = 'result';
  } else if (['outsider', 'liar'].includes(round.kind) && leaders.length > 1 && !round.runoffIds) {
    round.runoffIds = leaders;
    round.phase = 'runoff';
  } else {
    if (round.kind === 'outsider') round.ending = leader === round.outsiderId ? 'group' : 'outsider';
    if (round.kind === 'liar') round.ending = leader === round.liarId ? 'group' : 'liar';
    round.phase = 'result';
  }
  return true;
}

export function nextSocialPrompt(session, random = Math.random) {
  const round = session.round;
  if (round?.kind !== 'social' || !['discussion', 'result'].includes(round.phase)) return false;
  round.prompt = draw(session, 'social', socialPrompts, random);
  round.phase = 'discussion';
  round.votes = [];
  round.index = 0;
  return true;
}

function validAnonymousQuestion(question) {
  return typeof question === 'string' && question.length <= anonymousQuestionLimit && Boolean(question.trim());
}

export function addAnonymousQuestion(session, recipient, input) {
  const round = session.round;
  const question = typeof input === 'string' ? input.trim() : '';
  if (round?.kind !== 'anonymous' || round.activeQuestion !== null ||
      !round.order.includes(recipient) || !validAnonymousQuestion(question)) return false;
  round.questions.push({ recipient, question, opened: false });
  return true;
}

export function openAnonymousQuestion(session, index) {
  const round = session.round;
  if (round?.kind !== 'anonymous' || !Number.isInteger(index) || !round.questions[index]) return false;
  round.activeQuestion = index;
  round.questions[index].opened = true;
  return true;
}

export function closeAnonymousQuestion(session) {
  const round = session.round;
  if (round?.kind !== 'anonymous' || round.activeQuestion === null) return false;
  round.activeQuestion = null;
  return true;
}

function validEvidenceRound(round) {
  const mystery = evidenceCases[round.caseIndex];
  if (!Number.isInteger(round.caseIndex) || !mystery) return false;
  const clues = round.openedClues;
  if (!Array.isArray(clues) || clues.length > evidenceClueLimit || new Set(clues).size !== clues.length ||
      !clues.every((index) => Number.isInteger(index) && index >= 0 && index < mystery.clues.length)) return false;
  if (round.phase === 'investigating') return typeof round.clock?.remaining === 'number' &&
    typeof round.clock.started === 'boolean' && round.clock.remaining <= evidenceDuration;
  return round.guess === null || (Number.isInteger(round.guess) && round.guess >= 0 && round.guess < mystery.suspects.length);
}

export function openEvidenceClue(session, index, now = Date.now()) {
  const round = session.round;
  if (round?.kind !== 'evidence' || round.phase !== 'investigating' || !round.clock.started ||
      clockRemaining(session, now) === 0 || round.openedClues.length >= evidenceClueLimit ||
      round.openedClues.includes(index) || !Number.isInteger(index) || !evidenceCases[round.caseIndex].clues[index]) return false;
  round.openedClues.push(index);
  return true;
}

export function resolveEvidence(session, guess, now = Date.now()) {
  const round = session.round;
  if (round?.kind !== 'evidence' || round.phase !== 'investigating' || !round.clock.started) return false;
  const expired = clockRemaining(session, now) === 0;
  if (guess === null ? !expired : expired || !Number.isInteger(guess) || !evidenceCases[round.caseIndex].suspects[guess]) return false;
  round.guess = guess;
  round.phase = 'result';
  round.clock = null;
  return true;
}

function canVoteForReverseEntry(round, index, voterIndex) {
  return index === null || (Number.isInteger(index) && Boolean(round.entries[index]) &&
    round.entries[index].author !== round.voters[voterIndex]);
}

function validReverseRound(round) {
  if (typeof round.prompt !== 'string' || !Array.isArray(round.entries) ||
      new Set(round.entries.map((entry) => entry?.author)).size !== round.entries.length ||
      !round.entries.every((entry) => round.order.includes(entry?.author) &&
        typeof entry.text === 'string' && entry.text.trim() && entry.text.length <= reverseQuestionLimit)) return false;
  if (round.phase === 'composing') return true;
  return round.entries.length >= 2 && Array.isArray(round.voters) &&
    round.voters.length === round.order.length && round.voters.every((id, index) => id === round.order[index]) &&
    round.votes.every((vote, index) => canVoteForReverseEntry(round, vote, index)) &&
    (round.phase !== 'result' || (round.index === round.order.length && round.votes.length === round.order.length));
}

export function addReverseEntry(session, author, input) {
  const round = session.round;
  const text = typeof input === 'string' ? input.trim() : '';
  if (round?.kind !== 'reverse' || round.phase !== 'composing' || !text || text.length > reverseQuestionLimit ||
      !round.order.includes(author) || round.entries.some((entry) => entry.author === author)) return false;
  round.entries.push({ author, text });
  return true;
}

function isKnowOption(value) {
  return value === 0 || value === 1;
}

function prepareKnowTurn(session, round, random) {
  round.prompt = draw(session, 'know', knowPrompts, random);
  round.secretAnswer = null;
  round.guesses = [];
  round.phase = 'knowAnswer';
}

export function knowGuessers(round) {
  return round.order.filter((_, index) => index !== round.index);
}

function validKnowRound(round) {
  const { prompt, guesses, secretAnswer, scores, order, index, phase } = round;
  if (!order[index] || typeof prompt?.question !== 'string' || !Array.isArray(prompt.options) ||
      prompt.options.length !== 2 || !prompt.options.every((value) => typeof value === 'string') ||
      !scores || !order.every((id) => Number.isInteger(scores[id]) && scores[id] >= 0 && scores[id] < order.length) ||
      !Array.isArray(guesses) || !guesses.every((value) => value === null || isKnowOption(value))) return false;
  if (phase === 'knowAnswer') return secretAnswer === null && guesses.length === 0;
  if (!isKnowOption(secretAnswer)) return false;
  if (phase === 'knowGuesses') return guesses.length < order.length - 1;
  return guesses.length === order.length - 1 && (phase !== 'result' || index === order.length - 1);
}

export function recordKnowAnswer(session, value) {
  const round = session.round;
  if (round?.kind !== 'know' || round.phase !== 'knowAnswer' || !isKnowOption(value)) return false;
  round.secretAnswer = value;
  round.phase = 'knowGuesses';
  return true;
}

export function recordKnowGuess(session, value) {
  const round = session.round;
  if (round?.kind !== 'know' || round.phase !== 'knowGuesses' || (value !== null && !isKnowOption(value))) return false;
  const guessers = knowGuessers(round);
  if (value === round.secretAnswer) round.scores[guessers[round.guesses.length]]++;
  round.guesses.push(value);
  if (round.guesses.length === guessers.length) round.phase = 'knowReveal';
  return true;
}

export function advanceKnow(session, random = Math.random) {
  const round = session.round;
  if (round?.kind !== 'know' || round.phase !== 'knowReveal') return false;
  if (round.index === round.order.length - 1) round.phase = 'result';
  else {
    round.index++;
    prepareKnowTurn(session, round, random);
  }
  return true;
}

function mafiaWinner(round) {
  const count = round.alive.filter((id) => round.roles[id] === 'mafia').length;
  if (!count) return 'town';
  return count >= round.alive.length - count ? 'mafia' : null;
}

export function nightTurn(session) {
  const round = session.round;
  if (round?.kind !== 'mafia' || round.phase !== 'night') return null;
  const choices = round.nightChoices || {};
  const active = ['mafia', 'doctor', 'detective'].filter((role) => round.alive.some((id) => round.roles[id] === role));
  const index = active.findIndex((role) => !Object.hasOwn(choices, role));
  if (index < 0) {
    const id = choices.detective;
    const recipient = round.alive.find((player) => round.roles[player] === 'detective');
    return { role: 'report', index: active.length + 1, total: active.length + 1,
      report: id ? { id, recipient, isMafia: round.roles[id] === 'mafia' } : null };
  }
  const role = active[index];
  let options = round.alive;
  if (role === 'mafia') options = options.filter((id) => round.roles[id] !== 'mafia');
  if (role === 'detective') options = options.filter((id) => round.roles[id] !== 'detective');
  return { role, options, index: index + 1, total: active.length + 1 };
}

export function recordNightChoice(session, role, id) {
  const turn = nightTurn(session);
  if (!turn || turn.role !== role || role === 'report') return false;
  if (id === null ? role === 'mafia' : !turn.options.includes(id)) return false;
  session.round.nightChoices = { ...session.round.nightChoices, [role]: id };
  return true;
}

export function finishNight(session) {
  if (nightTurn(session)?.role !== 'report') return false;
  const { mafia, doctor, detective } = session.round.nightChoices;
  return submitNight(session, { target: mafia, protect: doctor, investigate: detective });
}

export function submitNight(session, { target, protect, investigate }) {
  const round = session.round;
  if (round?.kind !== 'mafia' || round.phase !== 'night' || !round.alive.includes(target) || round.roles[target] === 'mafia') return false;
  const roleIsAlive = (role) => round.alive.some((id) => round.roles[id] === role);
  if (protect && (!roleIsAlive('doctor') || !round.alive.includes(protect))) return false;
  if (investigate && (!roleIsAlive('detective') || !round.alive.includes(investigate) || round.roles[investigate] === 'detective')) return false;

  const eliminatedId = target === protect ? null : target;
  if (eliminatedId) round.alive = round.alive.filter((id) => id !== eliminatedId);
  round.investigation = null;
  round.nightChoices = null;
  round.nightOutcome = { eliminatedId };
  round.ending = mafiaWinner(round);
  round.phase = round.ending ? 'result' : 'day';
  round.clock = round.ending ? null : freshClock(round.settings.duration * 1000);
  return true;
}

export function nextNight(session) {
  const round = session.round;
  if (round?.phase !== 'dayResult') return false;
  round.day++;
  prepareNight(round);
  return true;
}

function freshClock(remaining) {
  return { remaining, started: false, endsAt: null };
}

export function clockRemaining(session, now = Date.now()) {
  const clock = session.round?.clock;
  if (!clock) return 0;
  if (clock.endsAt === null) return clock.remaining;
  return Math.max(0, Math.min(clock.remaining, clock.endsAt - now));
}

export function startClock(session, now = Date.now()) {
  const clock = session.round?.clock;
  if (!clock || clock.endsAt !== null || !clock.remaining) return false;
  clock.started = true;
  clock.endsAt = now + clock.remaining;
  return true;
}

export function pauseClock(session, now = Date.now()) {
  const clock = session.round?.clock;
  if (!clock || clock.endsAt === null) return false;
  clock.remaining = clockRemaining(session, now);
  clock.endsAt = null;
  return true;
}

export function recordChallenge(session, outcome, random = Math.random, now = Date.now()) {
  const round = session.round;
  if (round?.kind !== 'challenge' || round.phase !== 'turn' || !round.clock.started) return false;
  const expired = clockRemaining(session, now) === 0;
  if (typeof outcome === 'boolean') outcome = outcome ? 'passed' : expired ? 'missed' : 'skipped';
  if (!(expired ? ['missed'] : ['passed', 'missed', 'skipped']).includes(outcome)) return false;
  const player = round.order[round.index];
  round.challengeOutcomes ??= {};
  round.challengeOutcomes[player] = outcome;
  round.scores[player] = Number(outcome === 'passed');
  round.index++;
  if (round.index >= round.order.length) {
    round.phase = 'result';
  } else {
    round.clock = freshClock(challengeDuration);
    round.prompt = draw(session, 'challenge', challenges, random);
  }
  return true;
}
