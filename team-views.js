import { hideoutLimits, hideoutPlaces, hideoutTextLimit } from './hideout.js';
import { button, escape, number } from './views.js';

const person = (name) => `<bdi>${escape(name)}</bdi>`;
const withAction = (action, label, variant = 'primary', attributes = '') =>
  button('team-action', label, variant, `data-team-action="${action}" ${attributes}`);

export function teamSetupFields(draft) {
  return `
    <div class="team-setup">
      <label class="field-label">الفريق الأول
        <input class="field" name="team-name-0" value="${escape(draft.teamNames[0])}" maxlength="24" dir="auto">
      </label>
      <label class="field-label">الفريق الثاني
        <input class="field" name="team-name-1" value="${escape(draft.teamNames[1])}" maxlength="24" dir="auto">
      </label>
      <label class="field-label team-turn-picker">عدد الأدوار لكل فريق
        <select class="field" name="team-turns">
          ${[1, 2, 3, 4, 5].map((turns) => `<option value="${turns}" ${turns === draft.teamTurns ? 'selected' : ''}>${number(turns)}</option>`).join('')}
        </select>
      </label>
    </div>
    <p class="small muted">وزّعنا اللاعبين بالتناوب. تقدر تغيّر فريق كل لاعب من القائمة اللي جنب اسمه.</p>
  `;
}

export function teamAssignment(index, assignment) {
  return `<select class="field team-assignment" name="team-${index}" data-team-assignment="${index}" aria-label="فريق اللاعب ${number(index + 1)}">
    <option value="0" ${assignment === 0 ? 'selected' : ''}>فريق ١</option>
    <option value="1" ${assignment === 1 ? 'selected' : ''}>فريق ٢</option>
  </select>`;
}

function scoreboard(team) {
  return `<ul class="team-scoreboard" aria-label="لوحة النقاط">${team.squads.map(({ name, players }, side) => `
    <li class="team-score" data-side="${side}">
      <div><strong>${person(name)}</strong><small>${players.map(person).join('، ')}</small></div>
      <b aria-label="${number(team.scores[side])} نقطة">${number(team.scores[side])}</b>
    </li>`).join('')}</ul>`;
}

function teamClock(team) {
  const waiting = team.endsAt === null;
  const remaining = team.endsAt === null ? team.remaining : team.endsAt - Date.now();
  return `<div class="team-timer">
    <span id="team-clock" class="team-clock" aria-label="الوقت المتبقي بالثواني">${number(Math.ceil(Math.max(0, remaining) / 1000))}</span>
    ${withAction(waiting ? 'resume' : 'pause', waiting ? 'كمّل المؤقّت' : 'إيقاف مؤقت', 'outline button-compact')}
  </div>`;
}

function tabooCard(team) {
  return `<div class="team-prompt taboo-card">
    <small>بطاقة الشارح</small>
    <strong>${escape(team.prompt.word)}</strong>
    <span>ممنوع تقول</span>
    <div class="taboo-words">${team.prompt.ban.map((word) => `<span>${escape(word)}</span>`).join('')}</div>
  </div>`;
}

function copyFields() {
  return `<p class="copy-message" id="team-copy-message" role="status"></p>
    <textarea class="field" id="team-manual-copy" aria-label="بطاقة الشارح للنسخ" readonly hidden></textarea>`;
}

function tabooPlay(team) {
  const disabled = team.endsAt === null ? 'disabled' : '';
  return `
    ${teamClock(team)}
    ${tabooCard(team)}
    <div class="team-meta">
      <span>صح · ${number(team.pointCount)}</span>
      <span>بطاقات تجاوزتوها · ${number(team.skipped)}</span>
    </div>
    <div class="actions">
      ${withAction('correct', 'خمنوها صح', 'primary', disabled)}
      ${withAction('skip', 'تجاوز أو مخالفة', 'outline', disabled)}
      ${button('team-copy', 'انسخ للشارح', 'outline')}
      ${withAction('finish', 'أنه دور الفريق', 'outline')}
    </div>
    ${copyFields()}
  `;
}

