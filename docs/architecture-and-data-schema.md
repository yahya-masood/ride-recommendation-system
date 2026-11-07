# Architecture, Data Schema and Scoring Rules

Project: AI Enabled Ride Booking and Driver Route Recommendation System
Group: Yahya Masood (25F-3036), Sami Ahsan (25F-3098)
Version: corrected draft v4 (for group review). Source of truth: our SRS (Assignment 4) and the Course Project guidelines.

**Requirement numbers (important):** the requirement numbers below come from the numbering given by the group in the review messages. **The latest SRS file was not available to the author of this file, so these numbers were not checked against it.** Where the new number is not known, the text uses the requirement name and the words "number to check". UC (use case) numbers were not changed and are also unchecked.

| Requirement | Number used | Meaning |
|---|---|---|
| FR-07 | given in review | filter requests by route compatibility and time window |
| FR-08 | given in review | calculate detour and apply the maximum detour limit (default 5 km) |
| FR-09 | given in review | estimate fuel cost from detour, vehicle fuel efficiency (km/litre) and fuel price |
| FR-10 | given in review | estimated profit = estimated fare - estimated fuel cost |
| FR-11 | given in review | rank with the four weights 25 / 25 / 20 / 30 |
| FR-12 | given in review | recommend the highest-ranked request, show no-match information |
| FR-14 | given in review | driver must explicitly confirm or reject |
| FR-15 | given in review | handle rejection |
| FR-16 | given in review | confirm and lock the request only after driver confirmation |
| FR-17 | given in review | recommendation timeout, never confirms automatically |
| FR-18 | given in review | notify the passenger after confirmation |
| FR-22 to FR-24 | given in review | administration, settings, audit logging (which number is which: to check) |
| NFR-04 | given in review | Privacy: passenger contact details protected until driver confirmation |
| NFR-05 | given in review | Usability: confirm or reject within 3 clicks or taps |
| NFR-08 | given in review | Integrity: one request to one driver; confirmation completed fully or not at all |
| NFR-10 | given in review | Transparency: show the criteria values and score of every recommendation |

**How to read the labels in this file**
- **[SRS]** comes directly from the SRS.
- **[GUIDELINES]** comes from the Course Project guidelines.
- **[ASSUMPTION]** is a choice made to build the demo. It is NOT an SRS requirement and needs group approval.
- **[PROPOSED]** is a change or addition that is waiting for group approval.

## 1. Architecture style: 3-tier client-side architecture [GUIDELINES example]

The system runs completely in the browser.

- **Presentation tier (HTML + CSS):** the screens for Driver, Passenger and Administrator. No business rules here.
- **Logic tier (JavaScript modules):** authentication, route plan checks, request filtering, detour/fuel/profit calculation, ranking, driver decision, notification, settings, audit log. One file per concern.
- **Data tier (Local Storage + JSON):** records are saved as JSON in the browser Local Storage. Fixed reference data (locations and distances) is read from JSON files.

**Why it fits:** the guidelines require a static website on GitHub Pages, so there is no server or database. A 3-tier layout still keeps the SRS idea of separated layers. Only `storage.js` touches Local Storage, so the screens and rules do not depend on how data is saved.

## 2. Planned JavaScript files (same names as the Component Diagram)

| File | Purpose | SRS link | Status |
|---|---|---|---|
| `js/storage.js` | Only file that uses Local Storage and loads JSON | integrity NFR-08 (best effort, see 4b) | Written. 124 Node checks pass (storage logic only, see section 10) |
| `js/auth.js` | Register, login, role check, 15 minute logout | Authentication and security requirements (numbers to check) | Not written |
| `js/routePlan.js` | Define, change, end route plan and window | Route plan and time window requirement (number to check) | Not written |
| `js/rideRequest.js` | Submit, validate, cancel, expire requests | Ride request management requirement (number to check) | Not written |
| `js/recommendationEngine.js` | Filter, detour, fuel cost, profit, rank | FR-07 to FR-12 | Not written |
| `js/decision.js` | Confirm, reject, timeout, lock request | FR-14 to FR-17 | Not written |
| `js/notification.js` | Passenger and driver notifications | FR-18 (passenger); notice to driver when a ride is cancelled: number to check | Not written |
| `js/settings.js` | Get and check recommendation settings | FR-22 to FR-24 | Not written |
| `js/admin.js` | Create, update, deactivate users | FR-22 to FR-24 | Not written |
| `js/auditLog.js` | Record and read audit log | FR-22 to FR-24 | Not written |
| `js/rideHistory.js` | Driver ride history | Ride history requirement (number to check) | Not written |
| `js/ui.js` | DOM updates and event listeners | NFR-05 (Usability) | Not written |

