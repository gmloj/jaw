import { reduceTeamGame, teamKinds } from './team-engine.js';
import { games } from './content.js';
import { evidenceCases } from './party-content.js';
import { createVisuals } from './visual/controller.js';
import { visualQuality } from './visual/policy.js';
import { createMotion } from './motion/controller.js';
import { createTutorial } from './tutorial.js';
import { motionPreferences, feedbackForAction, resultFeedback } from './motion/policy.js';
import {
  beginChoiceRating, expireChoice, rateChoice, skipChoice,
  addReverseEntry, advanceKnow, openEvidenceClue, recordKnowAnswer, recordKnowGuess, resolveEvidence,
  addAnonymousQuestion, advanceAnswer, advanceCard, advanceCourt, advanceQuestion, beginDiscussion, beginVote, castVote, clockRemaining,
  closeAnonymousQuestion, openAnonymousQuestion,
  configureSession, currentPlayer, finishNight, leaveRound, nightTurn, nextChoicePrompt, nextNight, nextSocialPrompt,
  maxPlayers, pauseClock, playerCard, recordChallenge, recordNightChoice, restoreSession, selectChoice, startClock, startGame,
} from './engine.js';
import { button, defaultPlayerName, gameRules, nameFields, number, roundView, setupView } from './views.js';
import { activateUpdate, enableOffline, hasUpdate, installed, requestInstall } from './offline.js';

const sessionKey = 'aljumaa-session-v1';
const settingsKey = 'jaw-preferences';
const tutorialKey = 'jaw-tutorials-v1';
const pages = [...document.querySelectorAll('[data-browse]')];
const home = document.getElementById('home');
const siteTitle = document.title;
const stage = document.querySelector('#play');
const modal = document.querySelector('#modal');
let session = restoreSession(read(sessionKey));
const savedPreferences = read(settingsKey) ?? read('dawrak-preferences');
let preferences = motionPreferences(savedPreferences);
let quality = visualQuality(savedPreferences?.quality);
const visuals = createVisuals(document);
const motion = createMotion(document, preferences);
const savedTutorials = read(tutorialKey);
const seenTutorials = new Set(Array.isArray(savedTutorials) ? savedTutorials : []);
const tutorial = createTutorial(document.querySelector('#tutorial'), {
  motion,
  seen: (kind) => seenTutorials.has(kind),
  remember(kind) {
    visuals.skipCountdown();
    if (seenTutorials.has(kind)) return;
    seenTutorials.add(kind);
    save(tutorialKey, [...seenTutorials]);
  },
});
let roundOrigin = null;
let draft;
let privateVisible = false;
let nightUnlocked = false;
let modalOpener;
let leaveTo = 'games';
let clockEnded = false;
let clockInterval;
let storageWarning = false;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    if (!storageWarning) {
      storageWarning = true;
      updateConnection();
    }
  }
}

function announce(message) {
  document.querySelector('#notices').textContent = message;
}

function updateConnection() {
  const notice = document.querySelector('#connection');
  notice.hidden = navigator.onLine && !storageWarning;
  notice.textContent = storageWarning ? 'التخزين مقفول في متصفحك. خلك على هذي الصفحة عشان تكمل الجولة.' :
    'الإنترنت مفصول. تقدر تكمل الجولة على جهازك.';
}

function openModal(title, body, opener = document.activeElement) {
  if (!modal.open) modalOpener = opener;
  modal.innerHTML = `
    <div class="modal-header">
      <h2 id="dialog-heading" tabindex="-1">${title}</h2>
      <button class="icon-button" type="button" data-action="close" aria-label="إغلاق">×</button>
    </div>
    <div class="modal-body">${body}</div>
  `;
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
  modal.querySelector('#dialog-heading').focus({ preventScroll: true });
  motion.play(modal, 'rise', 'modal');
}

function closeModal() {
  motion.clear(modal);
  motion.modalExit(modal);
  modal.close();
}

modal.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeModal();
});

modal.addEventListener('close', () => {
  if (!modal.open && modal.dataset.visualProfile) {
    delete modal.dataset.visualProfile;
    const round = session.round;
    visuals.atmosphere(round && games[round.kind].visualProfile, round?.phase);
  }
  const opener = modalOpener;
  if (opener?.isConnected && !opener.closest('[hidden]') && document.activeElement === document.body) opener.focus();
});

