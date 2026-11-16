const token = location.hash.slice(1);
const find = (name) => document.getElementById('audience-' + name);
const number = new Intl.NumberFormat('ar-SA');
let state = null;
let lastUpdate = 0;
let lastDisplay;

function updateText(field, text) {
  const element = find(field);
  if (element.textContent !== text) element.textContent = text;
  element.hidden = !text;
}

function render() {
  updateText('game', state?.game || 'جوّ | شاشة اللاعبين');
  updateText('title', state?.title || 'بانتظار مدير الروم');
  updateText('status', state?.status ?? (state ? '' : 'افتح الشاشة من جولة المافيا أو وين اختبوا؟'));
  updateText('place', state?.place ? 'المكان · ' + state.place : '');
  updateText('counts', state?.guesses !== undefined ?
    `أسئلة نعم أو لا · ${number.format(state.questions)} | محاولات البحث · ${number.format(state.guesses)} | انكشفوا · ${number.format(state.caught)}` : '');
  const list = find('list');
  const rows = state?.teams?.map(({ name, score }) => `${name} · ${number.format(score)} نقطة`) ?? state?.alive ?? [];
  list.replaceChildren(...rows.map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  list.hidden = !rows.length;
  tick();
}

function tick() {
  const timer = state?.timer;
  const milliseconds = timer && (timer.endsAt === null ? timer.remaining : Math.max(0, timer.endsAt - Date.now()));
  updateText('clock', milliseconds == null ? '' : number.format(Math.ceil(milliseconds / 1000)));
}

if (/^[0-9a-f]{32}$/.test(token) && 'BroadcastChannel' in window) {
  const channel = new BroadcastChannel('jaw-audience-' + token);
  channel.onmessage = ({ data }) => {
    if (data?.type !== 'display') return;
    lastUpdate = Date.now();
    const nextDisplay = JSON.stringify(data.state);
    if (nextDisplay === lastDisplay) return;
    lastDisplay = nextDisplay;
    state = data.state;
    render();
  };
  channel.postMessage({ type: 'ready' });
  window.setInterval(() => {
    if (state && Date.now() - lastUpdate > 12000) {
      state = null;
      lastDisplay = undefined;
      render();
    } else {
      tick();
    }
    channel.postMessage({ type: 'ready' });
  }, 1000);
}
