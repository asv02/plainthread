import { NextResponse } from "next/server";
import {
  buildBrowserCapiEvent,
  parseBrowserCapiBody,
  readCapiJsonBody,
} from "@/lib/meta/browser-capi";
import { sendCapiEvents } from "@/lib/meta-capi";
import { log } from "@/lib/log";

export async function POST(request: Request) {
  const raw = await readCapiJsonBody(request);
  if (!raw.ok) {
    return NextResponse.json({ ok: false, code: raw.code }, { status: 400 });
  }
  const parsed = parseBrowserCapiBody(raw.value);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, code: parsed.code }, { status: 400 });
  }
  const event = buildBrowserCapiEvent(parsed.value, request);
  if ("error" in event) {
    return NextResponse.json({ ok: false, code: event.error });
  }
  const result = await sendCapiEvents([event]);
  if (!result.ok && result.code === "missing_access_token") {
    log.info("meta-capi", "skipped; no access token", { eventName: event.event_name });
    return NextResponse.json({ ok: false, code: result.code });
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code }, { status: 502 });
  }
  return NextResponse.json({ ok: true, event_id: event.event_id });
}
