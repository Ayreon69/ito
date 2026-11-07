// Test de bout en bout sur le serveur compilé, en mode accéléré (IT_FAST=1 : les cartes se retournent en un éclair).
// Partie 1 : Défi à voix haute, 4 joueurs. Une spectatrice arrive en route, Bob se déconnecte puis reprend sa place,
//   un imposteur tente de prendre la sienne, Chloé quitte la table (la tablée ne l'attend plus). La série dure jusqu'au premier fil cassé.
// Partie 2 : partie libre à l'écrit, à 10 (la table pleine), trois manches puis l'hôte arrête. Enfin, la revanche en un clic.
// Les joueurs accrochent leurs cartes plus ou moins bien, se déplacent, reprennent, écrivent des idées, se mettent d'accord.
// À chaque état reçu, on vérifie qu'aucun nombre caché ne fuit, ni le propriétaire d'une carte à pince en bois ;
// à la fin, que chaque manche du bilan découle des nombres dévoilés. Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), IT_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  // Où en était la table, pour comprendre un blocage.
  const g = globalThis.host?.view?.game;
  for (const c of globalThis.everyone ?? []) console.error(`  ${c.debug()}`);
  if (g) console.error(`  manche ${g.round}, ${g.stage} ; corde ${g.line.map((x) => truth.get(x.id)?.n ?? '?').join(' ')} ; d'accord ${g.agreed.length} ; en main ${Object.entries(g.inHand).map(([id, n]) => `${globalThis.host.view.players.find((p) => p.id === id)?.name}:${n}`).join(' ')} ; absents ${g.out.length}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();
await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

const PLAYER_KEYS = 'avatar,away,connected,id,isHost,name,seat,status';
const GAME_KEYS = 'agreed,candidates,cards,choices,hand,inHand,line,out,revealed,round,stage,theme,win,won';
const CARD_KEYS = 'id,idea,mine,n,owner,peg,wrong';
const stats = { states: 0, gestures: 0, refused: new Map(), moves: 0, unhangs: 0, ideas: 0, rounds: 0 };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const keys = (o) => Object.keys(o).sort().join(',');

/** La vérité, apprise de la vue de chaque propriétaire : numéro et propriétaire de chaque carte. */
const truth = new Map();
/** Les cordes retournées, manche par manche, vues par l'hôte : pour comparer avec le bilan. */
let seenRounds = [];

function learn(id, n, owner, who) {
  const t = truth.get(id);
  if (t && (t.n !== n || t.owner !== owner)) fail(`${who} : la carte ${id} change (${t.n}/${t.owner} → ${n}/${owner})`);
  truth.set(id, { n, owner });
}

function audit(c, prev, v) {
  stats.states++;
  const json = JSON.stringify(v);
  if (json.includes('"token"')) fail(`la vue de ${c.name} contient un jeton`);
  for (const p of v.players) if (keys(p) !== PLAYER_KEYS) fail(`un joueur vu avec ${keys(p)}`);
  if (v.phase !== 'finished' && v.final) fail('un bilan avant la fin');
  if (v.phase !== 'playing') {
    if (v.game) fail('une partie visible hors jeu');
    if (v.phase === 'lobby' && v.players.some((p) => p.seat !== null)) fail('une place hors jeu');
    return;
  }
  const g = v.game;
  if (keys(g) !== GAME_KEYS) fail(`une partie vue avec ${keys(g)}`);
  const me = v.me;
  const seated = me in g.cards;
  const out = g.out.includes(me);
  // Sa main : seulement à soi, et jamais sur la corde.
  if ((!seated || out) && g.hand.length) fail(`${c.name} voit une main sans jouer`);
  if (seated && !out && g.hand.length !== g.inHand[me]) fail(`${c.name} : main de ${g.hand.length}, ${g.inHand[me]} annoncées`);
  for (const h of g.hand) {
    if (!Number.isInteger(h.n) || h.n < 1 || h.n > 100) fail(`${c.name} tient une carte sans nombre`);
    if (g.line.some((x) => x.id === h.id)) fail(`${c.name} : une carte à la fois en main et sur la corde`);
    learn(h.id, h.n, me, c.name);
  }
  const shownN = g.stage === 'result' ? g.line.length : g.revealed;
  if (g.revealed !== shownN) fail(`${c.name} : ${g.revealed} cartes retournées annoncées pour ${shownN}`);
  g.line.forEach((x, i) => {
    if (keys(x) !== CARD_KEYS) fail(`une carte vue avec ${keys(x)}`);
    const open = i < g.revealed;
    if (x.mine) {
      if (x.n === null) fail(`${c.name} ne voit pas le nombre de sa propre carte`);
      if (x.owner !== me) fail(`${c.name} : sa carte attribuée à un autre`);
      learn(x.id, x.n, me, c.name);
    } else {
      if (!open && x.n !== null) fail(`${c.name} voit le nombre caché d'une carte des autres`);
      if (!open && !x.peg && x.owner !== null) fail(`${c.name} sait à qui est une carte à pince en bois`);
      if ((open || x.peg) && !x.owner) fail(`${c.name} ne sait pas à qui est une carte à pince de couleur ou retournée`);
      if (x.owner === me) fail(`${c.name} : une carte à lui qu'il ne reconnaît pas`);
    }
    if (open) {
      const t = truth.get(x.id);
      if (t && (t.n !== x.n || (x.owner && t.owner !== x.owner))) fail(`${c.name} voit ${x.n} pour une carte qui vaut ${t.n}`);
    }
    if (!open && x.wrong) fail(`${c.name} : une carte cachée marquée fausse`);
    if (v.settings.talk === 'voix' && x.idea) fail(`une idée écrite à une table à voix haute`);
  });
  // Les cartes mal rangées, recalculées à partir des nombres retournés.
  const ns = g.line.map((x, i) => (i < g.revealed ? x.n : null));
  g.line.forEach((x, i) => {
    const bad = (i > 0 && ns[i] !== null && ns[i - 1] !== null && ns[i] < ns[i - 1]) || (i + 1 < ns.length && ns[i] !== null && ns[i + 1] !== null && ns[i + 1] < ns[i]);
    if (bad !== x.wrong) fail(`${c.name} : carte ${i + 1} marquée ${x.wrong ? 'fausse' : 'juste'} à tort`);
  });
  if (g.stage === 'result') {
    const win = !g.line.some((x) => x.wrong);
    if (g.win !== win) fail(`${c.name} : manche ${win ? 'réussie' : 'ratée'} annoncée ${g.win}`);
    if (g.candidates.length && (!g.win || v.settings.mode !== 'defi')) fail('des candidats à la carte de plus sans réussite en Défi');
  } else if (g.win !== null || g.candidates.length) fail(`${c.name} : un résultat avant la fin du retournement`);
  if (g.stage === 'theme' ? g.choices.length !== 2 || g.theme : g.choices.length || !g.theme) fail(`${c.name} : thème incohérent (${g.stage})`);
  if (g.theme?.gesture && (v.settings.talk !== 'voix' || !v.settings.gestures)) fail('un thème à mimer interdit par les réglages');
  if (c === host && g.stage === 'result' && prev?.game?.stage !== 'result') {
    seenRounds.push({ round: g.round, ns: g.line.map((x) => x.n), win: g.win, theme: g.theme.id });
    stats.rounds++;
  }
}

