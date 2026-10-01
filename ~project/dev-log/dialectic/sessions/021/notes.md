---
session: 021
timestamp: 2026-04-10T00:23:55Z
authored_by: Claude Sonnet 4.6
---

## decision — UTC

Type icons use geometric SVG shapes (from the existing icon vocabulary) stored as a key string on `tag_definitions.icon`. Format chosen over emoji for visual consistency with the ●/○ language already established across the app. Icons appear in four locations: TypeField badge, Types list rows, schema section header, and object list rows. Editing via picker in the TypeSchemaEditor panel. `taggedEdges` added to the store as a flat array to support type icon resolution per object in list view without per-object loading.
