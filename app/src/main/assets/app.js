{
// ============ Grimorio — app TV ============
const $ = s => document.querySelector(s);
const main = $('#main'), modal = $('#modal');
const CAT = (window.CATALOG || []).map(x => ({...x, g: x.g || [], c: x.c || []}));
const BYID = Object.fromEntries(CAT.map(x => [x.i, x]));
const CFG = window.CFG || {};
const NATIVE = window.Android || null;

const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem('gr_' + k)) ?? d } catch (e) { return d } };
const save = (k, v) => { try { localStorage.setItem('gr_' + k, JSON.stringify(v)) } catch (e) {} };
let likes = load('likes', {});      // key -> {t, g:[...], img, kind}
let mylist = load('list', {});      // key -> {t, img, kind, sub}
let prog = load('prog', {});        // archiveId -> {t:seconds, d:duration, at:timestamp}

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('on'),3200); }

// ---------- generi ----------
const GENRES = ['Fantasy','Avventura','Animazione','Horror','Fantascienza','Commedia','Azione','Western','Giallo e noir','Dramma','Guerra','Storia','Famiglia','Musical','Muto'];
const TMDB_G = {'Fantasy':14,'Avventura':12,'Animazione':16,'Horror':27,'Fantascienza':878,'Commedia':35,'Azione':28,'Western':37,'Giallo e noir':80,'Dramma':18,'Guerra':10752,'Storia':36,'Famiglia':10751,'Musical':10402};
const TMDB_TV_G = {'Fantasy':10765,'Fantascienza':10765,'Avventura':10759,'Azione':10759,'Animazione':16,'Commedia':35,'Giallo e noir':80,'Dramma':18,'Western':37,'Famiglia':10751,'Guerra':10768};
const TMDB_NAME = {}; for (const [k,v] of Object.entries(TMDB_G)) TMDB_NAME[v]=k; TMDB_NAME[10765]='Fantasy'; TMDB_NAME[10759]='Avventura'; TMDB_NAME[9648]='Giallo e noir'; TMDB_NAME[53]='Giallo e noir'; TMDB_NAME[10768]='Guerra';

// ---------- catalogo classici ----------
const thumb = id => 'https://archive.org/services/img/' + encodeURIComponent(id);
const byPop = a => a.slice().sort((x,y) => (y.p||0) - (x.p||0));
const FANT = byPop(CAT.filter(x => x.f));
const sub = x => [x.y, x.g.slice(0,2).join(' · ')].filter(Boolean).join(' · ');

function cardC(x, showBar){
  const pr = prog[x.i], pct = pr && pr.d ? Math.min(100, pr.t / pr.d * 100) : 0;
  return `<button class="card" data-f data-act="open" data-id="${esc(x.i)}">
    <div class="img" style="background-image:url('${esc(thumb(x.i))}')">${x.l?'<i>ITA</i>':''}${showBar&&pct?`<div class="bar" style="width:${pct.toFixed(0)}%"></div>`:''}</div>
    <div class="t">${esc(x.t)}</div><div class="s">${esc(sub(x))}</div></button>`;
}
function cardT(m){
  const kind = m.media_type || (m.first_air_date !== undefined || m.name ? 'tv' : 'movie');
  const title = m.title || m.name || '';
  const year = (m.release_date || m.first_air_date || '').slice(0,4);
  const img = m.poster_path ? 'https://image.tmdb.org/t/p/w342' + m.poster_path : '';
  return `<button class="card poster" data-f data-act="topen" data-tid="${esc(m.id)}" data-kind="${esc(kind)}">
    <div class="img" style="${img?`background-image:url('${esc(img)}')`:''}">${img?'':`<div class="ph">${esc(title)}</div>`}${kind==='tv'?'<i>SERIE</i>':''}</div>
    <div class="t">${esc(title)}</div><div class="s">${esc([year,(m.genre_ids||[]).map(g=>TMDB_NAME[g]).filter(Boolean)[0]].filter(Boolean).join(' · '))}</div></button>`;
}
const row = (title, cards, note) => cards ? `<section class="row"><h2>${esc(title)}${note?`<small>${esc(note)}</small>`:''}</h2><div class="strip">${cards}</div></section>` : '';
const rowC = (title, list, note, bar) => list.length ? row(title, list.slice(0,30).map(x=>cardC(x,bar)).join(''), note) : '';

