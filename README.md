# Ito

Tout le monde a une carte de 1 à 100. Décrivez vos nombres avec des idées, sans jamais les dire, et rangez-les ensemble sur la corde à linge.

👉 **Jouer : https://ito.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu coopératif multijoueur, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après *ito*, de Mitsuru Nakamura (Arclight ; en français chez Don't Panic Games). Création de fans, non officielle, avec ses propres visuels.

## Règles en bref

- De 2 à 10 joueurs, **tout le monde gagne ou perd ensemble**. Chaque manche, tout le monde reçoit une carte secrète de **1 à 100**.
- **Le thème** : on en choisit un parmi deux (ou on en tire deux autres), par exemple *Un animal*, de **1 = petit** à **100 = grand**.
- Tout le monde décrit son nombre avec **une idée du thème** : avec 93, « une baleine » ; avec 6, « une fourmi ». Jamais de nombre, ni d'indice du genre « à peu près la moitié ».
- **La corde** : on accroche sa carte là où on pense qu'elle va. On discute, on se ravise, on déplace ou on reprend **ses propres cartes** autant qu'on veut.
- Quand tout le monde a dit **« Je suis d'accord »**, on retourne les cartes de gauche à droite. Toutes dans l'ordre : la manche est réussie. Sinon, le fil casse, et les cartes mal rangées passent au rouge.
- **Les pinces** : les deux premières cartes de chaque personne tiennent par une pince à sa couleur, tout le monde sait à qui elles sont. Les suivantes ont une pince en bois : à qui sont-elles ?
- **Défi** (par défaut) : après chaque manche réussie, quelqu'un prend une carte de plus, d'abord parmi ceux qui n'en ont qu'une. La série s'arrête au premier fil cassé ; le score, c'est le nombre de manches réussies d'affilée.
- **Partie libre** : une carte par personne, on enchaîne les thèmes, et l'hôte termine quand il veut.

## Ce qui vient du jeu, ce qui change

Repris du livret : les cent cartes, les thèmes avec ce que veulent dire le 1 et le 100, la règle d'or (ne jamais dire son nombre), le jeu coopératif et le mode où l'on prend une carte de plus après chaque réussite jusqu'au premier raté.

Adapté au téléphone :

- **La corde à linge remplace la table** : chacun voit la même rangée de cartes, accroche les siennes et les déplace d'un geste. L'appli garde les nombres secrets et l'ordre choisi, puis retourne les cartes une à une.
- **Les idées se disent à voix haute** (autour de la table ou en appel), ou **s'écrivent** sur l'étiquette de sa carte pour jouer à distance ; l'écrit refuse les chiffres.
- **Thèmes à mimer**, de temps en temps (à voix haute seulement) : on fait le geste ou le bruit, plus ou moins fort selon son nombre.
- **Plus de 160 thèmes** originaux, écrits pour ce jeu, dont 17 à mimer.
- **Aucune aide au calcul** : l'appli ne dit jamais si l'ordre est bon avant le retournement, et ne garde pas les idées des manches précédentes pendant la partie. Le bilan, à la fin, montre toutes les cordes.

## Pas de bots

Ito se joue sur les mots et sur ce qu'on devine des autres : un bot n'y serait pas crédible. Il faut de vrais joueurs, au moins deux.

## Fonctionnalités

- Créer une table et inviter avec un code à 4 lettres, un lien, le partage du téléphone ou un QR code
- Le choix du thème par n'importe qui à la table, avec l'échelle du 1 au 100 et le repère de sa propre carte
- La corde : des places « + » entre les cartes, les cartes qui volent de la main à la corde, la rangée qui suit la courbe du fil, les cartes des autres de dos, au vichy de leur pince
- La tablée : qui a encore des cartes en main, qui est d'accord ; l'accord tombe dès que la corde ou une idée change, et l'appli le dit
- Le retournement carte après carte, l'éclair entre deux cartes à l'envers, le tampon « Bien rangé ! » ou « Le fil a cassé », des confettis
- Réactions (« Plus haut ? », « On est collés ! »…), règles consultables en jeu, sons synthétisés et vibrations
- Fin de partie : la série ou le compte des manches réussies, le record de la soirée, toutes les cordes de la partie avec leurs idées, revanche en un clic
- Spectateurs, reprise automatique après une coupure ; après 20 secondes d'absence, on joue sans l'absent, ses cartes restent de côté jusqu'à la manche suivante ; l'hôte qui part passe la main
- `prefers-reduced-motion` respecté, pensé pour le téléphone et confortable sur ordinateur

## Développement

```bash
npm install
npm run dev:server   # serveur (port 3280)
npm run dev:client   # client Vite (port 5207)
npm test             # donne, thèmes, corde, accord, retournement, cassures, défi
npm run typecheck
npm run build        # client dans dist/client, serveur dans dist/server
npm start            # sert le tout sur le port 3280 (ou $PORT)
npm run e2e          # parties complètes avec de vrais clients Socket.IO (après build)
```

`IT_FAST=1` retourne les cartes en un éclair (tests locaux uniquement).

## Architecture

- `shared/protocol.ts` : constantes, réglages, vues, nettoyage des idées et calcul des cassures, communs au client et au serveur
- `server/` : Express + Socket.IO, moteur de partie (`game.ts`), thèmes (`themes.ts`), table, absents, retournement minuté et vue de chacun (`room.ts`). Le serveur fait autorité, et chacun ne reçoit que sa vue : jamais le nombre d'une carte avant qu'elle soit retournée, ni à qui appartient une carte à pince en bois
- `client/` : React + Vite + Framer Motion. La corde est dans `components/Line.tsx`, les cartes, les pinces et le décor dans `components/Ui.tsx`, la partie dans `screens/Table.tsx`
- `test/e2e.mjs` vérifie à chaque état reçu qu'aucune information cachée ne fuit, puis recalcule chaque retournement à partir des nombres dévoilés
