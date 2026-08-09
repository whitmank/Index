// Authored by Karter Whitman using Claude Opus 4.8
// The channel names, alone in their own module so the preload can import
// them without dragging the main-process handlers (and everything they
// import) into the renderer's bundle.
export const CHANNELS = {
  deviceSelf: "device:self",
  setsList: "sets:list",
  setsMembers: "sets:members",
  setsDates: "sets:dates",
  itemsGet: "items:get",
  itemsSearch: "items:search",
  labelsList: "labels:list",
  labelsEnsure: "labels:ensure",
  schemasList: "schemas:list",
  schemasUpsert: "schemas:upsert",
  changesApply: "changes:apply",
  intakePathsToResources: "intake:pathsToResources",
  intakePick: "intake:pick",
  shellReveal: "shell:reveal",
  shellOpenExternal: "shell:openExternal",
} as const;
