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
    /** Empty string keeps the split pane frame tied to the app theme. */
    splitPaneBorderColor: string;
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
    terminalFontFamily: "Cascadia Code",
    terminalFontSize: 14,
    splitPaneBorderColor: "",
};

export const APP_COLOR_PALETTES = {
    dark: {
        appBackgroundColor: "#09090b",
        appForegroundColor: "#fafafa",
        appAccentColor: "#e4e4e7",
    },
    light: {
        appBackgroundColor: "#f8fafc",
        appForegroundColor: "#111827",
        appAccentColor: "#334155",
    },
    navy: {
        appBackgroundColor: "#0b1220",
        appForegroundColor: "#e2e8f0",
        appAccentColor: "#38bdf8",
    },
    green: {
        appBackgroundColor: "#071a12",
        appForegroundColor: "#dcfce7",
        appAccentColor: "#34d399",
    },
} as const;

export const FONT_FAMILIES = [
    {family: "Geist Variable", label: "Geist"},
    {family: "Inter", label: "Inter"},
    {family: "Roboto", label: "Roboto"},
    {family: "Open Sans", label: "Open Sans"},
    {family: "Lato", label: "Lato"},
    {family: "Montserrat", label: "Montserrat"},
    {family: "Noto Sans", label: "Noto Sans"},
    {family: "Source Sans 3", label: "Source Sans 3"},
    {family: "Nunito Sans", label: "Nunito Sans"},
    {family: "Work Sans", label: "Work Sans"},
    {family: "Ubuntu", label: "Ubuntu"},
    {family: "IBM Plex Sans", label: "IBM Plex Sans"},
    {family: "Manrope", label: "Manrope"},
    {family: "DM Sans", label: "DM Sans"},
    {family: "Plus Jakarta Sans", label: "Plus Jakarta Sans"},
    {family: "Fira Sans", label: "Fira Sans"},
    {family: "IBM Plex Mono", label: "IBM Plex Mono"},
    {family: "Roboto Mono", label: "Roboto Mono"},
    {family: "JetBrains Mono", label: "JetBrains Mono"},
    {family: "Fira Code", label: "Fira Code"},
] as const;

// Mirrored in the inline splash script of index.html, which reads it before any bundle loads.
const APPEARANCE_STORAGE_KEY = "elka.appearance";

interface CachedAppearance {
    background?: string;
    foreground?: string;
    accent?: string;
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
 * The split panes are framed with a tone that contrasts the app theme, yet stays readable on top of
 * the terminal background: light frame on dark themes, gray frame on light ones.
 */
function splitPaneBorderColors(background: string, customColor: string) {
    const custom = customColor.trim();
    if (custom) {
        return {border: custom, active: `color-mix(in oklab, ${custom} 45%, #ffffff)`};
    }

    return relativeLuminance(background) < 0.4
        ? {border: "rgb(255 255 255 / 0.28)", active: "rgb(255 255 255 / 0.7)"}
        : {border: "rgb(100 116 139 / 0.85)", active: "rgb(226 232 240 / 0.95)"};
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
    root.style.setProperty("--input", `color-mix(in oklab, ${foreground} 20%, transparent)`);
    root.style.setProperty("--ring", accent);
    root.style.setProperty("--sidebar", card);
    root.style.setProperty("--sidebar-foreground", foreground);
    root.style.setProperty("--sidebar-primary", accent);
    root.style.setProperty("--sidebar-primary-foreground", accentForeground);
    root.style.setProperty("--sidebar-accent", muted);
    root.style.setProperty("--sidebar-accent-foreground", foreground);
    root.style.setProperty("--sidebar-border", border);
    root.style.setProperty("--sidebar-ring", accent);

    const splitPaneBorder = splitPaneBorderColors(background, appearance.splitPaneBorderColor);
    root.style.setProperty("--split-pane-border", splitPaneBorder.border);
    root.style.setProperty("--split-pane-border-active", splitPaneBorder.active);

    const fontStack = `"${appearance.appFontFamily}", sans-serif`;
    root.style.setProperty("--font-sans", fontStack);
    root.style.setProperty("--font-heading", fontStack);
    root.style.setProperty("--app-font-family", fontStack);
    root.style.fontFamily = fontStack;

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
    };
}

export function terminalFontStack(fontFamily: string) {
    if (fontFamily === "Cascadia Code") return '"Cascadia Code", Consolas, monospace';
    return `"${fontFamily}", monospace`;
}

export function terminalSelectionColor(color: string) {
    const hex = color.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return "rgba(250, 250, 250, 0.3)";
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, 0.3)`;
}
