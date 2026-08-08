import { describe, expect, it } from 'vitest';
import {
  LOSS_AGAINST_INTEREST_CAP,
  netMassachusettsGains,
} from '../lib/calc/filing/states/ma-loss-netting';

// ─── M.G.L. c. 62 § 2(c) ───────────────────────────────────────────
// The ordering F3 refused to guess, transcribed from the statute. What
// these pin is the SEQUENCE, because the sequence is the entire content
// of the rule — and because F3's own refusal text stated it backwards,
// which is the best possible argument for having refused.

const net = netMassachusettsGains;

describe('§ 2(c)(2)(a) — a short-term (Part A) loss', () => {
  it('reaches interest and dividends FIRST, capped', () => {
    const r = net({ shortTerm: -5000, longTerm: 6000, interestAndDividends: 3000 });
    // $2,000 to interest (the cap), then $3,000 to the long-term gain.
    expect(r.appliedAgainstInterest).toBe(2000);
    expect(r.taxableInterestAndDividends).toBe(1000);
    expect(r.taxableLongTermGain).toBe(3000);
    expect(r.carryforward.partA).toBe(0);
  });

  it('reaches long-term gains only with what the cap leaves', () => {
    const r = net({ shortTerm: -5000, longTerm: 6000, interestAndDividends: 0 });
    // No interest to take, so the whole loss lands on the gain. The cap
    // is a ceiling on what CAN be applied, not an amount that is.
    expect(r.appliedAgainstInterest).toBe(0);
    expect(r.taxableLongTermGain).toBe(1000);
  });

  it('carries the remainder forward as a Part A loss, keeping its character', () => {
    const r = net({ shortTerm: -6000, longTerm: 1000, interestAndDividends: 500 });
    // $500 to interest (all there is), $1,000 to the gain, $4,500 left.
    expect(r.appliedAgainstInterest).toBe(500);
    expect(r.taxableLongTermGain).toBe(0);
    expect(r.carryforward.partA).toBe(4500);
    expect(r.carryforward.partC).toBe(0);
  });
});

describe('§ 2(c)(2)(b) — a long-term (Part C) loss', () => {
  it('takes the 8.5% short-term gain before the 5% interest', () => {
    // The rate-material ordering, and the one worth real money.
    const r = net({ shortTerm: 4000, longTerm: -5000, interestAndDividends: 3000 });
    expect(r.taxableShortTermGain).toBe(0);
    expect(r.appliedAgainstInterest).toBe(1000);
    expect(r.taxableInterestAndDividends).toBe(2000);

    // Reversing the two steps costs $35 at the published rates.
    const statute = r.taxableShortTermGain * 0.085 + r.taxableInterestAndDividends * 0.05;
    const reversed = 1000 * 0.085 + 1000 * 0.05; // interest first, capped at 2,000
    expect(statute).toBeCloseTo(100, 6);
    expect(reversed).toBeCloseTo(135, 6);
  });

  it('carries forward as a Part C loss', () => {
    const r = net({ shortTerm: 0, longTerm: -9000, interestAndDividends: 4000 });
    expect(r.appliedAgainstInterest).toBe(2000);
    expect(r.carryforward.partC).toBe(7000);
    expect(r.carryforward.partA).toBe(0);
  });
});

describe('§ 2(c)(4) — the cap', () => {
  it('is $2,000, not the federal $3,000, and says so', () => {
    expect(LOSS_AGAINST_INTEREST_CAP).toBe(2000);
    const r = net({ shortTerm: -4000, longTerm: 0, interestAndDividends: 5000 });
    expect(r.appliedAgainstInterest).toBe(2000);
    expect(JSON.stringify(r.notes)).toContain('the federal figure is $3,000');
  });

  it('is an AGGREGATE across both loss kinds, not $2,000 each', () => {
    // Both a short-term and a long-term loss, both reaching for interest.
    const r = net({ shortTerm: -1500, longTerm: -1500, interestAndDividends: 6000 });
    expect(r.appliedAgainstInterest).toBe(2000);
    expect(r.taxableInterestAndDividends).toBe(4000);
    // $3,000 of loss, $2,000 absorbed — the rest carries, split by character.
    expect(r.carryforward.partA + r.carryforward.partC).toBe(1000);
  });

  it('never takes more interest than exists', () => {
    const r = net({ shortTerm: -4000, longTerm: 0, interestAndDividends: 300 });
    expect(r.appliedAgainstInterest).toBe(300);
    expect(r.taxableInterestAndDividends).toBe(0);
    expect(r.carryforward.partA).toBe(3700);
  });
});

describe('the ordinary cases still behave', () => {
  it('gains alone pass through untouched', () => {
    const r = net({ shortTerm: 2000, longTerm: 1000, interestAndDividends: 500 });
    expect(r.taxableShortTermGain).toBe(2000);
    expect(r.taxableLongTermGain).toBe(1000);
    expect(r.taxableInterestAndDividends).toBe(500);
    expect(r.carryforward).toEqual({ partA: 0, partC: 0 });
  });

  it('nothing ever comes back negative', () => {
    const cases = [
      { shortTerm: -9999, longTerm: -9999, interestAndDividends: 10 },
      { shortTerm: -1, longTerm: 0, interestAndDividends: 0 },
      { shortTerm: 0, longTerm: -50000, interestAndDividends: 0 },
    ];
    for (const c of cases) {
      const r = net(c);
      expect(r.taxableShortTermGain).toBeGreaterThanOrEqual(0);
      expect(r.taxableLongTermGain).toBeGreaterThanOrEqual(0);
      expect(r.taxableInterestAndDividends).toBeGreaterThanOrEqual(0);
      expect(r.appliedAgainstInterest).toBeGreaterThanOrEqual(0);
    }
  });

  it('every step is recorded in the order the statute applies it', () => {
    const r = net({ shortTerm: -5000, longTerm: 6000, interestAndDividends: 3000 });
    const labels = r.steps.map((s) => s.label);
    expect(labels.indexOf('Short-term loss against interest and dividends')).toBeLessThan(
      labels.indexOf('Short-term loss against long-term gains'),
    );
  });
});
