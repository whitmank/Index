# Item Modeling Module Specification

## Purpose

The `item-modeling` module expands a user-created Item using one or more attached sources.

A user begins with a partial Item and attaches relevant URLs, files, or text. The module reads available source evidence, derives structured facts, reconciles conflicting claims, validates results, and applies trustworthy additions to the same Item.

The goal is not to create a separate “parsed model” or replace the user’s Item with a new object. The goal is to **enrich the existing Item in place** while preserving user intent and maintaining an audit trail of modeled changes.

```text
User-created Item + attached sources
                │
                ▼
          item-modeling
                │
                ├─ Collect and normalize source evidence
                ├─ Determine or validate item type, when needed
                ├─ Extract type-specific field claims
                ├─ Reconcile claims across sources
                ├─ Validate and normalize candidate values
                ├─ Respect user-provided values
                ├─ Apply safe updates to the Item
                └─ Record provenance, warnings, conflicts, and changes
                │
                ▼
Expanded Item
```

## Responsibilities

The module owns the workflow that converts attached source material into trusted Item details.

It should:

- Read source references attached to an Item.
- Obtain usable evidence from supported source types.
- Extract deterministic metadata before invoking a language model.
- Use rules and language-model extraction selectively for missing or ambiguous details.
- Populate only fields supported by source evidence.
- Reconcile multiple sources into one coherent Item.
- Normalize values such as dates, names, identifiers, URLs, language codes, and enumerations.
- Validate extracted values against domain-specific rules.
- Respect fields the user entered manually.
- Preserve provenance for all modeled values.
- Surface ambiguity and conflicts instead of silently guessing.
- Return an updated Item and a machine-readable change set.
- Support future asynchronous execution and re-modeling.

It should not own user-interface rendering, raw database access, account management, or unrelated application workflows.

## Core principles

### Expand the Item

The Item is the canonical object throughout its lifecycle.

The module receives an Item, evaluates its attached sources, and returns an updated version of that same Item. It should not introduce a permanent parallel representation that competes with the Item as the source of truth.

```text
Before modeling:
Item
  ├─ user-entered fields
  ├─ empty or incomplete details
  └─ sources[]

After modeling:
Item
  ├─ preserved user-entered values
  ├─ populated and normalized details
  ├─ sources[]
  ├─ provenance
  ├─ warnings
  └─ conflicts
```

### Preserve user intent

User-entered values must be treated differently from modeled values.

The default policy should be:

- Populate missing fields when source evidence supports a value.
- Do not overwrite a user-provided value automatically.
- If source evidence confirms a user value, retain the user value and add supporting provenance.
- If source evidence conflicts with a user value, retain the user value and create a conflict.
- Allow future UI workflows to let the user choose between competing values.
- Permit high-confidence modeled values to replace previous modeled values when newer or stronger evidence is available.

### Prefer deterministic evidence

Use deterministic extraction and validation before language-model inference.

Examples include:

- File metadata.
- HTML metadata.
- JSON-LD.
- Open Graph fields.
- Embedded structured data.
- EPUB package metadata.
- PDF document metadata.
- MIME type and file name.
- Identifier checksums.
- Date parsing.
- URL canonicalization.

The language model should interpret normalized evidence and fill gaps; it should not be the first or only means of extracting facts.

### Ground every modeled field

Every modeled value must be traceable to evidence.

A field’s provenance should identify:

- The origin: user, deterministic extractor, rule, or language model.
- The contributing source or sources.
- The source location, such as metadata key, page text, document page, or text range.
- The extraction method.
- Optional confidence.
- When the value was set or confirmed.

The module should treat an unsupported model-generated value as invalid, even if it is syntactically plausible.

### Prefer uncertainty over invention

When evidence is absent, weak, ambiguous, or contradictory, the module should leave the field unpopulated and record a warning or conflict.

The module should not invent values to make an Item appear complete.

## Processing lifecycle

### 1. Receive an Item

