# XC Finish Line

Finish-line timing for cross country meets, built for three volunteers with phones or tablets. It runs in the browser, needs no accounts, and works with no signal once it has been opened.

- **Timer** (at the line): START for each race, then one tap per finisher. Two races can run at once; a switch at the top chooses which race the big button belongs to.
- **Schools** (at the line): one tap per finisher on that runner's school, in finish order.
- **Roster** (end of the chute): take the place card, tap the school, tap the name. The place follows the cards in order; enter the card number when someone arrives out of order.
- **Results** (organizer): scan each volunteer's code, review the merged list, fix what the cross-checks flag, mark DNS/DNF, and copy the table into a Google Sheet.

No roster, tap or result is ever stored in this repository or sent to a server. GitHub only delivers the app's code.

## Before the meet

1. Open the app, go to **Setup**, create the meet, add the schools and paste each roster (one runner per line, per race). Names can arrive as one cell or two, last name first or first name first; a setting above the rosters says which. They are stored and shown first name first and sorted by last name. If a roster was entered the wrong way round, **Swap first and last** fixes it in place.
2. Press **Copy meet link** and text it to the volunteers. The link contains the rosters, so send it only to them. Send it again if you change anything.
3. Each volunteer opens the link once while they have a connection and waits for **Works offline** at the top. Adding it to the home screen is optional and gives a full-screen view.
   - Open the link in Safari or Chrome itself, not inside a mail or chat app's built-in browser.
   - Home screen on an iPhone or iPad: add it from the meet link, so the installed app starts with the meet loaded.

## Race day

1. Nothing is sent during the race. Every tap is saved on the phone the moment it happens.
2. Keep the phone awake and the app in front. Guided Access (iOS) or app pinning (Android) stops stray swipes.
3. After the race each volunteer holds **Exit**, presses **Send**, and shows the code. On your device open **Results**, press **Scan a code**, and read each one. The Collected table shows what you have, so nobody leaves with data still on their phone.
4. If a camera will not cooperate, **Copy as text** on the volunteer's phone and **Paste a code** on yours does the same job.

## Automatic upload to a Google Sheet (optional)

With this set up, nobody has to hand anything over. Taps are still saved on the phone first, and nothing is sent while someone is recording. A phone uploads its lists when it is quiet (the volunteer holds Exit, the last race on the Timer is ended, or two minutes pass with no taps) and has signal. Results on your device checks the Sheet every 20 seconds and pulls in whatever has arrived. The QR codes remain as the backup for a phone with no signal.

One-time setup, on a computer:

1. Make a Google Sheet. Open **Extensions > Apps Script**.
2. In the app's **Setup**, press **Copy the script** (or open `apps-script/Code.gs` here), paste it over everything in the editor, and save.
3. **Deploy > New deployment**, type **Web app**, Execute as **Me**, Who has access **Anyone**. Deploy and approve the permission request. If "Anyone" is not offered, the Google account's organization blocks it; use a personal Google account for the Sheet.
4. Copy the web app link (it ends in `/exec`), paste it into **Setup**, and press **Test the connection**.
5. Send the meet link to volunteers again. The link carries this setting.

Results can then **Send results to the Sheet**, which writes each race to its own tab. The `XC uploads` tab holds the raw lists from each phone and can be left alone. If the script is ever changed, publish it with **Deploy > Manage deployments > Edit > New version** so the link stays the same.

## How the lists are checked

- Finish time = tap time minus start time, both from the Timer device's own clock.
- Times and school taps are matched by time of day, after the constant offset between the two devices is estimated and removed. A missed or extra tap shows up as a place where the two lists stop matching.
- School taps and roster entries are matched by school sequence. The roster's school is used for the result; disagreements are listed.
- Place cards stay the authority on finish order. Enter the number handed out to compare counts.

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

After any change, **bump `VERSION` in `sw.js`**. Phones keep the old copy until they open the app once with a connection after the new version is published.

Tests for the logic: `node test/logic.test.js`

## Hosting

GitHub Pages, served from the `main` branch root (Settings, Pages, Deploy from a branch).

## Third-party code

- `vendor/qrcode.js`: QR Code Generator for JavaScript, Kazuhiko Arase, MIT license.
- `vendor/jsQR.js`: jsQR, Cosmo Wolfe, Apache License 2.0.
