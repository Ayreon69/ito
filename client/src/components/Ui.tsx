// Briques d'interface communes : boutons, fenêtres, pastilles, sélecteurs, avatars,
// et le petit monde d'Ito : le ciel du jardin, la corde à linge, ses pinces et ses cartes.
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cls } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'soft' | 'sun';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

// ───────────────────────────── Pinces et cartes ─────────────────────────────

/** Une pince à linge vue de face : deux mâchoires et un ressort. En bois nature quand on ne dit pas à qui elle est. */
export function Peg({ color, className, style }: { color?: string | null; className?: string; style?: CSSProperties }) {
  const wood = !color;
  return (
    <svg className={cls('peg', wood && 'is-wood', className)} viewBox="0 0 20 46" style={style} aria-hidden>
      <path className="peg-jaw" d="M4.5 1.5 Q10 0 15.5 1.5 L14.6 44 Q10 45.6 5.4 44 Z" style={color ? { fill: color } : undefined} />
      <path className="peg-split" d="M10 1 V45" />
      <rect className="peg-spring" x="3" y="17" width="14" height="6.5" rx="2.2" />
      <path className="peg-coil" d="M5.5 19 H14.5 M5.5 21.5 H14.5" />
    </svg>
  );
}

/** Une légère inclinaison propre à chaque carte, comme du linge accroché à la main. */
export function tilt(id: string, amp = 3): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 2 * amp;
}

export interface CardLook {
  /** Le nombre, s'il est visible pour ce joueur. */
  n: number | null;
  /** L'idée écrite (à l'écrit). */
  idea?: string;
  /** Couleur de la pince (sinon, bois nature). */
  peg?: string | null;
  /** L'avatar du propriétaire, s'il est connu. */
  avatar?: string | null;
  /** La carte est à soi, encore cachée aux autres : un coin replié à sa couleur. */
  secret?: boolean;
  wrong?: boolean;
  /** Retournée : visible de tous. */
  open?: boolean;
}

/** La face d'une carte : son nombre (s'il est visible) ou son dos à carreaux, et son étiquette. */
export function CardFace({ look, size = 'fit' }: { look: CardLook; size?: 'fit' | 'sm' | 'md' | 'lg' }) {
  const shown = look.n !== null;
  return (
    <span className={cls('card', size !== 'fit' && `card-${size}`, shown ? 'is-face' : 'is-back', look.secret && 'is-secret', look.open && 'is-open', look.wrong && 'is-wrong')} style={look.peg ? ({ '--pc': look.peg } as CSSProperties) : undefined}>
      {shown ? (
        <>
          <span className="card-n">{look.n}</span>
          {look.idea ? <span className="card-idea">{look.idea}</span> : look.avatar && look.open ? <span className="card-who">{AVATAR_EMOJI[look.avatar] ?? '🧦'}</span> : null}
        </>
      ) : (
        <>
          {look.idea ? <span className="card-idea is-big">{look.idea}</span> : <span className="card-badge">{look.avatar ? AVATAR_EMOJI[look.avatar] ?? '🧦' : '?'}</span>}
          {look.idea && look.avatar && <span className="card-who">{AVATAR_EMOJI[look.avatar] ?? '🧦'}</span>}
        </>
      )}
    </span>
  );
}

// ───────────────────────────── Logo et décor ─────────────────────────────

/** Le titre : trois cartes accrochées sur une corde, i, t, o. Sur la table, seulement l'emblème. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  if (size === 'sm') {
    return (
      <span className="logo logo-sm" role="img" aria-label="Ito">
        <span className="logo-mini" aria-hidden>
          <Peg color="#e8453c" className="logo-mini-peg" />
          <span className="logo-mini-card">ito</span>
        </span>
      </span>
    );
  }
  const letters: { ch: string; peg: string; r: number }[] = [
    { ch: 'i', peg: '#e8453c', r: -5 },
    { ch: 't', peg: '#f2c230', r: 3 },
    { ch: 'o', peg: '#3a8ee6', r: -2 },
  ];
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Ito">
      <svg className="logo-rope" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden>
        <path d="M0 8 Q150 34 300 8" />
      </svg>
      <div className="logo-cards" aria-hidden>
        {letters.map((l, i) => (
          <span key={l.ch} className={cls('logo-card', `is-${i}`)} style={{ '--r': `${l.r}deg` } as CSSProperties}>
            <Peg color={l.peg} className="logo-peg" />
            <span className="logo-ch">{l.ch}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Le décor : un ciel de matin clair, un soleil, des nuages qui passent et l'herbe du jardin. */
export function Backdrop({ children, className, quiet = false }: { children: ReactNode; className?: string; quiet?: boolean }) {
  return (
    <div className={cls('backdrop', quiet && 'is-quiet', className)}>
      <div className="sky" aria-hidden>
        <span className="sun" />
        <span className="cloud is-a" />
        <span className="cloud is-b" />
        <span className="cloud is-c" />
        <svg className="hills" viewBox="0 0 400 60" preserveAspectRatio="none">
          <path className="hill-back" d="M0 34 Q70 10 150 28 T300 22 T400 26 V60 H0 Z" />
          <path className="hill-front" d="M0 44 Q90 26 190 42 T400 38 V60 H0 Z" />
        </svg>
      </div>
      <div className="backdrop-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'ink' | 'soft' | 'red' | 'sun' | 'green'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label, className }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string; className?: string }) {
  return (
    <div className={cls('segmented', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || o.disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/**
 * Une fenêtre, rendue à la racine du document pour ne dépendre d'aucun parent.
 * « sheet » : sur téléphone, elle monte du bas de l'écran, à portée de pouce.
 */
export function Modal({ open, onClose, title, children, wide, sheet, footer, className }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; sheet?: boolean; footer?: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={cls('modal-back', sheet && 'is-sheet')} onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide', sheet && 'is-sheet', className)} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  chaussette: '🧦',
  tshirt: '👕',
  robe: '👗',
  casquette: '🧢',
  soleil: '☀️',
  nuage: '☁️',
  papillon: '🦋',
  abeille: '🐝',
  escargot: '🐌',
  chat: '🐈',
  oiseau: '🐦',
  tournesol: '🌻',
};

export const AVATAR_LABELS: Record<string, string> = {
  chaussette: 'Chaussette',
  tshirt: 'T-shirt',
  robe: 'Robe',
  casquette: 'Casquette',
  soleil: 'Soleil',
  nuage: 'Nuage',
  papillon: 'Papillon',
  abeille: 'Abeille',
  escargot: 'Escargot',
  chat: 'Chat',
  oiseau: 'Oiseau',
  tournesol: 'Tournesol',
};

/** L'avatar d'un joueur, cerclé à la couleur de ses pinces quand il en a. */
export function Avatar({ avatar, color, className }: { avatar: string; color?: string | null; className?: string }) {
  return (
    <span className={cls('avatar', color && 'has-ring', className)} style={color ? ({ '--pc': color } as CSSProperties) : undefined} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '🧦'}
    </span>
  );
}
