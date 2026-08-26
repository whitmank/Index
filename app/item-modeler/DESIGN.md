---
title: Item Modeler — Design
authors: Authored by Karter Whitman using Claude Opus 5
date: 2026-08-16
---

# Item Modeler — Design

How the module is put together, and why it is put together that way.
`SPEC.md` in this directory says what it must do; this says what shape it
took, and — more usefully — which shapes it took first and had to
abandon. Companion to `docs/ARCHITECTURE.md`, which places the package
among the others.

---

## The division everything rests on

> **Locating knowledge is finite. Interpreting it is not.**

Finding where an EPUB keeps its metadata has an answer: the OCF spec says
so. Finding where a PDF keeps its has two answers, both documented. That
work is bounded, per format, and it can be written once and left alone.

Deciding what `Feminism-Pantheon` *means* has no bounded answer, because
the convention was invented by whoever named the file. There is always
another archive with another habit.

The first version of this module did not draw that line. Interpretation
lived inside the readers as regular expressions guessing at title/author
boundaries — and measured against a real library of twenty-five books it
produced ten wrong titles, each fix inviting the next convention:

```
Author - Title (Year, Publisher)        the one convention encoded
Title -- Author -- Year -- Publisher    Anna's Archive: never matched
Title-Publisher                         no spaces: never matched
Author A, Author B - Title              multi-author: never matched
Title  -Publisher                       asymmetric spacing: never matched
```

Each of those is a day's work and a new set of edge cases. That is the
arms race, and it is unwinnable in the direction it was being fought.

So the module was rebuilt around the line:

- **Deterministic code gathers and verifies.** It knows file formats and
  arithmetic. It never guesses what a string means.
- **A language model interprets.** It reads everything gathered, at once,
  and fills in the type's fields.

---

## Shape

```
        ┌── collect ──┐
sources │  epub       │        ┌── transcribe ──┐
   ──►  │  pdf        │ ──►  basket  ──►  │ stated facts │ ──┐
        │  filename   │        │           └────────────────┘   │
        └─────────────┘        │                                ▼
                               │           ┌── synthesise ──┐  verify  ──►  apply  ──► Item
                               └────────►  │  LFM2-1.2B     │ ──┘   │              + change set
                                           └────────────────┘        │
                                                          normalise → validate → ground
```

```
src/
  item-modeler.ts       the order of the steps, and nothing else
  contracts/            the vocabulary a caller reads a result in
  classifier/           staged type guess: a deterministic trad/ ladder,
                        an ai/ (LFM2) fallback when trad has no opinion —
                        a sibling entry point, not part of modelItem's own
                        pipeline below (see docs/ARCHITECTURE.md)
  collector/
    evidence/            uris → bounded, normalised source evidence; the basket
    formats/             epub, pdf, filename — find, never decide
    stated-facts.ts      the narrow transcription map
    language-model/      the local model, its schema, its prompt
  composer/
    normalization/       one fact, one spelling
    validation/          may this be written at all?
    application/         ownership precedence → the Item and its change set
  observability/        counts, never values
```

### `collector/evidence/` — the filter

Turns an Item's resources into bounded reads. Every limit is in
`content-limits.ts` so cost stops depending on the file: a 64 KB head, a
256 KB tail for the formats that keep their index at the end, a 1 MB cap
on a fetched page. An 80 MB textbook and a 400 KB paper cost the same.

`basket.ts` holds the result — a flat, ordered list of `key: value`
lines, keys prefixed by where they came from (`filename`, `opf.dc:title`,
`pdf.xmp.dc:creator`). Flat and string-keyed because the consumer is a
language model, not a program, and a page of key/value lines is the shape
these models read best.

### `collector/formats/` — find, never decide

Each collector dumps what its format declares, under the source's own
name for it. They do not curate: an earlier version kept a list of the
seven Dublin Core elements it had thought about and dropped the rest,
which threw away a book's series and contributors before anything could
use them.

Two exceptions, both narrow and both earned against real files:

- The PDF collector drops properties that describe **the file or the
  software that made it** — `pdf:Producer`, `xmp:CreatorTool`, the
  `xmpMM`/`tiff`/`exif` namespaces. Left in, they produced
  `publisher: Antenna House PDF Output Library`. Those values ground
  perfectly, because they really are in the evidence; only leaving them
  out helps.
- Producer boilerplate in a title field (`untitled`, `Microsoft Word - …`)
  is dropped, because it is the absence of a title rather than a claim
  about one.

