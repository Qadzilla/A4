import { describe, expect, it } from 'vitest';
import { stateTaxOnGains } from '../lib/calc/state-gains';

// ─── B1 acceptance ─────────────────────────────────────────────────
// MA: 8.5% short / 5% long (verified, BASIS_FILING.md Part II). The rest
// of the contract is about honesty at the edges: no state on file, a state
// we don't model, a year we haven't loaded, and losses never producing a
// negative state tax.

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
    expect(result.note).toContain('Estimate');
  });

  it('clamps losses to zero rather than inventing a state refund', () => {
    // The allowed-loss rule: MA netting is F3's job; until then a loss
    // contributes nothing, never a negative.
    const result = stateTaxOnGains('MA', 2026, { shortTerm: -500, longTerm: 300 });
    if (result.status !== 'applies') throw new Error('expected applies');
    expect(result.estimatedShortTermTax).toBe(0);
    expect(result.estimatedLongTermTax).toBeCloseTo(15, 5);
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
