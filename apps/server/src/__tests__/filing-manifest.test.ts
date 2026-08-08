import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERSONA_FIXTURES } from '../lib/calc/filing/fixtures/personas';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { buildManifest } from '../lib/calc/filing/manifest';
import { manifestHtml } from '../lib/calc/filing/manifest-html';
import { recordedRunSchema } from '../lib/calc/filing/validation/harness';

// ─── H1 acceptance ─────────────────────────────────────────────────
// The integration test of the whole spine: P1's MANIFEST — not the
// evaluation it reads from — has to line-agree with what an
// independent filing tool printed for the same facts. If the manifest
// were a second computation rather than a view, this is where it would
// show, because the recording is a frozen artifact that cannot be
// edited to accommodate a drifting number.

const p1 = PERSONA_FIXTURES.find((f) => f.id === 'persona/p1-first-paycheck');
if (p1 === undefined) throw new Error('P1 fixture missing');

const manifestFor = (taxYear: number, today = '2026-03-01') =>
  buildManifest({
    assertions: assertionsOf(p1),
    docs: p1.docs,
    taxYear,
    today: new Date(`${today}T00:00:00Z`),
  });

const amountOf = (m: ReturnType<typeof manifestFor>, id: string): number | null => {
  for (const form of m.forms) {
    const line = form.lines.find((l) => l.id === id);
    if (line !== undefined) return line.amount;
  }
  return null;
};

describe('P1 line-agrees with the recorded external run', () => {
  const recording = recordedRunSchema.parse(
    JSON.parse(
      readFileSync(
        join(__dirname, '../lib/calc/filing/validation/expected/p1.taxcaster.json'),
        'utf8',
      ),
    ),
  );

  const manifest = manifestFor(recording.taxYear);

  for (const line of recording.lines) {
    it(`${line.id} — ${line.label}`, () => {
      const engine = amountOf(manifest, line.id);
      expect(engine, `the manifest has no ${line.id}`).not.toBeNull();
      // IRS rounding: whole dollars, so a dollar of drift is agreement.
      expect(Math.abs((engine as number) - line.amount)).toBeLessThanOrEqual(1);
    });
  }

  it('agrees on every line the tool printed, not a subset', () => {
    expect(recording.lines.length).toBeGreaterThanOrEqual(5);
  });
});

describe('provenance resolves, with nothing dangling', () => {
  const manifest = manifestFor(2026);

  it('every fact a line rests on is a live assertion', () => {
    const assertionIds = new Set(assertionsOf(p1).map((a) => a.assertionId));
    for (const form of manifest.forms) {
      for (const line of form.lines) {
        for (const fact of line.provenance.facts) {
          expect(
            assertionIds.has(fact.assertionId),
            `${line.id} cites ${fact.factId} with no live assertion behind it`,
          ).toBe(true);
        }
      }
    }
  });

  it('the wages line resolves to the document that said it', () => {
    const wages = manifest.forms[0]?.lines.find((l) => l.id === '1040:1z');
    expect(wages?.amount).toBe(42000);
    const chain = wages?.provenance.facts ?? [];
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every((f) => f.origin === 'person' || f.origin === 'document')).toBe(true);
  });

  it('every line says how, in words, and carries a citation or a rule', () => {
    for (const form of manifest.forms) {
      for (const line of form.lines) {
        expect(line.provenance.how.length, `${line.id} has no how`).toBeGreaterThan(10);
        expect(
          line.provenance.citation !== null || line.provenance.ruleId !== null,
          `${line.id} has neither citation nor rule`,
        ).toBe(true);
      }
    }
  });

  it('nothing a person reads carries a schema label', () => {
    const prose = manifest.forms
      .flatMap((f) => f.lines.flatMap((l) => l.provenance.facts.map((x) => x.label)))
      .join(' ');
    expect(prose).not.toMatch(/\bbox \d/i);
  });
});

