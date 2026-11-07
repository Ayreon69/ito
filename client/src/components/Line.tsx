// La corde à linge : les cartes accrochées du plus petit (à gauche) au plus grand, sur une ou plusieurs rangées
// qui se lisent comme une page. Entre deux cartes, une place où accrocher ou déplacer la sienne.
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { breaksOf, type GameView, type LineCard, type RoomView } from '../../../shared/protocol';
import { pegColor } from '../lib/text';
import { cls } from '../lib/util';
import { CardFace, Peg, tilt } from './Ui';

export interface Selection {
  kind: 'hand' | 'line';
  id: string;
}

/** Une carte qui se retourne quand elle passe de cachée à visible (pas quand on arrive sur une corde déjà retournée). */
function Flip({ open, children }: { open: boolean; children: React.ReactNode }) {
  const first = useRef(open);
  return (
    <motion.span
      className="flip"
      key={open ? 'o' : 'c'}
      initial={open && !first.current ? { rotateY: -100, scale: 1.12 } : false}
      animate={{ rotateY: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: [0.2, 0.9, 0.3, 1.15] }}
    >
      {children}
    </motion.span>
  );
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(340);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Les dimensions de la corde : taille des cartes, des places entre elles, et combien tiennent par rangée. */
export function lineLayout(width: number, count: number, written: boolean) {
  const desired = width / (written ? 5 : 6.2);
  const fit = width / (1.38 * Math.max(1, Math.ceil(count / 3)) + 0.38);
  const cw = Math.round(Math.max(written ? 66 : 52, Math.min(desired, fit, written ? 116 : 100)));
  const sw = Math.round(cw * 0.38);
  const per = Math.max(2, Math.floor((width - sw) / (cw + sw)));
  return { cw, sw, per };
}

export function Line({
  view,
  g,
  sel,
  canPlace,
  onCard,
  onGap,
}: {
  view: RoomView;
  g: GameView;
  sel: Selection | null;
  /** On peut accrocher ou déplacer la carte choisie. */
  canPlace: boolean;
  onCard: (c: LineCard, i: number) => void;
  onGap: (gap: number) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const written = view.settings.talk === 'ecrit';
  const { cw, sw, per } = lineLayout(width, g.line.length + (canPlace && sel?.kind === 'hand' ? 1 : 0), written);
  const seatOf = (id: string | null) => (id ? view.players.find((p) => p.id === id)?.seat ?? null : null);
  const avatarOf = (id: string | null) => (id ? view.players.find((p) => p.id === id)?.avatar ?? null : null);
  const from = sel?.kind === 'line' ? g.line.findIndex((c) => c.id === sel.id) : -1;
  const values = g.line.map((c, i) => (i < g.revealed ? c.n : null));
  const breaks = new Set(breaksOf(values));

  const rows: number[][] = [];
  for (let i = 0; i < g.line.length; i += per) rows.push(Array.from({ length: Math.min(per, g.line.length - i) }, (_, k) => i + k));
  if (!rows.length) rows.push([]);
  const rowW = per * (cw + sw) + sw;
  const cardH = Math.round(cw * 1.36);
  const pegH = Math.round(cw * 0.46);
  const rowH = Math.round(cw * 0.3) + cardH + Math.round(cw * 0.22);
  const sag = Math.max(4, Math.round(cw * 0.12));
  /** La flèche de la corde à l'abscisse x : les cartes suivent sa courbe. */
  const drop = (x: number) => sag * (1 - ((x - rowW / 2) / (rowW / 2)) ** 2);

  const slot = (gap: number, x: number) => {
    const useless = from >= 0 && (gap === from || gap === from + 1);
    const show = canPlace && !!sel && !useless;
    const broken = breaks.has(gap);
    return (
      <span key={`s${gap}`} className="slot-cell" style={{ left: x, width: sw, top: Math.round(cw * 0.3) + drop(x + sw / 2), height: cardH }}>
        {show ? (
          <button type="button" className="slot" aria-label={gap === 0 ? 'Accrocher ici, tout à gauche' : gap === g.line.length ? 'Accrocher ici, tout à droite' : `Accrocher ici, entre la carte ${gap} et la carte ${gap + 1}`} onClick={() => onGap(gap)}>
            <span className="slot-dot">
              <Plus size={Math.max(14, Math.round(cw * 0.26))} strokeWidth={3} />
            </span>
          </button>
        ) : broken ? (
          <span className="snap" aria-label="Le fil casse ici">
            ⚡
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <div className={cls('line', canPlace && sel && 'is-placing', written && 'is-written')} style={{ '--cw': `${cw}px`, '--sw': `${sw}px` } as CSSProperties}>
      <div ref={ref} className="line-inner">
      {rows.map((row, r) => {
        const last = r === rows.length - 1;
        return (
          <div key={r} className="line-row" style={{ width: rowW, height: rowH }}>
            <svg className="rope" viewBox={`0 0 ${rowW} ${sag * 2 + 12}`} width={rowW} height={sag * 2 + 12} aria-hidden>
              <path className="rope-cord" d={`M0 6 Q${rowW / 2} ${6 + sag * 2} ${rowW} 6`} />
              <path className="rope-twist" d={`M0 6 Q${rowW / 2} ${6 + sag * 2} ${rowW} 6`} />
            </svg>
            {r === 0 && <span className="rope-end is-low">1</span>}
            {last && <span className="rope-end is-high">100</span>}
            {row.map((i, k) => {
              const c = g.line[i];
              const x = sw + k * (cw + sw);
              const open = i < g.revealed;
              const owner = c.owner;
              const color = c.peg && owner ? pegColor(seatOf(owner)) : null;
              const selected = sel?.kind === 'line' && sel.id === c.id;
              return [
                slot(i, x - sw),
                <motion.button
                  key={c.id}
                  layoutId={`c-${c.id}`}
                  data-hung={c.id}
                  type="button"
                  className={cls('hung', c.mine && 'is-mine', selected && 'is-selected', open && 'is-open', c.wrong && 'is-wrong')}
                  style={{ left: x, top: drop(x + cw / 2), width: cw }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  aria-pressed={c.mine && g.stage === 'play' ? selected : undefined}
                  aria-label={
                    c.n !== null
                      ? `${c.mine && !open ? 'Ta carte' : 'Carte'} ${c.n}${c.idea ? `, « ${c.idea} »` : ''}`
                      : `Carte cachée${owner ? '' : ', pince en bois'}${c.idea ? `, « ${c.idea} »` : ''}`
                  }
                  onClick={() => onCard(c, i)}
                >
                  <span className="hung-swing" style={{ '--tilt': `${tilt(c.id, 3)}deg`, '--delay': `${(tilt(c.id, 1) + 1) * -2}s` } as CSSProperties}>
                    <Peg color={color} className="hung-peg" style={{ height: pegH }} />
                    <Flip open={open}>
                      <CardFace
                        look={{
                          n: c.n,
                          idea: written ? c.idea : '',
                          peg: color,
                          avatar: avatarOf(owner),
                          secret: c.mine && !open,
                          open,
                          wrong: c.wrong,
                        }}
                      />
                    </Flip>
                  </span>
                </motion.button>,
              ];
            })}
            {last && slot(g.line.length, row.length ? sw + row.length * (cw + sw) - sw : 0)}
          </div>
        );
      })}
      </div>
      {!g.line.length && (
        <p className="line-empty">{g.stage === 'theme' ? 'Les cartes s’accrocheront ici, de la plus petite à la plus grande.' : canPlace ? 'Touche le + pour accrocher la première carte.' : 'La corde attend sa première carte.'}</p>
      )}
    </div>
  );
}
