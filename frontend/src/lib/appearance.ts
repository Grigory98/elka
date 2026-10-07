import { DEFAULT_TERMINAL_FONT_FAMILY } from "@/lib/terminalFont";
import { ensureFontFamilyLoaded } from "@/lib/fontLoader";
import { ColorPalette } from "../../bindings/elka-desktop/backend/internal/services/settings";

export interface AppearanceSettings {
    appBackgroundColor: string;
    appForegroundColor: string;
    appAccentColor: string;
    appFontFamily: string;
    terminalBackgroundColor: string;
    terminalForegroundColor: string;
    terminalCursorColor: string;
    terminalCursorStyle: "block" | "underline" | "bar";
    terminalFontFamily: string;
    terminalFontSize: number;
    /**
     * How many lines a terminal keeps above the screen. Every line is real memory in every open tab, so
     * it is a setting rather than a constant, and it only takes effect on a terminal that is built after
     * the change: xterm sizes its buffer when the terminal opens.
     */
    terminalScrollback: number;
    /** Empty string keeps the split pane frame tied to the app theme. */
    splitPaneBorderColor: string;
    /** Left menu background. Empty string keeps the colour derived from the app palette. */
    sidebarColor: string;
    /** Background tint of the search and input fields. Empty string keeps the derived colour. */
    inputColor: string;
    /** Focus accent of the input fields. Empty string keeps the app accent colour. */
    ringColor: string;
    /** Header of a split pane. Empty string keeps a soft tint of the app background. */
    splitPaneHeaderColor: string;
    /** Text of the server metrics in the sidebar. Empty string keeps the theme derived contrast. */
    serverMetricsColor: string;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
    appBackgroundColor: "#09090b",
    appForegroundColor: "#fafafa",
    appAccentColor: "#e4e4e7",
    appFontFamily: "Geist Variable",
    terminalBackgroundColor: "#09090b",
    terminalForegroundColor: "#fafafa",
    terminalCursorColor: "#fafafa",
    terminalCursorStyle: "block",
    terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
    terminalFontSize: 14,
    terminalScrollback: 1000,
    splitPaneBorderColor: "",
    sidebarColor: "",
    inputColor: "",
    ringColor: "",
    splitPaneHeaderColor: "",
    serverMetricsColor: "",
};

/**
 * Presets for the palette dropdown.
 *
 * They carry the terminal colours too, because a palette that repainted the interface while leaving
 * the terminal on the previous background left the two halves of the window looking like different
 * applications. Each one can still be overridden field by field afterwards.
 *
 * Only Elka-Tone follows its own background in the terminal. The rest keep the terminal black on
 * purpose: it is the one part of the window that shows remote output, and tinting it after the app
 * chrome tinted the output too, which made the palette decide how a server log looked. A custom
 * palette is the user's own and is left free to pick any background.
 */
export const APP_COLOR_PALETTES = {
    dark: {
        appBackgroundColor: "#09090b",
        appForegroundColor: "#fafafa",
        appAccentColor: "#e4e4e7",
        terminalBackgroundColor: "#000000",
        terminalForegroundColor: "#fafafa",
        terminalCursorColor: "#fafafa",
    },
    light: {
        appBackgroundColor: "#f8fafc",
        appForegroundColor: "#111827",
        appAccentColor: "#334155",
        terminalBackgroundColor: "#000000",
        // The light theme is the odd one out: it is the only palette whose text colour is dark, and
        // dark text on the black terminal background this palette asks for came out at 1.18:1, i.e.
        // invisible. Inverting it against the app background keeps the terminal readable.
        terminalForegroundColor: "#f8fafc",
        terminalCursorColor: "#f8fafc",
    },
    navy: {
        appBackgroundColor: "#0b1220",
        appForegroundColor: "#e2e8f0",
        appAccentColor: "#38bdf8",
        terminalBackgroundColor: "#000000",
        terminalForegroundColor: "#e2e8f0",
        terminalCursorColor: "#e2e8f0",
    },
    green: {
        appBackgroundColor: "#071a12",
        appForegroundColor: "#dcfce7",
        appAccentColor: "#34d399",
        terminalBackgroundColor: "#000000",
        terminalForegroundColor: "#dcfce7",
        terminalCursorColor: "#dcfce7",
    },
    "elka-tone": {
        appBackgroundColor: "#1a1b2c",
        appForegroundColor: "#d6dde0",
        appAccentColor: "#00648e",
        terminalBackgroundColor: "#141728",
        terminalForegroundColor: "#1fb366",
        terminalCursorColor: "#92a0a7",
    },
} as const;

