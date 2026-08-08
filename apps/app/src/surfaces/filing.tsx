import { useTRPC } from '@/lib/trpc';
import { US_STATES } from '@/lib/us-states';
import { useSpaceId } from '@/surfaces/layout';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, HelpCircle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// ─── G1 · The intake surface ───────────────────────────────────────
// Zero-to-ready, as questions about a life. Everything that decides
// WHAT to ask and IN WHAT ORDER lives on the server in
// lib/calc/filing/intake.ts — this file renders a plan it is handed and
// writes answers back. That split is the point: the ordering rule
// ("reorder around what the answer is worth") is testable without a
// browser, and the surface cannot quietly develop opinions of its own.
//
// Three things here are deliberate and easy to get wrong:
//   · Skip is a first-class answer with its own button, not an empty
//     field. "I don't know" is an assertion the engine can use; leaving
//     a box blank tells it nothing.
//   · Progress is a readiness verdict, never a percentage. Half these
//     questions do not apply to any one person, so a percentage would
//     be a number that measures nothing.
//   · Answers save one at a time as they are given, so closing the tab
//     mid-section loses nothing.

const TAX_YEAR = 2025;
const SAVE_DEBOUNCE_MS = 700;

type Plan = {
  taxYear: number;
  sections: Array<{
    section: string;
    title: string;
    answered: number;
    applicable: number;
    questions: PlannedQuestion[];
  }>;
  nextUp: PlannedQuestion[];
};

type PlannedQuestion = {
  factId: string;
  section: string;
  prompt: string;
  why: string | null;
  input:
    | { kind: 'yes-no' }
    | { kind: 'date' }
    | { kind: 'text' }
    | { kind: 'us-state' }
    | { kind: 'choice'; options: Array<{ value: string; label: string }> }
    | { kind: 'number'; unit: string };
  status: 'unasked' | 'answered' | 'from-document' | 'skipped' | 'contradicted';
  value: { kind: string; value: string | number | boolean } | null;
  answeredBy: 'person' | 'document' | 'rule' | null;
  assertionId: string | null;
  worth: number | null;
  unlocks: boolean;
};

type AnswerValue =
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'date'; value: string }
  | { kind: 'unknown' };

const usdWhole = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const money = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.abs(n));

const UNIT_SUFFIX: Record<string, string> = {
  months: 'months',
  days: 'days',
  miles: 'miles',
  percent: '%',
  count: '',
  year: '',
  dollars: '',
};

const VERDICT_LINE: Record<string, string> = {
  'not-started': 'Nothing recorded for this year yet.',
  blocked: 'Something has to be resolved before this year can be finished.',
  'ready-with-cautions': 'Everything computes — with a few things worth a second look.',
  ready: 'Everything this year needs is on file.',
};

const VERDICT_LABEL: Record<string, string> = {
  'not-started': 'Not started',
  blocked: 'Blocked',
  'ready-with-cautions': 'Ready, with cautions',
  ready: 'Ready',
};

