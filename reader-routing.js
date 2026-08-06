export function isWebReader(locationLike = globalThis.location) {
  return locationLike?.protocol === "http:" || locationLike?.protocol === "https:";
}

export function requestedPoemId(locationLike = globalThis.location) {
  if (!isWebReader(locationLike)) return "";
  return new URL(locationLike.href).searchParams.get("poem")?.trim() ?? "";
}

export function syncPoemUrl(
  poemId,
  { locationLike = globalThis.location, historyLike = globalThis.history } = {},
) {
  if (!isWebReader(locationLike) || !poemId) return false;
  const url = new URL(locationLike.href);
  if (url.searchParams.get("poem") === poemId) return false;
  url.searchParams.set("poem", poemId);
  historyLike.replaceState({ poemId }, "", url);
  return true;
}
