-- Authored by Karter Whitman using Claude Opus 4.8
-- PRODUCT-SPEC §1.1–1.3. Re-run at every launch, so every statement is
-- idempotent: tables use IF NOT EXISTS (never touch existing rows),
-- fields and indexes use OVERWRITE (so an edit here reaches an existing
-- store without a migration step).

DEFINE TABLE IF NOT EXISTS items SCHEMAFULL;
DEFINE FIELD OVERWRITE name         ON items TYPE string DEFAULT "";
DEFINE FIELD OVERWRITE display_name ON items TYPE option<string>;
DEFINE FIELD OVERWRITE date         ON items TYPE string;           -- YYYY-MM-DD
DEFINE FIELD OVERWRITE created_at   ON items TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE opens        ON items TYPE option<string>;   -- presentation override
DEFINE FIELD OVERWRITE query        ON items TYPE option<object> FLEXIBLE;  -- set-role predicate, §1.5
DEFINE FIELD OVERWRITE system       ON items TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE is_set       ON items TYPE bool DEFAULT false;  -- deliberately created as a set, before it has a query or any members
DEFINE FIELD OVERWRITE type         ON items TYPE option<string>;  -- classification, names a schemas row
DEFINE FIELD OVERWRITE type_source  ON items TYPE option<string>    -- who decided `type`; null while untyped
    ASSERT $value = NONE OR $value IN ["auto", "user"];
DEFINE FIELD OVERWRITE fields       ON items TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE fields.*.name  ON items TYPE string;
DEFINE FIELD OVERWRITE fields.*.value ON items TYPE string | array<string>;  -- array: the "list" kind
DEFINE FIELD OVERWRITE fields.*.kind  ON items TYPE string DEFAULT "string"
    ASSERT $value IN ["string", "number", "date", "list"];
DEFINE FIELD OVERWRITE resources    ON items TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE resources.*.uri    ON items TYPE string;
DEFINE FIELD OVERWRITE resources.*.name   ON items TYPE string;
DEFINE FIELD OVERWRITE resources.*.cached ON items TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE resources.*.contentHash ON items TYPE option<string>;
DEFINE FIELD OVERWRITE resources.*.size        ON items TYPE option<int>;
DEFINE FIELD OVERWRITE deleted_at   ON items TYPE option<datetime>;
DEFINE INDEX OVERWRITE items_date    ON items FIELDS date;
DEFINE INDEX OVERWRITE items_created ON items FIELDS created_at;

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

-- A type's field list, as data: adding "movie" is writing a row, not
-- shipping code. `name` is what an item's `type` matches against.
DEFINE TABLE IF NOT EXISTS schemas SCHEMAFULL;
DEFINE FIELD OVERWRITE name  ON schemas TYPE string;
DEFINE FIELD OVERWRITE label ON schemas TYPE option<string>;
DEFINE FIELD OVERWRITE fields ON schemas TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE fields.*.name  ON schemas TYPE string;
DEFINE FIELD OVERWRITE fields.*.label ON schemas TYPE option<string>;
DEFINE FIELD OVERWRITE fields.*.kind  ON schemas TYPE string DEFAULT "string"
    ASSERT $value IN ["string", "number", "date", "list"];
-- At most one per schema (enforced on write, records/schemas.ts): the
-- field that *is* the item's name rather than a row beside it.
DEFINE FIELD OVERWRITE fields.*.is_name ON schemas TYPE bool DEFAULT false;
DEFINE INDEX OVERWRITE schemas_name ON schemas FIELDS name UNIQUE;