The module receives an existing Item and its attached source references.

The Item may already contain:

- User-entered values.
- Previously modeled values.
- Source references.
- Existing field provenance.
- Earlier warnings or conflicts.
- A known item type or no type.

The module must support partial Items and repeated processing.

### 2. Collect source evidence

Source references are converted into normalized evidence that downstream components can use consistently.

Evidence collection may include:

- Fetching or reading sources where supported.
- Inspecting MIME type and file metadata.
- Extracting structured metadata.
- Extracting readable text.
- Normalizing URLs.
- Recording source identity and retrieval metadata.
- Truncating or chunking large content predictably.
- Retaining sufficient source location data for provenance.

The result is an internal evidence representation. It is not necessarily persisted as the Item’s public shape; persistence decisions belong to the surrounding application.

### 3. Infer or validate type

If the Item type is absent, uncertain, or inconsistent with attached sources, the module may classify the Item.

Classification should use a staged approach:

1. Deterministic signals, such as MIME type, JSON-LD type, file metadata, URL/domain rules, and explicit source labels.
2. Similarity or embedding-based routing, if the application later supports it.
3. A constrained language-model classification call only when deterministic methods are insufficient.

The type result should carry confidence and evidence. If the result is uncertain, the Item should remain untyped or be marked for review instead of being forced into an incorrect schema.

### 4. Extract field claims

The module extracts candidate field values for the known or inferred type.

A **field claim** is not yet a final Item update. It is a candidate assertion with evidence and extraction context.

Each field claim should include:

- Field identifier.
- Candidate value.
- Evidence references.
- Source ID or IDs.
- Extraction method.
- Confidence or reliability score where meaningful.
- Source priority.
- Whether the value is direct, normalized, inferred, or summarized.

Claims may originate from:

- Deterministic metadata mapping.
- Regular expressions and rules.
- Source-specific parsers.
- A local language model with schema-constrained output.
- A future external model provider, if supported.

### 5. Reconcile claims

When multiple sources make claims about the same field, reconcile them before updating the Item.

Reconciliation should account for:

- Whether values are semantically equal after normalization.
- Source reliability and priority.
- Direct metadata versus ambiguous page text.
- The recency of the source when relevant.
- Whether a claim is user-provided.
- Whether the claim has direct supporting evidence.
- Whether sources disagree materially.

Possible outcomes:

- One winning claim.
- Multiple compatible claims that can be merged.
- A user value that is confirmed.
- A conflict requiring review.
- No usable result.

Do not hide disagreements. Record them as structured conflicts.

### 6. Normalize and validate

Before changes are applied, normalize and validate candidate values.

Typical operations include:

- Identifier format and checksum validation.
- Date parsing and safe canonicalization.
- Person and organization name cleanup.
- URL canonicalization.
- Whitespace cleanup.
- List de-duplication.
- Language and locale normalization.
- Enum validation.
- Domain-specific semantic validation.

Validation should be deterministic and separate from LLM prompting. If a candidate value fails validation, discard or quarantine it and record a warning.

### 7. Apply updates

Apply validated, reconciled claims to the existing Item according to ownership and precedence policy.

Default precedence:

```text
User-entered value
  > explicitly approved value
  > high-confidence modeled value
  > lower-confidence modeled value
  > missing value
```

The application should distinguish at least these actions:

- `populated`: a previously empty field received a supported value.
- `normalized`: an existing value changed only into a canonical equivalent.
- `confirmed`: evidence supports an existing value without changing it.
- `replaced`: a modeled value was superseded by stronger evidence.
- `skipped`: a claim was intentionally not applied.
- `conflicted`: evidence disagrees with an existing value.
- `cleared`: a prior modeled value was removed because it failed validation or lost support.

The module should return a complete change set for auditing, UI presentation, testing, and persistence decisions.

### 8. Record provenance and diagnostics

Every modeling run should record sufficient metadata to answer:

- What changed?
- Why did it change?
- Which sources supported it?
- Was an LLM involved?
- Which model and prompt/version produced a claim?
- What warnings or conflicts occurred?
- When was the Item last modeled?
- Can the operation be safely rerun?

The module should avoid exposing raw prompt content or sensitive source material in routine logs.

## Suggested package structure

```text
src/item-modeling/
  index.ts
  item-modeler.ts

  contracts/
    item-modeling-result.ts
    modeling-options.ts
    changes.ts
    warnings.ts
    conflicts.ts
    field-claim.ts
    provenance.ts

  evidence/
    collect-item-evidence.ts
    source-evidence.ts
    source-resolution.ts
    content-limits.ts
    source-priority.ts

  classification/
    classify-item.ts
    deterministic-classifier.ts
    language-model-classifier.ts
    classification-policy.ts

  extraction/
    extract-item-claims.ts
    deterministic-extractors/
      metadata-mapper.ts
      identifier-extractor.ts
      date-extractor.ts
      structured-data-extractor.ts
    language-model/
      local-model-client.ts
      extraction-prompts.ts
      structured-output.ts
      extraction-schemas.ts
    type-specific/
      book-extractor.ts
      article-extractor.ts
      product-extractor.ts
      movie-extractor.ts

  reconciliation/
    reconcile-claims.ts
    compare-values.ts
    merge-compatible-claims.ts
    conflict-detector.ts
    source-ranking.ts

  normalization/
    normalize-value.ts
    normalize-identifiers.ts
    normalize-dates.ts
    normalize-names.ts
    normalize-urls.ts

  validation/
    validate-claims.ts
    validate-provenance.ts
    domain-validators.ts
    schema-validation.ts

  application/
    apply-modeling-result.ts
    ownership-policy.ts
    change-set-builder.ts

  observability/
    modeling-events.ts
    metrics.ts
    safe-logger.ts

  testing/
    fixtures/
    evaluation/
```

The initial implementation should build only the modules required for the first supported item type. Empty folders and speculative abstractions should not be created simply to match this future-facing structure.

## Primary API

The main public operation should model and return the Item itself.

```ts
const result = await itemModeler.modelItem(item, {
  inferType: true,
  includeProvenance: true,
  languageModelMode: "when-needed"
});
```

The module should return:

```text
- Updated Item
- Change set
- Warnings
- Conflicts
- Processing metadata
```

The core function should be side-effect-free with respect to persistence:

```text
Input Item → Updated Item + modeling result
```

The caller or application service should decide when to save the Item. This makes modeling easier to test, retry, preview, approve, and run in a background job.

The surrounding application may later provide a convenience workflow that persists changes:

```text
load Item → model Item → present or approve changes → save Item
```

## Modeling options

The module should accept explicit options rather than hiding major behavior behind defaults.

Examples:

```text
inferType
languageModelMode
allowNetworkAccess
maxSources
maxSourceTextLength
includeProvenance
overwriteModeledValues
conflictPolicy
timeout
debugDiagnostics
```

Suggested language-model modes:

| Mode | Meaning |
|---|---|
| `never` | Use deterministic extraction only |
| `when-needed` | Use the language model only for missing or ambiguous fields |
| `always` | Use the language model as part of every modeling run |
| `fallback-only` | Use the language model only after deterministic extraction fails |

The initial parser milestone may use `always` for known-type extraction while the deterministic pipeline is still under construction. The architecture should support moving toward `when-needed`.

## Source priority policy

Source priority must be explicit, configurable, and type-aware.

A general starting order is:

```text
User-entered value
  > explicit user approval
  > canonical structured metadata from a primary source
  > first-party source metadata
  > structured metadata from trusted secondary sources
  > readable source text
  > language-model interpretation of source text
  > weak URL or filename heuristics
```

This policy should be applied per field and item type rather than as one inflexible global rule.

For example, a publisher source may be authoritative for publication metadata, while a manufacturer source may be authoritative for product specifications. A retailer page may be useful but lower priority for canonical details.

