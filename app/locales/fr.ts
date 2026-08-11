/**
 * Chaînes d'interface. Le contenu rédactionnel vit dans app/config/site.ts.
 *
 * Français d'abord : c'est la langue par défaut du site et celle du club. Les
 * tournures visent le registre parlé d'un joueur — « on filme », « les
 * matchs » — plutôt qu'un français administratif traduit de l'anglais.
 */
export default {
  nav: {
    main: "Navigation principale",
    homeAria: "{club} — accueil",
    admin: "Admin",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    switchToFr: "Passer en français",
    switchToEn: "Switch to English",
  },

  common: {
    soon: "BIENTÔT",
    soonShort: "Bientôt",
    undated: "Sans date",
  },

  a11y: {
    skipToContent: "Aller au contenu",
  },

  footer: {
    sections: "Sections",
    elsewhere: "Ailleurs",
    youtube: "Chaîne YouTube",
    adminSignIn: "Connexion admin",
  },

  home: {
    hero: {
      watch: "Voir les matchs",
      channel: "La chaîne",
      skipAria: "Aller à la présentation",
      scroll: "Défiler",
    },
    stats: {
      sessions: "Séances filmées",
      matches: "Matchs en ligne",
      playtime: "De jeu",
    },
    about: {
      eyebrow: "Qui joue",
      title: "Le joueur",
      milestones: "Étapes",
      playingSince: "Joue depuis",
      hand: { right: "Droitier", left: "Gaucher" },
    },
    partner: {
      eyebrow: "Tous les doubles, le même partenaire",
      title: "La paire",
    },
    gear: {
      eyebrow: "Ce qu'il y a dans le sac",
      title: "Équipement",
      lede: "Le matériel derrière chaque échange de ce site — et pourquoi chaque pièce s'y trouve.",
    },
    latest: {
      eyebrow: "Dernière séance",
      lede: "Trois à six matchs par séance, filmés de bout en bout et annotés échange par échange.",
      all: "Toutes les séances",
      none: "Pas encore de séance",
      empty: "Rien de publié pour l'instant — la prochaine séance atterrira ici.",
    },
    soon: {
      eyebrow: "La suite",
      title: "Deux autres sections",
      lede: "Les vidéos n'en sont qu'un tiers. Les deux autres se construisent en ce moment.",
      inTheWorks: "En chantier",
      takeALook: "Y jeter un œil",
    },
    more: {
      eyebrow: "Dans les archives",
      title: "Autres vidéos",
      lede: "Les séances d'avant, les anciens adversaires, et les matchs qui méritent qu'on y revienne.",
      browse: "Tout parcourir",
    },
  },

  videos: {
    eyebrow: "Section une sur trois",
    lede: "Tous les matchs qu'on filme, regroupés par séance. Les matchs annotés affichent le score en direct et une timeline dans laquelle on peut sauter d'un point à l'autre.",
  },

  resources: {
    eyebrow: "Section deux sur trois",
    seoTitle: "Ressources — U.S. Talence Badminton",
    planned: [
      "Les exercices qu'on fait vraiment à l'entraînement, avec l'objectif de chacun écrit noir sur blanc.",
      "Les schémas de déplacement et de placement, filmés assez lentement pour être copiés.",
      "Des notes tactiques pour le double : rotations, retours de service, défense sur l'échange à plat.",
      "Les vidéos, articles et coachs qui valent ton temps — et une ligne sur le pourquoi.",
    ],
  },
  skillTree: {
    eyebrow: "Section trois sur trois",
    seoTitle: "Arbre de compétences — U.S. Talence Badminton",
    planned: [
      "Une carte ramifiée des coups, des déplacements et de la tactique — ce qui débloque quoi.",
      "Chaque nœud relié aux ressources qui l'enseignent.",
      "Et aux échanges annotés où la compétence apparaît vraiment dans un match.",
      "Des progrès visibles : ce qui est solide, ce qui est fragile, ce qui vient ensuite.",
    ],
  },

  soonPage: {
    whatsComing: "Ce qui arrive",
    watchMeanwhile: "Voir les matchs en attendant",
  },

  filters: {
    clear: "Effacer",
    sortBy: "Trier par",
    result: "Résultat",
    format: "Format",
    type: "Type",
    tagging: "Annotation",
    highlightsOnly: "Seulement les matchs avec temps forts",
  },

  share: {
    action: "Partager",
    copy: "Copier le lien",
    copied: "Lien copié",
    failed: "Copie impossible",
  },

  card: {
    edited: "Monté",
    editing: "En montage",
    fourK: "4K",
    fourKTitle: "Filmé et publié en 4K à 60 i/s",
    latest: "Dernier match",
  },

  match: {
    label: "Match",
    resultHidden: "Résultat masqué — révéler",
    reveal: "Révéler le résultat",
    sets: "Sets",
    players: "Joueurs",
    player: "Joueur",
    pointsScored: "Points marqués",
    pointsShare: "Part des points de l'équipe",
    highlights: "Temps forts",
    bestRun: "Meilleure série",
    noScorer: "consigné sans marqueur.",
    allVideos: "Toutes les vidéos",
    jumpTo: "Aller à",
    upNext: "À suivre",
    notFound: "Match introuvable",
    notFoundHint: "Il a peut-être été dépublié, ou le lien est erroné.",
    backToVideos: "Retour aux vidéos",
  },

  player: {
    points: "Points",
    sets: "Sets",
    highlights: "Temps forts",
    previous: "Précédent",
    next: "Suivant",
    previousMarker: "Marqueur précédent",
    nextMarker: "Marqueur suivant",
    break: "Pause",
    breakOpen: "Pause (en cours)",
    highlight: "Temps fort",
    showNames: "Afficher les noms",
    showSides: "N'afficher que les camps",
    fullscreen: "Plein écran avec le tableau",
    exitFullscreen: "Quitter le plein écran",
    noVideo: "Aucun identifiant de vidéo YouTube pour ce match.",
    qualityHint: "Qualité actuelle. Cliquez pour ouvrir les réglages YouTube, où elle se change.",
    nativeControls: "Commandes YouTube",
  },

  login: {
    signIn: "Connexion",
    adminOnly: "Accès réservé aux admins. Il n'y a pas d'inscription publique.",
    email: "E-mail",
    password: "Mot de passe",
    busy: "Connexion…",
    seoTitle: "Connexion — U.S. Talence Badminton",
    showPassword: "Afficher le mot de passe",
    hidePassword: "Masquer le mot de passe",
    back: "Retour au site",
  },
};
