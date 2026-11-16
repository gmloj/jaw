import { hideoutLimits } from './hideout.js';

const number = new Intl.NumberFormat('ar-SA');

export function audienceState({ round, players }) {
  if (round?.kind === 'hideout') {
    const { phase, team } = round;
    const side = team.turn % 2;
    const { place, questions, guesses, pending } = team.hideout;
    const [first, second] = team.scores;
    const result = first === second ? 'تعادل الفريقين' : 'الفوز لـ ' + team.squads[Number(second > first)].name;
    return {
      game: 'وين اختبوا؟',
      title: {
        'team-ready': 'الحكم يجهّز المكان',
        'hide-spots': team.squads[side].name + ' يختبئ',
        'team-play': 'البحث على ' + team.squads[1 - side].name,
        'team-summary': 'حصيلة الدور',
        'team-result': result,
      }[phase],
      place,
      timer: phase === 'hide-spots' || phase === 'team-play' ? { endsAt: team.endsAt, remaining: team.remaining } : null,
      teams: team.squads.map((squad, index) => ({ name: squad.name, score: team.scores[index] })),
      ...(phase === 'team-play' ? {
        questions: hideoutLimits.questions - questions,
        guesses: hideoutLimits.guesses - guesses.length - Number(Boolean(pending)),
        caught: guesses.filter((guess) => guess.correct).length,
      } : {}),
    };
  }
  if (round?.kind !== 'mafia') return null;
  const { phase, day, clock, alive, ending } = round;
  const labels = {
    cards: 'توزيع الأدوار', night: 'الليلة ' + number.format(day), day: 'صباح اليوم ' + number.format(day),
    voting: 'تصويت النهار', dayResult: 'حصيلة التصويت', result: ending === 'town' ? 'أهل المدينة فازوا!' : 'المافيا فازت!',
  };
  const eliminated = phase === 'day' ? round.nightOutcome?.eliminatedId :
    phase === 'dayResult' ? round.dayOutcome?.eliminatedId : null;
  const publicRound = ['day', 'voting', 'dayResult', 'result'].includes(phase);
  return {
    game: 'المافيا', title: labels[phase],
    status: phase === 'night' ? 'المدينة نائمة' : phase === 'cards' ? 'انتظر بطاقتك على الخاص' :
      eliminated ? (players.find(({ id }) => id === eliminated)?.name ?? '') + ' خرج من اللعبة' :
        phase === 'day' ? 'الكل عدى الليلة بسلام' : '',
    alive: publicRound ? players.filter(({ id }) => alive.includes(id)).map(({ name }) => name) : [],
    timer: phase === 'day' && clock?.remaining ? { endsAt: clock.endsAt, remaining: clock.remaining } : null,
  };
}
