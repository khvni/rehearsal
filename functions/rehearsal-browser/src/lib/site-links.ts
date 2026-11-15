export function decodeCloudflareEmail(
  encoded: string | undefined,
): string | undefined {
  if (
    !encoded ||
    encoded.length < 4 ||
    encoded.length > 2050 ||
    encoded.length % 2 ||
    !/^[\da-f]+$/i.test(encoded)
  )
    return;
  const key = parseInt(encoded.slice(0, 2), 16);
  const bytes = Uint8Array.from(
    encoded.slice(2).match(/../g)!,
    (byte) => parseInt(byte, 16) ^ key,
  );
  try {
    const email = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const at = email.lastIndexOf("@");
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (
      email.length <= 254 &&
      at > 0 &&
      !/[\s\p{Cc}]/u.test(email) &&
      (/^[a-z\d!#$%&'*+/=?^_`{|}~\u0080-\u{10ffff}-]+(?:\.[a-z\d!#$%&'*+/=?^_`{|}~\u0080-\u{10ffff}-]+)*$/iu.test(
        local,
      ) ||
        /^"(?:[^"\\]|\\.)+"$/u.test(local)) &&
      /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?)*$/u.test(
        domain,
      )
    )
      return email;
  } catch {
    return;
  }
}

export function emailHref(email: string): string {
  const at = email.lastIndexOf("@");
  const local = encodeURIComponent(email.slice(0, at))
    .replace(/'/g, "%27")
    .replace(/%2B/gi, "+");
  return `mailto:${local}@${email.slice(at + 1)}`;
}

function decodedPath(url: URL): string {
  let path = url.pathname;
  for (let i = 0; i < 4 && /%[\da-f]{2}/i.test(path); i++) {
    try {
      path = decodeURIComponent(path);
    } catch {
      break;
    }
  }
  return path;
}

export function isCloudflareEmailUrl(url: URL): boolean {
  return /(?:^|\/)cdn-cgi\/l\/email-protection\/?$/i.test(decodedPath(url));
}

export function normalizeEmailLink(
  href: string,
  base: string,
  encoded?: string,
): string | undefined {
  try {
    const url = new URL(href, base);
    const email =
      decodeCloudflareEmail(encoded) ??
      (isCloudflareEmailUrl(url)
        ? decodeCloudflareEmail(url.hash.slice(1))
        : undefined);
    if (email) return emailHref(email);
    return isCloudflareEmailUrl(url) ? undefined : href;
  } catch {
    return;
  }
}

export function emailLinkLabel(label: string, href: string): string {
  let email = href.slice(7).split("?")[0];
  try {
    email = decodeURIComponent(email);
  } catch {
    /* Preserve readable labels for malformed existing mailto links. */
  }
  return href.startsWith("mailto:")
    ? label.replace(/\[email\s*protected\]/gi, () => email)
    : label;
}

export function isNonPageUrl(url: URL): boolean {
  const path = decodedPath(url);
  return (
    /(?:^|\/)cdn-cgi(?:\/|$)/i.test(path) ||
    /\.(?:md|mdx|markdown|txt|json|jsonl|csv|tsv|xml|ya?ml|rss|atom|pdf|epub|docx?|xlsx?|pptx?|od[pts]|rtf|png|jpe?g|gif|svg|webp|avif|heic|heif|ico|bmp|tiff?|mp[34]|mpeg|avi|mov|m4a|aac|flac|webm|ogg|wav|zip|gz|tgz|bz2|tar|rar|7z|woff2?|ttf|otf|eot|css|[cm]?js|map|wasm|webmanifest|bin|ics|dmg|exe|msi|pkg|deb|rpm|apk|iso)$/i.test(
      path,
    )
  );
}
