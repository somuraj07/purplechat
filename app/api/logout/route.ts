import { NextResponse } from "next/server";
import { clearPartnerSession } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearPartnerSession(response);

  return response;
}
