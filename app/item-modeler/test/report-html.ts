// Authored by Karter Whitman using Claude Opus 5
// The survey, as one page.
//
// Built to be read in the order the questions actually arrive: how much
// did it get, from where, and then — file by file — what did it say and
// why. The per-file half is the one that earns the page; a coverage
// number tells you there is a problem and never which book has it.
//
// Self-contained by construction: no fonts, no scripts from anywhere, no
// images. The report is about somebody's private library and should be
// openable from a filesystem with nothing reaching out.
import type { Schema } from "@index/database/types";
import type { FieldChange, FieldProvenance } from "../src/contracts/index.js";

export interface BasketRow {
  key: string;
  value: string;
}

export interface FieldRow {
  name: string;
  value: string | string[] | null;
  action: FieldChange["action"] | null;
  provenance: FieldProvenance | null;
}

export interface SourceReport {
  filename: string;
  directory: string;
  sizeBytes: number;
  durationMs: number;
  status: "modeled" | "failed";
  failure?: string;
  mime: string | null;
  name: string | null;
  nameProvenance?: FieldProvenance | null;
  fields: FieldRow[];
  warnings: { code: string; field: string | null; message: string }[];
  conflicts: { field: string; incumbent: unknown; challengers: unknown[]; reason: string }[];
  basket: BasketRow[];
  modelAnswer: Record<string, unknown> | null;
  meta?: {
    sourcesRead: number;
    evidenceBytes: number;
    truncated: boolean;
    claimsTotal: number;
    claimsRejected: number;
  };
}

export interface Report {
  corpus: string;
  generatedAt: Date;
  schema: Schema;
  sources: SourceReport[];
}

