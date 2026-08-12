/**
 * Every word of hand-written copy on the public site lives here.
 *
 * ── FILL ME IN ──────────────────────────────────────────────────────────────
 * Anything marked `TODO` below is a placeholder I could not know. Write the
 * French in `fr` and leave `en` empty — an empty `en` falls back to the French
 * rather than rendering a blank, so the site never breaks half-translated, and
 * the English can be written afterwards.
 *
 * Edit this one file and the landing page follows; no markup involved. Delete
 * an entry from `gear` or `career` and its card disappears — the layouts all
 * flow from the array length.
 *
 * Not everything is a pair. Ranks (`D8`), years, proper nouns, file paths and
 * URLs read the same in both languages, so they stay plain strings; making
 * them pairs would mean maintaining two copies of one fact. `hand` is an enum
 * rather than free text for the same reason — the words "right-handed" and
 * "droitier" live in the locale files, next to every other interface string.
 */

/** One string in both languages. Empty `en` falls back to `fr`. */
export interface Text {
  fr: string;
  en: string;
}

export interface GearItem {
  /** Lucide icon name, resolved in HomeGear.vue. */
  icon: "racket" | "string" | "shoes" | "shuttle" | "bag" | "grip";
  category: Text;
  name: Text;
  /** One line of spec — weight, tension, size. Shown in mono-ish tabular type. */
  spec?: Text;
  /** Why this piece, in the player's own words. */
  note?: Text;
}

export interface Milestone {
  /** Plain: a year is a year in both languages. */
  year: string;
  title: Text;
  detail: Text;
}

