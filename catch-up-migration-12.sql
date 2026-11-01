-- =====================================================================
--  RENLA — catch-up migration 12: storage bucket size limits
--
--  Run ONCE in Supabase → SQL Editor → New query → Run.
--  Safe to re-run: it only updates four existing rows.
--
--  WARNING NOTE: Supabase's editor flags this as "destructive" because
--  it contains the word `update`. It updates four rows in
--  storage.buckets — the configuration of the buckets, not a single
--  stored file. Nothing is deleted and no existing upload is touched.
--
--  Why: every bucket was created with no size limit at all. The app now
--  shrinks images before upload and refuses oversized employee
--  documents, but a browser check only stops honest mistakes — anyone
--  calling the storage API directly could still push a 50 MB file into
--  a bucket whose contents Renla will happily re-download forever.
--
--  This is the lesson from the avatars: 8.92 MB profile photos put 66 MB
--  into storage and burned through 2 GB of egress in ten days, because
--  nothing anywhere said "that's too big." These limits are the backstop
--  that was missing.
--
--  The limits are deliberately generous — large enough that nobody
--  legitimately hits them, small enough that nothing pathological gets
--  through:
--
--    avatars        2 MB   client produces ~15–50 KB after downscaling
--    selfies        2 MB   client produces ~10–20 KB (180px, q0.55)
--    employee-docs  10 MB  matches EMPLOYEE_DOC_MAX_BYTES in supabase.js
--    documents      25 MB  matches the existing check in DocsPage.jsx
--
--  Existing files larger than these limits are NOT deleted or affected.
--  The limit applies to new uploads only.
-- =====================================================================

update storage.buckets set file_size_limit =  2 * 1024 * 1024 where id = 'avatars';
update storage.buckets set file_size_limit =  2 * 1024 * 1024 where id = 'selfies';
update storage.buckets set file_size_limit = 10 * 1024 * 1024 where id = 'employee-docs';
update storage.buckets set file_size_limit = 25 * 1024 * 1024 where id = 'documents';

-- Images only, for the two buckets that can only ever hold a photo. A
-- PDF or an HTML file has no business in either, and refusing them here
-- closes a small upload-anything hole as well as a size one.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('avatars', 'selfies');

-- Check the result: four rows, each with a limit.
select id, file_size_limit, allowed_mime_types
  from storage.buckets
 where id in ('avatars', 'selfies', 'employee-docs', 'documents')
 order by id;
