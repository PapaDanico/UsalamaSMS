// =====================================================================
// Posts and review cadences — the register's vocabulary.
//
// SEPARATE FROM taxonomy.ts, and the separation is measured rather than
// tidy-minded. taxonomy.ts is imported by the report form, which is
// EAGER: it is the screen the product lives by and it is in the entry
// bundle. Putting these two lists there added 2.2 KB to the first paint
// of a report filed at a remote strip, to carry data only the lazily
// loaded risk register ever reads.
//
// The budget caught it. That is what the budget is for — the rule in
// scripts/stamp-sw.mjs is that a screen a person navigates to earns a
// raise and a library does not, and this was neither: it was a lazy
// screen's data charged to an eager one.
// =====================================================================

/* ------------------------------------------------------------------
   THE POSTS AN SMS DISTRIBUTES WORK BETWEEN.

   Annex 19 does not leave "who owns this" to whoever is typing. It asks
   for an accountable executive, a person responsible for the SMS, and
   named management responsibilities — so the owner of a risk-register
   entry is drawn from a list rather than typed.

   Typed owners were the previous behaviour and they produce exactly
   what an auditor complains about: "Ops", "ops", "Ops dept", "S.K." and
   "the safety office" as five different owners of the same hazard, none of which
   can be counted and one of which is nobody. The free-text escape stays
   for the operator whose structure genuinely differs — a list that
   cannot describe a real organisation just gets ignored — but it is the
   exception rather than the default.
   ------------------------------------------------------------------ */
export const SAFETY_ROLES = [
  { code: 'ACCOUNTABLE_EXECUTIVE', label: 'Accountable Executive' },
  { code: 'SAFETY_MANAGER', label: 'Safety Manager' },
  { code: 'SAFETY_OFFICER', label: 'Safety Officer' },
  { code: 'HEAD_FLIGHT_OPS', label: 'Head of Flight Operations' },
  { code: 'HEAD_ENGINEERING', label: 'Head of Engineering / CAMO' },
  { code: 'HEAD_GROUND_OPS', label: 'Head of Ground Operations' },
  { code: 'HEAD_TRAINING', label: 'Head of Training' },
  { code: 'HEAD_SECURITY', label: 'Head of Security' },
  { code: 'CHIEF_PILOT', label: 'Chief Pilot' },
  { code: 'QUALITY_MANAGER', label: 'Quality Manager' }
];

/* Review intervals, because a date picker on a handset is four taps to
   answer a question whose real answer is almost always "in three
   months". The date is COMPUTED from the interval rather than stored
   beside it — charter rule 6 — so an entry cannot carry a review date
   that disagrees with the cadence it was set on. */
export const REVIEW_INTERVALS = [
  { code: '30', label: 'In 30 days' },
  { code: '90', label: 'In 3 months' },
  { code: '180', label: 'In 6 months' },
  { code: '365', label: 'In 12 months' }
];