/**
 * Families offered for the interface itself. The terminal has its own, monospace only list in
 * `terminalFont.ts`, and Source Code Pro appears in both because a monospaced interface is a valid
 * choice.
 *
 * Every entry here has to cover the whole Russian alphabet in its bundled subsets. A family without
 * them renders the Russian interface through the system font instead, so Lato, Work Sans, DM Sans and
 * Plus Jakarta Sans were dropped rather than left to fail halfway through a word.
 */
export const FONT_FAMILIES = [
    {family: "Geist Variable", label: "Geist"},
    {family: "Inter", label: "Inter"},
    {family: "Roboto", label: "Roboto"},
    {family: "Open Sans", label: "Open Sans"},
    {family: "Montserrat", label: "Montserrat"},
    {family: "Noto Sans", label: "Noto Sans"},
    {family: "Source Sans 3", label: "Source Sans 3"},
    {family: "Nunito Sans", label: "Nunito Sans"},
    {family: "Nunito", label: "Nunito"},
    {family: "Rubik", label: "Rubik"},
    {family: "Raleway", label: "Raleway"},
    {family: "PT Sans", label: "PT Sans"},
    {family: "Mulish", label: "Mulish"},
    {family: "Jost", label: "Jost"},
    {family: "Ubuntu", label: "Ubuntu"},
    {family: "IBM Plex Sans", label: "IBM Plex Sans"},
    {family: "Manrope", label: "Manrope"},
    {family: "Fira Sans", label: "Fira Sans"},
    {family: "Commissioner", label: "Commissioner"},
    {family: "Onest", label: "Onest"},
    {family: "IBM Plex Mono", label: "IBM Plex Mono"},
    {family: "Roboto Mono", label: "Roboto Mono"},
    {family: "JetBrains Mono", label: "JetBrains Mono"},
    {family: "Fira Code", label: "Fira Code"},
    {family: "Source Code Pro", label: "Source Code Pro"},
] as const;

const APP_FONT_FAMILIES: readonly string[] = FONT_FAMILIES.map((font) => font.family);

/**
 * A font saved by an older build, or one that has since been dropped from the list, would leave the
 * settings dropdown showing nothing at all.
 */
export function resolveAppFontFamily(family: string) {
    return APP_FONT_FAMILIES.includes(family) ? family : DEFAULT_APPEARANCE.appFontFamily;
}

/**
 * A saved theme is a snapshot of the whole appearance, so these two functions are the only place that
 * knows which fields belong to a theme. The cursor style is validated on the way in because it is a
 * closed set that also reaches the backend as a plain string.
 */
export function appearanceToPalette(name: string, appearance: AppearanceSettings) {
    return {
        name,
        appBackgroundColor: appearance.appBackgroundColor,
        appForegroundColor: appearance.appForegroundColor,
        appAccentColor: appearance.appAccentColor,
        appFontFamily: appearance.appFontFamily,
        terminalBackgroundColor: appearance.terminalBackgroundColor,
        terminalForegroundColor: appearance.terminalForegroundColor,
        terminalCursorColor: appearance.terminalCursorColor,
        terminalCursorStyle: appearance.terminalCursorStyle,
        terminalFontFamily: appearance.terminalFontFamily,
        terminalFontSize: appearance.terminalFontSize,
        terminalScrollback: appearance.terminalScrollback,
        splitPaneBorderColor: appearance.splitPaneBorderColor,
        splitPaneHeaderColor: appearance.splitPaneHeaderColor,
        serverMetricsColor: appearance.serverMetricsColor,
        sidebarColor: appearance.sidebarColor,
        inputColor: appearance.inputColor,
        ringColor: appearance.ringColor,
    };
}

/**
 * Fields a theme saved by an older build does not carry keep their current value instead of being
 * reset: an absent font must not silently swap to the default when the theme is applied.
 */