function themed(re){ return byPop(CAT.filter(x => re.test([x.t, x.d, x.s, x.g.join(' ')].join(' ').toLowerCase()))); }
const T = {
  spada: themed(/sword|sorcer|spada|stregon|knight|cavalier|barbar|conan|viking|vichingh|crociat|king arthur|re art|robin hood|ivanhoe|camelot/),
  miti: themed(/mytholog|mitolog|hercules|ercole|maciste|ulisse|ulysses|odyss|odisse|titan|giant|gigant|ciclop|cyclop|minotaur|medusa|olymp|olimp|argonaut|nibelung|siegfried|sigfrido|thor|legend|leggend/),
  fiabe: themed(/fairy|fiab|wizard|mago|maghi|witch|strega|magic|magia|incantes|enchant|dragon|drago|elf|elfi|gnom|troll|genie|genio della lampada|bagdad|baghdad|arabian|sinbad|aladin|cinderella|cenerentola|snow white|biancaneve|oz\b|peter pan|alice/),
  horror: byPop(CAT.filter(x => x.g.includes('Horror'))),
  scifi: byPop(CAT.filter(x => x.g.includes('Fantascienza'))),
  anim: byPop(CAT.filter(x => x.g.includes('Animazione'))),
  avv: byPop(CAT.filter(x => x.g.includes('Avventura'))),
  ita: byPop(CAT.filter(x => x.l)),
  muti: byPop(CAT.filter(x => x.g.includes('Muto')))
};

// ---------- TMDB (piattaforme gratuite) ----------
const FREE_RE = /rai ?play|mediaset|pluto|rakuten|plex|la7|tubi|raiplay|infinity/i;
let PROVS = null; // [{id,name,logo}]
async function tm(path, params = {}){
  if (!CFG.tmdbKey) throw new Error('nokey');
  const u = new URL('https://api.themoviedb.org/3' + path);
  const p = {language:'it-IT', region:'IT', ...params};
  const bearer = CFG.tmdbKey.length > 50;
  if (!bearer) p.api_key = CFG.tmdbKey;
  for (const [k,v] of Object.entries(p)) if (v !== undefined && v !== '') u.searchParams.set(k, v);
  const key = u.toString(); tm.c = tm.c || {};
  if (tm.c[key]) return tm.c[key];
  const r = await fetch(key, bearer ? {headers:{Authorization:'Bearer ' + CFG.tmdbKey}} : {});
  if (!r.ok) throw new Error('tmdb ' + r.status);
  return (tm.c[key] = await r.json());
}
async function providers(){
  if (PROVS) return PROVS;
  const seen = {}, out = [];
  for (const kind of ['movie','tv']) {
    try {
      const d = await tm(`/watch/providers/${kind}`, {watch_region:'IT'});
      for (const p of d.results || []) if (FREE_RE.test(p.provider_name) && !seen[p.provider_id]) { seen[p.provider_id]=1; out.push({id:p.provider_id, name:p.provider_name, logo:p.logo_path}); }
    } catch (e) { if (e.message === 'nokey') throw e; }
  }
  return (PROVS = out);
}
async function discover(kind, extra = {}){
  const pv = await providers(); if (!pv.length) return [];
  const ids = extra.prov ? String(extra.prov) : pv.map(p=>p.id).join('|');
  delete extra.prov;
  const d = await tm(`/discover/${kind}`, {watch_region:'IT', with_watch_providers: ids, with_watch_monetization_types:'free|ads', sort_by:'popularity.desc', ...extra});
  return (d.results || []).map(m => ({...m, media_type: kind}));
}
// riga TMDB caricata dopo: segnaposto + riempimento asincrono
let slot = 0;
function asyncRow(title, fn, note){
  const id = 'r' + (++slot);
  setTimeout(async () => {
    const el = document.getElementById(id); if (!el) return;
    try {
      const list = (await fn()).filter(m => m.poster_path || m.title || m.name);
      if (!document.getElementById(id)) return;
      el.outerHTML = list.length ? row(title, list.slice(0,24).map(cardT).join(''), note) : '';
    } catch (e) { el.outerHTML = e.message === 'nokey' ? '' : `<p class="note">${esc(title)}: non disponibile ora (controlla la connessione).</p>`; }
  });
  return `<div id="${id}" class="spin">Carico «${esc(title)}»…</div>`;
}

// ---------- consigli da "Mi piace" ----------
function likedGenres(){
  const n = {};
  for (const v of Object.values(likes)) for (const g of v.g || []) n[g] = (n[g]||0) + 1;
  return Object.entries(n).sort((a,b)=>b[1]-a[1]).map(e=>e[0]).slice(0,3);
}
function recClassics(){
  const gs = likedGenres(); if (!gs.length) return [];
  return byPop(CAT.filter(x => !likes['a:'+x.i] && x.g.some(g => gs.includes(g))));
}

