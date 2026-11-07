// Les règles, lisibles en deux minutes et consultables à tout moment.
import { Hand, MessageCircle, Sparkles, Trophy } from 'lucide-react';
import { useStore } from '../store';
import { CardFace, Modal, Peg } from './Ui';

const EXAMPLE: { n: number; idea: string; peg: string; r: number }[] = [
  { n: 6, idea: 'une fourmi', peg: '#e8453c', r: -3 },
  { n: 41, idea: 'un chat', peg: '#f2c230', r: 2 },
  { n: 93, idea: 'une baleine', peg: '#3a8ee6', r: -1.5 },
];

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles" wide>
      <div className="rules">
        <section className="rule-hero">
          <p>
            Un jeu <b>coopératif</b>&nbsp;: tout le monde gagne ou perd ensemble. Tout le monde reçoit une carte de <b>1 à 100</b>, secrète. Le but&nbsp;: accrocher toutes les cartes sur la corde, <b>de la plus petite à la plus grande</b>, sans jamais dire son nombre.
          </p>
        </section>

        <section>
          <h3>
            <MessageCircle size={18} aria-hidden /> Un thème, des idées
          </h3>
          <p>
            On choisit un thème, par exemple <i>La taille d’un animal</i>, de <b>1 = minuscule</b> à <b>100 = énorme</b>. Tout le monde décrit son nombre avec une idée du thème&nbsp;: avec 93, on dit «&nbsp;une baleine&nbsp;», avec 6, «&nbsp;une fourmi&nbsp;». Jamais de nombre, ni d’indice du genre «&nbsp;à peu près la moitié&nbsp;».
          </p>
          <div className="rule-line" aria-hidden>
            <svg className="rule-rope" viewBox="0 0 300 30" preserveAspectRatio="none">
              <path d="M0 6 Q150 26 300 6" />
            </svg>
            {EXAMPLE.map((e) => (
              <span key={e.n} className="rule-card" style={{ rotate: `${e.r}deg` }}>
                <Peg color={e.peg} className="rule-peg" />
                <CardFace look={{ n: e.n, idea: e.idea, peg: e.peg, open: true }} size="md" />
              </span>
            ))}
          </div>
        </section>

        <section>
          <h3>
            <Hand size={18} aria-hidden /> La corde
          </h3>
          <p>
            On accroche sa carte là où on pense qu’elle va, à côté des autres. On discute, on se ravise, on <b>déplace ses propres cartes</b> autant qu’on veut. Quand tout le monde a dit <b>«&nbsp;Je suis d’accord&nbsp;»</b>, on retourne les cartes de gauche à droite. Toutes en ordre&nbsp;? La manche est réussie.
          </p>
          <p>
            Les deux premières cartes de chaque personne tiennent par une <b>pince à sa couleur</b>&nbsp;: tout le monde sait à qui elles sont. Les suivantes ont une <b>pince en bois</b>&nbsp;: à qui sont-elles&nbsp;?
          </p>
        </section>

        <section>
          <h3>
            <Trophy size={18} aria-hidden /> Défi ou partie libre
          </h3>
          <ul>
            <li>
              <b>Défi</b>&nbsp;: après chaque manche réussie, quelqu’un prend une carte de plus pour la suivante (d’abord ceux qui n’en ont qu’une). La série s’arrête au premier fil cassé&nbsp;: jusqu’où irez-vous&nbsp;?
            </li>
            <li>
              <b>Partie libre</b>&nbsp;: une carte par personne, et on enchaîne les thèmes, sans pression.
            </li>
          </ul>
        </section>

        <section>
          <h3>
            <Sparkles size={18} aria-hidden /> Les variantes
          </h3>
          <ul>
            <li>
              <b>À voix haute</b> (le plus courant)&nbsp;: on se parle autour de la table ou en appel. <b>À l’écrit</b>&nbsp;: on écrit son idée sur l’étiquette de sa carte, sans chiffres.
            </li>
            <li>
              <b>Thèmes à mimer</b> (à voix haute)&nbsp;: on fait le geste ou le bruit, plus ou moins fort selon son nombre. Un cri d’animal à 5, c’est un murmure&nbsp;; à 95, toute la maison l’entend.
            </li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
