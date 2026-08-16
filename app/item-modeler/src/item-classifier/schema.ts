// Authored by Karter Whitman using Claude Sonnet 5
// The item classifier's answer, as a JSON schema the model is constrained
// to: one field, one of a closed list of type names, or null.
//
// Extraction's schema (extraction-schemas.ts) needs `oneOf: [{type:
// "string"}, {type: "null"}]` because its values are arbitrary strings.
// This value-space is a closed enum, so nullability is just another enum
// member — no `oneOf` needed at all.
export interface ItemType {
  name: string;
  label: string | null;
}

export interface ItemTypeSchema {
  type: "object";
  properties: {
    type: { enum: (string | null)[]; description: string };
  };
  required: ["type"];
  additionalProperties: false;
}

/** Null when there is nothing to choose between — the caller's cue to
 * skip the model entirely rather than constrain against an empty enum. */
export function schemaForTypes(names: string[]): ItemTypeSchema | null {
  if (names.length === 0) return null;
  return {
    type: "object",
    properties: {
      type: {
        enum: [...names, null],
        description: "Which type the item is, exactly as listed, or null if none fit.",
      },
    },
    required: ["type"],
    additionalProperties: false,
  };
}