`filename.ts` is now forty lines and hands the name over whole. Reading it
apart is the model's job, using facts that live in *other* entries — the
publisher ending `…Everyday Chaos…-Harvard Business Review Press` is
named outright in that book's own package document, two lines away. No
regex could ever see that.

### `collector/stated-facts.ts` — transcription

A short list of places where a format *declares* a field, copied
verbatim. No ranking, no arbitration.

This exists because of a measurement. Copying `dc:title` into `title` is a
solved problem at 100% reliability; asking a 1.2B model to do it
introduced failures that did not previously exist — on a book whose OPF
plainly said `dc:title: Tantra Illuminated`, the model returned null.
Transcription is where a small model is weakest and deterministic code is
perfect, so the deterministic half keeps it.

**Only the OPF, and not a PDF's metadata.** The two are not the same kind
of thing: an EPUB's package document is a *required* metadata document
describing the work, while a PDF's Info dictionary is an optional
grab-bag filled by whatever tool produced the file. The corpus reflects
it exactly — the OPF gave a correct title in 13 of 17 EPUBs, a PDF's own
metadata in 2 of 8, and on those PDFs the model did better than the file
did. EPUBs are transcribed; PDFs are synthesised.

**`published` is never transcribed.** It is the one field where a file
routinely lies: an ebook's `dc:date` is often when somebody converted it.
Tantra Illuminated declares `2015-05-07`; it was published in 2013, which
its filename knows. Choosing between them is exactly what synthesis is
for, and it gets that one right.

### `collector/language-model/` — synthesis

`LFM2-1.2B-Extract` (Q4_K_M, ~730 MB) run in-process through
`node-llama-cpp`, with the JSON schema generated from the item's own
`Schema` so a user-invented type is extracted for as well as `book`.

Three details that are not incidental:

- **Grammar enforcement at the sampler.** The output cannot be malformed
  JSON or carry a field outside the schema, because those tokens are
  never emitted. Stronger than parse-and-retry, and it removes a class of
  failure before it starts.
- **The schema goes in the system prompt, the evidence in the user turn** —
  Liquid's documented format. Getting this backwards is *silent*: a
  grammar still constrains the output, so answers stay well-formed while
  the model has never seen the schema it is filling. Correcting it turned
  a run that invented an ISBN, a date and a publisher for a camera-roll
  scan into one that returned five clean nulls.
- **Guidance travels in the schema's field descriptions**, not in prose.
  This checkpoint degrades under long instruction lists — a version with
  six prose rules parsed *worse* than one with none.

Fields already settled by transcription are left out of the schema
entirely rather than sent for confirmation: a shorter schema is answered
better, and a field absent from the grammar cannot be overwritten by a
worse answer.

### `composer/validation/` — three gates, in an order that matters

```
normalise → validate → ground
```

Normalising first means validation judges the value that would actually
be written. Grounding runs last, and is the only gate a *transcribed*
value skips — a fact copied out of a package document came from the
evidence by construction.

**Grounding is what makes synthesis safe.** Asked about real books, the
model produced `isbn: "10.1234/9781"` and `isbn: "10.1234/9780128154321"` —
DOI-shaped strings appearing in no evidence anywhere. Both read as
perfectly ordinary identifiers. Neither existed.

The check is **token-level, not substring**. The right answer is
frequently not verbatim: an OPF says `Herbert, Frank` and the correct
value is `Frank Herbert`; a filename says `…Feminism-Pantheon` and the
correct title stops before the publisher. Rearranging and trimming *is*
the work, so a literal-containment test would reject the good answers
along with the invented ones. Instead every significant token of a
claimed value must appear somewhere in the basket — rearrangement
passes, invention fails. Digits are held to the whole, because an
identifier that is nearly in the evidence is a different identifier.

### `composer/application/` — unchanged by any of this

Ownership precedence is about the *user*, not about which reader spoke. A
value the user entered is never overwritten whether the challenger came
from a package document or a language model, and the seven change actions
(`populated`, `normalized`, `confirmed`, `replaced`, `skipped`,
`conflicted`, `cleared`) describe the same seven outcomes either way.

`modelItem` is pure with respect to persistence: an Item goes in, an Item
comes out, and the caller decides whether to save it.

---

## The three failure modes, and what stops each