function renderHelp(opener) {
  if (session.round) {
    const kind = session.round.kind;
    openModal('قواعد ' + games[kind].title, gameRules(kind) + `<div class="actions">${button('close', 'ارجع للّعب')}</div>`, opener);
    return;
  }
  openModal('كيف نلعب؟', `
    <ol class="rules-list">
      <li>اختاروا اللعبة. واحد منكم يصير مدير الجولة ويدخل عددكم وأسماءكم.</li>
      <li>على جهاز واحد، مرّروا الجوال لكشف البطاقات. في الروم الصوتي، المدير يرسل كل بطاقة لصاحبها بالخاص.</li>
      <li>المدير يتابع أسئلة الجولة أو أدوار الليل، ويثبّت الأصوات لين تطلع النتيجة.</li>
    </ol>
    <p class="muted">في ألعاب الفرق، حدّد أعضاء كل فريق. المدير يسجّل الإجابات ويتابع النقاط من جواله.</p>
    <p class="muted">في المافيا، الأفضل يكون الراوي شخص خارج قائمة اللاعبين لأنه يعرف الاختيارات السرّية.</p>
    <div class="actions">${button('close', 'تمام')}</div>
  `, opener);
}

function preferenceField(name, label, description) {
  return `<label class="preference">
    <span><strong>${label}</strong><small>${description}</small></span>
    <input type="checkbox" data-preference="${name}" ${preferences[name] ? 'checked' : ''}>
  </label>`;
}

function applyPreferences() {
  motion.apply(preferences);
  visuals.apply(quality, motion.reduced);
  const hint = modal.querySelector('#motion-preference-hint');
  if (hint) hint.textContent = motion.systemReduced ? 'تقليل الحركة مفعّل من إعدادات جهازك.' : 'المتوازن يجمع بين الاستجابة السريعة وحركة أخف.';
}

