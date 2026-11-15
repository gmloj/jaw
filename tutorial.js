import {
  addAnonymousQuestion, addReverseEntry, advanceAnswer, advanceCard, advanceCourt,
  beginChoiceRating, nextChoicePrompt, rateChoice, beginDiscussion, beginVote, castVote, configureSession, createSession, finishNight,
  nightTurn, openAnonymousQuestion, openEvidenceClue, recordChallenge, recordKnowAnswer,
  recordKnowGuess, recordNightChoice, resolveEvidence, selectChoice, startClock, startGame,
} from './engine.js';
import { games } from './content.js';
import { reduceTeamGame } from './team-engine.js';
import { defaultPlayerName, number, roundPanel } from './views.js';

const action = (name) => '[data-action="' + name + '"]';
const teamAction = (name) => '[data-team-action="' + name + '"]';
const submit = (form) => '#' + form + ' [type="submit"]';
const vote = ['.vote-option', 'اختاروا اسمًا، ثم ثبّتوا الصوت.'];
const voteSubmit = [submit('vote-form'), 'ثبّت صوت اللاعب، وبعدها يجي دور اللي بعده.'];

function dealAll(session) {
  for (const player of session.players) advanceCard(session);
}

function dealSteps(session, show, secretText) {
  show(action('reveal'), 'اضغط هنا لكشف البطاقة لصاحبها.');
  show('.secret-card', secretText, { privateVisible: true });
  show(action('advance-card'), 'أخفِ البطاقة وسلّم الجوال للي بعده.', { privateVisible: true });
  dealAll(session);
}

function votes(session, show) {
  show(...vote);
  show(...voteSubmit);
  const first = session.round.voters[0];
  for (const player of session.round.voters) castVote(session, first);
}