`settings.js` was added as a separate file in this version because the SRS class diagram has a separate Settings class. Previously the diagrams showed it inside admin.js. The Component Diagram and Sequence Diagram 1 were updated to match.

## 3. SRS design vs this student implementation

The SRS Deployment Diagram describes a web server and a database server. The SRS is not changed. This table explains the difference honestly.

| SRS element | This implementation | Note |
|---|---|---|
| Database server (SQL) | Local Storage + JSON files | Simulation. Data stays in one browser. |
| Web server and application modules | JavaScript modules in the browser | Same modules as the SRS Package Diagram. |
| HTTPS (security requirement) | Provided by GitHub Pages | Not built by us. |
| Hashed passwords (security requirement) | Browser Web Crypto hash | Simulation, not real security. |
| 15 minute inactivity logout | Browser timer | Works only while the page is open. |
| 2 minute recommendation timeout | Browser timer | Same limit. |
| AI recommendation | Rule-based weighted score | As the SRS says. No machine learning. |
| Audit log cannot be edited | No edit screen exists | Data can still be changed in browser DevTools. |
| 99% uptime, daily backup, 500 users | Not applicable | Server NFRs, cannot be tested here. |
| Driver and Passenger on different devices | Different tabs or logins in one browser | Demo limitation. |

## 4. Data schema (Local Storage keys)

Field names follow the SRS class diagram (Fig. 7) except where marked.

```
users[]            { userId, name, role: "Driver"|"Passenger"|"Administrator",
                     passwordHash, active,
                     phone (Passenger only)  [PROPOSED, see section 5],
                     fuelEfficiencyKmPerL (Driver only), vehicleSeats (Driver only) }
routePlans[]       { planId, driverId, source, destination, windowStart, windowEnd,
                     status: "Active"|"Ended"|"Expired" }
rideRequests[]     { requestId, passengerId, pickup, dropOff, pickupTime, passengerCount,
                     status: "Pending"|"Confirmed"|"Cancelled"|"Expired",
                     lockedByDriverId }
recommendations[]  { recommendationId, planId, requestId, driverId, routeScore, detourKm,
                     fuelCost, profit, score,
                     status: "AwaitingDecision"|"Confirmed"|"Rejected"|"Expired", shownAt }
rides[]            { rideId, recommendationId, driverId, requestId, detourKm, fuelCost,
                     profit, status, confirmedAt }
notifications[]    { notificationId, recipientId, message, createdAt }
auditLogs[]        { logId, timestamp, userId, action, recordRef }
settings           { maxDetourKm, weights[4], farePerKm, fuelPrice, responseTimeoutMin }
session            { userId, role, lastActivityAt }
```

**Storage layout note:** `rideRequests`, `recommendations` and `rides` are stored together under ONE Local Storage key (`rr_rideData`) with a revision number, so a confirmation can be saved in a single write. The other lists (`users`, `routePlans`, `notifications`, `auditLogs`) have their own keys. Reading uses `getList()`. Saving the three ride lists uses `saveRideData()` only (`saveList()` refuses them), so every change passes the revision check.

`vehicleSeats` exists in the SRS domain model and class diagram, but no requirement uses it. **[ASSUMPTION]** it is stored but not used for validation unless the group decides otherwise.

## 4b. Saving a confirmation (data integrity requirement): what we can and cannot promise

**Integrity requirement [SRS] (NFR-08):** a request is assigned to only one driver, and a confirmation is "completed fully or not at all".

