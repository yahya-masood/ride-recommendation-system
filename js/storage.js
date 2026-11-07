// storage.js - Data Tier of the 3-tier client-side architecture.
// This is the ONLY file that touches localStorage or fetches the mock JSON files.
// Other modules (auth.js, routePlan.js, ...) must call the functions exported here.
//
// Safety rules used in this file:
//  - A missing key gives a safe default (empty list, default settings, no session).
//  - Broken or wrong-shaped data in localStorage is ignored and replaced by the default.
//  - Functions never throw because of bad stored data. Read functions return a default,
//    write functions return true (success) or false (failure).
//  - Only the two JSON loaders throw, with a clear message, so the screen can show an error.
//
// IMPORTANT (honest limit): Local Storage is NOT a database. It has no transactions.
// See saveRideData() below for what we do instead and what can still go wrong.

const KEYS = {
  users: "rr_users",
  routePlans: "rr_routePlans",
  rideData: "rr_rideData",   // holds rideRequests + recommendations + rides together
  notifications: "rr_notifications",
  auditLogs: "rr_auditLogs",
  settings: "rr_settings",
  session: "rr_session"
};

// Lists that have their own Local Storage key.
const OWN_KEY_LISTS = ["users", "routePlans", "notifications", "auditLogs"];

// Lists that are stored TOGETHER under one key (rr_rideData), so that a ride confirmation
// (request status + recommendation status + ride record) can be saved in ONE write.
const RIDE_LISTS = ["rideRequests", "recommendations", "rides"];

const ROLES = ["Driver", "Passenger", "Administrator"];

// DEMONSTRATION ASSUMPTIONS (not official or real-world values, not from the SRS):
// the SRS says the Administrator sets the fare rate and fuel price but gives no numbers.
// farePerKm and fuelPrice are only starting values for our demo; the Administrator can change them.
const DEFAULT_SETTINGS = {
  maxDetourKm: 5,              // SRS FR-08 default (maximum detour limit)
  weights: [25, 25, 20, 30],   // SRS FR-11: route, detour, fuel efficiency, profitability
  farePerKm: 30,               // demonstration assumption (Rs per km)
  fuelPrice: 280,              // demonstration assumption (Rs per litre)
  responseTimeoutMin: 2        // SRS FR-17 default (minutes)
};

// ---------- small helpers ----------

function copyOf(value) {
  return JSON.parse(JSON.stringify(value));
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Shape check only (right types). Business rules (weights 10-40, total 100) belong to settings.js.
function hasSettingsShape(s) {
  return Boolean(s) && typeof s === "object"
    && isNumber(s.maxDetourKm) && isNumber(s.farePerKm) && isNumber(s.fuelPrice)
    && isNumber(s.responseTimeoutMin)
    && Array.isArray(s.weights) && s.weights.length === 4 && s.weights.every(isNumber);
}

function hasSessionShape(s) {
  return Boolean(s) && typeof s === "object"
    && typeof s.userId === "string" && s.userId !== ""
    && ROLES.includes(s.role);
}

// Read and parse one key. Any problem returns the fallback.
function readValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    console.error("storage: could not read", key, error);
    return fallback;
  }
}

// Write one key. Returns true if saved, false if it failed (for example storage is full or blocked).
function writeValue(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("storage: could not write", key, error);
    return false;
  }
}

// ---------- availability and ids ----------

