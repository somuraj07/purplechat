import { NextResponse } from "next/server";
import { identifyPartner, setPartnerSession } from "@/lib/auth";

export async function POST(request: Request) {
  const { code } = (await request.json().catch(() => ({}))) as {
    code?: string;
  };

  if (!process.env.PURPLECHAT_SESSION_SECRET) {
    return NextResponse.json(
      { error: "Session secret is missing. Set PURPLECHAT_SESSION_SECRET." },
      { status: 500 },
    );
  }

  if (!process.env.PURPLECHAT_CODE_YOU || !process.env.PURPLECHAT_CODE_PARTNER) {
    return NextResponse.json(
      { error: "Secret codes are not configured yet." },
      { status: 500 },
    );
  }

  const partner = identifyPartner(code || "");

  if (!partner) {
    return NextResponse.json(
      { error: "That secret code does not match." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true, partner });
  setPartnerSession(response, partner);

  return response;
}
