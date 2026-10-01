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
  const region = image.placement || (image.placements || []).find((label) =>
    String(label).split(/[^a-z0-9]+/iu).some((word) => Object.values(placements).includes(word.toLowerCase())),
  ) || "";
  try {
    const actualUrl = new URL(image.src, pageUrl);
    const expectedUrl = new URL(expected, pageUrl);
    return actualUrl.origin === expectedUrl.origin &&
      actualUrl.pathname === expectedUrl.pathname &&
      actualUrl.search === expectedUrl.search &&
      (!placement || String(region).split(/\s+/u).some((word) =>
        word === placement || word.split(/[-_]/u).includes(placement),
      ));
  } catch {
    return false;
  }
}
