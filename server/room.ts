// Une table d'Ito : salon, manches, cartes sur la corde, absents, retournement minuté et vue de chacun.
// Tout se passe à la vue de tous (comme sur une vraie table) : seuls les nombres restent cachés jusqu'au retournement.
import crypto from 'node:crypto';
import {
  AVATARS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  cleanIdea,
  isMode,
  isTalk,
  type FinalView,
  type GameView,
  type PlayerStatus,
  type RoomView,
  type Settings,
  type Theme,
} from '../shared/protocol';
import { Game, shuffle } from './game';
import { THEMES } from './themes';

const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que la table ne l'attende plus. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (IT_FAST=1) : les cartes se retournent en un éclair. */
const FAST = process.env.IT_FAST === '1';
const T = {
  firstFlip: FAST ? 40 : 900,
  flip: FAST ? 30 : 1_150,
} as const;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { mode: 'defi', talk: 'voix', gestures: true };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  /** La meilleure série de la soirée (Défi). */
  best = 0;
  /** Séries de Défi déjà finies ce soir : un record ne compte qu'à partir de la deuxième. */
  series = 0;
  /** Les thèmes déjà joués ce soir : on ne les repropose qu'une fois tous passés. */
  private usedThemes = new Set<number>();
  /** Prochaine carte à retourner. */
  private flipAt = 0;
  lastActive = Date.now();
  onChange: () => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined | null): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    if (this.phase === 'lobby' && this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p: Player = {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      sockets: new Set(),
      connected: false,
      disconnectedAt: Date.now(),
      left: false,
      status: this.phase === 'lobby' ? 'lobby' : 'spectator',
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa place reste : ses cartes en main restent de côté, la table ne l'attend plus.
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else {
      p.left = true;
      this.syncAway();
    }
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.left && p.connected && p.status !== 'spectator') ?? this.players.find((p) => !p.left && p.connected) ?? this.players.find((p) => !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
    this.syncAway();
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAway(p: Player): boolean {
    return p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if (isMode(payload.mode)) this.settings.mode = payload.mode;
    if (isTalk(payload.talk)) this.settings.talk = payload.talk;
    if (typeof payload.gestures === 'boolean') this.settings.gestures = payload.gestures;
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  /** Deux thèmes encore jamais joués ce soir (les thèmes à mimer seulement à voix haute, et si l'hôte les veut). */
  private drawThemes = (): Theme[] => {
    const allowed = THEMES.filter((t) => !t.gesture || (this.settings.talk === 'voix' && this.settings.gestures));
    let pool = allowed.filter((t) => !this.usedThemes.has(t.id));
    if (pool.length < 2) {
      for (const t of allowed) this.usedThemes.delete(t.id);
      pool = allowed;
    }
    // Un thème à mimer de temps en temps, pas à chaque manche.
    const plain = shuffle(pool.filter((t) => !t.gesture));
    const moves = shuffle(pool.filter((t) => t.gesture));
    const first = plain.shift() ?? moves.shift();
    const second = moves.length && crypto.randomInt(3) === 0 ? moves.shift() : plain.shift() ?? moves.shift();
    const picks = [first, second].filter((t): t is Theme => !!t);
    for (const t of picks) this.usedThemes.add(t.id);
    return shuffle(picks);
  };

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs.`;
    for (const p of seated) p.status = 'playing';
    const order = shuffle(seated.map((p) => p.id));
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game(order, this.settings.mode, this.drawThemes);
    this.game.deal();
    this.syncAway();
    this.phase = 'playing';
    this.final = null;
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    this.flipAt = 0;
    return undefined;
  }

  /** Revanche en un clic : retour au salon puis nouvelle partie avec la même tablée (si elle compte encore assez de joueurs). */
  again(by: string): string | undefined {
    const err = this.restart(by);
    if (err) return err;
    this.start(by);
    return undefined;
  }

  /** L'hôte arrête la partie en cours : on passe au bilan (rien n'est perdu de ce qui a été joué). */
  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    if (this.game?.stage === 'reveal') return 'Attendez la fin du retournement.';
    this.finishGame();
    return undefined;
  }

  private playing(by: string): Game | string {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return "Aucune partie n'est en cours.";
    if (!g.has(by)) return 'Tu regardes la partie\u00a0: tu joueras à la prochaine.';
    return g;
  }

  /** Les joueurs présents, dans l'ordre de la table. */
  private present(): string[] {
    const g = this.game;
    if (!g) return [];
    return g.order.filter((id) => {
      const p = this.get(id);
      return !!p && !this.isAway(p);
    });
  }

  /** Les absents ne jouent pas la manche (leurs cartes en main restent de côté) ; un revenu reprend sa place tant qu'on n'a pas retourné. */
  private syncAway(): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    for (const id of g.order) {
      const p = this.get(id);
      if (!p) continue;
      if (this.isAway(p)) {
        g.out.add(id);
        g.agreed.delete(id);
      } else if (g.out.has(id) && (g.stage === 'theme' || g.stage === 'play')) g.out.delete(id);
    }
    this.maybeReveal();
  }

  pickTheme(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    return g.chooseTheme(payload.index);
  }

  reroll(by: string): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    return g.reroll();
  }

  place(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    return g.place(by, payload.card, payload.at);
  }

  move(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    return g.move(by, payload.card, payload.at);
  }

  unhang(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    return g.unhang(by, payload.card);
  }

  idea(by: string, payload: Record<string, unknown>): string | undefined {
    if (this.settings.talk !== 'ecrit') return 'À cette table, les idées se disent à voix haute.';
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const text = cleanIdea(payload.text);
    if (typeof text !== 'string') return text.error;
    return g.setIdea(by, payload.card, text);
  }

  agree(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const err = g.agree(by, payload.agree === true);
    if (err) return err;
    this.maybeReveal();
    return undefined;
  }

  /** Tout le monde est d'accord : on retourne les cartes une à une, depuis le zéro. */
  private maybeReveal(): void {
    const g = this.game;
    if (!g || this.phase !== 'playing' || !g.ready(this.present())) return;
    g.startReveal();
    this.flipAt = Date.now() + T.firstFlip;
  }

  /** Défi, manche réussie : un joueur prend une carte de plus, et la manche suivante commence. */
  gift(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const err = g.giveCard(String(payload.to ?? ''), this.present());
    if (err) return err;
    this.syncAway();
    return undefined;
  }

  /** Après le résultat : manche suivante en Libre, bilan après un raté en Défi. */
  next(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    if (g.stage !== 'result') return undefined;
    // Le client dit quelle manche il a vue : un second appui sur un écran déjà passé ne saute pas la suivante.
    if (Number(payload.round) !== g.round) return undefined;
    if (g.mode === 'defi') {
      // Une manche ratée arrête la série ; une réussie continue par le choix de la carte de plus (sauf s'il n'y en a plus).
      if (!g.win || !g.candidates(this.present()).length) this.finishGame();
      return undefined;
    }
    g.deal();
    this.syncAway();
    return undefined;
  }

  private finishGame(): void {
    const g = this.game;
    if (!g) return;
    const before = this.best;
    const earlier = this.series;
    if (g.mode === 'defi') {
      this.best = Math.max(this.best, g.won);
      this.series++;
    }
    this.final = {
      mode: g.mode,
      won: g.won,
      played: g.history.length,
      best: this.best,
      record: g.mode === 'defi' && earlier > 0 && g.won > before,
      rounds: g.history.map((r) => ({ ...r, cards: r.cards.map((c) => ({ ...c })) })),
      players: g.order.map((id, i) => {
        const p = this.get(id);
        return { id, name: p?.name ?? '?', avatar: p?.avatar ?? AVATARS[0], seat: i + 1, left: !!p?.left };
      }),
    };
    this.phase = 'finished';
    this.flipAt = 0;
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries et diffusion ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis envoie l'état à toute la table. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  private dueAt(): number {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return Infinity;
    let due = g.stage === 'reveal' && this.flipAt ? this.flipAt : Infinity;
    // Un absent passe « parti » au bout du délai : la table ne doit plus l'attendre.
    const now = Date.now();
    for (const id of g.order) {
      const p = this.get(id);
      if (p && !p.left && !p.connected && p.disconnectedAt + GRACE_MS > now) due = Math.min(due, p.disconnectedAt + GRACE_MS);
    }
    return due;
  }

  private reschedule(): void {
    this.clearTimer();
    const due = this.dueAt();
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      // Une minuterie peut sonner un poil avant l'échéance : on se rendort sans rien diffuser.
      if (Date.now() < due) {
        this.reschedule();
        return;
      }
      try {
        this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(due - Date.now(), 2_147_000_000)));
  }

  /** Fait avancer la table : absents, carte suivante à retourner. */
  tick(): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    this.syncAway();
    if (g.stage === 'reveal' && this.flipAt && Date.now() >= this.flipAt) {
      g.revealNext();
      this.flipAt = g.stage === 'reveal' ? Date.now() + T.flip : 0;
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  private gameView(g: Game, viewerId: string): GameView {
    const seen = g.stage === 'result' ? g.line.length : g.revealed;
    const wrong = g.wrongSet(seen);
    const cards: Record<string, number> = {};
    const inHand: Record<string, number> = {};
    for (const id of g.order) {
      cards[id] = g.counts.get(id) ?? 1;
      inHand[id] = g.out.has(id) ? 0 : g.hands.get(id)?.length ?? 0;
    }
    return {
      round: g.round,
      won: g.won,
      stage: g.stage,
      choices: g.stage === 'theme' ? g.choices.map((t) => ({ ...t })) : [],
      theme: g.theme ? { ...g.theme } : null,
      line: g.line.map((id, i) => {
        const c = g.cards.get(id)!;
        const mine = c.owner === viewerId;
        const open = i < seen;
        return {
          id: c.id,
          owner: mine || c.peg || open ? c.owner : null,
          mine,
          peg: c.peg,
          n: mine || open ? c.n : null,
          idea: this.settings.talk === 'ecrit' ? c.idea : '',
          wrong: open && wrong.has(i),
        };
      }),
      revealed: seen,
      cards,
      inHand,
      agreed: [...g.agreed],
      out: [...g.out],
      hand: g.has(viewerId) && !g.out.has(viewerId) ? g.handOf(viewerId).map((c) => ({ id: c.id, n: c.n, idea: c.idea, peg: c.peg })) : [],
      win: g.stage === 'result' ? g.win : null,
      candidates: g.stage === 'result' && g.win && g.mode === 'defi' ? g.candidates(this.present()) : [],
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => {
        const seat = g ? g.order.indexOf(p.id) : this.final ? this.final.players.findIndex((x) => x.id === p.id) : -1;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isHost: p.id === this.hostId,
          connected: p.connected,
          away: p.status === 'playing' && this.isAway(p),
          status: p.status,
          seat: seat >= 0 ? seat + 1 : null,
        };
      }),
      game: g ? this.gameView(g, viewerId) : null,
      final: this.final,
      best: this.best,
      serverNow: Date.now(),
    };
  }
}
