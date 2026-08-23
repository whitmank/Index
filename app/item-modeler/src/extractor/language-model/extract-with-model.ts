// Authored by Karter Whitman using Claude Opus 5
// The model's answer, turned into candidate values with provenance.
//
// Everything here is a *candidate*. Nothing the model returns reaches the
// Item without passing validation and grounding — the model is the one
// component of this pipeline that can produce a fluent, plausible,
// entirely invented value, and the architecture's answer to that is not
// to trust it less but to check it afterwards.
import type { Schema } from "@index/database/types";
import type { EvidenceBasket } from "../evidence/basket.js";
import { render } from "../evidence/basket.js";
import type { FieldProvenance } from "../../contracts/provenance.js";
import type { ModelingWarning } from "../../contracts/warnings.js";
import { schemaForExtraction } from "./extraction-schemas.js";
import { PROMPT_VERSION, systemPrompt, userPrompt } from "./extraction-prompts.js";
import type { ModelClient } from "./local-model-client.js";

export interface ModelValue {
  field: string;
  value: string;
  provenance: FieldProvenance;
}

export interface ModelExtraction {
  values: ModelValue[];
  warnings: ModelingWarning[];
  latencyMs: number;
}

export interface ModelRequest {
  client: ModelClient;
  basket: EvidenceBasket;
  schema: Schema;
  /** Fields the deterministic half already settled. Left out of the
   * schema entirely rather than sent for confirmation. */
  already: string[];
  timeoutMs: number;
  now: () => Date;
}

export async function extractWithModel(request: ModelRequest): Promise<ModelExtraction> {
  const { client, basket, schema, already, timeoutMs, now } = request;

  const jsonSchema = schemaForExtraction(schema, already);
  if (!jsonSchema) return { values: [], warnings: [], latencyMs: 0 };

  const started = Date.now();
  let answer: Record<string, unknown>;
  try {
    answer = await client.extract({
      system: systemPrompt(jsonSchema),
      user: userPrompt(render(basket)),
      schema: jsonSchema,
      timeoutMs,
    });
  } catch (error) {
    // The model failing is not the item failing. Whatever the
    // deterministic half settled still stands, and the run continues with
    // a note rather than losing an epub's perfectly good metadata to a
    // timeout.
    return {
      values: [],
      warnings: [
        {
          code: "reader-failed",
          message: `the extraction model did not answer: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      latencyMs: Date.now() - started,
    };
  }

  const latencyMs = Date.now() - started;
  const model = client.describe();
  const at = now().toISOString();

  const values: ModelValue[] = [];
  for (const [field, raw] of Object.entries(answer)) {
    // A null is the model doing the right thing, and it is not a value.
    // The grammar makes nulls expressible precisely so this branch is
    // reachable without the model having to omit a required key.
    if (raw === null || raw === undefined) continue;
    const value = String(raw).trim();
    if (value === "") continue;

    values.push({
      field,
      value,
      provenance: {
        origin: "language-model",
        // Every entry in the basket, because that is what the model read.
        // Narrowing this to a guessed source would be a claim about
        // attention nobody can substantiate — the honest statement is
        // that this value came from synthesising all of it.
        sourceIds: [...new Set(basket.entries.map((entry) => entry.sourceId))],
        location: "basket",
        method: "language-model",
        model: { ...model, promptVersion: PROMPT_VERSION },
        at,
      },
    });
  }

  return { values, warnings: [], latencyMs };
}