export function FilingSurface() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const queryClient = useQueryClient();
  const [findings, setFindings] = useState<Array<{ factId: string; line: string }>>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const planQuery = useQuery(
    trpc.filing.intake.queryOptions({ workspaceId: spaceId, taxYear: TAX_YEAR }),
  );
  const readinessQuery = useQuery(
    trpc.filing.readiness.queryOptions({ workspaceId: spaceId, taxYear: TAX_YEAR }),
  );
  const boardQuery = useQuery(
    trpc.filing.board.queryOptions({ workspaceId: spaceId, taxYear: TAX_YEAR }),
  );
  const manifestQuery = useQuery(
    trpc.filing.manifest.queryOptions({ workspaceId: spaceId, taxYear: TAX_YEAR }),
  );
  const amendmentQuery = useQuery(
    trpc.filing.amendment.queryOptions({ workspaceId: spaceId, taxYear: TAX_YEAR }),
  );
  const extensionQuery = useQuery(
    trpc.filing.extension.queryOptions({ workspaceId: spaceId, taxYear: TAX_YEAR }),
  );
  const priorQuery = useQuery(
    trpc.filing.priorYears.queryOptions({ workspaceId: spaceId, taxYear: TAX_YEAR }),
  );
  const snapshot = useMutation(
    trpc.filing.snapshot.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.filing.pathKey() }),
    }),
  );

  const answer = useMutation(
    trpc.filing.answer.mutationOptions({
      onSuccess: (result) => {
        setSaving(null);
        if (!result.ok) return;
        setFindings(result.findings.map((f) => ({ factId: f.factId, line: f.line })));
        queryClient.invalidateQueries({ queryKey: trpc.filing.pathKey() });
      },
      onError: () => setSaving(null),
    }),
  );

  const submit = (factId: string, value: AnswerValue) => {
    setSaving(factId);
    answer.mutate({ workspaceId: spaceId, taxYear: TAX_YEAR, factId, value });
  };

  const plan = planQuery.data as Plan | undefined;
  const readiness = readinessQuery.data;
  const board = boardQuery.data;
  const manifest = manifestQuery.data;
  const amendment = amendmentQuery.data;
  const extension = extensionQuery.data;
  const prior = priorQuery.data;
  const exportUrl = (format: 'html' | 'json') =>
    `/api/exports/manifest?workspaceId=${spaceId}&taxYear=${TAX_YEAR}&format=${format}`;

  if (planQuery.isLoading || !plan) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 md:py-12">
        <p className="eyebrow mb-1.5">Filing</p>
        <div className="animate-pulse">
          <div className="mb-2 h-10 w-64 rounded-card bg-hairline/60" />
          <div className="mb-10 h-4 w-80 rounded-card bg-hairline/40" />
          <div className="h-40 rounded-card bg-surface shadow-card" />
        </div>
      </div>
    );
  }

  const verdict = readiness?.verdict ?? 'not-started';

  return (
    <div className="rise mx-auto max-w-3xl px-5 py-8 md:py-12">
      <p className="eyebrow mb-1.5">Filing · {TAX_YEAR}</p>
      <h1 className="mb-1 text-[26px] font-semibold leading-tight tracking-tight">
        {VERDICT_LABEL[verdict] ?? 'In progress'}
      </h1>
      <p className="mb-8 text-sm text-muted">{VERDICT_LINE[verdict] ?? ''}</p>

      {/* ── What just changed ── */}
      {findings.length > 0 && (
        <div className="mb-8 rounded-card border border-accent/30 bg-accent/5 p-4">
          <p className="eyebrow mb-2 text-accent">What that answer changed</p>
          <ul className="space-y-1.5">
            {findings.slice(0, 4).map((f) => (
              <li key={f.factId} className="text-sm leading-snug">
                {f.line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Next up: the highest-value questions in the whole year ── */}
      {plan.nextUp.length > 0 && (
        <section className="mb-10">
          <p className="eyebrow mb-3">Worth answering first</p>
          <div className="space-y-3">
            {plan.nextUp.map((q) => (
              <QuestionCard
                key={q.factId}
                question={q}
                saving={saving === q.factId}
                onAnswer={submit}
                highlight
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Blockers, when the engine has named one ── */}
      {readiness && readiness.blockers.length > 0 && (
        <section className="mb-10 rounded-card border border-hairline bg-surface p-4 shadow-card">
          <p className="eyebrow mb-2">In the way</p>
          <ul className="space-y-2">
            {readiness.blockers.map((b) => (
              <li key={b.id} className="text-sm leading-snug text-muted">
                {b.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── H4: the years before this one that were never finished ── */}
      {prior && prior.years.length > 0 && (
        <section className="mb-10 rounded-card border border-hairline bg-surface p-5 shadow-card">
          <p className="eyebrow mb-1.5">Years you didn’t finish</p>
          <p className="mb-4 text-sm leading-snug">{prior.headline}</p>

          <div className="space-y-3">
            {prior.years.map((year) => (
              <div
                key={year.taxYear}
                className={`rounded-card border p-3.5 ${
                  year.status === 'forfeited'
                    ? 'border-hairline/60 bg-paper opacity-70'
                    : year.status === 'closing-soon'
                      ? 'border-hold/40 bg-hold/5'
                      : 'border-hairline/70 bg-paper'
                }`}
              >
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold tabular-nums">{year.taxYear}</span>
                  <span className="text-xs text-muted">
                    {year.status === 'forfeited'
                      ? `expired ${year.forfeitDate}`
                      : `${year.daysRemaining} days left · ${year.forfeitDate}`}
                  </span>
                </div>

                {year.estimate && (
                  <p className="mb-1 text-sm">
                    {year.estimate.direction === 'refund'
                      ? `Looks like about ${usdWhole(year.estimate.amount)} back.`
                      : year.estimate.direction === 'owed'
                        ? `Looks like about ${usdWhole(year.estimate.amount)} owed.`
                        : 'Looks like it comes out even.'}
                  </p>
                )}
                {year.estimate?.noPenaltyNote && (
                  <p className="text-xs leading-relaxed text-muted">
                    {year.estimate.noPenaltyNote}
                  </p>
                )}
                {year.estimate?.owedNote && (
                  <p className="text-xs leading-relaxed text-muted">{year.estimate.owedNote}</p>
                )}
                {year.refusal !== null && (
                  <p className="text-xs leading-relaxed text-muted">{year.refusal}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 border-hairline border-t pt-3">
            <p className="eyebrow mb-1.5">You don’t need your old paperwork</p>
            <p className="text-xs leading-relaxed text-muted">
              {prior.transcript.why} {prior.transcript.how}
            </p>
          </div>

          {prior.notes.map((note) => (
            <p key={note.slice(0, 32)} className="mt-2 text-xs leading-relaxed text-muted">
              {note}
            </p>
          ))}
        </section>
      )}

      {/* ── H3: the deadline is close and the year isn't ready ── */}
      {extension && extension.status === 'recommended' && (
        <section className="mb-10 rounded-card border border-hold/40 bg-hold/5 p-5">
          <p className="eyebrow mb-1.5">
            {extension.daysUntilDeadline} days to {extension.deadline}
          </p>
          <h2 className="mb-2 text-base font-semibold">
            An extension buys six months to file and no time at all to pay
          </h2>

          {extension.payment ? (
            <>
              <p className="mb-1 text-sm leading-snug">
                Send{' '}
                <span className="font-semibold tabular-nums">
                  {usdWhole(extension.payment.amount)}
                </span>{' '}
                with Form 4868 and nothing accrues in either direction.
              </p>
              <p className="mb-3 text-xs leading-relaxed text-muted">{extension.payment.note}</p>

              {extension.payment.assumedWorst.length > 0 && (
                <details className="mb-3">
                  <summary className="cursor-pointer list-none text-xs text-muted hover:text-ink">
                    What it assumes ({extension.payment.assumedWorst.length} open questions)
                  </summary>
                  <ul className="mt-2 space-y-1 border-hairline border-l pl-3">
                    {extension.payment.assumedWorst.slice(0, 6).map((a) => (
                      <li key={a.factId} className="text-xs leading-relaxed text-muted">
                        {a.question}
                        {a.costsIfTrue > 0 && (
                          <span className="ml-1 font-medium text-ink">
                            +{usdWhole(a.costsIfTrue)} if the answer goes the expensive way
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : null}

          {extension.exposure && extension.exposure.unpaid > 0 && (
            <p className="mb-3 text-xs leading-relaxed text-muted">{extension.exposure.note}</p>
          )}

          {extension.states.map((st) => (
            <div key={st.stateCode} className="mt-2 border-hairline border-t pt-2">
              <p className="text-xs leading-relaxed text-muted">
                <span className="font-medium text-ink">
                  {st.stateCode}
                  {st.form !== null ? ` · Form ${st.form}` : ' · no form needed'}
                </span>{' '}
                {st.detail}
              </p>
              {st.condition !== null && (
                <p className="mt-1 text-xs font-medium leading-relaxed text-ink">{st.condition}</p>
              )}
            </div>
          ))}

          {extension.notes.map((note) => (
            <p key={note.slice(0, 32)} className="mt-2 text-xs leading-relaxed text-muted">
              {note}
            </p>
          ))}
        </section>
      )}

      {/* ── H2: the year moved after it was filed ── */}
      {amendment && amendment.status !== 'no-change' && (
        <section className="mb-10 rounded-card border border-accent/40 bg-accent/5 p-5">
          <p className="eyebrow mb-1.5 text-accent">Since you filed</p>
          <p className="mb-3 text-sm leading-snug">{amendment.explanation}</p>

          {amendment.lines.length > 0 && (
            <table className="mb-3 w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1 text-left font-medium">Line</th>
                  <th className="py-1 text-right font-medium">A · as filed</th>
                  <th className="py-1 text-right font-medium">B · change</th>
                  <th className="py-1 text-right font-medium">C · corrected</th>
                </tr>
              </thead>
              <tbody>
                {amendment.lines.map((line) => (
                  <tr key={line.id} className="border-hairline border-t">
                    <td className="py-1.5 pr-2">{line.label}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">
                      {usdWhole(line.asFiled ?? 0)}
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {line.change > 0 ? '+' : ''}
                      {usdWhole(line.change)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {usdWhole(line.asCorrected ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {amendment.claimClock && (
            <p className="mb-2 text-xs leading-relaxed text-muted">
              <span className="font-medium text-ink">
                {amendment.claimClock.status === 'closed'
                  ? `The window closed ${amendment.claimClock.deadline}.`
                  : `You have until ${amendment.claimClock.deadline}.`}
              </span>{' '}
              {amendment.claimClock.note}
            </p>
          )}

          {amendment.notes.map((note) => (
            <p key={note.slice(0, 32)} className="mt-2 text-xs leading-relaxed text-muted">
              {note}
            </p>
          ))}
        </section>
      )}

      {/* ── The deliverable: the year, worked out ── */}
      {manifest && manifest.forms.length > 0 && (
        <section className="mb-10 rounded-card border border-hairline bg-surface p-5 shadow-card">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="eyebrow">Your return, worked out</p>
            <div className="flex gap-3 text-xs font-medium">
              <a
                href={exportUrl('html')}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                Open to print
              </a>
              <a href={exportUrl('json')} className="text-muted hover:text-ink">
                Download JSON
              </a>
              <button
                type="button"
                disabled={snapshot.isPending}
                onClick={() =>
                  snapshot.mutate({ workspaceId: spaceId, taxYear: TAX_YEAR, label: null })
                }
                className="text-muted hover:text-ink disabled:opacity-50"
              >
                {snapshot.isPending ? 'Freezing…' : 'Freeze this version'}
              </button>
            </div>
          </div>
          <p className="mb-4 text-sm leading-snug">{manifest.headline}</p>

          {manifest.forms.map((form) => (
            <div key={form.form} className="mb-4 last:mb-0">
              <p className="mb-1.5 text-xs font-medium text-muted">{form.label}</p>
              <table className="w-full text-sm">
                <tbody>
                  {form.lines.map((line) => (
                    <tr key={line.id} className="border-hairline border-b last:border-0">
                      <td className="w-10 py-1.5 pr-2 align-top text-xs tabular-nums text-muted">
                        {line.line}
                      </td>
                      <td className="py-1.5 pr-2 align-top">{line.label}</td>
                      <td className="w-24 py-1.5 text-right align-top font-medium tabular-nums">
                        {usdWhole(line.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {manifest.outsideTheReturn.length > 0 && (
            <div className="mt-4 border-hairline border-t pt-3">
              <p className="eyebrow mb-2">Money the return will never show</p>
              <ul className="space-y-1.5">
                {manifest.outsideTheReturn.map((o) => (
                  <li key={o.id} className="text-xs leading-relaxed text-muted">
                    <span className="font-medium text-ink">
                      {o.label}
                      {o.amount !== null ? ` — ${usdWhole(o.amount)}` : ''}
                    </span>{' '}
                    {o.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── The absence board: what should exist, and what hasn't ── */}
      {board && (board.items.length > 0 || board.noPaperTrail.length > 0) && (
        <section className="mb-10">
          <p className="eyebrow mb-1.5">What your year should produce</p>
          <p className="mb-4 text-sm text-muted">{board.headline}</p>

          <div className="space-y-2">
            {board.items.map((item) => (
              <BoardRow key={item.document} item={item} />
            ))}
          </div>

          {board.noPaperTrail.length > 0 && (
            <div className="mt-4 rounded-card border border-dashed border-hairline p-4">
              <p className="eyebrow mb-2">No form will confirm this</p>
              <ul className="space-y-2">
                {board.noPaperTrail.map((row) => (
                  <li key={row.factId} className="text-sm leading-snug">
                    <span className="font-medium">{row.label}</span>
                    <span className="text-muted"> — {row.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {board.unmatched.map((row) => (
            <div
              key={row.fileId}
              className="mt-3 rounded-card border border-accent/30 bg-accent/5 p-4 text-sm leading-snug"
            >
              {row.prompt}
            </div>
          ))}
        </section>
      )}

      {/* ── The sections ── */}
      <div className="space-y-3">
        {plan.sections.map((section) => (
          <details
            key={section.section}
            className="group rounded-card border border-hairline bg-surface shadow-card"
            open={section.answered < section.applicable}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
              <span className="text-sm font-medium">{section.title}</span>
              <span className="tabular-nums text-xs text-muted">
                {section.answered === section.applicable ? (
                  <Check className="h-4 w-4 text-accent" />
                ) : (
                  `${section.answered} of ${section.applicable}`
                )}
              </span>
            </summary>
            <div className="space-y-3 border-t border-hairline px-4 py-4">
              {section.questions.map((q) => (
                <QuestionCard
                  key={q.factId}
                  question={q}
                  saving={saving === q.factId}
                  onAnswer={submit}
                />
              ))}
            </div>
          </details>
        ))}
      </div>

      <p className="mt-10 text-xs leading-relaxed text-muted">
        Answers save the moment you give them, so you can stop anywhere and pick it up later.
        Anything you skip is recorded as skipped rather than forgotten — the difference matters to
        what gets computed.
      </p>
    </div>
  );
}

// ─── One expected document ─────────────────────────────────────────
// Five states, and the colour carries meaning only alongside the word —
// a dot alone would make "arrived" and "matched" indistinguishable to
// anyone who reads the board without seeing it.

const STATE_LABEL: Record<string, string> = {
  waiting: 'Waiting',
  due: 'Due soon',
  late: 'Late',
  arrived: 'On file, not read',
  matched: 'Done',
};

const STATE_STYLE: Record<string, string> = {
  waiting: 'bg-hairline text-muted',
  due: 'bg-hold/15 text-hold',
  late: 'bg-neg/10 text-neg',
  arrived: 'bg-hold/15 text-hold',
  matched: 'bg-pos/10 text-pos',
};

type BoardItem = {
  document: string;
  from: string;
  because: Array<{ factId: string; label: string }>;
  arrivesBy: string | null;
  mandatory: boolean;
  state: string;
  days: number | null;
  detail: string;
  action: string | null;
};

function BoardRow({ item }: { item: BoardItem }) {
  return (
    <div className="rounded-card border border-hairline/70 bg-paper p-3.5">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{item.document}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            STATE_STYLE[item.state] ?? 'bg-hairline text-muted'
          }`}
        >
          {STATE_LABEL[item.state] ?? item.state}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted">{item.detail}</p>
      {item.action !== null && (
        <p className="mt-1.5 text-xs leading-relaxed text-ink">{item.action}</p>
      )}
      {item.because.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer list-none text-xs text-muted hover:text-ink">
            Why this is expected
          </summary>
          <ul className="mt-1.5 space-y-1 border-l border-hairline pl-3">
            {item.because.map((b) => (
              <li key={b.factId} className="text-xs leading-relaxed text-muted">
                {b.label}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── One question ──────────────────────────────────────────────────

function QuestionCard({
  question,
  saving,
  onAnswer,
  highlight = false,
}: {
  question: PlannedQuestion;
  saving: boolean;
  onAnswer: (factId: string, value: AnswerValue) => void;
  highlight?: boolean;
}) {
  const q = question;
  const settled = q.status === 'answered' || q.status === 'from-document';

  return (
    <div
      className={`rounded-card p-3.5 ${
        highlight
          ? 'border border-accent/30 bg-surface shadow-card'
          : 'border border-hairline/70 bg-paper'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug">{q.prompt}</p>
        {q.status === 'unasked' && q.worth !== null && q.worth !== 0 && (
          <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-accent">
            worth {money(q.worth)}
          </span>
        )}
        {q.status === 'unasked' && (q.worth === null || q.worth === 0) && q.unlocks && (
          <span className="shrink-0 rounded-full bg-hairline px-2 py-0.5 text-[11px] font-medium text-muted">
            unblocks
          </span>
        )}
      </div>

      {q.why !== null && <p className="mb-2.5 text-xs leading-relaxed text-muted">{q.why}</p>}

      {q.status === 'from-document' && (
        <p className="mb-2.5 text-xs text-muted">
          Taken from a document you uploaded. Answering here replaces it.
        </p>
      )}
      {q.status === 'contradicted' && (
        <p className="mb-2.5 text-xs text-accent">
          Two sources disagree about this. Answering settles it.
        </p>
      )}
      {q.status === 'skipped' && (
        <p className="mb-2.5 text-xs text-muted">
          Recorded as: you don’t know. Answer any time to replace that.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Control question={q} onAnswer={onAnswer} />
        {q.status === 'unasked' && (
          <button
            type="button"
            onClick={() => onAnswer(q.factId, { kind: 'unknown' })}
            className="inline-flex items-center gap-1.5 rounded-card px-2 py-1.5 text-xs text-muted transition-colors hover:text-ink"
          >
            <HelpCircle className="h-3.5 w-3.5" />I don’t know
          </button>
        )}
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
        {settled && !saving && <Check className="h-3.5 w-3.5 text-accent" />}
      </div>
    </div>
  );
}

function Control({
  question: q,
  onAnswer,
}: {
  question: PlannedQuestion;
  onAnswer: (factId: string, value: AnswerValue) => void;
}) {
  const input = q.input;

  if (input.kind === 'yes-no') {
    const current = q.value?.kind === 'bool' ? (q.value.value as boolean) : null;
    return (
      <div className="flex gap-2">
        {[
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onAnswer(q.factId, { kind: 'bool', value: option.value })}
            className={`rounded-card border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              current === option.value
                ? 'border-accent bg-accent text-white'
                : 'border-hairline bg-surface hover:border-accent'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  if (input.kind === 'us-state' || input.kind === 'choice') {
    const options =
      input.kind === 'us-state'
        ? US_STATES.filter((s) => s.code !== '').map((s) => ({ value: s.code, label: s.label }))
        : input.options;
    const current = q.value?.kind === 'string' ? String(q.value.value) : '';
    return (
      <select
        value={current}
        onChange={(e) => {
          if (e.target.value === '') return;
          onAnswer(q.factId, { kind: 'string', value: e.target.value });
        }}
        className="rounded-card border border-hairline bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (input.kind === 'date') {
    const current = q.value?.kind === 'date' ? String(q.value.value) : '';
    return (
      <input
        type="date"
        defaultValue={current}
        onChange={(e) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return;
          onAnswer(q.factId, { kind: 'date', value: e.target.value });
        }}
        className="rounded-card border border-hairline bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
      />
    );
  }

  if (input.kind === 'text') {
    return (
      <DebouncedText
        initial={q.value?.kind === 'string' ? String(q.value.value) : ''}
        placeholder="Type an answer"
        onCommit={(v) => v.trim() !== '' && onAnswer(q.factId, { kind: 'string', value: v.trim() })}
      />
    );
  }

  const suffix = UNIT_SUFFIX[input.unit] ?? '';
  return (
    <div className="flex items-center gap-2">
      {input.unit === 'dollars' && <span className="text-sm text-muted">$</span>}
      <DebouncedText
        initial={q.value?.kind === 'number' ? String(q.value.value) : ''}
        placeholder="0"
        numeric
        onCommit={(v) => {
          const parsed = Number.parseFloat(v);
          if (!Number.isFinite(parsed)) return;
          onAnswer(q.factId, { kind: 'number', value: parsed });
        }}
      />
      {suffix !== '' && <span className="text-sm text-muted">{suffix}</span>}
    </div>
  );
}

/** Types without a round-trip per keystroke; commits once you pause. */
function DebouncedText({
  initial,
  placeholder,
  numeric = false,
  onCommit,
}: {
  initial: string;
  placeholder: string;
  numeric?: boolean;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setValue(initial), [initial]);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const schedule = (next: string) => {
    setValue(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(next), SAVE_DEBOUNCE_MS);
  };

  return (
    <input
      type="text"
      inputMode={numeric ? 'decimal' : 'text'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => schedule(e.target.value)}
      onBlur={() => {
        if (timer.current !== null) clearTimeout(timer.current);
        if (value !== initial) onCommit(value);
      }}
      className={`rounded-card border border-hairline bg-surface px-3 py-1.5 text-sm tabular-nums focus:border-accent focus:outline-none ${
        numeric ? 'w-28' : 'w-56'
      }`}
    />
  );
}
