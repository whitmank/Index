-- Authored by Karter Whitman using Claude Opus 4.8
-- PRODUCT-SPEC §1.1–1.3. Re-run at every launch, so every statement is
-- idempotent: tables use IF NOT EXISTS (never touch existing rows),
-- fields and indexes use OVERWRITE (so an edit here reaches an existing
-- store without a migration step).

DEFINE TABLE IF NOT EXISTS items SCHEMAFULL;
DEFINE FIELD OVERWRITE name         ON items TYPE string DEFAULT "";
DEFINE FIELD OVERWRITE display_name ON items TYPE option<string>;
DEFINE FIELD OVERWRITE description  ON items TYPE option<string>;   -- what the user said this is, at intake
-- date_added: immutable, when the item entered the index — absorbs what
-- used to be the separate `created_at`. date_created: mutable, intrinsic
-- to the resource itself (a photo's shot date, a book's publication
-- date) — optional, since it's rarely known at intake, and never
-- inferred yet.
DEFINE FIELD OVERWRITE date_added   ON items TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE date_created ON items TYPE option<datetime>;
DEFINE FIELD OVERWRITE opens        ON items TYPE option<string>;   -- presentation override
DEFINE FIELD OVERWRITE query        ON items TYPE option<object> FLEXIBLE;  -- set-role predicate, §1.5
DEFINE FIELD OVERWRITE system       ON items TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE is_set       ON items TYPE bool DEFAULT false;  -- deliberately created as a set, before it has a query or any members
DEFINE FIELD OVERWRITE type         ON items TYPE option<object>;  -- classification, names a schemas row, and who decided it, atomically
DEFINE FIELD OVERWRITE type.value   ON items TYPE string;
DEFINE FIELD OVERWRITE type.prov    ON items TYPE string ASSERT $value IN ["auto", "user"];
DEFINE FIELD OVERWRITE metadata       ON items TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE metadata.*.attribute ON items TYPE option<string>;  -- absent: a freeform tag
DEFINE FIELD OVERWRITE metadata.*.value     ON items TYPE string | array<string>;  -- array: the "list" kind
DEFINE FIELD OVERWRITE metadata.*.kind      ON items TYPE string DEFAULT "string"
    ASSERT $value IN ["string", "number", "date", "list"];
DEFINE FIELD OVERWRITE metadata.*.prov      ON items TYPE string ASSERT $value IN ["auto", "user"];
DEFINE FIELD OVERWRITE resources    ON items TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE resources.*.uri    ON items TYPE string;
DEFINE FIELD OVERWRITE resources.*.name   ON items TYPE string;
DEFINE FIELD OVERWRITE resources.*.cached ON items TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE resources.*.contentHash ON items TYPE option<string>;
DEFINE FIELD OVERWRITE resources.*.size        ON items TYPE option<int>;
DEFINE FIELD OVERWRITE deleted_at   ON items TYPE option<datetime>;
DEFINE INDEX OVERWRITE items_date_added   ON items FIELDS date_added;
DEFINE INDEX OVERWRITE items_date_created ON items FIELDS date_created;

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
-- and shown in the generic metadata list below it either way.
DEFINE FIELD OVERWRITE attributes.*.display ON schemas TYPE bool DEFAULT true;
DEFINE INDEX OVERWRITE schemas_name ON schemas FIELDS name UNIQUE;
