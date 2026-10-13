const IPV4 =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

export function trustedClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
  if (!first || first.length > 64) return null;
  if (IPV4.test(first)) return first;
  if (first.includes(":") && IPV6.test(first)) return first;
  return null;
}

export function requestUserAgent(request: Request) {
  const ua = request.headers.get("user-agent")?.trim() ?? "";
  if (!ua || ua.length > 512) return null;
  return ua;
}
