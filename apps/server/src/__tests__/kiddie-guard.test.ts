import { describe, expect, it } from 'vitest';
import { kiddieGuard } from '../lib/calc/kiddie-guard';

// ─── B2 acceptance ─────────────────────────────────────────────────
// The guard's whole job is refusing to advertise the 0% window to a
// student under 24 — and refusing to bother anyone else. Unknown facts
// caution; they never read as clear, and never as exposed for someone
// whose age already rules it out.

describe('kiddieGuard', () => {
  it('exposes a 20-year-old full-time student', () => {
    const r = kiddieGuard({ birthDate: '2006-03-10', fullTimeStudent: true }, 2026);
    expect(r.status).toBe('exposed');
    expect(r.note).toContain('$2,700');
    expect(r.note).toContain('parents');
  });

  it('a 26-year-old sees no change at all — the acceptance case', () => {
    const r = kiddieGuard({ birthDate: '1999-06-01', fullTimeStudent: null }, 2026);
    expect(r).toEqual({ status: 'clear', note: null });
  });

  it('age alone must not trigger: a 23-year-old non-student is clear', () => {
    const r = kiddieGuard({ birthDate: '2003-04-15', fullTimeStudent: false }, 2026);
    expect(r.status).toBe('clear');
  });

  it('a 23-year-old whose student status is unknown gets the caution', () => {
    const r = kiddieGuard({ birthDate: '2003-04-15', fullTimeStudent: null }, 2026);
    expect(r.status).toBe('unknown');
    expect(r.note).toContain('student under 24');
  });

  it('no birth date on file cautions — never clear, never silent', () => {
    const r = kiddieGuard({ birthDate: null, fullTimeStudent: null }, 2026);
    expect(r.status).toBe('unknown');
    expect(r.note).not.toBeNull();
  });

  it('the December-birthday boundary: 24 at year end is clear even mid-year', () => {
    // Born December 2002 — age 24 on 2026-12-31, so the student rule died
    // this year regardless of enrollment. Same year-end measure as A3.
    const r = kiddieGuard({ birthDate: '2002-12-15', fullTimeStudent: true }, 2026);
    expect(r.status).toBe('clear');
  });

  it('under 19 is exposed regardless of enrollment', () => {
    const r = kiddieGuard({ birthDate: '2009-05-01', fullTimeStudent: false }, 2026);
    expect(r.status).toBe('exposed');
  });

  it('names the threshold generically for a year whose figure is not loaded', () => {
    // 2025 and 2026 both carry $2,700 now (verified against the revenue
    // procedures). A year with no figures at all is the degradation path
    // this guards: it still guards, without inventing a number.
    const r = kiddieGuard({ birthDate: '2006-03-10', fullTimeStudent: true }, 2027);
    expect(r.status).toBe('exposed');
    expect(r.note).toContain('above the threshold');
    expect(r.note).not.toContain('$');
  });
});
