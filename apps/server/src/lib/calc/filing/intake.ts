// ─── G1 · The intake, as questions about a life ────────────────────
// Doctrine 1 made into a data structure. Every determination in this
// engine consumes facts; this module is the only place that decides how
// a human is asked for one, and the rule it obeys is that the question
// describes a life rather than a return. "Months of the year renting a
// home in California" is a fact label. "Did you rent a place in
// California, and for how many months?" is a question. The registry
// below only contains the second kind, and a test greps every prompt in
// it against a blocklist of tax vocabulary — the fence is mechanical
// because a fence made of good intentions gets stepped over by the
// fortieth question.
//
// Two structural rules, both from the contract:
//   · No question exists without a consuming fact id. `factId` is typed
//     against the A1 registry, so a question for an invented fact is a
//     compile error, exactly like the AI's record_fact tool.
//   · Not every fact gets a question. Anything a document says better
//     than a person can — W-2 boxes, 1099 totals — arrives through the
//     C-phase and is deliberately absent here. Asking someone to read a
//     number off a form they already uploaded is how software wastes a
//     person's evening.
//
// Order is not authored. Within a section the questions sort by what
// A4 says the answer is worth, so the intake reorders itself around
// dollars as it learns. What IS authored is `showWhen`: a question that
// cannot matter for this person is not asked at all. A 21-year-old in
// Boston is never asked about Yonkers.

import {
  type FactAssertion,
  type FactId,
  type FactSet,
  type FactState,
  factEntry,
  factState,
} from './facts';
import { fork } from './forks';

export type IntakeSection = 'you' | 'home' | 'school' | 'work' | 'money-moves' | 'health';

export const SECTION_ORDER: IntakeSection[] = [
  'you',
  'home',
  'school',
  'work',
  'money-moves',
  'health',
];

export const SECTION_TITLES: Record<IntakeSection, string> = {
  you: 'You',
  home: 'Home',
  school: 'School',
  work: 'Work',
  'money-moves': 'Money moves',
  health: 'Health',
};

/** How to render the control. Shapes the input, never the meaning. */
export type IntakeInput =
  | { kind: 'yes-no' }
  | { kind: 'date' }
  | { kind: 'text' }
  | { kind: 'us-state' }
  | { kind: 'choice'; options: Array<{ value: string; label: string }> }
  | {
      kind: 'number';
      unit: 'dollars' | 'months' | 'days' | 'miles' | 'percent' | 'count' | 'year';
    };

export interface IntakeQuestion {
  /** The fact this answer becomes. Typed — no orphan questions. */
  factId: FactId;
  section: IntakeSection;
  /** Life language. Policed by the blocklist test. */
  prompt: string;
  /** One line of context in the same register, where it earns its place. */
  why?: string;
  input: IntakeInput;
  /** Asked only when the year's other answers make it possible. */
  showWhen?: (set: FactSet) => boolean;
}

// ── Readers for the gates ──
const yes = (set: FactSet, id: FactId): boolean => {
  const s = factState(set, id);
  return s.status === 'known' && s.value.kind === 'bool' && s.value.value === true;
};
const no = (set: FactSet, id: FactId): boolean => {
  const s = factState(set, id);
  return s.status === 'known' && s.value.kind === 'bool' && s.value.value === false;
};
const amount = (set: FactSet, id: FactId): number | null => {
  const s = factState(set, id);
  return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
};
const over = (set: FactSet, id: FactId, n: number): boolean => (amount(set, id) ?? 0) > n;
const text = (set: FactSet, id: FactId): string | null => {
  const s = factState(set, id);
  return s.status === 'known' && s.value.kind === 'string' ? s.value.value : null;
};
const known = (set: FactSet, id: FactId): boolean => factState(set, id).status === 'known';

/** Not a citizen and not a green-card holder — the visa branch. */
const onAVisa = (set: FactSet): boolean => no(set, 'us-citizen') && !yes(set, 'green-card-holder');
/** New York is in play as home or as the place the work is filed from. */
const touchesNY = (set: FactSet): boolean =>
  text(set, 'state-of-residence') === 'NY' ||
  text(set, 'prior-state-of-residence') === 'NY' ||
  text(set, 'employer-state') === 'NY';
const touchesCA = (set: FactSet): boolean =>
  text(set, 'state-of-residence') === 'CA' || text(set, 'prior-state-of-residence') === 'CA';
