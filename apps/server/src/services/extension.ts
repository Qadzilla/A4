// ─── H3 · Extensions, over the desk ────────────────────────────────
// Reads the year, asks A6 whether it is ready, and hands both to the
// pure module. The state comes from the year's own facts rather than a
// setting — Massachusetts' 80% condition only applies to someone
// actually filing in Massachusetts.

import type { DB } from '../db';
import type { ExtensionAdvice } from '../lib/calc/filing/extension';
import { extensionAdvice } from '../lib/calc/filing/extension';
import { factSet, factState } from '../lib/calc/filing/facts';
import { assessReadiness } from '../lib/calc/filing/readiness';
import type { FactScopeKeys } from './facts';
import { loadFilingYear } from './filing-year';

export async function extensionFor(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  today: Date = new Date(),
): Promise<ExtensionAdvice> {
  const year = await loadFilingYear(db, keys, taxYear);
  const readiness = assessReadiness(year.assertions, year.docs, taxYear, today, year.extras);

  const set = factSet(year.assertions, taxYear);
  const residence = factState(set, 'state-of-residence');
  const stateCode =
    residence.status === 'known' && residence.value.kind === 'string'
      ? residence.value.value
      : null;

  return extensionAdvice({
    assertions: year.assertions,
    taxYear,
    today,
    ready: readiness.verdict === 'ready',
    stateCode,
    extras: year.extras,
  });
}
