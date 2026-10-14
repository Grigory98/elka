import { ensureFontStylesheet, TERMINAL_FONT_STYLESHEETS, withFontDeadline } from "@/lib/fontLoader";

export interface TerminalFontOption {
    family: string;
    label: string;
    /** System fonts are not bundled with the app and may be missing on the host. */
    system: boolean;
}
export const DEFAULT_TERMINAL_FONT_FAMILY = "Cascadia Code";

/**
 * Lines of scrollback a terminal keeps unless the user asks for another number.
 *
 * xterm keeps every scrollback line as three `Uint32` words per column, so the buffer grows with the
 * output rather than with the window: at 176 columns a thousand lines are about 6 MB, ten thousand
 * about 26 MB and a hundred thousand about 225 MB. The old build never passed the option at all and
 * inherited xterm's own thousand, which is a reasonable floor for a session nobody scrolls.
 */
export const DEFAULT_TERMINAL_SCROLLBACK = 1000;

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
 * has to land on another monospaced face rather than on the generic `monospace` keyword, because the
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

export function resolveTerminalFontFamily(family: string) {
    return TERMINAL_FONT_FAMILIES.some((font) => font.family === family)
        ? family
        : DEFAULT_TERMINAL_FONT_FAMILY;
}

export function terminalFontStack(family: string) {
    const resolved = resolveTerminalFontFamily(family);
    const fallbacks = TERMINAL_FALLBACKS.filter((fallback) => fallback !== resolved);
    return [resolved, ...fallbacks].map(quote).join(", ");
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

/**
 * Resolves once the terminal's font is available to layout, so that measuring it produces real
 * numbers. Never rejects and never waits forever: a font that cannot be fetched must not keep the
 * terminal closed.
 *
 * Only the requested family is fetched, never the fallback stack. `document.fonts.load` matches every
 * face named in a comma separated family list, so asking for the stack meant downloading the Latin,
 * Greek, Vietnamese and Cyrillic subsets of JetBrains Mono, Source Code Pro and Fira Code as well —
 * tens of megabytes of font data in the web content process, for a terminal that draws with one face.
 */
export async function ensureTerminalFontLoaded(fontFamily: string, fontSize: number) {
    const fontSet = document.fonts;
    if (!fontSet) return;

    // A system font has no stylesheet to fetch, so asking for it costs nothing.
    const family = resolveTerminalFontFamily(fontFamily);
    const stylesheet = TERMINAL_FONT_STYLESHEETS[family];
    const stylesheetReady = stylesheet ? ensureFontStylesheet(family, stylesheet) : Promise.resolve();

    const spec = `${fontSize}px ${quote(family)}`;
    const faceReady = stylesheetReady.then(() => fontSet.load(spec, FONT_PROBE_TEXT).then(() => undefined));

    await withFontDeadline(
        faceReady.catch((error) => console.warn("could not load the terminal font", spec, error))
    );
}

/**
 * Starts fetching a face without waiting for it, so a terminal can be opened against it later.
 *
 * The hosts screen calls this for the one family the user picked. Warming every bundled monospace
 * family instead, as the previous build did, put all nine of them and their Cyrillic subsets in the
 * webview before a single terminal had been opened.
 */
export function preloadTerminalFace(fontFamily: string, fontSize: number) {
    const family = resolveTerminalFontFamily(fontFamily);
    const stylesheet = TERMINAL_FONT_STYLESHEETS[family];
    if (stylesheet) void ensureFontStylesheet(family, stylesheet);
    const quoted = quote(family);
    void document.fonts?.load(`${fontSize}px ${quoted}`, FONT_PROBE_TEXT).catch(() => {});
}
