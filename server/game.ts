// Moteur d'Ito, sans réseau : donne, thème, cartes accrochées sur la corde, accord de la table, retournement, série.
import crypto from 'node:crypto';
import { HIGH, LOW, PEGS_PER_PLAYER, breaksOf, type Mode, type RoundSummary, type Stage, type Theme } from '../shared/protocol';

export interface Card {
  id: string;
  n: number;
  owner: string;
  /** Tenue par une pince de sa couleur (les deux premières de chacun). */
  peg: boolean;
  idea: string;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardId(): string {
  return crypto.randomBytes(6).toString('base64url');
}

export class Game {
  readonly order: string[];
  readonly mode: Mode;
  round = 0;
  /** Manches réussies (en Défi : la série en cours). */
  won = 0;
  stage: Stage = 'theme';
  choices: Theme[] = [];
  theme: Theme | null = null;
  /** Combien de cartes chacun reçoit à chaque donne. */
  counts = new Map<string, number>();
  cards = new Map<string, Card>();
  /** Les cartes que chacun tient encore en main, dans l'ordre de la donne. */
  hands = new Map<string, string[]>();
  /** La corde, du zéro vers la droite. */
  line: string[] = [];
  agreed = new Set<string>();
  /** Ceux qui ne jouent pas cette manche (absents) : leurs cartes en main restent de côté. */
  out = new Set<string>();
  revealed = 0;
  win: boolean | null = null;
  history: RoundSummary[] = [];

  constructor(order: string[], mode: Mode, private readonly draw: () => Theme[]) {
    this.order = [...order];
    this.mode = mode;
    for (const id of order) this.counts.set(id, 1);
  }

  has(id: string): boolean {
    return this.order.includes(id);
  }

  /** Une nouvelle manche : on rebat les cent cartes, chacun reçoit les siennes, deux thèmes sont proposés. */
  deal(): void {
    this.round++;
    const deck = shuffle(Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i));
    this.cards.clear();
    this.hands.clear();
    for (const id of this.order) {
      const ids: string[] = [];
      for (let k = 0; k < (this.counts.get(id) ?? 1); k++) {
        const c: Card = { id: cardId(), n: deck.pop()!, owner: id, peg: k < PEGS_PER_PLAYER, idea: '' };
        this.cards.set(c.id, c);
        ids.push(c.id);
      }
      // Plus petite d'abord dans la main : on la lit plus facilement.
      ids.sort((a, b) => this.cards.get(a)!.n - this.cards.get(b)!.n);
      this.hands.set(id, ids);
    }
    this.line = [];
    this.agreed.clear();
    this.revealed = 0;
    this.win = null;
    this.theme = null;
    this.choices = this.draw();
    this.stage = 'theme';
  }

  reroll(): string | undefined {
    if (this.stage !== 'theme') return 'Le thème est déjà choisi.';
    this.choices = this.draw();
    return undefined;
  }

  chooseTheme(index: unknown): string | undefined {
    if (this.stage !== 'theme') return 'Le thème est déjà choisi.';
    const i = Number(index);
    const t = this.choices[i];
    if (!Number.isInteger(i) || !t) return 'Thème inconnu.';
    this.theme = t;
    this.stage = 'play';
    return undefined;
  }

  handOf(id: string): Card[] {
    return (this.hands.get(id) ?? []).map((c) => this.cards.get(c)!);
  }

  private own(by: string, cardId: unknown): Card | string {
    if (this.stage !== 'play') return this.stage === 'theme' ? 'Choisissez d’abord le thème.' : 'Les cartes sont déjà retournées.';
    if (this.out.has(by)) return 'Tu joueras à la prochaine manche.';
    const c = typeof cardId === 'string' ? this.cards.get(cardId) : undefined;
    if (!c || c.owner !== by) return 'Ce n’est pas ta carte.';
    return c;
  }

  private gap(at: unknown, max: number): number | null {
    const i = Number(at);
    return Number.isInteger(i) && i >= 0 && i <= max ? i : null;
  }

  /** Accrocher une carte de sa main sur la corde, à la place `at` (0 : tout contre le zéro). */
  place(by: string, cardId: unknown, at: unknown): string | undefined {
    const c = this.own(by, cardId);
    if (typeof c === 'string') return c;
    const hand = this.hands.get(by)!;
    if (!hand.includes(c.id)) return 'Cette carte est déjà sur la corde.';
    const i = this.gap(at, this.line.length);
    if (i === null) return 'Place inconnue.';
    hand.splice(hand.indexOf(c.id), 1);
    this.line.splice(i, 0, c.id);
    this.agreed.clear();
    return undefined;
  }