| Failure | Stopped by |
|---|---|
| A value from **outside** the evidence — an invented ISBN | grounding (`validate-provenance.ts`) |
| A value from the **wrong part** of the evidence — `publisher: Adobe InDesign CS6` | leaving it out of the basket (`collector/formats/pdf.ts`) |
| A value that is **another field said twice** — `subject: <the title>` | cross-field echo rejection (`resolve-values.ts`) |

The middle and right-hand rows are the ones worth remembering, because
they are not obvious. **Grounding cannot catch either.** `Antenna House`
and the title genuinely *are* in the basket, so a value drawn from them
is supported by the evidence in the only sense grounding can measure.
What makes them wrong is not where they came from but where they landed.

The echo case is the model's version of running out of ideas: asked for a
field the evidence does not support, it does not answer null — it answers
with the most prominent string in front of it. Over 25 books that filled
`subject` with the title ten times, and put `publisher: Camille Paglia`
on a book by Camille Paglia. So a synthesised value that duplicates (or
is contained in) an earlier field's value is dropped. Transcribed values
are exempt: a package document naming an author and publisher who are the
same person is a self-published book saying so.

---

## Seams

Two ports, for the same reason:

```ts
interface SourceGateway { localPath(uri): string | null; fetch(uri, cap): Promise<Buffer | null> }
interface ModelClient   { extract(request): Promise<Record<string, unknown>>; … }
```

`@index/database` is imported **type-only**, and neither Electron nor
SurrealDB is reachable from here. A `device://` uri means something only
against the device config the main process owns, so resolution is
injected; the model is injected for the same reason plus one more — a
pipeline whose only model is a 730 MB download is a pipeline nobody can
test. The suite passes a stub and exercises the whole path, grounding
included, with no weights on disk.

Absent weights are a *degraded* run, not a failed one: whatever the file
stated outright still stands, and a warning says so. "This book has no
publisher" and "nobody was able to look" are different facts.

---

## What is measured, and how

Two harnesses, because they answer different questions.

**`npm test`** — 38 checks over fixtures built at runtime. Proves the
machinery: that nulls are honoured, that an ungrounded answer is thrown
away, that an embedded logo's XMP packet is not read as the document's.
It cannot prove the module is *right* about real books.

**`npm run survey -- <dir>`** — models a real library and writes a page:
per field, per book, what was claimed and by which half. This is what
found every bug worth finding. Fixtures agree with the reader by
construction, because the same understanding wrote both; a shelf of real
books disagrees in ways nobody thought to encode.

**`npm run eval`** — scores against a hand-made ground-truth corpus in
three states: `correct`, `missed`, `wrong`. Kept apart deliberately.
`wrong` is the number that gates the work, because a partial Item is
acceptable and a confidently populated incorrect one is more harmful.
Fill rate is the number that looks best and means least — it can always
be raised by guessing.

That distinction is not theoretical. Fixing `subject` and `publisher`
moved the fill rate **down**, 92% → 74%, because most of what filled
those cells was wrong.

Current state over 25 real books:

```
title 25/25 · author 24/25 · published 23/25 · publisher 23/25 · isbn 13/25 · subject 3/25
sources of values:  opf 50 · model 49 · checksum 12        ~2.2 s per book
```

---

## Deferred, and named here so their absence is not read as oversight

- **Type classification.** An item arrives with the type its user chose;
  a missing one is refused, never guessed. Wants a different model again.
- **Persisted provenance.** `Item` has nowhere to keep it —
  `@index/database/types` records `type_source` for the type and nothing
  equivalent for a field — so provenance rides in the *result*.
  Persisting it is the cutover pass's decision, once there is a real
  shape to store.
- ~~**Backend cutover.**~~ Done: `app/backend/src/services/ingest/`'s old
  join (`classify.ts`, `extract.ts`, `formats/book.ts`,
  `signals/filename.ts`, `sources.ts`) is deleted, and intake and the
  `parse` verb both run through this module via `backend-gateway.ts`'s
  `SourceGateway` (see `docs/ARCHITECTURE.md`).

## Pinned

- Collectors find; they never decide what a string means.
- A value with no evidence behind it is not written, whatever produced it.
- Transcription beats synthesis where a format *declares* a field.
  Synthesis beats transcription everywhere else.
- Grounding measures where a value came from. It cannot measure where it
  landed — that needs the other two mechanisms.
- The fingerprint covers the prompt version. With a model in the loop the
  question asked is as much an input as the evidence.
