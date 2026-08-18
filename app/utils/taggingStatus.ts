import type { Component } from 'vue'
import { CircleDashed, Flame, Scissors } from '@lucide/vue'

/**
 * One vocabulary for how far a match has been through the tagger.
 *
 * The guest cards have said "Editing" and "Edited" — crimson, with scissors
 * and a flame — since the library was built, and the admin side went on saying
 * "in progress" and "tagged" in a dropdown that looked like every other
 * dropdown. Two names for one thing is one name too many, and the admin is the
 * person who most needs to read a shelf of these at a glance, so the words and
 * the colours are the card's.
 *
 * `Raw` is the third state the cards never show, because a match nobody has
 * touched wears no pin at all. Here it needs a word: it is footage, not a
 * match yet.
 */
export type TaggingStatus = 'untagged' | 'in_progress' | 'tagged'

export interface TaggingState {
  id: TaggingStatus
  label: string
  icon: Component
  /** Filled crimson for done, translucent for under way, an outline for raw. */
  chip: string
}

/** In the order the work happens, which is the order a row of them reads. */
export const TAGGING_STATES: TaggingState[] = [
  {
    id: 'untagged',
    label: 'Raw',
    icon: CircleDashed,
    chip: 'border-line-strong bg-panel-strong text-ink-subtle',
  },
  {
    id: 'in_progress',
    label: 'Editing',
    icon: Scissors,
    chip: 'border-accent/50 bg-accent/25 text-accent',
  },
  {
    id: 'tagged',
    label: 'Edited',
    icon: Flame,
    chip: 'border-transparent bg-accent text-on-brand',
  },
]

/** Anything unrecognised reads as raw — an unknown state is not work done. */
export function taggingState(status: string | null | undefined): TaggingState {
  return TAGGING_STATES.find(s => s.id === status) ?? TAGGING_STATES[0]!
}