// ---------- viste ----------
let view = 'home', lastFocus = {};
const VIEWS = {
  home(){
    const hero = (FANT.length ? FANT : byPop(CAT))[Math.floor(Math.random() * Math.min(8, FANT.length || CAT.length))];
    const cont = Object.entries(prog).filter(([id,p]) => BYID[id] && p.d && p.t/p.d < .95).sort((a,b)=>b[1].at-a[1].at).map(([id])=>BYID[id]);
    const gs = likedGenres();
    return heroHtml(hero) +
      rowC('Continua a guardare', cont, '', true) +
      (gs.length ? rowC('Consigliati per te', recClassics(), 'perché ti piace ' + gs.join(', ').toLowerCase()) : '') +
      (gs.length && CFG.tmdbKey ? asyncRow('Consigliati per te sulle piattaforme', () => discover('movie', {with_genres: gs.map(g=>TMDB_G[g]).filter(Boolean).join('|')})) : '') +
      rowC('Spada e stregoneria', T.spada) +
      (CFG.tmdbKey ? asyncRow('Fantasy gratis sulle piattaforme', () => discover('movie', {with_genres:14}), 'RaiPlay, Mediaset, Pluto TV…') : '') +
      rowC('Miti, eroi e leggende', T.miti) +
      rowC('Fiabe, magia e draghi', T.fiabe) +
      (CFG.tmdbKey ? asyncRow('Serie fantasy e avventura', () => discover('tv', {with_genres:'10765|10759'})) : '') +
      rowC('In italiano', T.ita) +
      rowC('Avventura', T.avv) +
      rowC('Horror gotico', T.horror) +
      rowC('Fantascienza d\'epoca', T.scifi) +
      rowC('Animazione classica', T.anim) +
      rowC('Cinema muto', T.muti) +
      rowC('I più visti', byPop(CAT));
  },
  fantasy(){
    return `<div class="pagehead"><h1>Fantasy</h1><p>Spade, draghi, miti e magia: i classici da guardare subito, più il fantasy gratuito sulle piattaforme.</p></div>` +
      rowC('Spada e stregoneria', T.spada) + rowC('Miti, eroi e leggende', T.miti) + rowC('Fiabe, magia e draghi', T.fiabe) +
      (CFG.tmdbKey ? asyncRow('Film fantasy sulle piattaforme', () => discover('movie', {with_genres:14})) +
        asyncRow('Serie fantasy sulle piattaforme', () => discover('tv', {with_genres:10765})) +
        asyncRow('Animazione fantasy', () => discover('movie', {with_genres:'14,16'})) : '') +
      `<section class="row"><h2>Tutti i classici fantasy <small>${FANT.length} titoli</small></h2><div class="grid">${FANT.slice(0,120).map(x=>cardC(x)).join('')}</div></section>`;
  },
  classici(){
    const on = VIEWS.classici.g || '';
    const list = byPop(on ? CAT.filter(x => x.g.includes(on)) : CAT);
    return `<div class="pagehead"><h1>Classici gratuiti</h1><p>Film di pubblico dominio da Internet Archive: si guardano direttamente qui, senza account.</p></div>
      <div class="chips">${['', ...GENRES].map(g => `<button class="chip${g===on?' on':''}" data-f data-act="cg" data-g="${esc(g)}">${esc(g||'Tutti')}</button>`).join('')}</div>
      <p class="note">${list.length} titoli</p>
      <div class="grid">${list.slice(0,150).map(x=>cardC(x)).join('') || '<p class="empty">Nessun titolo in questo genere.</p>'}</div>`;
  },
  piattaforme(){
    if (!CFG.tmdbKey) return `<div class="pagehead"><h1>Piattaforme gratuite</h1><p>Per vedere qui i cataloghi di RaiPlay, Mediaset Infinity, Pluto TV e Rakuten serve la chiave gratuita di TMDB nel file config.js.</p></div>`;
    const on = VIEWS.piattaforme.g || '';
    const gid = TMDB_G[on], tgid = TMDB_TV_G[on];
    let html = `<div class="pagehead"><h1>Gratis sulle piattaforme</h1><p>Scegli un titolo: si apre nell'app ufficiale. RaiPlay e Mediaset Infinity chiedono un account gratuito, Pluto TV no.</p></div>
      <div class="chips">${['', ...GENRES.filter(g=>TMDB_G[g])].map(g => `<button class="chip${g===on?' on':''}" data-f data-act="pg" data-g="${esc(g)}">${esc(g||'Tutti')}</button>`).join('')}</div>`;
    html += `<div id="provrows" class="spin">Carico le piattaforme…</div>`;
    setTimeout(async () => {
      const el = $('#provrows'); if (!el) return;
      try {
        const pv = await providers();
        el.outerHTML = pv.map(p =>
          asyncRow(`Film su ${p.name}`, () => discover('movie', {prov:p.id, with_genres: gid})) +
          asyncRow(`Serie su ${p.name}`, () => discover('tv', {prov:p.id, with_genres: tgid}))
        ).join('') || '<p class="empty">Nessuna piattaforma gratuita trovata.</p>';
      } catch (e) { el.outerHTML = '<p class="empty">Non riesco a caricare le piattaforme. Controlla la connessione.</p>'; }
    });
    return html;
  },
  diretta(){
    const chs = window.CHANNELS || [];
    return `<div class="pagehead"><h1>TV in diretta</h1><p>Scegli un canale: si apre la diretta nell'app ufficiale (RaiPlay, Mediaset Infinity, La7, Pluto TV). Se l'app non è installata la trovi nello store della TV.</p></div>
      <div class="live">${chs.map((c,i) => `<button class="ch" data-f data-act="live" data-i="${i}" style="background:linear-gradient(135deg,${esc(c.c)},#0d0b10 140%)"><b>${esc(c.n)}</b><span>${esc(c.app)}</span></button>`).join('')}</div>`;
  },
  lista(){
    const fav = Object.entries(mylist), lk = Object.entries(likes);
    const cardK = ([k,v]) => k.startsWith('a:') && BYID[k.slice(2)] ? cardC(BYID[k.slice(2)])
      : cardT({id:k.split(':')[2], media_type:k.split(':')[1], title:v.t, poster_path:v.img});
    return `<div class="pagehead"><h1>La mia lista</h1><p>Quello che hai salvato e quello che ti è piaciuto.</p></div>` +
      (fav.length ? row('Da guardare', fav.map(cardK).join('')) : '') +
      (lk.length ? row('Mi piace', lk.map(cardK).join('')) : '') +
      (fav.length || lk.length ? '' : '<p class="empty">Ancora vuota. Apri un titolo e premi «La mia lista» o «Mi piace».</p>');
  },
  cerca(){
    const q = VIEWS.cerca.q || '', g = VIEWS.cerca.g || '';
    const actors = topActors();
    return `<div class="pagehead"><h1>Cerca</h1></div>
      <form class="searchbox" id="sform"><input id="q" data-f type="search" placeholder="Titolo, attore o regista…" value="${esc(q)}" autocomplete="off"><button class="btn main" data-f type="submit">Cerca</button></form>
      <div class="chips">${GENRES.map(x => `<button class="chip${x===g?' on':''}" data-f data-act="sg" data-g="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div id="results">${searchResults(q, g)}</div>
      ${q || g ? '' : `<section class="row"><h2>Attori dei classici</h2><div class="chips">${actors.map(a => `<button class="chip" data-f data-act="actor" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div></section>`}`;
  }
};
function topActors(){
  const n = {};
  for (const x of CAT) for (const a of x.c.slice(0,4)) n[a] = (n[a]||0) + (x.p||1);
  return Object.entries(n).sort((a,b)=>b[1]-a[1]).slice(0,24).map(e=>e[0]);
}
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
function searchResults(q, g){
  if (!q && !g) return '';
  const nq = norm(q);
  let loc = CAT.filter(x => (!g || x.g.includes(g)) && (!nq || norm([x.t, x.o, x.c.join(' '), x.r, x.y].join(' ')).includes(nq)));
  const actorHit = nq && loc.some(x => x.c.some(a => norm(a).includes(nq)));
  loc = byPop(loc);
  let html = loc.length ? `<section class="row"><h2>Classici da guardare subito <small>${loc.length}</small></h2><div class="grid">${loc.slice(0,60).map(x=>cardC(x)).join('')}</div></section>` : '';
  if (CFG.tmdbKey) {
    const gid = TMDB_G[g];
    if (nq) {
      html += asyncRow(`Con «${q}» sulle piattaforme`, async () => {
        const ps = await tm('/search/person', {query:q});
        const p = (ps.results||[])[0]; if (!p) return [];
        const [a,b] = await Promise.all([discover('movie', {with_cast:p.id, with_genres:gid}), discover('tv', {with_people:p.id, with_genres:TMDB_TV_G[g]})]);
        return [...a, ...b];
      }, 'attore');
      html += asyncRow(`Titoli «${q}» gratis sulle piattaforme`, async () => {
        const r = await tm('/search/multi', {query:q});
        const items = (r.results||[]).filter(m => m.media_type==='movie'||m.media_type==='tv').slice(0,12);
        const pv = await providers(), ok = new Set(pv.map(p=>p.id));
        const checks = await Promise.all(items.map(async m => {
          try { const w = await tm(`/${m.media_type}/${m.id}/watch/providers`); const it = (w.results||{}).IT || {};
            return [...(it.free||[]), ...(it.ads||[]), ...(it.flatrate||[])].some(p => ok.has(p.provider_id)) ? m : null; } catch (e) { return null; }
        }));
        return checks.filter(Boolean).filter(m => !g || (m.genre_ids||[]).some(id => TMDB_NAME[id] === g));
      });
    } else if (gid) {
      html += asyncRow(`${g}: film sulle piattaforme`, () => discover('movie', {with_genres:gid}));
      if (TMDB_TV_G[g]) html += asyncRow(`${g}: serie sulle piattaforme`, () => discover('tv', {with_genres:TMDB_TV_G[g]}));
    }
  }
  if (!loc.length && !CFG.tmdbKey) html = `<p class="empty">Nessun risultato${actorHit?'':' per questa ricerca'}.</p>`;
  return html || '<p class="empty">Nessun classico trovato. Guarda sotto le piattaforme.</p>';
}
function heroHtml(x){
  if (!x) return '';
  return `<section class="hero"><div class="bg" style="background-image:url('${esc(thumb(x.i))}')"></div>
    <div class="in"><div class="kicker">${x.f ? 'Fantasy da guardare stasera' : 'Classico da guardare stasera'}</div><h1>${esc(x.t)}</h1>
    <p>${esc(x.d || sub(x))}</p>
    <div class="btns"><button class="btn main" data-f data-act="play" data-id="${esc(x.i)}">▶ Guarda</button><button class="btn" data-f data-act="open" data-id="${esc(x.i)}">Dettagli</button></div></div></section>`;
}

function show(v, keepFocus){
  if (!VIEWS[v]) v = 'home';
  view = v;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  main.innerHTML = VIEWS[v]();
  main.scrollTop = 0;
  if (!keepFocus) { const first = main.querySelector('[data-f]'); (first || $('#nav button')).focus({preventScroll:true}); }
  bindForm();
}
function bindForm(){
  const f = $('#sform'); if (!f) return;
  f.onsubmit = e => { e.preventDefault(); VIEWS.cerca.q = $('#q').value.trim(); $('#results').innerHTML = searchResults(VIEWS.cerca.q, VIEWS.cerca.g); const r = $('#results [data-f]'); if (r) r.focus(); };
}

// ---------- dettagli ----------
let modalReturn = null;
function openModal(html){ modalReturn = document.activeElement; modal.innerHTML = `<div class="sheet">${html}</div>`; modal.hidden = false; const b = modal.querySelector('[data-f]'); if (b) b.focus({preventScroll:true}); }
function closeModal(){ modal.hidden = true; modal.innerHTML = ''; if (modalReturn && document.contains(modalReturn)) modalReturn.focus({preventScroll:true}); }

function likeBtns(key, info){
  return `<button class="btn${likes[key]?' liked':''}" data-f data-act="like" data-k="${esc(key)}" data-info="${esc(JSON.stringify(info))}">${likes[key]?'♥ Ti piace':'♡ Mi piace'}</button>
    <button class="btn" data-f data-act="list" data-k="${esc(key)}" data-info="${esc(JSON.stringify(info))}">${mylist[key]?'✓ Nella lista':'+ La mia lista'}</button>`;
}
function openClassic(id){
  const x = BYID[id]; if (!x) return;
  const pr = prog[id], resume = pr && pr.d && pr.t > 60 && pr.t / pr.d < .95;
  const same = byPop(CAT.filter(y => y.i !== id && (y.c.some(a => x.c.slice(0,3).includes(a)) || (x.f && y.f)))).slice(0,16);
  openModal(`<div class="cover" style="background-image:url('${esc(thumb(id))}')"></div><div class="body">
    <h1>${esc(x.t)}</h1>
    <div class="meta">${[x.y, x.g.join(' · '), x.l ? '<b>In italiano</b>' : 'Lingua originale', 'Pubblico dominio'].filter(Boolean).map(s=>String(s).startsWith('<b>')?s:esc(s)).join(' · ')}</div>
    <div class="btns"><button class="btn main" data-f data-act="play" data-id="${esc(id)}">▶ ${resume ? 'Riprendi' : 'Guarda'}</button>${resume?`<button class="btn" data-f data-act="play" data-id="${esc(id)}" data-from="0">Dall'inizio</button>`:''}
    ${likeBtns('a:'+id, {t:x.t, g:x.g, kind:'a'})}</div>
    ${x.d ? `<p class="desc">${esc(x.d)}</p>` : ''}
    ${x.r ? `<div class="meta">Regia: ${esc(x.r)}</div>` : ''}
    ${x.c.length ? `<h3>Cast</h3><div class="provs">${x.c.slice(0,10).map(a => `<button class="chip" data-f data-act="actor" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}
    ${same.length ? `<h3>Ti potrebbe piacere</h3></div><div class="strip">${same.map(y=>cardC(y)).join('')}</div><div class="body">` : ''}
  </div>`);
}
async function openTmdb(tid, kind){
  openModal(`<div class="body" style="margin-top:0;padding-top:26px"><p class="spin">Carico…</p><button class="btn" data-f data-act="close">Chiudi</button></div>`);
  try {
    const [m, w] = await Promise.all([tm(`/${kind}/${tid}`, {append_to_response: kind==='tv' ? 'aggregate_credits' : 'credits'}), tm(`/${kind}/${tid}/watch/providers`)]);
    const it = (w.results||{}).IT || {};
    const pv = await providers().catch(()=>[]), ok = new Set(pv.map(p=>p.id));
    const free = [...(it.free||[]), ...(it.ads||[]), ...(it.flatrate||[])].filter((p,i,a) => ok.has(p.provider_id) && a.findIndex(q=>q.provider_id===p.provider_id)===i);
    const title = m.title || m.name, year = (m.release_date || m.first_air_date || '').slice(0,4);
    const cast = ((m.credits || m.aggregate_credits || {}).cast || []).slice(0,10).map(c => c.name);
    const gnames = (m.genres||[]).map(g => TMDB_NAME[g.id] || g.name);
    const key = `t:${kind}:${tid}`;
    const bg = m.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + m.backdrop_path : '';
    if (modal.hidden) return;
    modal.innerHTML = `<div class="sheet"><div class="cover" style="${bg?`background-image:url('${esc(bg)}')`:''}"></div><div class="body">
      <h1>${esc(title)}</h1>
      <div class="meta">${esc([year, kind==='tv' ? `Serie · ${m.number_of_seasons||'?'} stagioni` : (m.runtime ? m.runtime + ' min' : ''), gnames.slice(0,3).join(' · ')].filter(Boolean).join(' · '))}</div>
      <div class="btns">${free.map(p => `<button class="btn main" data-f data-act="papp" data-app="${esc(p.provider_name)}" data-q="${esc(title)}">▶ Apri su ${esc(p.provider_name)}</button>`).join('') || '<span class="meta">Al momento non è gratis sulle piattaforme italiane.</span>'}
      ${likeBtns(key, {t:title, g:gnames, img:m.poster_path, kind})}</div>
      ${m.overview ? `<p class="desc">${esc(m.overview)}</p>` : ''}
      ${cast.length ? `<h3>Cast</h3><div class="provs">${cast.map(a => `<button class="chip" data-f data-act="actor" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}
    </div></div>`;
    const b = modal.querySelector('[data-f]'); if (b) b.focus({preventScroll:true});
  } catch (e) {
    modal.querySelector('.spin').textContent = 'Non riesco a caricare questo titolo. Controlla la connessione.';
  }
}

// ---------- app esterne ----------
function openExternal(url, app, query){
  if (NATIVE && NATIVE.open) {
    const r = NATIVE.open(url || '', app || '', query || '');
    if (r === 'ok') {}
    else if (r === 'search') toast(`Aperto ${app}: se non parte da solo, cerca «${query}».`);
    else if (r === 'app') toast(query ? `Aperto ${app}: cerca «${query}».` : `Aperto ${app}.`);
    else if (r === 'web') toast(`Apro la pagina di ${app}.`);
    else toast(`${app} non è installata: la trovi nello store della TV.`);
  } else { window.open(url || ('https://www.google.com/search?q=' + encodeURIComponent((query||'') + ' ' + app)), '_blank'); }
}
const PROV_URL = n => /rai/i.test(n) ? ['RaiPlay', q => 'https://www.raiplay.it/ricerca.html?q=' + encodeURIComponent(q)]
  : /mediaset|infinity/i.test(n) ? ['Mediaset Infinity', q => 'https://mediasetinfinity.mediaset.it/ricerca?q=' + encodeURIComponent(q)]
  : /pluto/i.test(n) ? ['Pluto TV', q => 'https://pluto.tv/it/search/details?query=' + encodeURIComponent(q)]
  : /rakuten/i.test(n) ? ['Rakuten TV', q => 'https://www.rakuten.tv/it/search?q=' + encodeURIComponent(q)]
  : /la7/i.test(n) ? ['La7', q => 'https://www.la7.it/ricerca?query=' + encodeURIComponent(q)]
  : [n, q => ''];

// ---------- player ----------
const P = {el: $('#player'), v: $('#vid'), id: null, hideT: 0, saveT: 0};
async function play(id, from){
  const x = BYID[id]; if (!x) return;
  if (!modal.hidden) closeModal();
  P.ret = document.activeElement; P.id = id;
  P.el.hidden = false; $('#ptitle').textContent = x.t; $('#pmsg').textContent = 'Carico il film…';
  P.v.removeAttribute('src');
  try {
    const r = await fetch('https://archive.org/metadata/' + encodeURIComponent(id) + '/files');
    const files = (await r.json()).result || [];
    const vids = files.filter(f => /\.mp4$/i.test(f.name));
    const score = f => (/h\.264/i.test(f.format||'') ? 3 : /mpeg4/i.test(f.format||'') ? 2 : 1) * 1e12 + Number(f.size||0);
    const best = vids.sort((a,b) => score(b) - score(a))[0];
    if (!best) throw new Error('novideo');
    if (P.id !== id) return;
    P.v.src = 'https://archive.org/download/' + encodeURIComponent(id) + '/' + best.name.split('/').map(encodeURIComponent).join('/');
    const pr = prog[id];
    P.v.onloadedmetadata = () => { if (from === undefined && pr && pr.t > 60 && pr.t / (P.v.duration||1) < .95) P.v.currentTime = pr.t; $('#pdur').textContent = fmt(P.v.duration); };
    await P.v.play().catch(()=>{});
    $('#pmsg').textContent = '';
  } catch (e) { $('#pmsg').textContent = 'Questo film non si riesce a riprodurre. Prova un altro titolo.'; }
  showBar();
}
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), ss = String(s%60).padStart(2,'0'); return h ? `${h}:${String(m).padStart(2,'0')}:${ss}` : `${m}:${ss}`; };
function showBar(){ $('#pbar').classList.remove('hide'); clearTimeout(P.hideT); P.hideT = setTimeout(() => { if (!P.v.paused) $('#pbar').classList.add('hide'); }, 3500); }
function saveProg(){ if (!P.id || !P.v.duration) return; prog[P.id] = {t: P.v.currentTime, d: P.v.duration, at: Date.now()}; save('prog', prog); }
P.v.ontimeupdate = () => { $('#pcur').textContent = fmt(P.v.currentTime); $('#pfill').style.width = (P.v.duration ? P.v.currentTime / P.v.duration * 100 : 0) + '%'; if (Date.now() - P.saveT > 5000) { P.saveT = Date.now(); saveProg(); } };
P.v.onwaiting = () => { $('#pmsg').textContent = 'Caricamento…'; };
P.v.onplaying = () => { $('#pmsg').textContent = ''; };
P.v.onerror = () => { if (P.v.getAttribute('src')) $('#pmsg').textContent = 'Errore di riproduzione. Controlla la connessione.'; };
function closePlayer(){ saveProg(); P.v.pause(); P.v.removeAttribute('src'); P.v.load(); P.el.hidden = true; P.id = null; if (view === 'home') show('home', true); if (P.ret && document.contains(P.ret)) P.ret.focus({preventScroll:true}); else { const f = main.querySelector('[data-f]'); if (f) f.focus(); } }
function playerKey(k){
  showBar();
  if (k === 'Enter' || k === ' ' || k === 'MediaPlayPause') { P.v.paused ? P.v.play() : P.v.pause(); }
  else if (k === 'MediaPlay') P.v.play();
  else if (k === 'MediaPause') P.v.pause();
  else if (k === 'ArrowRight' || k === 'MediaFastForward') P.v.currentTime = Math.min((P.v.duration||0) - 1, P.v.currentTime + (k === 'ArrowRight' ? 10 : 60));
  else if (k === 'ArrowLeft' || k === 'MediaRewind') P.v.currentTime = Math.max(0, P.v.currentTime - (k === 'ArrowLeft' ? 10 : 60));
  else return false;
  return true;
}

// ---------- azioni ----------
function act(el){
  const d = el.dataset;
  switch (d.act) {
    case 'view': lastFocus[view] = null; show(d.v); el.focus(); break;
    case 'open': openClassic(d.id); break;
    case 'topen': openTmdb(d.tid, d.kind); break;
    case 'play': play(d.id, d.from === '0' ? 0 : undefined); if (d.from === '0') { delete prog[d.id]; } break;
    case 'close': closeModal(); break;
    case 'cg': VIEWS.classici.g = d.g; show('classici', true); focusSel(`[data-act="cg"][data-g="${CSS.escape(d.g)}"]`); break;
    case 'pg': VIEWS.piattaforme.g = d.g; show('piattaforme', true); focusSel(`[data-act="pg"][data-g="${CSS.escape(d.g)}"]`); break;
    case 'sg': VIEWS.cerca.g = VIEWS.cerca.g === d.g ? '' : d.g; show('cerca', true); focusSel(`[data-act="sg"][data-g="${CSS.escape(d.g)}"]`); break;
    case 'actor': if (!modal.hidden) closeModal(); VIEWS.cerca.q = d.a; VIEWS.cerca.g = ''; show('cerca', true); focusSel('#results [data-f]') || focusSel('#q'); break;
    case 'live': { const c = (window.CHANNELS||[])[+d.i]; if (c) openExternal(c.url, c.app, ''); break; }
    case 'papp': { const [app, mk] = PROV_URL(d.app); openExternal(mk(d.q), app, d.q); break; }
    case 'like': case 'list': {
      const store = d.act === 'like' ? likes : mylist, info = JSON.parse(d.info || '{}');
      if (store[d.k]) delete store[d.k]; else store[d.k] = info;
      save(d.act === 'like' ? 'likes' : 'list', store);
      if (d.act === 'like') { el.classList.toggle('liked', !!likes[d.k]); el.textContent = likes[d.k] ? '♥ Ti piace' : '♡ Mi piace'; toast(likes[d.k] ? 'Aggiunto ai «Mi piace»: trovi titoli simili in Home.' : 'Tolto dai «Mi piace».'); }
      else { el.textContent = mylist[d.k] ? '✓ Nella lista' : '+ La mia lista'; toast(mylist[d.k] ? 'Aggiunto alla tua lista.' : 'Tolto dalla lista.'); }
      break;
    }
  }
}
function focusSel(sel){ const e = document.querySelector(sel); if (e) e.focus({preventScroll:false}); return e; }
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el) { e.preventDefault(); act(el); } });

// ---------- navigazione col telecomando (frecce) ----------
function scope(){ return !modal.hidden ? modal : document; }
function focusables(){ return [...scope().querySelectorAll('[data-f]')].filter(e => e.offsetParent !== null); }
function move(dir){
  const cur = document.activeElement;
  const list = focusables();
  if (!cur || !list.includes(cur)) { (list[0]||document.body).focus(); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width/2, ay = a.top + a.height/2;
  let best = null, bs = Infinity;
  const sameStrip = cur.closest('.strip');
  for (const e of list) {
    if (e === cur) continue;
    const b = e.getBoundingClientRect(), bx = b.left + b.width/2, by = b.top + b.height/2;
    let main_, cross;
    if (dir === 'ArrowRight') { main_ = b.left - a.right + a.width*0.5; cross = Math.abs(by - ay); if (bx <= ax + 2) continue; }
    else if (dir === 'ArrowLeft') { main_ = a.left - b.right + a.width*0.5; cross = Math.abs(by - ay); if (bx >= ax - 2) continue; }
    else if (dir === 'ArrowDown') { main_ = b.top - a.bottom; cross = Math.abs(bx - ax); if (by <= ay + 2) continue; }
    else { main_ = a.top - b.bottom; cross = Math.abs(bx - ax); if (by >= ay - 2) continue; }
    // in orizzontale resta nella stessa riga di card
    if ((dir === 'ArrowRight' || dir === 'ArrowLeft') && sameStrip && e.closest('.strip') !== sameStrip) continue;
    // in verticale, entrando in una riga, preferisci la card più a sinistra visibile
    const s = Math.max(0, main_) + cross * ((dir === 'ArrowDown' || dir === 'ArrowUp') ? 0.6 : 2.5);
    if (s < bs) { bs = s; best = e; }
  }
  if (best) {
    if ((dir === 'ArrowDown' || dir === 'ArrowUp') && best.closest('.strip') && best.closest('.strip') !== sameStrip) {
      // entra nella riga sulla card visibile più vicina a sinistra
      const strip = best.closest('.strip'), sr = strip.getBoundingClientRect();
      const vis = [...strip.querySelectorAll('[data-f]')].filter(c => c.getBoundingClientRect().left >= sr.left - 4);
      best = vis.sort((p,q) => Math.abs(p.getBoundingClientRect().left - Math.max(ax - a.width/2, sr.left)) - Math.abs(q.getBoundingClientRect().left - Math.max(ax - a.width/2, sr.left)))[0] || best;
    }
    best.focus({preventScroll:true});
    best.scrollIntoView({block: 'nearest', inline: 'nearest'});
    const strip = best.closest('.strip'); if (strip) { const r = best.getBoundingClientRect(), sr = strip.getBoundingClientRect(); if (r.left < sr.left + 40) strip.scrollLeft -= (sr.left + 40 - r.left); }
    const sec = best.closest('.row, .hero, .pagehead, .chips');
    if (sec && scope() === document) { const r = best.getBoundingClientRect(); if (r.top < 90) main.scrollTop -= (90 - r.top); else if (r.bottom > innerHeight - 30) main.scrollTop += r.bottom - innerHeight + 40; }
    if (!modal.hidden) { const sh = modal.querySelector('.sheet'), r = best.getBoundingClientRect(), sr = sh.getBoundingClientRect(); if (r.bottom > sr.bottom - 10) sh.scrollTop += r.bottom - sr.bottom + 30; if (r.top < sr.top + 10) sh.scrollTop -= sr.top - r.top + 30; }
  } else if (dir === 'ArrowUp' && scope() === document) {
    const on = $('#nav button.on') || $('#nav button'); on.focus(); main.scrollTop = 0;
  }
}

// tasto Indietro (chiamato anche dall'app Android). Ritorna true se gestito.
window.tvBack = function(){
  if (!P.el.hidden) { closePlayer(); return true; }
  if (!modal.hidden) { closeModal(); return true; }
  if (document.activeElement && document.activeElement.id === 'q') { document.activeElement.blur(); focusSel('#nav button.on'); return true; }
  if (view !== 'home') { show('home'); return true; }
  if (!document.activeElement || !document.activeElement.closest('#nav')) { focusSel('#nav button.on'); main.scrollTop = 0; return true; }
  return false;
};

document.addEventListener('keydown', e => {
  const k = e.key;
  if (!P.el.hidden) { if (k === 'Escape' || k === 'Backspace' || k === 'GoBack' || k === 'BrowserBack') { e.preventDefault(); closePlayer(); } else if (playerKey(k)) e.preventDefault(); return; }
  if (document.activeElement && document.activeElement.id === 'q' && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
  if (k.startsWith('Arrow')) { e.preventDefault(); move(k); }
  else if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || (k === 'Backspace' && document.activeElement?.tagName !== 'INPUT')) { e.preventDefault(); window.tvBack(); }
  else if (k === 'Enter' && document.activeElement && document.activeElement.tagName === 'BUTTON') { e.preventDefault(); act(document.activeElement.closest('[data-act]') || document.activeElement); if (document.activeElement?.type === 'submit') $('#sform').requestSubmit(); }
});
document.addEventListener('mousemove', () => { if (!P.el.hidden) showBar(); });

// avvio
if (!CAT.length) main.innerHTML = '<p class="empty">Catalogo vuoto: ricompila l\'app.</p>';
show('home');
}