  /** Déplacer une de ses cartes déjà accrochées vers l'écart `at` de la corde actuelle (0 : avant la première). */
  move(by: string, cardId: unknown, at: unknown): string | undefined {
    const c = this.own(by, cardId);
    if (typeof c === 'string') return c;
    const from = this.line.indexOf(c.id);
    if (from < 0) return 'Cette carte n’est pas sur la corde.';
    const g = this.gap(at, this.line.length);
    if (g === null) return 'Place inconnue.';
    const to = g > from ? g - 1 : g;
    if (to === from) return undefined;
    this.line.splice(from, 1);
    this.line.splice(to, 0, c.id);
    this.agreed.clear();
    return undefined;
  }

  /** Reprendre une carte accrochée dans sa main. */
  unhang(by: string, cardId: unknown): string | undefined {
    const c = this.own(by, cardId);
    if (typeof c === 'string') return c;
    const from = this.line.indexOf(c.id);
    if (from < 0) return 'Cette carte n’est pas sur la corde.';
    this.line.splice(from, 1);
    const hand = this.hands.get(by)!;
    hand.push(c.id);
    hand.sort((a, b) => this.cards.get(a)!.n - this.cards.get(b)!.n);
    this.agreed.clear();
    return undefined;
  }

  setIdea(by: string, cardId: unknown, text: string): string | undefined {
    const c = this.own(by, cardId);
    if (typeof c === 'string') return c;
    if (c.idea === text) return undefined;
    c.idea = text;
    this.agreed.clear();
    return undefined;
  }

  agree(by: string, yes: boolean): string | undefined {
    if (this.stage !== 'play') return 'Il n’y a rien à valider pour l’instant.';
    if (!this.has(by) || this.out.has(by)) return 'Tu joueras à la prochaine manche.';
    if (yes && (this.hands.get(by)?.length ?? 0) > 0) return 'Accroche d’abord toutes tes cartes.';
    if (yes) this.agreed.add(by);
    else this.agreed.delete(by);
    return undefined;
  }

  /** Tous ceux qui jouent ont accroché leurs cartes et sont d'accord : on retourne. */
  ready(active: string[]): boolean {
    if (this.stage !== 'play' || !this.line.length) return false;
    const playing = active.filter((id) => !this.out.has(id));
    return playing.length > 0 && playing.every((id) => this.agreed.has(id) && !(this.hands.get(id)?.length ?? 0));
  }

  startReveal(): void {
    this.stage = 'reveal';
    this.revealed = 0;
  }

  values(upTo = this.line.length): (number | null)[] {
    return this.line.map((id, i) => (i < upTo ? this.cards.get(id)!.n : null));
  }

  /** Les cartes mal rangées parmi les retournées : les deux de part et d'autre de chaque cassure. */
  wrongSet(upTo = this.revealed): Set<number> {
    const out = new Set<number>();
    for (const i of breaksOf(this.values(upTo))) {
      out.add(i - 1);
      out.add(i);
    }
    return out;
  }

  /** On retourne la carte suivante ; après la dernière, la manche est jouée. */
  revealNext(): void {
    if (this.stage !== 'reveal') return;
    this.revealed = Math.min(this.line.length, this.revealed + 1);
    if (this.revealed < this.line.length) return;
    const wrong = this.wrongSet(this.line.length);
    this.win = wrong.size === 0;
    if (this.win) this.won++;
    this.history.push({
      round: this.round,
      theme: this.theme!,
      win: this.win,
      cards: this.line.map((id, i) => {
        const c = this.cards.get(id)!;
        return { owner: c.owner, n: c.n, idea: c.idea, wrong: wrong.has(i) };
      }),
    });
    this.stage = 'result';
  }

  /** Défi : qui peut prendre une carte de plus. Tant que tout le monde n'en a pas deux, une de ceux qui n'en ont qu'une. */
  candidates(present: string[]): string[] {
    const total = [...this.counts.values()].reduce((a, b) => a + b, 0);
    if (total >= HIGH - LOW + 1) return [];
    const here = this.order.filter((id) => present.includes(id));
    const short = here.filter((id) => (this.counts.get(id) ?? 1) < PEGS_PER_PLAYER);
    return short.length ? short : here;
  }

  /** Défi, manche réussie : un joueur prend une carte de plus, et la manche suivante commence. */
  giveCard(to: string, present: string[]): string | undefined {
    if (this.stage !== 'result' || !this.win || this.mode !== 'defi') return 'Ce n’est pas le moment.';
    if (!this.candidates(present).includes(to)) return 'Ce joueur ne peut pas prendre de carte de plus.';
    this.counts.set(to, (this.counts.get(to) ?? 1) + 1);
    this.deal();
    return undefined;
  }
}
