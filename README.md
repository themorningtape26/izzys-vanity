# Izzy’s Vanity

A local, responsive beauty collection app in mauve, cream, cinnamon, and olive. No installation or build step required.

## Run

From Terminal:

```sh
cd /Users/j.averyt/Documents/Hermes/Brain/izzys-vanity
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://localhost:4173 in your browser. Stop with Ctrl-C. Use the same browser and address each time to retain access to the same collection. Opening index.html directly is not supported because the app uses JavaScript modules.

## Included

- Product photo upload with resizing to a maximum dimension of 1,400 pixels. Mobile browsers can offer a camera through their image picker.
- Product creation, editing, and deletion; names, brands, shades/scents, notes, status, opened dates, and label use-within periods.
- Makeup, eyes and brows, skincare, body and lotions, fragrance, hair care, and tools categories.
- Favorites, search, category filters, and sorting.
- Favorite brands organized into custom named lists, with optional shopping links.
- IndexedDB persistence and JSON backup/restore including photos. Restore validates the file and asks before replacing the collection.
- Responsive layout, labeled inputs, keyboard-accessible native dialogs, and empty states. Decorative beauty containers are CSS artwork; there are no sample products pretending to be Izzy’s collection.

## Current boundaries

This is a working browser-local first version, not a deployed or synced service. Data stays in this browser profile on this origin. Clearing browser data removes it; private browsing may discard it. Use Back up regularly. Backups contain the full collection and photos in plain JSON. Brand links open external shops; the app does not purchase anything. Photos do not automatically identify products; enter the product details manually. JPEG, PNG, and WebP are recommended; HEIC support depends on the browser. Opened dates and use-within periods are recorded only; there are no expiry notifications yet.

Google Fonts supplies the typefaces when online; local serif and sans-serif fallbacks work without it. No analytics or photo upload service is used.

For use across Izzy’s phone and computer, the next phase needs hosting, private sign-in, and shared photo/database storage. Nothing has been deployed, per the vault’s Codex rules.

## Verification

```sh
node --check app.js
node --test model.test.mjs
```

The automated tests cover backup roundtrips, rejecting unsafe links and photo formats, invalid/duplicate backup records, and combined search/filter behavior. Browser interaction and mobile camera testing still need a manual pass.

Manual acceptance: add a photo and product → reload → edit → favorite → filter/search → add brands to two lists → open a store link → export backup → restore backup → confirm products and photos → delete a test record. Check at phone and desktop widths.

## First demo on Vercel

Repository: https://github.com/themorningtape26/izzys-vanity (private).

1. In Vercel, choose **Add New → Project** and import `themorningtape26/izzys-vanity`. If it is missing, grant the Vercel GitHub app access to this repository.
2. Choose framework **Other**, root directory **./**, build command **npm run build**, and output directory **dist**. These build settings are already declared in `vercel.json`.
3. No environment variables or Supabase keys are needed for this demo.
4. Review and click **Deploy** yourself. The resulting Vercel URL can be opened on Izzy’s phone.

The GitHub repository is private, but Vercel site access is controlled separately. Check the deployment’s access settings before sharing. Each browser has its own collection; the demo does not sync. To move local demo data to the hosted URL, export a backup locally and restore it on the hosted site.

The Git integration normally deploys future pushes automatically. Review that setting before continuing development under the vault’s no-deployment rule.

### Supabase next phase

Create a separate Supabase project for Izzy’s Vanity when ready. Integration still needs private user authentication, row-level security for products and brand lists, a private photo bucket with owner-specific policies, and migration of existing browser records. Do not put a service-role key in the frontend. No Supabase resources have been created by this demo setup.

### Build and checks

`npm test` runs syntax and model checks. `npm run build` packages only the four browser app files into `dist/`; tests, documentation, and project metadata stay out of the published output. GitHub Actions runs both on pushes and pull requests, without deploying.