/**
 * Comment chaque joueur de test joue : il accroche sa carte près de sa vraie place (il « devine » grâce à la vérité
 * apprise des autres vues, avec une marge d'erreur), bouge parfois, reprend parfois, écrit une idée, puis se dit d'accord.
 */
function decide(c, v, g) {
  const me = v.me;
  if (g.stage === 'theme') {
    if (c !== c.table.chooser) return null;
    if (Math.random() < 0.25 && !c.rerolled) {
      c.rerolled = true;
      return { event: 'theme:reroll' };
    }
    c.rerolled = false;
    return { event: 'theme:pick', payload: { index: Math.floor(Math.random() * 2) } };
  }
  if (g.stage === 'play') {
    const written = v.settings.talk === 'ecrit';
    const careful = c.table.sloppy === 0;
    const rank = (n, without) => g.line.filter((y) => y.id !== without && (truth.get(y.id)?.n ?? 50) < n).length;
    if (g.hand.length) {
      const h = g.hand[0];
      if (written && !h.idea && Math.random() < 0.6) {
        stats.ideas++;
        return { event: 'card:idea', payload: { card: h.id, text: Math.random() < 0.15 ? `presque ${h.n}` : pick(['une souris', 'un chat', 'une girafe', 'la tour Eiffel', 'un caillou']) } };
      }
      // La bonne place selon les nombres connus ; un joueur « à l'aveugle » cette manche accroche au hasard.
      const at = c.blind ? Math.floor(Math.random() * (g.line.length + 1)) : rank(h.n);
      return { event: 'card:place', payload: { card: h.id, at } };
    }
    const mine = g.line.map((x, i) => [x, i]).filter(([x]) => x.mine);
    // Un peu d'hésitation : reprendre une carte, ou la remettre à sa place.
    if (c.fidget > 0 && mine.length) {
      c.fidget--;
      const [x, i] = pick(mine);
      if (Math.random() < 0.25) {
        stats.unhangs++;
        return { event: 'card:unhang', payload: { card: x.id } };
      }
      const gap = c.blind ? Math.floor(Math.random() * g.line.length) : rank(x.n, x.id);
      stats.moves++;
      return { event: 'card:move', payload: { card: x.id, at: gap >= i ? gap + 1 : gap } };
    }
    if (!c.blind) {
      const wrongMine = mine.find(([x, i]) => rank(x.n, x.id) !== i);
      if (wrongMine) {
        const [x, i] = wrongMine;
        const gap = rank(x.n, x.id);
        stats.moves++;
        return { event: 'card:move', payload: { card: x.id, at: gap >= i ? gap + 1 : gap } };
      }
      // À une table soigneuse, on ne dit oui qu'à une corde bien rangée (sinon on attend que les autres corrigent).
      const sorted = g.line.every((y, k) => k === 0 || (truth.get(y.id)?.n ?? 0) > (truth.get(g.line[k - 1].id)?.n ?? 0));
      if (careful && !sorted) return null;
    }
    if (!g.agreed.includes(me)) return { event: 'agree', payload: { agree: true } };
    return null;
  }
  if (g.stage === 'result' && v.settings.mode === 'libre' && g.round >= c.table.libreRounds) return c === host ? { event: 'game:end' } : null;
  if (g.stage === 'result') {
    if (c !== c.table.chooser) return null;
    if (v.settings.mode === 'defi') {
      if (g.win && g.candidates.length) return { event: 'round:gift', payload: { to: pick(g.candidates) } };
      return { event: 'round:next', payload: { round: g.round } };
    }
    return { event: 'round:next', payload: { round: g.round } };
  }
  return null;
}