**Why Local Storage cannot give a true atomic transaction.** A real database has transactions: a group of changes is committed together, other users are locked out during the change, and after a crash the database recovers to a clean state. Local Storage has none of this:
- every `setItem` call is a separate write; there is no begin / commit / rollback;
- if we write three keys one after another and the second write fails, we can try to put the first one back, but that rollback is also a write and can fail too;
- if the browser or computer stops between two writes, the "undo" code never runs and the data stays half changed;
- there is no lock between browser tabs, so another tab can write between our read and our write.

So an earlier version with several writes and a rollback (`saveListsTogether()`) **could not honestly be called atomic, and it has been removed.**

**What the skeleton does instead [ASSUMPTION, needs approval]:**
1. The three lists that change on a confirmation (request, recommendation, ride) live in one key. `saveRideData()` writes them with **one** `setItem` call, which either stores the whole value or throws and leaves the old value, so these three can not be half saved by our code.
2. A **revision number** is stored with them. `decision.js` reads the revision first and passes it back when saving. If another tab saved in between (for example a second driver confirmed the same request), `saveRideData()` returns `conflict` and nothing is overwritten. `saveList()` refuses the three ride lists, so nobody can save old data over a newer confirmation without the revision check. The driver then sees "request no longer available" (UC-07 alternative flow 3a).
3. Notification and audit log are separate keys and are saved **after** the confirmation. UC-08 says a failed notification only gets logged and the confirmation stays. This is how we keep UC-07, UC-08 and the data integrity requirement consistent.

**Remaining limitations (to be written in the report):**
- This is a best-effort simulation of the data integrity requirement, **not guaranteed atomicity**.
- The revision check is not a real lock. It works in normal use but the browser specification does not promise it between tabs.
- Data of different browsers, profiles and devices is separate, so "one driver only" is only enforced inside one browser profile.
- A browser crash during writing to disk is outside our control.
- The notification or the audit entry can still be missing if its own write fails.
- Every module that changes ride data must follow the pattern: read the revision, build the new lists, call `saveRideData(changes, revision)`, and handle `conflict`. This is a rule for our code, not something the browser enforces.
- Local Storage has a size limit (about 5 MB per site in most browsers). A full storage makes `saveRideData()` return `write-failed`.

**What the prototype can show in the demo:** one driver confirming a request; a second tab trying to confirm the same request and getting "no longer available"; a failed save leaving the old data unchanged; the request being locked after confirmation.

**What needs a real backend and database in a production system:** real transactions and locks, many users on many devices at the same time, crash recovery, and a server that checks every rule. Local Storage cannot do these, and we do not claim it does.

## 5. Passenger contact field (phone): status PROPOSED, not decided

**What the SRS says (Assignment 4 version):**
- UC-07 step 5: after the driver confirms, the system "reveals the passenger's contact details to the driver".
- Privacy requirement (NFR-04): contact details are not shown to a driver until that driver confirms; a recommendation shows only the passenger's first name and the pickup and drop-off locations.
- The data model (Domain Model, Class Diagram) gives Passenger only an id and a name. No contact field is defined. UC-01 only says "required account details".

**So:** the SRS needs *some* contact detail to exist, but does not define it. A `phone` field would be our addition. It is **not approved and not in the code**. Until the group decides:
- the Figma Register (Passenger) and Ride Confirmed screens show a draft phone field, and must be changed if the proposal is rejected;
- no code depends on it.

**If the group approves it, these privacy rules must hold:** the phone number is stored only in the passenger's user record; it is never copied into a recommendation, an alternative, a notification or the audit log; and it is read only after `saveRideData()` has succeeded for that driver's confirmation.
**If the group rejects it:** the Ride Confirmed screen shows only the passenger's name and the report states this as a known difference from UC-07 step 5.

## 6. Demo data: SYNTHETIC, not real

