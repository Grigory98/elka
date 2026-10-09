import type { ITerminalOptions } from "@xterm/xterm";
import type { AppearanceSettings } from "@/lib/appearance";
import { terminalSelectionColor, terminalScrollbarColor, DEFAULT_APPEARANCE } from "@/lib/appearance";
import { terminalFontStack } from "@/lib/terminalFont";

export function createTerminalOptions(appearance: AppearanceSettings = DEFAULT_APPEARANCE): ITerminalOptions {
    return {
        fontFamily: terminalFontStack(appearance.terminalFontFamily),
        fontSize: appearance.terminalFontSize,
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