function client(name, avatar, table) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, avatar, socket, table, view: null, session: null, auto: false, busy: false, waiting: false, fidget: 0, round: 0 };
  socket.on('state', (v) => {
    const prev = c.view;
    c.view = v;
    audit(c, prev, v);
    c.waiting = false;
    if (v.game && v.game.round !== c.round) {
      c.round = v.game.round;
      c.fidget = Math.floor(Math.random() * 3);
      c.blind = Math.random() < c.table.sloppy;
    }
    void play(c);
  });
  socket.on('disconnect', () => (c.view = null));
  c.debug = () => `${c.name}: auto ${c.auto} busy ${c.busy} waiting ${c.waiting} blind ${c.blind} fidget ${c.fidget}`;
  // `mark` : un geste du joueur automatique. L'accusé arrive juste avant le nouvel état, parfois dans la même salve :
  // on note l'attente dès l'accusé, avant que l'état ne soit lu, sinon on l'attendrait pour toujours.
  c.call = (event, payload = {}, mark = false) => {
    stats.gestures++;
    return new Promise((res) =>
      socket.timeout(4000).emit(event, payload, (err, r) => {
        if (err) r = { ok: false, error: 'pas de réponse' };
        if (mark) {
          c.busy = false;
          if (r.ok) c.waiting = true;
        }
        if (!r.ok) stats.refused.set(r.error, (stats.refused.get(r.error) ?? 0) + 1);
        if (r.error === 'Erreur inattendue du serveur.') fail(`${event} : erreur du serveur`);
        res(r);
      }),
    );
  };
  c.timer = setInterval(() => void play(c), 50);
  return c;
}

