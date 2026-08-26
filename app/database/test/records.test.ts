// Authored by Karter Whitman using Claude Opus 4.8
// The regression anchor (IMPLEMENTATION-PLAN, "verification habits"): no
// Electron, a throwaway store on its own port, and one pass through the
// change model — create, rename, tag, place, delete, undo — asserting the
// reads after every step. Extend it as the change catalog grows; run it
// before any commit that touches database or changes code.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyChange,
  connectionId,
  ensureTypeSpace,
  findConnection,
  findDedicatedSpace,
  getItem,
  getItemDetail,
  getItemIncludingDeleted,
  invert,
  isSystemId,
  itemId,
  listDataAttributes,
  listMembers,
  listSchemas,
  listSets,
  schemaFor,
  searchItems,
  startDatabase,
  ulid,
  upsertSchema,
  HOME_SET_ID,
  MEMBER_OF_LABEL_ID,
  PUBLIC_SET_ID,
  SPACES_SET_ID,
  type Change,
  type Connection,
  type Data,
  type DataEntry,
  type Item,
  type Resource,
  type SetState,
} from "../src/index.js";

const TEST_PORT = 8499;
const store = fs.mkdtempSync(path.join(os.tmpdir(), "index-db-test-"));

let passed = 0;

function check(what: string, assertion: () => void): void {
  assertion();
  passed += 1;
  console.log(`  ✓ ${what}`);
}

/** Just the name — the common case. */
function nameOf(item: Item): string {
  return item.data.name.value as string;
}

function blankItem(overrides: {
  name?: string;
  entries?: DataEntry[];
  set?: SetState | false;
  date_added?: string;
  resources?: Resource[];
} = {}): Item {
  const data: Data = { name: { attribute: "name", value: overrides.name ?? "", kind: "string", prov: "user" } };
  for (const entry of overrides.entries ?? []) {
    data[entry.attribute ? entry.attribute.toLowerCase() : ulid()] = entry;
  }
  return {
    id: itemId(),
    date_added: overrides.date_added ?? new Date().toISOString(),
    layout: "default",
    set: overrides.set ?? false,
    data,
    resources: overrides.resources ?? [],
    deleted_at: null,
  };
}

