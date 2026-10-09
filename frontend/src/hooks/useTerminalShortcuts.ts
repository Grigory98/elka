import { useEffect } from "react";
import { terminalNavigationSequence } from "@/lib/terminalKeys";
import { hasTerminalInput, sendTerminalInput } from "@/lib/terminalInput";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore, ViewType } from "@/store/uiStore";

// Elements that keep these keys for themselves: a text field uses them to move the caret, and an open
// dialog, menu or list runs its own navigation on them.
const OWNS_KEYS_SELECTOR = "[role='dialog'], [role='menu'], [role='listbox'], input, textarea, select, [contenteditable]:not([contenteditable='false'])";

function ownsKeys(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element?.closest) return false;
    // xterm keeps the focus on this hidden textarea, which is the terminal itself, not a text field.
    if (element.classList.contains("xterm-helper-textarea")) return false;

    return element.closest(OWNS_KEYS_SELECTOR) !== null;
}

/**
 * macOS keyboard shortcuts for the active terminal.
 *
 * The listener sits on the window in the capture phase instead of on a terminal instance, and the
 * sequence goes to whichever session is active. That is what makes cmd+left/right and
 * option+left/right work in a lone tab, in a tab group and in every split pane, without depending on
 * which part of the terminal view happens to hold the focus.
 */
export function useTerminalShortcuts(): void {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const sequence = terminalNavigationSequence(event);
            if (!sequence) return;
            if (useUIStore.getState().activeView !== ViewType.Terminal) return;
            if (ownsKeys(event.target)) return;

            const sessionID = useSessionStore.getState().activeSessionId;
            // Nothing is listening while the session is still dialling, and then the key must keep its
            // normal path instead of being swallowed.
            if (!sessionID || !hasTerminalInput(sessionID)) return;

            // xterm maps these keys itself once the event reaches its textarea, which happens after the
            // window: without stopping it here the sequence would reach the session twice.
            event.preventDefault();
            event.stopPropagation();
            sendTerminalInput(sessionID, sequence);
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, []);
}