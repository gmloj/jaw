import { choiceQuestions } from './choice-questions.js';

export const choiceCategories = Object.freeze({
  personal: 'الشخصية وكشف الأقنعة',
  love: 'الحب والمشاعر',
  jealousy: 'الغيرة والشك',
  betrayal: 'الخيانة والخذلان',
  friends: 'الأصدقاء وأسرار الشلّة',
  past: 'العلاقات السابقة',
  secrets: 'الأسرار والاعترافات',
  dignity: 'الكرامة والمواقف الصعبة',
  sacrifice: 'الاختيارات المستحيلة',
  black: 'المستوى الأسود',
});
export const choiceLevels = ['خفيف', 'جريء', 'أسود'];
export const choiceDurations = [0, 15, 30, 45, 60];
export const choiceTurns = [1, 2, 3];
export const choiceSkipAllowance = 2;
const questionsById = new Map(choiceQuestions.map((question) => [question.id, question]));
const phases = ['picking', 'choice-explain', 'choice-rating', 'choice-review', 'result'];
const ratings = [0, 1, 2];
const answers = [0, 1];
const reviewOutcomes = ['rated', 'skipped', 'timeout'];

function allowsCategory(category, boldness) {
  return category === 'mixed' || (Object.hasOwn(choiceCategories, category) && (category !== 'black' || boldness === 3));
}

export function choiceSettings(options) {
  const boldness = [1, 2, 3].includes(options?.boldness) ? options.boldness : 2;
  return {
    boldness,
    category: allowsCategory(options?.category, boldness) ? options.category : 'mixed',
    turns: choiceTurns.includes(options?.turns) ? options.turns : 2,
    duration: choiceDurations.includes(options?.duration) ? options.duration : 0,
  };
}

function nextQuestion(round, category, random) {
  const used = new Set(round.used);
  const pool = choiceQuestions.filter((question) => !used.has(question.id) &&
    question.boldness <= round.settings.boldness && (category === 'mixed' || question.category === category));
  return pool[Math.floor(random() * pool.length)];
}

function prepareTurn(round, question) {
  round.question = question;
  round.used.push(question.id);
  round.phase = 'picking';
  round.selected = null;
  round.votes = [];
  round.outcome = null;
  round.clock = round.settings.duration ? { remaining: round.settings.duration * 1000, started: false, endsAt: null } : null;
}

export function makeChoiceRound(order, settings, random) {
  const round = {
    kind: 'choice', order, settings, index: 0, turn: 0, used: [],
    skips: choiceSkipAllowance, scores: Object.fromEntries(order.map((id) => [id, 0])),
  };
  const question = nextQuestion(round, settings.category, random);
  if (!question) return null;
  prepareTurn(round, question);
  return round;
}

export function choiceVoter(round) {
  if (round.phase !== 'choice-rating') return null;
  return round.order.filter((id) => id !== round.order[round.index])[round.votes.length] ?? null;
}

export function selectChoice(session, option, now = Date.now()) {
  const round = session.round;
  if (round?.kind !== 'choice' || round.phase !== 'picking' || !answers.includes(option) ||
      (round.clock?.endsAt != null && round.clock.endsAt <= now) || round.clock?.remaining === 0) return false;
  round.selected = option;
  round.clock = null;
  round.phase = 'choice-explain';
  return true;
}

export function beginChoiceRating(session) {
  const round = session.round;
  if (round?.kind !== 'choice' || round.phase !== 'choice-explain') return false;
  round.phase = 'choice-rating';
  return true;
}

export function rateChoice(session, voter, points) {
  const round = session.round;
  if (round?.kind !== 'choice' || round.phase !== 'choice-rating' ||
      voter !== choiceVoter(round) || !ratings.includes(points)) return false;
  round.votes.push(points);
  if (round.votes.length === round.order.length - 1) {
    round.scores[round.order[round.index]] += round.votes.reduce((total, rating) => total + rating, 0);
    round.outcome = 'rated';
    round.phase = 'choice-review';
  }
  return true;
}

export function skipChoice(session) {
  const round = session.round;
  if (round?.kind !== 'choice' || !['picking', 'choice-explain'].includes(round.phase) || round.skips === 0) return false;
  round.skips--;
  round.outcome = 'skipped';
  round.clock = null;
  round.phase = 'choice-review';
  return true;
}