## Language model role

The language model is a bounded extraction and interpretation component inside item modeling.

It should:

- Receive normalized evidence, not raw files where avoidable.
- Receive only relevant excerpts for long sources.
- Be constrained to a schema or grammar.
- Use low-temperature generation for deterministic extraction.
- Be instructed to return `null` or no claim when evidence is missing.
- Return evidence references for populated values.
- Never be treated as a source of truth independent of the Item’s sources.
- Be validated by deterministic logic before results are applied.

The LLM should not:

- Fetch URLs.
- Read binary files directly in the first implementation.
- Fill fields from outside knowledge.
- Override user-entered values.
- Decide persistence behavior.
- Silently resolve conflicts without recording them.

## Failure handling

Modeling must distinguish between incomplete information and processing failure.

### Incomplete but successful

Examples:

- Sources lack a publication date.
- Two sources conflict on an identifier.
- Content is readable but does not contain enough information.
- An Item cannot be classified confidently.

In these cases, return a valid Item with partial updates, warnings, and/or conflicts.

### Processing failure

Examples:

- A source cannot be read.
- The local model server is unavailable.
- A source extractor crashes.
- The LLM output cannot be validated.
- A timeout occurs.
- The input violates basic module requirements.

In these cases, return a structured failure result. Do not create unsupported Item values as fallback behavior.

## Re-modeling and idempotency

The module must support re-modeling an Item repeatedly.

Reasons include:

- A user added a new source.
- A source changed.
- A previous source failed to load.
- A model or prompt improved.
- A new deterministic extractor was added.
- A user resolved a conflict.
- A field was manually corrected.

Repeated runs should not create duplicate values, duplicate provenance, or repeated warnings for the same underlying condition.

Where practical, model runs should be idempotent:

```text
Model an unchanged Item with unchanged sources and configuration
→ no semantic field changes
→ an empty or equivalent change set
```

Store or calculate source fingerprints, evidence fingerprints, and modeling version information so the application can decide whether re-modeling is necessary.

## Observability and evaluation

The module should emit safe, structured events and metrics.

Track:

- Modeling duration.
- Source count and source types.
- Evidence size and truncation.
- Deterministic versus LLM-derived claims.
- LLM latency, error rate, and model version.
- Applied fields, skipped fields, and conflicts.
- Unsupported-value rejection count.
- Validation failures.
- Completion status.

Maintain fixture-based evaluation per supported item type. Evaluate:

- Field-level correctness.
- Missing expected values.
- Incorrect populated values.
- Provenance validity.
- Conflict detection behavior.
- Latency and memory behavior.
- Change-set correctness.
- Idempotency across repeated runs.

The most important quality metric is the rate of unsupported populated values. A partial Item is acceptable; a confidently populated but incorrect Item is more harmful.

## Initial implementation milestone

The first milestone should remain narrow:

1. Support one Item type.
2. Accept already-normalized source evidence or a small set of controlled source inputs.
3. Extract a limited set of fields.
4. Use one local language model through a structured-output interface.
5. Validate values deterministically.
6. Apply modeled values only to fields that are empty or previously modeled.
7. Preserve user-entered values.
8. Produce field provenance, warnings, conflicts, and a change set.
9. Include fixture-based tests and evaluation.

Do not add classification, embeddings, broad source ingestion, persistent background jobs, or multiple item types until the first type achieves trustworthy field-level results.

## Definition of done

The `item-modeling` module is ready for initial application use when it can:

- Receive a user-created Item with attached sources.
- Produce an updated version of that Item.
- Populate only source-supported values.
- Preserve user-entered values by default.
- Record where every modeled value came from.
- Normalize and validate supported values.
- Surface source conflicts.
- Return a clear change set.
- Differentiate partial success from processing failure.
- Be rerun without accumulating duplicate changes or provenance.
- Run within the hardware and latency constraints of the local application.