const touchesMA = (set: FactSet): boolean =>
  text(set, 'state-of-residence') === 'MA' || text(set, 'prior-state-of-residence') === 'MA';
const moved = (set: FactSet): boolean => known(set, 'state-move-date');
const inSchool = (set: FactSet): boolean => over(set, 'full-time-student-months', 0);
const worksForThemselves = (set: FactSet): boolean =>
  over(set, 'contract-income', 0) || over(set, 'platform-income', 0);
const tookMoneyOut = (set: FactSet): boolean => over(set, 'retirement-distribution', 0);
const hasTips = (set: FactSet): boolean =>
  over(set, 'w2-tips', 0) || over(set, 'unreported-tips', 0) || over(set, 'se-tips-portion', 0);

const STATE_MONTHS = { kind: 'number', unit: 'months' } as const;
const DOLLARS = { kind: 'number', unit: 'dollars' } as const;
const YES_NO = { kind: 'yes-no' } as const;

// ─── The registry ──────────────────────────────────────────────────

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  // ── You ──
  {
    factId: 'birth-date',
    section: 'you',
    prompt: 'When were you born?',
    why: 'A handful of rules turn on age, and two of them turn on it mid-year.',
    input: { kind: 'date' },
  },
  {
    factId: 'us-citizen',
    section: 'you',
    prompt: 'Are you a US citizen?',
    input: YES_NO,
  },
  {
    factId: 'green-card-holder',
    section: 'you',
    prompt: 'Do you have a green card?',
    input: YES_NO,
    showWhen: (set) => no(set, 'us-citizen'),
  },
  {
    factId: 'citizenship-country',
    section: 'you',
    prompt: 'Which country are you a citizen of?',
    why: 'Some countries have agreements with the US that change what you owe here.',
    input: { kind: 'text' },
    showWhen: (set) => no(set, 'us-citizen'),
  },
  {
    factId: 'visa-type',
    section: 'you',
    prompt: 'What kind of visa are you here on?',
    input: {
      kind: 'choice',
      options: [
        { value: 'F', label: 'F — student' },
        { value: 'J', label: 'J — exchange visitor' },
        { value: 'M', label: 'M — vocational student' },
        { value: 'Q', label: 'Q — cultural exchange' },
        { value: 'other', label: 'Something else' },
      ],
    },
    showWhen: onAVisa,
  },
  {
    factId: 'visa-first-entry-year',
    section: 'you',
    prompt: 'What year did you first arrive in the US on that visa?',
    why: 'How long you have been here changes how the US counts your time.',
    input: { kind: 'number', unit: 'year' },
    showWhen: (set) => onAVisa(set) && known(set, 'visa-type'),
  },
  {
    factId: 'days-present',
    section: 'you',
    prompt: 'Roughly how many days were you physically in the US last year?',
    input: { kind: 'number', unit: 'days' },
    showWhen: onAVisa,
  },
  {
    factId: 'first-presence-date',
    section: 'you',
    prompt: 'What was the first day you set foot in the US last year?',
    input: { kind: 'date' },
    showWhen: onAVisa,
  },
  {
    factId: 'married',
    section: 'you',
    prompt: 'Were you married on December 31?',
    why: 'The last day of the year is the one that counts, however long the year was.',
    input: YES_NO,
  },
  {
    factId: 'filing-jointly',
    section: 'you',
    prompt: 'Are you and your spouse putting in one return together, rather than one each?',
    input: YES_NO,
    showWhen: (set) => yes(set, 'married'),
  },
  {
    factId: 'joint-refund-only',
    section: 'you',
    prompt: 'Is the only reason for the joint one to get money back that was already taken out?',
    input: YES_NO,
    showWhen: (set) => yes(set, 'married') && yes(set, 'filing-jointly'),
  },
  {
    factId: 'widowed-within-two-prior-years',
    section: 'you',
    prompt:
      'Did your spouse die in either of the two years before last, and you have not remarried?',
    input: YES_NO,
    showWhen: (set) => no(set, 'married'),
  },
  {
    factId: 'parents-claimed-me',
    section: 'you',
    prompt: 'Did a parent put you on their own return last year?',
    why: 'If they did, some things move to their side and cannot be on both.',
    input: YES_NO,
  },
  {
    factId: 'self-support-share-pct',
    section: 'you',
    prompt: 'Of everything it cost to live last year, what share did you pay yourself?',
    why: 'Rent, food, phone, tuition, the car — your money against everyone else’s.',
    input: { kind: 'number', unit: 'percent' },
  },
  {
    factId: 'lived-with-parents-months',
    section: 'you',
    prompt: 'How many months of the year did you live at your parents’ place?',
    input: STATE_MONTHS,
  },
  {
    factId: 'own-dependent-lived-with-months',
    section: 'you',
    prompt:
      'If you have a child or someone you look after, how many months did they live with you?',
    input: STATE_MONTHS,
  },
  {
    factId: 'paid-over-half-home-costs',
    section: 'you',
    prompt: 'Did you pay more than half of what it cost to run your home?',
    input: YES_NO,
    showWhen: (set) => over(set, 'own-dependent-lived-with-months', 0),
  },
  {
    factId: 'permanently-disabled',
    section: 'you',
    prompt: 'Were you permanently and totally disabled at any point last year?',
    input: YES_NO,
  },
  {
    factId: 'gross-income',
    section: 'you',
    prompt:
      'Roughly how much money came in last year, from everything, before anything was taken out?',
    why: 'A rough number is fine here — the documents will sharpen it.',
    input: DOLLARS,
  },

  // ── Home ──
  {
    factId: 'state-of-residence',
    section: 'home',
    prompt: 'Which state did you live in for most of last year?',
    input: { kind: 'us-state' },
  },
  {
    factId: 'state-move-date',
    section: 'home',
    prompt: 'If you moved to a different state during the year, what day did you move?',
    why: 'The day splits the year in two, and each side belongs to a different state.',
    input: { kind: 'date' },
  },
  {
    factId: 'prior-state-of-residence',
    section: 'home',
    prompt: 'Which state did you live in before the move?',
    input: { kind: 'us-state' },
    showWhen: moved,
  },
  {
    factId: 'wages-earned-in-prior-state',
    section: 'home',
    prompt: 'How much were you paid while you still lived in the old state?',
    why: 'A payslip from around the move date answers this exactly. Without it, we split the year by the calendar and say so.',
    input: DOLLARS,
    showWhen: moved,
  },
  {
    factId: 'months-in-nyc',
    section: 'home',
    prompt: 'How many months did you live in New York City — any borough?',
    why: 'The city charges its own on top of the state.',
    input: STATE_MONTHS,
    showWhen: touchesNY,
  },
  {
    factId: 'months-in-yonkers',
    section: 'home',
    prompt: 'How many months did you live in Yonkers?',
    input: STATE_MONTHS,
    showWhen: touchesNY,
  },
  {
    factId: 'yonkers-wages',
    section: 'home',
    prompt:
      'If you worked in Yonkers but lived somewhere else, how much were you paid for that work?',
    input: DOLLARS,
    showWhen: touchesNY,
  },
  {
    factId: 'ny-permanent-abode',
    section: 'home',
    prompt:
      'Did you keep a place to live in New York available to you all year — a lease, or a room kept for you?',
    input: YES_NO,
    showWhen: touchesNY,
  },
  {
    factId: 'days-present-ny',
    section: 'home',
    prompt: 'How many days were you in New York State at all last year — any part of a day counts?',
    input: { kind: 'number', unit: 'days' },
    showWhen: (set) => touchesNY(set) && yes(set, 'ny-permanent-abode'),
  },
  {
    factId: 'rent-months-california',
    section: 'home',
    prompt: 'How many months did you rent a home in California?',
    why: 'Six or more is worth money back.',
    input: STATE_MONTHS,
    showWhen: touchesCA,
  },
  {
    factId: 'rent-paid-massachusetts',
    section: 'home',
    prompt: 'How much rent did you pay for a Massachusetts home last year, in total?',
    input: DOLLARS,
    showWhen: touchesMA,
  },

  // ── School ──
  {
    factId: 'full-time-student-months',
    section: 'school',
    prompt: 'How many months were you enrolled full-time at a school?',
    why: 'Five months is a line that several rules sit on.',
    input: STATE_MONTHS,
  },
  {
    factId: 'months-away-at-school',
    section: 'school',
    prompt: 'How many of those months were you living away from your family’s home?',
    why: 'Time away at school still counts as living there, which surprises people.',
    input: STATE_MONTHS,
    showWhen: inSchool,
  },
  {
    factId: 'school-name',
    section: 'school',
    prompt: 'What is the school called?',
    input: { kind: 'text' },
    showWhen: (set) => inSchool(set) || onAVisa(set),
  },
  {
    factId: 'degree-program',
    section: 'school',
    prompt: 'Are you working towards a degree or a recognised qualification?',
    input: YES_NO,
    showWhen: inSchool,
  },
  {
    factId: 'enrolled-half-time',
    section: 'school',
    prompt: 'Were you enrolled at least half-time for at least one term?',
    input: YES_NO,
    showWhen: inSchool,
  },
  {
    factId: 'paid-tuition',
    section: 'school',
    prompt: 'Did you pay a school for tuition or required fees last year?',
    why: 'Even if a parent or a scholarship covered part of it.',
    input: YES_NO,
  },
  {
    factId: 'aotc-years-used',
    section: 'school',
    prompt: 'How many past years has anyone already claimed the four-year college benefit for you?',
    why: 'There are four in a lifetime. A past return — or whoever filed it for you — can say.',
    input: { kind: 'number', unit: 'count' },
    showWhen: (set) => yes(set, 'paid-tuition'),
  },
  {
    factId: 'felony-drug-conviction',
    section: 'school',
    prompt:
      'Have you been convicted of a felony for possessing or supplying a controlled substance?',
    why: 'One school benefit is closed by this; the other is not. It is asked only because leaving it out would put the wrong one in front of you.',
    input: YES_NO,
    showWhen: (set) => yes(set, 'paid-tuition'),
  },
  {
    factId: 'paid-student-loan-interest',
    section: 'school',
    prompt: 'Did you make payments on a student loan last year?',
    input: YES_NO,
  },
  {
    factId: 'scholarship-income',
    section: 'school',
    prompt: 'Did you get a scholarship, a fellowship or a stipend?',
    input: YES_NO,
  },

  // ── Work ──
  {
    factId: 'w2-employer-count',
    section: 'work',
    prompt: 'How many places put you on their payroll last year?',
    why: 'Two or more in one year is where money quietly goes missing.',
    input: { kind: 'number', unit: 'count' },
  },
  {
    factId: 'employer-state',
    section: 'work',
    prompt: 'Which state is your employer’s office in?',
    why: 'Where the office is can matter as much as where you were sitting.',
    input: { kind: 'us-state' },
    showWhen: (set) => over(set, 'w2-employer-count', 0),
  },
  {
    factId: 'work-outside-employer-necessity',
    section: 'work',
    prompt:
      'Was working from another state something your employer required, rather than something you chose?',
    why: 'This one is a position you take, not an arithmetic input — the answer changes who has to argue it.',
    input: YES_NO,
    showWhen: (set) => {
      const employer = text(set, 'employer-state');
      const home = text(set, 'state-of-residence');
      return employer !== null && home !== null && employer !== home;
    },
  },
  {
    factId: 'work-authorized',
    section: 'work',
    prompt: 'Was the work you did allowed under the terms of your visa?',
    input: YES_NO,
    showWhen: onAVisa,
  },
  {
    factId: 'contract-income',
    section: 'work',
    prompt:
      'How much were you paid last year for freelance, contract or side work — before expenses?',
    input: DOLLARS,
  },
  {
    factId: 'platform-income',
    section: 'work',
    prompt: 'How much came through payment apps or selling platforms last year, in total?',
    why: 'The gross number the app shows, before it kept its cut.',
    input: DOLLARS,
  },
  {
    factId: 'platform-fees',
    section: 'work',
    prompt: 'How much of that did the platform keep in fees and commission?',
    input: DOLLARS,
    showWhen: (set) => over(set, 'platform-income', 0),
  },
  {
    factId: 'platform-refunds',
    section: 'work',
    prompt: 'How much of it came back out again as refunds or chargebacks?',
    input: DOLLARS,
    showWhen: (set) => over(set, 'platform-income', 0),
  },
  {
    factId: 'personal-items-proceeds',
    section: 'work',
    prompt: 'How much of it was you selling your own used things?',
    why: 'A couch sold for less than you paid is not money you made.',
    input: DOLLARS,
    showWhen: (set) => over(set, 'platform-income', 0),
  },
  {
    factId: 'payer-set-hours',
    section: 'work',
    prompt: 'Did the company set your hours?',
    input: YES_NO,
    showWhen: worksForThemselves,
  },
  {
    factId: 'payer-provided-equipment',
    section: 'work',
    prompt: 'Did you work on their equipment rather than your own?',
    input: YES_NO,
    showWhen: worksForThemselves,
  },
  {
    factId: 'payer-controlled-how',
    section: 'work',
    prompt: 'Did they direct how you did the work, not just what they wanted at the end?',
    why: 'These three together decide whether you were really running your own thing — and whether you have been paying a bill that was theirs.',
    input: YES_NO,
    showWhen: worksForThemselves,
  },
  {
    factId: 'same-payer-w2-and-1099',
    section: 'work',
    prompt:
      'Did the same company both put you on payroll and pay you as a contractor in the same year?',
    input: YES_NO,
    showWhen: worksForThemselves,
  },
  {
    factId: 'business-miles',
    section: 'work',
    prompt: 'How many miles did you drive for that work?',
    why: 'Getting to a regular job never counts. Driving as the job does.',
    input: { kind: 'number', unit: 'miles' },
    showWhen: worksForThemselves,
  },
  {
    factId: 'business-phone-expense',
    section: 'work',
    prompt: 'What did the work share of your phone and data cost you?',
    input: DOLLARS,
    showWhen: worksForThemselves,
  },
  {
    factId: 'business-supplies-expense',
    section: 'work',
    prompt: 'What did you spend on supplies for the work — bags, chargers, materials?',
    input: DOLLARS,
    showWhen: worksForThemselves,
  },
  {
    factId: 'home-office-expense',
    section: 'work',
    prompt: 'What did you spend on a space at home used only for the work?',
    why: 'Basis names this one and hands it over rather than working it out — the rules around it are where people get into trouble.',
    input: DOLLARS,
    showWhen: worksForThemselves,
  },
  {
    factId: 'other-business-expenses',
    section: 'work',
    prompt: 'Anything else the work cost you that the questions above missed?',
    input: DOLLARS,
    showWhen: worksForThemselves,
  },
  {
    factId: 'unreported-tips',
    section: 'work',
    prompt: 'Did you get tips in cash that never went through the till?',
    why: 'Asked plainly because the answer changes what you owe, and guessing it for you would be worse.',
    input: DOLLARS,
  },
  {
    factId: 'se-tips-portion',
    section: 'work',
    prompt: 'Of the freelance or platform money, how much of it was tips?',
    input: DOLLARS,
    showWhen: worksForThemselves,
  },
  {
    factId: 'tipped-occupation-listed',
    section: 'work',
    prompt: 'Is it the kind of job where customers normally tip?',
    input: YES_NO,
    showWhen: hasTips,
  },
  {
    factId: 'overtime-premium-pay',
    section: 'work',
    prompt:
      'When you worked overtime, how much extra did you get on top of your normal hourly rate?',
    why: 'Only the extra part — the half in time-and-a-half, not the whole overtime check.',
    input: DOLLARS,
  },

  // ── Money moves ──
  {
    factId: 'brokerage-account',
    section: 'money-moves',
    prompt: 'Did you have an investing account open at any point last year?',
    input: YES_NO,
  },
  {
    factId: 'sold-investments',
    section: 'money-moves',
    prompt: 'Did you sell anything in it?',
    why: 'Just holding produces no paperwork. Selling does.',
    input: YES_NO,
    showWhen: (set) => yes(set, 'brokerage-account'),
  },
  {
    factId: 'received-dividends',
    section: 'money-moves',
    prompt: 'Did any of it pay you dividends?',
    input: YES_NO,
    showWhen: (set) => yes(set, 'brokerage-account'),
  },
  {
    factId: 'realized-short-gains',
    section: 'money-moves',
    prompt:
      'On the things you sold that you had owned less than a year, how much did you make or lose?',
    why: 'If your account is connected, this is worked out from your own trades and you can leave it.',
    input: DOLLARS,
    showWhen: (set) => yes(set, 'sold-investments'),
  },
  {
    factId: 'realized-long-gains',
    section: 'money-moves',
    prompt: 'And on the things you had owned more than a year?',
    input: DOLLARS,
    showWhen: (set) => yes(set, 'sold-investments'),
  },
  {
    factId: 'earned-bank-interest',
    section: 'money-moves',
    prompt: 'Did a bank or savings account pay you interest?',
    input: YES_NO,
  },
  {
    factId: 'digital-asset-activity',
    section: 'money-moves',
    prompt: 'Did you sell, swap, or get paid in crypto?',
    why: 'Swapping one coin for another counts, even though no cash moved.',
    input: YES_NO,
  },
  {
    factId: 'crypto-proceeds',
    section: 'money-moves',
    prompt: 'How much did you get for what you sold or swapped?',
    why: 'Usually no form exists for this, which is exactly why it is asked.',
    input: DOLLARS,
    showWhen: (set) => yes(set, 'digital-asset-activity'),
  },
  {
    factId: 'crypto-cost-basis',
    section: 'money-moves',
    prompt: 'What had you originally paid for it?',
    input: DOLLARS,
    showWhen: (set) => yes(set, 'digital-asset-activity'),
  },
  {
    factId: 'crypto-held-over-year',
    section: 'money-moves',
    prompt: 'Had you held it for more than a year before that?',
    input: YES_NO,
    showWhen: (set) => yes(set, 'digital-asset-activity'),
  },
  {
    factId: 'ira-contributions',
    section: 'money-moves',
    prompt: 'How much did you put into a retirement account of your own last year?',
    why: 'This one you can still do after the year has ended, right up to April.',
    input: DOLLARS,
  },
  {
    factId: 'retirement-distribution',
    section: 'money-moves',
    prompt: 'Did you take any money out of a retirement account? How much?',
    input: DOLLARS,
  },
  {
    factId: 'early-distribution-from-ira',
    section: 'money-moves',
    prompt:
      'Did that money come out of an account you opened yourself, rather than one through a job?',
    why: 'The two kinds have different escape hatches, and this decides which ones you can reach.',
    input: YES_NO,
    showWhen: tookMoneyOut,
  },
  {
    factId: 'retirement-early-ira-amount',
    section: 'money-moves',
    prompt: 'How much of it came out of your own account?',
    input: DOLLARS,
    showWhen: (set) => tookMoneyOut(set) && yes(set, 'early-distribution-from-ira'),
  },
  {
    factId: 'bought-first-home',
    section: 'money-moves',
    prompt: 'Did you buy your first home last year?',
    input: YES_NO,
    showWhen: tookMoneyOut,
  },
  {
    factId: 'separated-from-service-at-55',
    section: 'money-moves',
    prompt: 'Did you leave that job in or after the year you turned 55?',
    input: YES_NO,
    showWhen: tookMoneyOut,
  },
  {
    factId: 'unemployed-twelve-weeks',
    section: 'money-moves',
    prompt: 'Were you out of work and on unemployment for twelve weeks straight or longer?',
    input: YES_NO,
  },
  {
    factId: 'unemployment-income',
    section: 'money-moves',
    prompt: 'How much unemployment did you receive?',
    input: DOLLARS,
  },
  {
    factId: 'gambling-winnings',
    section: 'money-moves',
    prompt: 'Did you win anything betting or gambling last year?',
    input: DOLLARS,
  },
  {
    factId: 'gambling-losses',
    section: 'money-moves',
    prompt: 'And how much did you lose?',
    input: DOLLARS,
    showWhen: (set) => over(set, 'gambling-winnings', 0),
  },
  {
    factId: 'state-refund-received',
    section: 'money-moves',
    prompt: 'Did your state send you money back last year from the year before?',
    input: DOLLARS,
  },
  {
    factId: 'itemized-prior-year',
    section: 'money-moves',
    prompt:
      'On last year’s return, did you list out individual costs instead of taking the flat amount everyone gets?',
    why: 'This decides whether that state money counts as income now.',
    input: YES_NO,
    showWhen: (set) => over(set, 'state-refund-received', 0),
  },

  // ── Health ──
  {
    factId: 'marketplace-health-insurance',
    section: 'health',
    prompt: 'Did you buy health insurance through healthcare.gov or a state marketplace?',
    why: 'If you did, a form has to arrive before anything can be finished — it is the one thing that freezes a return.',
    input: YES_NO,
  },
  {
    factId: 'medical-expenses-paid',
    section: 'health',
    prompt: 'What did you pay out of your own pocket for medical or dental care?',
    input: DOLLARS,
  },
  {
    factId: 'health-premiums-paid-while-unemployed',
    section: 'health',
    prompt: 'While you were out of work, how much did you pay for health cover?',
    input: DOLLARS,
    showWhen: (set) => yes(set, 'unemployed-twelve-weeks'),
  },
];

