import { describe, expect, it } from 'vitest';
import { SYSTEM_PREAMBLE } from '../services/ai-context';

// ─── G3 acceptance, the mechanical half ────────────────────────────
// The behaviour these rules produce is checked by running probes at the
// live model — that is in the commit, not in here, because a unit suite
// that calls an API is a unit suite that fails on a Tuesday.
//
// What IS mechanical is the fence: the preamble contains conduct and
// never a tax rule. That one matters more than it sounds. A figure
// written into the prompt is a figure with no citation, no year and no
// way to be corrected when the law moves — precisely the thing the
// engine exists so the model never has to hold.

// The preamble is hard-wrapped, so a phrase can be split across a
// newline. Every match here runs against a whitespace-flattened copy —
// otherwise the fence passes or fails on where the line breaks fell,
// which is not a property anyone means to test.
const preamble = SYSTEM_PREAMBLE.toLowerCase().replace(/\s+/g, ' ');

describe('the fence: conduct, never a rule', () => {
  // Shapes a stated tax rule takes. Deliberately narrow — an
  // illustrative "$52 tax / $0 in 96 days" is conduct being
  // demonstrated, and a fence that flagged it would be deleted by the
  // next person in a hurry (the G1 lesson, applied to a second fence).
  const RULE_SHAPES: Array<{ pattern: RegExp; why: string }> = [
    { pattern: /standard deduction is/, why: 'a stated deduction amount' },
    { pattern: /capped at \$/, why: 'a stated cap' },
    { pattern: /(the )?limit is \$/, why: 'a stated limit' },
    { pattern: /threshold of \$/, why: 'a stated threshold' },
    { pattern: /phases? out (at|above) /, why: 'a stated phase-out' },
    { pattern: /\$[\d,]+ (cap|limit|threshold|exclusion|exemption)/, why: 'a stated boundary' },
    { pattern: /up to \$[\d,]{4,}/, why: 'a stated maximum' },
    { pattern: /\b(tax )?bracket is\b/, why: 'a stated bracket' },
    { pattern: /you (can|may) deduct \$/, why: 'a stated deduction' },
    { pattern: /\bpub(lication)? \d{3}/, why: 'a citation — citations come from the engine' },
    { pattern: /\bform \d{4}\b/, why: 'a form number stated as authority' },
    { pattern: /§\s?\d/, why: 'a statute section' },
  ];

  for (const { pattern, why } of RULE_SHAPES) {
    it(`contains no ${why}`, () => {
      const found = preamble.match(pattern);
      expect(found?.[0] ?? null, `preamble states a rule: "${found?.[0]}"`).toBeNull();
    });
  }
});

describe('the rules G3 adds are actually present', () => {
  const has = (needle: string) => preamble.includes(needle.toLowerCase());

  it('determinations come from tools even when the model is certain', () => {
    expect(has('Determinations are the engine')).toBe(true);
    // The "even when sure" clause is the load-bearing half: a model that
    // defers only when unsure defers exactly when it does not matter.
    expect(has('holds when you are certain')).toBe(true);
  });

  it('traces are narrated with their citation, not paraphrased', () => {
    expect(has('Narrate the trace')).toBe(true);
    expect(has('quote the citation as given')).toBe(true);
  });

  it('undetermined stays undetermined in the prose', () => {
    expect(has('undetermined in your answer too')).toBe(true);
  });

  it('questions are asked in life vocabulary, with the swaps enumerated', () => {
    expect(has('Ask about a life, not about a return')).toBe(true);
    for (const term of [
      'are you a dependent?',
      "what's your filing status?",
      'are you a resident alien?',
      'do you itemize?',
      'any capital gains?',
    ]) {
      expect(has(term), `${term} is not in the bad→good table`).toBe(true);
    }
    // And each bad question is paired with a real replacement.
    expect(has('who paid most of what it cost you to live last year?')).toBe(true);
    expect(has('were you married on december 31?')).toBe(true);
  });

  it('the unknown protocol prices instead of guessing', () => {
    expect(has('price_unknown')).toBe(true);
    expect(has('never "probably"')).toBe(true);
    expect(has('most people in your situation')).toBe(true);
  });

  it('branches are never summed or averaged', () => {
    expect(has('Never add them, average them')).toBe(true);
    expect(has('a year nobody lives in')).toBe(true);
  });

  it('no rule figure is stated unless a tool returned it', () => {
    expect(has('unless a tool in this session returned it')).toBe(true);
  });
});

describe('one strike-list, not two', () => {
  it('the filing phrases live inside the existing superlative rule', () => {
    // Two rival lists of banned phrases in one prompt is weaker than one.
    // These were added to the P9 sweep rather than beside it.
    const flat = SYSTEM_PREAMBLE.replace(/\s+/g, ' ');
    const sweep = flat.slice(
      flat.indexOf('broken by adjectives'),
      flat.indexOf('Order what you say'),
    );
    expect(sweep.length).toBeGreaterThan(0);
    for (const phrase of ['you should', 'the smart move', 'definitely claim', 'no-brainer']) {
      expect(sweep.toLowerCase(), `${phrase} is outside the sweep`).toContain(phrase);
    }
  });

  it('the superlative strike-list survived G3 intact', () => {
    for (const phrase of ['the cleanest move', 'particularly attractive', 'worth doing']) {
      expect(preamble).toContain(phrase);
    }
  });
});

describe('what the prompt costs', () => {
  it('the fact vocabulary the preamble embeds stays affordable', async () => {
    // buildFilingSection lists every recordable fact id so the model
    // writes them correctly the first time instead of learning through
    // rejections. That list grows with the registry and nothing else
    // watches it — the H-phase adds facts, and this is where the cost
    // would show up silently.
    const { registrySnapshot } = await import('../services/filing-tools');
    const vocabulary = registrySnapshot()
      .map((f) => f.id)
      .join(', ');

    expect(registrySnapshot().length).toBeGreaterThan(0);
    expect(
      vocabulary.length,
      'the fact vocabulary has outgrown its share of the prompt — drop the labels, group it, or send only the ids the year can still use',
    ).toBeLessThan(2600);

    // The whole standing cost: conduct plus vocabulary, before a single
    // figure of the user's own year is added.
    expect(SYSTEM_PREAMBLE.length + vocabulary.length).toBeLessThan(18_000);
  });
});
