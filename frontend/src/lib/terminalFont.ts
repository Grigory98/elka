export interface TerminalFontOption {
    family: string;
    label: string;
    /** System fonts are not bundled with the app and may be missing on the host. */
    system: boolean;
}

export const DEFAULT_TERMINAL_FONT_FAMILY = "Cascadia Code";

/**
 * Fonts offered for the terminal.
 *
 * xterm paints every glyph into a cell of a fixed width, so the cell has to be measured from the very
 * font that ends up drawing it. A proportional family cannot satisfy that at all, which is why the
 * application fonts are not offered here even though the UI is free to use them.
 */
const SYSTEM_TERMINAL_FONTS: TerminalFontOption[] = [
    {family: "Cascadia Code", label: "Cascadia Code", system: true},
    {family: "Menlo", label: "Menlo", system: true},
    {family: "Consolas", label: "Consolas", system: true},
    {family: "DejaVu Sans Mono", label: "DejaVu Sans Mono", system: true},
];

/** Monospace families bundled with the app, and therefore available everywhere. */
const BUNDLED_TERMINAL_FONTS: TerminalFontOption[] = [
    {family: "JetBrains Mono", label: "JetBrains Mono", system: false},
    {family: "Fira Code", label: "Fira Code", system: false},
    {family: "Source Code Pro", label: "Source Code Pro", system: false},
    {family: "IBM Plex Mono", label: "IBM Plex Mono", system: false},
    {family: "Roboto Mono", label: "Roboto Mono", system: false},
    {family: "Martian Mono", label: "Martian Mono", system: false},
    {family: "Victor Mono", label: "Victor Mono", system: false},
    {family: "Ubuntu Mono", label: "Ubuntu Mono", system: false},
    {family: "Overpass Mono", label: "Overpass Mono", system: false},
];

export const TERMINAL_FONT_FAMILIES: readonly TerminalFontOption[] = [
    ...SYSTEM_TERMINAL_FONTS,
    ...BUNDLED_TERMINAL_FONTS,
];

/**
 * Every family the app resolves on the host, in the order the platform prefers them. A missing font
 * has to land on another monospace face rather than on the generic `monospace` keyword, because the
 * generic one is not guaranteed to exist on every system and would leave xterm measuring a different
 * face than the one that draws.
 */
const TERMINAL_FALLBACKS = [
    "Cascadia Code",
    "JetBrains Mono",
    "Source Code Pro",
    "Fira Code",
    "Menlo",
    "Consolas",
    "DejaVu Sans Mono",
    "Liberation Mono",
    "monospace",
];

/** Anything outside a bare identifier has to be quoted for the CSS font shorthand to parse. */
function quote(family: string) {
    return /^[a-zA-Z0-9-]+$/.test(family) ? family : `'${family}'`;
}

/**
 * Settings files and older builds can name a font that is no longer offered, including proportional
 * application fonts. Falling back to the default keeps the terminal readable instead of leaving it
 * with a grid that cannot match its glyphs.
 */
export function resolveTerminalFontFamily(family: string) {
    return TERMINAL_FONT_FAMILIES.some((font) => font.family === family)
        ? family
        : DEFAULT_TERMINAL_FONT_FAMILY;
}

export function terminalFontStack(fontFamily: string) {
    const family = resolveTerminalFontFamily(fontFamily);
    const fallbacks = TERMINAL_FALLBACKS.filter((fallback) => fallback !== family);
    return [family, ...fallbacks].map(quote).join(", ");
}

/**
 * xterm measures the character cell from a hidden element inside the terminal and never measures it
 * again on its own, so a web font that arrives after `open()` leaves the grid sized for the fallback
 * face: the glyphs then render at the wrong pitch and drift out of their columns. Nothing inside xterm
 * waits for a font, so the wait has to happen here, before the terminal is opened.
 */
const FONT_PROBE_TEXT =
    // Latin, punctuation and the box drawing and block characters that full screen tools rely on.
    "MWilgj0@#$%&*(){}[]|\\~^_-+=<>?,.;:'\"/`─│┌┐└┘├┤┬┴┼═║╭╮╰╯█▀▄░▒▓●○◆✓✗→←↑↓" +
    // The interface is bilingual, so the Cyrillic faces have to be requested as well.
    "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя";

/** How long the terminal may wait for a font before it opens with whatever is available. */
const FONT_LOAD_TIMEOUT_MS = 2000;

/** In flight requests, so that a split view opening several panes fetches the face only once. */
const fontRequests = new Map<string, Promise<void>>();

function fontSpec(fontFamily: string, fontSize: number) {
    return `${fontSize}px ${terminalFontStack(fontFamily)}`;
}

/**
 * Resolves once the font is available to layout, so that measuring it produces real numbers. Never
 * rejects and never waits forever: a font that cannot be fetched must not keep the terminal closed.
 */
export async function ensureTerminalFontLoaded(fontFamily: string, fontSize: number) {
    const fontSet = document.fonts;
    if (!fontSet) return;

    const spec = fontSpec(fontFamily, fontSize);
    const inFlight = fontRequests.get(spec);
    if (inFlight) return inFlight;

    const request = fontSet.load(spec, FONT_PROBE_TEXT)
        // `load` resolves once the faces are fetched, while `ready` is what guarantees the layout has
        // been recomputed with them. A system font has no face to fetch and resolves immediately.
        .then(() => fontSet.ready.then(() => undefined))
        .catch((error) => console.warn("could not load the terminal font", spec, error))
        // Dropped once settled so that a request which failed on a flaky connection is retried.
        .finally(() => fontRequests.delete(spec));
    fontRequests.set(spec, request);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
        request,
        new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, FONT_LOAD_TIMEOUT_MS);
        }),
    ]);
    clearTimeout(timeout);
}

/**
 * Warms the bundled faces while the user is still on the hosts screen, so that opening a terminal
 * does not have to wait for the network on the very first session.
 */
export function preloadTerminalFonts(fontSize: number) {
    for (const font of BUNDLED_TERMINAL_FONTS) {
        void ensureTerminalFontLoaded(font.family, fontSize);
    }
}