- `data/locations.json` contains 8 **made-up** place names. They are **not real Faisalabad locations**.
- `data/distances.json` contains distances in km calculated from **made-up map coordinates** (straight line, rounded up to 0.1 km). They are **not real road distances**.
- Checks run on the files by the Node test script: 56 distances (8 places x 7 others), none missing, all symmetric (A to B equals B to A), and the triangle rule holds for every set of three places. The demo data follows the triangle rule (A to C is never longer than A to B plus B to C), so detours are never negative.
- **Decision on the triangle rule:** the loader does **not** enforce it. A hand-written table of real road distances can break it slightly, and enforcing it would make the app refuse to start. If a table breaks it, the engine treats a negative detour as 0 (section 8). The Node tests check that our demo data follows the rule and that the validator does not reject tables that break it. This is a documented limitation.
- `loadLocations()` and `loadDistances()` return a **copy** of the cached data. A module that changes what it received cannot damage the original.
- **[ASSUMPTION]** Rules enforced when the JSON is loaded (`validateLocationList`, `validateDistanceTable`): every location has a unique id and a name; every location has a row; every pair of different places has a distance; each distance is a number greater than 0 (negative, zero, text, null are rejected); no unknown ids; A to B and B to A differ by at most 0.05 km. A bad file makes `loadDistances()` throw an Error that names the problem, for example "Invalid distance data: Distance L03 to L05 is missing".
- `getDistance()` never throws. It returns `null` when the table is missing or malformed, an id is unknown or not text, a row is missing or not an object, or the distance is not a finite number greater than 0. Code that uses it must handle `null`: the request is skipped and the problem is logged.
- Fare Rs 30/km, fuel price Rs 280/litre and driver fuel efficiency 12 km/litre used below are **[ASSUMPTION]** demo values. The SRS says the Administrator sets fare and fuel price, and the driver enters fuel efficiency, but gives no numbers.
- Numbers shown on the Figma screens (for example detour 1.8 km, profit Rs 318) are **illustrative placeholders**, not results of these formulas.

## 7. How detour and route compatibility are calculated

Terms: S = driver source, D = driver destination, P = passenger pickup, Q = passenger drop-off, d(X,Y) = distance from the table.

- **[SRS FR-07]** keep requests whose pickup and drop-off lie "along or near the route" and whose pickup time is inside the driver window. **The SRS does not say how to measure "along or near".**
- **[ASSUMPTION A1]** For one place X, via(X) = d(S,X) + d(X,D) - d(S,D). This is the extra km needed to pass through X. A place on the direct path has via = 0. via is never below 0 because of the triangle rule (the code should still clamp at 0 to be safe).
- **[ASSUMPTION A2]** A request is route compatible when via(P) <= max detour AND via(Q) <= max detour AND d(S,P) <= d(S,Q) AND pickup time is inside the window. The SRS itself only says "along or near the route" and "inside the time window". The condition d(S,P) <= d(S,Q) is **our own simplification**.
- **[SRS FR-08 + ASSUMPTION A3]** detour = d(S,P) + d(P,Q) + d(Q,D) - d(S,D). Requests with detour above the limit (default 5 km) are removed.
- **[SRS FR-09]** estimated fuel cost = detour / vehicle fuel efficiency (km per litre) x fuel price.
- **[SRS FR-10]** estimated profit = estimated fare - estimated fuel cost, where estimated fare = trip distance x per-km rate.
- **[ASSUMPTION A4]** "trip distance" is d(P,Q), the distance the passenger travels.

**What d(S,P) <= d(S,Q) really is:** a rough heuristic for our synthetic demo data. It is **not** a reliable route-direction check. In simple words: "the pickup must not be farther from the driver's start than the drop-off". Why it can be wrong:
- It only works if places lie roughly along a line from S to D. Our table is not a line.
- It ignores the destination side. Example: Market Square to City Mall passes (detour 3.7 km) although the drop-off, City Mall, is farther from the destination than the pickup. City Mall to Market Square is rejected (detour 4.5 km) although the passenger moves toward the destination.
- Equal distances pass.
- It uses no map, no road network and no time order.

A reliable version would need map coordinates or a road network. That is outside our project scope, so we keep this simple approximation and **do not claim real-world route accuracy**.

## 8. Scoring formulas [SRS gives the weights 25/25/20/30 only, formulas below are ASSUMPTIONS]

Each criterion is scored from 0 to 100 **[SRS]**. Scores are clamped between 0 and 100.

