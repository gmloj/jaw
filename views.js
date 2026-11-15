import { choiceCategories, choiceDurations, choiceLevels, choiceSettings, choiceTurns, choiceVoter } from './choice-engine.js';
import { teamAssignment, teamRoundPanel, teamSetupFields } from './team-views.js';
import { teamKinds } from './team-engine.js';
import { evidenceCases } from './party-content.js';
import { evidenceClueLimit, reverseQuestionLimit, knowGuessers, anonymousQuestionLimit, discussionDurations, maxPlayers, nightTurn, playerCard, questionTurn, clockRemaining, currentPlayer, voteResult } from './engine.js';
import { difficulties, games, roles } from './content.js';

const formatter = new Intl.NumberFormat('ar-SA');
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const number = (value) => formatter.format(value);
export const defaultPlayerName = (index) => 'لاعب ' + number(index + 1);
export const escape = (value) => String(value).replace(/[&<>"']/g, (character) => entities[character]);
const playerName = (session, id) => session.players.find((player) => player.id === id)?.name ?? '';
const name = (session, id) => '<bdi>' + escape(playerName(session, id)) + '</bdi>';
const timeGames = ['outsider', 'mafia', 'court', 'liar'];
const choiceLabels = ['الخيار الأول', 'الخيار الثاني'];
const mark = (kind) => `<img class="game-mark" src="./assets/${games[kind].image}" alt="" width="40" height="40">`;
const playIcon = '<svg class="icon" aria-hidden="true"><use href="#icon-play"/></svg>';

export function button(action, text, variant = 'primary', attributes = '') {
  return `<button class="button button-${variant}" type="button" data-action="${action}" ${attributes}>${text}</button>`;
}

function submit(text) {
  return `<button class="button button-primary" type="submit">${text}</button>`;
}

function choiceGroup(name, legend, values, selected) {
  return `<fieldset class="choice-field"><legend>${legend}</legend>
    <div class="choice-grid">${values.map(([value, label, detail]) => `
      <label class="choice">
        <input type="radio" name="${name}" value="${value}" ${value === selected ? 'checked' : ''}>
        <span><strong>${label}</strong>${detail ? '<small>' + detail + '</small>' : ''}</span>
      </label>`).join('')}</div>
  </fieldset>`;
}

export function nameFields(draft, start = 0) {
  return Array.from({ length: draft.count - start }, (_, index) => {
    const i = index + start;
    const field = `<label class="name-field"><span>${number(i + 1).padStart(2, '٠')}</span>
      <input class="field" name="player-${i}" data-player="${i}" maxlength="24" dir="auto" autocomplete="off" enterkeyhint="next"
             placeholder="${defaultPlayerName(i)}" aria-label="اسم اللاعب ${number(i + 1)}"
             value="${escape(draft.names[i] ?? '')}">
    </label>`;
    return draft.assignments ? `<div class="team-player-field">${field}${teamAssignment(i, draft.assignments[i] ?? i % 2)}</div>` : field;
  }).join('');
}

export function gameRules(kind) {
  return `<ol class="rules-list">${games[kind].rules.map((rule) => '<li>' + escape(rule) + '</li>').join('')}</ol>`;
}

function choiceCategoryOptions(selected, includeBlack = true) {
  return [['mixed', 'مختلط'], ...Object.entries(choiceCategories)]
    .filter(([id]) => id !== 'black' || includeBlack)
    .map(([id, title]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${title}</option>`).join('');
}

function choiceSetupFields(draft) {
  const settings = choiceSettings(draft);
  return `<fieldset class="choice-field choice-settings">
    <legend>إعدادات التحدّي</legend>
    <label class="field-label">القسم
      <select class="field" name="category">${choiceCategoryOptions(settings.category)}</select>
    </label>
    <label class="field-label">الحد الأعلى للجرأة
      <select class="field" name="boldness">${choiceLevels.map((label, index) =>
        `<option value="${index + 1}" ${index + 1 === settings.boldness ? 'selected' : ''}>${label}</option>`).join('')}</select>
    </label>
    <label class="field-label">عدد الجولات
      <select class="field" name="turns">${choiceTurns.map((value) =>
        `<option value="${value}" ${value === settings.turns ? 'selected' : ''}>${number(value)}</option>`).join('')}</select>
    </label>
    <label class="field-label">مؤقّت الإجابة
      <select class="field" name="duration">${choiceDurations.map((value) =>
        `<option value="${value}" ${value === settings.duration ? 'selected' : ''}>${value ? number(value) + ' ثانية' : 'بدون مؤقّت'}</option>`).join('')}</select>
    </label>
    <p class="small muted">دور واحد لكل لاعب في الجولة. المستوى الأسود يفتح أقوى الأسئلة في المختلط.</p>
  </fieldset>`;
}

export function setupView(draft, canResume) {
  const game = games[draft.kind];
  const hasTimer = timeGames.includes(draft.kind);
  const countOptions = Array.from({ length: maxPlayers - game.min + 1 }, (_, index) => game.min + index);
  return `
    <form id="setup-form" data-kind="${draft.kind}" class="setup-form">
      <div class="setup-game">${mark(draft.kind)}<div><strong>${game.title}</strong><p>${game.blurb}</p></div></div>
      <div class="setup-tutorial">${button('tutorial', 'شرح اللعبة', 'outline button-compact', `data-kind="${draft.kind}"`)}</div>
      <details class="rules"><summary>كيف تلعبون؟</summary>${gameRules(draft.kind)}</details>
      <div class="setup-count">
        <label class="field-label" for="player-count">عدد اللاعبين</label>
        <div class="count-control">
          ${button('count-down', '−', 'outline button-step', 'aria-label="إنقاص عدد اللاعبين"')}
          <select class="field count-picker" name="count" id="player-count">
            ${countOptions.map((value) => `<option value="${value}" ${value === draft.count ? 'selected' : ''}>${number(value)}</option>`).join('')}
          </select>
          ${button('count-up', '+', 'outline button-step', 'aria-label="زيادة عدد اللاعبين"')}
        </div>
      </div>
      ${draft.assignments ? teamSetupFields(draft) : ''}
      <div class="field-label">أسماء اللاعبين</div>
      <div id="player-fields" class="name-grid">${nameFields(draft)}</div>
      <p class="small muted">الأسماء مرقّمة تلقائيًا، وتقدر تكتب أسماءكم إذا حبيت.</p>
      ${game.hostOnly ? '' : choiceGroup('mode', 'طريقة اللعب', [
        ['together', 'جهاز واحد', 'مرّر الجوال بين اللاعبين'],
        ['remote', 'روم صوتي', 'أرسل البطاقات بالخاص'],
      ], draft.mode)}
      ${draft.kind === 'outsider' ? choiceGroup('difficulty', 'مستوى الكلمات', Object.entries(difficulties), draft.difficulty) : ''}
      ${draft.kind === 'choice' ? choiceSetupFields(draft) : ''}
      ${hasTimer ? `<label class="field-label timer-picker">${draft.kind === 'court' ? 'مؤقّت المرافعات' : 'مؤقّت النقاش'}
        <select class="field" name="duration">${discussionDurations.map((value) =>
          `<option value="${value}" ${value === draft.duration ? 'selected' : ''}>${value ? number(value) + ' ثانية' : 'بدون مؤقّت'}</option>`).join('')}</select>
      </label>` : ''}
      <p class="form-message" id="setup-error" role="alert"></p>
      <div class="setup-actions">
        ${submit(playIcon + (draft.kind === 'choice' ? ' ابدأ التحدي' : ' ابدأ الجولة'))}
        ${canResume ? button('close', 'ارجع للجولة', 'outline') : ''}
      </div>
    </form>`;
}

function step(label, current, total) {
  return `<div class="step">
    <span>${label}</span><span>${number(current)} من ${number(total)}</span>
  </div>
  <div class="progress" role="progressbar" aria-label="${label}" aria-valuenow="${current}" aria-valuemin="0" aria-valuemax="${total}">
    <span style="--progress:${current / total}"></span>
  </div>`;
}

function panel(title, body, variant = '') {
  return `<div class="stage-panel ${variant}">
    <h1 id="stage-title" tabindex="-1">${title}</h1>${body}
  </div>`;
}

function privateCopy() {
  return '<p class="copy-message" id="copy-message" aria-live="polite"></p><textarea class="field" id="manual-copy" aria-label="نص الرسالة الخاصة" readonly hidden></textarea>';
}

function renderCards(session, visible) {
  const { round, mode } = session;
  const player = currentPlayer(session);
  const isRemote = mode === 'remote';
  const last = round.index === round.order.length - 1;
  const progress = step('توزيع البطاقات', round.index + 1, round.order.length);
  const nextLabel = round.kind === 'mafia' && !isRemote ? 'أخفِ البطاقة وسلّم الجوال للراوي' : 'أخفِ البطاقة وابدأ الجولة';
  const hideLabel = last ? nextLabel : isRemote ? 'أخفِ البطاقة وانتقل للي بعده' : 'أخفِ البطاقة وسلّم الجوال';
  if (!visible) {
    return panel('الدور على ' + name(session, player.id), `
      ${progress}
      <p>${isRemote ? 'افتح البطاقة وانسخها عشان ترسلها لصاحبها بالخاص.' : 'سلّم الجوال لصاحب البطاقة وخله يفتحها لحاله.'}</p>
      <div class="card-back" data-gesture="hold">${mark(round.kind)}</div>
      <div class="actions">${button('reveal', isRemote ? 'افتح البطاقة' : 'اعرض بطاقتي')}</div>
    `, 'stage-center');
  }
  const card = playerCard(session);
  return panel('بطاقة ' + name(session, player.id), `
    ${progress}
    <div class="secret-card">
      <span>${round.kind === 'outsider' ? 'كلمتك هي' : round.kind === 'liar' ? 'سؤالك السرّي' : 'دورك السرّي'}</span>
      <h2>${escape(card.title)}</h2>
      <p>${escape(card.detail)}</p>
      ${card.extra ? '<p>' + escape(card.extra) + '</p>' : ''}
    </div>
    <div class="actions">
      ${isRemote ? button('copy-card', 'انسخ البطاقة', 'outline') : ''}
      ${button('advance-card', hideLabel)}
    </div>
    ${isRemote ? privateCopy() : ''}
  `, 'stage-center stage-deal');
}

function forbidden(words) {
  return `<div class="forbidden-box">
    <h2>ممنوع تقولون</h2>
    <ul>${words.map((word) => '<li>' + escape(word) + '</li>').join('')}</ul>
  </div>`;
}

function renderQuestions(session) {
  const turn = questionTurn(session);
  return panel('جولة الأسئلة', `
    ${step('السؤال', turn.index + 1, turn.total)}
    <div class="prompt-box"><span>${name(session, turn.from)}</span> يسأل <span>${name(session, turn.to)}</span></div>
    <p>اسأله عن كلمته بطريقة غير مباشرة. خله يجاوب بتلميح قصير.</p>
    ${forbidden(session.round.pair[2])}
    <div class="actions">
      ${button('question-next', turn.index + 1 === turn.total ? 'انتقل للنقاش' : 'السؤال التالي')}
      ${turn.index + 1 < turn.total ? button('discussion', 'انتقل للنقاش', 'outline') : ''}
    </div>
  `, 'stage-center');
}

function clockView(session, large = false) {
  const { round } = session;
  if (!round.clock) return '';
  if (!round.settings.duration && !large) return '';
  const value = number(Math.ceil(clockRemaining(session) / 1000));
  return `<div class="clock-row ${large ? 'clock-large' : ''}">
    <div class="clock" id="clock" role="timer" aria-label="الثواني الباقية">${value}</div>
    <div class="clock-copy">
      <p id="clock-hint" role="status"></p>
      ${button('toggle-clock', 'ابدأ المؤقّت', 'outline', 'id="clock-toggle"')}
    </div>
  </div>`;
}

function renderHearing(session) {
  const { round } = session;
  const { judge, prosecutor, defendant } = round.court;
  const phases = [
    ['مرافعة الادّعاء', name(session, prosecutor) + ' يشرح التهمة وأدلته للهيئة.'],
    ['مرافعة الدفاع', name(session, defendant) + ' يردّ على التهمة ويقدّم حجّته.'],
    ['مداولة المحكمة', name(session, judge) + ' يفتح النقاش لهيئة المحكمة قبل التصويت.'],
  ];
  const [title, description] = phases[round.index];
  return panel(title, `
    ${step('جلسة المحكمة', round.index + 1, phases.length)}
    <div class="prompt-box">${escape(round.prompt)}</div>
    <p>${description}</p>
    ${clockView(session)}
    <div class="actions">
      ${round.index === 2 ? button('begin-vote', 'صوّتوا على الحكم') : button('court-next', round.index === 0 ? 'أعطِ الدفاع دوره' : 'ابدأ المداولة')}
    </div>
  `, 'stage-center stage-court');
}

function renderAnswers(session) {
  const { round } = session;
  const player = currentPlayer(session);
  return panel('إجابة ' + name(session, player.id), `
    ${step('الإجابات', round.index + 1, round.order.length)}
    <p>قول إجابتك بصوتك وخلك مختصر. احتفظ بالسؤال لنفسك لين يخلص الكل.</p>
    <div class="actions">${button('answer-next', round.index + 1 === round.order.length ? 'اكشف سؤال الأغلبية' : 'اللاعب التالي')}</div>
  `, 'stage-center');
}

function renderDiscussion(session) {
  const { round } = session;
  if (round.kind === 'outsider') {
    return panel('مين برا السالفة؟', `
      <p>قولوا مين شكّيتوا فيه وليش، وبعدها ثبّتوا أصواتكم.</p>
      ${clockView(session)}
      ${forbidden(round.pair[2])}
      <div class="actions">${button('begin-vote', 'ابدأ التصويت')}</div>
    `, 'stage-center');
  }
  if (round.kind === 'liar') {
    return panel('هذا سؤال الأغلبية', `
      <div class="prompt-box">${escape(round.prompt)}</div>
      <p>مين جاوب عن سؤال مختلف؟ ناقشوا الإجابات ثم صوّتوا.</p>
      ${clockView(session)}
      <div class="actions">${button('begin-vote', 'ابدأ التصويت')}</div>
    `, 'stage-center');
  }
  return panel('مين فينا؟', `
    <div class="prompt-box">${escape(round.prompt)}</div>
    <p>كل لاعب يرشّح واحد من الشلّة، والمدير يسجّل الأصوات.</p>
    <div class="actions">${button('begin-vote', 'ابدأ التصويت')}${button('social-next', 'غيّر السؤال', 'outline')}</div>
  `, 'stage-center');
}

function renderVote(session) {
  const { round } = session;
  const voter = currentPlayer(session);
  if (round.kind === 'reverse') return renderReverseVote(session, voter);
  const court = round.kind === 'court' ? round.court : null;
  const candidates = round.runoffIds || round.voters;
  const choices = court
    ? [[court.prosecutor, 'إدانة'], [court.defendant, 'براءة']]
    : candidates.map((id) => [id, name(session, id)]);
  const options = choices.map(([id, label]) => `
    <label class="vote-option"><input type="radio" name="vote" value="${id}" required>${label}</label>
  `).join('');
  const question = court ? 'كيف تحكم؟' : round.kind === 'social' ? escape(round.prompt) : round.runoffIds ? 'تصويت الحسم' : 'مين تختار؟';
  return panel('صوت ' + name(session, voter.id), `
    ${step('التصويت', round.index + 1, round.voters.length)}
    <form class="stage-form" id="vote-form">
      <fieldset class="vote-field">
        <legend>${question}</legend>
        <div class="vote-grid">${options}<label class="vote-option"><input type="radio" name="vote" value="skip" required> بدون تصويت</label></div>
      </fieldset>
      <div class="actions">${submit('ثبّت الصوت')}</div>
    </form>
  `);
}

function renderRunoff(session) {
  return panel('تعادل التصويت', `
    <p>هذولا تساووا بالأصوات. صوّتوا بينهم مرة أخيرة. إذا تكرر التعادل، اللاعب المختلف يفوز.</p>
    <div class="prompt-box">${session.round.runoffIds.map((id) => name(session, id)).join(' · ')}</div>
    <div class="actions">${button('begin-vote', 'ابدأ تصويت الحسم')}</div>
  `, 'stage-center');
}

function aliveList(session) {
  const { order, alive } = session.round;
  return `<div class="alive-box"><h2>اللاعبون · ${number(alive.length)} باقيين</h2><ul>${order.map((id) =>
    `<li class="${alive.includes(id) ? '' : 'out'}">${name(session, id)}${alive.includes(id) ? '' : ' · خرج'}</li>`).join('')}</ul></div>`;
}

const nightPrompts = {
  mafia: ['تصحى المافيا', 'خذ اختيار المافيا بالسر. بعدها ترجع المافيا تغمّض عيونها.'],
  doctor: ['يصحى الطبيب', 'اسأل الطبيب مين يبغى يحمي الليلة، وبعدين خله يغمّض عيونه.'],
  detective: ['يصحى المحقق', 'خذ الاسم اللي المحقق يبغى يتحرّى عنه بالسر.'],
};

function renderNight(session, { privateVisible, nightUnlocked }) {
  const { day } = session.round;
  if (session.mode === 'together' && !nightUnlocked) {
    return panel('سلّم الجوال للراوي', `
      <p>اختيارات الليل سرّية. خلّ الجوال مع الراوي عشان يبدأ الليل.</p>
      <div class="actions">${button('unlock-night', 'أنا الراوي، ابدأ الليل')}</div>
    `, 'stage-center night-panel');
  }
  const visible = privateVisible;
  const turn = nightTurn(session);
  const progress = step('خطوات الليلة', turn.index, turn.total);
  if (turn.role === 'report') {
    const report = turn.report;
    return panel('الليلة ' + number(day), `
      ${progress}
      <p>${report ? 'بلّغ المحقق بنتيجته على الخاص، وبعدها أعلن الصباح.' : 'تم تسجيل اختيارات الليلة. نادي أهل المدينة للصبح.'}</p>
      ${report && visible ? `<div class="secret-card" id="secret-inquiry">
        <span>نتيجة خاصّة للمحقق</span>
        <h2>${name(session, report.id)} ${report.isMafia ? 'من المافيا' : 'من أهل المدينة'}</h2>
        <p>للمحقّق ${name(session, report.recipient)} فقط.</p>
      </div>` : ''}
      <div class="actions">
        ${report ? button(visible ? 'hide-private' : 'reveal', visible ? 'إخفاء نتيجة التحرّي' : 'افتح نتيجة التحرّي', 'outline') : ''}
        ${report && visible && session.mode === 'remote' ? button('copy-card', 'انسخ النتيجة', 'outline') : ''}
        ${button('finish-night', 'أعلن الصباح')}
      </div>
      ${report && visible && session.mode === 'remote' ? privateCopy() : ''}
    `, 'night-panel');
  }
  const [heading, hint] = nightPrompts[turn.role];
  return panel(heading, `
    ${progress}
    <p>${session.mode === 'remote' ? 'خذ اختيار صاحب الدور بالخاص. خَلِّ الروم على وضع الليل لين تخلص الأدوار.' : (turn.index === 1 ? 'يا راوي، خلّ أهل المدينة يغمّضون عيونهم. ' : '') + hint}</p>
    <form class="stage-form" id="night-form" data-role="${turn.role}">
      <label class="field-label" for="night-target">${roles[turn.role].title} · اختيار سري</label>
      <select class="field" name="target" id="night-target" required>
        <option value="">اختر لاعبًا</option>
        ${turn.options.map((id) => `<option value="${id}">${escape(playerName(session, id))}</option>`).join('')}
      </select>
      <div class="actions">
        ${submit('ثبّت الاختيار')}${turn.role === 'mafia' ? '' : button('skip-night', 'تخطّ هذه الخطوة', 'outline')}
      </div>
    </form>
  `, 'night-panel');
}

function renderDay(session, privateVisible) {
  const { round } = session;
  const outcome = round.nightOutcome?.eliminatedId;
  return panel('صباح اليوم ' + number(round.day), `
    <div class="prompt-box">${outcome ? name(session, outcome) + ' خرج من اللعبة.' : 'الكل عدى الليلة بسلام.'}</div>
    <p>الباقين يتناقشون.${round.settings.duration ? ' شغّل المؤقّت إذا تبغى تحدد وقتهم.' : ''}</p>
    ${round.investigation && round.alive.some((id) => round.roles[id] === 'detective')
      ? button('reveal', 'نتيجة التحرّي من الليلة الماضية', 'outline button-compact') : ''}
    ${round.investigation && privateVisible ? `<div class="secret-card" id="secret-inquiry">
      <span>نتيجة خاصّة للمحقق</span>
      <h2>${name(session, round.investigation.id)} ${round.investigation.isMafia ? 'من المافيا' : 'من أهل المدينة'}</h2>
      ${button('hide-private', 'إخفاء نتيجة التحرّي', 'outline')}
    </div>` : ''}
    ${clockView(session)}
    ${aliveList(session)}
    <div class="actions">${button('begin-vote', 'ابدأ تصويت النهار')}</div>
  `, 'day-panel');
}

function renderDayResult(session) {
  const { eliminatedId, tied } = session.round.dayOutcome;
  let summary = 'مرّ النهار بدون تصويت.';
  if (tied) summary = 'تعادل التصويت، والكل باقي.';
  if (eliminatedId) summary = name(session, eliminatedId) + ' خرج بالتصويت.';
  return panel('تصويت النهار', `
    <div class="prompt-box">${summary}</div>
    ${voteList(session)}
    ${aliveList(session)}
    <div class="actions">${button('next-night', 'ابدأ الليلة اللي بعدها')}</div>
  `, 'day-panel');
}

function renderChallenge(session) {
  const { round } = session;
  const player = currentPlayer(session);
  const expired = round.clock.started && clockRemaining(session) === 0;
  return panel('تحدّي ' + name(session, player.id), `
    ${step('اللاعب', round.index + 1, round.order.length)}
    <div class="prompt-box">${escape(round.prompt)}</div>
    ${clockView(session, true)}
    <div class="actions">
      ${button('challenge-pass', 'نجح +١', 'primary', round.clock.started && !expired ? '' : 'disabled')}
      ${button('challenge-fail', expired ? 'انتقل للي بعده' : 'تخطّى الدور', 'outline', round.clock.started ? '' : 'disabled')}
    </div>
  `, 'stage-center');
}

function scoreList(session, entries) {
  return `<ul class="score-list">${entries.map(([id, score]) => `<li>${name(session, id)} <strong>${score}</strong></li>`).join('')}</ul>`;
}

function voteList(session) {
  const { ranked, top } = voteResult(session.round.votes);
  if (!ranked.length) return '<p>ما فيه أصوات مسجّلة.</p>';
  return `<ul class="score-list vote-bars">${ranked.map(([id, score]) =>
    `<li style="--vote-width:${(score / top) * 100}%">${name(session, id)}<strong>${number(score)} من الأصوات</strong></li>`).join('')}</ul>`;
}

function renderResult(session) {
  const { round } = session;
  if (round.kind === 'choice') return renderChoiceResult(session);
  if (round.kind === 'evidence') return renderEvidenceResult(session);
  if (round.kind === 'reverse') return renderReverseResult(session);
  if (round.kind === 'know') return renderKnowResult(session);
  let title, content;
  if (round.kind === 'outsider') {
    title = round.ending === 'group' ? 'الشلّة كشفت السالفة!' : 'برا السالفة فاز!';
    const [word, alternate] = round.pair;
    content = `<div class="prompt-box">برا السالفة كان ${name(session, round.outsiderId)}</div>
      <p>كلمة الشلّة <strong>${escape(word)}</strong>، وكلمته <strong>${escape(alternate)}</strong>.</p>
      ${voteList(session)}`;
  } else if (round.kind === 'mafia') {
    title = round.ending === 'town' ? 'أهل المدينة فازوا!' : 'المافيا فازت!';
    content = scoreList(session, round.order.map((id) => [
      id, roles[round.roles[id]].title + (round.alive.includes(id) ? '' : ' · خرج'),
    ]));
  } else if (round.kind === 'court') {
    const guilty = round.votes.filter((id) => id === round.court.prosecutor).length;
    const clear = round.votes.filter((id) => id === round.court.defendant).length;
    title = round.ending === 'guilty' ? 'الحكم: إدانة' : 'الحكم: براءة';
    content = `<div class="prompt-box">${name(session, round.court.defendant)}</div>
      <p>الإدانة ${number(guilty)} · البراءة ${number(clear)} · الممتنعون ${number(round.voters.length - guilty - clear)}</p>`;
  } else if (round.kind === 'liar') {
    title = round.ending === 'group' ? 'الشلّة كشفت الكذاب!' : 'الكذاب أفلت!';
    content = `<div class="prompt-box">السؤال المختلف كان عند ${name(session, round.liarId)}</div>
      <p>سؤاله: <strong>${escape(round.fakePrompt)}</strong></p>
      <p>سؤال الأغلبية: <strong>${escape(round.prompt)}</strong></p>
      ${voteList(session)}`;
  } else if (round.kind === 'social') {
    const { leaders } = voteResult(round.votes);
    title = leaders.length === 1 ? name(session, leaders[0]) + ' أخذ أكثر الأصوات!' : leaders.length > 1 ? 'تعادل بالأصوات!' : 'خلص التصويت';
    content = `<div class="prompt-box">${escape(round.prompt)}</div>${voteList(session)}`;
  } else {
    title = 'نتيجة التحدّي';
    const scores = round.order.map((id) => [id, round.scores[id]]).sort((a, b) => b[1] - a[1]);
    content = scoreList(session, scores.map(([id, score]) => [id, number(score) + (score ? ' نقطة' : ' نقاط')]));
  }
  const again = round.kind === 'social' ? button('social-next', 'سؤال جديد') : button('restart', 'جولة ثانية');
  return panel(title, `
    ${content}
    <div class="actions">${again}${button('games', 'اختاروا لعبة ثانية', 'outline')}</div>
  `, 'stage-center result-panel');
}

function renderChoice(session) {
  const { round } = session;
  const { question, selected, skips, phase, order, votes, scores, settings, turn, outcome } = round;
  const id = order[round.index];
  const picked = selected !== null;
  const isReview = phase === 'choice-review';
  const isRating = phase === 'choice-rating';
  const finalTurn = turn + 1 === order.length * settings.turns;
  const questionCards = phase === 'picking' || phase === 'choice-explain';
  const earned = votes.reduce((total, points) => total + points, 0);
  return panel('الدور على ' + name(session, id), `
    ${step('الجولة', Math.floor(turn / order.length) + 1, settings.turns)}
    <div class="choice-meta"><span>الدور ${number(round.index + 1)} من ${number(order.length)}</span>
      <span>${number(scores[id])} نقطة</span></div>
    <div class="prompt-box choice-question"><small>لو خيروك؟</small><h2>${escape(question.text)}</h2></div>
    ${questionCards ? `<div class="choice-pairs" role="group" aria-label="الخياران">
      ${question.options.map((answer, index) =>
        `<button class="choice-pair" type="button" data-action="choice-pick" data-option="${index}"
          aria-pressed="${selected === index}" aria-disabled="${picked}" ${picked && selected !== index ? 'tabindex="-1"' : ''}>
          <span class="choice-pair-label"><small>${choiceLabels[index]}</small>${selected === index
            ? '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : ''}</span>
          <strong>${escape(answer)}</strong>
        </button>`).join('')}
    </div>` : picked ? `<div class="choice-answer" data-option="${selected}"><small>${choiceLabels[selected]}</small>
      <strong>${escape(question.options[selected])}</strong></div>` : ''}
    ${phase === 'picking' ? clockView(session) : ''}
    ${isRating ? `<section class="choice-rating" aria-label="تقييم التبرير">
      <h2 id="choice-rating-title" tabindex="-1">قيّم التبرير يا ${name(session, choiceVoter(round))}</h2>
      ${step('تقييم الشلّة', votes.length + 1, order.length - 1)}
      <div class="actions choice-ratings">${['ما أقنعني', 'مقنع', 'صريح وقوي'].map((label, points) =>
        button('choice-rate', label + ' · ' + number(points), 'outline', `data-voter="${choiceVoter(round)}" data-points="${points}"`)).join('')}</div>
    </section>` : ''}
    ${isReview ? `
      <p class="choice-review">${outcome === 'rated' ? `نقاط التبرير <strong>+${number(earned)}</strong>` :
        outcome === 'timeout' ? 'انتهى الوقت. هذا الدور بدون نقاط.' : 'تخطّيتوا الدور. ما انحسبت نقاط.'}</p>
      <form id="choice-next-form" class="choice-next-form">
        ${finalTurn ? '' : `<label class="field-label timer-picker">قسم السؤال التالي
          <select class="field" name="category">${choiceCategoryOptions(settings.category, settings.boldness === 3)}</select>
        </label>`}
        <div class="actions">${submit(finalTurn ? 'اعرض النتائج' : 'السؤال التالي')}</div>
      </form>` : ''}
    ${picked && questionCards ? '<p class="choice-explain-hint">قل للشلّة ليش اخترت كذا.</p>' : ''}
    ${questionCards ? `<div class="actions choice-controls">
      ${picked ? button('choice-rate-start', 'ابدأ التقييم') : ''}
      ${button('choice-skip', 'تخطي · ' + number(skips) + ' باقي', 'outline', skips ? '' : 'disabled')}
    </div>` : ''}
    <details class="rules choice-scores"><summary>لوحة النقاط</summary>
      ${scoreList(session, order.map((player) => [player, number(scores[player])]))}
    </details>
  `, 'stage-center choice-stage');
}

function renderChoiceResult(session) {
  const { order, scores } = session.round;
  const ranked = [...order].sort((a, b) => scores[b] - scores[a]);
  const top = scores[ranked[0]];
  const leaders = ranked.filter((id) => scores[id] === top);
  const title = top === 0 ? 'خلص التحدّي' : leaders.length === 1
    ? name(session, leaders[0]) + ' في المركز الأول'
    : 'تعادل في المركز الأول';
  return panel(title, `
    <ol class="score-list choice-leaderboard">${ranked.map((id, index) => {
      const rank = ranked.findIndex((player) => scores[player] === scores[id]) + 1;
      return `<li${index === 0 && top > 0 ? ' class="choice-first"' : ''}><span>
        <span class="choice-rank" aria-label="المركز ${number(rank)}">${number(rank)}</span> ${name(session, id)}</span>
        <strong>${number(scores[id])} نقطة</strong></li>`;
    }).join('')}</ol>
    <div class="actions">${button('choice-start', 'تحدّي جديد')}${button('games', 'اختاروا لعبة ثانية', 'outline')}</div>
  `, 'stage-center result-panel choice-stage');
}

function renderAnonymous(session) {
  const { questions, activeQuestion } = session.round;
  if (activeQuestion !== null) {
    const card = questions[activeQuestion];
    return panel(`${name(session, card.recipient)}، سؤال المجهول يقول لك…`, `
      <div class="prompt-box anonymous-question" data-gesture="swipe" dir="auto">${escape(card.question)}</div>
      <div class="actions">${button('anonymous-close', 'رجوع للبطاقات', 'outline')}</div>
    `, 'stage-center anonymous-reveal');
  }

  const cards = questions.map(({ recipient, opened }, index) => `
    <li>
      <button class="anonymous-card" type="button" data-action="anonymous-open" data-card="${index}">
        <img src="./assets/${games.anonymous.image}" alt="" width="44" height="44" loading="lazy">
        <span><strong>سؤال لـ ${name(session, recipient)}</strong><small>بطاقة ${number(index + 1)}${opened ? ' · انفتح' : ''}</small></span>
      </button>
    </li>`).join('');

  return panel('سؤال من مجهول', `
    <p>وصلك سؤال في الخاص؟ اختر لمين السؤال واكتب نصّه.</p>
    <form class="stage-form anonymous-form" id="anonymous-form" autocomplete="off">
      <label class="field-label" for="anonymous-recipient">مين موجّه له السؤال؟</label>
      <select class="field" name="recipient" id="anonymous-recipient" required>
        <option value="" selected disabled>اختر من الشلّة</option>
        ${session.players.map((player) => `<option value="${player.id}">${escape(player.name)}</option>`).join('')}
      </select>
      <label class="field-label" for="anonymous-question">اكتب السؤال</label>
      <textarea class="field" name="question" id="anonymous-question" dir="auto"
        maxlength="${anonymousQuestionLimit}" rows="3" required placeholder="وش السؤال اللي وصلك؟"></textarea>
      <p class="form-message" id="anonymous-error" role="alert"></p>
      <div class="actions">${submit('أضف السؤال')}</div>
    </form>
    <section class="anonymous-cards" aria-labelledby="anonymous-cards-title">
      <h2 id="anonymous-cards-title">بطاقات الأسئلة</h2>
      ${cards ? `<ul class="anonymous-grid">${cards}</ul>` : '<p class="muted">أول سؤال تحفظه بيطلع هنا.</p>'}
    </section>
  `);
}

const stageViews = {
  investigating: renderEvidence, composing: renderReverse, knowAnswer: renderKnow, knowGuesses: renderKnow, knowReveal: renderKnow,
  cards: renderCards, questions: renderQuestions, hearing: renderHearing, answers: renderAnswers, discussion: renderDiscussion, voting: renderVote,
  runoff: renderRunoff, picking: renderChoice, 'choice-explain': renderChoice, 'choice-rating': renderChoice,
  'choice-review': renderChoice, anonymous: renderAnonymous, day: renderDay, dayResult: renderDayResult, turn: renderChallenge, result: renderResult,
};

export function roundView(session, { privateVisible = false, nightUnlocked = false } = {}) {
  const { round, mode } = session;
  const teams = teamKinds.includes(round.kind);
  const difficulty = round.kind === 'outsider' ? ' · ' + difficulties[round.settings.difficulty] : '';
  const badge = teams ? 'فريق ضد فريق' : round.kind === 'choice' ? choiceCategories[round.question.category] || 'لو خيروك' :
    games[round.kind].hostOnly ? 'جهاز المدير' : mode === 'remote' ? 'روم صوتي' : 'جهاز واحد';
  return `<div class="round-content" data-kind="${round.kind}" data-phase="${round.phase}">
    <div class="stage-nav">
      <div class="stage-brand">${mark(round.kind)}<div><strong>${games[round.kind].title}</strong>
        <span class="stage-badge">${escape(badge)}${difficulty}</span></div></div>
      <div class="stage-tools">
        ${button('tutorial', 'شرح اللعبة', 'outline button-compact', `data-kind="${round.kind}"`)}
        ${button('help', '<svg class="icon" aria-hidden="true"><use href="#icon-info"/></svg>', 'outline button-icon', 'aria-label="قواعد اللعبة" title="قواعد اللعبة"')}
        ${button(teams ? 'teams' : 'games', ['result', 'team-result'].includes(round.phase) ? (teams ? 'ألعاب الفرق' : 'الألعاب') : 'إنهاء الجولة', 'outline button-compact')}
      </div>
    </div>
    ${roundPanel(session, { privateVisible, nightUnlocked })}
  </div>`;
}

export function roundPanel(session, { privateVisible = false, nightUnlocked = false } = {}) {
  const { round } = session;
  if (teamKinds.includes(round.kind)) return teamRoundPanel(round);
  if (round.phase === 'night') return renderNight(session, { privateVisible, nightUnlocked });
  return stageViews[round.phase](session, privateVisible);
}

function renderEvidence(session) {
  const { round } = session;
  const mystery = evidenceCases[round.caseIndex];
  const canOpen = round.clock.started && round.openedClues.length < evidenceClueLimit;
  const clues = mystery.clues.map((clue, index) => {
    const label = 'الدليل ' + number(index + 1);
    const content = round.openedClues.includes(index)
      ? `<div class="clue-open" id="clue-${index}" tabindex="-1"><small>${label}</small><p>${escape(clue)}</p></div>`
      : button('evidence-clue', 'افتح ' + label, 'outline clue-cover', `data-clue="${index}" ${canOpen ? '' : 'disabled'}`);
    return `<li>${content}</li>`;
  }).join('');
  return panel(escape(mystery.title), `
    <div class="prompt-box">${escape(mystery.scenario)}</div>
    ${clockView(session, true)}
    ${step('الأدلة المفتوحة', round.openedClues.length, evidenceClueLimit)}
    <p class="small muted">${!round.clock.started ? 'اقرؤوا القضية بصوت عالٍ، وبعدها شغّلوا المؤقّت عشان تنفتح الأدلة.' :
      'اختاروا أدلتكم، ولما تتفقون على مشتبه به ثبّتوا تخمينكم قبل نهاية الوقت.'}</p>
    <ol class="clue-grid" aria-label="الأدلة">${clues}</ol>
    <form id="evidence-form" class="stage-form">
      <fieldset class="vote-field" ${round.clock.started ? '' : 'disabled'}>
        <legend>مين تتوقّعون وراء السالفة؟</legend>
        <div class="vote-grid">${mystery.suspects.map((suspect, index) =>
          `<label class="vote-option"><input type="radio" name="suspect" value="${index}" required>${escape(suspect)}</label>`).join('')}</div>
        <div class="actions">${submit('ثبّت التخمين')}</div>
      </fieldset>
    </form>
  `, 'evidence-stage');
}

function renderPartyResult(title, content, nextLabel) {
  return panel(title, `${content}<div class="actions">${button('restart', nextLabel)}</div>`, 'stage-center result-panel');
}

function renderEvidenceResult(session) {
  const { caseIndex, guess } = session.round;
  const mystery = evidenceCases[caseIndex];
  const correct = guess === mystery.answer;
  const title = correct ? 'الشلّة حلّت القضية!' : guess === null ? 'انتهى الوقت' : 'الدليل فاتكم!';
  const verdict = guess === null || correct ? '' : `<p>تخمينكم كان ${escape(mystery.suspects[guess])}.</p>`;
  return renderPartyResult(title, `
    <div class="prompt-box">وراء السالفة كان ${escape(mystery.suspects[mystery.answer])}.</div>
    <p>${escape(mystery.explanation)}</p>${verdict}
  `, 'قضية ثانية');
}

function renderReverse(session) {
  const { round } = session;
  const submitted = new Set(round.entries.map((entry) => entry.author));
  const pending = session.players.filter((player) => !submitted.has(player.id));
  return panel('الجواب جاهز', `
    <div class="prompt-box">${escape(round.prompt)}</div>
    <p>اقرأ الجواب للشلّة. كل واحد يرسل سؤاله لك بالخاص.</p>
    ${step('الأسئلة المسجّلة', round.entries.length, round.order.length)}
    ${pending.length ? `<form class="stage-form party-write" id="reverse-form">
      <label class="field-label" for="reverse-author">صاحب السؤال</label>
      <select id="reverse-author" class="field" name="author" required>
        <option value="" selected disabled>اختر من الشلّة</option>
        ${pending.map((player) => `<option value="${player.id}">${escape(player.name)}</option>`).join('')}
      </select>
      <label class="field-label" for="reverse-text">السؤال اللي ألّفه</label>
      <textarea id="reverse-text" class="field" name="question" rows="2" dir="auto" maxlength="${reverseQuestionLimit}" required></textarea>
      <p class="form-message" id="reverse-error" role="alert"></p>
      <div class="actions">${submit('احفظ السؤال')}</div>
    </form>` : ''}
    ${round.entries.length >= 2 ? `<div class="actions">${button('begin-vote', 'ابدأ التصويت', pending.length ? 'outline' : 'primary')}</div>` :
      '<p class="small muted">سجّل سؤالين على الأقل عشان تبدأ التصويت.</p>'}
  `);
}

function renderReverseVote(session, voter) {
  const { round } = session;
  const options = round.entries.map((entry, index) => entry.author === voter.id ? '' :
    `<label class="vote-option"><input type="radio" name="vote" value="${index}" required>
      <span><strong>سؤال ${number(index + 1)}</strong><span dir="auto">${escape(entry.text)}</span></span></label>`).join('');
  return panel('صوّت يا ' + name(session, voter.id), `
    ${step('التصويت', round.index + 1, round.voters.length)}
    <div class="prompt-box">${escape(round.prompt)}</div>
    <form class="stage-form" id="vote-form">
      <fieldset class="vote-field">
        <legend>أي سؤال راكب على الجواب أكثر؟</legend>
        <div class="vote-grid reverse-votes">${options}
          <label class="vote-option"><input type="radio" name="vote" value="skip" required> بدون تصويت</label>
        </div>
      </fieldset>
      <div class="actions">${submit('ثبّت الصوت')}</div>
    </form>
  `);
}

function renderReverseResult(session) {
  const { round } = session;
  const { ranked, leaders } = voteResult(round.votes);
  const counts = new Map(ranked);
  const title = leaders.length === 1 ? name(session, round.entries[leaders[0]].author) + ' فاز بالتصويت' :
    leaders.length > 1 ? 'فوز مشترك' : 'ما فيه أصوات';
  const cards = round.entries.map((entry, index) => ({ ...entry, index, score: counts.get(index) ?? 0 }))
    .sort((a, b) => b.score - a.score).map(({ author, text, index, score }) =>
      `<li><div><strong>سؤال ${number(index + 1)} · ${name(session, author)}</strong><p dir="auto">${escape(text)}</p></div>
        <span class="party-points">${number(score)} ${score === 1 ? 'صوت' : 'أصوات'}</span></li>`).join('');
  return renderPartyResult(title, `
    <div class="prompt-box">${escape(round.prompt)}</div>
    <ul class="score-list party-results">${cards}</ul>
  `, 'جواب جديد');
}

function renderKnow(session) {
  const { round } = session;
  const player = currentPlayer(session);
  const isAnswer = round.phase === 'knowAnswer';
  const isReveal = round.phase === 'knowReveal';
  const guessers = knowGuessers(round);
  const title = isReveal ? 'اختيار ' + name(session, player.id) + ' كان' :
    isAnswer ? 'دور ' + name(session, player.id) : 'تخمين ' + name(session, guessers[round.guesses.length]);
  return panel(title, `
    ${step('أدوار الشلّة', round.index + 1, round.order.length)}
    <div class="prompt-box">${escape(round.prompt.question)}</div>
    ${isReveal ? `
      <p class="know-answer">${escape(round.prompt.options[round.secretAnswer])}</p>
      ${scoreList(session, guessers.map((id, index) => [id,
        round.guesses[index] === round.secretAnswer ? '+١ نقطة' : round.guesses[index] === null ? 'تخطّى' : '٠ نقاط']))}
      <div class="actions">${button('know-next', round.index + 1 === round.order.length ? 'شوفوا النتيجة' : 'الدور اللي بعده')}</div>
    ` : `
      <p>${isAnswer ? 'خلّ صاحب الدور يرسل اختياره لك بالخاص، ثم سجّله.' :
        'وش تتوقّعون إن ' + name(session, player.id) + ' اختار؟'}</p>
      ${isAnswer ? '' : step('التخمينات', round.guesses.length + 1, guessers.length)}
      <div class="choice-pairs" role="group" aria-label="الخياران">${round.prompt.options.map((option, index) =>
        `<button class="choice-pair" type="button" data-action="${isAnswer ? 'know-answer' : 'know-guess'}" data-option="${index}">
          <small>${choiceLabels[index]}</small><strong>${escape(option)}</strong>
        </button>`).join('')}</div>
      ${isAnswer ? '' : `<div class="actions">${button('know-skip', 'تخطّى التخمين', 'outline')}</div>`}
    `}
  `, 'stage-center');
}

function renderKnowResult(session) {
  const { round } = session;
  const scores = round.order.map((id) => [id, round.scores[id]]).sort((a, b) => b[1] - a[1]);
  const [winner, highest] = scores[0];
  const title = highest === 0 ? 'الجولة خلصت' : highest === scores[1][1] ? 'تعادل في الصدارة' : name(session, winner) + ' في الصدارة';
  return renderPartyResult(title, scoreList(session, scores.map(([id, score]) =>
    [id, number(score) + (score === 1 ? ' نقطة' : ' نقاط')])), 'جولة ثانية');
}
