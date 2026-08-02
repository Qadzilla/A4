// ─── Rule traces ───────────────────────────────────────────────────
// Every determination carries the rule it applied and the numbers it saw,
// so the AI narrates what the engine did instead of paraphrasing tax law
// from memory (Doctrine 2), and `explain_determination` (G2) can return
// this verbatim, citation included.

export interface RuleTrace {
  /** Machine id of the rule that decided, e.g. 'residency/exempt-individual'. */
  ruleId: string;
  /** The authority, human-readable: publication, form instruction, statute. */
  citation: string;
  /** The test as applied: each step a label and the value it saw. */
  steps: Array<{ label: string; value?: string | number | boolean }>;
  /** Caveats and boundaries worth narrating — never advice. */
  notes?: string[];
}
