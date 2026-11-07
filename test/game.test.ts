// Moteur d'Ito : donne, thème, corde (accrocher, déplacer, reprendre), accord, retournement, cassures, défi.
import { describe, expect, it } from 'vitest';
import { breaksOf, cleanIdea, type Theme } from '../shared/protocol';
import { Game } from '../server/game';
import { THEMES } from '../server/themes';

const T1: Theme = { id: 1, title: 'Un animal', low: 'petit', high: 'grand', gesture: false };
const T2: Theme = { id: 2, title: 'Un plat', low: 'fade', high: 'bon', gesture: false };
const draw = () => [T1, T2];

function game(order = ['a', 'b', 'c'], mode: 'defi' | 'libre' = 'defi') {
  const g = new Game(order, mode, draw);
  g.deal();
  return g;
}

/** Fixe les nombres des cartes pour un test (la donne est au hasard). */
function force(g: Game, values: Record<string, number[]>) {
  for (const [id, ns] of Object.entries(values)) {
    g.handOf(id).forEach((c, i) => (c.n = ns[i]));
    g.hands.get(id)!.sort((x, y) => g.cards.get(x)!.n - g.cards.get(y)!.n);
  }
}

function hangAll(g: Game, order: string[]) {
  for (const id of order) for (const c of g.handOf(id)) expect(g.place(id, c.id, g.line.length)).toBeUndefined();
}

describe('la donne', () => {
  it('donne une carte chacun, toutes différentes, de 1 à 100, avec une pince de couleur', () => {
    const g = game(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    const all = [...g.cards.values()];
    expect(all).toHaveLength(10);
    expect(new Set(all.map((c) => c.n)).size).toBe(10);
    for (const c of all) {
      expect(c.n).toBeGreaterThanOrEqual(1);
      expect(c.n).toBeLessThanOrEqual(100);
      expect(c.peg).toBe(true);
    }
    expect(g.stage).toBe('theme');
    expect(g.choices).toHaveLength(2);
    expect(g.round).toBe(1);
  });

  it('range la main du plus petit au plus grand, et la troisième carte tient par une pince en bois', () => {
    const g = new Game(['a', 'b'], 'defi', draw);
    g.counts.set('a', 3);
    g.deal();
    const hand = g.handOf('a');
    expect(hand).toHaveLength(3);
    expect(hand.map((c) => c.n)).toEqual([...hand.map((c) => c.n)].sort((x, y) => x - y));
    expect(hand.filter((c) => c.peg)).toHaveLength(2);
  });

  it('a assez de thèmes, tous complets et uniques par identifiant', () => {
    expect(THEMES.filter((t) => !t.gesture).length).toBeGreaterThanOrEqual(120);
    expect(THEMES.filter((t) => t.gesture).length).toBeGreaterThanOrEqual(12);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    for (const t of THEMES) {
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.low.length).toBeGreaterThan(1);
      expect(t.high.length).toBeGreaterThan(1);
      expect(/[0-9]/.test(t.title + t.low + t.high)).toBe(false);
    }
  });
});

describe('le thème', () => {
  it('se choisit avant de jouer, et ne se change plus ensuite', () => {
    const g = game();
    const c = g.handOf('a')[0];
    expect(g.place('a', c.id, 0)).toMatch(/thème/);
    expect(g.chooseTheme(5)).toBe('Thème inconnu.');
    expect(g.chooseTheme(1)).toBeUndefined();
    expect(g.theme).toEqual(T2);
    expect(g.stage).toBe('play');
    expect(g.chooseTheme(0)).toMatch(/déjà/);
    expect(g.reroll()).toMatch(/déjà/);
  });
});

