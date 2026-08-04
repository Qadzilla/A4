// ─── Treaty fixtures (E3) ──────────────────────────────────────────
// Data, not code — so the fixtures pin the data: exactly two coded
// benefits (India 21(2), China 20), the named refusals for student
// articles Basis knows about and hasn't coded, clean nothing for
// everything else, and the 8833 flag riding every benefit so a future
// entry that needs the disclosure form can't silently skip it.

import type { TreatyBenefit } from '../treaties';
import type { FilingFixture, FixtureFact } from './types';

export interface TreatyExpected {
  benefitCount: number;
  kind?: TreatyBenefit['kind'];
  amount?: number | null;
  survivesResidency?: boolean;
  requires8833?: boolean;
  refusalsContain?: string;
  notesContain?: string;
}

export type TreatyFixture = FilingFixture<TreatyExpected>;

const str = (v: string) => ({ kind: 'string', value: v }) as const;

const student = (country: string): FixtureFact[] => [
  { factId: 'citizenship-country', value: str(country) },
  { factId: 'visa-type', value: str('F') },
];

export const TREATY_FIXTURES: TreatyFixture[] = [
  {
    id: 'treaty/india-standard-deduction',
    source: {
      kind: 'authority',
      citation:
        'US–India treaty Article 21(2) via Pub 901: a student from India may claim the standard deduction on the 1040-NR — the one general exception to the nonresident rule.',
    },
    taxYear: 2026,
    facts: student('IN'),
    expected: {
      benefitCount: 1,
      kind: 'standard-deduction',
      amount: null,
      survivesResidency: false,
      requires8833: false,
      notesContain: '21(2)',
    },
    note: "Worth ~$1,200 at P3's income — the difference between a $16,100 deduction and none at all. It does not survive residency, which is moot: residents get the deduction anyway.",
  },
  {
    id: 'treaty/china-article-20',
    source: {
      kind: 'authority',
      citation:
        'US–China treaty Article 20 via Pub 901: $5,000 of a student’s personal-services income is exempt — and the 1987 protocol’s saving-clause carve-out lets the benefit survive becoming a US resident.',
    },
    taxYear: 2026,
    facts: student('CN'),
    expected: {
      benefitCount: 1,
      kind: 'wage-scholarship-exemption',
      amount: 5000,
      survivesResidency: true,
      requires8833: false,
      notesContain: 'survives',
    },
    note: 'The famous one: the exemption follows the student across the residency flip, which almost nothing else in treaty law does. The survival flag is data here; the wiring test proves the resident-year application.',
  },
  {
    id: 'treaty/korea-named-refusal',
    source: {
      kind: 'authority',
      citation:
        "Pub 901's student table lists a US–South Korea student article (Article 21). Basis has not coded it — the refusal names the country and the article so the person knows exactly what to ask a preparer about.",
    },
    taxYear: 2026,
    facts: student('KR'),
    expected: {
      benefitCount: 0,
      refusalsContain: 'Article 21',
    },
  },
  {
    id: 'treaty/no-treaty-clean-nothing',
    source: {
      kind: 'adversarial',
      rationale:
        'A country outside both tables must produce clean nothing — no invented benefit, no scary refusal — with only the Pub 901 pointer, because claiming OR denying a treaty Basis has not read would both be inference.',
    },
    taxYear: 2026,
    facts: student('BR'),
    expected: {
      benefitCount: 0,
      notesContain: 'Pub 901',
    },
  },
  {
    id: 'treaty/h1b-gets-nothing',
    source: {
      kind: 'adversarial',
      rationale:
        'The coded articles are STUDENT articles: a Chinese citizen on an H visa gets no Article 20 — extending a student benefit past the student visa classes would be inference, not data.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'citizenship-country', value: str('CN') },
      { factId: 'visa-type', value: str('H') },
    ],
    expected: { benefitCount: 0 },
  },
  {
    id: 'treaty/name-variant-normalizes',
    source: {
      kind: 'adversarial',
      rationale:
        "Intake stores what the person typed. 'India' and 'IN' are the same country and must hit the same table row — a benefit lost to a spelling variant is a silent omission.",
    },
    taxYear: 2026,
    facts: student('India'),
    expected: {
      benefitCount: 1,
      kind: 'standard-deduction',
    },
  },
  {
    id: 'treaty/no-8833-required-yet',
    source: {
      kind: 'authority',
      citation:
        'Reg. §301.6114-1(c): treaty-based positions of students claiming these standard benefits are exempt from Form 8833 disclosure — the flag rides each benefit so a future coded benefit that DOES require the form forces it into requirements.',
    },
    taxYear: 2026,
    facts: student('CN'),
    expected: {
      benefitCount: 1,
      requires8833: false,
    },
  },
  {
    id: 'treaty/no-citizenship-clean',
    source: {
      kind: 'adversarial',
      rationale:
        'No citizenship fact on file means the treaty engine has nothing to stand on: empty benefits, empty refusals, empty notes — not a nag. The intake prices the question elsewhere.',
    },
    taxYear: 2026,
    facts: [{ factId: 'visa-type', value: str('F') }],
    expected: { benefitCount: 0 },
  },
];
