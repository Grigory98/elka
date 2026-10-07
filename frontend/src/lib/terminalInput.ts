/**
 * Terminals register here the one function that writes into their SSH session.
 *
 * xterm only ever sees the key events that land on its own hidden textarea, and that element does not
 * hold the focus in every layout: a split pane, a tab group or the pane header can all leave the focus
 * somewhere else, and then the shortcut never reaches the terminal. Going through this registry lets a
 * shortcut find the session on its own, so it behaves the same in a lone tab, inside a group and in
 * every pane of a split workspace.
 */
type SendInput = (data: string) => void;

const senders = new Map<string, SendInput>();

export function registerTerminalInput(sessionID: string, send: SendInput): () => void {
    senders.set(sessionID, send);

    return () => {
        // A reconnect remounts the instance, so the late cleanup of the old one must not drop the
        // sender the new one has already put in place.
        if (senders.get(sessionID) === send) senders.delete(sessionID);
    };
}

export function hasTerminalInput(sessionID: string): boolean {
    return senders.has(sessionID);
}

export function sendTerminalInput(sessionID: string, data: string): void {
    senders.get(sessionID)?.(data);
}