export function paletteToAppearance(palette: ColorPalette, current: AppearanceSettings): AppearanceSettings {
    const cursorStyle = palette.terminalCursorStyle;
    return {
        ...current,
        appBackgroundColor: palette.appBackgroundColor,
        appForegroundColor: palette.appForegroundColor,
        appAccentColor: palette.appAccentColor,
        appFontFamily: palette.appFontFamily || current.appFontFamily,
        terminalBackgroundColor: palette.terminalBackgroundColor,
        terminalForegroundColor: palette.terminalForegroundColor,
        terminalCursorColor: palette.terminalCursorColor,
        terminalCursorStyle: cursorStyle === "underline" || cursorStyle === "bar" ? cursorStyle : current.terminalCursorStyle,
        terminalFontFamily: palette.terminalFontFamily || current.terminalFontFamily,
        terminalFontSize: palette.terminalFontSize || current.terminalFontSize,
        terminalScrollback: palette.terminalScrollback || current.terminalScrollback,
        splitPaneBorderColor: palette.splitPaneBorderColor || "",
        splitPaneHeaderColor: palette.splitPaneHeaderColor || "",
        serverMetricsColor: palette.serverMetricsColor || "",
        sidebarColor: palette.sidebarColor || "",
        inputColor: palette.inputColor || "",
        ringColor: palette.ringColor || "",
    };
}

// Mirrored in the inline splash script of index.html, which reads it before any bundle loads.
const APPEARANCE_STORAGE_KEY = "elka.appearance";

interface CachedAppearance {
    background?: string;
    foreground?: string;
    accent?: string;
    font?: string;
}

function relativeLuminance(color: string) {
    const hex = color.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return 0;
    const [red, green, blue] = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = [red, green, blue].map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function readableTextFor(color: string) {
    return relativeLuminance(color) > 0.45 ? "#09090b" : "#ffffff";
}

/**
 * The metrics in the sidebar sit straight on the application background, so their colour has to be
 * derived from it: a muted grey that reads fine on a dark theme disappears on a light one. The label
 * gets the same hue at lower contrast to keep the value readable first.
 */
function serverMetricsColors(appBackground: string, customColor: string) {
    const appIsDark = relativeLuminance(appBackground) < 0.4;
    const towards = appIsDark ? "#ffffff" : "#000000";

    const custom = customColor.trim();
    const value = custom || (appIsDark ? "#fafafa" : "#09090b");
    return {
        value,
        label: custom
            ? `color-mix(in oklab, ${custom} 55%, ${towards})`
            : `color-mix(in oklab, ${value} 62%, ${appBackground})`,
    };
}

/**
 * A split pane frame is drawn around the terminal, but it has to read against the application
 * background it sits in: light tones on dark themes, dark tones on light ones. A light frame would
 * disappear on a light theme, which is exactly what the previous palette did.
 */
function splitPaneBorderColors(appBackground: string, customColor: string) {
    const appIsDark = relativeLuminance(appBackground) < 0.4;
    const towards = appIsDark ? "#ffffff" : "#000000";

    const custom = customColor.trim();
    if (custom) {
        return {
            border: custom,
            active: `color-mix(in oklab, ${custom} 45%, ${towards})`,
        };
    }

    return appIsDark
        ? {border: "#52525b", active: "#e4e4e7"}
        : {border: "#6b7280", active: "#111827"};
}

export function applyAppAppearance(appearance: AppearanceSettings) {
    const root = document.documentElement;
    const {appBackgroundColor: background, appForegroundColor: foreground, appAccentColor: accent} = appearance;
    const card = `color-mix(in oklab, ${background} 91%, ${foreground})`;
    const muted = `color-mix(in oklab, ${background} 84%, ${foreground} 16%)`;
    const mutedForeground = `color-mix(in oklab, ${foreground} 68%, ${background})`;
    const border = `color-mix(in oklab, ${foreground} 14%, transparent)`;
    const accentForeground = readableTextFor(accent);

    root.style.setProperty("--background", background);
    root.style.setProperty("--foreground", foreground);
    root.style.setProperty("--card", card);
    root.style.setProperty("--card-foreground", foreground);
    root.style.setProperty("--popover", card);
    root.style.setProperty("--popover-foreground", foreground);
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--primary-foreground", accentForeground);
    root.style.setProperty("--secondary", muted);
    root.style.setProperty("--secondary-foreground", foreground);
    root.style.setProperty("--muted", muted);
    root.style.setProperty("--muted-foreground", mutedForeground);
    root.style.setProperty("--accent", `color-mix(in oklab, ${background} 78%, ${accent} 22%)`);
    root.style.setProperty("--accent-foreground", foreground);
    root.style.setProperty("--border", border);
    root.style.setProperty("--input", appearance.inputColor.trim() || `color-mix(in oklab, ${foreground} 20%, transparent)`);
    root.style.setProperty("--ring", appearance.ringColor.trim() || accent);
    root.style.setProperty("--sidebar", appearance.sidebarColor.trim() || card);
    root.style.setProperty("--sidebar-foreground", foreground);
    root.style.setProperty("--sidebar-primary", accent);
    root.style.setProperty("--sidebar-primary-foreground", accentForeground);
    root.style.setProperty("--sidebar-accent", muted);
    root.style.setProperty("--sidebar-accent-foreground", foreground);
    root.style.setProperty("--sidebar-border", border);
    root.style.setProperty("--sidebar-ring", accent);

    root.style.setProperty("--split-pane-header",
        appearance.splitPaneHeaderColor.trim() || `color-mix(in oklab, ${background} 90%, ${foreground})`);

    const serverMetrics = serverMetricsColors(background, appearance.serverMetricsColor);
    root.style.setProperty("--server-metrics", serverMetrics.value);
    root.style.setProperty("--server-metrics-label", serverMetrics.label);

    const splitPaneBorder = splitPaneBorderColors(background, appearance.splitPaneBorderColor);
    root.style.setProperty("--split-pane-border", splitPaneBorder.border);
    root.style.setProperty("--split-pane-border-active", splitPaneBorder.active);

    // The family is applied only once its face is in the document. Setting it straight away would
    // repaint the whole interface in the fallback face for as long as the fetch takes, and the fetch
    // happens on every font change in the settings. A family with no stylesheet is a system font, which
    // resolves immediately, and `ensureFontFamilyLoaded` never rejects, so the stack is always set.
    const fontStack = `"${appearance.appFontFamily}", sans-serif`;
    void ensureFontFamilyLoaded(appearance.appFontFamily).then(() => {
        root.style.setProperty("--font-sans", fontStack);
        root.style.setProperty("--font-heading", fontStack);
        root.style.setProperty("--app-font-family", fontStack);
        root.style.fontFamily = fontStack;
    });

    cacheAppearance(appearance);
}

/**
 * The splash screen in index.html paints before any bundle is parsed, so it cannot wait for the
 * settings request. Caching the palette lets it start in the user's theme instead of the dark default.
 */
function cacheAppearance(appearance: AppearanceSettings) {
    const {appBackgroundColor: background, appForegroundColor: foreground, appAccentColor: accent} = appearance;

    try {
        localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({
            background,
            foreground,
            accent,
            font: appearance.appFontFamily,
        }));
    } catch (error) {
        console.warn("could not cache the appearance for the splash screen", error);
    }
}