const lessons = {
  outsider(session, show) {
    dealSteps(session, show, 'شوف الكلمة لحالك، وخلك داخل السالفة.');
    show(action('question-next'), 'بعد ما يجاوب اللاعب، انتقل للسؤال التالي.');
    beginDiscussion(session);
    show(action('begin-vote'), 'بعد النقاش، افتحوا التصويت.');
    beginVote(session);
    votes(session, show);
    show('.result-panel h1', 'هنا تعرفون مين كان برا السالفة.');
  },
  mafia(session, show) {
    dealSteps(session, show, 'هنا يظهر دورك. خلّ البطاقة سرّك.');
    show(action('unlock-night'), 'سلّم الجوال للراوي عشان يبدأ الليل.');
    show('#night-target', 'الراوي يسجّل اختيار المافيا هنا.', { nightUnlocked: true });
    show(submit('night-form'), 'ثبّت الاختيار عشان ينتقل الليل للدور التالي.', { nightUnlocked: true });
    const target = nightTurn(session).options[0];
    recordNightChoice(session, 'mafia', target);
    show('#night-target', 'الطبيب يختار لاعب يحميه.', { nightUnlocked: true });
    recordNightChoice(session, 'doctor', target);
    show('#night-target', 'المحقق يختار لاعب يتحرّى عنه.', { nightUnlocked: true });
    recordNightChoice(session, 'detective', nightTurn(session).options[0]);
    show(action('finish-night'), 'بعد تسجيل الأدوار، أعلن الصباح.', { nightUnlocked: true });
    finishNight(session);
    show(action('begin-vote'), 'بعد نقاش النهار، افتح تصويت أهل المدينة.');
    beginVote(session);
    votes(session, show);
    show('h1', 'هنا تشوفون نتيجة تصويت النهار.');
  },
  court(session, show) {
    show('.prompt-box', 'اقرأ القضية على هيئة المحكمة.');
    show(action('toggle-clock'), 'شغّل المؤقّت إذا بدأت المرافعة.');
    show(action('court-next'), 'إذا خلص الادّعاء، أعطِ الدفاع دوره.');
    advanceCourt(session);
    show(action('court-next'), 'بعد الدفاع، افتح المداولة.');
    advanceCourt(session);
    show(action('begin-vote'), 'خلّ الهيئة تصوّت على الحكم.');
    beginVote(session);
    show('.vote-option', 'اختاروا إدانة أو براءة.');
    show(...voteSubmit);
    castVote(session, session.round.court.defendant);
    show('.result-panel h1', 'هنا يطلع حكم المحكمة.');
  },
  liar(session, show) {
    dealSteps(session, show, 'اقرأ سؤالك لحالك. ممكن يكون مختلف عن سؤال الشلّة.');
    show(action('answer-next'), 'بعد ما يقول إجابته، انتقل للي بعده.');
    for (const player of session.players) advanceAnswer(session);
    show('.prompt-box', 'هنا ينكشف سؤال الأغلبية. ناقشوا مين جاوب عن سؤال مختلف.');
    show(action('begin-vote'), 'إذا خلص النقاش، ابدأ التصويت.');
    beginVote(session);
    votes(session, show);
    show('.result-panel h1', 'هنا ينكشف صاحب السؤال المختلف.');
  },
  choice(session, show) {
    show('.choice-pair', 'اضغط على أحد الخيارين، وبعدها قول ليش اخترته.');
    selectChoice(session, 0);
    show(action('choice-rate-start'), 'قول ليش اخترت كذا، وبعدها خلّ الشلّة تقيّم تبريرك.');
    beginChoiceRating(session);
    show(action('choice-rate'), 'سجّل تقييم كل لاعب من صفر إلى نقطتين.');
    rateChoice(session, session.round.order[1], 2);
    show(submit('choice-next-form'), 'بعد ما تشوف نقاط التبرير، اضغط السؤال التالي.');
    nextChoicePrompt(session, () => .42);
    show('.choice-question', 'انتقل الدور للي بعدك تلقائيًا. لكل لاعب دور في الجولة.');
  },
  anonymous(session, show) {
    show('#anonymous-recipient', 'اختر مين موجّه له السؤال.');
    show('#anonymous-question', 'اكتب نص السؤال اللي وصلك بالخاص.');
    show(submit('anonymous-form'), 'احفظ السؤال في بطاقة مقفلة.');
    addAnonymousQuestion(session, session.players[0].id, 'وش أكثر موقف ضحّكك مع الشلّة؟');
    show('.anonymous-card', 'افتح البطاقة وقت ما يجي دور صاحبها.');
    openAnonymousQuestion(session, 0);
    show('.anonymous-question', 'هنا يظهر السؤال واسم اللي يجاوب، واسم المرسل يبقى مخفي.');
    show(action('anonymous-close'), 'ارجع لقائمة البطاقات بعد الإجابة.');
  },
  social(session, show) {
    show('.prompt-box', 'اقرأ السؤال بصوتك للشلّة.');
    show(action('begin-vote'), 'بعد النقاش، خذ ترشيح كل لاعب.');
    beginVote(session);
    votes(session, show);
    show('.result-panel h1', 'هنا يظهر أكثر لاعب ترشّح.');
  },
  challenge(session, show) {
    show('.prompt-box', 'اقرأ التحدّي على اللاعب اللي عليه الدور.');
    show(action('toggle-clock'), 'ابدأ عدّاد الـ٣٠ ثانية بعد القراءة.');
    startClock(session);
    show(action('challenge-pass'), 'إذا نجح قبل الوقت، سجّل له نقطة. وتقدر تتخطّى الدور.');
    recordChallenge(session, true, () => .42);
    show('h1', 'يطلع تحدّي اللاعب اللي بعده.');
  },
  evidence(session, show) {
    show('.prompt-box', 'اقرؤوا تفاصيل القضية قبل التحقيق.');
    show(action('toggle-clock'), 'شغّل المؤقّت عشان تنفتح الأدلة.');
    startClock(session);
    show(action('evidence-clue'), 'افتحوا الدليل اللي تختارونه. لكم ثلاث فتحات.');
    openEvidenceClue(session, 0);
    show('label.vote-option', 'إذا اتفقتوا، اختاروا المشتبه به.');
    show(submit('evidence-form'), 'ثبّتوا التخمين قبل نهاية الوقت.');
    resolveEvidence(session, 0);
    show('.result-panel h1', 'هنا يظهر حلّ القضية.');
  },
  reverse(session, show) {
    show('.prompt-box', 'اقرأ الجواب الجاهز للشلّة.');
    show('#reverse-author', 'اختَر صاحب السؤال اللي وصلك.');
    show('#reverse-text', 'اكتب السؤال اللي ألّفه.');
    show(submit('reverse-form'), 'احفظ السؤال. تحتاج سؤالين على الأقل للتصويت.');
    addReverseEntry(session, session.players[0].id, 'وش تقول إذا دخلت الروم بالغلط؟');
    addReverseEntry(session, session.players[1].id, 'وش تقول إذا تأخرت على الشلّة؟');
    show(action('begin-vote'), 'افتح التصويت على أنسب سؤال للجواب.');
    beginVote(session);
    show('.vote-option', 'كل لاعب يصوّت لسؤال من أسئلة الشلّة.');
    show(...voteSubmit);
  },
  know(session, show) {
    show(action('know-answer'), 'صاحب الدور يختار إجابته بالسر.');
    recordKnowAnswer(session, 0);
    show(action('know-guess'), 'اللي بعده يتوقّع وش اختار صاحب الدور.');
    recordKnowGuess(session, 0);
    show(action('know-next'), 'بعد كشف الإجابة والنقاط، سلّم الدور للي بعده.');
  },
  taboo(session, show) {
    show('.team-prepare summary', 'جهّز البطاقة بسرية قبل تشغيل الوقت.');
    show(teamAction('start'), 'ابدأ الـ٤٥ ثانية عشان يبدأ الشارح.');
    session.round = reduceTeamGame(session.round, 'start');
    show('.taboo-words', 'الشارح يلمّح للكلمة ويتجنّب الكلمات هذي.');
    show(teamAction('correct'), 'إذا خمّن الفريق صح، سجّل نقطة هنا.');
    show(teamAction('skip'), 'إذا قال كلمة ممنوعة، انتقل للبطاقة اللي بعدها.');
    show(teamAction('finish'), 'أنه الدور إذا خلص الوقت.');
    session.round = reduceTeamGame(session.round, 'correct');
    session.round = reduceTeamGame(session.round, 'finish');
    show(teamAction('next'), 'سلّم الدور للفريق الثاني بعد مراجعة النقاط.');
  },
  hideout(session, show) {
    show('#hideout-place-form', 'أعلن المكان العام للفريقين، ثم ابدأ وقت الاختباء.');
    session.round = reduceTeamGame(session.round, 'hide-start', 'استراحة');
    show('#hideout-spots-form', 'كل لاعب يرسل مخبأه لك بالخاص. سجّل المخابئ وثبّتها.');
    session.round = reduceTeamGame(session.round, 'hide-lock', ['داخل صندوق الفحم', 'وراء الستارة']);
    show(teamAction('hide-question'), 'للباحثين سؤالان إجابتهما نعم أو لا. احسب كل سؤال هنا.');
    show('#hideout-guess-form', 'عندكم ثلاث محاولات. سجّل اسم اللاعب والمخبأ اللي خمّنوه.');
    session.round = reduceTeamGame(session.round, 'hide-guess', { player: 0, text: 'صندوق الفحم' });
    show(action('reveal'), 'شوف المخبأ الفعلي بسرية إذا احتجت تتأكد من التخمين.');
    show(teamAction('hide-correct'), 'إذا كان نفس المخبأ سجّلها صح. إذا غلط تروح عليهم المحاولة.');
    session.round = reduceTeamGame(session.round, 'hide-verdict', true);
    session.round = reduceTeamGame(session.round, 'finish');
    show(teamAction('next'), 'بعد كشف المخابئ وحساب النقاط، الفريقان يبدّلون الأدوار.');
  },
  auction(session, show) {
    show(teamAction('start'), 'افتح المزاد للفريقين.');
    session.round = reduceTeamGame(session.round, 'start');
    show('#team-bid', 'اختاروا كم إجابة تقدرون تعطون.');
    show(submit('team-bid-form'), 'ثبّتوا المزايدة. بعدها الدور على الفريق الثاني.');
    session.round = reduceTeamGame(session.round, 'bid', 2);
    show(teamAction('challenge'), 'إذا ما تبغون ترفعون العدد، تحدّوا الفريق الثاني.');
    session.round = reduceTeamGame(session.round, 'challenge');
    show(teamAction('correct'), 'احسب كل إجابة صحيحة ومختلفة مرة واحدة.');
    session.round = reduceTeamGame(session.round, 'correct');
    session.round = reduceTeamGame(session.round, 'correct');
    show(teamAction('next'), 'شوف مين أخذ النقطة ثم انتقل للدور التالي.');
  },
};

