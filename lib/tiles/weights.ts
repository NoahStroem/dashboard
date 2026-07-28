/**
 * The equation. y = Sum of w times x.
 *
 * Your goal is y. Every tile is an x. The weight is what that tile is worth
 * toward that goal. Each goal's weights add up to 100.
 *
 * Plain data. No AI key. Versioned in git, so it travels with you.
 * The mentor writes this with you. Empty until then, on purpose.
 */

export interface Goal {
  id: string
  /** One sharp sentence. This is y. */
  label: string
  /** tile slot -> what it is worth toward this goal. Adds up to 100. */
  weights: Record<string, number>
}

/** Your main goal, polished into one sentence with the mentor. */
export const OVERALL_GOAL = ''

/** Your goals. You can have more than one. */
export const DEFAULT_GOALS: Goal[] = []
