// Les mots de la table : noms, listes, élisions.
import { PEG_COLORS, PEG_NAMES, type RoomView } from '../../../shared/protocol';

export function nameOf(view: RoomView, id: string | undefined | null): string {
  if (!id) return '?';
  if (id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « de Rome », mais « d'Opéra » : l'élision devant une voyelle ou un h. */
export function deName(name: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûüœæ]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/** « Léa, Zino et Sam ». */
export function listing(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** La couleur des pinces d'un joueur, d'après sa place (1 à 10). */
export function pegColor(seat: number | null | undefined): string {
  return seat ? PEG_COLORS[(seat - 1) % PEG_COLORS.length] : '#c9a46a';
}

export function pegName(seat: number | null | undefined): string {
  return seat ? PEG_NAMES[(seat - 1) % PEG_NAMES.length] : 'en bois';
}

/** « 1 carte », « 2 cartes ». */
export function cardsLabel(n: number): string {
  return `${n} carte${n > 1 ? 's' : ''}`;
}

/** « 3 manches », « 1 manche ». */
export function roundsLabel(n: number): string {
  return `${n} manche${n > 1 ? 's' : ''}`;
}
