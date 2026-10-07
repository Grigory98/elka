/**
 * Font faces are fetched on demand.
 *
 * Every family the interface and the terminal can use used to be imported from main.css, so the
 * webview downloaded and parsed all of them at startup and then held them in memory for the rest of
 * the session. With dozens of families that is the largest single share of the web content process,
 * and none of it is on screen at the same time. Now only the faces that are actually shown are loaded:
 * the one the interface uses and the one the terminal measures with.
 *
 * A family that is missing from the table is a system font, and there is nothing to fetch for it: the
 * browser resolves it from the host and `document.fonts` settles immediately.
 */
type FaceLoader = () => Promise<unknown>;

/**
 * Both weights are loaded together because the terminal needs them as well: xterm asks the browser for
 * the bold face whenever a cell carries the bold attribute, and only 400 would leave every bold cell
 * falling back to another family.
 */
const FONT_FACES: Record<string, FaceLoader> = {
    "Geist Variable": () => import("@fontsource-variable/geist/index.css"),
    "Inter": () => Promise.all([import("@fontsource/inter/400.css"), import("@fontsource/inter/700.css")]),
    "Roboto": () => Promise.all([import("@fontsource/roboto/400.css"), import("@fontsource/roboto/700.css")]),
    "Open Sans": () => Promise.all([import("@fontsource/open-sans/400.css"), import("@fontsource/open-sans/700.css")]),
    "Montserrat": () => Promise.all([import("@fontsource/montserrat/400.css"), import("@fontsource/montserrat/700.css")]),
    "Noto Sans": () => Promise.all([import("@fontsource/noto-sans/400.css"), import("@fontsource/noto-sans/700.css")]),
    "Source Sans 3": () => Promise.all([import("@fontsource/source-sans-3/400.css"), import("@fontsource/source-sans-3/700.css")]),
    "Nunito Sans": () => Promise.all([import("@fontsource/nunito-sans/400.css"), import("@fontsource/nunito-sans/700.css")]),
    "Nunito": () => Promise.all([import("@fontsource/nunito/400.css"), import("@fontsource/nunito/700.css")]),
    "Rubik": () => Promise.all([import("@fontsource/rubik/400.css"), import("@fontsource/rubik/700.css")]),
    "Raleway": () => Promise.all([import("@fontsource/raleway/400.css"), import("@fontsource/raleway/700.css")]),
    "PT Sans": () => Promise.all([import("@fontsource/pt-sans/400.css"), import("@fontsource/pt-sans/700.css")]),
    "Mulish": () => Promise.all([import("@fontsource/mulish/400.css"), import("@fontsource/mulish/700.css")]),
    "Jost": () => Promise.all([import("@fontsource/jost/400.css"), import("@fontsource/jost/700.css")]),
    "Ubuntu": () => Promise.all([import("@fontsource/ubuntu/400.css"), import("@fontsource/ubuntu/700.css")]),
    "IBM Plex Sans": () => Promise.all([import("@fontsource/ibm-plex-sans/400.css"), import("@fontsource/ibm-plex-sans/700.css")]),
    "Manrope": () => Promise.all([import("@fontsource/manrope/400.css"), import("@fontsource/manrope/700.css")]),
    "Fira Sans": () => Promise.all([import("@fontsource/fira-sans/400.css"), import("@fontsource/fira-sans/700.css")]),
    "Commissioner": () => Promise.all([import("@fontsource/commissioner/400.css"), import("@fontsource/commissioner/700.css")]),
    "Onest": () => Promise.all([import("@fontsource/onest/400.css"), import("@fontsource/onest/700.css")]),
    "Source Code Pro": () => Promise.all([import("@fontsource/source-code-pro/400.css"), import("@fontsource/source-code-pro/700.css")]),
    "IBM Plex Mono": () => Promise.all([import("@fontsource/ibm-plex-mono/400.css"), import("@fontsource/ibm-plex-mono/700.css")]),
    "Roboto Mono": () => Promise.all([import("@fontsource/roboto-mono/400.css"), import("@fontsource/roboto-mono/700.css")]),
    "JetBrains Mono": () => Promise.all([import("@fontsource/jetbrains-mono/400.css"), import("@fontsource/jetbrains-mono/700.css")]),
    "Fira Code": () => Promise.all([import("@fontsource/fira-code/400.css"), import("@fontsource/fira-code/700.css")]),
    "Martian Mono": () => Promise.all([import("@fontsource/martian-mono/400.css"), import("@fontsource/martian-mono/700.css")]),
    "Victor Mono": () => Promise.all([import("@fontsource/victor-mono/400.css"), import("@fontsource/victor-mono/700.css")]),
    "Ubuntu Mono": () => Promise.all([import("@fontsource/ubuntu-mono/400.css"), import("@fontsource/ubuntu-mono/700.css")]),
    "Overpass Mono": () => Promise.all([import("@fontsource/overpass-mono/400.css"), import("@fontsource/overpass-mono/700.css")]),
};

/** In flight and settled requests, so a split view opening several panes fetches a face only once. */
const fontLoads = new Map<string, Promise<void>>();

export function isBundledFontFamily(family: string): boolean {
    return family in FONT_FACES;
}

/**
 * Resolves once the stylesheet carrying the family is in the document. Never rejects: a font that
 * cannot be fetched must not keep the terminal closed or the splash screen up, and the browser then
 * simply draws the family that is available.
 */
export function ensureFontFamilyLoaded(family: string): Promise<void> {
    const load = FONT_FACES[family];
    if (!load) return Promise.resolve();

    const inFlight = fontLoads.get(family);
    if (inFlight) return inFlight;

    const request = load()
        .then(() => undefined)
        .catch((error) => console.warn("could not load the font", family, error))
        // Dropped once settled, so a family that failed on a flaky connection is tried again later.
        .finally(() => fontLoads.delete(family));
    fontLoads.set(family, request);

    return request;
}