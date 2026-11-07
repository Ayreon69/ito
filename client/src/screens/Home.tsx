// Accueil : une petite corde à linge qui montre le jeu en trois cartes ; pseudo + avatar, créer ou rejoindre une table, règles.
import { motion } from 'framer-motion';
import { BookOpen, House, LogIn, MessageSquare, Plus, Users } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { AVATAR_EMOJI, AVATAR_LABELS, Backdrop, Button, CardFace, Logo, Peg } from '../components/Ui';
import { cls, reducedMotion } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

/** Les exemples de la corde : un thème, et trois idées qui se retournent en nombres. */
const DEMO: { title: string; low: string; high: string; cards: [string, number][] }[] = [
  { title: 'La taille d’un animal', low: 'minuscule', high: 'énorme', cards: [['une fourmi', 6], ['un chat', 41], ['une baleine', 93]] },
  { title: 'Un plat', low: 'immangeable', high: 'délicieux', cards: [['la soupe froide', 14], ['des pâtes', 58], ['le gâteau de mamie', 97]] },
  { title: 'Ce qui fait peur', low: 'pas du tout', high: 'cauchemar', cards: [['un papillon', 3], ['l’orage', 47], ['un requin', 88]] },
];
const PEGS = ['#e8453c', '#f2c230', '#3a8ee6'];
const TILT = [-4, 2.5, -1.5];

function HeroLine() {
  const still = reducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (still) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1100);
    return () => window.clearInterval(t);
  }, [still]);
  // Un cycle de six temps : les idées, puis les trois cartes qui se retournent, puis on admire.
  const d = DEMO[Math.floor(tick / 6) % DEMO.length];
  const step = still ? 4 : tick % 6;
  return (
    <div className="hero-line" aria-hidden>
      <span className="hero-theme">
        <b>{d.title}</b>
        <small>
          1 {d.low} · {d.high} 100
        </small>
      </span>
      <div className="hero-rope">
        <svg viewBox="0 0 300 40" preserveAspectRatio="none">
          <path d="M0 6 Q150 36 300 6" />
        </svg>
        {d.cards.map(([idea, n], i) => {
          const open = step > i;
          return (
            <span key={`${d.title}-${i}`} className={cls('hero-card', `is-${i}`)} style={{ '--r': `${TILT[i]}deg` } as CSSProperties}>
              <Peg color={PEGS[i]} className="hero-peg" />
              <motion.span key={open ? 'o' : 'c'} className="flip" initial={open && !still ? { rotateY: -100 } : false} animate={{ rotateY: 0 }} transition={{ duration: 0.4 }}>
                <CardFace look={{ n: open ? n : null, idea, peg: PEGS[i], open }} size="md" />
              </motion.span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('it:url', sync);
    return () => window.removeEventListener('it:url', sync);
  }, []);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Backdrop className="home">
      <div className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=ito">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </div>
      <header className="home-hero">
        <motion.div initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">
          Tout le monde a une carte <b>de 1 à 100</b>. Décrivez vos nombres avec des idées, <b>sans jamais les dire</b>, et rangez-les ensemble sur la corde à linge.
        </p>
        <HeroLine />
      </header>

      <motion.section className="panel home-panel" initial={{ y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.45 }}>
        {invited && (
          <div className="invite-banner">
            Invitation à la table <b>{invited}</b> : choisis ton pseudo et entre&nbsp;!
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Capucine"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label" id="avatar-label">
          Ton avatar
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              {AVATAR_EMOJI[a]}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <p className="home-note">
              <Users size={16} aria-hidden /> De 2 à 10 joueurs, un téléphone par personne, autour d’une table ou en appel. Pas de bots&nbsp;: ici, on joue à deviner les autres.
            </p>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 2 minutes
        </Button>
        {conn !== 'online' && (
          <p className="wake-note" role="status">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        D'après <i>ito</i>, de Mitsuru Nakamura (Arclight). Création de fans, non officielle.
      </footer>
    </Backdrop>
  );
}