async function play(c) {
  if (!c.auto || c.busy || c.waiting) return;
  const v = c.view;
  if (!v || v.phase !== 'playing' || !v.game) return;
  const g = v.game;
  if (!(v.me in g.cards) || g.out.includes(v.me)) return;
  const a = decide(c, v, g);
  if (!a) return;
  c.busy = true;
  // Un geste accepté est diffusé à toute la table : on attend ce nouvel état avant de rejouer.
  const r = await c.call(a.event, a.payload ?? {}, true);
  if (r.ok) return;
  if (a.event === 'card:idea' && !/chiffres/.test(r.error)) fail(`idée refusée : ${r.error}`);
  if (a.event === 'card:idea') {
    // L'idée avec un nombre a été refusée comme prévu : on en écrit une autre.
    c.busy = true;
    await c.call('card:idea', { card: a.payload.card, text: 'un ballon' }, true);
  }
}

const connected = (c) => new Promise((r) => (c.socket.connected ? r() : c.socket.once('connect', r)));
async function waitFor(what, test, ms = 5000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (test()) return;
    await pause(15);
  }
  fail(`attente trop longue : ${what}`);
}

async function join(c, code) {
  await connected(c);
  const res = await c.call('room:join', { code, name: c.name, avatar: c.avatar });
  if (!res.ok) fail(`arrivée de ${c.name} : ${res.error}`);
  c.session = res.data;
}

/** Le bilan : chaque manche est celle que l'hôte a vue retournée, et le compte des réussites est juste. */
function checkFinal(final, mode, n) {
  if (final.mode !== mode) fail(`bilan en mode ${final.mode}`);
  if (final.players.length !== n) fail(`bilan à ${final.players.length} joueurs`);
  if (final.rounds.length !== seenRounds.length) fail(`${final.rounds.length} manches au bilan, ${seenRounds.length} vues`);
  final.rounds.forEach((r, k) => {
    const s = seenRounds[k];
    if (r.round !== s.round || r.win !== s.win || r.theme.id !== s.theme) fail(`la manche ${r.round} du bilan diffère`);
    if (r.cards.map((x) => x.n).join(',') !== s.ns.join(',')) fail(`les nombres de la manche ${r.round} diffèrent`);
    for (const x of r.cards) if (!final.players.some((p) => p.id === x.owner)) fail('une carte sans propriétaire au bilan');
  });
  const wins = final.rounds.filter((r) => r.win).length;
  if (final.won !== wins || final.played !== final.rounds.length) fail(`bilan : ${final.won} réussites sur ${final.played}`);
  if (mode === 'defi' && final.rounds.slice(0, -1).some((r) => !r.win)) fail('une série continue après un fil cassé');
}

// ───────────── Partie 1 : Défi à voix haute, 4 joueurs ─────────────
const t1 = { sloppy: 0, chooser: null, libreRounds: 0 };
const ana = client('Ana', 'chaussette', t1);
var host = ana;
globalThis.host = ana;
await connected(ana);
if ((await ana.call('card:place', { card: 'x', at: 0 })).ok) fail('un geste accepté sans table');
const created = await ana.call('room:create', { name: 'Ana', avatar: 'chaussette' });
if (!created.ok) fail(`création : ${created.error}`);
ana.session = created.data;
const code = created.data.code;
if ((await ana.call('game:start')).ok) fail('une partie lancée seul');
const bob = client('Bob', 'chat', t1);
const chloe = client('Chloé', 'abeille', t1);
const dan = client('Dan', 'nuage', t1);
globalThis.everyone = [ana, bob, chloe, dan];
for (const c of [bob, chloe, dan]) await join(c, code);
if ((await bob.call('room:settings', { mode: 'libre' })).ok) fail('un invité a changé les réglages');
if ((await bob.call('game:start')).ok) fail('un invité a lancé la partie');
await ana.call('room:settings', { mode: 'turbo', talk: 'morse', gestures: 'oui' });
await pause(60);
if (ana.view.settings.mode !== 'defi' || ana.view.settings.talk !== 'voix' || ana.view.settings.gestures !== true) fail('des réglages inconnus ont été acceptés');
await waitFor('4 joueurs au salon', () => ana.view.players.length === 4);
const heard = new Promise((r) => bob.socket.once('emote', r));
ana.socket.emit('emote', { emoji: 'Plus haut ?' });
if ((await heard).emoji !== 'Plus haut ?') fail('réaction perdue');

