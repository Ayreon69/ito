// La table : le thème de la manche, la corde à linge, la tablée et sa main. On choisit un thème ensemble,
// chacun accroche ses cartes où il pense qu'elles vont, puis, quand tout le monde est d'accord, on retourne.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BookOpen, Check, Flag, Hand, LogOut, MoreHorizontal, RefreshCw, Shuffle, Smile, Undo2, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { EMOTES, IDEA_MAX, PEGS_PER_PLAYER, PEG_COLORS, TAUNTS, cleanIdea, type GameView, type HandCard, type LineCard, type RoomView, type Theme } from '../../../shared/protocol';
import { Line, type Selection } from '../components/Line';
import { Avatar, Button, CardFace, Logo, Modal, Peg } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cardsLabel, deName, listing, pegColor, pegName, roundsLabel } from '../lib/text';
import { cls, reducedMotion, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore } from '../store';

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" role="menu" aria-label="Réactions" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" role="menuitem" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" role="menuitem" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/** La règle du thème : ce que veulent dire le 1 et le 100. Avec un repère, celui de sa propre carte. */
export function Scale({ theme, n }: { theme: Theme; n?: number | null }) {
  return (
    <span className={cls('scale', n != null && 'has-mark')}>
      <span className="scale-bar" aria-hidden>
        {n != null && <span className="scale-mark" style={{ left: `${n}%` }} />}
      </span>
      <span className="scale-ends">
        <span className="scale-end is-low">
          <b>1</b>{' '}{theme.low}
        </span>
        <span className="scale-end is-high">
          {theme.high}{' '}<b>100</b>
        </span>
      </span>
    </span>
  );
}

/** L'écriteau du thème de la manche. */
function ThemeSign({ theme }: { theme: Theme }) {
  return (
    <motion.section className={cls('sign', theme.gesture && 'is-gesture')} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
      <span className="sign-eyebrow">{theme.gesture ? 'À mimer ou à faire entendre' : 'Le thème'}</span>
      <h2 className="sign-title">{theme.title}</h2>
      <Scale theme={theme} />
      {theme.gesture && <p className="sign-note">Tout le monde fait le geste ou le bruit, plus ou moins fort selon son nombre. Pas un mot de plus&nbsp;!</p>}
    </motion.section>
  );
}

/** Deux thèmes au choix : n'importe qui à la table peut trancher. */
function ThemeChoice({ g, active }: { g: GameView; active: boolean }) {
  return (
    <section className="choice" aria-label="Choix du thème">
      <h2 className="choice-title">{active ? 'Choisissez un thème ensemble' : 'La tablée choisit un thème'}</h2>
      <div className="choice-list">
        {g.choices.map((t, i) => (
          <motion.button
            key={t.id}
            type="button"
            className={cls('choice-card', t.gesture && 'is-gesture')}
            disabled={!active}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 300, damping: 22 }}
            onClick={() => {
              sfx.theme();
              void send('theme:pick', { index: i });
            }}
          >
            <span className="sign-eyebrow">{t.gesture ? 'À mimer ou à faire entendre' : `Thème ${i + 1}`}</span>
            <b className="choice-name">{t.title}</b>
            <Scale theme={t} />
          </motion.button>
        ))}
      </div>
      {active && (
        <Button
          variant="ghost"
          className="choice-reroll"
          icon={<Shuffle size={17} />}
          onClick={() => {
            sfx.tap();
            void send('theme:reroll');
          }}
        >
          Deux autres thèmes
        </Button>
      )}
    </section>
  );
}

