import { games } from './content.js';
import { teamKinds } from './team-engine.js';
import { number } from './views.js';

const collections = [
  { id: 'conversation', title: 'ابدأوا بسالفة', kinds: ['choice', 'social', 'know', 'anonymous'] },
  { id: 'mystery', title: 'خلّك شاك', kinds: ['outsider', 'mafia', 'liar', 'evidence'] },
  { id: 'teams', title: 'تحدّي الفريقين', kinds: teamKinds },
  { id: 'microphone', title: 'المايك لك', kinds: ['court', 'reverse', 'challenge'] },
];
const voiceGames = ['hideout', 'outsider', 'mafia', 'court', 'liar', 'anonymous', 'social', 'challenge', 'evidence'];
const shortcuts = {
  pair: { label: 'لشخصين', icon: 'people', kinds: Object.keys(games).filter((kind) => games[kind].min === 2) },
  teams: { label: 'فرق', icon: 'layers', kinds: teamKinds },
  voice: { label: 'روم صوتي', icon: 'headphones', kinds: voiceGames },
  quick: { label: 'جولة سريعة', icon: 'bolt', kinds: ['challenge', 'choice', 'social', 'know', 'evidence', 'anonymous', 'reverse'] },
};

const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const collectionLink = (id, label) => `<button class="discovery-text-button" type="button" data-action="home-jump" data-target="${id}">${label}</button>`;

function tile(kind) {
  const game = games[kind];
  return `<li><button type="button" class="discovery-tile" data-action="setup" data-kind="${kind}">
    <img src="./assets/${game.image}" alt="" loading="lazy" decoding="async" width="288" height="288">
    <span><strong>${game.title}</strong><small>${number(game.min)} لاعبين فأكثر</small></span>
  </button></li>`;
}

function shelf({ id, title, kinds }) {
  return `<section class="discovery-shelf" aria-labelledby="shelf-${id}">
    <div class="discovery-heading"><h2 id="shelf-${id}" tabindex="-1">${title}</h2></div>
    <ul class="discovery-tiles">${kinds.map(tile).join('')}</ul>
  </section>`;
}

export function renderDiscovery(container) {
  const [conversation, mystery, teams, microphone] = collections;
  container.innerHTML = `
    <nav class="discovery-shortcuts" aria-label="اختصارات الألعاب">
      ${Object.entries(shortcuts).map(([id, shortcut]) => `<button type="button" data-action="home-search" data-filter="${id}">${icon(shortcut.icon)}<span>${shortcut.label}</span></button>`).join('')}
    </nav>
    <button type="button" class="discovery-resume" data-action="founder-resume" id="home-resume" hidden>
      ${icon('play')} <strong>كمّل الجولة</strong><span></span>
    </button>
    <section class="discovery-feature" aria-labelledby="discovery-title">
      <div class="discovery-heading">
        <h1 id="discovery-title" tabindex="-1">مختارات جوّ</h1>
        <button type="button" class="discovery-text-button" data-action="home-search">عرض الكل ${icon('chevron')}</button>
      </div>
      <div class="discovery-campaigns" role="region" aria-label="حملات جوّ" tabindex="0">
        <article class="discovery-banner discovery-banner-mystery">
          <img src="./assets/jaw-game-1.webp" alt="" width="550" height="550" fetchpriority="high">
          <div><h2>ليلة الغموض</h2><p>مين فيكم يخفي دوره؟</p>${collectionLink('shelf-mystery', 'شوف الألعاب')}</div>
        </article>
        <article class="discovery-banner discovery-banner-hideout">
          <img src="./assets/jaw-team-hideout.webp" alt="" width="288" height="288" loading="lazy">
          <div><h2>وين اختبوا؟</h2><p>فريق يختبئ… وعندكم دقيقة تلقونه.</p>
            <button class="discovery-text-button" type="button" data-action="setup" data-kind="hideout">ابدأ الجولة</button></div>
        </article>
        <article class="discovery-banner discovery-banner-lineup">
          <img src="./assets/jaw-lounge-small.webp" alt="" width="320" height="320" loading="lazy">
          <div><h2>سهرة جوّ</h2><p>ثلاث ألعاب، سهرة وحدة.</p>${collectionLink('lineup-heading', 'شوف الترتيب')}</div>
        </article>
      </div>
    </section>
    ${shelf(conversation)}
    <aside class="discovery-banner discovery-banner-teams" aria-labelledby="discovery-team-promo">
      <img src="./assets/jaw-team-auction.webp" alt="" width="540" height="515" loading="lazy">
      <div><h2 id="discovery-team-promo">تحدّي الفريقين</h2><p>كوّنوا فريقين وخلّوا الجولة تحسمها.</p>${collectionLink('shelf-teams', 'شوف التحديات')}</div>
    </aside>
    ${shelf(mystery)}
    ${shelf(teams)}
    ${shelf(microphone)}`;
}

function normalize(value) {
  return value.toLowerCase().normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/[ىي]/g, 'ي').replace(/[ةه]/g, 'ه')
    .replace(/[\p{P}\p{S}\u0640]/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function discoveryResults(filter, query = '') {
  const kinds = Object.hasOwn(shortcuts, filter) ? shortcuts[filter].kinds : collections.flatMap((collection) => collection.kinds);
  const terms = normalize(query).split(' ');
  const matching = kinds.filter((kind) => {
    const { title, tag, blurb } = games[kind];
    const text = normalize(`${title} ${tag} ${blurb}`);
    return terms.every((term) => text.includes(term));
  });
  return matching.length ? `<ul class="discovery-tiles discovery-search-tiles">${matching.map(tile).join('')}</ul>` :
    '<p class="discovery-empty">ما لقينا لعبة بهالبحث. جرّب كلمة ثانية.</p>';
}

export function discoverySearch(filter) {
  const title = Object.hasOwn(shortcuts, filter) ? shortcuts[filter].label : 'ابحث عن لعبة';
  return { title, body: `
    <label class="field-label" for="discovery-query">اسم اللعبة أو نوعها</label>
    <input id="discovery-query" class="field discovery-query" type="search" autocomplete="off" placeholder="مثلاً: المافيا" data-filter="${Object.hasOwn(shortcuts, filter) ? filter : ''}">
    <div id="discovery-results" aria-live="polite">${discoveryResults(filter)}</div>` };
}
