export type ClientFontCategory =
  | "serif"
  | "display-serif"
  | "sans"
  | "display-sans"
  | "mono";

export interface ClientFontFamily {
  id: string;
  name: string;
  category: ClientFontCategory;
  stack: string;
  weights: number[];
  italic: boolean;
  pairingHints: string[];
  googleFamily: string;
  googleAxes: string;
  license: { name: string; url: string };
}

export interface ClientFontFile {
  weight: number;
  style: "normal" | "italic";
  path: string;
}

export interface ClientFontPairing {
  id: string;
  label: string;
  heading: string;
  body: string;
}

export interface ResolvedFontPairing {
  heading: string | null;
  body: string | null;
  headingStack: string;
  bodyStack: string;
}

export declare const FONT_FAMILIES: readonly ClientFontFamily[];
export declare const FONT_FAMILY_IDS: readonly string[];
export declare const RECOMMENDED_PAIRINGS: readonly ClientFontPairing[];

export declare function fontFamilyById(id: string): ClientFontFamily | null;
export declare function fontStackFor(id: string, fallback?: string): string;
export declare function fontFilesFor(
  family: ClientFontFamily,
): ClientFontFile[];
export declare function fontFaceCss(): string;
export declare function resolveFontPairing(style?: {
  headingFont?: string;
  bodyFont?: string;
}): ResolvedFontPairing;
