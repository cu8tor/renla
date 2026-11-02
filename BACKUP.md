# Backups

Customer data is the one thing in Renla that cannot be rebuilt. Code can be
rewritten, a Supabase project can be recreated, but an attendance record
from last Tuesday exists in exactly one place.

`.github/workflows/backup.yml` takes an encrypted dump of the database every
night at 02:17 UTC and keeps it as a GitHub artifact — deliberately not on
Supabase, so a problem with the Supabase project cannot take the backups
with it.

## Set up, once

Two secrets, in **Settings → Secrets and variables → Actions → New
repository secret**:

| Secret | Where it comes from |
|---|---|
| `SUPABASE_DB_URL` | Supabase → **Connect** → **Session pooler** → URI. Replace `[YOUR-PASSWORD]` with the database password (Settings → Database → reset it if you don't have it). |
| `BACKUP_PASSPHRASE` | A long random passphrase you generate. |

Two things about that URL. It has to be the **session** pooler on port
5432 — the transaction pooler on 6543 can't take a dump, and the direct
connection is IPv6-only, which GitHub's runners aren't. And the password
in it is the database password, not your Supabase account password.

**Keep the passphrase somewhere that is neither this repo nor Supabase.**
A password manager, written down at home — anywhere that doesn't disappear
in the same accident as the thing it protects. Without it the backups are
unreadable, including by you. That is the point of it, and it is also the
one way to lose everything while the backups are working perfectly.

Then go to **Actions → Database backup → Run workflow** and take one by
hand. If the secrets are right you'll get an artifact and a summary
table. If they're wrong you'll find out now rather than on the night you
need it.

## Before you run a migration

**Actions → Database backup → Run workflow**, and put the reason in the
label box — "before migration 17". It takes under a minute and the
snapshot is named for what it was protecting you from.

Worth the habit: a nightly backup protects you from last night, but a
migration that quietly drops the wrong column at 10am isn't noticed until
someone opens the app, and by then you're restoring to yesterday and
losing a morning.

## What is in a backup

Everything in the `public`, `auth` and `storage` schemas:

- every table and all its rows — companies, profiles, attendance, leave,
  wallet entries, billing
- the RLS policies and the security-definer functions, so the security
  model comes back with the data rather than needing to be reapplied
- `auth.users`, so people's logins still work after a restore
- `storage.objects` — the *records* of uploaded files

## What is not

- **The uploaded files themselves.** Avatars, employee documents and
  payment receipts live in Supabase Storage, and the dump has only the
  rows describing them. After a restore the records would point at files
  that aren't there. Avatars don't matter — staff re-upload. Documents and
  receipts do, and backing them up is the obvious next thing to add.
- **Project configuration.** Auth providers, SMTP settings, Edge Function
  secrets, the API keys. The functions themselves are in this repo; their
  secrets are not, and shouldn't be.
- **`pg_cron` jobs**, if you ever enable the monthly billing job. It lives
  in the `cron` schema, which isn't dumped. It's one job and it's written
  down in the migration.

## Restoring

Download the artifact from the Actions run, unzip it, then:

```sh
gpg --decrypt renla-db-2026-11-02T0217-scheduled.sql.gz.gpg | gunzip > renla.sql
```

**Everything, into a fresh Supabase project.** The dump drops each object
before recreating it, so this overwrites whatever is there:

```sh
psql "postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" \
  -f renla.sql
```

**One table, which is what you'll actually want.** Nine times in ten the
problem is one table with bad or missing rows, and replacing the whole
database to fix it would throw away every good change since the backup.
Pull just that table's rows out:

```sh
sed -n '/^COPY "public"."attendance"/,/^\\\.$/p' renla.sql > attendance.sql
```

Look at the file. Then, in the SQL editor or over psql, load it into a
temporary table and merge from there rather than truncating the live one —
truncate-and-reload also deletes everything added since the backup.

## The parts that fail quietly

- **GitHub turns off scheduled workflows after 60 days without a push to
  the repo.** It emails you first. If Renla goes two months without a
  commit, check that the schedule is still enabled.
- **A failed run emails the repo owner.** A run that succeeds against the
  wrong thing wouldn't, which is why the workflow checks the dump
  finished, is over 50KB, and contains `companies`, `profiles`,
  `attendance`, `leave_requests`, `company_settings`, `wallet_entries`
  and `billing_requests` before keeping it.
- **Supabase upgrading Postgres** breaks the dump, because an older
  `pg_dump` refuses a newer server. Bump `PG_IMAGE` in the workflow.
- **A backup you have never restored is a guess.** Restore one into a
  throwaway Supabase project once, now, while nothing is wrong. It is the
  only way to know the passphrase works, the file is complete, and you
  know the steps.

## What this doesn't replace

Supabase's own backups are a different kind of protection — their
infrastructure, their restore button, no passphrase to lose. The Free plan
has none; Pro ($25/mo) includes daily backups kept for 7 days, and
point-in-time recovery is an add-on above that.

The two cover different failures. Theirs is faster and easier when the
problem is recent and Supabase is healthy. This one is what you have if
the project is deleted, the account is locked, or you need something from
five weeks ago. Once Renla has paying customers, having both is the right
answer.
