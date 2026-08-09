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
  findConnection,
  getItem,
  getItemDetail,
  getItemIncludingDeleted,
  invert,
  itemId,
  listMembers,
  startDatabase,
  HOME_SET_ID,
  PUBLIC_SET_ID,
  type Change,
  type Connection,
  type Item,
} from "../src/index.js";

const TEST_PORT = 8499;
const store = fs.mkdtempSync(path.join(os.tmpdir(), "index-db-test-"));

let passed = 0;

function check(what: string, assertion: () => void): void {
  assertion();
  passed += 1;
  console.log(`  ✓ ${what}`);
}

function blankItem(overrides: Partial<Item> = {}): Item {
  return {
    id: itemId(),
    name: "",
    display_name: null,
    date: "2026-07-20",
    created_at: new Date().toISOString(),
    opens: null,
    query: null,
    system: false,
    is_set: false,
    type: null,
    fields: [],
    resources: [],
    deleted_at: null,
    ...overrides,
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
    check("~ exists and is a system item", () => {
      assert.ok(home, "~ missing");
      assert.equal(home.id, HOME_SET_ID);
      // The id is still `~`; the name is what the set list calls it.
      assert.equal(home.name, "All");
      assert.equal(home.system, true);
      assert.deepEqual(home.query, { all: true });
    });
    check("public exists with no query", () => {
      assert.ok(publicSet, "public missing");
      assert.equal(publicSet.id, PUBLIC_SET_ID);
      assert.equal(publicSet.system, true);
      assert.equal(publicSet.query, null);
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
      assert.equal(stored.name, "hallway");
      assert.equal(stored.resources[0]?.uri, "mbp:///Users/k/hallway.jpg");
    });
    const homeMembers = await listMembers(HOME_SET_ID);
    check("~ lists it, and lists no system items", () => {
      assert.ok(homeMembers.items.some((item) => item.id === photo.id));
      assert.ok(!homeMembers.items.some((item) => item.system));
    });

    console.log("\nrename");
    const renamed: Item = { ...stored!, name: "hallway, morning" };
    await applyChange({
      description: "Rename to 'hallway, morning'",
      pairs: [{ before: stored!, after: renamed }],
    });
    const afterRename = await getItem(photo.id);
    check("rename landed", () => {
      assert.equal(afterRename?.name, "hallway, morning");
      assert.equal(afterRename?.created_at, stored!.created_at);
    });

    console.log("\ntag");
    // One change, two pairs: the tag target is minted alongside the arrow
    // that points at it (PRODUCT-SPEC §3.3, `tag`).
    const album = blankItem({ name: "hallway series" });
    const arrow = blankArrow(photo.id, album.id);
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
      assert.equal(detail?.outbound[0]?.connection.label, null);
    });

    const albumMembers = await listMembers(album.id);
    check("the item is a member of the set it was tagged into", () => {
      assert.equal(albumMembers.items.length, 1);
      assert.equal(albumMembers.items[0]?.id, photo.id);
      assert.equal(albumMembers.arrows.length, 1);
    });

    const existing = await findConnection(photo.id, album.id, null);
    check("findConnection returns exactly that arrow", () => {
      assert.equal(existing?.id, arrow.id);
    });

    console.log("\nplace");
    const placed: Connection = { ...existing!, position: { x: 120.5, y: -40 } };
    await applyChange({
      description: "Place in 'hallway series'",
      pairs: [{ before: existing!, after: placed }],
    });
    const afterPlace = await findConnection(photo.id, album.id, null);
    check("the position rides on the arrow, and no second arrow appeared", () => {
      assert.deepEqual(afterPlace?.position, { x: 120.5, y: -40 });
      assert.equal(afterPlace?.id, arrow.id);
    });

    console.log("\ndelete (soft)");
    const now = new Date().toISOString();
    const liveItem = await getItem(photo.id);
    const liveArrow = await findConnection(photo.id, album.id, null);
    const remove: Change = {
      description: "Delete 'hallway, morning'",
      pairs: [
        { before: liveItem!, after: { ...liveItem!, deleted_at: now } },
        { before: liveArrow!, after: { ...liveArrow!, deleted_at: now } },
      ],
    };
    await applyChange(remove);

    const gone = await getItem(photo.id);
    const goneArrow = await findConnection(photo.id, album.id, null);
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
    const restoredArrow = await findConnection(photo.id, album.id, null);
    check("undo restores the item and its connections symmetrically", () => {
      assert.equal(restored?.name, "hallway, morning");
      assert.equal(restored?.deleted_at, null);
      assert.equal(restoredArrow?.id, arrow.id);
      assert.deepEqual(restoredArrow?.position, { x: 120.5, y: -40 });
    });

    console.log("\nundo the tag, then the create");
    await applyChange(invert(tag));
    const albumGone = await getItemIncludingDeleted(album.id);
    const arrowGone = await findConnection(photo.id, album.id, null);
    check("the tag target and its arrow are gone, not flagged", () => {
      assert.equal(albumGone, null);
      assert.equal(arrowGone, null);
    });

    await applyChange(invert({ description: "Rename", pairs: [{ before: stored!, after: renamed }] }));
    const unrenamed = await getItem(photo.id);
    check("undoing the rename puts the old name back", () => {
      assert.equal(unrenamed?.name, "hallway");
    });

    await applyChange(invert(create));
    const nothing = await getItemIncludingDeleted(photo.id);
    check("the item is fully gone", () => {
      assert.equal(nothing, null);
    });

    console.log("\nquery predicates");
    const dated = blankItem({ name: "old note", date: "2020-01-01" });
    const recent = blankItem({
      name: "new note",
      date: "2026-07-20",
      fields: [{ name: "year", value: "1999", kind: "number" }],
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
      query: { and: [{ date: { gte: "2026-01-01" } }] },
    });
    const webSet = blankItem({ name: "on the web", query: { and: [{ device: "web" }] } });
    const linkSet = blankItem({ name: "links", query: { and: [{ format: "link" }] } });
    const yearSet = blankItem({
      name: "released in the nineties",
      query: { and: [{ field: { name: "year", kind: "number", gte: "1990", lte: "1999" } }] },
    });
    await applyChange({
      description: "Seed query sets",
      pairs: [rangeSet, webSet, linkSet, yearSet].map((set) => ({ before: null, after: set })),
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
