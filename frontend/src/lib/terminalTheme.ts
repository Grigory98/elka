import type { ITerminalOptions } from "@xterm/xterm";
import type { AppearanceSettings } from "@/lib/appearance";
import { terminalSelectionColor, DEFAULT_APPEARANCE } from "@/lib/appearance";
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
        },
        allowProposedApi: true,
    };
}