export function tutorialSteps(kind) {
  const game = games[kind];
  if (!game || !Object.hasOwn(lessons, kind)) return [];
  const session = createSession();
  const names = Array.from({ length: game.min }, (_, index) => defaultPlayerName(index));
  configureSession(session, names, 'together');
  startGame(session, kind, () => .42, {
    duration: 60,
    names: ['فريق البنفسجي', 'فريق الذهبي'],
    assignments: names.map((_, index) => index % 2),
    turns: 1,
  });
  const steps = [];
  lessons[kind](session, (target, hint, options) => {
    steps.push({ target, hint, markup: roundPanel(session, options) });
  });
  return steps;
}

export function createTutorial(dialog, { motion }) {
  let steps = [];
  let index = 0;
  const panel = dialog.querySelector('.tutorial-preview');
  const progress = dialog.querySelector('.tutorial-progress');
  const hint = dialog.querySelector('.tutorial-hint');
  const previous = dialog.querySelector('[data-tutorial-command="previous"]');
  const next = dialog.querySelector('[data-tutorial-command="next"]');

  function render() {
    const step = steps[index];
    panel.innerHTML = step.markup;
    // Training controls never bubble into the live-round handlers.
    for (const element of panel.querySelectorAll('[data-gesture]')) element.removeAttribute('data-gesture');
    for (const element of panel.querySelectorAll('button, input, select, textarea, summary, a')) {
      element.tabIndex = -1;
    }
    for (const target of panel.querySelectorAll(step.target)) {
      target.classList.add('tutorial-focus');
    }
    // The live round may contain the same form IDs behind the dialog.
    for (const element of panel.querySelectorAll('[id]')) {
      element.id = 'training-' + element.id;
    }
    for (const element of panel.querySelectorAll('[for], [aria-labelledby], [aria-describedby]')) {
      for (const attribute of ['for', 'aria-labelledby', 'aria-describedby']) {
        const value = element.getAttribute(attribute);
        if (value) element.setAttribute(attribute, value.split(/\s+/).map((id) => 'training-' + id).join(' '));
      }
    }
    panel.scrollTop = 0;
    panel.querySelector('.tutorial-focus')?.scrollIntoView({ block: 'center', behavior: 'instant' });
    progress.textContent = number(index + 1) + ' من ' + number(steps.length);
    hint.textContent = step.hint;
    previous.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? 'تم' : 'التالي';
    motion.play(hint, 'rise', 'ui');
  }

  function advance() {
    if (index + 1 === steps.length) {
      dialog.close();
      return;
    }
    index++;
    render();
  }

  dialog.addEventListener('click', (event) => {
    const command = event.target.closest('[data-tutorial-command]')?.dataset.tutorialCommand;
    if (!command && !panel.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (command === 'close') dialog.close();
    if (command === 'next' || event.target.closest('.tutorial-focus')) {
      if (panel.contains(event.target)) next.focus({ preventScroll: true });
      advance();
    }
    if (command === 'previous' && index > 0) {
      index--;
      render();
      if (previous.disabled) next.focus();
    }
  });
  dialog.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    motion.clear(dialog);
    steps = [];
    panel.replaceChildren();
  });

  return {
    open(game, beforeOpen) {
      if (dialog.open) return;
      steps = tutorialSteps(game);
      if (!steps.length) return;
      index = 0;
      dialog.querySelector('#tutorial-title').textContent = 'شرح ' + games[game].title;
      beforeOpen();
      dialog.showModal();
      render();
      next.focus({ preventScroll: true });
    },
  };
}
