import { create } from "zustand";
import { SSHConnectionConfig, SshService } from "../../bindings/elka-desktop/backend/internal/services/ssh";

export type ConnectionState = "connecting" | "ready" | "failed";

export interface SessionConnection {
    state: ConnectionState;
    /** Kept so that a terminal which mounts after the failure can still say why the session is dead. */
    error: unknown;
}

interface ConnectionStore {
    connections: Record<string, SessionConnection>;
    connect: (sessionID: string, config: SSHConnectionConfig) => void;
    reconnect: (sessionID: string, config: SSHConnectionConfig) => void;
    /** Drops the SSH session. Called when a tab is closed, and before a reconnect. */
    disconnect: (sessionID: string) => void;
    /** Drops the tracked state without touching the SSH session, which the backend has already closed. */
    forget: (sessionID: string) => void;
    isReady: (sessionID: string) => boolean;
}

/**
 * The SSH session lives here rather than in a terminal component.
 *
 * A terminal is only a view onto a session: it is mounted while its tab is on screen and thrown away
 * when the user looks at another tab, and a session that stays open in the tab bar has to keep its
 * connection through all of that. Tying the connection to the component made the two inseparable, so
 * the only way to free what a hidden terminal held was to close the session.
 */
export const useConnectionStore = create<ConnectionStore>((set, get) => {
    // The backend resolves once the shell is up and the session is registered, so this is the point
    // from which input and a resize are worth sending.
    const dial = (sessionID: string, config: SSHConnectionConfig) => {
        SshService.Connect(config)
            .then(() => set((state) => {
                const connection = state.connections[sessionID];
                if (!connection || connection.state === "ready") return state;
                return {
                    connections: {...state.connections, [sessionID]: {...connection, state: "ready", error: null}},
                };
            }))
            .catch((error) => set((state) => {
                const connection = state.connections[sessionID];
                // A tab closed while the handshake was running leaves nothing to report the failure to.
                if (!connection) return state;
                return {
                    connections: {...state.connections, [sessionID]: {...connection, state: "failed", error}},
                };
            }));
    };

    const put = (sessionID: string, connection: SessionConnection) => set((state) => ({
        connections: {...state.connections, [sessionID]: connection},
    }));

    const drop = (sessionID: string) => set((state) => {
        if (!state.connections[sessionID]) return state;

        const connections = {...state.connections};
        delete connections[sessionID];
        return {connections};
    });

    return {
        connections: {},

        connect: (sessionID, config) => {
            if (get().connections[sessionID]) return;

            put(sessionID, {state: "connecting", error: null});
            dial(sessionID, config);
        },

        reconnect: (sessionID, config) => {
            get().disconnect(sessionID);
            put(sessionID, {state: "connecting", error: null});
            dial(sessionID, config);
        },

        disconnect: (sessionID) => {
            if (!get().connections[sessionID]) return;

            drop(sessionID);
            SshService.Disconnect(sessionID).catch(() => {
                // Closing a tab on a session that is already gone is not worth reporting.
            });
        },

        forget: drop,

        isReady: (sessionID) => get().connections[sessionID]?.state === "ready",
    };
});