export function expireChoice(session, now = Date.now()) {
  const round = session.round;
  if (round?.kind !== 'choice' || round.phase !== 'picking' || !round.clock ||
      (round.clock.remaining > 0 && (round.clock.endsAt === null || round.clock.endsAt > now))) return false;
  round.outcome = 'timeout';
  round.clock = null;
  round.phase = 'choice-review';
  return true;
}

export function nextChoicePrompt(session, random = Math.random, category = session.round?.settings?.category) {
  const round = session.round;
  if (round?.kind !== 'choice' || round.phase !== 'choice-review' || !allowsCategory(category, round.settings.boldness)) return false;
  if (round.turn + 1 === round.settings.turns * round.order.length) {
    round.phase = 'result';
    return true;
  }
  const question = nextQuestion(round, category, random);
  if (!question) return false;
  round.settings = { ...round.settings, category };
  round.turn++;
  round.index = round.turn % round.order.length;
  prepareTurn(round, question);
  return true;
}

export function restoreChoiceRound(round, players, savedVersion) {
  if (players.length < 2) return null;
  const order = round.order;
  const ids = new Set(players.map((player) => player.id));
  if (!Array.isArray(order) || order.length !== ids.size || new Set(order).size !== ids.size ||
      !order.every((id) => ids.has(id))) return null;
  if (!round.question) {
    const oldPhase = savedVersion < 3 ? ['picking', 'discussion', 'voting', 'result'] : ['picking'];
    if (!oldPhase.includes(round.phase) || !Array.isArray(round.prompt) || round.prompt.length !== 2 ||
        !round.prompt.every((option) => typeof option === 'string' && option.trim())) return null;
    const restored = makeChoiceRound(order, choiceSettings({ turns: 1 }), () => 0);
    if (!restored) return null;
    restored.question = { id: 0, text: 'اختيار الشلّة', options: round.prompt, category: 'mixed', boldness: 1 };
    restored.used = [0];
    if (round.phase === 'picking' && answers.includes(round.selected)) {
      restored.selected = round.selected;
      restored.phase = 'choice-explain';
    }
    return restored;
  }
  const settings = choiceSettings(round.settings);
  const { phase, turn, index, used, skips, votes, selected, outcome, clock, scores } = round;
  const question = round.question.id === 0 && used?.includes?.(0) &&
    Array.isArray(round.question.options) && round.question.options.length === 2 &&
    round.question.options.every((option) => typeof option === 'string' && option.trim())
    ? { id: 0, text: 'اختيار الشلّة', options: round.question.options, category: 'mixed', boldness: 1 } : questionsById.get(round.question.id);
  if (!phases.includes(phase) || !question || !Number.isInteger(turn) || turn < 0 || turn >= settings.turns * order.length ||
      index !== turn % order.length || !Array.isArray(used) || used.length !== turn + 1 || used.at(-1) !== question.id ||
      new Set(used).size !== used.length || !used.every((id, position) => questionsById.has(id) || (id === 0 && position === 0)) ||
      !Number.isInteger(skips) || skips < 0 || skips > choiceSkipAllowance ||
      !Array.isArray(votes) || votes.length >= order.length || !votes.every((points) => ratings.includes(points)) ||
      ![null, ...answers].includes(selected) ||
      !scores || !order.every((id) => Number.isInteger(scores[id]) && scores[id] >= 0 &&
        scores[id] <= 2 * (order.length - 1) * settings.turns)) return null;
  if ((phase === 'picking' && selected !== null) ||
      (['choice-explain', 'choice-rating'].includes(phase) && !answers.includes(selected)) ||
      (phase === 'choice-rating' && votes.length >= order.length - 1) ||
      (['choice-review', 'result'].includes(phase) && !reviewOutcomes.includes(outcome)) ||
      (outcome === 'rated' && (selected === null || votes.length !== order.length - 1)) ||
      (phase === 'result' && turn + 1 !== order.length * settings.turns)) return null;
  if (phase === 'picking' && settings.duration) {
    if (!clock || !Number.isFinite(clock.remaining) || clock.remaining < 0 || clock.remaining > settings.duration * 1000 ||
        typeof clock.started !== 'boolean' || (clock.endsAt !== null && !Number.isFinite(clock.endsAt))) return null;
  }
  return { ...round, settings, question, clock: phase === 'picking' && settings.duration ? clock : null };
}
