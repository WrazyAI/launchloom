const placements = {
  logo: "header",
  hero: "hero",
  secondary: "about",
  tertiary: "gallery",
  team: "team",
};

// A URL in serialized props, an attachment thumbnail, or another section is
// not evidence that the requested image replacement reached the live page.
export function revisionImageMatches(image, artifact, pageUrl) {
  if (!image?.visible || !(image.naturalWidth > 0) || !(image.naturalHeight > 0))
    return false;
  const expected = artifact.type === "asset" ? artifact.url : artifact.path;
  const placement = artifact.placement || placements[artifact.target];
  try {
    const actualUrl = new URL(image.src, pageUrl);
    const expectedUrl = new URL(expected, pageUrl);
    return actualUrl.origin === expectedUrl.origin &&
      actualUrl.pathname === expectedUrl.pathname &&
      (!placement || String(image.placement || "").split(/\s+/u).some((word) =>
        word === placement || word.split(/[-_]/u).includes(placement),
      ));
  } catch {
    return false;
  }
}
