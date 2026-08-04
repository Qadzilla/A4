// ─── Form 8843 fixtures (E2) ───────────────────────────────────────
// The form nobody bills for, pinned where it matters: owed in a year
// with zero income (and mailed, because no e-file exists for it), one
// per exempt year, vanishing the moment the exemption ends, and the
// catch-up list framed protective — filing an old 8843 defends that
// year's exemption, it does not create a penalty.

import type { Form8843Determination } from '../form-8843';
import type { FilingFixture, FixtureFact } from './types';

export interface Form8843Expected {
  required: Form8843Determination['required'];
  standalone?: boolean;
  catchUp?: number[];
  missingFactsContain?: string;
  refusalsContain?: string;
  notesContain?: string;
}

export type Form8843Fixture = FilingFixture<Form8843Expected>;

const bool = (v: boolean) => ({ kind: 'bool', value: v }) as const;
const num = (v: number) => ({ kind: 'number', value: v }) as const;
const str = (v: string) => ({ kind: 'string', value: v }) as const;

const f1 = (entryYear: number): FixtureFact[] => [
  { factId: 'us-citizen', value: bool(false) },
  { factId: 'green-card-holder', value: bool(false) },
  { factId: 'visa-type', value: str('F') },
  { factId: 'visa-first-entry-year', value: num(entryYear) },
  { factId: 'full-time-student-months', value: num(9) },
];

export const FORM_8843_FIXTURES: Form8843Fixture[] = [
  {
    id: '8843/zero-income-still-owed',
    source: {
      kind: 'authority',
      citation:
        'Form 8843 instructions / Pub 519: an exempt individual files Form 8843 for each exempt year whether or not they have income or a return otherwise due; with no return it is filed by itself, on paper.',
    },
    taxYear: 2026,
    facts: [...f1(2026), { factId: 'school-name', value: str('State University') }],
    expected: {
      required: true,
      standalone: true,
      notesContain: 'cannot be e-filed',
    },
    note: 'The finding verbatim: owed even in a year that earned nothing — it is what proves the exemption if anyone ever asks, including for the FICA refund. And the mailing reality is named, because no software will say it.',
  },
  {
    id: '8843/return-year-rides-along',
    source: {
      kind: 'authority',
      citation:
        'Form 8843 instructions: when a return is required, the 8843 attaches to the 1040-NR and is due with it — one more sheet in the same filing.',
    },
    taxYear: 2026,
    facts: [
      ...f1(2026),
      { factId: 'w2-wages', value: num(12000) },
      { factId: 'school-name', value: str('State University') },
    ],
    expected: {
      required: true,
      standalone: false,
      notesContain: 'rides the 1040-NR',
    },
  },
  {
    id: '8843/five-exempt-years-five-forms',
    source: {
      kind: 'authority',
      citation:
        'Pub 519: each of the five exempt calendar years owes its own Form 8843 — the requirement is per year, not per person.',
    },
    taxYear: 2026,
    facts: [...f1(2022), { factId: 'school-name', value: str('State University') }],
    expected: {
      required: true,
      catchUp: [2022, 2023, 2024, 2025],
      notesContain: 'protective',
    },
    note: 'Entry in 2022, standing in 2026: the fifth exempt year owes its form AND the four behind it have no record — five forms total, which is exactly what the acceptance demands.',
  },
  {
    id: '8843/filed-years-drop-out',
    source: {
      kind: 'adversarial',
      rationale:
        'The catch-up list must honour the record: a year with an 8843 on file (the 8843-filed fact) is settled and must not be re-demanded — nagging about filed years is how protective framing curdles into noise.',
    },
    taxYear: 2026,
    facts: [
      ...f1(2022),
      { factId: 'school-name', value: str('State University') },
      { factId: '8843-filed', taxYear: 2022, value: bool(true) },
      { factId: '8843-filed', taxYear: 2023, value: bool(true) },
    ],
    expected: {
      required: true,
      catchUp: [2024, 2025],
    },
  },
  {
    id: '8843/year-six-vanishes',
    source: {
      kind: 'adversarial',
      rationale:
        "The cruel case from the contract: an F-1 in year six is a resident and owes NO 8843 this year — the requirement must vanish, not linger. The protective catch-up for the five exempt years behind it remains, because those years' paper still defends those years.",
    },
    taxYear: 2026,
    facts: [
      ...f1(2021),
      { factId: 'days-present', value: num(330) },
      { factId: 'married', value: bool(false) },
    ],
    expected: {
      required: false,
      catchUp: [2021, 2022, 2023, 2024, 2025],
    },
  },
  {
    id: '8843/j-researcher-refused',
    source: {
      kind: 'authority',
      citation:
        'Pub 519: J-visa teachers, researchers and trainees are exempt individuals under a DIFFERENT rule (two of the last six years, not five) — a J year with no student enrollment is named and refused, not modelled as a student.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(false) },
      { factId: 'green-card-holder', value: bool(false) },
      { factId: 'visa-type', value: str('J') },
      { factId: 'visa-first-entry-year', value: num(2025) },
      { factId: 'full-time-student-months', value: num(0) },
    ],
    expected: {
      required: false,
      refusalsContain: 'researcher',
    },
  },
  {
    id: '8843/part-iii-names-the-school',
    source: {
      kind: 'authority',
      citation:
        "Form 8843 Part III: students identify the academic institution (name, address, phone) and its program director — the form's own fields say what intake still owes.",
    },
    taxYear: 2026,
    facts: f1(2026),
    expected: {
      required: true,
      missingFactsContain: 'school-name',
      notesContain: 'Part III',
    },
  },
  {
    id: '8843/resident-never-owes',
    source: {
      kind: 'adversarial',
      rationale:
        'A citizen (or any resident with no exempt history) must produce no requirement and no catch-up — a protective list that fires for everyone protects no one.',
    },
    taxYear: 2026,
    facts: [
      { factId: 'us-citizen', value: bool(true) },
      { factId: 'married', value: bool(false) },
    ],
    expected: {
      required: false,
      catchUp: [],
    },
  },
];