function escape(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function show(value: string | string[] | null | undefined): string {
  if (value === null || value === undefined) return "";
  return Array.isArray(value) ? value.join(", ") : value;
}

function bytes(count: number): string {
  if (count > 1_000_000) return `${(count / 1_000_000).toFixed(1)} MB`;
  if (count > 1000) return `${Math.round(count / 1000)} KB`;
  return `${count} B`;
}

/** The reader a value came from, shortened to what distinguishes it. */
function methodLabel(method: string | undefined): string {
  const labels: Record<string, string> = {
    "epub-opf": "opf",
    "checksum": "checksum",
    "language-model": "model",
  };
  return labels[method ?? ""] ?? method ?? "—";
}

function coverage(report: Report): { field: string; filled: number; total: number }[] {
  const total = report.sources.length;
  const rows = [
    {
      field: "title",
      filled: report.sources.filter((source) => source.name !== null).length,
      total,
    },
  ];
  for (const field of report.schema.fields.slice(1)) {
    rows.push({
      field: field.name,
      filled: report.sources.filter((source) =>
        source.fields.some((entry) => entry.name === field.name && entry.value !== null),
      ).length,
      total,
    });
  }
  return rows;
}

/** Which reader supplied each winning value, across the corpus. Answers
 * "is the filename carrying this library, or are the files?" */
function methodCounts(report: Report): { method: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const source of report.sources) {
    const provenances = [
      ...(source.name !== null && source.nameProvenance ? [source.nameProvenance] : []),
      ...source.fields.filter((field) => field.value !== null && field.provenance).map((field) => field.provenance as FieldProvenance),
    ];
    for (const provenance of provenances) {
      counts.set(provenance.method, (counts.get(provenance.method) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count);
}

function fieldCell(name: string, value: string | string[] | null, provenance: FieldProvenance | null): string {
  if (value === null || show(value) === "") {
    return `<div class="field empty"><span class="k">${escape(name)}</span><span class="v">—</span></div>`;
  }
  const confidence = provenance?.confidence;
  const weak = confidence !== undefined && confidence < 0.6;
  return `<div class="field${weak ? " weak" : ""}">
      <span class="k">${escape(name)}</span>
      <span class="v">${escape(show(value))}</span>
      <span class="src" title="${escape(provenance?.location ?? "")}">${escape(methodLabel(provenance?.method))}${
        confidence !== undefined ? ` ${confidence.toFixed(2)}` : ""
      }</span>
    </div>`;
}

function sourceCard(source: SourceReport): string {
  const filled =
    source.fields.filter((field) => field.value !== null).length + (source.name ? 1 : 0);
  const state = source.status === "failed" ? "failed" : filled === 0 ? "blank" : filled >= 5 ? "full" : "partial";

  const rejected = source.warnings.filter((warning) => warning.code === "value-rejected");
  const truncated = source.meta?.truncated;

  return `<article class="card ${state}" data-filled="${filled}" data-state="${state}">
    <header>
      <div class="score">${filled}<span>/6</span></div>
      <div class="who">
        <h3>${escape(source.filename)}</h3>
        <p class="meta">${bytes(source.sizeBytes)} · ${source.durationMs}ms${
          truncated ? " · <span class='flag'>truncated</span>" : ""
        }${source.basket.length ? ` · ${source.basket.length} evidence` : ""}</p>
      </div>
    </header>

    ${
      source.status === "failed"
        ? `<p class="failure">${escape(source.failure)}</p>`
        : `<div class="fields">
      ${fieldCell("title", source.name, source.nameProvenance ?? null)}
      ${source.fields.map((field) => fieldCell(field.name, field.value, field.provenance)).join("\n      ")}
    </div>`
    }

    ${
      rejected.length > 0
        ? `<ul class="notes rejected">${rejected
            .map((warning) => `<li><b>rejected</b> ${escape(warning.message)}</li>`)
            .join("")}</ul>`
        : ""
    }
    ${
      source.conflicts.length > 0
        ? `<ul class="notes conflict">${source.conflicts
            .map(
              (conflict) =>
                `<li><b>conflict</b> ${escape(conflict.field)}: ${escape(
                  show(conflict.incumbent as string),
                )} vs ${escape(conflict.challengers.map((c) => show(c as string)).join(" / "))}</li>`,
            )
            .join("")}</ul>`
        : ""
    }

    ${
      source.basket.length > 0
        ? `<details class="claims">
      <summary>the evidence it read${
        source.modelAnswer ? " · and what the model answered" : ""
      }</summary>
      <table>
        <thead><tr><th>key</th><th>value</th></tr></thead>
        <tbody>
        ${source.basket
          .map(
            (row) => `<tr><td>${escape(row.key)}</td><td class="cv">${escape(row.value)}</td></tr>`,
          )
          .join("")}
        </tbody>
      </table>
      ${
        source.modelAnswer
          ? `<table><thead><tr><th>model said</th><th>value</th></tr></thead><tbody>${Object.entries(
              source.modelAnswer,
            )
              .map(
                ([key, value]) =>
                  `<tr><td>${escape(key)}</td><td class="cv">${escape(show(value as string))}</td></tr>`,
              )
              .join("")}</tbody></table>`
          : ""
      }
    </details>`
        : ""
    }
  </article>`;
}

export function renderReport(report: Report): string {
  const rows = coverage(report);
  const total = report.sources.length;
  const failed = report.sources.filter((source) => source.status === "failed").length;
  const blank = report.sources.filter(
    (source) => source.status === "modeled" && !source.name && source.fields.every((f) => f.value === null),
  ).length;
  const filledTotal = rows.reduce((sum, row) => sum + row.filled, 0);
  const possible = rows.length * total;
  const duration = report.sources.reduce((sum, source) => sum + source.durationMs, 0);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Item modeler survey</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #fbfaf8;
  --panel: #ffffff;
  --ink: #1a1a19;
  --dim: #6b6b66;
  --line: #e5e3de;
  --accent: #2f6f4e;
  --warn: #a8641b;
  --bad: #a33a2c;
  --weak: #8a6d3b;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16171a;
    --panel: #1e2024;
    --ink: #e8e6e1;
    --dim: #91908a;
    --line: #2e3137;
    --accent: #6cc08b;
    --warn: #d99a4e;
    --bad: #e2705f;
    --weak: #c9a86a;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2.5rem 1.5rem 6rem;
  background: var(--bg); color: var(--ink);
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 1080px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; letter-spacing: -.01em; }
h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .09em;
     color: var(--dim); margin: 3rem 0 1rem; font-weight: 600; }
.sub { color: var(--dim); font-size: .875rem; margin: 0 0 2rem; }
.sub code { font-family: var(--mono); font-size: .85em; }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .75rem; }
.tile { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: .9rem 1rem; }
.tile b { display: block; font-size: 1.6rem; font-weight: 650; letter-spacing: -.02em; line-height: 1.1; }
.tile span { color: var(--dim); font-size: .78rem; }

table.cov { width: 100%; border-collapse: collapse; }
table.cov td { padding: .3rem 0; vertical-align: middle; }
table.cov td.f { width: 92px; font-family: var(--mono); font-size: .82rem; }
table.cov td.n { width: 76px; text-align: right; color: var(--dim); font-size: .82rem;
                 font-family: var(--mono); }
.bar { height: 9px; background: var(--line); border-radius: 5px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent); border-radius: 5px; }

