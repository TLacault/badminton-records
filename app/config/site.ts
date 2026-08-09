/**
 * Every word of hand-written copy on the public site lives here.
 *
 * ── FILL ME IN ──────────────────────────────────────────────────────────────
 * Anything marked `TODO` below is a placeholder I could not know. Edit this
 * one file and the landing page follows; no markup involved. Delete an entry
 * from `gear`, `career` or `stats` and its card disappears — the layouts all
 * flow from the array length.
 */

export interface GearItem {
  /** Lucide icon name, resolved in HomeGear.vue. */
  icon: "racket" | "string" | "shoes" | "shuttle" | "bag" | "grip";
  category: string;
  name: string;
  /** One line of spec — weight, tension, size. Shown in mono-ish tabular type. */
  spec?: string;
  /** Why this piece, in the player's own words. */
  note?: string;
}

export interface Milestone {
  year: string;
  title: string;
  detail: string;
}

export const site = {
  club: {
    name: "U.S. Talence Badminton",
    short: "UST Badminton",
    town: "Talence, Bordeaux",
    tagline: "Play · Train · Improve",
    /** TODO: your channel URL. Used by the footer and the hero's secondary CTA. */
    youtube: "https://www.youtube.com/@timlacault",
  },

  /** Meta description and social preview text. */
  seo: {
    title: "U.S. Talence Badminton — matches, tagged point by point",
    description:
      "Every training session filmed, tagged and replayable point by point. Doubles badminton from U.S. Talence, with resources and a skill tree on the way.",
  },

  hero: {
    kicker: "U.S. Talence Badminton",
    /** Two lines: the second one gets the crimson. */
    title: ["Every point", "on the record"],
    lede: "We film three to six matches every training session, then tag every rally — score, serve, highlights — so a match can be replayed point by point instead of scrubbed through.",
  },

  player: {
    /** TODO: confirm spelling as you want it displayed. */
    name: "Tim Lacault",
    /** TODO: e.g. "Doubles specialist · D8" */
    role: "Askip j'ai un bon niveau en double",
    /** TODO: the year you started playing. */
    playingSince: "dec. 2024",
    /** TODO: FFBaD rankings. Leave a field empty to hide it. */
    ranks: { singles: "TODO", doubles: "TODO", mixed: "TODO" },
    /** TODO: 'right' | 'left' */
    hand: "TODO",
    portrait: "/brand/portrait.jpg",
    /** TODO: two or three short paragraphs. Keep each under ~40 words. */
    bio: [
      "TODO — who you are and how you got into badminton. A couple of sentences is plenty; this sits next to your photo.",
      "TODO — what you are working on right now: a shot, a pattern, a fitness goal. This is what makes the skill tree section land later.",
    ],
    /** TODO: milestones. Delete the array to hide the timeline entirely. */
    career: [
      {
        year: "TODO",
        title: "TODO — first licence",
        detail: "TODO — a line about it.",
      },
      {
        year: "TODO",
        title: "TODO — joined U.S. Talence",
        detail: "TODO — a line about it.",
      },
      {
        year: "TODO",
        title: "TODO — best result so far",
        detail: "TODO — a line about it.",
      },
    ] satisfies Milestone[],
  },

  partner: {
    /** TODO: your duo partner's name. */
    name: "TODO — partner name",
    /** TODO: e.g. "Left-court · D7" */
    role: "TODO — one line",
    /** TODO: the year you started playing together. */
    together: "TODO",
    ranks: { singles: "TODO", doubles: "TODO", mixed: "TODO" },
    /** TODO: a photo of the two of you would be ideal — drop it in public/brand/ */
    portrait: "",
    /** TODO: what they bring to the pair, and what you two are known for. */
    bio: [
      "TODO — every double, same partner. Say something about how the pair works: who covers the rear court, who is the reflex block, what you have built together.",
    ],
    /** Short, punchy pair traits. TODO: rewrite. */
    traits: ["TODO — trait", "TODO — trait", "TODO — trait"],
  },

  /** TODO: your actual kit. */
  gear: [
    {
      icon: "racket",
      category: "Racket",
      name: "TODO — brand and model",
      spec: "TODO — e.g. 4U G5, head-heavy",
      note: "TODO — why this one.",
    },
    {
      icon: "string",
      category: "String & tension",
      name: "TODO — brand and model",
      spec: "TODO — e.g. 26 × 28 lbs",
      note: "TODO — what the tension buys you.",
    },
    {
      icon: "shoes",
      category: "Shoes",
      name: "TODO — brand and model",
      spec: "TODO — size, width",
      note: "TODO — why this one.",
    },
    {
      icon: "shuttle",
      category: "Shuttles",
      name: "TODO — brand and speed",
      spec: "TODO — e.g. speed 78",
      note: "TODO — what the hall demands.",
    },
    {
      icon: "grip",
      category: "Grip",
      name: "TODO — brand and model",
      spec: "TODO — overgrip / replacement",
      note: "TODO — build-up, wrap direction, whatever matters to you.",
    },
    {
      icon: "bag",
      category: "Bag",
      name: "TODO — brand and model",
      spec: "TODO — capacity",
      note: "TODO — what lives in it.",
    },
  ] satisfies GearItem[],

  /** The three top-level destinations. `ready: false` renders a "soon" state. */
  pillars: [
    {
      id: "videos",
      to: "/videos",
      label: "Videos",
      title: "Videos",
      blurb:
        "Every filmed match, tagged rally by rally. Jump to any point, any set, any highlight — the timeline knows where the play actually is.",
      ready: true,
    },
    {
      id: "resources",
      to: "/resources",
      label: "Resources",
      title: "Resources",
      blurb:
        "The drills, footwork patterns and tactical notes we keep coming back to — collected in one place instead of scattered across bookmarks.",
      ready: false,
    },
    {
      id: "skill-tree",
      to: "/skill-tree",
      label: "Skill Tree",
      title: "Skill Tree",
      blurb:
        "A map of what to learn next, wired to the resources and to the matches where a skill actually showed up. Progress you can see.",
      ready: false,
    },
  ],
};

export type Site = typeof site;