// Tells the caller whether Local Storage can be used at all (it can be blocked by the browser).
export function isStorageAvailable() {
  try {
    const testKey = "rr_test";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
}

// Simple unique id such as "REQ-m3k9x2-a1b2c3".
export function newId(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// ---------- record lists ----------

// Reads the shared ride data object { rev, rideRequests, recommendations, rides }.
// Missing or broken data is treated as empty (and logged), never as an exception.
function readRideData() {
  const data = { rev: 0, rideRequests: [], recommendations: [], rides: [] };
  const raw = readValue(KEYS.rideData, null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return data;
  if (Number.isInteger(raw.rev) && raw.rev >= 0) data.rev = raw.rev;
  for (const name of RIDE_LISTS) {
    if (Array.isArray(raw[name])) data[name] = raw[name];
  }
  return data;
}

// Returns the list stored under the given name, or [] if the name is unknown, missing or broken.
export function getList(name) {
  if (RIDE_LISTS.includes(name)) {
    return readRideData()[name];
  }
  if (!OWN_KEY_LISTS.includes(name)) {
    console.error("storage.getList: unknown list name", name);
    return [];
  }
  const value = readValue(KEYS[name], []);
  return Array.isArray(value) ? value : [];
}

// Saves one of the simple lists (users, routePlans, notifications, auditLogs).
// Returns false if the name is unknown, the data is not a list, or saving fails.
// The ride lists (rideRequests, recommendations, rides) are NOT accepted here: they must be
// saved with saveRideData(), which checks the revision. This stops old data from being saved
// over a newer confirmation by accident.
export function saveList(name, list) {
  if (RIDE_LISTS.includes(name)) {
    console.error("storage.saveList: use saveRideData() for", name);
    return false;
  }
  if (!OWN_KEY_LISTS.includes(name) || !Array.isArray(list)) {
    console.error("storage.saveList: bad name or data", name);
    return false;
  }
  return writeValue(KEYS[name], list);
}

// Revision number of the ride data. It goes up by 1 on every successful save.
export function getRideDataRevision() {
  return readRideData().rev;
}

// Saves one or more of rideRequests / recommendations / rides with ONE Local Storage write.
//
//   const rev = getRideDataRevision();           // read first
//   ... decision.js builds the new lists ...
//   const result = saveRideData({ rideRequests, recommendations, rides }, rev);
//   // result = { ok: true, revision } or { ok: false, reason: "conflict" | "write-failed" | "bad-input" }
//
// Why this design (SRS NFR-08, Integrity, says a request goes to only one driver
// and a confirmation is "completed fully or not at all"):
//  - A single setItem call stores the whole value or throws, so the three lists can never be
//    half saved by this function. (Several separate setItem calls with a rollback can fail
//    in the middle, and the rollback itself can fail too.)
//  - expectedRevision lets us notice that another tab saved in between (for example a second
//    driver confirming the same request) and return "conflict" instead of overwriting it.
//
// What this does NOT guarantee (this is a browser demo, not a database):
//  - There is no real lock between browser tabs. The revision check happens in the same
//    synchronous step as the write, which works in practice but is not guaranteed by the spec.
//  - Different browsers, profiles or devices have completely separate data.
//  - If the browser crashes while it writes to disk, the result is not defined by us.
//  - Notifications and the audit log have their own keys and are saved AFTER this call, so
//    one of them can still be missing if its own write fails.
export function saveRideData(changes, expectedRevision) {
  const names = changes && typeof changes === "object" && !Array.isArray(changes) ? Object.keys(changes) : [];
  const badInput = names.length === 0
    || names.some(n => !RIDE_LISTS.includes(n) || !Array.isArray(changes[n]))
    || (expectedRevision !== undefined && !(Number.isInteger(expectedRevision) && expectedRevision >= 0));
  if (badInput) {
    console.error("storage.saveRideData: bad input");
    return { ok: false, reason: "bad-input" };
  }
  const data = readRideData();
  if (expectedRevision !== undefined && expectedRevision !== data.rev) {
    return { ok: false, reason: "conflict", revision: data.rev };
  }
  for (const name of names) {
    data[name] = changes[name];
  }
  data.rev += 1;
  if (!writeValue(KEYS.rideData, data)) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true, revision: data.rev };
}

// ---------- settings ----------

// Returns the saved settings, or a fresh copy of the defaults if missing or broken.
export function getSettings() {
  const value = readValue(KEYS.settings, null);
  return hasSettingsShape(value) ? value : copyOf(DEFAULT_SETTINGS);
}

export function saveSettings(settings) {
  if (!hasSettingsShape(settings)) {
    console.error("storage.saveSettings: wrong shape");
    return false;
  }
  return writeValue(KEYS.settings, settings);
}

// ---------- logged-in session ----------

// Returns { userId, role, ... } or null when nobody is logged in or the data is broken.
export function getSession() {
  const value = readValue(KEYS.session, null);
  return hasSessionShape(value) ? value : null;
}

export function saveSession(session) {
  if (!hasSessionShape(session)) {
    console.error("storage.saveSession: wrong shape");
    return false;
  }
  return writeValue(KEYS.session, session);
}

export function clearSession() {
  try {
    localStorage.removeItem(KEYS.session);
    return true;
  } catch (error) {
    return false;
  }
}

// ---------- mock JSON reference data (read only, SYNTHETIC demo data) ----------

let locationsCache = null;
let distancesCache = null;

// Used by tests to start again from an empty cache.
export function clearReferenceCache() {
  locationsCache = null;
  distancesCache = null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Checks the location list. Returns a list of error messages (empty list = valid).
export function validateLocationList(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return ["Location list is missing, empty or not a list"];
  }
  const errors = [];
  const seen = new Set();
  list.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push("Location #" + (index + 1) + " is not an object");
      return;
    }
    if (typeof item.id !== "string" || item.id.trim() === "") {
      errors.push("Location #" + (index + 1) + " has no valid id");
    } else if (seen.has(item.id)) {
      errors.push("Location id " + item.id + " is used more than once");
    } else {
      seen.add(item.id);
    }
    if (typeof item.name !== "string" || item.name.trim() === "") {
      errors.push("Location #" + (index + 1) + " has no valid name");
    }
  });
  return errors;
}

