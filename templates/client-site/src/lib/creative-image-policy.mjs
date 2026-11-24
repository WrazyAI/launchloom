export const creativeImageSlots = Object.freeze({
  hero: ["hero", "image"],
  secondary: ["hero", "secondaryImage"],
  tertiary: ["hero", "tertiaryImage"],
  logo: ["brand", "logo"],
});

/** @param {unknown} value */
export function isSafeSealedImageUrl(value) {
  const url = String(value || "").trim();
  if (/^\/(?:images|assets|_astro)\/[A-Za-z0-9._~!$&'()*+,;=@%-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=@%-]+)*(?:\?[^\s#]*)?(?:#[^\s]*)?$/u.test(url)) {
    try {
      return url.split(/[?#]/u, 1)[0].split("/").every((segment) => {
        const decoded = decodeURIComponent(segment);
        return decoded !== "." && decoded !== ".." && !/[\\/\u0000-\u001f]/u.test(decoded);
      });
    } catch {
      return false;
    }
  }
  if (/^data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/iu.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      parsed.hostname === "assets.launchloom.wrazyos.com" &&
      parsed.username === "" && parsed.password === "" && parsed.port === "" &&
      parsed.pathname.startsWith("/") &&
      !parsed.pathname.split("/").some((part) => part === "." || part === "..");
  } catch {
    return false;
  }
}