function renderSettings(opener) {
  openModal('الإعدادات', `
    <label class="preference motion-preference">
      <span><strong>الحركة</strong><small id="motion-preference-hint">${motion.systemReduced ? 'تقليل الحركة مفعّل من إعدادات جهازك.' : 'المتوازن يجمع بين الاستجابة السريعة وحركة أخف.'}</small></span>
      <select class="field" data-preference="motion" aria-describedby="motion-preference-hint">
        ${[['balanced', 'متوازنة'], ['full', 'كاملة'], ['reduced', 'مخففة']].map(([value, label]) =>
          `<option value="${value}" ${preferences.motion === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </label>
    <label class="preference motion-preference">
      <span><strong>جودة المؤثرات</strong><small>الإضاءة وحركة الخلفية والجزيئات</small></span>
      <select class="field" data-preference="quality">
        ${[['balanced', 'متوازنة'], ['high', 'عالية'], ['low', 'توفير الطاقة']].map(([value, label]) =>
          `<option value="${value}" ${quality === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </label>
    ${preferenceField('sound', 'أصوات اللعبة', 'إشارات قصيرة للضغط وكشف الأدوار والنتيجة')}
    ${'vibrate' in navigator ? preferenceField('vibration', 'الاهتزاز', 'للانتقال بين الأدوار ونهاية الوقت') : ''}
    <div class="actions">
      ${hasUpdate() ? button('update-app', 'حدّث جوّ') : ''}
      ${installed() ? '' : button('install', 'ثبّت جوّ', 'outline')}
      ${button('close', 'تم', 'outline')}
    </div>
  `, opener);
}

function showInstall() {
  openModal('ثبّت جوّ', `
    <p class="muted">افتح الموقع في متصفح الجوال، ثم أضفه لشاشتك الرئيسية.</p>
    <ul class="rules-list">
      <li><strong>آيفون · Safari</strong> من قائمة المشاركة اختر «إضافة إلى الشاشة الرئيسية»، وفعّل «الفتح كتطبيق ويب» إذا ظهر الخيار.</li>
      <li><strong>أندرويد · Chrome</strong> من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li>
    </ul>
    <div class="actions">${button('close', 'تمام')}</div>
  `);
}

function updateInstall() {
  document.querySelector('#install-top').hidden = installed();
}

function openSetup(kind, opener) {
  const game = games[kind];
  if (!game) return;
  const settings = session.options[kind];
  draft = {
    kind,
    count: Math.max(game.min, session.players.length),
    names: kind === 'choice' ? session.players.map((player) => player.name) : [],
    mode: session.mode,
    difficulty: settings?.difficulty ?? 'mixed',
    duration: settings?.duration ?? (kind === 'choice' ? 0 : kind === 'mafia' ? 90 : 60),
    ...(kind === 'choice' ? { category: settings?.category, boldness: settings?.boldness, turns: settings?.turns } : {}),
  };
  if (teamKinds.includes(kind)) {
    const current = session.round?.kind === kind ? session.round.team : null;
    draft.assignments = current ? session.players.map(({ name }, index) =>
      current.squads[0].players.includes(name) ? 0 : current.squads[1].players.includes(name) ? 1 : index % 2) : [];
    draft.teamNames = current?.squads.map((squad) => squad.name) ?? ['فريق البنفسجي', 'فريق الذهبي'];
    draft.teamTurns = current?.turns ?? 2;
  }
  openModal(kind === 'choice' ? game.title + ' 🔥' : 'إعداد ' + game.title, setupView(draft, Boolean(session.round)), opener);
  modal.dataset.visualProfile = game.visualProfile ?? 'jaw';
  visuals.atmosphere(game.visualProfile);
  updateCountControls();
}

function updateCountControls() {
  modal.querySelector('[data-action="count-down"]').disabled = draft.count === games[draft.kind].min;
  modal.querySelector('[data-action="count-up"]').disabled = draft.count === maxPlayers;
}

function setPlayerCount(count) {
  const { min } = games[draft.kind];
  draft.count = Math.max(min, Math.min(maxPlayers, count));
  modal.querySelector('#player-count').value = draft.count;
  modal.querySelector('#player-fields').innerHTML = nameFields(draft);
  updateCountControls();
}

function setLocation(hash, push = false) {
  if (location.hash === hash) return;
  const url = location.pathname + location.search + hash;
  if (push) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
}

function browseTarget() {
  if (location.hash === '#teams') return 'teams';
  if (location.hash === '#founder') return 'founder';
  if (['#games', '#quick-games'].includes(location.hash)) return 'games';
  return 'home';
}

function renderBrowse(target, { initial = false, push = false, quick = false } = {}) {
  const leavingRound = !stage.hidden;
  const page = document.getElementById(target);
  const entering = page.hidden;
  motion.clear(stage);
  visuals.clearEvent();
  visuals.skipCountdown();
  visuals.atmosphere('jaw');
  for (const candidate of pages) candidate.hidden = candidate !== page;
  stage.hidden = true;
  if (leavingRound) stage.replaceChildren();
  updateClock();
  document.body.dataset.playing = 'false';
  document.body.dataset.nav = target;
  document.title = target === 'founder' ? 'بصمة إيسكو | جوّ' : siteTitle;
  document.querySelector('[data-action="founder-resume"]').hidden = !session.round;
  for (const link of document.querySelectorAll('.nav a, .mobile-nav a, .founder-link')) {
    if (link.dataset.action === target) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  motion.observeCards(page);
  if (!initial && entering) motion.play(page, 'fade', 'page');

  const origin = leavingRound ? roundOrigin : null;
  if (leavingRound && target !== 'founder') roundOrigin = null;
  const quickLink = target === 'games' && (quick || origin?.hash === '#quick-games');
  const hash = target === 'home' ? '' : quickLink ? '#quick-games' : '#' + target;
  setLocation(hash, push);
  if (origin?.page === target) {
    origin.tile?.focus({ preventScroll: true });
    window.scrollTo({ top: origin.y, behavior: 'instant' });
    return;
  }
  const heading = document.getElementById(quickLink ? 'quick-title' : target + '-title');
  if (!initial) (heading ?? document.querySelector('.brand')).focus({ preventScroll: true });
  if (quickLink) heading.scrollIntoView({ block: 'start', behavior: 'instant' });
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

function askToLeave(target, opener) {
  if (!session.round || target === 'founder') {
    renderBrowse(target, { push: true });
    return;
  }
  leaveTo = target;
  if (['result', 'team-result'].includes(session.round.phase)) {
    endRound(target);
    return;
  }
  if (privateVisible) conceal();
  openModal('تنهي الجولة؟', `
    <p class="muted">${session.round.kind === 'anonymous' ? 'تنحذف بطاقات هالجولة، وتبقى أسماء الشلّة.' : 'أسماء الشلّة وإعدادات اللعبة بتبقى عندك.'}</p>
    <div class="actions">
      ${button('close', 'كمّل اللعب', 'outline')}
      ${button('confirm-exit', 'إنهاء الجولة', 'danger')}
    </div>
  `, opener);
}

function endRound(target) {
  privateVisible = false;
  leaveRound(session);
  save(sessionKey, session);
  if (modal.open) closeModal();
  renderBrowse(target);
}

function renderRound({ focus = true, animate = true, effect = 'round' } = {}) {
  const entering = stage.hidden;
  if (entering) {
    for (const page of pages) {
      if (!page.hidden) motion.clear(page);
      page.hidden = true;
    }
  }
  motion.clear(stage);
  stage.hidden = false;
  document.body.dataset.playing = 'true';
  document.title = siteTitle;
  stage.innerHTML = roundView(session, { privateVisible, nightUnlocked });
  const surface = stage.firstElementChild;
  const { kind, phase } = session.round;
  const game = games[kind];
  surface.dataset.visualProfile = game.visualProfile ?? 'jaw';
  visuals.atmosphere(game.visualProfile, phase);
  visuals.skipCountdown();
  if (animate) {
    motion.round(surface, game.motionProfile, entering ? 'page' : 'card', effect);
    if (entering || effect === 'start') visuals.startRound(stage);
    if (['reveal', 'select', 'vote', 'win', 'loss', 'timeout'].includes(effect) || entering || effect === 'start') {
      visuals.emit(entering || effect === 'start' ? 'start' : effect, surface.querySelector('.stage-panel'));
    } else visuals.clearEvent();
  }
  updateClock();
  if (focus) {
    stage.querySelector('#stage-title').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function updateRound(options) {
  setLocation('#round', stage.hidden);
  save(sessionKey, session);
  renderRound(options);
}

function conceal() {
  if (!privateVisible) return;
  privateVisible = false;
  if (session.round) renderRound({ focus: false, animate: false });
}

function updateClock() {
  if (teamKinds.includes(session.round?.kind)) {
    updateTeamClock();
    return;
  }
  const clock = document.querySelector('#clock');
  if (!clock) {
    clearClockInterval();
    clockEnded = false;
    return;
  }
  const state = session.round.clock;
  const seconds = Math.ceil(clockRemaining(session) / 1000);
  const running = state.endsAt !== null && seconds > 0;
  if (running) clockInterval ??= window.setInterval(updateClock, 200);
  else clearClockInterval();
  const late = seconds === 0;
  if (late && session.round.kind === 'choice' && expireChoice(session)) {
    changeRound('timeout');
    return;
  }
  if (late && session.round.kind === 'evidence' && resolveEvidence(session, null)) {
    changeRound('timeout');
    return;
  }
  const label = late ? 'انتهى الوقت' : running ? 'الوقت يمشي' : state.started ? 'موقوف مؤقتًا' : session.round.kind === 'challenge' ? 'جهّز اللاعب للبدء' : session.round.kind === 'choice' ? 'مؤقّت الإجابة جاهز' : 'وقت النقاش جاهز';
  const toggle = document.querySelector('#clock-toggle');
  const hint = document.querySelector('#clock-hint');
  clock.dataset.running = running;
  clock.dataset.late = late;
  clock.dataset.urgent = running && seconds <= 5;
  const display = number(seconds);
  if (clock.textContent !== display) {
    clock.textContent = display;
    if (running && seconds <= 5) motion.play(clock, 'tick', 'instant');
  }
  if (hint.textContent !== label) hint.textContent = label;
  if (session.round.kind === 'challenge') {
    const pass = stage.querySelector('[data-action="challenge-pass"]');
    const next = stage.querySelector('[data-action="challenge-fail"]');
    pass.disabled = !state.started || late;
    const nextLabel = late ? 'انتقل للي بعده' : 'تخطّى الدور';
    if (next.textContent !== nextLabel) next.textContent = nextLabel;
  }
  toggle.disabled = late;
  const toggleLabel = late ? 'انتهى المؤقّت' : running ? 'إيقاف مؤقت' : state.started ? 'كمّل المؤقّت' : 'ابدأ المؤقّت';
  if (toggle.textContent !== toggleLabel) toggle.textContent = toggleLabel;
  if (late && !clockEnded) {
    motion.feedback('timeout');
    visuals.emit('timeout', clock);
  }
  clockEnded = late;
}

function updateTeamClock() {
  const clock = stage.querySelector('#team-clock');
  const deadline = session.round.team.endsAt;
  if (!clock || deadline === null) {
    clearClockInterval();
    return;
  }
  const now = Date.now();
  if (now >= deadline) {
    clearClockInterval();
    playTeamAction('tick', undefined, now);
    return;
  }
  clockInterval ??= window.setInterval(updateClock, 200);
  const seconds = Math.ceil((deadline - now) / 1000);
  const display = number(seconds);
  clock.dataset.urgent = seconds <= 5;
  if (clock.textContent !== display) {
    clock.textContent = display;
    if (seconds <= 5) motion.play(clock, 'tick', 'instant');
  }
}

function playTeamAction(action, value, now = Date.now()) {
  const before = session.round;
  if (!teamKinds.includes(before?.kind)) return;
  const next = reduceTeamGame(before, action, value, now);
  if (next === before) return;
  session.round = next;
  if (next.phase === before.phase) {
    updateRound({ focus: false, animate: false });
    const focus = { correct: 'correct', skip: 'skip', pause: 'resume', resume: 'pause' }[action];
    if (focus) stage.querySelector(`[data-team-action="${focus}"]`)?.focus({ preventScroll: true });
    if (action === 'bid') stage.querySelector('#team-bid, [data-team-action="challenge"]')?.focus({ preventScroll: true });
    if (action === 'correct') motion.feedback('success');
    if (action === 'bid') {
      motion.feedback('select');
      visuals.emit('select', stage.querySelector('.team-prompt'));
      announce('تم تسجيل المزايدة.');
    }
    return;
  }
  if (action === 'tick') motion.feedback('timeout');
  if (next.phase === 'team-result') {
    const [first, second] = next.team.scores;
    changeRound(first === second ? 'round' : 'win');
  } else if (action === 'tick') {
    changeRound('timeout');
  } else {
    changeRound(action === 'start' || action === 'challenge' ? 'reveal' : 'round');
  }
}

async function copyTeamCard() {
  const round = session.round;
  if (round?.kind !== 'taboo' || !['team-ready', 'team-play'].includes(round.phase)) return;
  const { word, ban } = round.team.prompt;
  const message = stage.querySelector('#team-copy-message');
  const field = stage.querySelector('#team-manual-copy');
  const text = `بطاقتك في ممنوع تقول 🎙️
اشرح: ${word}
الكلمات الممنوعة: ${ban.join('، ')}`;
  try {
    await navigator.clipboard.writeText(text);
    if (message.isConnected) {
      message.textContent = 'تم النسخ. أرسلها للشارح بالخاص.';
      motion.feedback('success');
    }
  } catch {
    if (!field.isConnected) return;
    field.value = text;
    field.hidden = false;
    field.focus();
    field.select();
    message.textContent = 'انسخ النص المحدد وأرسله للشارح بالخاص.';
  }
}

function clearClockInterval() {
  if (clockInterval === undefined) return;
  window.clearInterval(clockInterval);
  clockInterval = undefined;
}

function changeRound(effect = 'round') {
  privateVisible = false;
  clockEnded = false;
  const round = session.round;
  if (round.phase === 'result') effect = resultFeedback(round, evidenceCases[round.caseIndex]?.answer);
  updateRound({ effect });
}

function beginSetup(data) {
  const form = document.querySelector('#setup-form');
  const kind = form.dataset.kind;
  const size = Number(data.get('count'));
  const names = Array.from({ length: size }, (_, index) => {
    const value = String(data.get('player-' + index) ?? '').trim();
    return value || defaultPlayerName(index);
  });
  const next = { ...session, round: null };
  const options = { duration: Number(data.get('duration')), difficulty: data.get('difficulty') };
  if (kind === 'choice') {
    options.category = data.get('category');
    options.boldness = Number(data.get('boldness'));
    options.turns = Number(data.get('turns'));
    if (options.category === 'black' && options.boldness !== 3) {
      showFormError('#setup-error', 'اختر مستوى الجرأة الأسود عشان تلعب بهذا القسم.');
      return;
    }
  }
  if (teamKinds.includes(kind)) {
    options.names = [0, 1].map((side) => String(data.get('team-name-' + side) ?? '').trim().replace(/\s+/g, ' ') || draft.teamNames[side]);
    options.turns = Number(data.get('team-turns'));
    options.assignments = Array.from({ length: size }, (_, i) => Number(data.get('team-' + i)));
    const first = options.assignments.filter((side) => side === 0).length;
    if (first < 2 || size - first < 2 || Math.abs(size - first * 2) > 1) {
      showFormError('#setup-error', 'خلّ بكل فريق لاعبين على الأقل، وخلّ الفرق بين الفريقين لاعب واحد بالكثير.');
      return;
    }
    const teamKey = (name) => name.normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u0640\u064B-\u065F]/g, '');
    if (!options.names.every((name) => teamKey(name).trim()) || teamKey(options.names[0]) === teamKey(options.names[1])) {
      showFormError('#setup-error', 'خلّ لكل فريق اسم مختلف.');
      return;
    }
  }
  const mode = games[kind].hostOnly ? session.mode : data.get('mode');
  if (!configureSession(next, names, mode) || !startGame(next, kind, Math.random, options)) {
    showFormError('#setup-error', 'خلّ لكل لاعب اسم مختلف، وتأكد من عدد اللاعبين.');
    return;
  }
  rememberGames(modalOpener);
  session = next;
  closeModal();
  changeRound();
  tutorial.open(kind, true);
}

function privateText() {
  if (!privateVisible || session.mode !== 'remote') return '';
  if (session.round.phase === 'night') {
    const report = nightTurn(session)?.report;
    if (!report) return '';
    const receiver = session.players.find((player) => player.id === report.recipient).name;
    const suspect = session.players.find((player) => player.id === report.id).name;
    return `يا ${receiver}، نتيجة التحرّي في المافيا: ${suspect} ${report.isMafia ? 'من المافيا' : 'من أهل المدينة'}.`;
  }
  const card = playerCard(session);
  const player = currentPlayer(session);
  if (!card || !player) return '';
  return `بطاقتك في ${games[session.round.kind].title}\nيا ${player.name}، بطاقتك السرّية: ${card.title}\n${card.detail}${card.extra ? '\n' + card.extra : ''}`;
}

async function copyCard() {
  const text = privateText();
  const message = document.querySelector('#copy-message');
  const field = document.querySelector('#manual-copy');
  if (!(text && message && field)) return;
  try {
    await navigator.clipboard.writeText(text);
    if (message.isConnected) {
      message.textContent = 'تم النسخ. أرسلها لصاحبها بالخاص.';
      motion.play(message, 'rise', 'ui');
      motion.feedback('success');
    }
  } catch {
    if (!field.isConnected) return;
    field.value = text;
    field.hidden = false;
    field.focus();
    field.select();
    message.textContent = 'انسخ النص المحدد وأرسله لصاحبه بالخاص.';
  }
}

async function copyFounderProfile(button) {
  const profile = button.closest('.isco-profile');
  const field = profile.querySelector('input');
  const message = profile.querySelector('.isco-copy-message');
  try {
    await navigator.clipboard.writeText(field.value);
    button.dataset.feedback = 'success';
    button.querySelector('span').textContent = 'تم';
    message.hidden = true;
    announce('تم نسخ رقم لاعب جكارو.');
    motion.feedback('success');
  } catch {
    delete button.dataset.feedback;
    button.querySelector('span').textContent = 'نسخ';
    message.hidden = false;
    field.focus();
    field.select();
    announce(message.textContent);
  }
}

function rememberGames(opener) {
  if (!stage.hidden) return;
  const page = opener?.closest('[data-browse]')?.id ?? document.body.dataset.nav;
  roundOrigin = { page, hash: location.hash, y: window.scrollY, tile: opener };
}

function showFormError(selector, text) {
  const message = document.querySelector(selector);
  message.textContent = text;
  motion.play(message, 'error', 'ui');
  motion.feedback('error');
}

async function runBusy(control, operation) {
  if (control.getAttribute('aria-busy') === 'true') return;
  control.setAttribute('aria-busy', 'true');
  try { await operation(); }
  finally { control.removeAttribute('aria-busy'); }
}

async function install(control) {
  await runBusy(control, async () => {
    if (!(await requestInstall())) showInstall();
  });
}

function handleAction(control) {
  const { action, kind } = control.dataset;
  const round = session.round;
  const effect = feedbackForAction(action);
  if (effect === 'press') motion.feedback(effect);
  if (['help', 'settings', 'install'].includes(action)) conceal();
  switch (action) {
    case 'focus-main':
      document.getElementById('main').focus();
      break;
    case 'home':
    case 'games':
    case 'teams':
    case 'founder':
      askToLeave(action, control);
      break;
    case 'founder-copy-profile':
      void runBusy(control, () => copyFounderProfile(control));
      break;
    case 'founder-motion': {
      const paused = document.getElementById('founder').toggleAttribute('data-isco-paused');
      control.setAttribute('aria-pressed', String(paused));
      break;
    }
    case 'founder-jump': {
      const heading = document.getElementById(control.dataset.target);
      heading.focus({ preventScroll: true });
      heading.closest('section').scrollIntoView({ block: 'start', behavior: motion.reduced ? 'instant' : 'smooth' });
      break;
    }
    case 'founder-resume':
      if (session.round) updateRound({ animate: false });
      break;
    case 'help':
      renderHelp(control);
      break;
    case 'settings':
      renderSettings(control);
      break;
    case 'install':
      void install(control);
      break;
    case 'update-app':
      save(sessionKey, session);
      activateUpdate();
      break;
    case 'close':
      closeModal();
      break;
    case 'setup':
      openSetup(kind, control);
      break;
    case 'tutorial':
      tutorial.open(kind);
      break;
    case 'choice-start':
      openSetup('choice', control);
      break;
    case 'choice-pick':
      if (selectChoice(session, Number(control.dataset.option))) {
        motion.feedback('select');
        updateRound({ focus: false, animate: false });
        const selected = stage.querySelector('[aria-pressed="true"]');
        selected.focus({ preventScroll: true });
        motion.play(selected, 'select', 'press');
        visuals.emit('select', selected, Number(control.dataset.option));
        announce('تم اختيار ' + selected.querySelector('small').textContent);
      }
      break;
    case 'team-action':
      playTeamAction(control.dataset.teamAction);
      break;
    case 'team-copy':
      void copyTeamCard();
      break;
    case 'team-replay': {
      const previous = round.team;
      const names = previous.squads.map((squad) => squad.name);
      const assignments = session.players.map((player) => Number(previous.squads[1].players.includes(player.name)));
      if (startGame(session, round.kind, Math.random, { names, assignments, turns: previous.turns })) changeRound('start');
      break;
    }
    case 'count-up':
    case 'count-down':
      setPlayerCount(draft.count + (action === 'count-up' ? 1 : -1));
      break;
    case 'court-next':
      if (advanceCourt(session)) changeRound();
      break;
    case 'answer-next':
      if (advanceAnswer(session)) changeRound();
      break;
    case 'reveal':
      privateVisible = true;
      renderRound({ effect: 'reveal' });
      break;
    case 'unlock-night':
      nightUnlocked = true;
      renderRound();
      break;
    case 'hide-private':
      privateVisible = false;
      renderRound();
      break;
    case 'copy-card':
      void runBusy(control, copyCard);
      break;
    case 'advance-card':
      if (privateVisible && advanceCard(session)) {
        if (round.phase === 'night') nightUnlocked = false;
        changeRound();
      }
      break;
    case 'question-next':
      if (advanceQuestion(session)) changeRound();
      break;
    case 'discussion':
      if (beginDiscussion(session)) changeRound();
      break;
    case 'begin-vote':
      if (beginVote(session)) changeRound('vote');
      break;
    case 'skip-night':
      if (recordNightChoice(session, nightTurn(session).role, null)) changeRound();
      break;
    case 'finish-night':
      if (finishNight(session)) changeRound();
      break;
    case 'next-night':
      if (nextNight(session)) {
        nightUnlocked = true;
        changeRound();
      }
      break;
    case 'social-next':
      if (nextSocialPrompt(session)) changeRound();
      break;
    case 'choice-rate-start':
      if (beginChoiceRating(session)) changeRound();
      break;
    case 'choice-rate':
      if (rateChoice(session, Number(control.dataset.voter), Number(control.dataset.points))) changeRound('vote');
      break;
    case 'choice-skip':
      if (skipChoice(session)) changeRound();
      break;
    case 'evidence-clue': {
      const index = Number(control.dataset.clue);
      const selected = stage.querySelector('#evidence-form input:checked')?.value;
      if (openEvidenceClue(session, index)) {
        updateRound({ focus: false, animate: false });
        if (selected !== undefined) stage.querySelector(`#evidence-form input[value="${selected}"]`).checked = true;
        const opened = stage.querySelector('#clue-' + index);
        opened?.focus({ preventScroll: true });
        motion.play(opened, 'flip', 'reveal');
        visuals.emit('reveal', opened);
        motion.feedback('reveal');
      }
      break;
    }
    case 'know-answer':
      if (recordKnowAnswer(session, Number(control.dataset.option))) changeRound('select');
      break;
    case 'know-guess':
    case 'know-skip':
      if (recordKnowGuess(session, action === 'know-skip' ? null : Number(control.dataset.option))) {
        changeRound(session.round.phase === 'knowReveal' ? 'reveal' : 'select');
      }
      break;
    case 'know-next':
      if (advanceKnow(session)) changeRound();
      break;
    case 'anonymous-open':
      if (openAnonymousQuestion(session, Number(control.dataset.card))) changeRound('reveal');
      break;
    case 'anonymous-close': {
      const card = round?.activeQuestion;
      if (closeAnonymousQuestion(session)) {
        updateRound({ focus: false, animate: false });
        stage.querySelector(`[data-action="anonymous-open"][data-card="${card}"]`)?.focus();
      }
      break;
    }
    case 'toggle-clock':
      if (!startClock(session) && !pauseClock(session)) break;
      if (round.kind === 'challenge' || (round.kind === 'evidence' && stage.querySelector('#evidence-form fieldset').disabled)) {
        updateRound({ focus: false, animate: false });
        document.querySelector('#clock-toggle')?.focus();
      } else {
        save(sessionKey, session);
        updateClock();
      }
      break;
    case 'challenge-pass':
    case 'challenge-fail':
      if (recordChallenge(session, action === 'challenge-pass')) changeRound();
      break;
    case 'restart':
      if (startGame(session, round.kind)) changeRound('start');
      break;
    case 'confirm-exit':
      endRound(leaveTo);
      break;
  }
}

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled || control.matches('[aria-disabled="true"], [aria-busy="true"]')) return;
  event.preventDefault();
  handleAction(control);
});

document.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  switch (event.target.id) {
    case 'setup-form':
      beginSetup(data);
      break;
    case 'choice-next-form':
      if (nextChoicePrompt(session, Math.random, data.get('category') ?? undefined)) changeRound('reveal');
      break;
    case 'team-bid-form':
      playTeamAction('bid', Number(data.get('bid')));
      break;
    case 'evidence-form': {
      const suspect = data.get('suspect');
      if ((suspect !== null && resolveEvidence(session, Number(suspect))) || resolveEvidence(session, null)) changeRound();
      break;
    }
    case 'reverse-form':
      if (addReverseEntry(session, Number(data.get('author')), data.get('question'))) {
        updateRound({ focus: false, animate: false });
        stage.querySelector('#reverse-author, [data-action="begin-vote"]')?.focus({ preventScroll: true });
        motion.feedback('success');
        announce('انحفظ السؤال');
      } else {
        showFormError('#reverse-error', 'اختر اللاعب واكتب سؤال.');
        stage.querySelector('#reverse-text').focus();
      }
      break;
    case 'anonymous-form':
      if (addAnonymousQuestion(session, Number(data.get('recipient')), data.get('question'))) {
        updateRound({ focus: false, animate: false });
        stage.querySelector('#anonymous-recipient').focus({ preventScroll: true });
        motion.feedback('success');
        announce('انحفظ السؤال في البطاقات');
      } else {
        showFormError('#anonymous-error', 'اختر الشخص واكتب السؤال.');
        stage.querySelector('#anonymous-question').focus();
      }
      break;
    case 'vote-form': {
      const vote = data.get('vote');
      if (vote !== null && castVote(session, vote === 'skip' ? null : Number(vote))) changeRound('vote');
      break;
    }
    case 'night-form':
      if (recordNightChoice(session, event.target.dataset.role, Number(data.get('target')))) changeRound();
      break;
  }
});