| Criterion (weight) | Recommended formula **[ASSUMPTION]** | Meaning |
|---|---|---|
| Route compatibility (25%) | 100 x (1 - (via(P) + via(Q)) / (2 x max detour)) | 100 = both places are on the direct path |
| Minimum detour (25%) | 100 x (1 - detour / max detour) | 100 = no extra driving |
| Fuel efficiency (20%) (our formula: fuel cost compared with fare) | 100 x (1 - fuel cost / fare) | 100 = fuel for the detour is tiny compared with the fare |
| Driver profitability (30%) | 100 x profit / highest profit among the remaining requests | 100 = best profit in this list |

Total score = (25 x route + 25 x detour + 20 x fuel + 30 x profit) / 100. Weights come from Settings.

### Do fuel efficiency and profitability overlap? Yes, partly.

- Fuel cost is used by both: profit = fare - fuel cost, and the fuel score uses fuel cost / fare.
- The detour is counted three times: directly (detour score), inside fuel cost (fuel score) and inside profit.
- The driver's km/litre is the same for every request, so it cannot separate two requests by itself. It only scales the fuel cost of each detour.
- They are not identical: profit also rewards a **longer paid trip** (bigger fare), while the fuel score rewards a **small detour compared with the trip**. But they are correlated, and a reader should know this.
- The SRS fixes four criteria with four weights, so we keep all four. **We should say honestly in the report that the criteria overlap and that this is a limitation of the SRS weights.** If possible, ask the instructor what "fuel efficiency" should mean.
- **Alternative (not recommended):** score fuel efficiency as paid distance / (paid distance + detour). It also depends on the detour, so the overlap stays.

### What the "fuel efficiency" score really measures

Three different things, kept apart:
1. **Vehicle fuel efficiency** is km per litre. The driver enters it in the profile.
2. **Estimated fuel cost** of the detour = detour / km per litre x fuel price (SRS FR-09 wording).
3. **Fuel score** = 100 x (1 - fuel cost / fare). This is a **normalized comparison used for ranking**, from 0 to 100. It is **not** a km/litre number.

Because the fuel cost uses km per litre, a more efficient vehicle has a lower fuel cost and so a higher fuel score. Vehicle efficiency therefore does affect the score, but the score itself measures "how much of the fare would the detour fuel eat". **The SRS gives the criterion name but no formula**, so the name "fuel efficiency" and our formula do not match exactly. This is a mismatch in wording, and the smallest correction is **naming only; the formula is unchanged**. In code and screens we use clear names: `detourFuelCost` for the money amount and `fuelCostScore` for the ranking score (shown to the driver as "Fuel efficiency (fuel cost vs fare)"). If the instructor expects a different meaning, ask before the engine is written.

### Safeguards in the calculation [ASSUMPTIONS, to be built into recommendationEngine.js and settings.js]

The SRS weights stay exactly 25 / 25 / 20 / 30. The engine must never rescale or change them. Only the Administrator can change them, and only within the SRS rules (each 10% to 40%, total 100%).

| Situation | Safeguard |
|---|---|
| Fare is 0 or less | Should not happen: requests are validated (pickup and drop-off differ) and the fare rate must be above 0. If it still happens, fuel score = 0 (no division by zero). No request is removed. **[A6]** |
| Profit is 0 or negative | The estimated profit is calculated, stored and shown as the real number (for a loss: "Estimated loss Rs 20.33"). It is never shown as a positive profit. The profit **score** is clamped to 0, so a loss gets 0 for the 30% profit criterion, not a negative number. The other three criteria still count, so such a request can still be ranked, but it loses the profit part. **No exclusion rule is added**, because the SRS excludes only requests above the detour limit. **[A7, decided in the review]** Real example from the demo data: City Mall to Park View has detour 4.6 km, fuel cost Rs 107.33, fare Rs 87.00, profit Rs -20.33. |
| Highest profit in the list is 0 or less | All profit scores = 0 (no division by zero). |
| Fuel cost is bigger than fare | Fuel score is clamped to 0. (The raw value in the example above is -23.4.) |
| via or detour comes out below 0 (data error) | Treated as 0. |
| Any score below 0 or above 100 | Clamped to 0 to 100. |
| `getDistance()` returns null | Request is skipped and logged. No crash. |
| maxDetourKm, farePerKm, fuelPrice, responseTimeoutMin not a number or 0 or less | Settings are invalid. The engine refuses to run, shows an error and logs it (SRS UC-05 "calculation or data error"). |
| Weights not 4 numbers, any weight outside 10 to 40, or total not 100 | Settings are invalid: refused by `settings.js` when saving and re-checked by the engine before use. No automatic repair. |
| Driver fuel efficiency (km per litre) is 0 or less | Recommendation is blocked with an error. Fuel cost would be infinite. |

