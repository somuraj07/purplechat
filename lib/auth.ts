import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export type PartnerSession = {
  id: "you" | "partner";
  name: string;
};

type SessionPayload = PartnerSession & {
  exp: number;
};

const COOKIE_NAME = "purplechat_session";
const SESSION_DAYS = 30;

function getSessionSecret() {
  return process.env.PURPLECHAT_SESSION_SECRET;
}

function sign(value: string) {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error("PURPLECHAT_SESSION_SECRET is not configured.");
  }

  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function encodeSession(payload: SessionPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function decodeSession(token: string): PartnerSession | null {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature || !safeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SessionPayload;

    if (!payload.id || !payload.name || payload.exp < Date.now()) {
      return null;
    }

    return {
      id: payload.id,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export function identifyPartner(secretCode: string): PartnerSession | null {
  const people = [
    {
      id: "you" as const,
      name: process.env.PURPLECHAT_NAME_YOU || "You",
      code: process.env.PURPLECHAT_CODE_YOU,
    },
    {
      id: "partner" as const,
      name: process.env.PURPLECHAT_NAME_PARTNER || "Partner",
      code: process.env.PURPLECHAT_CODE_PARTNER,
    },
  ];

  const enteredCode = secretCode.trim();

  if (!enteredCode || people.some((person) => !person.code)) {
    return null;
  }

  const match = people.find(
    (person) => person.code && safeEqual(enteredCode, person.code),
  );

  return match
    ? {
        id: match.id,
        name: match.name,
      }
    : null;
}

export async function getPartnerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    return decodeSession(token);
  } catch {
    return null;
  }
}

export function setPartnerSession(
  response: NextResponse,
  session: PartnerSession,
) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const token = encodeSession({
    ...session,
    exp: Date.now() + maxAge * 1000,
  });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    maxAge,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function clearPartnerSession(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