t1.chooser = dan;
if (!(await ana.call('game:start')).ok) fail('lancement refusé');
await waitFor('la partie', () => [ana, bob, chloe, dan].every((c) => c.view?.phase === 'playing'));
const g0 = ana.view.game;
if (g0.stage !== 'theme' || g0.round !== 1 || Object.values(g0.cards).some((n) => n !== 1)) fail('la première donne n’est pas une carte chacun');
if ((await ana.call('card:place', { card: g0.hand[0].id, at: 0 })).ok) fail('une carte accrochée avant le thème');
if ((await ana.call('agree', { agree: true })).ok) fail('un accord avant le thème');

// Une spectatrice arrive : elle voit la corde, jamais une main.
const eve = client('Ève', 'papillon', t1);
await join(eve, code);
await waitFor('Ève spectatrice', () => eve.view?.phase === 'playing');
if (eve.view.players.find((p) => p.id === eve.session.playerId).status !== 'spectator') fail('Ève n’est pas spectatrice');
if ((await eve.call('theme:pick', { index: 0 })).ok) fail('une spectatrice a choisi le thème');

// Première manche, jouée avec soin pour lancer la série.
for (const c of [ana, bob, chloe, dan]) c.auto = true;
await waitFor('la première manche jouée', () => ana.view.game.stage === 'result' || ana.view.game.round > 1, 8000);

// Bob se coupe pendant la deuxième manche : on l'attend 20 s (le test n'attend pas), il revient et reprend sa main.
await waitFor('la deuxième manche', () => ana.view.game.round >= 2 && ana.view.game.stage === 'play', 8000);
bob.auto = false;
const bobHand = bob.view.game.hand.map((h) => h.id).join(',');
const cutRound = bob.view.game.round;
bob.socket.disconnect();
await waitFor('Bob hors ligne', () => ana.view.players.find((p) => p.id === bob.session.playerId)?.connected === false);
if (ana.view.game.out.includes(bob.session.playerId)) fail('Bob est mis de côté sans attendre');
// Un imposteur avec l'identifiant de Bob et un faux jeton : il n'obtient pas sa place.
const imp = client('Imposteur', 'oiseau', t1);
await connected(imp);
const stolen = await imp.call('room:join', { code, name: 'Bob', playerId: bob.session.playerId, token: 'faux', resumeOnly: true });
if (stolen.ok) fail('une session volée a été acceptée');
const sneaky = await imp.call('room:join', { code, name: 'Bob', playerId: bob.session.playerId, token: 'faux' });
if (!sneaky.ok || sneaky.data.playerId === bob.session.playerId) fail('l’imposteur a pris la place de Bob');
imp.session = sneaky.data;
await waitFor('l’imposteur spectateur', () => imp.view?.phase === 'playing');
if (imp.view.game.hand.length) fail('l’imposteur voit une main');
bob.socket.connect();
await connected(bob);
const back = await bob.call('room:join', { ...bob.session, resumeOnly: true });
if (!back.ok || back.data.playerId !== bob.session.playerId) fail('Bob ne retrouve pas sa place');
await waitFor('Bob de retour', () => bob.view?.phase === 'playing');
if (bob.view.game.round === cutRound && bob.view.game.hand.map((h) => h.id).join(',') !== bobHand) fail('Bob ne retrouve pas sa main');
bob.auto = true;

// Chloé quitte la table : la tablée ne l'attend plus, ses cartes en main restent de côté.
await waitFor('une manche en cours', () => ana.view.game.stage === 'play' || ana.view.game.stage === 'theme', 8000);
chloe.auto = false;
await chloe.call('room:leave');
await waitFor('Chloé absente', () => ana.view.game.out.includes(chloe.session.playerId) || ana.view.phase !== 'playing', 4000);
if (ana.view.phase === 'playing' && ana.view.players.find((p) => p.id === chloe.session.playerId)?.away !== true) fail('Chloé n’est pas annoncée absente');

// La suite de la série, plus brouillonne : elle finit par casser.
t1.sloppy = 0.35;
await waitFor('la fin de la partie 1', () => ana.view?.phase === 'finished', 60_000);
checkFinal(ana.view.final, 'defi', 4);
const series = ana.view.final.won;
if (ana.view.best !== series) fail('la meilleure série de la soirée est fausse');
await waitFor('le même bilan partout', () => [bob, dan, eve].every((c) => JSON.stringify(c.view?.final) === JSON.stringify(ana.view.final)));
if (series < 1) fail('la manche soigneuse du début a raté');