function auctionBid(team) {
  const minimum = (team.bid?.amount ?? 0) + 1;
  const canRaise = minimum <= 20;
  return `
    <div class="team-prompt"><strong>${escape(team.prompt)}</strong></div>
    <p class="team-players">الدور على ${person(team.squads[team.bidding].name)}</p>
    <p class="muted">${team.bid ? `آخر مزايدة <strong>${number(team.bid.amount)}</strong> من ${person(team.squads[team.bid.team].name)}.` : 'ابدؤوا المزايدة بالعدد اللي تقدرون تجيبونه.'}</p>
    <div class="actions">
      ${canRaise ? `<form class="team-bid-form" id="team-bid-form">
        <label for="team-bid" class="sr-only">عدد الإجابات في المزايدة</label>
        <select class="field" name="bid" id="team-bid">
          ${Array.from({ length: 21 - minimum }, (_, index) => `<option value="${minimum + index}">${number(minimum + index)}</option>`).join('')}
        </select>
        <button class="button button-primary" type="submit">ثبّت المزايدة</button>
      </form>` : ''}
      ${team.bid ? withAction('challenge', 'أتحدّاكم', canRaise ? 'outline' : 'primary') : ''}
    </div>
  `;
}

function auctionPlay(team) {
  return `
    ${teamClock(team)}
    <div class="team-prompt"><strong>${escape(team.prompt)}</strong></div>
    <p class="team-players">${person(team.squads[team.bid.team].name)} · ${number(team.pointCount)} من ${number(team.bid.amount)}</p>
    <progress class="team-progress" aria-label="الإجابات المقبولة" value="${team.pointCount}" max="${team.bid.amount}"></progress>
    <p class="muted">اقبل كل إجابة صحيحة ومختلفة مرة واحدة.</p>
    <div class="actions">
      ${withAction('correct', 'احسب إجابة صحيحة', 'primary', team.endsAt === null ? 'disabled' : '')}
      ${withAction('finish', 'ما قدروا يكملون', 'outline')}
    </div>
  `;
}

function summary(team) {
  const { result, team: awarded, points } = team.explanation;
  const winner = awarded === null ? '' : person(team.squads[awarded].name);
  const message = {
    taboo: points ? `${winner} جمع ${number(points)} من النقاط.` : 'انتهى الدور بدون نقاط.',
    'auction-won': `${winner} وصل للعدد في الوقت. له نقطة.`,
    'auction-lost': `ما اكتمل العدد. النقطة لـ${winner}.`,
  }[result];
  return `<p class="team-summary">${message}</p><div class="actions">
    ${withAction('next', team.turn + 1 === team.total ? 'أظهر النتيجة' : 'الدور التالي')}
  </div>`;
}

function result(team) {
  const [first, second] = team.scores;
  return {
    title: first === second ? 'تعادل الفريقين' : 'الفوز لـ' + person(team.squads[first > second ? 0 : 1].name),
    body: `<div class="actions">${button('team-replay', 'مباراة ثانية')}${button('teams', 'ألعاب الفرق', 'outline')}</div>`,
  };
}

function hideoutRoster(team, caught) {
  return team.squads[team.turn % 2].players.map((name, index) => `<li>
    <strong>${person(name)}</strong>
    <span><bdi>${escape(team.hideout.spots[index])}</bdi></span>
    ${caught ? `<small>${caught.has(index) ? 'انكشف' : 'ما انكشف'}</small>` : ''}
  </li>`).join('');
}

