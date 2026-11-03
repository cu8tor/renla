# Why vercel.json looks like that

Vite puts a content hash in every filename under `/assets/`, so a given
asset URL can never change what it contains. Those are cached for a year
and marked `immutable`, which means the browser doesn't even revalidate.

`index.html` is the file that names those hashes. If it is cached, a
deploy leaves people on the previous bundle until they happen to
hard-reload — which is the "still failing when the fix is live" we
chased several times while building this, most memorably coming back
from a Paystack checkout to a billing page that had no Pay by card
button on it. So it revalidates on every request. It is 400 bytes;
there was never anything to save.

The second rule uses a negative lookahead rather than a plain catch-all
because every path rewrites to `index.html`, and header rules match the
request path, not the rewrite destination. Without it, `/assets/...`
would match both rules.

**Don't put `"//"` comment keys in vercel.json.** The schema is strict
about unknown properties and the deploy fails validation — which is what
happened the first time this file was written, hence this one.
