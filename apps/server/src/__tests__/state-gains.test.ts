import { describe, expect, it } from 'vitest';
import { stateTaxOnGains } from '../lib/calc/state-gains';

// ─── B1 acceptance ─────────────────────────────────────────────────
// MA: 8.5% short / 5% long (verified, BASIS_FILING.md Part II). The rest
// of the contract is about honesty at the edges: no state on file, a state
// we don't model, a year we haven't loaded, and losses never producing a
// negative state tax.
//
// B1 shipped clamping losses at zero because MA's ordering had not been
// transcribed. It has been now — M.G.L. c. 62 § 2(c) — so this routes
// through the same netting engine F3 uses rather than keeping a second
// opinion about the same question.

describe('stateTaxOnGains', () => {
  it('prices an MA short-term sale at 8.5% and long-term at 5%', () => {
    const result = stateTaxOnGains('MA', 2026, { shortTerm: 2000, longTerm: 1000 });
    if (result.status !== 'applies') throw new Error(`expected applies, got ${result.status}`);
    expect(result.estimatedShortTermTax).toBeCloseTo(170, 5);
    expect(result.estimatedLongTermTax).toBeCloseTo(50, 5);
    expect(result.estimatedTotalTax).toBeCloseTo(220, 5);
  });

  it('names the 3.5% saved by waiting when short-term gains are present', () => {
    const result = stateTaxOnGains('MA', 2026, { shortTerm: 2000, longTerm: 0 });
    if (result.status !== 'applies') throw new Error('expected applies');
    expect(result.note).toContain('3.5%');
    // It no longer calls itself an estimate ahead of the netting rules,
    // because it is no longer ahead of them.
    expect(result.note).not.toContain('Estimate');
  });

  it('a loss now reaches the gain it legally offsets, and never goes negative', () => {
    // § 2(c)(2)(a): the short-term loss finds no interest or dividends
    // here, so all $500 of it lands on the $300 long-term gain — which
    // it more than covers. The old clamp charged $15 of Massachusetts
    // tax on a gain the loss had already wiped out.
    const result = stateTaxOnGains('MA', 2026, { shortTerm: -500, longTerm: 300 });
    if (result.status !== 'applies') throw new Error('expected applies');
    expect(result.estimatedShortTermTax).toBe(0);
    expect(result.estimatedLongTermTax).toBe(0);
    expect(result.estimatedTotalTax).toBe(0);
  });

  it('a long-term loss takes the 8.5% gain first — the rate-material order', () => {
    const result = stateTaxOnGains('MA', 2026, { shortTerm: 1000, longTerm: -400 });
    if (result.status !== 'applies') throw new Error('expected applies');
    // $400 comes off the short-term gain, leaving $600 at 8.5% = $51.
    expect(result.estimatedShortTermTax).toBeCloseTo(51, 5);
    expect(result.estimatedLongTermTax).toBe(0);
  });

  it('reports no-state-on-file instead of guessing', () => {
    expect(stateTaxOnGains('', 2026, { shortTerm: 100, longTerm: 0 }).status).toBe(
      'no-state-on-file',
    );
    expect(stateTaxOnGains(null, 2026, { shortTerm: 100, longTerm: 0 }).status).toBe(
      'no-state-on-file',
    );
  });

  it('names an unmodelled state honestly — CA shows federal-only, never silence', () => {
    const result = stateTaxOnGains('CA', 2026, { shortTerm: 100, longTerm: 0 });
    expect(result.status).toBe('not-modeled');
    if (result.status === 'not-modeled') {
      expect(result.note).toContain('CA');
      expect(result.note).toContain('federal only');
    }
  });

  it('refuses a year with no rates rather than borrowing', () => {
    const result = stateTaxOnGains('MA', 2019, { shortTerm: 100, longTerm: 0 });
    expect(result.status).toBe('year-not-loaded');
  });

  it('normalises case and whitespace in the state code', () => {
    expect(stateTaxOnGains(' ma ', 2026, { shortTerm: 100, longTerm: 0 }).status).toBe('applies');
  });
});