`storage.js` only checks that settings have the right **types**. The business rules above belong to `settings.js` and the engine, which are not written yet.

### Worked examples (driver: Central Station to University Campus, 12 km/litre, fuel Rs 280/litre, fare Rs 30/km, max detour 5 km)

**Example 1: City Mall to University Campus** (driver goes Central Station to University Campus, direct 12.4 km)

- d(source, pickup) = 5.4, d(pickup, drop-off) = 8.7, d(drop-off, destination) = 0
- via(pickup) = 1.7 km, via(drop-off) = 0.0 km
- detour = 5.4 + 8.7 + 0 - 12.4 = **1.7 km** (limit 5 km)
- fuel cost = 1.7 / 12 x 280 = **Rs 39.67**
- fare = 8.7 x 30 = Rs 261.0, profit = 261.0 - 39.67 = **Rs 221.33**
- scores: route 83.0, detour 66.0, fuel 84.8, profit 100.0 (best profit among candidates = Rs 221.33)
- total = 0.25x83.0 + 0.25x66.0 + 0.20x84.8 + 0.30x100.0 = **84.2**

**Example 2: Park View to University Campus** (driver goes Central Station to University Campus, direct 12.4 km)

- d(source, pickup) = 8.1, d(pickup, drop-off) = 8.7, d(drop-off, destination) = 0
- via(pickup) = 4.4 km, via(drop-off) = 0.0 km
- detour = 8.1 + 8.7 + 0 - 12.4 = **4.4 km** (limit 5 km)
- fuel cost = 4.4 / 12 x 280 = **Rs 102.67**
- fare = 8.7 x 30 = Rs 261.0, profit = 261.0 - 102.67 = **Rs 158.33**
- scores: route 56.0, detour 12.0, fuel 60.7, profit 71.5 (best profit among candidates = Rs 221.33)
- total = 0.25x56.0 + 0.25x12.0 + 0.20x60.7 + 0.30x71.5 = **50.6**

**Example 3 (excluded): Hospital Road to University Campus**: detour = 5.4 + 12.9 + 0 - 12.4 = 5.9 km, which is more than the 5 km limit, so the request is removed before ranking (SRS FR-08). It never gets a score.

**Ranking of the three valid requests** (best profit = Rs 221.33):

| Request | Route | Detour | Fuel | Profit | Total |
|---|---|---|---|---|---|
| City Mall to University Campus | 83.0 | 66.0 | 84.8 | 100.0 | **84.2** |
| Market Square to Office Park | 83.0 | 60.0 | 76.1 | 67.0 | **71.1** |
| Park View to University Campus | 56.0 | 12.0 | 60.7 | 71.5 | **50.6** |

### Limitations of these formulas

1. **Profit score depends on the other requests.** The best request always gets 100 for profit.
   Now a new request Market Square to University Campus (profit Rs 246.67) arrives. It becomes the best-profit request, so the profit scores of the other three change even though those requests did not change:

   - City Mall to University Campus: profit score 89.7, total 81.1
   - Market Square to Office Park: profit score 60.1, total 69.0
   - Park View to University Campus: profit score 64.2, total 48.4
      The order can change in some cases, because the weight of profit compared with the other criteria moves.
2. **A request can win with a long but profitable trip** even if its detour is average.
3. **The detour limit appears in two scores and in the filter**, so changing it changes several things at once. This is expected.
4. **Straight-line demo distances** make everything neat. Real roads would give uglier numbers.
5. **No tie rule in the SRS.** **[ASSUMPTION A5]** if two totals are equal, the request with the earlier pickup time ranks first.
6. **Rounding:** show scores with 1 decimal place and compare totals before rounding.