describe('the sections beyond the forms', () => {
  const manifest = manifestFor(2026);

  it('carries the calendar, and drops dates already past', () => {
    expect(manifest.calendar.length).toBeGreaterThan(0);
    for (const entry of manifest.calendar) {
      expect(new Date(entry.date).getTime()).toBeGreaterThan(
        new Date('2026-02-28T00:00:00Z').getTime(),
      );
    }
    // The forfeit clock is the one nobody knows about.
    expect(JSON.stringify(manifest.calendar)).toContain('stops being claimable');
  });

  it('says the estimate is an estimate, without legalese', () => {
    expect(manifest.cautions[0]).toContain('not a filed return');
  });

  it('warns about corrected forms while the season is still open', () => {
    const inSeason = manifestFor(2026, '2027-02-10');
    expect(JSON.stringify(inSeason.cautions)).toContain('corrected 1099');
    const after = manifestFor(2026, '2027-09-01');
    expect(JSON.stringify(after.cautions)).not.toContain('corrected 1099');
  });

  it('points at where to file without stating a threshold it cannot cite', () => {
    expect(manifest.whereToFile.options.length).toBeGreaterThan(1);
    expect(manifest.whereToFile.carry.length).toBeGreaterThan(1);
    const prose = JSON.stringify(manifest.whereToFile.options);
    // The Free File ceiling moves annually; a figure written here would
    // have no citation and no year attached to it.
    expect(prose).not.toMatch(/\$[\d,]{5,}/);
  });

  it('the headline states what the year came to', () => {
    expect(manifest.headline).toContain('2026');
    expect(manifest.headline).toMatch(/refund|to pay/);
  });
});

describe('readiness gates the framing, never the visibility', () => {
  it('a blocked year still renders its lines, with the blockers on top', () => {
    // Strip the digital-assets answer: A6 blocks on it by name, and the
    // manifest must still show every number it can compute.
    const withoutAnswer = assertionsOf(p1).filter((a) => a.factId !== 'digital-asset-activity');
    const manifest = buildManifest({
      assertions: withoutAnswer,
      docs: p1.docs,
      taxYear: 2026,
      today: new Date('2027-03-01T00:00:00Z'),
    });

    expect(manifest.verdict).toBe('blocked');
    expect(manifest.blockers.length).toBeGreaterThan(0);
    // The lines are still there. The night before, with one thing
    // missing, is exactly when this page has to work.
    expect(manifest.forms[0]?.lines.length).toBeGreaterThan(3);
    expect(manifest.headline).toContain('in the way');
  });

  it('a year with nothing on it says so rather than printing an empty return', () => {
    const manifest = buildManifest({
      assertions: [],
      docs: [],
      taxYear: 2026,
      today: new Date('2027-03-01T00:00:00Z'),
    });
    expect(manifest.forms).toEqual([]);
    expect(manifest.headline).toContain('cannot be totalled');
  });
});

describe('the printable page', () => {
  const manifest = manifestFor(2026);
  const html = manifestHtml(manifest);

  it('is self-contained — nothing to fetch, nothing to run', () => {
    // The situation this is for is a kitchen table and a printout. It has
    // to render out of a downloads folder with the wifi off.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/@import/i);
  });

  it('carries every line, with its amount', () => {
    for (const line of manifest.forms.flatMap((f) => f.lines)) {
      expect(html, `${line.id} is missing from the page`).toContain(line.label);
    }
  });

  it('opens the folded provenance when printing', () => {
    // On paper there is no pointer, so a collapsed <details> is a
    // disclosure nobody can ever open.
    expect(html).toMatch(/@media print[\s\S]*details\s*\{\s*display:\s*block/);
    expect(html).toMatch(/@media print[\s\S]*summary\s*\{\s*display:\s*none/);
  });

  it('says what it is and is not, at the bottom of the page', () => {
    expect(html).toContain('not a filed return');
    expect(html).toContain('not tax advice');
  });

  it('escapes what it renders', () => {
    const hostile = buildManifest({
      assertions: assertionsOf(p1),
      docs: p1.docs,
      taxYear: 2026,
      today: new Date('2027-03-01T00:00:00Z'),
    });
    hostile.headline = '<script>alert(1)</script>';
    expect(manifestHtml(hostile)).not.toContain('<script>alert(1)</script>');
    expect(manifestHtml(hostile)).toContain('&lt;script&gt;');
  });
});

describe('a line names what is in it', () => {
  it('other taxes lists only the components that are actually there', () => {
    // $900 of cash tips and no wages: the only thing in line 23 is the
    // FICA on those tips. Listing self-employment tax and the
    // early-withdrawal penalty beside it would make the number
    // uncheckable, which is the one thing this page must never be.
    const tipsOnly = buildManifest({
      assertions: assertionsOf({
        ...p1,
        facts: [
          ...p1.facts.filter((f) => f.factId !== 'w2-wages'),
          { factId: 'unreported-tips', value: { kind: 'number', value: 900 } },
        ],
      }),
      docs: p1.docs,
      taxYear: 2026,
      today: new Date('2027-03-01T00:00:00Z'),
    });

    const line = tipsOnly.forms[0]?.lines.find((l) => l.id === '1040:23');
    expect(line).toBeDefined();
    expect(line?.provenance.how).toContain('tips the employer never saw');
    expect(line?.provenance.how).not.toContain('early');
    expect(line?.provenance.how).not.toContain('self-employment');
  });
});