function hideoutPanel(phase, team, privateVisible) {
  const hiders = team.squads[team.turn % 2];
  const seekers = team.squads[1 - (team.turn % 2)];
  const { place, spots, questions, guesses, pending } = team.hideout;
  const location = `<p class="hideout-location">المكان · ${person(place)}</p>`;
  if (phase === 'team-ready') return {
    title: 'جهّز مكان الاختباء',
    body: `<p><strong>${person(hiders.name)}</strong> يختبئ · <strong>${person(seekers.name)}</strong> يبحث</p>
      <form id="hideout-place-form" class="hideout-form">
        <label class="field-label">اختر مكان جاهز
          <select class="field" name="preset">${hideoutPlaces.map((name, index) =>
            `<option value="${name}" ${index === Math.floor(team.turn / 2) % hideoutPlaces.length ? 'selected' : ''}>${name}</option>`).join('')}</select>
        </label>
        <label class="field-label">أو اكتب مكان من عندك
          <input class="field" name="place" maxlength="${hideoutTextLimit}" placeholder="مثلاً سطح عمارة" dir="auto" autocomplete="off">
        </label>
        <p class="small muted">يا حكم، أعلن المكان للكل قبل ما تشغّل وقت الاختباء.</p>
        <button class="button button-primary" type="submit">ابدأ الاختباء · ٣٠ ثانية</button>
        <p id="hideout-error" class="form-message" role="alert"></p>
      </form>`,
  };
  if (phase === 'hide-spots') {
    const seconds = Math.ceil(Math.max(0, team.endsAt - Date.now()) / 1000);
    return {
      title: 'المخابئ عند الحكم',
      body: `${location}
        <div class="team-timer"><span class="team-clock" id="team-clock" aria-label="ثواني الاختباء المتبقية">${number(seconds)}</span></div>
        <p class="muted" id="hideout-time-hint">${seconds
          ? 'أفراد الفريق يرسلون لك المخابئ بالخاص في تطبيق الروم.'
          : 'انتهى وقت الاختباء. كمّل تسجيل المخابئ اللي وصلتك.'}</p>
        <form id="hideout-spots-form" class="hideout-form">
          <p class="small muted">المخابئ سرية. أوقف مشاركة الشاشة قبل ما تكتبها.</p>
          ${hiders.players.map((name, index) => `<label class="field-label">مخبأ ${person(name)}
            <input class="field" name="spot-${index}" data-hideout-spot="${index}" value="${escape(spots[index])}"
              maxlength="${hideoutTextLimit}" placeholder="مثلاً داخل صندوق الفحم" dir="auto" autocomplete="off" required>
          </label>`).join('')}
          <button class="button button-primary" type="submit">ثبّت المخابئ وابدأ البحث</button>
          <p id="hideout-error" class="form-message" role="alert"></p>
        </form>`,
    };
  }
  const caught = new Set(guesses.filter(({ correct }) => correct).map(({ player }) => player));
  if (phase === 'team-summary') {
    const hidden = spots.length - caught.size;
    return {
      title: 'حصيلة الدور',
      body: `${location}
        <p class="team-summary">${person(seekers.name)} أخذ ${number(caught.size)} · ${person(hiders.name)} أخذ ${number(hidden)}</p>
        <ul class="hideout-roster">${hideoutRoster(team, caught)}</ul>
        <div class="actions">${withAction('next', team.turn + 1 === team.total ? 'أظهر النتيجة' : 'بدّلوا الأدوار')}</div>`,
    };
  }

  const clockClosed = team.endsAt === null && team.remaining === null;
  const clockPaused = team.endsAt === null;
  const waitingFor = pending ? person(hiders.players[pending.player]) : '';
  const questionCount = hideoutLimits.questions - questions;
  return {
    title: `البحث على ${person(seekers.name)}`,
    body: `${location}
      ${clockClosed ? '<p class="muted">انتهى الوقت. احكم على التخمين اللي وصل قبل الصافرة.</p>' : teamClock(team)}
      <div class="team-meta"><span>أسئلة نعم أو لا · ${number(questionCount)}</span>
        <span>محاولات البحث · ${number(hideoutLimits.guesses - guesses.length - Number(Boolean(pending)))}</span>
        <span>انكشفوا · ${number(caught.size)} من ${number(spots.length)}</span></div>
      ${pending ? `<div class="hideout-verdict">
        <p>تخمين ${waitingFor} · ${person(pending.text)}</p>
        <p class="small muted">اقبل الوصف إذا يقصد نفس المخبأ.</p>
        ${privateVisible ? `<p>مخبأ اللاعب الفعلي · ${person(spots[pending.player])}</p>
          ${button('hide-private', 'اخفِ المخبأ', 'quiet button-compact')}`
          : button('reveal', 'اكشف المخبأ للحكم', 'quiet button-compact')}
        <div class="actions">
          ${withAction('hide-correct', 'لقطناه!')}
          ${withAction('hide-wrong', 'المخبأ غلط', 'outline')}
        </div>
      </div>` : privateVisible ? `<div class="hideout-verdict">
        <p class="small muted">للحكم فقط · أوقف مشاركة الشاشة قبل الكشف</p>
        <ul class="hideout-roster">${hideoutRoster(team)}</ul>
        ${button('hide-private', 'اخفِ المخابئ وارجع للبحث', 'outline button-compact')}
      </div>` : `<form id="hideout-guess-form" class="hideout-form">
        <label class="field-label">مين يدورون عليه؟
          <select class="field" name="player" required>
            <option value="">اختر لاعب</option>
            ${hiders.players.map((name, index) => caught.has(index) ? '' :
              `<option value="${index}">${escape(name)}</option>`).join('')}
          </select>
        </label>
        <label class="field-label">وين يتوقعون اختبأ؟
          <input class="field" name="guess" maxlength="${hideoutTextLimit}" dir="auto" autocomplete="off" required>
        </label>
        <button class="button button-primary" type="submit" ${clockPaused ? 'disabled' : ''}>سجّل التخمين</button>
        <p id="hideout-error" class="form-message" role="alert"></p>
      </form>
      <div class="actions">
        ${withAction('hide-question', 'احسب سؤال نعم أو لا', 'outline', clockPaused || !questionCount ? 'disabled' : '')}
        ${button('reveal', 'مخابئ الحكم', 'quiet')}
        ${withAction('finish', 'أنه البحث', 'quiet')}
      </div>`}
      ${guesses.length && !pending ? `<p class="small muted">آخر تخمين · ${guesses.at(-1).correct ? 'لقطناه!' : 'المخبأ غلط'}</p>` : ''}`,
  };
}

