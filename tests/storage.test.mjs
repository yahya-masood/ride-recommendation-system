// tests/storage.test.mjs
// AUTOMATED NODE TESTS for js/storage.js only.
// Run from the project root with:   node tests/storage.test.mjs
//
// What this is:   checks of storage.js logic with a FAKE localStorage and a FAKE fetch.
// What this is NOT: a browser test. No page, button, screen or real browser is tested here.
// Exit code is 0 when all checks pass and 1 when any check fails.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- fake localStorage (a Map) that can be told to fail ----------
const store = new Map();
let failWrites = false;   // every setItem throws
let failOnWriteNumber = -1; // only the Nth setItem call throws
let writeCount = 0;
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      writeCount++;
      if (failWrites || writeCount === failOnWriteNumber) throw new Error("quota exceeded (fake)");
      store.set(key, String(value));
    },
    removeItem: key => { store.delete(key); }
  }
});

// ---------- fake fetch: serves the real JSON files, or replacements ----------
let fetchMode = "real";          // "real" | "404"
const replacements = {};         // path -> object to serve instead of the real file
globalThis.fetch = async (url) => {
  if (fetchMode === "404") return { ok: false, status: 404, json: async () => ({}) };
  if (Object.prototype.hasOwnProperty.call(replacements, url)) {
    return { ok: true, status: 200, json: async () => replacements[url] };
  }
  const text = fs.readFileSync(path.join(root, url), "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

const s = await import("../js/storage.js");
const realLocations = JSON.parse(fs.readFileSync(path.join(root, "data/locations.json"), "utf8"));
const realDistances = JSON.parse(fs.readFileSync(path.join(root, "data/distances.json"), "utf8"));

// ---------- tiny test helper ----------
const originalConsoleError = console.error;
console.error = () => {};            // storage.js logs expected errors; keep the output clean
const groups = {};
let current = "";
const group = name => { current = name; groups[name] = { pass: 0, fail: 0 }; };
const check = (name, condition) => {
  if (condition) groups[current].pass++;
  else { groups[current].fail++; originalConsoleError("  FAIL [" + current + "] " + name); }
};
const copy = obj => JSON.parse(JSON.stringify(obj));
const resetStore = () => { store.clear(); failWrites = false; failOnWriteNumber = -1; writeCount = 0; };
const threwWith = async (fn, pattern) => { try { await fn(); return false; } catch (e) { return pattern.test(e.message); } };
const locs = realLocations.locations;
const tbl = realDistances.distances;
const miniLocs = [{ id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" }];
const miniTable = () => ({ A: { B: 1, C: 2 }, B: { A: 1, C: 1.5 }, C: { A: 2, B: 1.5 } });

// ================= 1. lists, settings, session =================
group("1 lists, settings, session");
resetStore();
check("missing list gives []", s.getList("users").length === 0);
check("unknown list name gives []", s.getList("hacker").length === 0);
check("unknown list name is not written to key 'undefined'", !store.has("undefined"));
check("unknown list name save gives false", s.saveList("hacker", []) === false);
check("non-array save gives false", s.saveList("users", { a: 1 }) === false);
check("save and read a list", s.saveList("users", [{ userId: "U1" }]) && s.getList("users")[0].userId === "U1");
store.set("rr_users", "{not json"); check("corrupt JSON gives []", s.getList("users").length === 0);
store.set("rr_users", JSON.stringify({ a: 1 })); check("object instead of list gives []", s.getList("users").length === 0);
resetStore();
check("missing settings give defaults", s.getSettings().maxDetourKm === 5);
const first = s.getSettings(); first.maxDetourKm = 99;
check("settings copy is independent of the defaults", s.getSettings().maxDetourKm === 5);
store.set("rr_settings", JSON.stringify({ maxDetourKm: "x" }));
check("wrong-shape settings give defaults", s.getSettings().weights.length === 4);
check("saveSettings rejects wrong shape", s.saveSettings({ maxDetourKm: 5 }) === false);
check("saveSettings and read back", s.saveSettings({ maxDetourKm: 6, weights: [25, 25, 20, 30], farePerKm: 30, fuelPrice: 280, responseTimeoutMin: 2 }) && s.getSettings().maxDetourKm === 6);
check("no session gives null", s.getSession() === null);
check("session with unknown role rejected", s.saveSession({ userId: "U1", role: "Boss" }) === false);
check("session saved and read", s.saveSession({ userId: "U1", role: "Driver" }) && s.getSession().role === "Driver");
s.clearSession(); check("clearSession works", s.getSession() === null);
failWrites = true; check("write failure gives false", s.saveList("users", []) === false); failWrites = false;
check("isStorageAvailable true with working storage", s.isStorageAvailable() === true);
failWrites = true; check("isStorageAvailable false when blocked", s.isStorageAvailable() === false); failWrites = false;
check("newId gives different ids", s.newId("REQ") !== s.newId("REQ"));

// ================= 2. ride data: single write + revision =================
group("2 ride data (saveRideData)");
resetStore();
check("empty ride data: revision 0", s.getRideDataRevision() === 0);
check("empty ride lists", s.getList("rideRequests").length === 0 && s.getList("rides").length === 0);
let r = s.saveRideData({ rideRequests: [{ id: "R1", status: "Pending" }], recommendations: [{ id: "Rec1", status: "AwaitingDecision" }], rides: [] }, 0);
check("first save ok, revision 1", r.ok === true && r.revision === 1 && s.getRideDataRevision() === 1);
check("all three lists readable", s.getList("rideRequests")[0].id === "R1" && s.getList("recommendations")[0].id === "Rec1" && Array.isArray(s.getList("rides")));
check("ride data is ONE storage key", store.has("rr_rideData") && !store.has("rr_rideRequests") && !store.has("rr_rides"));
// two "tabs" read the same revision, both try to confirm
const revA = s.getRideDataRevision(); const revB = s.getRideDataRevision();
const confirm = (driver) => ({ rideRequests: [{ id: "R1", status: "Confirmed", lockedByDriverId: driver }], rides: [{ id: "Rd-" + driver }], recommendations: [{ id: "Rec1", status: "Confirmed" }] });
const first1 = s.saveRideData(confirm("D1"), revA);
const second1 = s.saveRideData(confirm("D2"), revB);
check("first driver confirms", first1.ok === true);
check("second driver gets conflict, not overwrite", second1.ok === false && second1.reason === "conflict");
check("data still belongs to the first driver", s.getList("rideRequests")[0].lockedByDriverId === "D1" && s.getList("rides")[0].id === "Rd-D1");
// failed write leaves old data untouched
const before = JSON.stringify(store.get("rr_rideData"));
writeCount = 0; failOnWriteNumber = 1;
const failed = s.saveRideData(confirm("D3"), s.getRideDataRevision());
failOnWriteNumber = -1;
check("write failure reported", failed.ok === false && failed.reason === "write-failed");
check("old ride data unchanged after failed write", JSON.stringify(store.get("rr_rideData")) === before);
check("bad input: empty changes", s.saveRideData({}).reason === "bad-input");
check("bad input: unknown list", s.saveRideData({ users: [] }).reason === "bad-input");
check("bad input: not a list", s.saveRideData({ rides: "x" }).reason === "bad-input");
check("bad input: bad revision", s.saveRideData({ rides: [] }, -1).reason === "bad-input" && s.saveRideData({ rides: [] }, 1.5).reason === "bad-input");
check("bad input: null", s.saveRideData(null).reason === "bad-input");
check("save without expected revision works", s.saveRideData({ rides: [] }).ok === true);
const beforeRefuse = store.get("rr_rideData");
check("saveList refuses ride lists (must use saveRideData)", s.saveList("rides", [{ id: "X" }]) === false && s.saveList("rideRequests", []) === false && s.saveList("recommendations", []) === false);
check("refused saveList did not change stored data", store.get("rr_rideData") === beforeRefuse);
store.set("rr_rideData", "{broken"); check("corrupt ride data gives empty lists and revision 0", s.getList("rides").length === 0 && s.getRideDataRevision() === 0);
store.set("rr_rideData", JSON.stringify({ rev: "x", rides: "nope", rideRequests: [{ id: "Q" }] }));
check("partly broken ride data is repaired", s.getRideDataRevision() === 0 && s.getList("rides").length === 0 && s.getList("rideRequests")[0].id === "Q");

// ================= 3. getDistance =================
group("3 getDistance (never throws)");
check("real table L01-L02", s.getDistance(tbl, "L01", "L02") === 12.4);
check("same known place is 0", s.getDistance(tbl, "L03", "L03") === 0);
check("unknown source", s.getDistance(tbl, "L99", "L01") === null);
check("unknown destination", s.getDistance(tbl, "L01", "L99") === null);
check("both unknown and equal", s.getDistance(tbl, "L99", "L99") === null);
check("prototype keys", s.getDistance(tbl, "__proto__", "L01") === null && s.getDistance(tbl, "constructor", "L01") === null && s.getDistance(tbl, "L01", "toString") === null);
check("null table", s.getDistance(null, "L01", "L02") === null);
check("undefined table", s.getDistance(undefined, "L01", "L02") === null);
check("array as table", s.getDistance([], "L01", "L02") === null);
check("string as table", s.getDistance("table", "L01", "L02") === null);
check("ids that are not strings", s.getDistance(tbl, 1, 2) === null && s.getDistance(tbl, null, "L01") === null && s.getDistance(tbl, undefined, undefined) === null);
const numericIds = { 1: { 2: 5 }, 2: { 1: 5 } };
check("numeric ids are not accepted even if the table has keys '1' and '2'", s.getDistance(numericIds, 1, 2) === null && s.getDistance(numericIds, "1", "2") === 5);
let bad = miniTable(); bad.A = null; check("source row is null", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.A = "oops"; check("source row is a string", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.A = [1, 2]; check("source row is an array", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); delete bad.A; check("source row missing", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.B = null; check("destination row is null", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); delete bad.A.B; check("distance entry missing", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.A.B = "abc"; check("distance is text", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.A.B = null; check("distance is null", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.A.B = NaN; check("distance is NaN", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.A.B = Infinity; check("distance is Infinity", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.A.B = -3; check("distance is negative", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.A.B = 0; check("distance between different places is 0", s.getDistance(bad, "A", "B") === null);
bad = miniTable(); bad.A = null; check("same id with malformed row", s.getDistance(bad, "A", "A") === null);
check("healthy mini table works", s.getDistance(miniTable(), "A", "C") === 2);

// ================= 4. validation of reference data =================
group("4 validateLocationList / validateDistanceTable");
check("real locations are valid", s.validateLocationList(locs).length === 0);
check("real distance table is valid", s.validateDistanceTable(tbl, locs).length === 0);
check("all 56 required pairs present", locs.every(a => locs.every(b => a.id === b.id || typeof tbl[a.id][b.id] === "number")));
check("locations: not a list", s.validateLocationList(null).length > 0 && s.validateLocationList({}).length > 0 && s.validateLocationList([]).length > 0);
check("locations: duplicate id", s.validateLocationList([{ id: "A", name: "x" }, { id: "A", name: "y" }]).some(e => /more than once/.test(e)));
check("locations: empty id", s.validateLocationList([{ id: "", name: "x" }]).some(e => /no valid id/.test(e)));
check("locations: missing name", s.validateLocationList([{ id: "A" }]).some(e => /no valid name/.test(e)));
check("locations: item not an object", s.validateLocationList(["A"]).some(e => /not an object/.test(e)));
const errsOf = t => s.validateDistanceTable(t, miniLocs);
check("healthy mini table is valid", errsOf(miniTable()).length === 0);
check("table null", errsOf(null).length > 0 && errsOf([]).length > 0 && errsOf("x").length > 0);
bad = miniTable(); delete bad.B; check("missing row", errsOf(bad).some(e => /row for B is missing/i.test(e)));
bad = miniTable(); bad.B = null; check("null row", errsOf(bad).some(e => /row for B/i.test(e)));
bad = miniTable(); bad.B = "x"; check("row is text", errsOf(bad).some(e => /row for B/i.test(e)));
bad = miniTable(); delete bad.A.C; check("missing pair", errsOf(bad).some(e => /A to C is missing/.test(e)));
bad = miniTable(); bad.A.B = -1; check("negative distance", errsOf(bad).some(e => /A to B must be greater than 0/.test(e)));
bad = miniTable(); bad.A.B = 0; check("zero distance between different places", errsOf(bad).some(e => /A to B must be greater than 0/.test(e)));
bad = miniTable(); bad.A.B = "5"; check("text distance", errsOf(bad).some(e => /A to B is not a number/.test(e)));
bad = miniTable(); bad.A.B = null; check("null distance", errsOf(bad).some(e => /A to B is not a number/.test(e)));
bad = miniTable(); bad.A.B = NaN; check("NaN distance", errsOf(bad).some(e => /A to B is not a number/.test(e)));
bad = miniTable(); bad.A.B = 1.4; check("not symmetric", errsOf(bad).some(e => /different from/.test(e)));
bad = miniTable(); bad.A.A = 3; check("self distance not 0", errsOf(bad).some(e => /to itself must be 0/.test(e)));
bad = miniTable(); bad.A.A = 0; check("self distance 0 is allowed", errsOf(bad).length === 0);
bad = miniTable(); bad.Z = { A: 1 }; check("unknown row id", errsOf(bad).some(e => /unknown location id: Z/.test(e)));
bad = miniTable(); bad.A.Z = 4; check("unknown column id", errsOf(bad).some(e => /Row A has an unknown location id: Z/.test(e)));
check("invalid location list stops distance check", s.validateDistanceTable(miniTable(), []).some(e => /location list is invalid/.test(e)));

// ================= 5. loading reference data =================
group("5 loadLocations / loadDistances");
s.clearReferenceCache(); fetchMode = "real";
const loadedLocs = await s.loadLocations(); const loadedTable = await s.loadDistances();
check("8 locations loaded", loadedLocs.length === 8);
check("distance table loaded and usable", s.getDistance(loadedTable, "L01", "L02") === 12.4);
check("known and unknown location", s.isKnownLocation(loadedLocs, "L01") && !s.isKnownLocation(loadedLocs, "L99") && !s.isKnownLocation(null, "L01") && !s.isKnownLocation([null], "L01"));
check("distances symmetric for all 64 pairs", loadedLocs.every(a => loadedLocs.every(b => s.getDistance(loadedTable, a.id, b.id) === s.getDistance(loadedTable, b.id, a.id))));
check("no missing distance for any pair", loadedLocs.every(a => loadedLocs.every(b => s.getDistance(loadedTable, a.id, b.id) !== null)));
check("demo data follows the triangle rule (checked here, not enforced by the validator)", loadedLocs.every(a => loadedLocs.every(b => loadedLocs.every(c => a.id === b.id || a.id === c.id || b.id === c.id || s.getDistance(loadedTable, a.id, c.id) + s.getDistance(loadedTable, c.id, b.id) >= s.getDistance(loadedTable, a.id, b.id) - 1e-9))));
s.clearReferenceCache(); fetchMode = "404";
check("404 gives clear error", await threwWith(() => s.loadLocations(), /Could not load data\/locations.json \(status 404\)/));
fetchMode = "real";
const setRep = (file, value) => { replacements[file] = value; s.clearReferenceCache(); };
const clearRep = () => { for (const k of Object.keys(replacements)) delete replacements[k]; s.clearReferenceCache(); };
setRep("data/locations.json", { wrong: true });
check("locations with wrong shape", await threwWith(() => s.loadLocations(), /Invalid location data/));
setRep("data/locations.json", { locations: [{ id: "L01", name: "A" }, { id: "L01", name: "B" }] });
check("locations with duplicate ids", await threwWith(() => s.loadLocations(), /more than once/));
clearRep(); let badTable = copy(realDistances); delete badTable.distances.L03.L05; replacements["data/distances.json"] = badTable;
check("distance file with missing pair", await threwWith(() => s.loadDistances(), /Invalid distance data: Distance L03 to L05 is missing/));
clearRep(); badTable = copy(realDistances); badTable.distances.L01.L02 = -12.4; badTable.distances.L02.L01 = -12.4; replacements["data/distances.json"] = badTable;
check("distance file with negative value", await threwWith(() => s.loadDistances(), /must be greater than 0/));
clearRep(); badTable = copy(realDistances); badTable.distances.L01.L02 = "far"; replacements["data/distances.json"] = badTable;
check("distance file with text value", await threwWith(() => s.loadDistances(), /is not a number/));
clearRep(); badTable = copy(realDistances); delete badTable.distances.L08; replacements["data/distances.json"] = badTable;
check("distance file with missing row", await threwWith(() => s.loadDistances(), /row for L08 is missing/i));
clearRep(); replacements["data/distances.json"] = { distances: null };
check("distance file with null table", await threwWith(() => s.loadDistances(), /Invalid distance data/));
clearRep(); replacements["data/distances.json"] = [1, 2, 3];
check("distance file that is a list", await threwWith(() => s.loadDistances(), /Invalid distance data/));
clearRep(); badTable = copy(realDistances); badTable.distances.L01.L02 = 99; replacements["data/distances.json"] = badTable;
check("distance file that is not symmetric", await threwWith(() => s.loadDistances(), /is different from/));
clearRep(); badTable = copy(realDistances);
for (const a of Object.keys(badTable.distances)) for (const b of Object.keys(badTable.distances[a])) badTable.distances[a][b] = -1;
replacements["data/distances.json"] = badTable;
check("many errors: message shows 'and N more problems'", await threwWith(() => s.loadDistances(), /and \d+ more problems/));
clearRep();
check("after bad files, real files load again", (await s.loadDistances())["L01"]["L02"] === 12.4);

// ================= 6. cached reference data cannot be changed by callers =================
group("6 loaders return copies (cache safety)");
clearRep(); s.clearReferenceCache(); fetchMode = "real";
const L1 = await s.loadLocations();
L1[0].name = "CHANGED"; L1.push({ id: "L99", name: "Extra" }); L1.pop(); L1[1].id = "BROKEN";
const L2 = await s.loadLocations();
check("changing returned locations does not change the original", L2[0].name === realLocations.locations[0].name && L2[1].id === realLocations.locations[1].id && L2.length === 8);
check("each call gives a new object", L1 !== L2 && L2[0] !== L1[0]);
L1.length = 0; check("emptying a returned list does not empty the cache", (await s.loadLocations()).length === 8);
const T1 = await s.loadDistances();
T1.L01.L02 = 0; delete T1.L02; T1.L03.L04 = -5; T1.NEW = {};
const T2 = await s.loadDistances();
check("changing returned distances does not change the original", T2.L01.L02 === 12.4 && Boolean(T2.L02) && T2.L03.L04 === realDistances.distances.L03.L04 && !("NEW" in T2));
check("each distance call gives a new object", T1 !== T2 && T1.L01 !== T2.L01);
check("data format is unchanged (same as the JSON file)", JSON.stringify(T2) === JSON.stringify(realDistances.distances) && JSON.stringify(await s.loadLocations()) === JSON.stringify(realLocations.locations));
check("returned data still passes validation", s.validateDistanceTable(T2, await s.loadLocations()).length === 0);

// ================= 7. data files and the triangle rule decision =================
group("7 data files");
check("locations file is labelled SYNTHETIC", /SYNTHETIC/.test(realLocations.note));
check("distances file is labelled SYNTHETIC", /SYNTHETIC/.test(realDistances.note));
check("distances unit is km", realDistances.unit === "km");
check("every distance row and column refers to a known location", Object.keys(tbl).every(a => locs.some(l => l.id === a) && Object.keys(tbl[a]).every(b => locs.some(l => l.id === b))));
check("every location has a row", locs.every(l => Object.prototype.hasOwnProperty.call(tbl, l.id)));
check("location ids are unique", new Set(locs.map(l => l.id)).size === locs.length);
const triangleBreaker = { A: { B: 10, C: 1 }, B: { A: 10, C: 1 }, C: { A: 1, B: 1 } };
check("triangle rule is intentionally NOT enforced (A-B 10 is longer than A-C + C-B 2)", s.validateDistanceTable(triangleBreaker, miniLocs).length === 0);

// ---------- summary ----------
console.error = originalConsoleError;
let totalPass = 0, totalFail = 0;
for (const [name, g] of Object.entries(groups)) {
  console.log((g.fail === 0 ? "PASS " : "FAIL ") + name + ": " + g.pass + " passed, " + g.fail + " failed");
  totalPass += g.pass; totalFail += g.fail;
}
console.log("TOTAL (Node automated tests for js/storage.js): " + totalPass + " passed, " + totalFail + " failed");
console.log("Browser tests: none have been run.");
process.exit(totalFail === 0 ? 0 : 1);
