/**
 * Interface and terminal families are fetched one at a time, when they are first needed.
 *
 * Every one of them used to be `@import`ed from `main.css`. That made the webview download and decode
 * all of them on startup — 651 files, 343 faces, 29 families across their Latin, Cyrillic, Greek and
 * Vietnamese subsets — and hold them for the life of the process whether or not they were ever drawn
 * with. The files are still bundled; only the moment they are requested moved.
 */

/** Imports a stylesheet and resolves once the faces it declares can actually be laid out. */
export type FontStylesheetLoader = () => Promise<unknown>;

const stylesheetLoads = new Map<string, Promise<void>>();

/** How long a caller may wait for a face before it paints in the one it already has. */
const FONT_LOAD_TIMEOUT_MS = 2000;

/**
 * Brings one stylesheet into the document.
 *
 * The import has to be a literal for the bundler to find it, so the callers pass a loader rather than
 * a name. Concurrent callers share one fetch, and a settled entry is dropped so a family that failed
 * on a flaky connection is retried on the next request.
 */
export function ensureFontStylesheet(family: string, load: FontStylesheetLoader): Promise<void> {
    const inFlight = stylesheetLoads.get(family);
    if (inFlight) return inFlight;

    const request = load()
        // A stylesheet is only a declaration: `ready` is what says the layout has been recomputed with
        // the faces it added.
        .then(() => document.fonts.ready.then(() => undefined))
        .catch((error) => console.warn("could not load the font", family, error));

    stylesheetLoads.set(family, request);
    void request.finally(() => stylesheetLoads.delete(family));
    return request;
}

/** Races a face load against a deadline, so a slow download cannot hold up a repaint. */
export async function withFontDeadline(request: Promise<void>, timeoutMs: number = FONT_LOAD_TIMEOUT_MS) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
        request,
        new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, timeoutMs);
        }),
    ]);
    clearTimeout(timeout);
}

/**
 * The interface's default family, and the only one whose stylesheet lives in `main.css`.
 *
 * It is declared up front so it can be named in the document before anything has been fetched, which
 * is what the splash screen and the first paint rely on. It has no entry in the map below for the
 * same reason.
 */
export const DEFAULT_APP_FONT_FAMILY = "Geist Variable";

/** Every interface family except the default, mapped to the stylesheet that declares its faces. */
export const APP_FONT_STYLESHEETS: Record<string, FontStylesheetLoader | undefined> = {
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
    "IBM Plex Mono": () => Promise.all([import("@fontsource/ibm-plex-mono/400.css"), import("@fontsource/ibm-plex-mono/700.css")]),
    "Roboto Mono": () => Promise.all([import("@fontsource/roboto-mono/400.css"), import("@fontsource/roboto-mono/700.css")]),
    "JetBrains Mono": () => Promise.all([import("@fontsource/jetbrains-mono/400.css"), import("@fontsource/jetbrains-mono/700.css")]),
    "Fira Code": () => Promise.all([import("@fontsource/fira-code/400.css"), import("@fontsource/fira-code/700.css")]),
    "Source Code Pro": () => Promise.all([import("@fontsource/source-code-pro/400.css"), import("@fontsource/source-code-pro/700.css")]),
};

/**
 * The monospace families bundled for the terminal. The four that double as interface families are
 * served by the map above; the other four only ever draw terminal cells.
 */
export const TERMINAL_FONT_STYLESHEETS: Record<string, FontStylesheetLoader | undefined> = {
    ...APP_FONT_STYLESHEETS,
    "Martian Mono": () => import("@fontsource/martian-mono/400.css"),
    "Victor Mono": () => import("@fontsource/victor-mono/400.css"),
    "Ubuntu Mono": () => import("@fontsource/ubuntu-mono/400.css"),
    "Overpass Mono": () => import("@fontsource/overpass-mono/400.css"),
};

/**
 * Resolves once an interface family is usable, or once the wait is long enough to stop blocking a
 * repaint. The default family is already in the document, so it resolves without fetching anything.
 */
export async function ensureAppFontReady(family: string, timeoutMs: number = FONT_LOAD_TIMEOUT_MS) {
    const load = APP_FONT_STYLESHEETS[family];
    if (!load) return;
    await withFontDeadline(ensureFontStylesheet(family, load), timeoutMs);
}