describe('la corde', () => {
  it('accroche, déplace et reprend ses cartes, jamais celles des autres', () => {
    const g = game();
    g.chooseTheme(0);
    force(g, { a: [10], b: [50], c: [90] });
    const [a] = g.handOf('a');
    const [b] = g.handOf('b');
    const [c] = g.handOf('c');
    expect(g.place('a', b.id, 0)).toMatch(/pas ta carte/);
    expect(g.place('b', b.id, 0)).toBeUndefined();
    expect(g.place('a', a.id, 1)).toBeUndefined();
    expect(g.place('c', c.id, 1)).toBeUndefined();
    expect(g.line).toEqual([b.id, c.id, a.id]);
    expect(g.place('a', a.id, 0)).toMatch(/déjà sur la corde/);
    expect(g.place('a', 'xyz', 0)).toMatch(/pas ta carte/);
    expect(g.move('a', a.id, 9)).toBe('Place inconnue.');
    // L'écart 0 : avant la première carte.
    expect(g.move('a', a.id, 0)).toBeUndefined();
    expect(g.line).toEqual([a.id, b.id, c.id]);
    // Vers la droite : l'écart 2 (entre b et c) place a juste avant c.
    expect(g.move('a', a.id, 2)).toBeUndefined();
    expect(g.line).toEqual([b.id, a.id, c.id]);
    // Tout au bout.
    expect(g.move('a', a.id, 3)).toBeUndefined();
    expect(g.line).toEqual([b.id, c.id, a.id]);
    // Une place qui ne change rien.
    expect(g.move('a', a.id, 3)).toBeUndefined();
    expect(g.move('a', a.id, 2)).toBeUndefined();
    expect(g.line).toEqual([b.id, c.id, a.id]);
    expect(g.move('b', a.id, 0)).toMatch(/pas ta carte/);
    expect(g.unhang('a', a.id)).toBeUndefined();
    expect(g.line).toEqual([b.id, c.id]);
    expect(g.handOf('a').map((x) => x.id)).toEqual([a.id]);
    expect(g.unhang('a', a.id)).toMatch(/pas sur la corde/);
  });

  it('remet sa main dans l’ordre quand on reprend une carte', () => {
    const g = new Game(['a', 'b'], 'defi', draw);
    g.counts.set('a', 3);
    g.deal();
    g.chooseTheme(0);
    force(g, { a: [20, 40, 60], b: [80] });
    const [x, y, z] = g.handOf('a');
    g.place('a', y.id, 0);
    expect(g.handOf('a').map((c) => c.n)).toEqual([20, 60]);
    g.unhang('a', y.id);
    expect(g.handOf('a').map((c) => c.n)).toEqual([20, 40, 60]);
    expect([x.n, z.n]).toEqual([20, 60]);
  });

  it('écrit des idées sans chiffres', () => {
    expect(cleanIdea('  une   girafe ')).toBe('une girafe');
    expect(cleanIdea('<b>chat</b>')).toBe('bchat/b');
    expect(cleanIdea('à peu près 50')).toEqual({ error: expect.stringMatching(/chiffres/) });
    expect(cleanIdea('x'.repeat(80))).toHaveLength(40);
    expect(cleanIdea(42)).toBe('');
  });
});

describe('l’accord', () => {
  it('demande toutes ses cartes accrochées, et tombe dès que la corde ou une idée change', () => {
    const g = game(['a', 'b']);
    g.chooseTheme(0);
    force(g, { a: [10], b: [90] });
    const [a] = g.handOf('a');
    const [b] = g.handOf('b');
    expect(g.agree('a', true)).toMatch(/Accroche/);
    g.place('a', a.id, 0);
    expect(g.agree('a', true)).toBeUndefined();
    expect(g.ready(['a', 'b'])).toBe(false);
    g.place('b', b.id, 1);
    expect(g.agreed.size).toBe(0);
    g.agree('a', true);
    g.agree('b', true);
    expect(g.ready(['a', 'b'])).toBe(true);
    g.setIdea('b', b.id, 'une baleine');
    expect(g.agreed.size).toBe(0);
    expect(g.ready(['a', 'b'])).toBe(false);
    g.agree('a', true);
    g.agree('b', true);
    g.agree('b', false);
    expect(g.ready(['a', 'b'])).toBe(false);
  });

  it('n’attend pas les absents : leurs cartes restent de côté', () => {
    const g = game(['a', 'b', 'c']);
    g.chooseTheme(0);
    g.out.add('c');
    for (const id of ['a', 'b']) for (const c of g.handOf(id)) g.place(id, c.id, 0);
    expect(g.place('c', g.handOf('c')[0].id, 0)).toMatch(/prochaine/);
    g.agree('a', true);
    g.agree('b', true);
    expect(g.ready(['a', 'b', 'c'])).toBe(true);
  });
});

