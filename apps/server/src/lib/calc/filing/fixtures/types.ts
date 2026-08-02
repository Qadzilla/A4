// ─── A7 · The fixture corpus, its shape ────────────────────────────
// For a determination engine the tests are the work. A fixture is written
// once, cited or reasoned, and every consuming module runs it. The fence:
// nothing here is invented from memory of tax law — a fixture is either
// transcribed from authority (and says where), or deliberately adversarial
// (and says why). A fixture without a citation or a rationale doesn't merge.
//
// Fixtures are frozen artifacts: once right, never deleted — superseded
// with a note if the law moves (Doctrine 8 applied to ourselves).

import type { FactId, FactValue } from '../facts';

export type FixtureSource =
  /** Transcribed from a publication, instruction or statute — verbatim numbers. */
  | { kind: 'authority'; citation: string }
  /** Constructed to break something specific; the rationale is mandatory. */
  | { kind: 'adversarial'; rationale: string }
  /** One of the eight personas from BASIS_FILING.md Part IV. */
  | { kind: 'persona'; persona: string };

export interface FixtureFact {
  factId: FactId;
  /** Defaults to the fixture's taxYear. Prior years matter for residency. */
  taxYear?: number;
  value: FactValue;
}

export interface FilingFixture<TExpected> {
  id: string;
  source: FixtureSource;
  taxYear: number;
  facts: FixtureFact[];
  expected: TExpected;
  note?: string;
}