modal.addEventListener('input', (event) => {
  const input = event.target;
  if (draft && input.dataset.player !== undefined) draft.names[Number(input.dataset.player)] = input.value;
});

modal.addEventListener('change', (event) => {
  const input = event.target;
  if (input.name === 'count' && draft) {
    setPlayerCount(Number(input.value));
  }
  if (draft?.kind === 'choice' && input.name === 'category' && input.value === 'black') {
    input.form.elements.boldness.value = '3';
  }
  if (draft?.assignments && input.dataset.teamAssignment !== undefined) {
    draft.assignments[Number(input.dataset.teamAssignment)] = Number(input.value);
  }
  if (input.dataset.preference) {
    const key = input.dataset.preference;
    if (key === 'quality') quality = visualQuality(input.value);
    else preferences = motionPreferences({ ...preferences, [key]: key === 'motion' ? input.value : input.checked });
    save(settingsKey, { ...preferences, quality });
    applyPreferences();
  }
});

modal.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || event.target.dataset.player === undefined) return;
  event.preventDefault();
  const next = modal.querySelector(`[data-player="${Number(event.target.dataset.player) + 1}"]`);
  (next || modal.querySelector('#setup-form [type="submit"]'))?.focus();
});

stage.addEventListener('jaw:hold', (event) => {
  if (event.target.matches('.card-back') && session.round?.phase === 'cards' && !privateVisible) {
    stage.querySelector('[data-action="reveal"]')?.click();
  }
});
stage.addEventListener('jaw:swipe', (event) => {
  if (event.detail.direction === 'previous' && session.round?.kind === 'anonymous') {
    stage.querySelector('[data-action="anonymous-close"]')?.click();
  }
});

