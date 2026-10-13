const FBP_RE = /^fb\.\d+\.\d+\.[A-Za-z0-9._-]+$/;
const FBC_RE = /^fb\.\d+\.\d+\.[A-Za-z0-9._-]+$/;
const FBCLID_RE = /^[A-Za-z0-9_-]{8,512}$/;
const MAX_LEN = 512;

export function validateFbp(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw || raw.length > MAX_LEN) return null;
  return FBP_RE.test(raw) ? raw : null;
}

export function validateFbc(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw || raw.length > MAX_LEN) return null;
  return FBC_RE.test(raw) ? raw : null;
}

export function fbcFromFbclid(fbclid: string | null | undefined, now = Date.now()) {
  const id = fbclid?.trim() ?? "";
  if (!FBCLID_RE.test(id)) return null;
  return validateFbc(`fb.1.${now}.${id}`);
}

export function readBrowserMetaCookies() {
  if (typeof document === "undefined") {
    return { fbp: null as string | null, fbc: null as string | null };
  }
  const map = new Map(
    document.cookie.split(";").map((part) => {
      const [name, ...rest] = part.trim().split("=");
      return [name, rest.join("=")] as const;
    }),
  );
  const fbp = validateFbp(map.get("_fbp"));
  const fbc =
    validateFbc(map.get("_fbc")) ??
    fbcFromFbclid(new URLSearchParams(window.location.search).get("fbclid"));
  return { fbp, fbc };
}
