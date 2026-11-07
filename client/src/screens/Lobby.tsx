// Salon : partage de la table, joueurs, réglages de l'hôte (défi ou partie libre, idées dites ou écrites, thèmes à mimer), lancement.
import { motion } from 'framer-motion';
import { BookOpen, Check, Copy, Crown, LogOut, Play, QrCode, Share2, Trophy, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, type Mode, type PlayerView, type RoomView, type Talk } from '../../../shared/protocol';
import { Avatar, Backdrop, Button, Logo, Modal, Pill, Segmented } from '../components/Ui';
import { roundsLabel } from '../lib/text';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

function PlayerRow({ view, p, i, isHost }: { view: RoomView; p: PlayerView; i: number; isHost: boolean }) {
  return (
    <motion.li className={cls('player-row', p.id === view.me && 'is-me')} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.03 }}>
      <Avatar avatar={p.avatar} className="player-avatar" />
      <span className="player-name">
        {p.name}
        {p.id === view.me && <span className="muted"> (toi)</span>}
      </span>
      {p.isHost && (
        <Pill tone="ink">
          <Crown size={12} aria-hidden /> Hôte
        </Pill>
      )}
      {!p.connected && <Pill>Hors ligne</Pill>}
      {isHost && p.id !== view.me && (
        <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
          <UserX size={18} />
        </button>
      )}
    </motion.li>
  );
}

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);
  const s = view.settings;
  const blocked = seated.length < MIN_PLAYERS ? 'Il faut au moins 2 joueurs' : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien\u00a0: ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Ito', text: `Viens ranger la corde à linge avec moi sur Ito (table ${view.code}) !`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <Backdrop quiet>
      <div className="lobby">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="code-panel" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span className="eyebrow">Code de la table</span>
          <div className="big-code" aria-label={`Code ${view.code.split('').join(' ')}`}>
            {view.code.split('').map((c, i) => (
              <motion.span key={i} className="code-card" initial={{ y: -18, rotate: -8 }} animate={{ y: 0, rotate: [-3, 2, -2, 3][i] }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 13 }}>
                {c}
              </motion.span>
            ))}
          </div>
          <div className="share-row">
            <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
              Inviter des amis
            </Button>
            <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
              {copied ? 'Lien copié !' : 'Copier le lien'}
            </Button>
            <Button icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="Afficher le QR code">
              QR
            </Button>
          </div>
          {view.best > 0 && (
            <p className="best-note">
              <Trophy size={15} aria-hidden /> Meilleure série ce soir&nbsp;: <b>{roundsLabel(view.best)}</b>
            </p>
          )}
        </motion.section>

        <div className="lobby-grid">
          <section className="panel">
            <div className="panel-head">
              <h3>
                Joueurs <span className="muted">{seated.length}/{MAX_PLAYERS}</span>
              </h3>
            </div>
            <ul className="player-list">
              {seated.map((p, i) => (
                <PlayerRow key={p.id} view={view} p={p} i={i} isHost={isHost} />
              ))}
              {Array.from({ length: Math.max(0, MIN_PLAYERS - seated.length) }, (_, i) => (
                <li key={`empty${i}`} className="player-row is-empty">
                  <span className="player-ghost">?</span>
                  <span className="player-name muted">Une place libre…</span>
                </li>
              ))}
            </ul>
            {spectators.length > 0 && <p className="muted small">Spectateurs : {spectators.map((p) => p.name).join(', ')}</p>}
            <p className="muted small lobby-note">De 2 à 10 joueurs. À deux, on accroche vite deux cartes par personne&nbsp;; à dix, la corde est longue et les débats aussi.</p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Réglages</h3>
              {!isHost && <span className="muted small">choisis par {host?.name ?? 'l’hôte'}</span>}
            </div>
            <span className="field-label">La partie</span>
            <Segmented<Mode>
              label="La partie"
              value={s.mode}
              disabled={!isHost}
              onChange={(mode) => void send('room:settings', { mode })}
              options={[
                { value: 'defi', label: 'Défi', sub: 'une carte de plus à chaque réussite' },
                { value: 'libre', label: 'Partie libre', sub: 'une carte par personne' },
              ]}
            />
            <p className="muted small lobby-note">
              {s.mode === 'defi' ? 'Après chaque manche réussie, quelqu’un prend une carte de plus. La série s’arrête au premier fil cassé.' : 'Une carte par personne à chaque manche : on enchaîne les thèmes, sans série à tenir.'}
            </p>
            <span className="field-label">Les idées</span>
            <Segmented<Talk>
              label="Les idées"
              value={s.talk}
              disabled={!isHost}
              onChange={(talk) => void send('room:settings', { talk })}
              options={[
                { value: 'voix', label: 'À voix haute', sub: 'autour de la table' },
                { value: 'ecrit', label: 'À l’écrit', sub: 'sur l’étiquette' },
              ]}
            />
            <p className="muted small lobby-note">
              {s.talk === 'voix' ? 'On se parle en vrai ou en appel. L’appli garde les cartes et la corde.' : 'On écrit son idée sur l’étiquette de sa carte (sans chiffres). On peut aussi parler.'}
            </p>
            {s.talk === 'voix' && (
              <>
                <span className="field-label">Thèmes à mimer</span>
                <Segmented<boolean>
                  label="Thèmes à mimer"
                  value={s.gestures}
                  disabled={!isHost}
                  onChange={(gestures) => void send('room:settings', { gestures })}
                  options={[
                    { value: true, label: 'De temps en temps', sub: 'gestes et bruits' },
                    { value: false, label: 'Jamais', sub: 'seulement des mots' },
                  ]}
                />
              </>
            )}
          </section>
        </div>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={!!blocked} onClick={() => void send('game:start')}>
              {blocked ?? `Lancer la partie (${seated.length} joueurs)`}
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente que {host?.name ?? 'l’hôte'} lance la partie…
            </div>
          )}
          <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
            Nouveau&nbsp;? Les règles en 2 minutes
          </Button>
        </div>

        <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
          <div className="qr-box">
            <QRCodeSVG value={url} size={220} bgColor="#fffdf6" fgColor="#1f3550" level="M" includeMargin />
            <p className="muted small">Scanne pour rejoindre la table directement.</p>
            <code className="url-code">{url}</code>
          </div>
        </Modal>
      </div>
    </Backdrop>
  );
}
