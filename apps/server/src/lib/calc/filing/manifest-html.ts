// ─── H1 · The manifest, printed ────────────────────────────────────
// The manifest as a single self-contained page: no scripts, no fonts to
// fetch, no network of any kind — because the situation it is for is
// someone at a kitchen table with a printout and free filing software
// open in another window.
//
// Pure string building, so it is testable without a browser. The
// structure deliberately mirrors the Manifest object one-to-one: this
// file decides how the year LOOKS and never what it says.

import type { Manifest, ManifestLine } from './manifest';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n: number): string =>
  `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

const ORIGIN_WORD: Record<string, string> = {
  person: 'you told us',
  document: 'from a document',
  rule: 'worked out',
};

function lineRow(line: ManifestLine): string {
  const chain = line.provenance.facts
    .map((f) => `${esc(f.label)} <em>(${ORIGIN_WORD[f.origin] ?? f.origin})</em>`)
    .join('<br>');

  return `
  <tr>
    <td class="ln">${esc(line.line)}</td>
    <td>
      <div class="lbl">${esc(line.label)}</div>
      <div class="how">${esc(line.provenance.how)}</div>
      ${
        chain !== ''
          ? `<details class="prov"><summary>Where this came from</summary><div class="chain">${chain}${
              line.provenance.citation !== null
                ? `<div class="cite">${esc(line.provenance.citation)}</div>`
                : ''
            }</div></details>`
          : line.provenance.citation !== null
            ? `<div class="cite">${esc(line.provenance.citation)}</div>`
            : ''
      }
    </td>
    <td class="amt">${money(line.amount)}</td>
  </tr>`;
}

export function manifestHtml(manifest: Manifest): string {
  const forms = manifest.forms
    .map(
      (f) => `
  <section class="form">
    <h2>${esc(f.label)}</h2>
    <table>
      <thead><tr><th class="ln">Line</th><th>What it is</th><th class="amt">Amount</th></tr></thead>
      <tbody>${f.lines.map(lineRow).join('')}</tbody>
    </table>
  </section>`,
    )
    .join('');

  const blockers =
    manifest.blockers.length === 0
      ? ''
      : `
  <section class="blockers">
    <h2>Before this can be filed</h2>
    <ul>${manifest.blockers.map((b) => `<li>${esc(b.reason)}</li>`).join('')}</ul>
  </section>`;

  const open =
    manifest.openQuestions.length === 0
      ? ''
      : `
  <section>
    <h2>Still unanswered</h2>
    <ul class="qs">${manifest.openQuestions
      .map(
        (q) =>
          `<li>${esc(q.question)}${
            q.worth !== null && q.worth !== 0
              ? ` <span class="worth">worth ${money(q.worth)} to find out</span>`
              : q.unlocksSomething
                ? ' <span class="worth">changes which forms apply</span>'
                : ''
          }</li>`,
      )
      .join('')}</ul>
  </section>`;

  const outside =
    manifest.outsideTheReturn.length === 0
      ? ''
      : `
  <section>
    <h2>Money the return will never show</h2>
    ${manifest.outsideTheReturn
      .map(
        (o) => `<div class="note">
      <div class="lbl">${esc(o.label)}${o.amount !== null ? ` — ${money(o.amount)}` : ''}</div>
      <div class="how">${esc(o.detail)}</div>
      <div class="how"><strong>${esc(o.action)}</strong></div>
    </div>`,
      )
      .join('')}
  </section>`;

  const scope =
    manifest.outOfScope.length === 0
      ? ''
      : `
  <section>
    <h2>What Basis does not do for this year</h2>
    ${manifest.outOfScope
      .map(
        (r) => `<div class="note">
      <div class="lbl">${esc(r.form)}</div>
      <div class="how">${esc(r.ifUnsupported?.whyItApplies ?? '')} ${esc(
        r.ifUnsupported?.whatItMeans ?? '',
      )}</div>
    </div>`,
      )
      .join('')}
  </section>`;

  const calendar = `
  <section>
    <h2>Dates</h2>
    <table class="cal">
      <tbody>${manifest.calendar
        .map(
          (c) =>
            `<tr><td class="d">${esc(c.date)}</td><td><div class="lbl">${esc(
              c.what,
            )}</div><div class="how">${esc(c.detail)}</div></td></tr>`,
        )
        .join('')}</tbody>
    </table>
  </section>`;

  const where = `
  <section>
    <h2>Where to file this</h2>
    ${manifest.whereToFile.options
      .map(
        (o) => `<div class="note">
      <div class="lbl">${esc(o.name)}</div>
      <div class="how">${esc(o.detail)}${
        o.url !== null ? ` <span class="url">${esc(o.url)}</span>` : ''
      }</div>
    </div>`,
      )
      .join('')}
    <div class="note">
      <div class="lbl">What to have with you</div>
      <ul class="how">${manifest.whereToFile.carry.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    </div>
  </section>`;

  const cautions = `
  <section class="cautions">
    <h2>Read this first</h2>
    <ul>${manifest.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
  </section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Basis — ${manifest.taxYear}</title>
<style>
  /* Everything inline and nothing fetched: this has to render from a
     downloads folder with the wifi off. */
  :root { --ink:#171b23; --muted:#5b6472; --line:#e2e5ea; --accent:#2b59ff; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
         color: var(--ink); background: #fff; margin: 0; padding: 32px; max-width: 780px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;
       color: var(--muted); margin: 28px 0 8px; font-weight: 600; }
  .head { border-bottom: 2px solid var(--ink); padding-bottom: 12px; margin-bottom: 8px; }
  .sub { color: var(--muted); margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
       color: var(--muted); border-bottom: 1px solid var(--line); padding: 6px 8px; font-weight: 600; }
  td { border-bottom: 1px solid var(--line); padding: 8px; vertical-align: top; }
  .ln { width: 46px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .amt { width: 120px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .lbl { font-weight: 600; }
  .how, .cite, .chain { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
  .cite { font-style: italic; }
  .chain em { font-style: normal; color: var(--accent); }
  .prov summary { cursor: pointer; color: var(--muted); font-size: 12.5px; margin-top: 3px; }
  .worth { color: var(--accent); font-weight: 600; }
  .note { border-left: 2px solid var(--line); padding: 2px 0 2px 10px; margin: 10px 0; }
  .blockers { border: 1px solid var(--ink); padding: 12px 16px; margin-top: 20px; }
  .blockers h2, .cautions h2 { margin-top: 0; }
  .cautions { background: #f5f6f9; padding: 12px 16px; margin-top: 28px; }
  .cal .d { width: 110px; font-variant-numeric: tabular-nums; color: var(--muted); }
  .url { word-break: break-all; }
  ul { margin: 4px 0; padding-left: 18px; }
  li { margin: 3px 0; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid var(--line);
           color: var(--muted); font-size: 12px; }
  @media print {
    body { padding: 0; max-width: none; }
    /* A printout has no pointer, so every folded detail is opened. */
    details { display: block; }
    details > summary { display: none; }
    .chain { display: block !important; }
    section { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="head">
    <h1>Your ${manifest.taxYear} return, worked out</h1>
    <p class="sub">${esc(manifest.headline)}</p>
  </div>
${blockers}${forms}${open}${outside}${scope}${calendar}${where}${cautions}
  <footer>
    Prepared by Basis on ${esc(manifest.builtAt.slice(0, 10))}. Every figure traces to something
    you said or a document you provided. This is a worked estimate to check and file with — it is
    not a filed return, and it is not tax advice.
  </footer>
</body>
</html>`;
}