describe('le retournement', () => {
  it('trouve les cassures et les cartes mal rangées de part et d’autre', () => {
    expect(breaksOf([5, 10, 7, 20, 15])).toEqual([2, 4]);
    expect(breaksOf([5, null, 3])).toEqual([]);
    expect(breaksOf([1, 2, 3])).toEqual([]);
  });

  it('retourne carte après carte, et réussit une corde bien rangée', () => {
    const g = game();
    g.chooseTheme(0);
    force(g, { a: [12], b: [47], c: [88] });
    hangAll(g, ['a', 'b', 'c']);
    for (const id of g.order) g.agree(id, true);
    expect(g.ready(g.order)).toBe(true);
    g.startReveal();
    g.revealNext();
    expect(g.revealed).toBe(1);
    expect(g.stage).toBe('reveal');
    g.revealNext();
    g.revealNext();
    expect(g.stage).toBe('result');
    expect(g.win).toBe(true);
    expect(g.won).toBe(1);
    expect(g.history).toHaveLength(1);
    expect(g.history[0].cards.map((c) => c.n)).toEqual([12, 47, 88]);
  });

  it('casse le fil quand deux cartes sont à l’envers', () => {
    const g = game();
    g.chooseTheme(0);
    force(g, { a: [12], b: [47], c: [88] });
    hangAll(g, ['b', 'a', 'c']);
    g.startReveal();
    g.revealNext();
    expect(g.wrongSet().size).toBe(0);
    g.revealNext();
    expect([...g.wrongSet()].sort()).toEqual([0, 1]);
    g.revealNext();
    expect(g.win).toBe(false);
    expect(g.won).toBe(0);
    expect(g.history[0].cards.map((c) => c.wrong)).toEqual([true, true, false]);
  });
});

describe('le défi', () => {
  it('donne une carte de plus d’abord à ceux qui n’en ont qu’une, puis à n’importe qui', () => {
    const g = game(['a', 'b']);
    g.chooseTheme(0);
    force(g, { a: [10], b: [90] });
    hangAll(g, ['a', 'b']);
    expect(g.giveCard('a', ['a', 'b'])).toMatch(/moment/);
    g.startReveal();
    g.revealNext();
    g.revealNext();
    expect(g.win).toBe(true);
    expect(g.candidates(['a', 'b'])).toEqual(['a', 'b']);
    expect(g.giveCard('z', ['a', 'b'])).toMatch(/ne peut pas/);
    expect(g.giveCard('a', ['a', 'b'])).toBeUndefined();
    expect(g.round).toBe(2);
    expect(g.stage).toBe('theme');
    expect(g.handOf('a')).toHaveLength(2);
    expect(g.handOf('b')).toHaveLength(1);
    expect(g.candidates(['a', 'b'])).toEqual(['b']);
    // Absente, b ne peut pas recevoir : on choisit parmi les présents.
    expect(g.candidates(['a'])).toEqual(['a']);
  });

  it('refuse la carte de plus en partie libre ou après un raté', () => {
    const g = game(['a', 'b'], 'libre');
    g.chooseTheme(0);
    force(g, { a: [10], b: [90] });
    hangAll(g, ['b', 'a']);
    g.startReveal();
    g.revealNext();
    g.revealNext();
    expect(g.win).toBe(false);
    expect(g.giveCard('a', ['a', 'b'])).toMatch(/moment/);
  });

  it('n’a plus de carte à donner quand le paquet est épuisé', () => {
    const g = game(['a', 'b']);
    g.counts.set('a', 50);
    g.counts.set('b', 50);
    expect(g.candidates(['a', 'b'])).toEqual([]);
  });
});
