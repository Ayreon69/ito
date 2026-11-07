// Contrat partagé entre le serveur et le client d'Ito : constantes, réglages et vues.
// Chacun ne reçoit que sa propre vue : les nombres des autres restent cachés jusqu'à ce qu'on retourne leurs cartes.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
/** Les cartes vont de 1 à 100, une seule de chaque. */
export const LOW = 1;
export const HIGH = 100;
/** Comme les deux cubes du jeu : deux pinces à la couleur de chacun. Au-delà, des pinces en bois nature, à qui sont-elles ? */
export const PEGS_PER_PLAYER = 2;
/** Une idée écrite tient sur une étiquette. */
export const IDEA_MAX = 40;

/** Défi : une carte de plus après chaque manche réussie, la série s'arrête au premier raté. Libre : une carte chacun, on enchaîne. */
export type Mode = 'defi' | 'libre';
/** À voix haute : on dit ses idées autour de la table. À l'écrit : chacun écrit son idée sur l'étiquette de sa carte. */
export type Talk = 'voix' | 'ecrit';

export const AVATARS = ['chaussette', 'tshirt', 'robe', 'casquette', 'soleil', 'nuage', 'papillon', 'abeille', 'escargot', 'chat', 'oiseau', 'tournesol'] as const;
export const EMOTES = ['👍', '😂', '😮', '🤔', '🙈', '🤞', '👀', '🫶'] as const;
export const TAUNTS = ['Plus haut ?', 'Plus bas ?', 'Juste après toi !', 'On est collés !', 'Je le sens bien'] as const;

/** Les couleurs des pinces, une par place autour de la corde. */
export const PEG_COLORS = ['#e8453c', '#f28c28', '#f2c230', '#7cc242', '#1fa6a0', '#3a8ee6', '#5b5bd6', '#a65bd6', '#e85a9b', '#8a5a3c'] as const;
export const PEG_NAMES = ['rouge', 'orange', 'jaune', 'vert', 'turquoise', 'bleue', 'indigo', 'violette', 'rose', 'marron'] as const;

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface Settings {
  mode: Mode;
  talk: Talk;
  /** Des thèmes à mimer ou à faire entendre (à voix haute seulement). */
  gestures: boolean;
}

export function isMode(v: unknown): v is Mode {
  return v === 'defi' || v === 'libre';
}

export function isTalk(v: unknown): v is Talk {
  return v === 'voix' || v === 'ecrit';
}

/** Un thème : ce qu'on décrit, et ce que veulent dire le 1 et le 100. */
export interface Theme {
  id: number;
  title: string;
  low: string;
  high: string;
  /** À mimer ou à faire entendre. */
  gesture: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  connected: boolean;
  /** Absent depuis plus de 20 secondes : la table ne l'attend plus. */
  away: boolean;
  status: PlayerStatus;
  /** Place autour de la corde, de 1 à 10 (elle donne la couleur des pinces) ; null hors partie. */
  seat: number | null;
}

/** Une carte sur la corde, telle que la voit un joueur. */
export interface LineCard {
  id: string;
  /** À qui elle est : connu de tous seulement si elle tient par une pince de couleur ; toujours connu de son propriétaire. */
  owner: string | null;
  mine: boolean;
  /** Pince de couleur (sinon, bois nature). */
  peg: boolean;
  /** Son nombre : seulement pour soi, ou une fois retournée. */
  n: number | null;
  /** L'idée écrite sur son étiquette (à l'écrit). */
  idea: string;
  /** Retournée et mal rangée : plus grande que la suivante ou plus petite que la précédente. */
  wrong: boolean;
}

export interface HandCard {
  id: string;
  n: number;
  idea: string;
  peg: boolean;
}

export type Stage = 'theme' | 'play' | 'reveal' | 'result';

export interface GameView {
  round: number;
  /** Manches réussies dans cette partie (en Défi, c'est la série en cours). */
  won: number;
  stage: Stage;
  /** Les deux thèmes proposés (avant le choix), puis le thème de la manche. */
  choices: Theme[];
  theme: Theme | null;
  line: LineCard[];
  /** Combien de cartes de la corde sont retournées, en partant du zéro. */
  revealed: number;
  /** Combien de cartes chacun a pour cette manche, et combien il en tient encore en main : tout le monde le voit. */
  cards: Record<string, number>;
  inHand: Record<string, number>;
  agreed: string[];
  /** Ceux dont les cartes restent de côté cette manche (absents). */
  out: string[];
  hand: HandCard[];
  /** La manche est réussie (après la dernière carte retournée). */
  win: boolean | null;
  /** Qui peut prendre une carte de plus (Défi, sur l'écran d'une manche réussie). */
  candidates: string[];
}

export interface RoundCard {
  owner: string;
  n: number;
  idea: string;
  wrong: boolean;
}

export interface RoundSummary {
  round: number;
  theme: Theme;
  cards: RoundCard[];
  win: boolean;
}

export interface FinalView {
  mode: Mode;
  won: number;
  played: number;
  /** La meilleure série de la soirée à cette table (Défi). */
  best: number;
  record: boolean;
  rounds: RoundSummary[];
  players: { id: string; name: string; avatar: string; seat: number; left: boolean }[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  /** Les séries de la soirée à cette table (Défi), pour le salon. */
  best: number;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

/** Une idée ne dit pas de nombre : pas de chiffres (règle du jeu). */
export function cleanIdea(input: unknown): string | { error: string } {
  const raw = typeof input === 'string' ? input : '';
  const text = raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, IDEA_MAX);
  if (/[0-9]/.test(text)) return { error: 'Pas de chiffres dans ton idée\u00a0: elle doit évoquer ton nombre sans le dire.' };
  return text;
}

/** Les cassures du fil : les places i où la carte i est plus petite que la carte d'avant (cartes retournées seulement). */
export function breaksOf(values: (number | null)[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a !== null && b !== null && b < a) out.push(i);
  }
  return out;
}
