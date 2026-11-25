# Polestar Sales

Mobile-first CRM for the sales team: upload a master list, get clients ranked by priority, build a plan every morning, log visits, calls and texts, and see plan vs actual daily and weekly.

**Stack:** Next.js 16 (App Router, server actions) · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS)

## Setup

1. Create a Supabase project.
2. In **SQL Editor**, run every file in [`supabase/migrations/`](supabase/migrations/) in order (`0001`, `0002`, `0003`, …).
3. In **Authentication → Sign In / Providers**, turn off "Allow new users to sign up". Accounts are created by the admin only.
4. Create each sales member under **Authentication → Users → Add user** (email + password, "Auto confirm" on). A profile row is created automatically. To set their display name, add `{"full_name": "Ramesh Patel"}` as user metadata, or let them set it in the app.
5. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (**Project Settings → API**).
6. `npm install` then `npm run dev`, and open http://localhost:3000 (use your phone on the same network via your machine's IP to test on mobile).

## How it works

### Flow
1. **First login → upload master list** (`/onboarding`). Excel or CSV. Columns are auto-matched by header name (e.g. "Party Name", "Mobile No", "Last Visit" all work) and can be corrected before importing. A template is downloadable from the same screen.
2. **Every morning → Day Builder** (`/today`). Suggestions come from backlog and priority. The member picks a field area, ticks who to meet, call or text, can change the channel per client, adds anyone else, and confirms.
3. **During the day**: Call / WhatsApp buttons on each plan item, then **Log** the outcome. Unplanned work is logged from the **+** tab (field visit, call, text, including cold calls to new numbers).
4. **Field visit** (`/log`): area, existing clients met (picked from their own list, area first), and new offices approached. New offices are added to the client list as prospects.
5. **End of day**: "End my day" closes the plan. Unfinished items become *missed* and come back first tomorrow. If the member forgets, the plan closes automatically the next time they open the app.
6. **Reports** (`/reports`): daily plan vs actual vs target, and a weekly roll-up.

### No duplicate clients
- Two names are the same client if they match after ignoring case, spaces, punctuation and dots, a leading "M/s", and words like Pvt / Private / Ltd / Limited / LLP / Co / Company / & / The. So *"M/s Shree Ganesh Exports Pvt. Ltd."* = *"shree ganesh exports"*.
- The rule lives in `src/lib/company-key.ts` and in SQL `normalize_company()` (migration 0006); **keep them identical**. A unique index on `(owner_id, company_key)` enforces it in the database.
- **Uploading more clients** (Clients → Upload): the preview shows *new / already in your list / repeated in file*. Existing clients are **updated, never duplicated**: blanks are filled, and the newest dates and the higher shipment count win. Nothing already there is erased.
- Field-visit "new offices", cold calls and manual adds also reuse the existing client if the name matches.
- Test files: `sample-data/sample-master-list.xlsx` (250 clients) then `sample-master-list-batch2.xlsx` (80 rows = 50 new + 20 existing written differently + 10 repeats). Expected result: 300 clients. Regenerate with `node scripts/make-sample-data.mjs`.

### Uploading clients (yours and teammates')
- One upload: **Clients → Upload** (or Me → Upload more clients). **Every new client becomes an approval request** for its salesperson, the uploader included (with a salesperson column like "Sales Team", each row goes to that person; without it, all go to you). Clients already in your CRM are just updated. Requests keep every sheet column (shipments, dates, email…).
- **A client only appears in the CRM once it's approved and given a priority** (Top / Medium / Low). Until then it's hidden from client lists, the Day Builder, pickers and the untouched list. A banner, "N new clients waiting to join your CRM", stays on Today and Clients. Clients a rep adds by hand, from a cold call or on a field visit, appear immediately.
- Salesperson names are matched to accounts (full name in any case/spacing, or a unique first name). Unmatched names can be matched by hand or skipped, so **create each salesperson's account, with their full name, before uploading**.
- **Duplicates are checked across the whole team**, on screen and again on the server. A client already in anyone's list, or already awaiting anyone's approval, is skipped and listed, e.g. "SUPER VEDIC · with Deepak Singh".
- Teammates get a push notification and a **"N new clients for you"** banner. They approve per client or all at once. **Not mine** passes clients to another teammate, or removes them.
- Approved clients wait in **Set priority** (Top / Medium / Low) and aren't scheduled until set. The salesperson's choice always wins and can be changed on the client page.

### Management accounts (Director / VP)
- `profiles.role = 'admin'` makes an account a **management account**. It's set in SQL only; members can't change their role:
  `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'director@example.com');`
- Management accounts **don't sell**: no Today, Log, Day Builder, uploads, targets or templates. They're left out of salesperson dropdowns, performance cards and daily reminders. Their navigation is **Team · Clients · Messages · Rates**.
  - **Team:** weekly performance per salesperson. Tap one for their numbers, last 30 days of work, flags, and Message / Flag buttons.
  - **Clients:** the master list of every client (search, filter, Excel). Tap one for its details, owner and history, and **Flag this client**.
  - **Messages:** one conversation per salesperson, shared by all management accounts, plus **Message everyone**.
- **Flags** go to the salesperson as a notification, a red banner on Today and Clients, and a note on the client page. They **mark them done** with an optional reply, which management sees.
- Salespeople see everything from management under **Me → From management** (`/messages`) and can reply there.
- Management data comes only from `admin_*` functions and admin-aware row security on `flags` and `messages`.

