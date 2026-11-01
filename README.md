# XC Finish Line

Finish-line timing for cross country meets, built for three volunteers with phones or tablets. It runs in the browser, needs no accounts, and works with no signal once it has been opened.

- **Timer** (at the line): START for each race, then one tap per finisher. Two races can run at once; a switch at the top chooses which race the big button belongs to.
- **Schools** (at the line): one tap per finisher on that runner's school, in finish order.
- **Roster** (end of the chute): take the place card, tap the school, tap the name. The place follows the cards in order; enter the card number when someone arrives out of order.
- **Results** (organizer): the finish list and team scores as the phones upload them, for showing runners and coaches at the race.
- **Review** (organizer): check the merged lists, fix what the cross-checks flag, mark DNS/DNF, and send the table to the Google Sheet.

No roster, tap or result is ever stored in this repository or sent to a server. GitHub only delivers the app's code.

## The simple way: one Sheet, one season link

Connect a Google Sheet once (below). After that:

1. **Set up each meet in the app's Setup** (schools, rosters if you want names, races). Every change is saved to the Sheet by itself.
2. Press **Make this today's meet**. That is the whole hand-off.
3. Volunteers open the **season link** once, in September. Every race day they open the app with signal and it shows today's meet, with only Timer, Schools and Roster. No new links, ever.
4. The plain address of the app is always the full view: today's meet with Results, Review and Setup, and a home screen that lists every meet on the Sheet: open another one, mark one as today's, or delete one (which removes its setup, uploads and result tabs from the Sheet). A device of yours that has never opened the app needs the Sheet connected once: paste the web app link, or open the "link for your own other devices" from Setup.

The only thing that carries data is the Sheet, so a browser that cleared its storage, or a lost link, costs nothing: open the app, paste the Sheet's web app link, and everything is back.

Per-meet links (Setup, under "Backup") still exist for a phone that has no signal at the course and never opened the meet.

## Without a Sheet

1. Open the app, go to **Setup**, create the meet, add the schools and paste each roster (one runner per line, per race). Names can arrive as one cell or two, last name first or first name first; a setting above the rosters says which. They are stored and shown first name first and sorted by last name.
2. Press **Copy volunteer meet link** and text it to the volunteers. The link contains the rosters, so send it only to them. Send it again if you change anything.
   - A volunteer link always shows only Timer, Schools and Roster, on any device, including yours. The plain address always shows the full view. Every link carries the meet's code (shown in the header), so copies of a meet can be told apart.
3. Each volunteer opens the link once while they have a connection and waits for **Works offline** at the top.

## Race day

1. Every tap is saved on the phone the moment it happens. With the Sheet connected it is also pushed to the Sheet a second later, in the background.
2. Keep the phone awake and the app in front. Guided Access (iOS) or app pinning (Android) stops stray swipes.
3. After the race, Review on your device lists each phone and when it last uploaded, so nobody leaves with data still on their phone. Without the Sheet, each volunteer holds **Exit**, presses **Send**, and shows the code; you press **Scan a code** in Review.
4. If a camera will not cooperate, **Copy as text** on the volunteer's phone and **Paste a code** on yours does the same job.

## Google Sheet (optional, strongly recommended)

With a Sheet connected, nobody has to hand anything over and you can watch the race come in:

- Each phone pushes every tap to the Sheet about a second after it happens, while it has signal. Taps are always saved on the phone first; the upload runs in the background and never holds up a tap. The line under the buttons says what is on the phone and when the Sheet last got it.
- **Results** on the organizer's device shows each race's finish list (Place, Time, School, and Name once the Roster station is used) and team scores so far, refreshed every 5 seconds.
- Each meet's setup is saved on the Sheet as you edit it, and one meet is marked as today's. Volunteers' phones follow today's meet (on opening the app, when signal returns, when leaving a race screen, and every few minutes); a phone in the middle of a job is never switched. Organizer devices follow it too, unless you deliberately opened another meet.
- Review warns when phones are uploading to a different copy of the meet than the one open, and can switch to it.
- The QR codes remain as the backup for a phone with no signal.

One-time setup, on a computer:

1. Make a Google Sheet. Open **Extensions > Apps Script**.
2. In the app's **Setup**, press **Copy the script** (or open `apps-script/Code.gs` here), paste it over everything in the editor, and save.
3. **Deploy > New deployment**, type **Web app**, Execute as **Me**, Who has access **Anyone**. Deploy and approve the permission request. If "Anyone" is not offered, the Google account's organization blocks it; use a personal Google account for the Sheet.
4. Copy the web app link (it ends in `/exec`), paste it into **Setup**, and press **Test the connection**.
5. Send the meet link to volunteers. The link carries this setting.

When the script changes (the app says "older script"), paste the new one over the old and publish it with **Deploy > Manage deployments > Edit > Version: New version > Deploy**. The link stays the same.

Review can **Send results to the Sheet**, which writes each race to its own tab. The `XC uploads` tab holds the raw lists from each phone and each meet's setup, and can be left alone.

## How the lists are checked

- Finish time = tap time minus start time, both from the Timer device's own clock.
- Times and school taps are matched by time of day, after the constant offset between the two devices is estimated and removed. A missed or extra tap shows up as a place where the two lists stop matching.
- School taps and roster entries are matched by school sequence. The roster's school is used for the result; disagreements are listed.
- Place cards stay the authority on finish order. Enter the number handed out to compare counts.
- Scoring is chosen per meet in Setup: **Invitational** (everyone's raw place; top five score, sixth and seventh displace) or **Dual meet** (every pair of teams scored head to head with the other teams removed, each team's runners past its seventh dropped first; a team without five finishers loses by default). Both views show the result on the Results and Review tabs.
- Rostered runners with no place are listed and exported as DNS (or DNF if marked), but only once a race has at least one name recorded. A race run with Timer and Schools only exports Place, School and Time with no DNS rows.

## Changing the app

Plain files, no build step.

| File | What it holds |
|---|---|
| `index.html`, `styles.css` | page shell and styling |
| `logic.js` | matching, scoring, link and QR encoding (no screen code) |
| `app.js` | screens and on-device storage |
| `sw.js` | offline copy |
| `apps-script/Code.gs` | the Google Sheet side of the automatic upload |
| `vendor/` | QR generator and QR reader (see licenses there) |

After any change, **bump `VERSION` in `sw.js` and `APP_VERSION` in `app.js`** (the same value; it is shown at the bottom of the home screen and Setup). Phones keep the old copy until they open the app once with a connection after the new version is published.

Tests for the logic: `node test/logic.test.js`

## Hosting

GitHub Pages, served from the `main` branch root (Settings, Pages, Deploy from a branch).

## Third-party code

- `vendor/qrcode.js`: QR Code Generator for JavaScript, Kazuhiko Arase, MIT license.
- `vendor/jsQR.js`: jsQR, Cosmo Wolfe, Apache License 2.0.
