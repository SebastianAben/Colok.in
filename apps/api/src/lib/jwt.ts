import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.js";

export type TokenKind = "access" | "refresh";

export type AuthTokenPayload = {
  sub: string;
  type: TokenKind;
};

const issuer = "colokin-api";
const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

function secretFor(type: TokenKind) {
  return type === "access" ? accessSecret : refreshSecret;
}

export async function signAuthToken(userId: string, type: TokenKind) {
  return new SignJWT({ type })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(type === "access" ? "15m" : "30d")
    .sign(secretFor(type));
}

export async function verifyAuthToken(
  token: string,
  expectedType: TokenKind,
): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, secretFor(expectedType), {
    issuer,
  });

  if (payload.type !== expectedType || typeof payload.sub !== "string") {
    throw new Error("Invalid token payload.");
  }

  return {
    sub: payload.sub,
    type: expectedType,
  };
}
