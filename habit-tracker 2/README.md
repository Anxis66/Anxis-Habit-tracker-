# Anxis habit and mindset tracker

Member-facing daily habit tracker (calendar, streaks, weekly non-negotiable)
plus an admin dashboard, backed by Airtable. Built to embed inside Whop as a
Web App experience.

## What's here

- `pages/index.js` — the member-facing tracker
- `pages/admin.js` — the admin dashboard (soft passcode gate — see note below)
- `pages/api/habits.js` — the only file that talks to Airtable. Holds your
  Airtable token server-side so it's never exposed in the browser.

## One-time setup (no coding required)

### 1. Get an Airtable personal access token

1. Go to https://airtable.com/create/tokens
2. Click **Create token**
3. Name it anything (e.g. "Habit Tracker App")
4. Under **Scopes**, add: `data.records:read` and `data.records:write`
5. Under **Access**, add the **Anxis Operations** base specifically
   (don't grant "all workspaces" — keep it scoped to just this base)
6. Click **Create token** and copy it — you won't see it again

### 2. Deploy to Vercel

1. Go to https://vercel.com and sign up (free) with GitHub, or drag-and-drop
   deploy this folder directly if you don't want to use GitHub
2. Import this project
3. Before the first deploy, add environment variables (Project Settings →
   Environment Variables):
   - `AIRTABLE_TOKEN` — the token you copied above
   - `AIRTABLE_BASE_ID` — `appf3APfG2HK8EgBH`
   - `AIRTABLE_HABITS_TABLE_ID` — `tbl60IvijqeQLO610`
4. Deploy. You'll get a URL like `https://anxis-habit-tracker.vercel.app`

### 3. Add it to Whop

1. Go to your Whop company dashboard
2. Create new experience → select **Web App**
3. Paste your Vercel URL
4. Attach it to your main product
5. Rename the experience "Habit Tracker" (or similar)

Members tap it in Whop and it opens full-screen, inside Whop, no new tab.

## Known limitations (v1 — accepted trade-offs)

- **Member identity**: members type their name once; it's remembered on
  that device via localStorage. Not verified against real Whop accounts.
  Fine for a small trusted group; someone could type the wrong name.
  Typos create a separate tracker for a "new" name — watch for near-duplicate
  names in the admin dashboard.
- **Admin gate**: `/admin` uses a simple passcode gate (any non-empty value
  currently works — edit the check in `pages/admin.js` to require a specific
  code before sharing that link). This is not real authentication. Don't
  share the admin URL publicly.
- **No live sync**: admin dashboard doesn't auto-refresh when a member
  checks a box. Reload the page to see new data.
- **Airtable rate limits**: fine up to a few hundred active daily users.
  Revisit the backend if the community scales past that.

## Updating fields later

If you add/rename fields in Airtable, update the `HABITS` array at the top
of `pages/index.js` and `pages/admin.js` to match — the `key` must exactly
match the Airtable field name.