export function teamRoundPanel({ kind, phase, team }, { privateVisible = false } = {}) {
  const active = team.squads[team.turn % 2];
  const rotation = Math.floor(team.turn / 2);
  const speaker = active.players[rotation % active.players.length];
  let title;
  let body;
  if (kind === 'hideout' && phase !== 'team-result') {
    ({ title, body } = hideoutPanel(phase, team, privateVisible));
  } else if (phase === 'team-ready') {
    title = 'الدور على ' + person(active.name);
    const how = kind === 'taboo' ? `الشارح ${person(speaker)}. خلّ البطاقة بين المدير والشارح.` :
      'هذا الفريق يبدأ المزايدة.';
    const prepare = kind === 'taboo' ? `<details class="rules team-prepare">
      <summary>جهّز البطاقة قبل ما يبدأ الوقت</summary>
      ${tabooCard(team)}
      ${button('team-copy', 'انسخ للشارح', 'outline button-compact')}
      ${copyFields()}
    </details>` : '';
    body = `<p class="team-players">${how}</p>${prepare}<div class="actions">${withAction('start',
      kind === 'taboo' ? 'ابدأ ٤٥ ثانية' : 'افتح المزاد')}</div>`;
  } else if (phase === 'team-summary') {
    title = 'حصيلة الدور';
    body = summary(team);
  } else if (phase === 'team-result') {
    ({ title, body } = result(team));
  } else if (phase === 'team-bid') {
    title = 'المزايدة مفتوحة';
    body = auctionBid(team);
  } else {
    title = kind === 'taboo' ? 'يشرح ' + person(speaker) : 'التحدّي بدأ';
    body = kind === 'taboo' ? tabooPlay(team) : auctionPlay(team);
  }
  return `<div class="stage-panel team-stage">
    <h1 id="stage-title" tabindex="-1">${title}</h1>
    ${scoreboard(team)}
    ${phase === 'team-result' ? '' : `<p class="team-step">الدور ${number(team.turn + 1)} من ${number(team.total)}</p>`}
    ${body}
  </div>`;
}
