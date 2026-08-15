const DEVICE_KEY = "renla:device:v1";
function getLocalDevice() {
  try {
    const raw = window.localStorage.getItem(DEVICE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* private mode — fall through */ }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const guess = /iPhone|iPad/i.test(ua) ? "iPhone / iPad"
    : /Android/i.test(ua) ? "Android phone"
    : /Mac/i.test(ua) ? "Mac"
    : /Windows/i.test(ua) ? "Windows PC" : "This device";
  const d = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())), label: guess };
  try { window.localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
  return d;
}


export { DEVICE_KEY, getLocalDevice };