function blankArrow(source: string, target: string, overrides: Partial<Connection> = {}): Connection {
  return {
    id: connectionId(),
    source,
    target,
    label: null,
    position: null,
    order: null,
    child: false,
    created_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const handle = await startDatabase({ directory: store, port: TEST_PORT });

  try {
    console.log("\nseeds");
    const home = await getItem(HOME_SET_ID);
    const publicSet = await getItem(PUBLIC_SET_ID);
    const spacesSet = await getItem(SPACES_SET_ID);
    check("~ exists and is a system item", () => {
      assert.ok(home, "~ missing");
      assert.equal(home.id, HOME_SET_ID);
      // The id is still `~`; the name is what the set list calls it.
      assert.equal(nameOf(home), "All");
      assert.ok(isSystemId(home.id));
      assert.deepEqual(home.set, { all: true });
    });
    check("public exists as a deliberate set with no filter", () => {
      assert.ok(publicSet, "public missing");
      assert.equal(publicSet.id, PUBLIC_SET_ID);
      assert.ok(isSystemId(publicSet.id));
      assert.equal(publicSet.set, true);
    });
    check("spaces exists, ~'s complement over the same query", () => {
      assert.ok(spacesSet, "spaces missing");
      assert.equal(spacesSet.id, SPACES_SET_ID);
      assert.equal(nameOf(spacesSet), "Spaces");
      assert.ok(isSystemId(spacesSet.id));
      assert.deepEqual(spacesSet.set, { all: true });
    });

    console.log("\ncreate");
    const photo = blankItem({
      name: "hallway",
      resources: [{ uri: "mbp:///Users/k/hallway.jpg", name: "hallway.jpg" }],
    });
    const create: Change = { description: "Create item", pairs: [{ before: null, after: photo }] };
    await applyChange(create);

    const stored = await getItem(photo.id);
    check("created item is readable", () => {
      assert.ok(stored, "created item not found");
      assert.equal(stored.id, photo.id);
      assert.equal(nameOf(stored), "hallway");
      assert.equal(stored.resources[0]?.uri, "mbp:///Users/k/hallway.jpg");
    });
    const homeMembers = await listMembers(HOME_SET_ID);
    check("~ lists it, and lists no system items", () => {
      assert.ok(homeMembers.items.some((item) => item.id === photo.id));
      assert.ok(!homeMembers.items.some((item) => isSystemId(item.id)));
    });

    console.log("\nrename");
    const renamed: Item = {
      ...stored!,
      data: { ...stored!.data, name: { ...stored!.data.name, value: "hallway, morning" } },
    };
    await applyChange({
      description: "Rename to 'hallway, morning'",
      pairs: [{ before: stored!, after: renamed }],
    });
    const afterRename = await getItem(photo.id);
    check("rename landed", () => {
      assert.equal(afterRename && nameOf(afterRename), "hallway, morning");
      assert.equal(afterRename?.date_added, stored!.date_added);
    });

    console.log("\ntag");
    // One change, two pairs: the tag target is minted alongside the arrow
    // that points at it (PRODUCT-SPEC §3.3, `tag`).
    const album = blankItem({ name: "hallway series" });
    const arrow = blankArrow(photo.id, album.id, { label: MEMBER_OF_LABEL_ID });
    const tag: Change = {
      description: "Tag as 'hallway series'",
      pairs: [
        { before: null, after: album },
        { before: null, after: arrow },
      ],
    };
    await applyChange(tag);

    const detail = await getItemDetail(photo.id);
    check("the arrow is outbound from the item, resolved to its target", () => {
      assert.equal(detail?.outbound.length, 1);
      assert.equal(detail?.outbound[0]?.endpoint.id, album.id);
      assert.equal(detail?.outbound[0]?.connection.label, MEMBER_OF_LABEL_ID);
    });

    const albumMembers = await listMembers(album.id);
    check("the item is a member of the set it was tagged into", () => {
      assert.equal(albumMembers.items.length, 1);
      assert.equal(albumMembers.items[0]?.id, photo.id);
      assert.equal(albumMembers.arrows.length, 1);
    });

    const existing = await findConnection(photo.id, album.id, MEMBER_OF_LABEL_ID);
    check("findConnection returns exactly that arrow", () => {
      assert.equal(existing?.id, arrow.id);
    });

    console.log("\nplace");
    const placed: Connection = { ...existing!, position: { x: 120.5, y: -40 } };
    await applyChange({
      description: "Place in 'hallway series'",
      pairs: [{ before: existing!, after: placed }],
    });
    const afterPlace = await findConnection(photo.id, album.id, MEMBER_OF_LABEL_ID);
    check("the position rides on the arrow, and no second arrow appeared", () => {
      assert.deepEqual(afterPlace?.position, { x: 120.5, y: -40 });
      assert.equal(afterPlace?.id, arrow.id);
    });

    console.log("\ndelete (soft)");
    const now = new Date().toISOString();
    const liveItem = await getItem(photo.id);
    const liveArrow = await findConnection(photo.id, album.id, MEMBER_OF_LABEL_ID);
    const remove: Change = {
      description: "Delete 'hallway, morning'",
      pairs: [
        { before: liveItem!, after: { ...liveItem!, deleted_at: now } },
        { before: liveArrow!, after: { ...liveArrow!, deleted_at: now } },
      ],
    };
    await applyChange(remove);

    const gone = await getItem(photo.id);
    const goneArrow = await findConnection(photo.id, album.id, MEMBER_OF_LABEL_ID);
    const homeAfterDelete = await listMembers(HOME_SET_ID);
    const albumAfterDelete = await listMembers(album.id);
    check("soft delete hides the item, its arrow, and its memberships", () => {
      assert.equal(gone, null);
      assert.equal(goneArrow, null);
      assert.ok(!homeAfterDelete.items.some((item) => item.id === photo.id));
      assert.equal(albumAfterDelete.items.length, 0);
      assert.equal(albumAfterDelete.arrows.length, 0);
    });

    const stillThere = await getItemIncludingDeleted(photo.id);
    check("the record is still on disk, flagged, waiting for the GC", () => {
      assert.ok(stillThere);
      assert.ok(stillThere.deleted_at);
    });

    console.log("\nundo the delete");
    await applyChange(invert(remove));
    const restored = await getItem(photo.id);
    const restoredArrow = await findConnection(photo.id, album.id, MEMBER_OF_LABEL_ID);
    check("undo restores the item and its connections symmetrically", () => {
      assert.equal(restored && nameOf(restored), "hallway, morning");
      assert.equal(restored?.deleted_at, null);
      assert.equal(restoredArrow?.id, arrow.id);
      assert.deepEqual(restoredArrow?.position, { x: 120.5, y: -40 });
    });

    console.log("\nundo the tag, then the create");
    await applyChange(invert(tag));
    const albumGone = await getItemIncludingDeleted(album.id);
    const arrowGone = await findConnection(photo.id, album.id, MEMBER_OF_LABEL_ID);
    check("the tag target and its arrow are gone, not flagged", () => {
      assert.equal(albumGone, null);
      assert.equal(arrowGone, null);
    });

    await applyChange(invert({ description: "Rename", pairs: [{ before: stored!, after: renamed }] }));
    const unrenamed = await getItem(photo.id);
    check("undoing the rename puts the old name back", () => {
      assert.equal(unrenamed && nameOf(unrenamed), "hallway");
    });

    await applyChange(invert(create));
    const nothing = await getItemIncludingDeleted(photo.id);
    check("the item is fully gone", () => {
      assert.equal(nothing, null);
    });

    console.log("\nquery predicates");
    const dated = blankItem({ name: "old note", date_added: "2020-01-01" });
    const recent = blankItem({
      name: "new note",
      date_added: "2026-07-20",
      entries: [{ attribute: "year", value: "1999", kind: "number", prov: "auto" }],
      resources: [{ uri: "https://example.com/a", name: "example" }],
    });
    await applyChange({
      description: "Seed query fixtures",
      pairs: [
        { before: null, after: dated },
        { before: null, after: recent },
      ],
    });

    const rangeSet = blankItem({
      name: "since 2026",
      set: { and: [{ date: { gte: "2026-01-01" } }] },
    });
    const webSet = blankItem({ name: "on the web", set: { and: [{ device: "web" }] } });
    const linkSet = blankItem({ name: "links", set: { and: [{ format: "link" }] } });
    const yearSet = blankItem({
      name: "released in the nineties",
      set: { and: [{ data: { attribute: "year", kind: "number", gte: "1990", lte: "1999" } }] },
    });
    await applyChange({
      description: "Seed query sets",
      pairs: [rangeSet, webSet, linkSet, yearSet].map((item) => ({ before: null, after: item })),
    });

    const inRange = await listMembers(rangeSet.id);
    check("a date predicate excludes the older item", () => {
      assert.ok(inRange.items.some((item) => item.id === recent.id));
      assert.ok(!inRange.items.some((item) => item.id === dated.id));
    });

    const onWeb = await listMembers(webSet.id);
    check("a device predicate matches the resource authority", () => {
      assert.deepEqual(
        onWeb.items.map((item) => item.id),
        [recent.id],
      );
    });

    const links = await listMembers(linkSet.id);
    check("a format predicate matches the derived format", () => {
      assert.deepEqual(
        links.items.map((item) => item.id),
        [recent.id],
      );
    });

    const nineties = await listMembers(yearSet.id);
    check("a numeric field predicate compares numerically", () => {
      assert.deepEqual(
        nineties.items.map((item) => item.id),
        [recent.id],
      );
    });

    console.log("\ntimeline partition");
    const july = await listMembers(HOME_SET_ID, { partition: { date: "2026-07-20" } });
    const january = await listMembers(HOME_SET_ID, { partition: { date: "2020-01-01" } });
    check("a partition returns one day's page", () => {
      assert.ok(july.items.some((item) => item.id === recent.id));
      assert.ok(!july.items.some((item) => item.id === dated.id));
      assert.deepEqual(
        january.items.map((item) => item.id),
        [dated.id],
      );
    });

    console.log("\nconnections between members (canvas edges)");
    const setForEdges = blankItem({ name: "a canvas of two" });
    const first = blankItem({ name: "first" });
    const second = blankItem({ name: "second" });
    const firstArrow = blankArrow(first.id, setForEdges.id, { label: MEMBER_OF_LABEL_ID });
    const secondArrow = blankArrow(second.id, setForEdges.id, { label: MEMBER_OF_LABEL_ID });
    await applyChange({
      description: "Seed a set of two",
      pairs: [
        { before: null, after: setForEdges },
        { before: null, after: first },
        { before: null, after: second },
        { before: null, after: firstArrow },
        { before: null, after: secondArrow },
      ],
    });

    const edge = blankArrow(first.id, second.id);
    const connect: Change = {
      description: "Connect the two",
      pairs: [{ before: null, after: edge }],
    };
    await applyChange(connect);

    const withEdge = await listMembers(setForEdges.id);
    check("a connection between two members comes back as an edge", () => {
      assert.equal(withEdge.connections.length, 1);
      assert.equal(withEdge.connections[0]?.id, edge.id);
      assert.equal(withEdge.connections[0]?.source, first.id);
      assert.equal(withEdge.connections[0]?.target, second.id);
    });
    check("the set's own arrows stay just the two placements", () => {
      assert.equal(withEdge.arrows.length, 2);
      assert.ok(!withEdge.arrows.some((arrow) => arrow.id === edge.id));
    });

    await applyChange(invert(connect));
    const withoutEdge = await listMembers(setForEdges.id);
    check("undoing the connection takes the edge away, not the members", () => {
      assert.equal(withoutEdge.connections.length, 0);
      assert.equal(withoutEdge.items.length, 2);
    });

    console.log("\nchild connections (hierarchy is a client concern)");
    const book = blankItem({ name: "a book" });
    const chapter = blankItem({ name: "a chapter" });
    const childLink = blankArrow(book.id, chapter.id, { child: true });
    await applyChange({
      description: "Seed a parent/child pair",
      pairs: [
        { before: null, after: book },
        { before: null, after: chapter },
        { before: null, after: childLink },
      ],
    });

    const homeWithHierarchy = await listMembers(HOME_SET_ID);
    check("a child connection leaves backend membership untouched — both are plain members", () => {
      assert.ok(homeWithHierarchy.items.some((item) => item.id === book.id));
      assert.ok(homeWithHierarchy.items.some((item) => item.id === chapter.id));
    });

    const readBack = await findConnection(book.id, chapter.id, null);
    check("the connection round-trips with child: true", () => {
      assert.equal(readBack?.child, true);
    });

    console.log("\nqueries: an attribute name is a key, not content");

    // Attributes arrive capitalised however a type declares them, however
    // the Spotify import writes them, and however they were typed into a
    // row — so a predicate naming one has to find it whichever case it
    // wears.
    const tome = blankItem({
      name: "Flatland",
      entries: [
        { attribute: "Author", value: "Edwin Abbott Abbott", kind: "string", prov: "auto" },
        { attribute: "published", value: "1884-01-01", kind: "date", prov: "auto" },
      ],
    });
    const shelfLower = blankItem({
      name: "by author",
      set: { and: [{ data: { attribute: "author", kind: "string", eq: "Edwin Abbott Abbott" } }] },
    });
    const shelfUpper = blankItem({
      name: "by published",
      set: { and: [{ data: { attribute: "PUBLISHED", kind: "date", gte: "1800-01-01" } }] },
    });
    await applyChange({
      description: "A book and two shelves that ask for it",
      pairs: [tome, shelfLower, shelfUpper].map((after) => ({ before: null, after })),
    });

    const lowerAsked = await listMembers(shelfLower.id);
    const upperAsked = await listMembers(shelfUpper.id);

    check("a predicate finds an attribute whatever case either side wears", () => {
      // `author` asked for by a set, stored on the item as `Author`.
      assert.ok(lowerAsked.items.some((found) => found.id === tome.id));
      // And the other direction: `PUBLISHED` asked for, `published` stored.
      assert.ok(upperAsked.items.some((found) => found.id === tome.id));
    });

    console.log("\nSpace: nested boolean queries (or/not/nesting)");

    const anAlbum = blankItem({
      name: "In Rainbows",
      entries: [{ attribute: "type", value: "album", kind: "string", prov: "auto" }],
    });
    const aSong = blankItem({
      name: "Bodysnatchers",
      entries: [{ attribute: "type", value: "song", kind: "string", prov: "auto" }],
    });
    const anArtist = blankItem({
      name: "Radiohead",
      entries: [{ attribute: "type", value: "artist", kind: "string", prov: "auto" }],
    });
    const aBook = blankItem({
      name: "Dune",
      entries: [{ attribute: "type", value: "book", kind: "string", prov: "auto" }],
    });
    const aVideo = blankItem({
      name: "a clip",
      entries: [{ attribute: "type", value: "video", kind: "string", prov: "auto" }],
    });
    await applyChange({
      description: "Seed a small music/media shelf",
      pairs: [anAlbum, aSong, anArtist, aBook, aVideo].map((after) => ({ before: null, after })),
    });

    const musicSpace = blankItem({
      name: "Music",
      set: {
        or: [
          { data: { attribute: "type", kind: "string", eq: "album" } },
          { data: { attribute: "type", kind: "string", eq: "song" } },
          { data: { attribute: "type", kind: "string", eq: "artist" } },
        ],
      },
    });
    const notVideoSpace = blankItem({
      name: "not video",
      set: { not: { data: { attribute: "type", kind: "string", eq: "video" } } },
    });
    await applyChange({
      description: "Seed the Music and not-video spaces",
      pairs: [musicSpace, notVideoSpace].map((after) => ({ before: null, after })),
    });

    const musicMembers = await listMembers(musicSpace.id);
    check("an OR across three data predicates matches any of them", () => {
      const ids = musicMembers.items.map((item) => item.id);
      assert.ok(ids.includes(anAlbum.id) && ids.includes(aSong.id) && ids.includes(anArtist.id));
      assert.ok(!ids.includes(aBook.id) && !ids.includes(aVideo.id));
    });

    const notVideoMembers = await listMembers(notVideoSpace.id);
    check("a bare NOT excludes exactly the matching item", () => {
      const ids = notVideoMembers.items.map((item) => item.id);
      assert.ok(!ids.includes(aVideo.id));
      assert.ok(ids.includes(aBook.id) && ids.includes(anAlbum.id));
    });

    console.log("\nSpace: type matching ignores case, and membership marks pinned members");

    const bookSpace = blankItem({
      name: "Books",
      // Capitalised, the way a schema name is typically typed by hand —
      // `aBook`'s own type entry above is the classifier's lowercase
      // "book". The rule has to find it anyway (derive.ts's sameTypeName).
      set: { data: { attribute: "type", kind: "string", eq: "Book" } },
    });
    await applyChange({ description: "Seed the Books space", pairs: [{ before: null, after: bookSpace }] });

    const bookMembers = await listMembers(bookSpace.id);
    check("a capitalised rule value still matches a lowercase classified type", () => {
      assert.ok(bookMembers.items.some((item) => item.id === aBook.id));
    });

    const videoPinnedIntoMusic = blankArrow(aVideo.id, musicSpace.id, { label: MEMBER_OF_LABEL_ID });
    await applyChange({
      description: "Pin the video into Music by hand, against its own rule",
      pairs: [{ before: null, after: videoPinnedIntoMusic }],
    });

    const musicAfterPin = await listMembers(musicSpace.id);
    check("a member admitted only by a pinned arrow is flagged; one the rule matches isn't", () => {
      assert.ok(musicAfterPin.items.some((item) => item.id === aVideo.id), "the pinned video shows up as a member");
      assert.ok(musicAfterPin.pinnedIds.includes(aVideo.id), "…and is flagged pinned");
      assert.ok(!musicAfterPin.pinnedIds.includes(anAlbum.id), "a plain rule match isn't flagged pinned");
    });

    console.log("\nSpace: a condition still being written doesn't veto the ones that aren't");

    // The rule builder's own default draft — no attribute chosen, no
    // value typed — round-tripped through the exact shape it compiles
    // to (RuleBuilder.tsx's `blankPredicate`), ANDed onto a working
    // condition the way "+ condition" appends a new row to an existing
    // group.
    const stillWritingSpace = blankItem({
      name: "Books, mid-edit",
      set: {
        and: [
          { data: { attribute: "type", kind: "string", eq: "book" } },
          { data: { attribute: undefined, kind: "string", eq: "" } },
        ],
      },
    });
    await applyChange({
      description: "Seed a Space with one finished condition and one still-blank",
      pairs: [{ before: null, after: stillWritingSpace }],
    });

    const stillWritingMembers = await listMembers(stillWritingSpace.id);
    check("an unfinished AND'd condition is inert, not a silent veto", () => {
      assert.ok(
        stillWritingMembers.items.some((item) => item.id === aBook.id),
        "the finished condition alone should have been enough to match",
      );
    });

    const blankDateSpace = blankItem({
      name: "everything, mid-edit",
      // Mirrors a freshly-added date row before a bound is typed in —
      // RuleBuilder.tsx starts one at `{ gte: "" }`.
      set: { date: { lte: "" } },
    });
    await applyChange({ description: "Seed a Space with only a blank date bound", pairs: [{ before: null, after: blankDateSpace }] });

    const blankDateMembers = await listMembers(blankDateSpace.id);
    check("a date bound with no value typed in yet excludes nothing", () => {
      assert.ok(blankDateMembers.items.some((item) => item.id === aBook.id));
      assert.ok(blankDateMembers.items.some((item) => item.id === anAlbum.id));
    });

    const jRockAlbum = blankItem({
      name: "Kimi no Machi",
      entries: [
        { attribute: "genre", value: ["rock", "alternative"], kind: "list", prov: "auto" },
        { attribute: "lang", value: "Japanese", kind: "string", prov: "auto" },
      ],
    });
    const englishRock = blankItem({
      name: "an english rock album",
      entries: [
        { attribute: "genre", value: ["rock"], kind: "list", prov: "auto" },
        { attribute: "lang", value: "English", kind: "string", prov: "auto" },
      ],
    });
    await applyChange({
      description: "Seed a J-rock fixture and a decoy",
      pairs: [jRockAlbum, englishRock].map((after) => ({ before: null, after })),
    });

    const jRockSpace = blankItem({
      name: "J-rock",
      set: {
        and: [
          { data: { attribute: "genre", kind: "list", eq: "rock" } },
          { data: { attribute: "lang", kind: "string", eq: "Japanese" } },
        ],
      },
    });
    await applyChange({ description: "Seed the J-rock space", pairs: [{ before: null, after: jRockSpace }] });

    const jRockMembers = await listMembers(jRockSpace.id);
    check("a list-kind attribute matches on any element, nested inside an AND", () => {
      const ids = jRockMembers.items.map((item) => item.id);
      assert.ok(ids.includes(jRockAlbum.id));
      assert.ok(!ids.includes(englishRock.id));
    });

    console.log("\n~ excludes Spaces (they're organizing tools, not entries)");

    const allSpaces = [
      rangeSet,
      webSet,
      linkSet,
      yearSet,
      shelfLower,
      shelfUpper,
      musicSpace,
      notVideoSpace,
      jRockSpace,
    ];

    const homeAfterSpaces = await listMembers(HOME_SET_ID);
    check("~ hides every Space seeded above, but keeps the plain items", () => {
      const ids = homeAfterSpaces.items.map((item) => item.id);
      for (const space of allSpaces) {
        assert.ok(!ids.includes(space.id), `${space.id} (a Space) should not be in ~`);
      }
      assert.ok(ids.includes(anAlbum.id) && ids.includes(tome.id) && ids.includes(jRockAlbum.id));
    });

    console.log("\nspaces: the mirror feed — only the Spaces, none of the plain items");

    const spacesMembers = await listMembers(SPACES_SET_ID);
    check("spaces lists every Space seeded above, and no plain item", () => {
      const ids = spacesMembers.items.map((item) => item.id);
      for (const space of allSpaces) {
        assert.ok(ids.includes(space.id), `${space.id} (a Space) should be in spaces`);
      }
      assert.ok(!ids.includes(anAlbum.id) && !ids.includes(tome.id) && !ids.includes(jRockAlbum.id));
      assert.ok(!ids.some((id) => isSystemId(id)), "spaces does not list ~, public, or itself");
    });

    console.log("\nsearch and set matching agree (one shared evaluator)");

    const bySearch = await searchItems("Radiohead");
    check("searchItems finds by substring, case-insensitively", () => {
      assert.ok(bySearch.some((item) => item.id === anArtist.id));
    });

    const attributes = await listDataAttributes();
    check("listDataAttributes surfaces attributes actually in use", () => {
      assert.ok(attributes.includes("type"));
      assert.ok(attributes.includes("genre"));
      assert.ok(attributes.includes("lang"));
      // Freeform tags (attribute: null) never contribute a suggestion.
      assert.ok(!attributes.includes(""));
    });

    console.log("\nschemas: attribute order is the naming order");

    // `attributes[0]` is the item's name (types.ts), so the order a type
    // is saved in is load-bearing and not merely cosmetic — this is the
    // one place it round-trips through real storage.
    const saved = await upsertSchema({
      name: "book",
      attributes: [
        { attribute: "title", kind: "string", display: true },
        { attribute: "author", kind: "string", display: true },
      ],
    });

    check("a type keeps the order its attributes were written in", () => {
      assert.deepEqual(saved.attributes.map((attribute) => attribute.attribute), ["title", "author"]);
    });

    const reordered = await upsertSchema({
      name: "book",
      attributes: [
        { attribute: "author", kind: "string", display: true },
        { attribute: "title", kind: "string", display: true },
      ],
    });

    check("reordering it is what changes which attribute names the item", () => {
      assert.deepEqual(reordered.attributes.map((attribute) => attribute.attribute), ["author", "title"]);
    });

    // `display` is the kind of property that gets dropped in transit and
    // fails silently — it typechecks everywhere and simply never arrives.
    const withHidden = await upsertSchema({
      name: "book",
      attributes: [
        { attribute: "title", kind: "string", display: true },
        { attribute: "author", kind: "string", display: true },
        { attribute: "isbn", kind: "string", display: false },
      ],
    });

    // `ORDER BY name ASC` sorts by codepoint, so a type created as `Song`
    // came back ahead of one created as `album` — and the renderer then
    // re-sorted with localeCompare after any save, so the list arrived in
    // one order and jumped to another the first time it was touched.
    await upsertSchema({ name: "Song", attributes: [] });
    await upsertSchema({ name: "album", attributes: [] });
    const mixedCase = await listSchemas();

    check("a mixed-case list comes back in one alphabetical order", () => {
      assert.deepEqual(
        mixedCase.map((schema) => schema.name),
        ["album", "book", "Song"],
      );
      // The comparator the renderer's own merge uses, so the two agree.
      assert.deepEqual(
        [...mixedCase].sort((a, b) => a.name.localeCompare(b.name)).map((s) => s.name),
        mixedCase.map((schema) => schema.name),
      );
    });

    check("a lowercase type still finds a capitalised schema", () => {
      // The live case: the Spotify import writes `type: "song"` and this
      // schema was created as `Song`, which an exact match never finds.
      assert.equal(schemaFor(mixedCase, "song")?.name, "Song");
      assert.equal(schemaFor(mixedCase, "Song")?.name, "Song");
      assert.equal(schemaFor(mixedCase, "playlist"), undefined);
      assert.equal(schemaFor(mixedCase, null), undefined);
    });

    check("a non-displayed attribute round-trips that way, and its neighbours don't", () => {
      assert.deepEqual(
        withHidden.attributes.map((attribute) => attribute.display),
        [true, true, false],
      );
    });

    console.log("\nevery type gets its own dedicated Space");

    const bookDedicated = await findDedicatedSpace("book");
    check("creating 'book' found the hand-built Books space rather than duplicating it", () => {
      // `bookSpace` was hand-built earlier in this run (`type is Book`,
      // capitalised) before the "book" schema — created just above — ever
      // existed. The schema's own dedicated-Space step has to find that
      // one, not mint a second.
      assert.equal(bookDedicated?.id, bookSpace.id);
    });

    const songSpace = await findDedicatedSpace("Song");
    check("a type with no pre-existing dedicated Space gets a fresh one", () => {
      assert.ok(songSpace, "the 'Song' schema minted its own Space");
    });

    check("...named as the plural of the type, matching how hand-built ones are named", () => {
      assert.equal(songSpace?.data.name.value, "Songs");
    });

    const songSpaceMembers = songSpace ? await listMembers(songSpace.id) : null;
    check("...and that Space's rule actually matches items of the type", () => {
      assert.ok(songSpaceMembers?.items.some((item) => item.id === aSong.id));
    });

    const beforeReupsert = (await listSets()).length;
    await upsertSchema({ name: "Song", attributes: [{ attribute: "duration", kind: "duration", display: true }] });
    const afterReupsert = (await listSets()).length;
    check("editing an existing type's fields again doesn't mint a second Space", () => {
      assert.equal(afterReupsert, beforeReupsert);
    });

    // Two types minted back to back, neither with a pre-existing Space —
    // regression coverage for typeSpaceId's own bug (a bare `-` in a
    // record id, silently truncated by SurrealDB, once collapsed every
    // type's deterministic id onto the same row).
    const firstCreated = await ensureTypeSpace("comic");
    const secondCreated = await ensureTypeSpace("zine");
    const comicSpace = await findDedicatedSpace("comic");
    const zineSpace = await findDedicatedSpace("zine");
    check("two distinct types each actually get their own Space, not one shared row", () => {
      assert.ok(firstCreated && secondCreated, "both calls report having created something");
      assert.ok(comicSpace && zineSpace, "both Spaces exist");
      assert.notEqual(comicSpace?.id, zineSpace?.id);
    });

    console.log(`\n${passed} assertions passed\n`);
  } finally {
    await handle.stop();
    fs.rmSync(store, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("\n✗ ", error);
  fs.rmSync(store, { recursive: true, force: true });
  process.exit(1);
});
