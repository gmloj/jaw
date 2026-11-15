import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureSession, createSession, restoreSession, startGame } from '../engine.js';
import { reduceTeamGame } from '../team-engine.js';
import { roundView } from '../views.js';
import { tutorialSteps } from '../tutorial.js';

const players = ['خالد', 'سارة', 'فهد', 'ريم'];
const spots = ['داخل <صندوق> الفحم', 'وراء الستارة'];

function setup() {
  const session = createSession();
  assert.ok(configureSession(session, players, 'remote'));
  assert.ok(startGame(session, 'hideout', () => .5, { turns: 1 }));
  return session;
}

function step(session, action, value, now = 1000) {
  session.round = reduceTeamGame(session.round, action, value, now);
  return session.round;
}

function search(session) {
  step(session, 'hide-start', 'استراحة');
  step(session, 'hide-lock', spots, 2000);
  return session.round;
}

test('judge runs both teams through search and gets the combined result', () => {
  const session = setup();
  step(session, 'hide-start', '  استراحة  ');
  assert.equal(session.round.team.hideout.place, 'استراحة');
  assert.deepEqual(session.round.team.squads[0].players, ['خالد', 'فهد']);
  assert.equal(step(session, 'hide-lock', [spots[0], '']).phase, 'hide-spots');
  step(session, 'hide-lock', spots, 2000);
  assert.equal(session.round.phase, 'team-play');
  for (let i = 0; i < 3; i++) step(session, 'hide-question');
  assert.equal(session.round.team.hideout.questions, 2);
  step(session, 'hide-guess', { player: 0, text: 'صندوق الفحم' });
  step(session, 'hide-verdict', true);
  step(session, 'hide-guess', { player: 0, text: 'صندوق' });
  assert.equal(session.round.team.hideout.guesses.length, 1);
  for (const text of ['خلف الباب', 'وسط المطبخ']) {
    step(session, 'hide-guess', { player: 1, text });
    step(session, 'hide-verdict', false);
  }
  assert.equal(session.round.phase, 'team-summary');
  assert.deepEqual(session.round.team.scores, [1, 1]);

  step(session, 'next');
  assert.equal(session.round.team.turn, 1);
  assert.equal(session.round.team.hideout.place, '');
  search(session);
  step(session, 'tick', undefined, 62_000);
  assert.deepEqual(session.round.team.scores, [1, 3]);
  assert.equal(step(session, 'next').phase, 'team-result');
  assert.match(roundView(session), /الفوز لـ/);
});

test('secrets require the judge to reveal them until the summary, including after reload', () => {
  const session = setup();
  search(session);
  const resumed = restoreSession(JSON.parse(JSON.stringify(session)));
  assert.equal(resumed.round.phase, 'team-play');
  assert.doesNotMatch(roundView(resumed), /صندوق|الستارة/);
  assert.match(roundView(resumed, { privateVisible: true }), /&lt;صندوق&gt;/);
  assert.doesNotMatch(roundView(resumed, { privateVisible: true }), /داخل <صندوق>/);
  step(resumed, 'tick', undefined, 62_000);
  assert.match(roundView(resumed), /&lt;صندوق&gt;/);
});

test('a guess submitted before the deadline can still be judged after time expires', () => {
  const session = setup();
  search(session);
  step(session, 'hide-guess', { player: 0, text: 'صندوق الفحم' }, 61_999);
  step(session, 'tick', undefined, 62_000);
  assert.equal(session.round.phase, 'team-play');
  assert.equal(session.round.team.endsAt, null);
  const resumed = restoreSession(JSON.parse(JSON.stringify(session)));
  assert.equal(resumed.round.team.hideout.pending.text, 'صندوق الفحم');
  step(resumed, 'hide-verdict', true, 70_000);
  assert.equal(resumed.round.phase, 'team-summary');
  assert.deepEqual(resumed.round.team.scores, [1, 1]);
});

test('the standard in-app walkthrough covers the judging and summary stages', () => {
  const steps = tutorialSteps('hideout');
  assert.ok(steps.length >= 5);
  assert.ok(steps.some(step => step.markup.includes('سجّل التخمين')));
  assert.ok(steps.some(step => step.markup.includes('حصيلة الدور')));
});
