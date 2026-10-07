import type { TerminalSnapshot } from "@/lib/terminalSnapshot";

/**
 * Everything the interface knows about a session while nothing of it is on screen.
 *
 * A terminal is mounted only while its tab is visible, because a mounted xterm is by far the most
 * expensive thing in the web content process: its own buffer, its glyphs and a DOM tree per row. A tab
 * that stays open in the tab bar keeps its SSH session all the same, so two things stand in for the
 * terminal while it is away: a snapshot of the screen as it was left, and the output that arrived
 * meanwhile. Both are small next to a live terminal, and together they bring the tab back exactly as it
 * was, with everything that happened on the server in between.
 */
interface AttachedTerminal {
    write: (data: Uint8Array) => void;
    sendInput: (data: string) => void;
    /** Resolves once everything handed to xterm has been parsed, so a screen read after it is complete. */
    drain: () => Promise<void>;
    captureSnapshot: () => TerminalSnapshot;
    dispose: () => void;
}

const attached = new Map<string, AttachedTerminal>();
const snapshots = new Map<string, TerminalSnapshot>();
const outputBuffers = new Map<string, Uint8Array[]>();
/**
 * Tabs whose screen must not be remembered.
 *
 * Both callers of `forgetTerminalSession` ask for this: a closed tab has nothing to come back to, and a
 * reconnect gets a new shell, so the screen of the old one has to go with it. The terminal is torn down
 * after the request, not before it, so the request has to be recorded here to reach that teardown.
 */
const forgottenScreens = new Set<string>();

/**
 * How much output is kept for a tab that has no terminal. What arrives beyond this drops the oldest
 * bytes, which is the same rule the terminal's own scrollback follows: newer output wins, and the
 * screen of a full screen application repairs itself the next time it draws.
 */
const OUTPUT_BUFFER_LIMIT_BYTES = 512 * 1024;

/**
 * Tells the rest of the app that this session has a terminal on screen.
 *
 * The returned function is what the terminal calls on its way out, and it is asynchronous on purpose:
 * output handed to xterm moments before the tab was left can still be in its queue, and a screen read
 * before that is parsed is missing the last lines the server printed. So the queue is drained first, the
 * screen is read next, and only then does the terminal go away.
 *
 * The screen is only kept if this terminal is still the one on screen: a remount has its replacement
 * registered before the old teardown finishes, and what the replaced terminal drew is not the state of
 * anything.
 */
export function attachTerminal(sessionID: string, handle: AttachedTerminal): () => void {
    attached.set(sessionID, handle);
    // A request to throw a screen away only concerns the terminal that was on screen when it was made.
    // A tab that was in the background had none, so the request is stale by the time one arrives, and
    // this terminal is the first whose screen is worth keeping.
    forgottenScreens.delete(sessionID);

    return () => {
        if (attached.get(sessionID) !== handle) return;
        attached.delete(sessionID);

        void handle.drain()
            .catch((error) => console.warn("could not drain the terminal:", error))
            .then(() => {
                try {
                    // A replacement terminal can have registered while the queue was draining, in which
                    // case this one is already history and its screen is not anybody's state.
                    if (attached.has(sessionID)) return;
                    if (forgottenScreens.delete(sessionID)) snapshots.delete(sessionID);
                    else snapshots.set(sessionID, handle.captureSnapshot());
                } catch (error) {
                    console.warn("could not keep the terminal screen:", error);
                } finally {
                    handle.dispose();
                }
            });
    };
}

export function hasTerminalInput(sessionID: string): boolean {
    return attached.has(sessionID);
}

export function sendTerminalInput(sessionID: string, data: string): void {
    attached.get(sessionID)?.sendInput(data);
}

/** The single place server output arrives, whichever side of a tab switch it happens on. */
export function handleSshData(sessionID: string, data: Uint8Array) {
    const terminal = attached.get(sessionID);
    if (terminal) {
        terminal.write(data);
        return;
    }

    bufferOutput(sessionID, data);
}

/**
 * What the terminal missed while it was not mounted. It is taken, not copied: once it has been written
 * into the terminal there is no reason to keep it, and a tab that is opened and closed repeatedly must
 * not accumulate one buffer per visit.
 */
export function takeBufferedOutput(sessionID: string): Uint8Array | null {
    const chunks = outputBuffers.get(sessionID);
    if (!chunks || chunks.length === 0) return null;

    outputBuffers.delete(sessionID);
    if (chunks.length === 1) return chunks[0];

    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }
    return merged;
}

function bufferOutput(sessionID: string, data: Uint8Array) {
    const chunks = outputBuffers.get(sessionID) ?? [];
    chunks.push(data);
    outputBuffers.set(sessionID, chunks);

    let size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    while (size > OUTPUT_BUFFER_LIMIT_BYTES && chunks.length > 0) {
        const oldest = chunks[0];
        if (oldest.length <= size - OUTPUT_BUFFER_LIMIT_BYTES) {
            size -= oldest.length;
            chunks.shift();
        } else {
            // Half a chunk would be enough bytes on its own; taking the front of it keeps the newest
            // output whole instead of starting mid sequence wherever the limit happens to fall.
            chunks[0] = oldest.slice(size - OUTPUT_BUFFER_LIMIT_BYTES);
            size = OUTPUT_BUFFER_LIMIT_BYTES;
        }
    }
}

export function takeTerminalSnapshot(sessionID: string): TerminalSnapshot | null {
    return snapshots.get(sessionID) ?? null;
}

/**
 * Called when a tab is closed and before a reconnect. Both mean the screen is gone for good: a closed
 * tab has nothing to come back to, and a reconnect gets a new shell, so the terminal being torn down
 * right after this must not put its screen anywhere.
 */
export function forgetTerminalSession(sessionID: string) {
    forgottenScreens.add(sessionID);
    snapshots.delete(sessionID);
    outputBuffers.delete(sessionID);
}