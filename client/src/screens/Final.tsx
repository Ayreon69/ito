// Fin de partie : la série (ou le compte des manches réussies), le record de la soirée,
// puis toutes les cordes de la partie, retournées, avec les idées de chacun. Revanche en un clic.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { Check, LogOut, RotateCcw, Settings2, Trophy, X } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { PEG_COLORS, type RoomView } from '../../../shared/protocol';
import { Avatar, Backdrop, Button, CardFace, Logo, Peg } from '../components/Ui';
import { sfx } from '../lib/sound';
import { pegColor, roundsLabel } from '../lib/text';
import { cls } from '../lib/util';
import { leaveRoom, send } from '../net';

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  const host = view.players.find((p) => p.id === view.hostId);
  const defi = final.mode === 'defi';
  const good = final.won > 0;
  const seatOf = new Map(final.players.map((p) => [p.id, p]));
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!good) return;
    const t = window.setTimeout(() => {
      sfx.fanfare(true);
      void confetti({ particleCount: 170, spread: 100, origin: { y: 0.3 }, colors: [...PEG_COLORS], shapes: ['square'], scalar: 0.9, disableForReducedMotion: true });
    }, 450);
    return () => window.clearTimeout(t);
  }, [good]);

  const title = defi ? (good ? roundsLabel(final.won) : 'Pas de série') : `${final.won} sur ${final.played}`;
  const sub = defi
    ? good
      ? `réussie${final.won > 1 ? 's' : ''} d’affilée`
      : 'le fil a cassé dès la première manche'
    : `manche${final.played > 1 ? 's' : ''} bien rangée${final.won > 1 ? 's' : ''}`;

  return (
    <Backdrop quiet className="final">
      <div className="final-wrap">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="final-hero" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span className="eyebrow">{defi ? 'Votre série' : 'Partie libre'}</span>
          <motion.div className={cls('final-score', good ? 'is-good' : 'is-bad')} initial={{ scale: 1.5, rotate: -10, opacity: 0 }} animate={{ scale: 1, rotate: -3, opacity: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 14 }}>
            <b>{title}</b>
            <small>{sub}</small>
          </motion.div>
          {final.record && (
            <motion.p className="record" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }}>
              <Trophy size={16} aria-hidden /> Record de la soirée&nbsp;!
            </motion.p>
          )}
          {defi && final.best > final.won && (
            <p className="best-note">
              <Trophy size={15} aria-hidden /> Meilleure série ce soir&nbsp;: <b>{roundsLabel(final.best)}</b>
            </p>
          )}
          <ul className="final-crew" aria-label="La tablée">
            {final.players.map((p) => (
              <li key={p.id} className={cls(p.left && 'is-left')}>
                <Avatar avatar={p.avatar} color={pegColor(p.seat)} />
                <span>{p.id === view.me ? 'Toi' : p.name}</span>
              </li>
            ))}
          </ul>
        </motion.section>

        <div className="final-actions">
          {isHost ? (
            <>
              <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:again')}>
                Rejouer
              </Button>
              <Button variant="ghost" icon={<Settings2 size={18} />} onClick={() => void send('game:restart')}>
                Changer les réglages
              </Button>
            </>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente que {host?.name ?? 'l’hôte'} relance une partie…
            </div>
          )}
        </div>

        {final.rounds.length > 0 && (
          <section className="history" aria-label="Les manches de la partie">
            <h3 className="history-title">Les cordes de la partie</h3>
            {final.rounds.map((r) => (
              <article key={r.round} className={cls('round', r.win ? 'is-win' : 'is-loss')}>
                <header className="round-head">
                  <span className={cls('round-mark', r.win ? 'is-win' : 'is-loss')} aria-label={r.win ? 'Réussie' : 'Ratée'}>
                    {r.win ? <Check size={14} strokeWidth={3.5} /> : <X size={14} strokeWidth={3.5} />}
                  </span>
                  <span className="round-title">
                    <small>Manche {r.round}</small>
                    <b>{r.theme.title}</b>
                  </span>
                  <span className="round-scale">
                    1 {r.theme.low} · {r.theme.high} 100
                  </span>
                </header>
                <div className="round-line">
                  {r.cards.map((c, i) => {
                    const p = seatOf.get(c.owner);
                    const color = pegColor(p?.seat);
                    return (
                      <span key={i} className="round-card" style={{ '--pc': color } as CSSProperties}>
                        <Peg color={color} className="round-peg" />
                        <CardFace look={{ n: c.n, idea: c.idea, peg: color, avatar: p?.avatar, open: true, wrong: c.wrong }} size="sm" />
                      </span>
                    );
                  })}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </Backdrop>
  );
}
