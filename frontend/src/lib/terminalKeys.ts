import { isMac } from "@/lib/platform";

const LINE_START = "\x1b[H";
const LINE_END = "\x1b[F";
const WORD_BACKWARD = "\x1bb";
const WORD_FORWARD = "\x1bf";

export function terminalNavigationSequence(event: KeyboardEvent): string | null {
    if (!isMac() || event.shiftKey) return null;

    switch (event.code) {
        case "ArrowLeft":
            if (event.metaKey) return LINE_START;
            if (event.altKey && !event.ctrlKey) return WORD_BACKWARD;
            return null;
        case "ArrowRight":
            if (event.metaKey) return LINE_END;
            if (event.altKey && !event.ctrlKey) return WORD_FORWARD;
            return null;
        default:
            return null;
    }
}