.controls { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.controls button {
  font: inherit; font-size: .82rem; padding: .32rem .7rem; cursor: pointer;
  background: var(--panel); color: var(--dim);
  border: 1px solid var(--line); border-radius: 999px;
}
.controls button[aria-pressed="true"] { color: var(--ink); border-color: var(--ink); }

.card { background: var(--panel); border: 1px solid var(--line);
        border-radius: 12px; padding: 1rem 1.1rem; margin-bottom: .75rem; }
.card.blank { border-color: color-mix(in srgb, var(--bad) 40%, var(--line)); }
.card.failed { border-color: var(--bad); }
.card header { display: flex; gap: .9rem; align-items: baseline; }
.score { font-family: var(--mono); font-size: 1.05rem; font-weight: 650; color: var(--accent);
         min-width: 3.1rem; }
.card.partial .score { color: var(--warn); }
.card.blank .score, .card.failed .score { color: var(--bad); }
.score span { color: var(--dim); font-weight: 400; font-size: .8rem; }
.who { min-width: 0; flex: 1; }
.card h3 { margin: 0; font-size: .9rem; font-weight: 600; word-break: break-word; line-height: 1.35; }
.card .meta { margin: .15rem 0 0; font-size: .76rem; color: var(--dim); font-family: var(--mono); }
.flag { color: var(--warn); }

.fields { margin-top: .8rem; display: grid; gap: 1px; background: var(--line);
          border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.field { display: grid; grid-template-columns: 88px 1fr auto; gap: .7rem; align-items: baseline;
         background: var(--panel); padding: .42rem .7rem; }
.field .k { font-family: var(--mono); font-size: .76rem; color: var(--dim); }
.field .v { min-width: 0; word-break: break-word; font-size: .875rem; }
.field .src { font-family: var(--mono); font-size: .7rem; color: var(--dim);
              border: 1px solid var(--line); border-radius: 4px; padding: 0 .3rem; white-space: nowrap; }
.field.empty .v { color: var(--dim); }
.field.weak .v { color: var(--weak); }
.field.weak .src { color: var(--weak); border-color: var(--weak); }

.failure { margin: .8rem 0 0; color: var(--bad); font-family: var(--mono); font-size: .82rem; }
.notes { margin: .7rem 0 0; padding: 0; list-style: none; font-size: .8rem; }
.notes li { padding: .18rem 0; color: var(--dim); }
.notes b { font-family: var(--mono); font-size: .72rem; text-transform: uppercase;
           letter-spacing: .04em; margin-right: .4rem; }
.rejected b { color: var(--bad); }
.conflict b { color: var(--warn); }

details.claims { margin-top: .8rem; }
details.claims summary { cursor: pointer; font-size: .78rem; color: var(--dim);
                         font-family: var(--mono); }
details.claims table { width: 100%; border-collapse: collapse; margin-top: .6rem;
                       font-size: .76rem; font-family: var(--mono); }
details.claims th { text-align: left; color: var(--dim); font-weight: 500;
                    border-bottom: 1px solid var(--line); padding: .25rem .5rem .25rem 0; }
details.claims td { padding: .22rem .5rem .22rem 0; border-bottom: 1px solid var(--line);
                    vertical-align: top; }
details.claims td.cv { max-width: 340px; word-break: break-word; white-space: normal; }
details.claims td.dim { color: var(--dim); }
.overflow { overflow-x: auto; }
</style>
</head>
<body>
<div class="wrap">

<h1>Item modeler survey</h1>
<p class="sub"><code>${escape(report.corpus)}</code> · ${total} sources · deterministic
extraction only · ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}</p>

<div class="tiles">
  <div class="tile"><b>${total}</b><span>sources</span></div>
  <div class="tile"><b>${Math.round((filledTotal / Math.max(possible, 1)) * 100)}%</b><span>fields filled</span></div>
  <div class="tile"><b>${blank}</b><span>read nothing</span></div>
  <div class="tile"><b>${failed}</b><span>failed to model</span></div>
  <div class="tile"><b>${Math.round(duration / Math.max(total, 1))}ms</b><span>per source</span></div>
</div>

<h2>Coverage by field</h2>
<table class="cov">
${rows
  .map(
    (row) => `<tr>
  <td class="f">${escape(row.field)}</td>
  <td><div class="bar"><i style="width:${(row.filled / Math.max(row.total, 1)) * 100}%"></i></div></td>
  <td class="n">${row.filled}/${row.total}</td>
</tr>`,
  )
  .join("\n")}
</table>

<h2>Where the values came from</h2>
<table class="cov">
${methodCounts(report)
  .map(
    (row) => `<tr>
  <td class="f">${escape(methodLabel(row.method))}</td>
  <td><div class="bar"><i style="width:${(row.count / Math.max(filledTotal, 1)) * 100}%"></i></div></td>
  <td class="n">${row.count}</td>
</tr>`,
  )
  .join("\n")}
</table>

<h2>Every source</h2>
<div class="controls">
  <button data-filter="all" aria-pressed="true">all (${total})</button>
  <button data-filter="problem" aria-pressed="false">read little or nothing</button>
  <button data-filter="full" aria-pressed="false">read well</button>
</div>
<div id="cards">
${report.sources
  .slice()
  .sort((a, b) => {
    const score = (source: SourceReport) =>
      source.status === "failed"
        ? -1
        : source.fields.filter((field) => field.value !== null).length + (source.name ? 1 : 0);
    return score(a) - score(b) || a.filename.localeCompare(b.filename);
  })
  .map(sourceCard)
  .join("\n")}
</div>

</div>
<script>
// The only script on the page, and it does one thing: the corpus is
// worth reading twice — once for what failed, once for what worked.
const buttons = [...document.querySelectorAll('.controls button')];
const cards = [...document.querySelectorAll('.card')];
buttons.forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    buttons.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    cards.forEach((card) => {
      const state = card.dataset.state;
      const show =
        filter === 'all' ||
        (filter === 'problem' && (state === 'blank' || state === 'failed' || state === 'partial')) ||
        (filter === 'full' && state === 'full');
      card.style.display = show ? '' : 'none';
    });
  });
});
</script>
</body>
</html>
`;
}
