import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../engine.js';
import { roundView } from '../views.js';
import { makeTeamGame, reduceTeamGame, teamRoundIsValid } from '../team-engine.js';

function game(kind, mode = 'remote') {
  const session = engine.createSession();
  engine.configureSession(session, ['نوف', 'راكان', 'جود', 'سعود', 'ريم'], mode);
  assert.ok(engine.startGame(session, kind, () => 0.3));
  return session;
}

test('remote voting rejects a self vote without recording any part of the batch', () => {
  const session = game('outsider');
  while (session.round.phase === 'cards') engine.advanceCard(session);
  engine.beginDiscussion(session);
  engine.beginVote(session);
  const [first, second, third, fourth, fifth] = session.round.voters;
  const before = structuredClone(session.round);
  assert.ok(!engine.castVoteBatch?.(session, [second, second, first, first, first]));
  assert.deepEqual(session.round, before);
  assert.equal(engine.castVoteBatch?.(session, [second, first, first, first, first]), true);
  assert.equal(session.round.phase, 'result');
});

test('liar answers are readable in discussion without revealing the different question', () => {
  const session = game('liar');
  while (session.round.phase === 'cards') engine.advanceCard(session);
  engine.advanceAnswer(session, 'وراء الباب');
  while (session.round.phase === 'answers') engine.advanceAnswer(session);
  assert.match(roundView(session), /وراء الباب/);
  assert.ok(!roundView(session).includes(session.round.fakePrompt));
});

test('challenge timeout can be recorded separately from skipping and prevents late points', () => {
  const session = game('challenge');
  engine.startClock(session, 0);
  assert.equal(engine.recordChallenge(session, true, () => 0.3, 30_000), false);
  assert.equal(engine.recordChallenge(session, 'missed', () => 0.3, 30_000), true);
  assert.equal(session.round.challengeOutcomes?.[session.players[0].id], 'missed');
  engine.startClock(session, 40_000);
  assert.ok(engine.recordChallenge(session, 'skipped', () => 0.3, 40_100));
  assert.equal(session.round.challengeOutcomes?.[session.players[1].id], 'skipped');
});

test('auction rejects a duplicate and can undo the winning answer during the same turn', () => {
  let round = makeTeamGame('auction', { players: ['أ', 'ب', 'ج', 'د'] });
  round = reduceTeamGame(round, 'start', undefined, 0);
  round = reduceTeamGame(round, 'bid', 2, 0);
  round = reduceTeamGame(round, 'challenge', undefined, 0);
  round = reduceTeamGame(round, 'correct', 'جدة', 100);
  assert.equal(reduceTeamGame(round, 'correct', '  جِدّة ', 200), round);
  round = reduceTeamGame(round, 'correct', 'الرياض', 300);
  assert.equal(round.phase, 'team-summary');
  round = reduceTeamGame(round, 'undo', undefined, 400);
  assert.equal(round.phase, 'team-play');
  assert.deepEqual(round.team.accepted, ['جدة']);
  assert.deepEqual(round.team.scores, [0, 0]);
  assert.ok(teamRoundIsValid(round));
});

test('taboo counts a pass separately from a forbidden word', () => {
  let round = makeTeamGame('taboo', { players: ['أ', 'ب', 'ج', 'د'] });
  round = reduceTeamGame(round, 'start', undefined, 0);
  round = reduceTeamGame(round, 'skip', undefined, 100);
  round = reduceTeamGame(round, 'violation', undefined, 200);
  assert.equal(round.team.skipped, 1);
  assert.equal(round.team.violations, 1);
});

test('audience sees hideout counters while private hiding spots stay on the host screen', async () => {
  const { audienceState } = await import('../audience-state.js');
  const session = game('hideout');
  let round = reduceTeamGame(session.round, 'hide-start', 'استراحة', 0);
  round = reduceTeamGame(round, 'hide-lock', ['خلف الباب', 'داخل الصندوق', 'تحت الدرج'], 500);
  round = reduceTeamGame(round, 'hide-guess', { player: 0, text: 'تخمين خاص' }, 1000);
  const display = audienceState({ ...session, round });
  assert.equal(display.place, 'استراحة');
  assert.equal(display.guesses, 2);
  assert.doesNotMatch(JSON.stringify(display), /خلف الباب|داخل الصندوق|تحت الدرج|تخمين خاص/);
});

test('audience never receives mafia roles, targets or investigative results during the night', async () => {
  const { audienceState } = await import('../audience-state.js');
  const session = game('mafia');
  while (session.round.phase === 'cards') engine.advanceCard(session);
  while (engine.nightTurn(session).role !== 'report') {
    const turn = engine.nightTurn(session);
    engine.recordNightChoice(session, turn.role, turn.options[0]);
  }
  const display = audienceState(session);
  assert.equal(display.title, 'الليلة ١');
  assert.equal(display.status, 'المدينة نائمة');
  assert.doesNotMatch(JSON.stringify(display), /نوف|راكان|جود|سعود|ريم|المحقق|الطبيب/);
});

test('a remote host can send cards out of order and resume without exposing a selection', () => {
  let session = game('mafia');
  const [first, second, third, fourth, fifth] = session.round.order;
  assert.ok(engine.markCardDelivered(session, third));
  assert.ok(engine.markCardDelivered(session, fifth));
  session = engine.restoreSession(structuredClone(session));
  assert.deepEqual(engine.deliveredCards(session.round), [third, fifth]);
  assert.doesNotMatch(roundView(session), /class="secret-card"/);
  for (const id of [second, first, fourth]) assert.ok(engine.markCardDelivered(session, id));
  assert.equal(session.round.phase, 'night');
});

test('ratings submitted together award the exact sum of the other players’ votes', async () => {
  const { rateChoiceBatch } = await import('../choice-engine.js');
  const session = game('choice');
  assert.ok(engine.selectChoice(session, 0));
  assert.ok(engine.beginChoiceRating(session));
  assert.ok(!rateChoiceBatch(session, [2, 1, 0, 3]));
  assert.deepEqual(session.round.votes, []);
  assert.ok(rateChoiceBatch(session, [2, 1, 0, 2]));
  assert.equal(session.round.scores[session.round.order[0]], 5);
});
