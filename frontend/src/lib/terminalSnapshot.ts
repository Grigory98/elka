import type { IBufferCell, IBufferLine, Terminal } from "@xterm/xterm";

/**
 * A terminal screen, kept as the sequence of escape sequences that draws it.
 *
 * A terminal is thrown away whenever its tab leaves the screen and rebuilt from this when it comes
 * back. Storing the drawn state instead of the byte stream that produced it is what makes such a tab
 * return looking untouched: the new terminal is painted exactly as the old one was, with its history,
 * its cursor and the modes the shell negotiated, so nothing is retyped, nothing is lost and nothing on
 * screen is wiped.
 *
 * Everything is read through the public buffer API, so no serialization addon is involved: the cells
 * carry their colours and attributes, and the modes the terminal is in are public as well.
 */
export interface TerminalSnapshot {
    /** The whole snapshot as one replayable stream. See `captureTerminalSnapshot`. */
    readonly stream: string;
}

const SGR_RESET = "\x1b[0m";

interface CellAttributes {
    fg: number;
    bg: number;
    fgRGB: boolean;
    bgRGB: boolean;
    fgDefault: boolean;
    bgDefault: boolean;
    bold: number;
    dim: number;
    italic: number;
    underline: number;
    blink: number;
    inverse: number;
    invisible: number;
    strikethrough: number;
    overline: number;
}

function readAttributes(cell: IBufferCell): CellAttributes {
    return {
        fg: cell.getFgColor(),
        bg: cell.getBgColor(),
        fgRGB: cell.isFgRGB(),
        bgRGB: cell.isBgRGB(),
        fgDefault: cell.isFgDefault(),
        bgDefault: cell.isBgDefault(),
        bold: cell.isBold(),
        dim: cell.isDim(),
        italic: cell.isItalic(),
        underline: cell.isUnderline(),
        blink: cell.isBlink(),
        inverse: cell.isInverse(),
        invisible: cell.isInvisible(),
        strikethrough: cell.isStrikethrough(),
        overline: cell.isOverline(),
    };
}

function sameAttributes(left: CellAttributes, right: CellAttributes) {
    return left.fg === right.fg
        && left.bg === right.bg
        && left.fgRGB === right.fgRGB
        && left.bgRGB === right.bgRGB
        && left.fgDefault === right.fgDefault
        && left.bgDefault === right.bgDefault
        && left.bold === right.bold
        && left.dim === right.dim
        && left.italic === right.italic
        && left.underline === right.underline
        && left.blink === right.blink
        && left.inverse === right.inverse
        && left.invisible === right.invisible
        && left.strikethrough === right.strikethrough
        && left.overline === right.overline;
}

function isDefault(attributes: CellAttributes) {
    return attributes.fgDefault && attributes.bgDefault
        && !attributes.bold && !attributes.dim && !attributes.italic && !attributes.underline
        && !attributes.blink && !attributes.inverse && !attributes.invisible
        && !attributes.strikethrough && !attributes.overline;
}

function colorSequence(value: number, isRGB: boolean, isDefaultColor: boolean, foreground: boolean) {
    if (isDefaultColor) return foreground ? "39" : "49";

    return isRGB
        ? `${foreground ? 38 : 48};2;${(value >> 16) & 0xff};${(value >> 8) & 0xff};${value & 0xff}`
        : `${foreground ? 38 : 48};5;${value}`;
}

function sgrFor(attributes: CellAttributes) {
    if (isDefault(attributes)) return SGR_RESET;

    const codes = [
        attributes.bold ? "1" : "",
        attributes.dim ? "2" : "",
        attributes.italic ? "3" : "",
        attributes.underline ? "4" : "",
        attributes.blink ? "5" : "",
        attributes.inverse ? "7" : "",
        attributes.invisible ? "8" : "",
        attributes.strikethrough ? "9" : "",
        attributes.overline ? "53" : "",
        colorSequence(attributes.fg, attributes.fgRGB, attributes.fgDefault, true),
        colorSequence(attributes.bg, attributes.bgRGB, attributes.bgDefault, false),
    ].filter(Boolean);

    return `\x1b[${codes.join(";")}m`;
}

/**
 * The cursor shape, which an application can change while it runs and which the terminal draws on the
 * restored screen without being asked. DECSCUSR: 1 is a blinking block, 2 a steady one, and so on.
 */
const CURSOR_STYLE_SEQUENCES: Record<string, {steady: string; blinking: string}> = {
    block: {steady: "\x1b[2 q", blinking: "\x1b[1 q"},
    underline: {steady: "\x1b[4 q", blinking: "\x1b[3 q"},
    bar: {steady: "\x1b[6 q", blinking: "\x1b[5 q"},
};

