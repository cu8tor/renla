/* =====================================================================
   Client-side image downscaling.

   Why this exists: a profile picture picked from a phone's camera roll
   is typically 3–6 MB at 4000px wide. Renla never displays one larger
   than 72px, but the original was being uploaded whole and then
   re-downloaded in full every time that person's face appeared in a
   list — the directory, the leaderboard, "most punctual", birthdays.
   One HR admin opening the directory could pull tens of megabytes to
   render a row of 36px circles.

   The clock-in selfie path already did this correctly (180px, quality
   0.55, in AttendancePage's snap()). This brings avatars in line.
   ===================================================================== */

/* Downscale a data URL to a square of at most `size` px, centre-cropped,
   and re-encode as JPEG. Returns a new data URL.

   Falls back to the original on any failure — a slightly expensive
   upload is much better than a profile picture that won't save. */
export function downscaleToSquare(dataUrl, size = 320, quality = 0.82) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const side = Math.min(img.width, img.height);
          if (!side) return resolve(dataUrl);
          // Never upscale: a 120px photo stays 120px rather than being
          // blown up to 320 and gaining file size for no detail.
          const out = Math.min(size, side);
          const c = document.createElement("canvas");
          c.width = out; c.height = out;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
          resolve(c.toDataURL("image/jpeg", quality));
        } catch (e) {
          console.warn("[renla] avatar downscale failed on canvas", e);
          resolve(dataUrl);
        }
      };
      img.onerror = () => {
        console.warn("[renla] avatar downscale failed: image could not be decoded");
        resolve(dataUrl);
      };
      img.src = dataUrl;
    } catch { resolve(dataUrl); }
  });
}

/* Shrink a picked image File so it's a sensible size to store, WITHOUT
   cropping it. Returns a new File, or the original if it's already small
   enough, isn't an image, or can't be decoded.

   Deliberately different from downscaleToSquare above, in two ways that
   matter for documents:

   - No crop. An avatar can lose its edges; an ID card cannot. The whole
     frame is kept and only the scale changes.
   - A much larger target. 1600px on the long edge keeps the small print
     on a driving licence or an NIN slip readable, which is the entire
     point of the upload. That typically lands around 300–600 KB, from
     an original of 8–12 MB.

   Non-images (PDFs, Word files) pass straight through untouched —
   there's nothing useful to do to them in a browser, and a size cap
   handles the rest. */
export function shrinkImageFile(file, maxEdge = 1600, quality = 0.85) {
  return new Promise((resolve) => {
    try {
      if (!file || !file.type || !file.type.startsWith("image/")) return resolve(file);

      const url = URL.createObjectURL(file);
      const cleanup = () => { try { URL.revokeObjectURL(url); } catch { /* already gone */ } };

      const img = new Image();
      img.onload = () => {
        try {
          const { width: w, height: h } = img;
          if (!w || !h) { cleanup(); return resolve(file); }

          // Never upscale, and don't bother re-encoding something that's
          // already small — re-encoding a clean 200 KB scan can make it
          // bigger, not smaller.
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          if (scale === 1 && file.size <= 1_000_000) { cleanup(); return resolve(file); }

          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(w * scale));
          c.height = Math.max(1, Math.round(h * scale));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);

          c.toBlob((blob) => {
            cleanup();
            // If the re-encode somehow came out bigger, keep the original.
            if (!blob || blob.size >= file.size) return resolve(file);
            const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
            resolve(new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }));
          }, "image/jpeg", quality);
        } catch (e) {
          cleanup();
          console.warn("[renla] document image shrink failed on canvas", e);
          resolve(file);
        }
      };
      img.onerror = () => {
        cleanup();
        console.warn("[renla] document image shrink failed: image could not be decoded");
        resolve(file);
      };
      img.src = url;
    } catch { resolve(file); }
  });
}

/* For error messages — "12.4 MB" reads better than a byte count. */
export const prettySize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
