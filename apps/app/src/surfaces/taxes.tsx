import { useAuthToken } from '@/auth/useAuthToken';
import { useTRPC } from '@/lib/trpc';
import { useSpaceId } from '@/surfaces/layout';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const usdWhole = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const US_STATES: Array<{ code: string; label: string }> = [
  { code: '', label: 'No state / other' },
  { code: 'AL', label: 'Alabama' },
  { code: 'AK', label: 'Alaska' },
  { code: 'AZ', label: 'Arizona' },
  { code: 'AR', label: 'Arkansas' },
  { code: 'CA', label: 'California' },
  { code: 'CO', label: 'Colorado' },
  { code: 'CT', label: 'Connecticut' },
  { code: 'DE', label: 'Delaware' },
  { code: 'DC', label: 'District of Columbia' },
  { code: 'FL', label: 'Florida' },
  { code: 'GA', label: 'Georgia' },
  { code: 'HI', label: 'Hawaii' },
  { code: 'ID', label: 'Idaho' },
  { code: 'IL', label: 'Illinois' },
  { code: 'IN', label: 'Indiana' },
  { code: 'IA', label: 'Iowa' },
  { code: 'KS', label: 'Kansas' },
  { code: 'KY', label: 'Kentucky' },
  { code: 'LA', label: 'Louisiana' },
  { code: 'ME', label: 'Maine' },
  { code: 'MD', label: 'Maryland' },
  { code: 'MA', label: 'Massachusetts' },
  { code: 'MI', label: 'Michigan' },
  { code: 'MN', label: 'Minnesota' },
  { code: 'MS', label: 'Mississippi' },
  { code: 'MO', label: 'Missouri' },
  { code: 'MT', label: 'Montana' },
  { code: 'NE', label: 'Nebraska' },
  { code: 'NV', label: 'Nevada' },
  { code: 'NH', label: 'New Hampshire' },
  { code: 'NJ', label: 'New Jersey' },
  { code: 'NM', label: 'New Mexico' },
  { code: 'NY', label: 'New York' },
  { code: 'NC', label: 'North Carolina' },
  { code: 'ND', label: 'North Dakota' },
  { code: 'OH', label: 'Ohio' },
  { code: 'OK', label: 'Oklahoma' },
  { code: 'OR', label: 'Oregon' },
  { code: 'PA', label: 'Pennsylvania' },
  { code: 'RI', label: 'Rhode Island' },
  { code: 'SC', label: 'South Carolina' },
  { code: 'SD', label: 'South Dakota' },
  { code: 'TN', label: 'Tennessee' },
  { code: 'TX', label: 'Texas' },
  { code: 'UT', label: 'Utah' },
  { code: 'VT', label: 'Vermont' },
  { code: 'VA', label: 'Virginia' },
  { code: 'WA', label: 'Washington' },
  { code: 'WV', label: 'West Virginia' },
  { code: 'WI', label: 'Wisconsin' },
  { code: 'WY', label: 'Wyoming' },
];

const NUMERIC_FIELDS = [
  'w2Wages',
  'selfEmploymentIncome',
  'investmentIncome',
  'capitalGainsShort',
  'capitalGainsLong',
  'otherIncome',
  'retirement401k',
  'traditionalIRA',
  'hsaContribution',
  'studentLoanInterest',
  'saltDeduction',
  'mortgageInterest',
  'charitableGiving',
  'otherItemized',
  'numDependentChildren',
  'otherCredits',
  'federalWithheld',
  'stateWithheld',
  'estimatedPayments',
  'priorYearTax',
  'priorYearAgi',
] as const;
type NumericField = (typeof NUMERIC_FIELDS)[number];

interface FormState {
  taxYear: number;
  filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh';
  stateCode: string;
  deductionType: 'standard' | 'itemized';
  numbers: Record<NumericField, string>;
}

const SAVE_DEBOUNCE_MS = 700;