// ─── The plan ──────────────────────────────────────────────────────

export type QuestionStatus =
  /** Never asked. The intake's job. */
  | 'unasked'
  /** Asked, answered by the person. */
  | 'answered'
  /** Asked, answered by a document — shown, not re-asked. */
  | 'from-document'
  /** Asked, and the person said they don't know. Deliberate, not missing. */
  | 'skipped'
  /** Two live sources disagree. Readiness blocks on it; the intake shows it. */
  | 'contradicted';

export interface PlannedQuestion {
  factId: FactId;
  section: IntakeSection;
  prompt: string;
  why: string | null;
  input: IntakeInput;
  status: QuestionStatus;
  /** The live value, for showing back what was said. */
  value: { kind: string; value: string | number | boolean } | null;
  /** Where the current answer came from, when there is one. */
  answeredBy: 'person' | 'document' | 'rule' | null;
  /** The assertion a change would supersede. */
  assertionId: string | null;
  /** What A4 says knowing this is worth, in dollars. Null when unpriceable. */
  worth: number | null;
  /** A branch computes something the other cannot — worth more than $0 says. */
  unlocks: boolean;
}

export interface IntakeSectionPlan {
  section: IntakeSection;
  title: string;
  questions: PlannedQuestion[];
  answered: number;
  /** Questions currently applicable — the denominator moves as gates open. */
  applicable: number;
}