### Priority (in SQL: `refresh_client_scores`)
- **Score 0–100** = shipment volume (60 pts, log scale relative to the member's biggest client) + shipment recency (40 pts: ≤30d 40, ≤90d 30, ≤180d 20, ≤365d 10).
- **Tier A = the focus list**: the member's top 60 clients by score (`profiles.focus_count`). **B** = the next 30% of the list, **C** = the rest. Clients with no shipments are always C.
- **Contact rule**: focus (A) clients are due 7 days after their last contact (`profiles.contact_every_days`). A promised follow-up makes them due sooner, never later. Prospects added in the app stay on the weekly rule for their first 60 days. **B and C clients are only scheduled when a follow-up is set.**
- **Untouched clients** (`/clients/untouched`): everyone not contacted in 60+ days (`profiles.stagnant_after_days`), or never, sorted by value. Filter by age, area and priority, then download as Excel. The Day Builder also offers the 5 most valuable untouched clients each day under "Revive old clients", unticked.

### Suggestions (`src/lib/suggestions.ts`)
- **Backlog first**: items missed in the last 14 days where the client hasn't been contacted since. Skipped 2+ times = flagged red.
- **Then due clients**, ranked by tier weight + days overdue (+ bonus for follow-ups due).
- **Channel**: A → meet, B → call, C → text, prospects → call. If a client is overdue by more than a full cadence, the channel is upgraded (text → call → meet).
- **Visits are grouped by area.** The busiest area is the default focus. Visit candidates elsewhere become calls for the day.
- Pre-selected up to the member's daily targets.

### Rates dashboard (`/rates`)
- Buy rates per lane (origin → destination, export or import) for **20', 40', 40' HC** (per container) and **co-load / LCL** (per CBM).
- **Shared with the whole team.** Any member can add or update a rate. Saving the same lane + container again overwrites it. Each rate shows who last updated it and when.
- **Suggested quote = buy + markup %**, rounded up. The markup is global and admin-only: `update app_settings set markup_pct = 12 where id = 1;`
- Each rate has a **validity date** (defaults to 7 days, `app_settings.rate_valid_days`). Rates expiring within a day are yellow; expired rates are hidden by default and marked "needs update".
- Tapping a rate opens a **profit calculator**: type the price you're quoting and the number of containers or CBM to see profit or loss.
- Only the person who last updated a rate can delete it.

### Field-day areas (`src/lib/areas.ts`)
- Approximate centre points for ~80 Mumbai / Thane / Navi Mumbai localities. "Andheri (E)", "andheri east" and "MIDC Andheri" all count as Andheri.
- Picking a field area keeps visits within **7 km** (`NEARBY_KM`) as visits, nearest first. It adds an **"Also near …"** group of clients close by who haven't been visited in 2+ weeks, unticked.
- Today's plan lists visits nearest-first, each with a Google Maps button. The field-visit client picker lists the area and nearby areas first.
- No map service is called. Add missing localities to `AREAS` as needed.

### Reminders (push notifications)
- Each member turns them on per phone under **Me → Reminders** and picks a morning and an evening time.
- **Morning:** "Build your day: N clients due · N follow-ups". **Evening:** "Close your day: N items still open". The evening reminder is skipped if the day is already closed.
- **iPhone:** works only once the app is added to the Home Screen (iOS 16.4+). Android Chrome works directly.
- Sending: `GET /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET` must be called **every 15 minutes** by a scheduler. Each reminder is sent at most once per member per day, and only within 3 hours of its time. Needs `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` on the server.

### WhatsApp templates
- Personal to each member (**Me → My WhatsApp templates**), with 4 starter templates given once.
- Placeholders: `{contact}` `{company}` `{my_name}` `{rates}`. `{rates}` lets you tick lanes and inserts **suggested quote** prices from the Rates dashboard. Buy rates never leave the server through this.
- The WhatsApp button on today's plan and on client pages opens the template picker, then WhatsApp with the message filled in, then **Log as sent**.

### Voice notes
- A mic button on notes fields (log sheet, cold call, field visit) uses the phone's built-in speech-to-text, in English (India) or Hindi. Nothing is recorded or stored. Most phones need internet for dictation.

### Offline mode
- `public/sw.js` keeps every page you open available without signal. Logging a visit, call or text with no signal saves it on the phone (`src/lib/offline-queue.ts`). It syncs automatically when the connection returns, with the date it actually happened.
- Each log carries a unique `client_ref`, so a retried log is never saved twice.
- Offline caching is **off on localhost** so development isn't affected. Signing out clears saved pages and warns about unsynced logs.

### Data & security
Every table has `owner_id` with row-level security, so a member can only read and write their own rows. All writes go through server actions that validate input.

### Placeholders to replace with real numbers
- Daily targets default to 6 meetings / 10 calls / 15 texts (editable per member under **Me**).
- Weekly target = daily × 6 working days (`WORKING_DAYS` in `src/lib/reports.ts`).
- Cadence and score weights live in `supabase/migrations/0001_init.sql` and `src/lib/suggestions.ts`.

## Project layout
```
src/app/(app)/today      Day Builder / plan / day summary
src/app/(app)/log        Field visit, call, text logging
src/app/(app)/clients    Client list, detail, add/edit
src/app/(app)/reports    Daily + weekly reports
src/app/(app)/settings   Name, targets, re-upload master list
src/app/onboarding       First-login master list upload
src/app/actions          Server actions (all writes)
src/lib                  Suggestions, reports, import parsing, dates (IST)
supabase/migrations      Schema, RLS, scoring + triggers
```