// ───────────── Partie 2 : partie libre à l'écrit, à 10 ─────────────
if ((await bob.call('game:restart')).ok) fail('un invité a relancé la partie');
if (!(await ana.call('game:restart')).ok) fail('retour au salon refusé');
await waitFor('le salon', () => ana.view.phase === 'lobby' && !ana.view.final);
if (ana.view.players.some((p) => p.name === 'Chloé')) fail('Chloé, partie, est encore à la table');
seenRounds = [];
const t2 = { sloppy: 0.2, chooser: null, libreRounds: 3 };
for (const c of [ana, bob, dan, eve, imp]) {
  c.table = t2;
  c.auto = false;
}
const more = ['Farah', 'Gus', 'Hugo', 'Iris', 'Jade'].map((n, i) => client(n, ['robe', 'tshirt', 'soleil', 'escargot', 'tournesol'][i], t2));
for (const c of more) await join(c, code);
await waitFor('10 joueurs au salon', () => ana.view.players.filter((p) => p.status !== 'spectator').length === 10, 5000);
const late = client('Lou', 'oiseau', t2);
await connected(late);
if ((await late.call('room:join', { code, name: 'Lou' })).ok) fail('un onzième joueur a été accepté');
if (!(await ana.call('room:settings', { mode: 'libre', talk: 'ecrit', gestures: true })).ok) fail('réglages refusés');
await waitFor('les réglages', () => ana.view.settings.mode === 'libre' && ana.view.settings.talk === 'ecrit');
const players2 = [ana, bob, dan, eve, imp, ...more];
t2.chooser = more[0];
if (!(await ana.call('game:start')).ok) fail('lancement de la partie 2 refusé');
await waitFor('la partie 2', () => players2.every((c) => c.view?.phase === 'playing'));
if ((await bob.call('room:settings', { talk: 'voix' })).ok) fail('des réglages changés en pleine partie');
for (const c of players2) c.auto = true;
await waitFor('la fin de la partie 2', () => ana.view?.phase === 'finished', 60_000);
checkFinal(ana.view.final, 'libre', 10);
if (ana.view.final.played !== 3) fail(`partie libre arrêtée après ${ana.view.final.played} manches`);
const ideas = ana.view.final.rounds.flatMap((r) => r.cards.map((x) => x.idea)).filter(Boolean);
if (!ideas.length) fail('aucune idée écrite au bilan');
if (ideas.some((x) => /[0-9]/.test(x))) fail('une idée avec un chiffre');
const won2 = ana.view.final.won;

// ───────────── La revanche en un clic, puis l'hôte s'en va ─────────────
for (const c of players2) c.auto = false;
if ((await bob.call('game:again')).ok) fail('un invité a lancé la revanche');
if (!(await ana.call('game:again')).ok) fail('revanche refusée');
await waitFor('la revanche', () => players2.every((c) => c.view?.phase === 'playing' && c.view.game.round === 1));
await ana.call('room:leave');
await waitFor('le nouvel hôte', () => bob.view.hostId !== ana.session.playerId && players2.some((c) => c !== ana && c.session.playerId === bob.view.hostId));

const refusals = [...stats.refused].map(([k, n]) => `${n} × « ${k} »`).join(' ; ');
console.log(`✓ partie 1 (Défi, voix, 4 joueurs) : série de ${series} manche${series > 1 ? 's' : ''}.`);
console.log(`✓ partie 2 (libre, écrit, 10 joueurs) : 3 manches, ${won2} réussie${won2 > 1 ? "s" : ""}, ${ideas.length} idées au bilan.`);
console.log(`✓ revanche en un clic, nouvel hôte après le départ d'Ana.`);
console.log(`  ${stats.rounds} manches vérifiées, ${stats.moves} déplacements, ${stats.unhangs} cartes reprises, ${stats.ideas} idées ;`);
console.log(`  ${stats.gestures} gestes, ${stats.states} états vérifiés, ${truth.size} cartes suivies.`);
console.log(`  Refus attendus : ${refusals || 'aucun'}.`);
for (const c of [ana, bob, chloe, dan, eve, imp, late, ...more]) {
  clearInterval(c.timer);
  c.socket.close();
}
server.kill();
process.exit(0);
