import { describe, expect, it } from 'vitest';
import { stateTreatment } from '../lib/calc/state-treatment';

// ─── B3 acceptance ─────────────────────────────────────────────────
// Five shapes, each with a line that keeps "0% federal" from reading as
// "0%": ordinary (CA/NY), split-by-term (MA), none (the no-tax states),
// unknown (no state on file), not-modeled (everywhere else, named).

describe('stateTreatment', () => {
  it('CA: all gains are ordinary income — the window is federal only', () => {
    const t = stateTreatment('CA');
    expect(t.kind).toBe('ordinary');
    expect(t.line).toContain('California');
    expect(t.line).toContain('federal only');
  });

  it('MA: the state also cares about the holding period, differently', () => {
    const t = stateTreatment('MA');
    expect(t.kind).toBe('split-by-term');
    expect(t.line).toContain('8.5%');
    expect(t.line).toContain('5%');
  });

  it('NY: ordinary, named', () => {
    expect(stateTreatment('NY').kind).toBe('ordinary');
  });

  it('a no-income-tax state says 0% really is 0%', () => {
    const t = stateTreatment('TX');
    expect(t.kind).toBe('none');
    expect(t.line).toContain('really is 0%');
  });

  it("Washington's excise is named, not hidden", () => {
    expect(stateTreatment('WA').line).toContain('excise');
  });

  it('no state on file prompts for the fact instead of guessing', () => {
    const t = stateTreatment('');
    expect(t.kind).toBe('unknown');
    expect(t.line).toContain('federal only');
  });

  it('an unmodelled state names itself', () => {
    const t = stateTreatment('OH');
    expect(t.kind).toBe('not-modeled');
    expect(t.line).toContain('OH');
  });

  it('normalises case and whitespace', () => {
    expect(stateTreatment(' ca ').kind).toBe('ordinary');
  });
});
