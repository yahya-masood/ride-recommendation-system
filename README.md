# AI Enabled Ride Booking and Driver Route Recommendation System

Course project (SE1001-ITSE, Fall 2026) by Yahya Masood (25F-3036) and Sami Ahsan (25F-3098).

A browser-based simulation of the system in our SRS. A driver defines a route and time window, the system filters and ranks matching ride requests with a rule-based weighted score, and the driver must always confirm or reject the recommendation. The system never confirms a ride on its own.

This is a student project. Data is stored in the browser (Local Storage) and in mock JSON files. It is not a real backend, and the "AI" is a rule-based score, not machine learning.

## Project status
**Starting skeleton only. The website is not finished and no page exists yet.**

Done so far:
- `css/tokens.css`: colors and fonts from our Figma Style Guide
- `js/storage.js`: Local Storage and JSON loading with validation
- `data/locations.json` and `data/distances.json`: synthetic demo data
- `docs/`: design notes and three draw.io diagrams (Component diagram, two Sequence diagrams)
- `tests/storage.test.mjs`: automated Node tests for `storage.js` only

Not done yet: all HTML pages, the other JavaScript modules (auth, route plan, requests, recommendation engine, decision, notification, settings, admin, audit log, ride history, ui), browser testing, GitHub Pages deployment.

## How Our Recommendation System Works
1. **Driver creates a route and time window.** The driver picks a source and a destination from the location list and a start and end time.
2. **Passenger submits a ride request.** Pickup, drop-off, preferred pickup time and number of passengers. It is saved as "Pending".
3. **System checks route compatibility and time.** While the driver's window is active, a pending request is kept only if its pickup and drop-off are along or near the driver's route and its pickup time is inside the window. (Our route check is a simple approximation, see the limitations below.)
4. **System calculates detour, fuel cost and estimated profit.**
   - Detour = extra km needed to serve the request. A request above the maximum detour (default 5 km) is removed.
   - Estimated fuel cost = detour / vehicle fuel efficiency (km per litre) x fuel price.
   - Estimated profit = estimated fare (trip distance x rate per km) minus estimated fuel cost. A loss stays a negative number and is shown as a loss.
5. **System ranks the eligible requests** with the SRS weights: route compatibility 25%, minimum detour 25%, fuel efficiency 20%, driver profitability 30%. Each criterion is scored 0 to 100. The "fuel efficiency" score compares the detour's fuel cost with the fare; it is a ranking score, not a km/litre value.
6. **Driver receives the best recommendation** with the values behind its score (up to three alternatives can be viewed). If nothing suitable exists, the driver sees "no match available".
7. **Driver confirms or rejects.** If the driver rejects, the next best request is shown. If the driver does not answer within the timeout (default 2 minutes), the recommendation expires and the request goes back to Pending. A ride is never confirmed automatically.
8. **System locks the request only after confirmation.** On confirm, the request becomes "Confirmed", is linked to that driver and can not be offered to another driver, and the passenger is notified.

The calculation details and worked numbers are in `docs/architecture-and-data-schema.md`.

## Known Limitations of the Current Prototype
- **Synthetic data.** The 8 locations and all distances are made up for the demo. They are not real places or real road distances. Fare Rs 30/km, fuel price Rs 280/litre and vehicle efficiency 12 km/litre are demonstration assumptions, not official values.
- **Simplified route matching.** "Along or near the route" is checked with distances from a table, plus a rough rule that the pickup is not farther from the driver's start than the drop-off. This is not a reliable direction check and does not use maps or roads. We do not claim real-world route accuracy.
- **Local Storage is not a database.** It has no transactions and no locks. We save the request, recommendation and ride in one write with a revision number, which helps prevent double assignment inside one browser, but this is a best-effort demonstration. Different browsers or devices have separate data. A real system would need a backend and database for this.
- **Simulated security.** Password hashing, the 15-minute logout and the 2-minute timeout will run in the browser only. HTTPS comes from GitHub Pages. This is not real production security.
- **The SRS server requirements** (99% availability, daily backup, 500 users) can not be demonstrated in a static site.
- **Passenger contact detail** (UC-07 reveals it after confirmation) is not defined in the SRS data model. Whether to add a phone field is still undecided (see `docs/`).
- **Not implemented yet:** every page and every module except `storage.js`. Nothing has been tested in a browser.

## Run the automated tests (Node)
Needs Node.js 18 or newer. In the project folder:

    node tests/storage.test.mjs

It prints a pass/fail line per group and a total, and exits with code 1 if any check fails. These tests use a fake Local Storage and a fake fetch and check `storage.js` only. **They are not browser tests. No browser test has been run.**

## How to run the website locally (later)
1. Install the **Live Server** extension in VS Code.
2. Open the project folder, right-click `index.html` and choose **Open with Live Server**.

(`index.html` does not exist yet. Opening pages by double-click will not work later either, because browsers block loading JSON files from `file://`.)

## Live site
Not deployed yet. The link will be added here after GitHub Pages is set up and checked.

## Folder structure
- `css/` styles
- `js/` JavaScript modules (`storage.js` is the only file that touches Local Storage)
- `data/` mock JSON files (synthetic)
- `docs/` report material and diagrams
- `tests/` Node test script
- `package.json` only lets Node run the tests as modules; the website does not need it
