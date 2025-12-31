export const isJWTFormat = (token) => {
  if (typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const base64UrlRegex = /^[A-Za-z0-9-_]+$/;

  // ✅ Validate HEADER & PAYLOAD only
  for (let i = 0; i < 2; i++) {
    const part = parts[i];

    if (!base64UrlRegex.test(part)) return false;

    try {
      // Convert Base64URL → Base64
      const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(
        Buffer.from(base64, "base64").toString("utf8")
      );

      if (typeof decoded !== "object") return false;
    } catch {
      return false;
    }
  }

  // ✅ Signature: ONLY Base64URL check (NO JSON parse)
  if (!base64UrlRegex.test(parts[2])) return false;

  return true;
};
