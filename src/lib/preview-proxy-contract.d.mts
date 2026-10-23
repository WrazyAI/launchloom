export const PREVIEW_PROXY_PREFIX: string;
export const DEFAULT_PREVIEW_HOST_SUFFIX: string;
export function previewHostSuffixes(value?: string): string[];
export function isAllowedPreviewHost(
  host: string,
  suffixes?: string[],
): boolean;
export function previewProxyPath(
  target: URL | string,
  suffixes?: string[],
): string;