export interface IntakePlan {
  taxYear: number;
  sections: IntakeSectionPlan[];
  /** The highest-value unasked questions across every section. */
  nextUp: PlannedQuestion[];
}

const statusOf = (state: FactState, derived: boolean): QuestionStatus => {
  if (state.status === 'unasserted') return 'unasked';
  if (state.status === 'unknown') return 'skipped';
  if (state.status === 'contradicted') return 'contradicted';
  const latest = state.assertions[state.assertions.length - 1];
  if (derived || latest?.source.kind === 'rule') return 'from-document';
  return latest?.source.kind === 'document' ? 'from-document' : 'answered';
};

/**
 * The intake, for one year, ordered by what the answers are worth.
 *
 * Ordering is deliberate and not authored: unanswered questions sort by
 * A4's price descending, so the surface reorders itself as it learns.
 * Answered ones sink below them in registry order, where they read as a
 * record of what was said rather than a queue.
 */
export function intakePlan(assertions: FactAssertion[], taxYear: number, set: FactSet): IntakePlan {
  const applicable = INTAKE_QUESTIONS.filter((q) => q.showWhen === undefined || q.showWhen(set));

  // Priced against A4 directly rather than through `rankUnknowns`, whose
  // candidate set is the facts a determination already reached for plus
  // the ones explicitly answered "don't know". That is the right set for
  // readiness; it is the wrong one here, because the questions this
  // surface is about to ask have not been asserted at all and would come
  // back unpriced. Forking the applicable set instead is both more
  // honest and cheap — the gates have already thrown away everything
  // that cannot matter to this person.
  const priceOf = new Map<FactId, { delta: number; priceable: boolean; blockedDiffers: boolean }>();
  for (const q of applicable) {
    try {
      const result = fork(assertions, taxYear, q.factId);
      priceOf.set(
        q.factId,
        result.ok
          ? {
              delta: result.delta,
              priceable: true,
              blockedDiffers: result.blockedDiffers.length > 0,
            }
          : { delta: 0, priceable: false, blockedDiffers: false },
      );
    } catch {
      // A year the engine cannot evaluate yet still deserves an intake;
      // it just arrives in authored order until there is enough to price.
      priceOf.set(q.factId, { delta: 0, priceable: false, blockedDiffers: false });
    }
  }

  const planned: PlannedQuestion[] = applicable.map((q) => {
    const state = factState(set, q.factId);
    const entry = factEntry(q.factId);
    const price = priceOf.get(q.factId);
    const latest =
      state.status === 'unasserted'
        ? null
        : (state.assertions[state.assertions.length - 1] ?? null);
    return {
      factId: q.factId,
      section: q.section,
      prompt: q.prompt,
      why: q.why ?? null,
      input: q.input,
      status: statusOf(state, entry.derived === true),
      value: state.status === 'known' ? { kind: state.value.kind, value: state.value.value } : null,
      answeredBy: latest === null ? null : latest.source.kind,
      assertionId: latest?.assertionId ?? null,
      worth: price?.priceable === true ? price.delta : null,
      unlocks: price?.blockedDiffers === true,
    };
  });

  const outstanding = (q: PlannedQuestion) => q.status === 'unasked' || q.status === 'contradicted';
  const order = new Map(INTAKE_QUESTIONS.map((q, i) => [q.factId, i]));
  const rank = (a: PlannedQuestion, b: PlannedQuestion): number => {
    const ao = outstanding(a);
    const bo = outstanding(b);
    if (ao !== bo) return ao ? -1 : 1;
    if (!ao) return (order.get(a.factId) ?? 0) - (order.get(b.factId) ?? 0);
    return (
      (b.worth ?? 0) - (a.worth ?? 0) ||
      Number(b.unlocks) - Number(a.unlocks) ||
      (order.get(a.factId) ?? 0) - (order.get(b.factId) ?? 0)
    );
  };

  const sections: IntakeSectionPlan[] = SECTION_ORDER.map((section) => {
    const questions = planned.filter((q) => q.section === section).sort(rank);
    return {
      section,
      title: SECTION_TITLES[section],
      questions,
      answered: questions.filter((q) => q.status !== 'unasked').length,
      applicable: questions.length,
    };
  });

  const nextUp = planned
    .filter((q) => q.status === 'unasked')
    .sort(rank)
    .slice(0, 3);

  return { taxYear, sections, nextUp };
}