/**
 * The first render happens before the settings request resolves. Seeding the store with the cached
 * palette keeps the dark default from being painted over the theme the user picked.
 */
export function getInitialAppearance(): AppearanceSettings {
    let cached: CachedAppearance | null = null;

    try {
        const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
        cached = raw ? JSON.parse(raw) as CachedAppearance : null;
    } catch (error) {
        console.warn("could not read the cached appearance", error);
    }

    if (!cached) return {...DEFAULT_APPEARANCE};

    return {
        ...DEFAULT_APPEARANCE,
        appBackgroundColor: cached.background || DEFAULT_APPEARANCE.appBackgroundColor,
        appForegroundColor: cached.foreground || DEFAULT_APPEARANCE.appForegroundColor,
        appAccentColor: cached.accent || DEFAULT_APPEARANCE.appAccentColor,
        // Faces are fetched on demand, so the first paint asks for the family the user actually uses.
        // Reading it from the cache is what keeps the app from pulling the default face on the way to it.
        appFontFamily: resolveAppFontFamily(cached.font || DEFAULT_APPEARANCE.appFontFamily),
    };
}

// xterm themes take rgba strings, and the terminal text colour is stored as a hex the user picked, so
// the translucency has to be applied here. Anything unparseable falls back to the light default.
function withAlpha(color: string, alpha: number) {
    const hex = color.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return `rgba(250, 250, 250, ${alpha})`;
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function terminalSelectionColor(color: string) {
    return withAlpha(color, 0.3);
}

/**
 * The terminal scrollbar thumb is drawn by xterm itself, so unlike the native scrollbars it cannot be
 * reached from CSS and has to be tinted through the theme. Tying it to the text colour keeps it
 * readable on both the light and the dark palettes.
 */
export function terminalScrollbarColor(color: string, state: "rest" | "hover" | "active") {
    const alpha = state === "rest" ? 0.28 : state === "hover" ? 0.46 : 0.62;
    return withAlpha(color, alpha);
}
