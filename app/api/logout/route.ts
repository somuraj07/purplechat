import { NextResponse } from "next/server";
import { clearPartnerSession } from "@/lib/auth";

function isSecureRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");

  return forwardedProto
    ? forwardedProto.includes("https")
    : new URL(request.url).protocol === "https:";
}

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  clearPartnerSession(response, isSecureRequest(request));

  return response;
}