document.addEventListener('jaw:motion-preference', applyPreferences);
window.addEventListener('pagehide', (event) => {
  if (event.persisted) {
    visuals.clearEvent();
    visuals.skipCountdown();
  } else {
    motion.destroy();
    visuals.destroy();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) conceal();
  else updateClock();
});
window.addEventListener('pagehide', conceal);
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
window.addEventListener('storage', (event) => {
  if (event.key !== sessionKey) return;
  session = restoreSession(read(sessionKey));
  nightUnlocked = false;
  privateVisible = false;
  if (session.round && browseTarget() !== 'founder') renderRound({ focus: false, animate: false });
  else renderBrowse(browseTarget(), { initial: true, quick: location.hash === '#quick-games' });
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#main') return;
  if (location.hash === '#founder') {
    renderBrowse('founder');
    return;
  }
  if (session.round) {
    if (location.hash === '#round') {
      if (stage.hidden) renderRound({ animate: false });
      return;
    }
    const target = browseTarget();
    setLocation('#round');
    askToLeave(target, document.activeElement);
  } else {
    renderBrowse(browseTarget(), { quick: location.hash === '#quick-games' });
  }
});

applyPreferences();
updateConnection();
updateInstall();
enableOffline({
  onInstallChange: updateInstall,
  onUpdate: () => announce('يتوفّر تحديث لجوّ في الإعدادات.'),
});
if (session.round && browseTarget() !== 'founder') {
  setLocation('#round');
  renderRound({ focus: false, animate: false });
} else {
  const target = browseTarget();
  renderBrowse(target, { initial: true, quick: location.hash === '#quick-games' });
  if (target === 'home') {
    for (const logo of document.querySelectorAll('.jaw-intro-logo')) motion.play(logo, 'fade', 'page');
    visuals.emit('intro', home.querySelector('.hero'));
  }
}
