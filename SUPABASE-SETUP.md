# Izzy’s Vanity: Supabase setup

These changes are prepared locally. They are not deployed. Review the diff in Claude before pushing: the connected GitHub repository can trigger a Vercel deployment.

## 1. Create a dedicated project

Create **Izzy’s Vanity** in Supabase, choose a nearby US region, save the database password privately, and leave the Data API enabled. Supabase does not import the app repository. Vercel hosts the app; Supabase provides login, database, and private photo storage.

From the project’s Connect/API settings, get the **Project URL** and **publishable key**. Neither the database password nor a service-role/secret key is needed by this app.

## 2. Create the database and storage rules

Open the Supabase SQL Editor. Run `supabase/schema.sql` once against this new dedicated project. It creates approved accounts, revision-controlled collection and draft documents, recognition quotas, and the private `vanity-photos` bucket with access policies.

## 3. Configure private login

In Authentication settings:

- Disable new public signups and anonymous sign-ins.
- Set Site URL to the app’s actual production origin, for example `https://izzys-vanity.vercel.app`.
- Add that exact origin to allowed redirect URLs. Add a separate localhost URL only for local testing.
- Create the intended user in Authentication → Users. Add its UUID to the approval table with the SQL below (replace the placeholder).

```sql
insert into public.vanity_accounts (user_id)
values ('USER-UUID-FROM-AUTHENTICATION')
on conflict do nothing;
```

An existing Auth user must also be approved in this table. The app cannot create arbitrary accounts. Using the same account on phone and computer shares the same collection; different accounts have separate collections.

**Email delivery:** Supabase’s built-in mail service has recipient and rate restrictions. Configure custom SMTP for reliable delivery to Izzy’s email, and test a real sign-in link. Creating a user does not establish that email delivery works.

## 4. Configure the app environment

Add these to the Vercel project’s environment settings and to a private `.env.local` for local testing:

```dotenv
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
# Optional: recognition is unavailable until both are configured.
ANTHROPIC_API_KEY=YOUR-SERVER-ONLY-KEY
ANTHROPIC_MODEL=YOUR-AVAILABLE-VISION-MODEL-ID
```

Only the Supabase URL and publishable key are returned to the browser. Anthropic credentials stay server-side. Never commit `.env.local`, database passwords, secret keys, or service-role keys. No service-role key is required.

Photo identification sends the resized product/label image to Anthropic. Suggestions require confirmation, preserve text already entered, and may be skipped. The database limits requests to 40 per approved user per UTC day; unsuccessful attempts after quota reservation also count.

## 5. Verify before release

Run the unit/database and browser tests from the repository. After review and James’s deployment, verify a real phone sign-in, product save and reload, draft recovery, private photo access, sign-out, and second-device access. Confirm an unapproved account cannot access the app or photos. Mocked browser tests do not verify live Supabase email, storage, or iOS behavior.

## Recovery and limitations

Drafts save on this device as fields change and sync after a short pause. Finished products save locally before cloud sync. Look for the cloud status; a device-only save is not yet accessible from another device. Startup requires a connection to authenticate and load the cloud collection.

Backups include products, photos, brand lists, and unfinished drafts. On a revision conflict, back up before choosing Load cloud: that action replaces pending device edits. Changes from another device appear after reloading; conflicting writes are rejected rather than silently overwriting them.

Removed product photos currently remain in the private storage bucket. Automatic orphan cleanup is not implemented. Avoid manually deleting bucket objects referenced by products or drafts.
