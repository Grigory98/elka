import type { ITerminalOptions } from "@xterm/xterm";
import type { AppearanceSettings } from "@/lib/appearance";
import { terminalSelectionColor, terminalScrollbarColor, DEFAULT_APPEARANCE } from "@/lib/appearance";
import { terminalFontStack } from "@/lib/terminalFont";

/**
 * The number of scrollback lines a terminal may keep.
 *
 * xterm stores every line as a `Uint32Array` of three words per column, so the buffer is the one
 * part of a terminal whose size is set by how much output was printed rather than by how big the
 * window is: at 176 columns a thousand lines cost about 6 MB of live heap, ten thousand about
 * 26 MB and a hundred thousand about 225 MB. Anything above this is refused rather than clamped
 * silently, because a user who typed a number meant it.
 */
export const MAX_SCROLLBACK = 200000;

/** What a terminal falls back to when the setting is missing, negative or absurd. */
export function normalizeScrollback(scrollback: number | undefined | null): number {
    if (typeof scrollback !== "number" || !Number.isFinite(scrollback)) return DEFAULT_APPEARANCE.terminalScrollback;
    const rounded = Math.floor(scrollback);
    if (rounded < 0) return DEFAULT_APPEARANCE.terminalScrollback;
    return Math.min(rounded, MAX_SCROLLBACK);
}

export function createTerminalOptions(appearance: AppearanceSettings = DEFAULT_APPEARANCE): ITerminalOptions {
    return {
        fontFamily: terminalFontStack(appearance.terminalFontFamily),
        fontSize: appearance.terminalFontSize,
        scrollback: normalizeScrollback(appearance.terminalScrollback),
        cursorStyle: appearance.terminalCursorStyle,
        cursorBlink: true,
        theme: {
            background: appearance.terminalBackgroundColor,
            foreground: appearance.terminalForegroundColor,
            cursor: appearance.terminalCursorColor,
            selectionBackground: terminalSelectionColor(appearance.terminalForegroundColor),
            scrollbarSliderBackground: terminalScrollbarColor(appearance.terminalForegroundColor, "rest"),
            scrollbarSliderHoverBackground: terminalScrollbarColor(appearance.terminalForegroundColor, "hover"),
            scrollbarSliderActiveBackground: terminalScrollbarColor(appearance.terminalForegroundColor, "active"),
        },
        allowProposedApi: true,
    };
}