// ─── The finding ───────────────────────────────────────────────────

export interface IntakeFinding {
  kind: 'opened' | 'repriced' | 'closed';
  factId: FactId;
  prompt: string;
  worth: number | null;
  /** One line, already in the surface's voice. */
  line: string;
}

const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

/**
 * What just changed, for the surface to say out loud. The intake is the
 * finding-machine, so an answer that opens a question worth $2,500 says
 * so at the moment it happens rather than leaving it in a list.
 *
 * Pure diff of two plans — the caller holds both, one from before the
 * assertion and one from after.
 */
export function intakeFindings(before: IntakePlan, after: IntakePlan): IntakeFinding[] {
  const flatten = (p: IntakePlan) => p.sections.flatMap((s) => s.questions);
  const was = new Map(flatten(before).map((q) => [q.factId, q]));
  const findings: IntakeFinding[] = [];

  for (const q of flatten(after)) {
    const prior = was.get(q.factId);
    if (prior === undefined) {
      if (q.status !== 'unasked') continue;
      findings.push({
        kind: 'opened',
        factId: q.factId,
        prompt: q.prompt,
        worth: q.worth,
        line:
          q.worth !== null && q.worth !== 0
            ? `That answer opened a question worth ${money(q.worth)}: ${q.prompt}`
            : q.unlocks
              ? `That answer opened a question the rest of the return waits on: ${q.prompt}`
              : `That answer opened a new question: ${q.prompt}`,
      });
      continue;
    }
    if (
      prior.status === 'unasked' &&
      q.status === 'unasked' &&
      prior.worth !== null &&
      q.worth !== null &&
      Math.abs(q.worth - prior.worth) >= 1
    ) {
      findings.push({
        kind: 'repriced',
        factId: q.factId,
        prompt: q.prompt,
        worth: q.worth,
        line: `${q.prompt} — now worth ${money(q.worth)}, was ${money(prior.worth)}.`,
      });
    }
  }

  const now = new Set(flatten(after).map((q) => q.factId));
  for (const [factId, q] of was) {
    if (now.has(factId)) continue;
    findings.push({
      kind: 'closed',
      factId,
      prompt: q.prompt,
      worth: null,
      line: `That answer means one question no longer applies to you: ${q.prompt}`,
    });
  }

  return findings.sort(
    (a, b) => (b.worth ?? 0) - (a.worth ?? 0) || a.factId.localeCompare(b.factId),
  );
}
