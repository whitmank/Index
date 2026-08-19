-- Authored by Karter Whitman using Claude Opus 4.8
-- PRODUCT-SPEC §1.1–1.3. Re-run at every launch, so every statement is
-- idempotent: tables use IF NOT EXISTS (never touch existing rows),
-- fields and indexes use OVERWRITE (so an edit here reaches an existing
-- store without a migration step).

DEFINE TABLE IF NOT EXISTS items SCHEMAFULL;
-- immutable, when the item entered the index — absorbs what used to be
-- the separate `created_at`.
DEFINE FIELD OVERWRITE date_added ON items TYPE datetime DEFAULT time::now() READONLY;
-- presentation override; "default" means "use the type's own layout" —
-- never absent, so a raw record needs no out-of-band knowledge of what
-- null would have meant.
DEFINE FIELD OVERWRITE layout ON items TYPE string DEFAULT "default";
-- an item's set-related state, in one field: `false` = not a set,
-- `true` = deliberately created as one before it has a filter yet, an
-- object = it has one (§1.5).
DEFINE FIELD OVERWRITE set ON items TYPE bool | object FLEXIBLE DEFAULT false;
-- everything resource-descriptive and app-displayed: name, description,
-- classification, extracted attributes, freeform tags. `name` is the
-- one key every item is guaranteed to carry.
DEFINE FIELD OVERWRITE data ON items TYPE object ASSERT $value.name != NONE;
DEFINE FIELD OVERWRITE data.*           ON items TYPE object;
DEFINE FIELD OVERWRITE data.*.attribute ON items TYPE option<string>;  -- absent: a freeform tag
DEFINE FIELD OVERWRITE data.*.value     ON items TYPE string | array<string>;  -- array: the "list" kind
DEFINE FIELD OVERWRITE data.*.kind      ON items TYPE string DEFAULT "string"
    ASSERT $value IN ["string", "number", "date", "list"];
DEFINE FIELD OVERWRITE data.*.prov      ON items TYPE string ASSERT $value IN ["auto", "user"];
DEFINE FIELD OVERWRITE resources    ON items TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE resources.*.uri    ON items TYPE string;
DEFINE FIELD OVERWRITE resources.*.name   ON items TYPE string;
DEFINE FIELD OVERWRITE resources.*.cached ON items TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE resources.*.contentHash ON items TYPE option<string>;
DEFINE FIELD OVERWRITE resources.*.size        ON items TYPE option<int>;
DEFINE FIELD OVERWRITE deleted_at   ON items TYPE option<datetime>;
DEFINE INDEX OVERWRITE items_date_added ON items FIELDS date_added;
DEFINE INDEX OVERWRITE items_name       ON items FIELDS data.name.value;

DEFINE TABLE IF NOT EXISTS connections SCHEMAFULL TYPE RELATION IN items OUT items ENFORCED;
DEFINE FIELD OVERWRITE label      ON connections TYPE option<record<labels>>;
DEFINE FIELD OVERWRITE position   ON connections TYPE option<object>;
DEFINE FIELD OVERWRITE position.x ON connections TYPE float;
DEFINE FIELD OVERWRITE position.y ON connections TYPE float;
DEFINE FIELD OVERWRITE `order`    ON connections TYPE option<int>;
DEFINE FIELD OVERWRITE child      ON connections TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE created_at ON connections TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE deleted_at ON connections TYPE option<datetime>;
DEFINE INDEX OVERWRITE conn_in    ON connections FIELDS in;
DEFINE INDEX OVERWRITE conn_out   ON connections FIELDS out;
DEFINE INDEX OVERWRITE conn_label ON connections FIELDS label;

DEFINE TABLE IF NOT EXISTS labels SCHEMAFULL;
DEFINE FIELD OVERWRITE name ON labels TYPE string;
DEFINE INDEX OVERWRITE labels_name ON labels FIELDS name UNIQUE;

-- A type's attribute list, as data: adding "movie" is writing a row, not
-- shipping code. `name` is what an item's `type` matches against.
DEFINE TABLE IF NOT EXISTS schemas SCHEMAFULL;
DEFINE FIELD OVERWRITE name  ON schemas TYPE string;
DEFINE FIELD OVERWRITE attributes ON schemas TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE attributes.*.attribute ON schemas TYPE string;
DEFINE FIELD OVERWRITE attributes.*.kind      ON schemas TYPE string DEFAULT "string"
    ASSERT $value IN ["string", "number", "date", "list"];
-- Shown in Focus's laid-out block when true; still extracted, stored,
-- and shown in the generic data list below it either way.
DEFINE FIELD OVERWRITE attributes.*.display ON schemas TYPE bool DEFAULT true;
DEFINE INDEX OVERWRITE schemas_name ON schemas FIELDS name UNIQUE;