/** La tablée : chacun, la couleur de ses pinces, ses cartes encore en main et son accord. */
function Crew({ view, g }: { view: RoomView; g: GameView }) {
  const seated = view.players.filter((p) => p.seat !== null && p.id in g.cards).sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  return (
    <ul className={cls('crew', seated.length > 5 && 'is-many')} aria-label="La tablée">
      {seated.map((p) => {
        const out = g.out.includes(p.id);
        const hand = g.inHand[p.id] ?? 0;
        const agreed = g.agreed.includes(p.id);
        const color = pegColor(p.seat);
        return (
          <li key={p.id} className={cls('mate', p.id === view.me && 'is-me', out && 'is-out', agreed && g.stage === 'play' && 'is-agreed')} style={{ '--pc': color } as CSSProperties}>
            <span className="mate-face">
              <Avatar avatar={p.avatar} color={color} />
              {g.stage === 'play' && !out && (
                <span className={cls('mate-state', agreed ? 'is-ok' : hand ? 'is-hand' : 'is-think')} aria-hidden>
                  {agreed ? <Check size={12} strokeWidth={3.5} /> : hand ? hand : '…'}
                </span>
              )}
              {!p.connected && !out && (
                <span className="mate-off" aria-hidden>
                  <WifiOff size={11} />
                </span>
              )}
            </span>
            <span className="mate-name">{p.id === view.me ? 'Toi' : p.name}</span>
            <span className="sr-only">
              {`, pinces ${pegName(p.seat)}, ${cardsLabel(g.cards[p.id] ?? 1)}`}
              {out ? ', absent cette manche' : g.stage === 'play' ? (agreed ? ', d’accord' : hand ? `, ${cardsLabel(hand)} en main` : ', réfléchit') : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function HandCardButton({ c, color, selected, onClick, disabled }: { c: HandCard; color: string; selected: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <motion.button
      layoutId={`c-${c.id}`}
      type="button"
      className={cls('hand-card', selected && 'is-selected')}
      aria-pressed={selected}
      aria-label={`Ta carte ${c.n}${c.peg ? '' : ', pince en bois'}`}
      disabled={disabled}
      onClick={onClick}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <Peg color={c.peg ? color : null} className="hand-peg" />
      <CardFace look={{ n: c.n, idea: c.idea, peg: c.peg ? color : null, secret: true }} size="lg" />
    </motion.button>
  );
}

/** L'idée écrite sur l'étiquette d'une de ses cartes (à l'écrit). */
function IdeaField({ card }: { card: { id: string; n: number | null; idea: string } }) {
  const [draft, setDraft] = useState(card.idea);
  const [error, setError] = useState('');
  const sent = useRef(card.idea);
  useEffect(() => {
    setDraft(card.idea);
    sent.current = card.idea;
    setError('');
  }, [card.id, card.idea]);
  const commit = () => {
    const clean = cleanIdea(draft);
    if (typeof clean !== 'string') {
      setError(clean.error);
      return;
    }
    setError('');
    if (clean === sent.current) return;
    sent.current = clean;
    void send('card:idea', { card: card.id, text: clean });
  };
  return (
    <div className="idea-field">
      <label className="field-label" htmlFor={`idea-${card.id}`}>
        Ton idée pour le {card.n}
      </label>
      <input
        id={`idea-${card.id}`}
        className="input idea-input"
        value={draft}
        maxLength={IDEA_MAX}
        placeholder="Ex. une girafe"
        enterKeyHint="done"
        autoComplete="off"
        onChange={(e) => {
          setDraft(e.target.value);
          setError(/[0-9]/.test(e.target.value) ? 'Pas de chiffres : ton idée doit évoquer ton nombre sans le dire.' : '');
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {error && (
        <p className="idea-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Le bilan d'une manche, sous la corde retournée. */
function Result({ view, g, seated }: { view: RoomView; g: GameView; seated: boolean }) {
  const isHost = view.hostId === view.me;
  const defi = view.settings.mode === 'defi';
  const wrong = g.line.filter((c) => c.wrong).length;
  const host = view.players.find((p) => p.id === view.hostId);
  /** La carte de plus sera la deuxième de quelqu'un : elle tiendra par une pince de couleur. */
  const second = g.candidates.every((id) => (g.cards[id] ?? 1) < PEGS_PER_PLAYER);
  return (
    <div className={cls('result', g.win ? 'is-win' : 'is-loss')}>
      <motion.div className="stamp" initial={{ scale: 1.7, rotate: -16, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 15 }}>
        <b>{g.win ? 'Bien rangé !' : 'Le fil a cassé'}</b>
        <small>{g.win ? (defi ? `Série : ${roundsLabel(g.won)}` : `${g.won} réussie${g.won > 1 ? 's' : ''} sur ${g.round}`) : `${wrong} cartes mal rangées`}</small>
      </motion.div>
      {g.win && defi && g.candidates.length > 0 && (
        <div className="gift">
          <p className="dock-say">
            <b>Qui prend une carte de plus&nbsp;?</b>{' '}
            {!second ? 'Sa nouvelle carte tiendra par une pince en bois : à qui est-elle ?' : g.candidates.length < Object.keys(g.cards).length ? 'Tant que tout le monde n’en a pas deux, c’est l’un de ceux qui n’en ont qu’une.' : 'Sa deuxième carte tiendra aussi par une pince à sa couleur.'}
          </p>
          <div className="gift-list">
            {g.candidates.map((id) => {
              const p = view.players.find((x) => x.id === id);
              if (!p) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className="gift-btn"
                  disabled={!seated}
                  onClick={() => {
                    sfx.tap();
                    void send('round:gift', { to: id });
                  }}
                >
                  <Avatar avatar={p.avatar} color={pegColor(p.seat)} />
                  <span className="gift-text">
                    <span className="gift-name">{id === view.me ? 'Moi' : p.name}</span>
                    <small>{`passe à ${cardsLabel((g.cards[id] ?? 1) + 1)}`}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!g.win && (
        <p className="dock-say">
          {defi ? (
            <>
              La série s’arrête à <b>{roundsLabel(g.won)}</b>. En rouge, les cartes qui ne sont pas à leur place.
            </>
          ) : (
            'En rouge, les cartes qui ne sont pas à leur place. On en refait une ?'
          )}
        </p>
      )}
      {g.win && defi && !g.candidates.length && <p className="dock-say">Plus une seule carte à distribuer&nbsp;: quelle série&nbsp;!</p>}
      {seated ? (
        <div className="result-actions">
          {(!defi || !g.win || !g.candidates.length) && (
            <Button
              variant="primary"
              className="btn-lg btn-wide"
              icon={defi ? <Flag size={19} /> : <RefreshCw size={19} />}
              onClick={() => {
                sfx.tap();
                void send('round:next', { round: g.round });
              }}
            >
              {defi ? 'Voir le bilan' : 'Manche suivante'}
            </Button>
          )}
          {!defi && isHost && (
            <Button variant="ghost" icon={<Flag size={17} />} onClick={() => void send('game:end')}>
              Terminer la partie
            </Button>
          )}
        </div>
      ) : (
        <p className="dock-say muted">La tablée décide de la suite{host ? ` avec ${host.name}` : ''}.</p>
      )}
    </div>
  );
}

export function Table({ view }: { view: RoomView }) {
  const g = view.game!;
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const emotes = useStore((s) => s.emotes);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [tray, setTray] = useState(false);
  const [chosen, setChosen] = useState<Selection | null>(null);
  const [notice, setNotice] = useState('');
  const isHost = view.hostId === view.me;
  const seated = view.me in g.cards;
  const out = g.out.includes(view.me);
  const active = seated && !out;
  const written = view.settings.talk === 'ecrit';
  const defi = view.settings.mode === 'defi';
  const mePlayer = view.players.find((p) => p.id === view.me);
  const myColor = pegColor(mePlayer?.seat);
  const canPlace = active && g.stage === 'play';

  // La carte choisie : celle qu'on a touchée, sinon la première de sa main.
  const myLine = g.line.filter((c) => c.mine);
  let sel: Selection | null = chosen && ((chosen.kind === 'hand' && g.hand.some((c) => c.id === chosen.id)) || (chosen.kind === 'line' && myLine.some((c) => c.id === chosen.id))) ? chosen : null;
  if (!sel && active && (g.stage === 'play' || g.stage === 'theme') && g.hand.length) sel = { kind: 'hand', id: g.hand[0].id };
  const current = sel;
  const selCard = current ? (current.kind === 'hand' ? g.hand.find((c) => c.id === current.id) : myLine.find((c) => c.id === current.id)) : undefined;
  const selIndex = current?.kind === 'line' ? g.line.findIndex((c) => c.id === current.id) : -1;

  // ── Les sons et les gestes de la table ──
  const prev = useRef<{ round: number; stage: string; revealed: number; lineKey: string; agreed: boolean } | null>(null);
  const mine = useRef(0);
  const lineKey = g.line.map((c) => c.id).join(',');
  const agreedMe = g.agreed.includes(view.me);
  useEffect(() => {
    const p = prev.current;
    prev.current = { round: g.round, stage: g.stage, revealed: g.revealed, lineKey, agreed: agreedMe };
    if (!p) return;
    const fresh = performance.now() - mine.current < 900;
    if (g.round !== p.round) {
      sfx.wind();
      setChosen(null);
      setNotice('');
      return;
    }
    if (g.stage === 'play' && p.stage === 'theme' && !fresh) sfx.theme();
    if (g.revealed > p.revealed && g.stage !== 'play') {
      const i = g.revealed - 1;
      const a = g.line[i - 1]?.n;
      const b = g.line[i]?.n;
      const broke = i > 0 && a != null && b != null && b < a;
      sfx.flip(i);
      if (broke) {
        window.setTimeout(() => sfx.snap(), 160);
        vibrate([30, 40, 30]);
      }
      document.querySelector(`[data-hung="${g.line[i]?.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    if (g.stage === 'result' && p.stage !== 'result') {
      // Le bilan se place sous la corde retournée : on le fait monter à l'écran sans perdre la corde de vue.
      window.setTimeout(() => document.querySelector('.dock.is-result')?.scrollIntoView({ block: 'end', behavior: reducedMotion() ? 'auto' : 'smooth' }), 250);
      window.setTimeout(() => {
        sfx.fanfare(!!g.win);
        if (g.win) {
          vibrate([20, 40, 20, 40, 60]);
          void confetti({ particleCount: 150, spread: 95, origin: { y: 0.45 }, colors: [...PEG_COLORS], shapes: ['square'], scalar: 0.9, disableForReducedMotion: true });
        }
      }, 380);
    }
    if (lineKey !== p.lineKey && g.stage === 'play' && !fresh) sfx.clip();
    if (p.agreed && !agreedMe && g.stage === 'play' && !fresh) {
      setNotice('La corde a bougé : redis si tu es d’accord.');
      vibrate(20);
    }
    if (agreedMe) setNotice('');
  }, [g.round, g.stage, g.revealed, lineKey, agreedMe, g.line, g.win]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const act = () => {
    mine.current = performance.now();
  };

  const onGap = (gap: number) => {
    if (!current) return;
    act();
    sfx.hang();
    vibrate(12);
    void send(current.kind === 'hand' ? 'card:place' : 'card:move', { card: current.id, at: gap });
    setChosen(null);
  };

  const onCard = (c: LineCard, i: number) => {
    if (c.mine && canPlace) {
      sfx.pick();
      setChosen(current?.kind === 'line' && current.id === c.id ? null : { kind: 'line', id: c.id });
      return;
    }
    // Les autres cartes : on rappelle à qui elles sont, comme on le demanderait à voix haute.
    const owner = c.owner ? view.players.find((p) => p.id === c.owner) : null;
    const who = c.mine ? 'Ta carte' : owner ? `La carte ${deName(owner.name)}` : 'Pince en bois : à qui est cette carte ?';
    const what = i < g.revealed && c.n !== null ? ` : ${c.n}` : '';
    useStore.getState().showToast(`${who}${what}${c.idea && written ? ` — « ${c.idea} »` : ''}`, 'info');
  };

  const moveBy = (d: -1 | 1) => {
    if (selIndex < 0 || !current) return;
    act();
    sfx.hang();
    void send('card:move', { card: current.id, at: d < 0 ? selIndex - 1 : selIndex + 2 });
  };

  const agree = () => {
    act();
    if (!agreedMe) sfx.agree();
    else sfx.tap();
    vibrate(10);
    void send('agree', { agree: !agreedMe });
  };

  const playing = Object.keys(g.cards).filter((id) => !g.out.includes(id));
  const waiting = playing.filter((id) => id !== view.me && (!g.agreed.includes(id) || (g.inHand[id] ?? 0) > 0));
  const waitingNames = waiting.map((id) => view.players.find((p) => p.id === id)?.name ?? '?');

  // ── Ce que dit la main ──
  let say: ReactNode = null;
  if (!seated) say = 'Tu regardes la partie : tu joueras à la prochaine.';
  else if (out) say = 'Tu joueras à la prochaine manche : tes cartes restent de côté pour celle-ci.';
  else if (g.stage === 'theme') say = g.hand.length > 1 ? 'Regarde tes cartes, puis choisissez le thème.' : 'Regarde ta carte, puis choisissez le thème.';
  else if (g.stage === 'play') {
    if (current?.kind === 'hand' && selCard)
      say = (
        <>
          {written ? 'Écris' : 'Décris'} ton <b>{selCard.n}</b> {written ? 'avec une idée du thème' : 'à voix haute'}, sans dire de nombre, puis touche un <span className="say-plus">+</span> sur la corde pour l’accrocher.
        </>
      );
    else if (current?.kind === 'line' && selCard)
      say = (
        <>
          Ton <b>{selCard.n}</b> : touche un autre <span className="say-plus">+</span> pour le déplacer, ou reprends-le en main.
        </>
      );
    else if (agreedMe) say = waiting.length ? <>D’accord&nbsp;! On attend {listing(waitingNames)}.</> : 'D’accord : on retourne !';
    else say = waiting.length ? 'Tes cartes sont accrochées. Discutez, touchez-en une pour la déplacer, puis dis si tu es d’accord.' : 'Tout le monde est d’accord, sauf toi. On retourne ?';
  } else if (g.stage === 'reveal') say = 'On retourne les cartes, de gauche à droite…';

  const theme = g.theme;

  return (
    <div className="table-screen">
      <div className="sky is-quiet" aria-hidden>
        <span className="sun" />
        <span className="cloud is-a" />
        <span className="cloud is-b" />
      </div>
      <header className="table-top">
        <Logo size="sm" />
        <div className="table-round">
          <b>Manche {g.round}</b>
          <small>{defi ? `Série : ${g.won}` : `${g.won} réussie${g.won > 1 ? 's' : ''}`}</small>
        </div>
        <div className="table-tools">
          <button type="button" className={cls('icon-btn', tray && 'is-on')} aria-label="Réagir" aria-expanded={tray} onClick={() => setTray((t) => !t)}>
            <Smile size={22} />
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={22} />
          </button>
        </div>
        <AnimatePresence>{tray && <ReactionTray onClose={() => setTray(false)} />}</AnimatePresence>
      </header>

      <div className="emote-stack" aria-live="polite">
        <AnimatePresence>
          {emotes.map((e) => {
            const p = view.players.find((x) => x.id === e.playerId);
            return (
              <motion.span key={e.id} className="emote-chip" initial={{ y: -10, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -6 }}>
                {p && <Avatar avatar={p.avatar} color={pegColor(p.seat)} />}
                <span className="emote-who">{p ? (p.id === view.me ? 'Toi' : p.name) : '?'}</span>
                <span className="emote-what">{e.emoji}</span>
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>

      <main className="table-main">
        {g.stage === 'theme' ? <ThemeChoice g={g} active={active} /> : theme && <ThemeSign key={theme.id} theme={theme} />}
        <Crew view={view} g={g} />
        <Line view={view} g={g} sel={current} canPlace={canPlace} onCard={onCard} onGap={onGap} />
      </main>

      <section className={cls('dock', g.stage === 'result' && 'is-result')} aria-label={g.stage === 'result' ? 'Résultat de la manche' : 'Ta main'}>
        {g.stage === 'result' ? (
          <Result view={view} g={g} seated={seated} />
        ) : (
          <>
            {active && g.hand.length > 0 && (
              <div className="hand">
                {g.hand.map((c) => (
                  <HandCardButton
                    key={c.id}
                    c={c}
                    color={myColor}
                    selected={g.stage === 'play' && current?.kind === 'hand' && current.id === c.id}
                    disabled={g.stage !== 'play'}
                    onClick={() => {
                      sfx.pick();
                      setChosen({ kind: 'hand', id: c.id });
                    }}
                  />
                ))}
              </div>
            )}
            {say && <p className="dock-say">{say}</p>}
            {notice && (
              <motion.p className="dock-notice" role="status" initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                {notice}
              </motion.p>
            )}
            {theme && selCard && selCard.n !== null && g.stage === 'play' && <Scale theme={theme} n={selCard.n} />}
            {written && canPlace && selCard && <IdeaField card={selCard} />}
            {canPlace && current?.kind === 'line' && (
              <div className="move-row">
                <Button icon={<ArrowLeft size={18} />} aria-label="Décaler vers la gauche" disabled={selIndex <= 0} onClick={() => moveBy(-1)} />
                <Button
                  icon={<Undo2 size={18} />}
                  onClick={() => {
                    act();
                    sfx.pick();
                    void send('card:unhang', { card: current.id });
                    setChosen(null);
                  }}
                >
                  Reprendre
                </Button>
                <Button icon={<ArrowRight size={18} />} aria-label="Décaler vers la droite" disabled={selIndex < 0 || selIndex >= g.line.length - 1} onClick={() => moveBy(1)} />
                <Button variant="soft" icon={<Check size={18} />} onClick={() => setChosen(null)}>
                  OK
                </Button>
              </div>
            )}
            {canPlace && !g.hand.length && current?.kind !== 'line' && (
              <Button variant={agreedMe ? 'soft' : 'sun'} className="btn-lg btn-wide agree-btn" icon={agreedMe ? <Undo2 size={19} /> : <Hand size={20} />} onClick={agree}>
                {agreedMe ? 'Je ne suis plus d’accord' : 'Je suis d’accord'}
              </Button>
            )}
            {g.stage === 'reveal' && (
              <div className="reveal-dots" aria-hidden>
                {g.line.map((c, i) => (
                  <span key={c.id} className={cls('rd', i < g.revealed && 'is-on', c.wrong && 'is-bad')} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son : {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              disabled={g.stage === 'reveal'}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:end');
              }}
            >
              {confirmStop ? 'Confirmer : arrêter pour tout le monde' : 'Arrêter la partie'}
            </Button>
          )}
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}
