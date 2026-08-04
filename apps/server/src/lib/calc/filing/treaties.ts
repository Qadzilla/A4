// ─── E3 · The treaty engine ────────────────────────────────────────
// Data, not code: the handful of treaty benefits that move money for
// students, applied by citation. v1 ships exactly two, because they
// cover the largest student populations:
//
//   INDIA, Article 21(2) — the standard deduction preserved for
//   students on the 1040-NR. The one general exception to "no standard
//   deduction for nonresidents", worth ~$2,300 at a campus income. It
//   does NOT survive residency (moot — residents get the deduction
//   anyway).
//
//   CHINA, Article 20 — $5,000 of wage/scholarship income exempt, and
//   the famous part: the benefit SURVIVES becoming a resident (the
//   treaty's saving clause carves this article out), so the year-six
//   F-1 keeps it on their 1040.
//
// Everything else is named, not guessed: countries with known student
// articles refuse with the country and article so the refusal teaches;
// anything else gets clean nothing plus the Pub 901 pointer. The fence,
// verbatim: two countries v1, no saving-clause reasoning beyond the
// coded benefits, and the table grows by slice revision, never by
// inference.
//
// The 8833 edge: both v1 benefits are exempt from Form 8833 disclosure
// (Reg. §301.6114-1(c) — students claiming these standard items don't
// file it). The flag rides each benefit so a future entry that DOES
// require the form forces it into requirements instead of silently
// skipping.

import { type FactAssertion, type FactId, factSet, factState } from './facts';
import type { RuleTrace } from './trace';

export interface TreatyBenefit {
  country: string; // normalized: 'IN', 'CN'
  countryName: string;
  article: string;
  kind: 'standard-deduction' | 'wage-scholarship-exemption';
  /** Null for flag benefits (the deduction's amount is the year's own). */
  amount: number | null;
  /** China's famous carve-out: the benefit outlives the residency flip. */
  survivesResidency: boolean;
  /** False for both v1 benefits; a true here must force Form 8833. */
  requires8833: boolean;
  citation: string;
}

export interface TreatyDetermination {
  benefits: TreatyBenefit[];
  /** Known student articles Basis has not coded — named so the refusal teaches. */
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

const CITE = 'IRS Pub 901 / the treaty texts; India Art 21(2); China Art 20';

/** Free-text country answers normalize before the table lookup. */
function normalizeCountry(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (v === 'IN' || v === 'INDIA') return 'IN';
  if (v === 'CN' || v === 'CHINA' || v === 'PRC' || v === "PEOPLE'S REPUBLIC OF CHINA") return 'CN';
  if (v === 'KR' || v === 'KOREA' || v === 'SOUTH KOREA' || v === 'REPUBLIC OF KOREA') return 'KR';
  if (v === 'CA' || v === 'CANADA') return 'CA';
  if (v === 'DE' || v === 'GERMANY') return 'DE';
  if (v === 'FR' || v === 'FRANCE') return 'FR';
  if (v === 'JP' || v === 'JAPAN') return 'JP';
  return v;
}

/** Visa classes whose students the coded articles cover. */
const STUDENT_VISAS = new Set(['F', 'J', 'M', 'Q']);

/**
 * Student articles Basis KNOWS exist and has not coded — the named
 * refusal, with the article, so the person leaves knowing what to ask a
 * preparer about. Growing this into a benefit is a slice revision.
 */
const NAMED_UNCODED: Record<string, { name: string; article: string }> = {
  KR: { name: 'South Korea', article: 'Article 21' },
  CA: { name: 'Canada', article: 'Article XX' },
  DE: { name: 'Germany', article: 'Article 20' },
  FR: { name: 'France', article: 'Article 21' },
  JP: { name: 'Japan', article: 'Article 19' },
};

/**
 * The coded table, year-aware in shape: treaties rarely change, but the
 * accessor exists so a renegotiated article becomes a year split here
 * instead of an if-ladder somewhere else.
 */
function codedBenefits(country: string, _taxYear: number): TreatyBenefit[] {
  if (country === 'IN') {
    return [
      {
        country: 'IN',
        countryName: 'India',
        article: '21(2)',
        kind: 'standard-deduction',
        amount: null,
        survivesResidency: false,
        requires8833: false,
        citation:
          'US–India treaty Article 21(2) via Pub 901: an Indian student may claim the standard deduction on the 1040-NR.',
      },
    ];
  }
  if (country === 'CN') {
    return [
      {
        country: 'CN',
        countryName: 'China',
        article: '20',
        kind: 'wage-scholarship-exemption',
        amount: 5000,
        survivesResidency: true,
        requires8833: false,
        citation:
          'US–China treaty Article 20 via Pub 901: $5,000 of a student’s income for personal services is exempt — and the protocol’s saving-clause carve-out lets it survive becoming a resident.',
      },
    ];
  }
  return [];
}

export function determineTreatyBenefits(
  assertions: FactAssertion[],
  taxYear: number,
): TreatyDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];

  const str = (id: FactId): string | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'string' ? s.value.value : null;
  };

  const finish = (benefits: TreatyBenefit[], refusals: string[]): TreatyDetermination => ({
    benefits,
    refusals,
    explanation: {
      ruleId: 'treaties/student-benefits',
      citation: CITE,
      steps: [
        { label: 'Tax year', value: taxYear },
        { label: 'Benefits', value: benefits.length },
      ],
      notes,
    },
    consumed,
  });

  const rawCountry = str('citizenship-country');
  if (rawCountry === null) {
    return finish([], []);
  }
  const country = normalizeCountry(rawCountry);

  // The coded articles are STUDENT articles: without a student visa class
  // on file, nothing here applies — an H-1B from Beijing gets no Article
  // 20, and pretending otherwise would be inference, not data.
  const visa = str('visa-type');
  if (visa === null || !STUDENT_VISAS.has(visa)) {
    return finish([], []);
  }

  const benefits = codedBenefits(country, taxYear);
  if (benefits.length > 0) {
    for (const b of benefits) {
      notes.push(
        b.kind === 'standard-deduction'
          ? `${b.countryName}'s treaty (Article ${b.article}) preserves the standard deduction for students — the one general exception to the nonresident rule. ${b.citation}`
          : `${b.countryName}'s treaty (Article ${b.article}) exempts $${b.amount} of wage and scholarship income — and this benefit survives becoming a resident, which almost nothing else does. ${b.citation}`,
      );
    }
    return finish(benefits, []);
  }

  const named = NAMED_UNCODED[country];
  if (named) {
    return finish(
      [],
      [
        `The US–${named.name} treaty has a student article (${named.article}) Basis has not coded — its benefit is real and worth a preparer's look, cited in Pub 901's student table. Basis claims nothing it hasn't coded, so nothing is applied here.`,
      ],
    );
  }

  notes.push(
    `No student treaty benefit is coded for ${rawCountry}. If a US tax treaty with it exists, Pub 901's student table is the check — nothing is claimed that isn't coded.`,
  );
  return finish([], []);
}