/**
 * The modes a shell turns on and then relies on. Restoring them matters most for the arrow keys: a
 * full screen application such as vim has the terminal in application cursor key mode, and one that
 * came back in normal mode would send the wrong sequences until the application repainted itself.
 */
function modeSequences(terminal: Terminal) {
    const modes = terminal.modes;
    return [
        modes.applicationCursorKeysMode ? "\x1b[?1h" : "\x1b[?1l",
        modes.applicationKeypadMode ? "\x1b[?66h" : "\x1b[?66l",
        modes.bracketedPasteMode ? "\x1b[?2004h" : "\x1b[?2004l",
        modes.insertMode ? "\x1b[4h" : "\x1b[4l",
        modes.originMode ? "\x1b[?6h" : "\x1b[?6l",
        modes.sendFocusMode ? "\x1b[?1004h" : "\x1b[?1004l",
        modes.wraparoundMode ? "\x1b[?7h" : "\x1b[?7l",
        modes.reverseWraparoundMode ? "\x1b[?45h" : "\x1b[?45l",
        mouseSequence(modes.mouseTrackingMode),
    ].join("");
}

function mouseSequence(mode: string) {
    switch (mode) {
        case "x10":
            return "\x1b[?9h";
        case "vt200":
            return "\x1b[?1000h";
        case "drag":
            return "\x1b[?1002h";
        case "any":
            return "\x1b[?1003h";
        default:
            return "\x1b[?1000l\x1b[?1002l\x1b[?1003l";
    }
}

/**
 * Renders one buffer line, emitting a select graphic rendition where the attributes change. The first
 * cell of a line always emits one, because a line break does not reset the rendition and the line above
 * may have ended in colour. A cell of width zero is the right half of a wide glyph and is skipped: the
 * glyph written before it already occupies both columns.
 */
function renderLine(line: IBufferLine, cols: number, scratch: IBufferCell) {
    let out = "";
    let current: CellAttributes | null = null;

    for (let x = 0; x < cols; x++) {
        const cell = line.getCell(x, scratch);
        if (!cell) continue;

        const width = cell.getWidth();
        if (width === 0) continue;

        const attributes = readAttributes(cell);
        if (!current || !sameAttributes(current, attributes)) {
            out += sgrFor(attributes);
            current = attributes;
        }

        out += cell.getChars() || " ";
        if (width === 2) x++;
    }

    return out;
}

/**
 * Builds the stream that reproduces the terminal as it looks right now.
 *
 * The history is written as ordinary lines, so the rebuilt terminal scrolls it into its own scrollback,
 * and the visible rows are then painted with an explicit cursor position instead of being scrolled in.
 * That keeps the screen exactly where it was whatever the history length, and keeps a snapshot from ever
 * looking like a `clear` followed by fresh output. It also means a history longer than the scrollback
 * setting only loses its oldest lines: the screen is positioned, not pushed along.
 */
export function captureTerminalSnapshot(terminal: Terminal): TerminalSnapshot {
    const buffer = terminal.buffer.active;
    const rows = terminal.rows;
    const cols = terminal.cols;
    const historyLines = buffer.baseY;
    const cursorRow = buffer.cursorY + buffer.baseY;
    const scratch = buffer.getNullCell();
    const parts: string[] = [];

    // The alternate buffer has no history behind it: it is the single screen an application owns.
    if (buffer.type === "alternate") parts.push("\x1b[?1049h");
    parts.push(modeSequences(terminal));

    const cursorStyle = (terminal.options.cursorStyle && CURSOR_STYLE_SEQUENCES[terminal.options.cursorStyle]) || CURSOR_STYLE_SEQUENCES.block;
    parts.push(terminal.options.cursorBlink ? cursorStyle.blinking : cursorStyle.steady);

    for (let y = 0; y < historyLines; y++) {
        const line = buffer.getLine(y);
        if (!line) continue;

        // A wrapped line is the tail of the logical line above it, so it is written straight after it
        // without a line break: the rebuilt terminal wraps it again on its own, exactly where the
        // original was split.
        parts.push(renderLine(line, cols, scratch));
        if (!line.isWrapped) parts.push("\r\n");
    }

    for (let row = 0; row < rows; row++) {
        parts.push(`\x1b[${row + 1};1H`);
        const line = buffer.getLine(historyLines + row);
        parts.push(line ? renderLine(line, cols, scratch) : "");
    }

    // The output that arrived while this tab was in the background is written right after the snapshot,
    // so the rendition the screen happened to end in must not follow it into those bytes.
    parts.push(SGR_RESET);
    parts.push(`\x1b[${cursorRow - historyLines + 1};${buffer.cursorX + 1}H`);

    return {stream: parts.join("")};
}

/** Restores a captured screen into an open, empty terminal. */
export function applyTerminalSnapshot(terminal: Terminal, snapshot: TerminalSnapshot) {
    terminal.write(snapshot.stream);
}