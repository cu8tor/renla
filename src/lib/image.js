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