// Checks the whole distance table against the location list.
// Returns a list of error messages (empty list = valid). Rules (ASSUMPTIONS for our demo data):
//  - every location has a row, every row has a distance to every OTHER location;
//  - each distance is a finite number greater than 0 (negative, zero, text, null are rejected);
//  - a distance from a place to itself must be 0 or left out;
//  - A to B and B to A must match (difference of at most 0.05 km);
//  - the table must not mention ids that are not in the location list.
// The triangle rule (A to C is never longer than A to B plus B to C) is intentionally NOT checked:
// a hand-written table of real road distances can break it slightly, and the engine already
// treats a negative detour as 0. Our demo data does follow the rule (tests/ checks this).
export function validateDistanceTable(table, locations) {
  if (!isPlainObject(table)) {
    return ["Distance table is missing or not an object"];
  }
  const locationErrors = validateLocationList(locations);
  if (locationErrors.length > 0) {
    return ["Cannot check distances because the location list is invalid"];
  }
  const ids = locations.map(l => l.id);
  const errors = [];
  for (const key of Object.keys(table)) {
    if (!ids.includes(key)) errors.push("Distance table has an unknown location id: " + key);
  }
  for (const from of ids) {
    if (!hasOwn(table, from) || !isPlainObject(table[from])) {
      errors.push("Distance row for " + from + " is missing or not an object");
      continue;
    }
    const row = table[from];
    for (const key of Object.keys(row)) {
      if (!ids.includes(key)) errors.push("Row " + from + " has an unknown location id: " + key);
    }
    for (const to of ids) {
      if (from === to) {
        if (hasOwn(row, to) && row[to] !== 0) errors.push("Distance " + from + " to itself must be 0");
        continue;
      }
      if (!hasOwn(row, to)) {
        errors.push("Distance " + from + " to " + to + " is missing");
      } else if (!isNumber(row[to])) {
        errors.push("Distance " + from + " to " + to + " is not a number");
      } else if (row[to] <= 0) {
        errors.push("Distance " + from + " to " + to + " must be greater than 0 (found " + row[to] + ")");
      }
    }
  }
  // Symmetry check (only for pairs that are valid numbers in both directions)
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const ab = isPlainObject(table[a]) ? table[a][b] : undefined;
      const ba = isPlainObject(table[b]) ? table[b][a] : undefined;
      if (isNumber(ab) && isNumber(ba) && Math.abs(ab - ba) > 0.05) {
        errors.push("Distance " + a + " to " + b + " (" + ab + ") is different from " + b + " to " + a + " (" + ba + ")");
      }
    }
  }
  return errors;
}

// Turns a list of error messages into one clear Error (shows the first 5).
function makeReferenceError(title, errors) {
  const shown = errors.slice(0, 5).join("; ");
  const more = errors.length > 5 ? " (and " + (errors.length - 5) + " more problems)" : "";
  return new Error(title + ": " + shown + more);
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error("Could not load " + path + " (status " + response.status + ")");
  }
  return response.json();
}

// Predefined location list (SRS section 2.4). Returns [{ id, name }, ...].
// Throws an Error with a clear message if the file is missing or invalid (SRS UC-02 exception).
export async function loadLocations() {
  if (!locationsCache) {
    const data = await fetchJson("data/locations.json");
    const list = isPlainObject(data) ? data.locations : undefined;
    const errors = validateLocationList(list);
    if (errors.length > 0) throw makeReferenceError("Invalid location data", errors);
    locationsCache = list;
  }
  return copyOf(locationsCache); // a copy, so callers cannot change the cached original
}

// Distance table in km: { L01: { L02: 12.4, ... }, ... }.
// Checks every location row and every location pair. Throws an Error with a clear message
// if anything is missing, negative, not a number, unknown or not symmetric.
export async function loadDistances() {
  if (!distancesCache) {
    const locations = await loadLocations();
    const data = await fetchJson("data/distances.json");
    const table = isPlainObject(data) ? data.distances : undefined;
    const errors = validateDistanceTable(table, locations);
    if (errors.length > 0) throw makeReferenceError("Invalid distance data", errors);
    distancesCache = table;
  }
  return copyOf(distancesCache); // a copy, so callers cannot change the cached original
}

// True if the id exists in the location list.
export function isKnownLocation(locations, id) {
  return Array.isArray(locations) && locations.some(l => isPlainObject(l) && l.id === id);
}

// Distance in km between two location ids. NEVER throws.
// Returns null if: the table is missing or malformed, either id is not a string or has no
// valid row, the distance is missing, not a finite number, or not greater than 0.
// The same place gives 0 (only if that place has a valid row in the table).
export function getDistance(table, fromId, toId) {
  if (!isPlainObject(table)) return null;
  if (typeof fromId !== "string" || typeof toId !== "string") return null;
  if (!hasOwn(table, fromId) || !isPlainObject(table[fromId])) return null;
  if (!hasOwn(table, toId) || !isPlainObject(table[toId])) return null;
  if (fromId === toId) return 0;
  const row = table[fromId];
  if (!hasOwn(row, toId)) return null;
  const value = row[toId];
  return isNumber(value) && value > 0 ? value : null;
}