export const site = {
  club: {
    name: "Tim Lacault",
    short: "UST Badminton",
    town: "Talence, Bordeaux",
    tagline: {
      fr: "Jouer · S'entraîner · Progresser",
      en: "Play · Train · Improve",
    },
    /** TODO: your channel URL. Used by the footer and the hero's secondary CTA. */
    youtube: "https://www.youtube.com/@timlacault",
  },

  /** Meta description and social preview text. */
  seo: {
    /**
     * The first half of every browser tab title. `app.vue` composes
     * `<brand> · <page>`, so pages set only their own half and this word is
     * written once rather than repeated at the end of a dozen page titles.
     */
    brand: "Bad Records",
    /**
     * The landing page's half — the one page whose subject is the site
     * itself. Composed the same way as any other, giving
     * "Bad Records · Tim Lacault".
     */
    title: {
      fr: "Tim Lacault",
      en: "Tim Lacault",
    },
    description: {
      fr: "Chaque séance filmée, annotée et rejouable point par point. Le double de l'U.S. Talence, avec des ressources et un arbre de compétences à venir.",
      en: "Every training session filmed, tagged and replayable point by point. Doubles badminton from U.S. Talence, with resources and a skill tree on the way.",
    },
  },

  hero: {
    kicker: "Badminton Records · Tim Lacault",
    /** Two lines: the second one gets the crimson. */
    title: {
      fr: ["Chaque point", "enregistré"],
      en: ["Every point", "on the record"],
    },
    lede: {
      fr: "On filme trois à six matchs par séance, puis on annote chaque échange — score, service, temps forts — pour qu'un match se rejoue point par point au lieu d'être parcouru à l'avance rapide.",
      en: "We film three to six matches every training session, then tag every rally — score, serve, highlights — so a match can be replayed point by point instead of scrubbed through.",
    },
    /**
     * The recording spec, as its own strip under the lede. Kept out of the
     * lede itself: a claim about the picture is worth more read on its own
     * than buried in the fourth clause of a paragraph about tagging.
     */
    quality: {
      badge: "4K · 60 fps",
      note: {
        fr: "Toutes nos vidéos sont filmées et publiées en 4K à 60 images par seconde — image nette, ralentis propres, chaque volant lisible.",
        en: "Every one of our videos is filmed and published in 4K at 60 frames per second — sharp picture, clean slow motion, every shuttle readable.",
      },
    },
  },

  player: {
    /** TODO: confirm spelling as you want it displayed. Proper noun, not a pair. */
    name: "Tim Lacault",
    /** TODO: e.g. "Spécialiste du double · D8" */
    role: {
      fr: "Askip j'ai un bon niveau en double",
      en: "",
    },
    /** TODO: the month and year you started playing. */
    playingSince: {
      fr: "déc. 2024",
      en: "Dec 2024",
    },
    /** TODO: FFBaD rankings. Leave a field empty to hide it. Codes, not prose. */
    ranks: { singles: "TODO", doubles: "TODO", mixed: "TODO" },
    /** TODO: "right" | "left" | "" to hide. The wording lives in the locale files. */
    hand: "" as "right" | "left" | "",
    portrait: "/brand/portrait.jpg",
    /** TODO: two or three short paragraphs. Keep each under ~40 words. */
    bio: [
      {
        fr: "TODO — qui tu es et comment tu es venu au badminton. Deux phrases suffisent ; ce texte est à côté de ta photo.",
        en: "",
      },
      {
        fr: "TODO — ce sur quoi tu travailles en ce moment : un coup, un schéma, un objectif physique. C'est ce qui donnera du sens à l'arbre de compétences plus tard.",
        en: "",
      },
    ] satisfies Text[],
    /** TODO: milestones. Delete the array to hide the timeline entirely. */
    career: [
      {
        year: "TODO",
        title: { fr: "TODO — première licence", en: "" },
        detail: { fr: "TODO — une ligne là-dessus.", en: "" },
      },
      {
        year: "TODO",
        title: { fr: "TODO — arrivée à l'U.S. Talence", en: "" },
        detail: { fr: "TODO — une ligne là-dessus.", en: "" },
      },
      {
        year: "TODO",
        title: { fr: "TODO — meilleur résultat à ce jour", en: "" },
        detail: { fr: "TODO — une ligne là-dessus.", en: "" },
      },
    ] satisfies Milestone[],
  },

  partner: {
    /** TODO: your duo partner's name. Proper noun, not a pair. */
    name: "TODO — nom du partenaire",
    /** TODO: e.g. "Côté gauche · D7" */
    role: { fr: "TODO — une ligne", en: "" },
    /** TODO: the year you started playing together. */
    together: "TODO",
    ranks: { singles: "TODO", doubles: "TODO", mixed: "TODO" },
    /** TODO: a photo of the two of you would be ideal — drop it in public/brand/ */
    portrait: "",
    /** TODO: what they bring to the pair, and what you two are known for. */
    bio: [
      {
        fr: "TODO — tous les doubles, le même partenaire. Raconte comment la paire fonctionne : qui couvre le fond de court, qui est le bloc réflexe, ce que vous avez construit ensemble.",
        en: "",
      },
    ] satisfies Text[],
    /** Short, punchy pair traits. TODO: rewrite. */
    traits: [
      { fr: "TODO — trait", en: "" },
      { fr: "TODO — trait", en: "" },
      { fr: "TODO — trait", en: "" },
    ] satisfies Text[],
  },

  /** TODO: your actual kit. */
  gear: [
    {
      icon: "racket",
      category: { fr: "Raquette", en: "Racket" },
      name: { fr: "TODO — marque et modèle", en: "" },
      spec: { fr: "TODO — ex. 4U G5, tête lourde", en: "" },
      note: { fr: "TODO — pourquoi celle-ci.", en: "" },
    },
    {
      icon: "string",
      category: { fr: "Cordage & tension", en: "String & tension" },
      name: { fr: "TODO — marque et modèle", en: "" },
      spec: { fr: "TODO — ex. 26 × 28 lbs", en: "" },
      note: { fr: "TODO — ce que la tension t'apporte.", en: "" },
    },
    {
      icon: "shoes",
      category: { fr: "Chaussures", en: "Shoes" },
      name: { fr: "TODO — marque et modèle", en: "" },
      spec: { fr: "TODO — pointure, largeur", en: "" },
      note: { fr: "TODO — pourquoi celles-ci.", en: "" },
    },
    {
      icon: "shuttle",
      category: { fr: "Volants", en: "Shuttles" },
      name: { fr: "TODO — marque et vitesse", en: "" },
      spec: { fr: "TODO — ex. vitesse 78", en: "" },
      note: { fr: "TODO — ce que la salle impose.", en: "" },
    },
    {
      icon: "grip",
      category: { fr: "Grip", en: "Grip" },
      name: { fr: "TODO — marque et modèle", en: "" },
      spec: { fr: "TODO — surgrip / grip de remplacement", en: "" },
      note: {
        fr: "TODO — épaisseur, sens d'enroulement, ce qui compte pour toi.",
        en: "",
      },
    },
    {
      icon: "bag",
      category: { fr: "Sac", en: "Bag" },
      name: { fr: "TODO — marque et modèle", en: "" },
      spec: { fr: "TODO — capacité", en: "" },
      note: { fr: "TODO — ce qu'il y a dedans.", en: "" },
    },
  ] satisfies GearItem[],

  /** The three top-level destinations. `ready: false` renders a "soon" state. */
  pillars: [
    {
      id: "videos",
      to: "/videos",
      label: { fr: "Vidéos", en: "Videos" },
      title: { fr: "Vidéos", en: "Videos" },
      blurb: {
        fr: "Chaque match filmé, annoté échange par échange. Aller directement à un point, un set, un temps fort — la timeline sait où se trouve le jeu.",
        en: "Every filmed match, tagged rally by rally. Jump to any point, any set, any highlight — the timeline knows where the play actually is.",
      },
      ready: true,
    },
    {
      id: "resources",
      to: "/resources",
      label: { fr: "Ressources", en: "Resources" },
      title: { fr: "Ressources", en: "Resources" },
      blurb: {
        fr: "Les exercices, les schémas de déplacement et les notes tactiques sur lesquels on revient sans cesse — réunis au même endroit plutôt qu'éparpillés dans les favoris.",
        en: "The drills, footwork patterns and tactical notes we keep coming back to — collected in one place instead of scattered across bookmarks.",
      },
      ready: false,
    },
    {
      id: "skill-tree",
      to: "/skill-tree",
      label: { fr: "Arbre de compétences", en: "Skill Tree" },
      title: { fr: "Arbre de compétences", en: "Skill Tree" },
      blurb: {
        fr: "Une carte de ce qu'il reste à apprendre, reliée aux ressources et aux matchs où la compétence est vraiment apparue. Des progrès qui se voient.",
        en: "A map of what to learn next, wired to the resources and to the matches where a skill actually showed up. Progress you can see.",
      },
      ready: false,
    },
  ],
};

export type Site = typeof site;