export function TaxesSurface() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useQuery(
    trpc.tax.getProfile.queryOptions({ workspaceId: spaceId }),
  );
  const { data: picture, isLoading: pictureLoading } = useQuery(
    trpc.tax.picture.queryOptions({ workspaceId: spaceId }),
  );
  const save = useMutation(
    trpc.tax.updateProfile.mutationOptions({
      onSuccess: () =>
        void queryClient.invalidateQueries({ queryKey: trpc.tax.picture.queryKey() }),
    }),
  );

  const [form, setForm] = useState<FormState | null>(null);
  const { data: ledger } = useQuery({
    ...trpc.tax.realizedGains.queryOptions({
      workspaceId: spaceId,
      taxYear: form?.taxYear ?? 2026,
    }),
    enabled: form !== null,
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate the form once from the stored profile (or defaults)
  useEffect(() => {
    if (profileLoading || form !== null) return;
    const numbers = {} as Record<NumericField, string>;
    for (const f of NUMERIC_FIELDS) {
      const v = profile ? (profile as Record<string, unknown>)[f] : null;
      numbers[f] = typeof v === 'number' && v !== 0 ? String(v) : '';
    }
    setForm({
      taxYear: profile?.taxYear ?? 2026,
      filingStatus: (profile?.filingStatus as FormState['filingStatus']) ?? 'single',
      stateCode: profile?.stateCode ?? '',
      deductionType: (profile?.deductionType as FormState['deductionType']) ?? 'standard',
      numbers,
    });
  }, [profileLoading, profile, form]);

  const scheduleSave = (next: FormState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const num = (f: NumericField) => {
        const parsed = Number.parseFloat(next.numbers[f]);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const nullableNum = (f: NumericField) => {
        const parsed = Number.parseFloat(next.numbers[f]);
        return Number.isFinite(parsed) ? parsed : null;
      };
      save.mutate({
        workspaceId: spaceId,
        data: {
          taxYear: next.taxYear,
          filingStatus: next.filingStatus,
          stateCode: next.stateCode,
          deductionType: next.deductionType,
          w2Wages: num('w2Wages'),
          selfEmploymentIncome: num('selfEmploymentIncome'),
          investmentIncome: num('investmentIncome'),
          capitalGainsShort: num('capitalGainsShort'),
          capitalGainsLong: num('capitalGainsLong'),
          otherIncome: num('otherIncome'),
          retirement401k: num('retirement401k'),
          traditionalIRA: num('traditionalIRA'),
          hsaContribution: num('hsaContribution'),
          studentLoanInterest: num('studentLoanInterest'),
          saltDeduction: num('saltDeduction'),
          mortgageInterest: num('mortgageInterest'),
          charitableGiving: num('charitableGiving'),
          otherItemized: num('otherItemized'),
          numDependentChildren: Math.max(0, Math.round(num('numDependentChildren'))),
          otherCredits: num('otherCredits'),
          federalWithheld: num('federalWithheld'),
          stateWithheld: num('stateWithheld'),
          estimatedPayments: num('estimatedPayments'),
          priorYearTax: nullableNum('priorYearTax'),
          priorYearAgi: nullableNum('priorYearAgi'),
        },
      });
    }, SAVE_DEBOUNCE_MS);
  };

  const update = (patch: Partial<Omit<FormState, 'numbers'>>) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, ...patch };
      scheduleSave(next);
      return next;
    });
  };
  const updateNumber = (field: NumericField, value: string) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, numbers: { ...f.numbers, [field]: value } };
      scheduleSave(next);
      return next;
    });
  };

  if (profileLoading || pictureLoading || !form || !picture) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 md:py-12">
        <p className="eyebrow mb-1.5">Taxes</p>
        <div className="animate-pulse">
          <div className="mb-2 h-10 w-56 rounded-card bg-hairline/60" />
          <div className="mb-10 h-4 w-72 rounded-card bg-hairline/40" />
          <div className="h-40 rounded-card bg-surface shadow-card" />
        </div>
      </div>
    );
  }

  const { result, quarterly, unrealized } = picture;
  const owed = result.refundOrOwed < 0;
  const paid = result.totalPayments;
  const paidPct = result.totalTax > 0 ? Math.min(100, (paid / result.totalTax) * 100) : 100;
  const ficaTotal = result.socialSecurityTax + result.medicareTax + result.additionalMedicareTax;
  const hasAnyIncome = result.grossIncome > 0;
  const harvestable =
    unrealized.longTerm !== null
      ? Math.min(result.ltcgZeroBracketRoom, Math.max(0, unrealized.longTerm))
      : null;

  return (
    <div className="rise mx-auto max-w-3xl px-5 py-8 md:py-12">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="eyebrow">Taxes</p>
        <Link to="/chat?panel=taxes" className="text-xs font-medium text-accent hover:underline">
          Open in workspace
        </Link>
      </div>

      {/* ── The meter ── */}
      <h1 className="mb-1 text-lg font-semibold tracking-tight text-muted">
        If {form.taxYear} ended today…
      </h1>
      {hasAnyIncome ? (
        <>
          <p className="tnum mb-1 font-mono text-4xl font-bold tracking-tight">
            {owed ? (
              <span className="text-bad">you'd owe {usdWhole(Math.abs(result.refundOrOwed))}</span>
            ) : (
              <span className="text-good">you'd get {usdWhole(result.refundOrOwed)} back</span>
            )}
          </p>
          <p className="mb-4 text-sm text-muted">
            {usdWhole(result.totalTax)} total tax · {result.effectiveRate.toFixed(1)}% effective ·{' '}
            {result.marginalFederalRate.toFixed(0)}% federal marginal
          </p>
          <div className="mb-2 h-1.5 max-w-md overflow-hidden rounded-full bg-hairline/60">
            <div
              className={`h-full rounded-full ${owed ? 'bg-warn' : 'bg-good'}`}
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <p className="mb-10 text-xs text-muted">
            {usdWhole(paid)} paid in of {usdWhole(result.totalTax)} projected
          </p>
        </>
      ) : (
        <p className="mb-10 max-w-md text-sm text-muted">
          Enter your expected income below and the meter shows where you'd land — federal + state,
          all 50 states, updated as you type.
        </p>
      )}

      {/* ── 0% LTCG room — the headline insight ── */}
      {hasAnyIncome && result.ltcgZeroBracketRoom > 0 && (
        <section className="mb-10">
          <div className="rounded-card border border-accent/30 bg-accent-soft p-5">
            <p className="eyebrow mb-1 text-accent">Tax-free gains window</p>
            <p className="text-sm">
              You can realize up to{' '}
              <span className="tnum font-mono font-bold">
                {usdWhole(result.ltcgZeroBracketRoom)}
              </span>{' '}
              of long-term gains this year at <span className="font-semibold">0% federal tax</span>{' '}
              — your income sits in the 0% long-term capital gains bracket.
              {harvestable !== null && harvestable > 0 && (
                <>
                  {' '}
                  Of your{' '}
                  <span className="tnum font-mono">{usdWhole(unrealized.longTerm ?? 0)}</span>{' '}
                  unrealized long-term gains,{' '}
                  <span className="tnum font-mono font-bold">{usdWhole(harvestable)}</span> could be
                  harvested free.
                </>
              )}
            </p>
          </div>
        </section>
      )}

      {/* ── Breakdown ── */}
      {hasAnyIncome && (
        <section className="mb-10">
          <h2 className="eyebrow mb-3">Where it goes</h2>
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <BreakdownRow label="Federal income tax" value={result.federalTax} first />
            {result.ltcgTax > 0 && (
              <BreakdownRow label="Long-term gains tax (0/15/20%)" value={result.ltcgTax} />
            )}
            {result.niit > 0 && (
              <BreakdownRow label="Net investment income tax" value={result.niit} />
            )}
            {result.stateTax > 0 && (
              <BreakdownRow
                label={`${form.stateCode || 'State'} income tax`}
                value={result.stateTax}
              />
            )}
            {ficaTotal > 0 && <BreakdownRow label="Social Security + Medicare" value={ficaTotal} />}
            {result.selfEmploymentTax > 0 && (
              <BreakdownRow label="Self-employment tax" value={result.selfEmploymentTax} />
            )}
            {result.childTaxCredit + result.otherCredits > 0 && (
              <BreakdownRow
                label="Credits"
                value={-(result.childTaxCredit + result.otherCredits)}
              />
            )}
          </div>
        </section>
      )}

      {/* ── Quarterly estimates ── */}
      {hasAnyIncome && quarterly.estimatesNeeded && (
        <section className="mb-10">
          <h2 className="eyebrow mb-3">Quarterly estimated payments</h2>
          <div className="rounded-card bg-surface shadow-card p-5">
            <p className="mb-4 text-sm text-muted">
              Withholding won't cover the safe harbor
              {quarterly.safeHarborBasis === 'prior-year'
                ? " (based on last year's tax)"
                : ' (90% of this year)'}
              . Paying{' '}
              <span className="tnum font-mono font-semibold text-ink">
                {usdWhole(quarterly.shortfall)}
              </span>{' '}
              across the remaining deadlines avoids underpayment penalties.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {quarterly.deadlines.map((d) => (
                <div
                  key={d.quarter}
                  className={`rounded-card border border-hairline p-3 ${d.passed ? 'opacity-40' : ''}`}
                >
                  <p className="eyebrow mb-0.5">Q{d.quarter}</p>
                  <p className="tnum mb-1 font-mono text-xs text-muted">{d.dueDate}</p>
                  <p className="tnum font-mono text-sm font-semibold">
                    {d.passed ? '—' : usdWhole(d.suggestedPayment)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Realized-gains ledger (only when trade history exists) ── */}
      {ledger && ledger.sales.length > 0 && (
        <section className="mb-10">
          <h2 className="eyebrow mb-3">Realized gains · {form.taxYear}</h2>
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-hairline px-4 py-3">
              <span className="text-sm">
                <span className="text-muted">Short-term </span>
                <span
                  className={`tnum font-mono font-semibold ${ledger.shortTermGain < 0 ? 'text-bad' : ''}`}
                >
                  {usd(ledger.shortTermGain)}
                </span>
              </span>
              <span className="text-sm">
                <span className="text-muted">Long-term </span>
                <span
                  className={`tnum font-mono font-semibold ${ledger.longTermGain < 0 ? 'text-bad' : ''}`}
                >
                  {usd(ledger.longTermGain)}
                </span>
              </span>
              {ledger.washDisallowed > 0 && (
                <span className="text-sm text-warn">
                  {usd(ledger.washDisallowed)} wash-sale losses disallowed
                </span>
              )}
            </div>
            {ledger.sales.map((s) => (
              <div
                key={s.tradeId}
                className="flex items-center justify-between border-b border-hairline px-4 py-2.5 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{s.symbol}</span>
                  <span className="tnum text-xs text-muted">
                    {s.units % 1 === 0 ? s.units : s.units.toFixed(4)} sold {s.saleDate}
                  </span>
                  <span className="eyebrow rounded-full border border-hairline px-1.5 py-0.5">
                    {s.term}
                  </span>
                  {s.washDisallowed > 0 && (
                    <span className="eyebrow rounded-full border border-warn/40 px-1.5 py-0.5 text-warn">
                      wash
                    </span>
                  )}
                  {s.uncoveredUnits > 0 && (
                    <span
                      className="eyebrow rounded-full border border-hairline px-1.5 py-0.5 text-faint"
                      title={`${s.uncoveredUnits} units have no purchase history — excluded from the gain`}
                    >
                      partial
                    </span>
                  )}
                </div>
                <span className={`tnum font-mono text-sm ${s.gain < 0 ? 'text-bad' : 'text-good'}`}>
                  {s.gain >= 0 ? '+' : ''}
                  {usd(s.gain)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted">
              FIFO lots over {ledger.tradeCount} imported trades
              {ledger.uncoveredUnits > 0 &&
                ` · ${ledger.uncoveredUnits} sold units lack purchase history and are excluded`}
            </p>
            <button
              type="button"
              onClick={() => {
                updateNumber('capitalGainsShort', String(Math.round(ledger.shortTermGain)));
                updateNumber('capitalGainsLong', String(Math.round(ledger.longTermGain)));
              }}
              className="text-xs font-medium text-accent"
            >
              Use these in the meter
            </button>
          </div>
        </section>
      )}

      {/* ── 1099 check ── */}
      <Check1099Section />

      {/* ── Inputs ── */}
      <section className="mb-8">
        <h2 className="eyebrow mb-3">Your year</h2>
        <div className="grid gap-3 rounded-card bg-surface shadow-card p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectField
              label="Tax year"
              value={String(form.taxYear)}
              onChange={(v) => update({ taxYear: Number(v) })}
              options={[
                { value: '2025', label: '2025' },
                { value: '2026', label: '2026' },
              ]}
            />
            <SelectField
              label="Filing status"
              value={form.filingStatus}
              onChange={(v) => update({ filingStatus: v as FormState['filingStatus'] })}
              options={[
                { value: 'single', label: 'Single' },
                { value: 'mfj', label: 'Married filing jointly' },
                { value: 'mfs', label: 'Married filing separately' },
                { value: 'hoh', label: 'Head of household' },
              ]}
            />
            <SelectField
              label="State"
              value={form.stateCode}
              onChange={(v) => update({ stateCode: v })}
              options={US_STATES.map((s) => ({ value: s.code, label: s.label }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MoneyField
              label="W-2 wages (expected for the year)"
              value={form.numbers.w2Wages}
              onChange={(v) => updateNumber('w2Wages', v)}
            />
            <MoneyField
              label="Federal tax withheld (expected)"
              value={form.numbers.federalWithheld}
              onChange={(v) => updateNumber('federalWithheld', v)}
            />
          </div>

          <Disclosure title="Freelance & other income">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MoneyField
                label="Self-employment income"
                value={form.numbers.selfEmploymentIncome}
                onChange={(v) => updateNumber('selfEmploymentIncome', v)}
              />
              <MoneyField
                label="Other income"
                value={form.numbers.otherIncome}
                onChange={(v) => updateNumber('otherIncome', v)}
              />
              <MoneyField
                label="Interest + dividends"
                value={form.numbers.investmentIncome}
                onChange={(v) => updateNumber('investmentIncome', v)}
              />
            </div>
          </Disclosure>

          <Disclosure title="Realized capital gains">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MoneyField
                label="Short-term gains (held ≤ 1 year)"
                value={form.numbers.capitalGainsShort}
                onChange={(v) => updateNumber('capitalGainsShort', v)}
              />
              <MoneyField
                label="Long-term gains (held > 1 year)"
                value={form.numbers.capitalGainsLong}
                onChange={(v) => updateNumber('capitalGainsLong', v)}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              Sales you've already made this year. Losses count too — enter them as negative.
            </p>
          </Disclosure>

          <Disclosure title="Payments & safe harbor">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MoneyField
                label="State tax withheld"
                value={form.numbers.stateWithheld}
                onChange={(v) => updateNumber('stateWithheld', v)}
              />
              <MoneyField
                label="Estimated payments made"
                value={form.numbers.estimatedPayments}
                onChange={(v) => updateNumber('estimatedPayments', v)}
              />
              <MoneyField
                label="Last year's total tax"
                value={form.numbers.priorYearTax}
                onChange={(v) => updateNumber('priorYearTax', v)}
              />
              <MoneyField
                label="Last year's AGI"
                value={form.numbers.priorYearAgi}
                onChange={(v) => updateNumber('priorYearAgi', v)}
              />
            </div>
          </Disclosure>

          <Disclosure title="Adjustments, deductions & credits">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MoneyField
                label="401(k) contributions"
                value={form.numbers.retirement401k}
                onChange={(v) => updateNumber('retirement401k', v)}
              />
              <MoneyField
                label="Traditional IRA"
                value={form.numbers.traditionalIRA}
                onChange={(v) => updateNumber('traditionalIRA', v)}
              />
              <MoneyField
                label="HSA contributions"
                value={form.numbers.hsaContribution}
                onChange={(v) => updateNumber('hsaContribution', v)}
              />
              <MoneyField
                label="Student loan interest"
                value={form.numbers.studentLoanInterest}
                onChange={(v) => updateNumber('studentLoanInterest', v)}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                label="Deduction"
                value={form.deductionType}
                onChange={(v) => update({ deductionType: v as FormState['deductionType'] })}
                options={[
                  { value: 'standard', label: 'Standard deduction' },
                  { value: 'itemized', label: 'Itemized' },
                ]}
              />
              <MoneyField
                label="Dependent children"
                value={form.numbers.numDependentChildren}
                onChange={(v) => updateNumber('numDependentChildren', v)}
              />
            </div>
            {form.deductionType === 'itemized' && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MoneyField
                  label="State & local taxes (SALT)"
                  value={form.numbers.saltDeduction}
                  onChange={(v) => updateNumber('saltDeduction', v)}
                />
                <MoneyField
                  label="Mortgage interest"
                  value={form.numbers.mortgageInterest}
                  onChange={(v) => updateNumber('mortgageInterest', v)}
                />
                <MoneyField
                  label="Charitable giving"
                  value={form.numbers.charitableGiving}
                  onChange={(v) => updateNumber('charitableGiving', v)}
                />
                <MoneyField
                  label="Other itemized"
                  value={form.numbers.otherItemized}
                  onChange={(v) => updateNumber('otherItemized', v)}
                />
              </div>
            )}
          </Disclosure>

          <p className="text-xs text-muted">
            {save.isPending ? 'Saving…' : 'Saved automatically as you type.'}
          </p>
        </div>
      </section>

      <p className="max-w-lg text-xs text-faint">
        Educational estimates from {form.taxYear} federal and state brackets — not tax advice, not a
        filing. Numbers assume full-year amounts and the common cases; edge cases (AMT, credits
        phase-outs, multi-state) aren't modeled.
      </p>
    </div>
  );
}

/**
 * Upload a 1099-B and compare what the broker reported against the computed
 * ledger. Rendered as its own component so its polling doesn't re-render the
 * whole form.
 */
function Check1099Section() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const getToken = useAuthToken();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [pendingFileId, setPendingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: forms = [] } = useQuery({
    ...trpc.tax.list1099s.queryOptions({ workspaceId: spaceId }),
    // Poll while an uploaded form is still being extracted
    refetchInterval: (query) =>
      pendingFileId && !query.state.data?.some((f) => f.fileId === pendingFileId) ? 4000 : false,
  });
  const extracted = forms.some((f) => f.fileId === pendingFileId);
  const extracting = pendingFileId !== null && !extracted;

  const upload = async (file: File) => {
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', spaceId);
      form.append('reconcile1099', '1');
      const token = await getToken();
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Upload failed');
      }
      const data = (await res.json()) as { fileId: string };
      setPendingFileId(data.fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <section className="mb-10">
      <h2 className="eyebrow mb-3">1099 check</h2>
      <div className="rounded-card bg-surface shadow-card p-5">
        <p className="mb-3 text-sm text-muted">
          At filing time, upload your broker's 1099-B and Basis cross-checks it against your
          computed gains — mismatched cost basis is the most common filing mistake.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={extracting}
          className="flex items-center gap-2 rounded-card border border-hairline bg-paper px-4 py-2 text-sm font-medium transition-colors hover:border-accent disabled:opacity-60"
        >
          {extracting ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Reading the form…
            </>
          ) : (
            <>
              <Upload size={15} strokeWidth={1.75} /> Upload a 1099-B
            </>
          )}
        </button>
        {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      </div>

      {forms.map((f) => (
        <Reconciliation1099 key={f.id} fileId={f.fileId} broker={f.broker} taxYear={f.taxYear} />
      ))}
    </section>
  );
}

function Reconciliation1099({
  fileId,
  broker,
  taxYear,
}: {
  fileId: string;
  broker: string | null;
  taxYear: number;
}) {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const { data: recon } = useQuery(
    trpc.tax.reconciliation.queryOptions({ workspaceId: spaceId, fileId }),
  );
  if (!recon) return null;

  const allGood = recon.mismatches === 0 && recon.missingHistory === 0 && recon.notOn1099 === 0;
  return (
    <div className="mt-3 overflow-hidden rounded-card bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
        <span className="text-sm font-semibold">
          {broker ?? 'Broker'} · {taxYear}
        </span>
        <span className={`text-sm ${allGood ? 'text-good' : 'text-muted'}`}>
          {recon.matches} of {recon.reportedRowCount} reported rows match
          {recon.mismatches > 0 && (
            <span className="text-bad"> · {recon.mismatches} mismatched</span>
          )}
          {recon.missingHistory > 0 && (
            <span className="text-warn"> · {recon.missingHistory} without trade history</span>
          )}
          {recon.notOn1099 > 0 && (
            <span className="text-warn"> · {recon.notOn1099} missing from the form</span>
          )}
        </span>
      </div>
      {recon.rows.map((r) => (
        <div
          key={`${r.symbol}|${r.term}`}
          className="flex items-center justify-between border-b border-hairline px-4 py-2.5 last:border-b-0"
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                r.status === 'match' ? 'bg-good' : r.status === 'mismatch' ? 'bg-bad' : 'bg-warn'
              }`}
            />
            <span className="font-mono text-sm font-semibold">{r.symbol}</span>
            <span className="eyebrow rounded-full border border-hairline px-1.5 py-0.5">
              {r.term}
            </span>
          </div>
          <span className="tnum text-right font-mono text-xs">
            {r.status === 'match' && <span className="text-good">matches</span>}
            {r.status === 'mismatch' && (
              <span className="text-bad">
                {r.deltas.basis !== null && Math.abs(r.deltas.basis) > 1
                  ? `basis off by ${usd(r.deltas.basis)}`
                  : `proceeds off by ${usd(r.deltas.proceeds ?? 0)}`}
              </span>
            )}
            {r.status === 'missing-history' && (
              <span className="text-warn">no trade history to compare</span>
            )}
            {r.status === 'not-on-1099' && <span className="text-warn">not on the form</span>}
          </span>
        </div>
      ))}
      <p className="px-4 py-2 text-xs text-faint">
        Reported = your broker's form · computed = FIFO lots from your trade history. Differences
        can be legitimate (specific-lot elections, transfers) — check before assuming either side is
        wrong.
      </p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  first = false,
}: {
  label: string;
  value: number;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 ${first ? '' : 'border-t border-hairline'}`}
    >
      <span className="text-sm">{label}</span>
      <span className={`tnum font-mono text-sm ${value < 0 ? 'text-good' : ''}`}>
        {value < 0 ? `−${usd(Math.abs(value))}` : usd(value)}
      </span>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tnum w-full rounded-card border border-hairline bg-paper px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-accent"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-card border border-hairline bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-card border border-hairline">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-ink group-open:border-b group-open:border-hairline">
        {title}
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}
