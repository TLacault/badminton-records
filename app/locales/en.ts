/**
 * Interface strings. Editorial copy lives in app/config/site.ts instead — this
 * file is the chrome around it: buttons, labels, empty states, aria text.
 *
 * Keys mirror the component tree so a string is findable from the markup that
 * shows it. `fr.ts` must carry the same keys; a missing one falls back to
 * French rather than to the raw key.
 */
export default {
  nav: {
    main: "Main",
    homeAria: "{club} — home",
    admin: "Admin",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    // Deliberately not translated: each label is written in the language it
    // leads to, so it is legible to the person looking for that language.
    switchToFr: "Passer en français",
    switchToEn: "Switch to English",
  },

  common: {
    soon: "SOON",
    soonShort: "Soon",
    undated: "Undated",
  },

  a11y: {
    skipToContent: "Skip to content",
  },

  footer: {
    sections: "Sections",
    elsewhere: "Elsewhere",
    youtube: "YouTube channel",
    adminSignIn: "Admin sign in",
  },

  home: {
    hero: {
      watch: "Watch the matches",
      channel: "The channel",
      skipAria: "Skip to the introduction",
      scroll: "Scroll",
    },
    stats: {
      sessions: "Sessions filmed",
      matches: "Matches online",
      playtime: "Of play",
    },
    about: {
      eyebrow: "Who's playing",
      title: "The player",
      milestones: "Milestones",
      playingSince: "Playing since",
      hand: { right: "Right-handed", left: "Left-handed" },
    },
    partner: {
      eyebrow: "Every double, same partner",
      title: "The pair",
    },
    gear: {
      eyebrow: "What's in the bag",
      title: "Equipment",
      lede: "The kit behind every rally on this site — and why each piece is in there.",
    },
    latest: {
      eyebrow: "Latest training session",
      lede: "Three to six matches a session, filmed end to end and tagged rally by rally.",
      all: "All sessions",
      none: "No session yet",
      empty: "Nothing published yet — the next session will land here.",
    },
    soon: {
      eyebrow: "Next up",
      title: "Two more sections",
      lede: "Videos are only a third of it. The other two are being built now.",
      inTheWorks: "In the works",
      takeALook: "Take a look",
    },
    more: {
      eyebrow: "From the archive",
      title: "Other videos",
      lede: "Earlier sessions, older opponents, and the matches worth going back to.",
      browse: "Browse everything",
    },
  },

  videos: {
    eyebrow: "Section one of three",
    seoTitle: "Videos",
    lede: "Every match we film, grouped by the session it came from. Tagged matches carry a live score overlay and a timeline you can jump around.",
  },

  resources: {
    eyebrow: "Section two of three",
    seoTitle: "Resources",
    planned: [
      "Drills we actually run at training, with the point of each one written down.",
      "Footwork and movement patterns, filmed slowly enough to copy.",
      "Tactical notes for doubles: rotations, service returns, defending the flat exchange.",
      "The videos, articles and coaches worth your time — and a line on why.",
    ],
  },
  skillTree: {
    eyebrow: "Section three of three",
    seoTitle: "Skill Tree",
    planned: [
      "A branching map of shots, movement and tactics — what unlocks what.",
      "Every node wired to the resources that teach it.",
      "And to the tagged rallies where the skill actually turns up in a match.",
      "Progress you can see: what is solid, what is shaky, what is next.",
    ],
  },

  soonPage: {
    whatsComing: "What's coming",
    watchMeanwhile: "Watch the matches meanwhile",
  },

  filters: {
    clear: "Clear",
    sortBy: "Sort by",
    result: "Result",
    format: "Format",
    type: "Type",
    tagging: "Tagging status",
    highlightsOnly: "Only matches with highlights",
  },

  share: {
    action: "Share",
    copy: "Copy link",
    copied: "Link copied",
    failed: "Could not copy",
  },

  card: {
    edited: "Edited",
    editing: "Editing",
    fourK: "4K",
    fourKTitle: "Filmed and uploaded in 4K at 60fps",
    latest: "Latest match",
  },

  match: {
    label: "Match",
    resultHidden: "Result hidden — reveal",
    reveal: "Reveal the result",
    sets: "Sets",
    players: "Players",
    player: "Player",
    pointsScored: "Points scored",
    pointsShare: "Share of the side's points",
    highlights: "Highlights",
    bestRun: "Best run of points",
    noScorer: "logged without a scorer.",
    allVideos: "All videos",
    jumpTo: "Jump to",
    upNext: "Up next",
    notFound: "Match not found",
    notFoundHint: "It may have been unpublished, or the link is wrong.",
    backToVideos: "Back to the videos",
  },

  player: {
    points: "Points",
    sets: "Sets",
    highlights: "Highlights",
    previous: "Previous",
    next: "Next",
    previousMarker: "Previous marker",
    nextMarker: "Next marker",
    break: "Break",
    breakOpen: "Break (still open)",
    highlight: "Highlight",
    showNames: "Show player names",
    showSides: "Show sides only",
    fullscreen: "Fullscreen with scoreboard",
    exitFullscreen: "Exit fullscreen",
    noVideo: "No YouTube video ID set for this match.",
    qualityHint: "Current quality. Click for YouTube's own settings, where it can be changed.",
    nativeControls: "YouTube controls",
  },

  login: {
    signIn: "Sign in",
    adminOnly: "Admin access only. There is no public sign-up.",
    email: "Email",
    password: "Password",
    busy: "Signing in…",
    seoTitle: "Sign in",
    showPassword: "Show password",
    hidePassword: "Hide password",
    back: "Back to the site",
  },
};