## 9. What is still missing (honest status)

This ZIP is **only a starting skeleton**. It is **not** a working website.

- Not written: all pages (HTML) and styles beyond `tokens.css`: Login, Register, all dashboards and forms.
- Not written: every JS file in section 2 except `storage.js`.
- Not written: seed administrator account, password hashing, session timeout, monitoring timers.
- Not done: project test cases, test execution on the website, coverage evidence, GitHub Pages deployment, final PDF report, PPT.
- Not verified: the Figma frames have not all been inspected, and the diagrams have not been opened in draw.io by me. Only the XML was checked to be well formed.

## 10. Testing status: Node tests vs browser tests

| Kind | What exists | Status |
|---|---|---|
| **Automated Node tests** | `tests/storage.test.mjs` checks `js/storage.js` with a fake Local Storage and a fake fetch. Run `node tests/storage.test.mjs` in the project folder. | 124 checks pass, 0 fail (run in the author's environment). Anyone can rerun them. |
| **Browser tests** | None | **Not run.** No page exists yet. Real Local Storage, real fetch, real screens, responsive layout and the Figma match are all untested. |
| **Course test-case table (Phase 3)** | None | Not started. It must be run on the real website later. |

The Node tests do not prove that the website works. They only check one module in isolation.

## 11. Needs approval from Yahya and Sami

1. Passenger contact field (`phone`): add it, or show only the name (section 5). Status: PROPOSED, no code depends on it.
2. Formulas and assumptions A1 to A5 (sections 7 and 8). Only the naming of the fuel score changed; no formula or weight changed.
3. Saving approach: one key and a revision number, and the report wording "best effort, not guaranteed atomic" (section 4b).
4. `settings.js` as a separate file from `admin.js` (planned only, no file exists; it can be merged into `admin.js` if the group prefers).
5. Distance data rules (section 6), including "distance must be greater than 0", "symmetric within 0.05 km" and "triangle rule not enforced".
6. Demo defaults, labelled as demonstration assumptions: fare Rs 30/km, fuel Rs 280/litre, vehicle 12 km/litre. `vehicleSeats` is kept because it is in the SRS data model, and it is not used for any check.
7. Keeping `tests/` and `package.json` in the folder (only needed to run the Node tests).
8. **Requirement numbers.** Please check the table at the top of this file against the latest SRS file, which was not available to the author. Items marked "number to check" need the real number.

Already decided in the review and applied: negative-profit requests are not removed; the pickup/drop-off test stays a simple documented approximation; the fuel score keeps its formula and only gets clearer names.

## 12. Checks against the requirements named in the review (by reading our files, not by running a website)

| Requirement | What our files say | Result |
|---|---|---|
| FR-09 fuel cost vs fuel efficiency | Vehicle fuel efficiency is km per litre (driver profile). Estimated detour fuel cost = detour / km per litre x fuel price. They are kept as two separate things (section 8). The fuel score is a separate 0 to 100 ranking number. | Consistent |
| FR-10 profit | Estimated profit = estimated fare - estimated fuel cost. A loss stays negative and is shown as a loss. | Consistent |
| FR-14 and FR-16 | Sequence UC-07 starts with the driver pressing Confirm. The request is locked and saved only after that, inside the confirmation. Sequence UC-06 ends by only showing the recommendation. README steps 7 and 8 say the same. | Consistent |
| FR-17 timeout | In Sequence UC-07 the timeout branch only marks the recommendation Expired, logs it and tells the driver. The request stays Pending. No lock, no ride, no confirmation in that branch. The timer itself is not written yet. | Consistent in design |
| NFR-04 privacy | The recommendation record has no contact data. Only the first name and the locations are shown. A phone number (if approved) is read only after the confirmation was saved. | Consistent in design. Phone field still undecided. |
| NFR-05 usability | The Figma Recommendation screen has Confirm and Reject buttons directly on it (1 tap). Not tested in a browser. | Design only |
| NFR-08 integrity | One write with a revision number (section 4b). Best effort, not a real transaction. | Partly: best effort |
| NFR-10 transparency | The recommendation screen shows route match, detour, fuel cost, profit and score. Not built yet. | Design only |
