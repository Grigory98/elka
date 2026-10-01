import { create } from "zustand";
import { SSHConnectionConfig, SSHJumpHostConfig, SSHPortForward, SshService } from "../../bindings/terminator-desktop/backend/internal/services/ssh";
import { useUIStore, ViewType } from "@/store/uiStore";

export const TERMINAL_SESSION_DRAG_TYPE = "application/x-terminator-session";
export const TERMINAL_TAB_ORDER_DRAG_TYPE = "application/x-terminator-tab-order";
export const SPLIT_WORKSPACE_TAB_ID = "workspace:split";

export function terminalSessionTabID(sessionID: string) {
    return `session:${sessionID}`;
}

export interface TerminalSession {
    id: string;
    title: string;
    config: SSHConnectionConfig;
}

export interface CreateSessionParams {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    privateKeyPassphrase?: string;
    jumpHost?: SSHJumpHostConfig;
    jumpHosts?: SSHJumpHostConfig[];
    portForwards?: SSHPortForward[];
    title?: string;
}

export type SplitPlacement = "left" | "right" | "above" | "below";

export type TerminalSplitLayout =
    | {type: "pane"; sessionId: string}
    | {type: "split"; direction: "horizontal" | "vertical"; ratio: number; first: TerminalSplitLayout; second: TerminalSplitLayout};

interface SessionState {
    sessions: TerminalSession[];
    activeSessionId: string | null;
    splitLayout: TerminalSplitLayout | null;
    splitSessionIds: string[] | null;
    splitWorkspaceActive: boolean;
    splitActiveSessionId: string | null;
    topTabOrder: string[];
    addSession: (params: CreateSessionParams) => void;
    addSessionToSplit: (id: string) => void;
    placeSessionBeside: (referenceID: string, sessionID: string, placement: SplitPlacement) => void;
    removeSessionFromSplit: (id: string) => void;
    setSplitRatio: (path: string, ratio: number) => void;
    setSplitWorkspaceActive: () => void;
    closeSplitWorkspace: () => void;
    reorderTopTab: (draggedID: string, targetID: string) => void;
    duplicateSession: (id: string) => void;
    closeOtherSessions: (id: string) => void;
    removeSession: (id: string) => void;
    setActiveSession: (id: string) => void;
    clearSessions: () => void;
}

function paneIDs(layout: TerminalSplitLayout | null): string[] {
    if (!layout) return [];
    if (layout.type === "pane") return [layout.sessionId];
    return [...paneIDs(layout.first), ...paneIDs(layout.second)];
}

function removePane(layout: TerminalSplitLayout | null, id: string): {layout: TerminalSplitLayout | null; removed: boolean} {
    if (!layout) return {layout: null, removed: false};
    if (layout.type === "pane") {
        return layout.sessionId === id ? {layout: null, removed: true} : {layout, removed: false};
    }

    const first = removePane(layout.first, id);
    if (first.removed) {
        if (!first.layout) return {layout: layout.second, removed: true};
        return {layout: {...layout, first: first.layout}, removed: true};
    }
    const second = removePane(layout.second, id);
    if (second.removed) {
        if (!second.layout) return {layout: layout.first, removed: true};
        return {layout: {...layout, second: second.layout}, removed: true};
    }
    return {layout, removed: false};
}

function insertPane(
    layout: TerminalSplitLayout,
    referenceID: string,
    sessionID: string,
    placement: SplitPlacement,
): {layout: TerminalSplitLayout; inserted: boolean} {
    if (layout.type === "pane") {
        if (layout.sessionId !== referenceID) return {layout, inserted: false};
        const newPane: TerminalSplitLayout = {type: "pane", sessionId: sessionID};
        const referencePane: TerminalSplitLayout = layout;
        const placeFirst = placement === "left" || placement === "above";
        return {
            layout: {
                type: "split",
                direction: placement === "left" || placement === "right" ? "horizontal" : "vertical",
                ratio: 0.5,
                first: placeFirst ? newPane : referencePane,
                second: placeFirst ? referencePane : newPane,
            },
            inserted: true,
        };
    }

    const first = insertPane(layout.first, referenceID, sessionID, placement);
    if (first.inserted) return {layout: {...layout, first: first.layout}, inserted: true};
    const second = insertPane(layout.second, referenceID, sessionID, placement);
    if (second.inserted) return {layout: {...layout, second: second.layout}, inserted: true};
    return {layout, inserted: false};
}

function updateSplitRatio(layout: TerminalSplitLayout | null, path: string, ratio: number): TerminalSplitLayout | null {
    if (!layout || layout.type === "pane") return layout;
    if (path === "") return {...layout, ratio};
    const [branch, ...remaining] = path;
    const rest = remaining.join("");
    return branch === "L"
        ? {...layout, first: updateSplitRatio(layout.first, rest, ratio) || layout.first}
        : {...layout, second: updateSplitRatio(layout.second, rest, ratio) || layout.second};
}

function attachBeside(
    layout: TerminalSplitLayout | null,
    referenceID: string,
    sessionID: string,
    placement: SplitPlacement,
): TerminalSplitLayout | null {
    if (!layout) return {type: "pane", sessionId: sessionID};
    const withoutTarget = removePane(layout, sessionID);
    const base = withoutTarget.layout;
    if (!base) return {type: "pane", sessionId: sessionID};
    const remainingIDs = paneIDs(base);
    const reference = remainingIDs.includes(referenceID) ? referenceID : remainingIDs[0];
    if (!reference) return {type: "pane", sessionId: sessionID};
    return insertPane(base, reference, sessionID, placement).layout;
}

export const useSessionStore = create<SessionState>((set, get) => ({
    sessions: [],
    activeSessionId: null,
    splitLayout: null,
    splitSessionIds: null,
    splitWorkspaceActive: false,
    splitActiveSessionId: null,
    topTabOrder: [],

    addSession: (params) => set((state) => {
        const newId = crypto.randomUUID();
        const fullConfig = new SSHConnectionConfig({
            id: newId,
            host: params.host,
            port: params.port,
            username: params.username,
            password: params.password,
            privateKey: params.privateKey,
            privateKeyPassphrase: params.privateKeyPassphrase,
            jumpHost: params.jumpHost,
            jumpHosts: params.jumpHosts,
            portForwards: params.portForwards,
        });
        const newSession: TerminalSession = {
            id: newId,
            title: params.title || params.host,
            config: fullConfig,
        };

        useUIStore.getState().setActiveView(ViewType.Terminal);
        return {
            sessions: [...state.sessions, newSession],
            activeSessionId: newId,
            splitWorkspaceActive: false,
            topTabOrder: [...state.topTabOrder.filter((tabID) => tabID !== terminalSessionTabID(newId)), terminalSessionTabID(newId)],
        };
    }),

    duplicateSession: (id) => {
        const session = get().sessions.find((item) => item.id === id);
        if (!session) return;
        get().addSession({
            host: session.config.host,
            port: session.config.port,
            username: session.config.username,
            password: session.config.password,
            privateKey: session.config.privateKey,
            privateKeyPassphrase: session.config.privateKeyPassphrase,
            jumpHost: session.config.jumpHost || undefined,
            jumpHosts: session.config.jumpHosts,
            portForwards: session.config.portForwards,
            title: session.title,
        });
    },

    addSessionToSplit: (id) => {
        const state = get();
        if (!state.sessions.some((session) => session.id === id)) return;
        if (state.splitLayout && paneIDs(state.splitLayout).includes(id)) return;
        if (state.splitLayout && paneIDs(state.splitLayout).length >= 6) return;

        const candidate = state.sessions.find((session) => session.id === state.activeSessionId && session.id !== id)
            || [...state.sessions].reverse().find((session) => session.id !== id);
        const layout = state.splitLayout
            ? attachBeside(state.splitLayout, state.activeSessionId || paneIDs(state.splitLayout)[0], id, "right")
            : candidate
                ? attachBeside({type: "pane", sessionId: candidate.id}, candidate.id, id, "right")
                : {type: "pane", sessionId: id} as TerminalSplitLayout;

        useUIStore.getState().setActiveView(ViewType.Terminal);
        const ids = paneIDs(layout);
        set({
            splitLayout: layout,
            splitSessionIds: ids,
            splitWorkspaceActive: true,
            splitActiveSessionId: id,
            activeSessionId: id,
            topTabOrder: state.topTabOrder.includes(SPLIT_WORKSPACE_TAB_ID)
                ? state.topTabOrder
                : [...state.topTabOrder, SPLIT_WORKSPACE_TAB_ID],
        });
    },

    placeSessionBeside: (referenceID, sessionID, placement) => {
        const state = get();
        if (referenceID === sessionID || !state.sessions.some((session) => session.id === sessionID)) return;
        const existingIDs = paneIDs(state.splitLayout);
        if (!existingIDs.includes(sessionID) && existingIDs.length >= 6) return;
        let layout: TerminalSplitLayout | null;
        if (state.splitLayout) {
            const base = removePane(state.splitLayout, sessionID).layout;
            if (base) {
                const remainingIDs = paneIDs(base);
                const reference = remainingIDs.includes(referenceID) ? referenceID : remainingIDs[0];
                layout = reference
                    ? insertPane(base, reference, sessionID, placement).layout
                    : {type: "pane", sessionId: sessionID};
            } else {
                const reference = state.sessions.find((session) => session.id === referenceID && session.id !== sessionID);
                layout = reference
                    ? insertPane({type: "pane", sessionId: reference.id}, reference.id, sessionID, placement).layout
                    : {type: "pane", sessionId: sessionID};
            }
        } else {
            const reference = state.sessions.find((session) => session.id === referenceID && session.id !== sessionID)
                || state.sessions.find((session) => session.id !== sessionID);
            layout = reference
                ? insertPane({type: "pane", sessionId: reference.id}, reference.id, sessionID, placement).layout
                : {type: "pane", sessionId: sessionID};
        }
        if (!layout) return;
        useUIStore.getState().setActiveView(ViewType.Terminal);
        const ids = paneIDs(layout);
        set({
            splitLayout: layout,
            splitSessionIds: ids,
            splitWorkspaceActive: true,
            splitActiveSessionId: sessionID,
            activeSessionId: sessionID,
            topTabOrder: state.topTabOrder.includes(SPLIT_WORKSPACE_TAB_ID)
                ? state.topTabOrder
                : [...state.topTabOrder, SPLIT_WORKSPACE_TAB_ID],
        });
    },

    removeSessionFromSplit: (id) => set((state) => {
        const result = removePane(state.splitLayout, id);
        if (!result.removed) return state;
        const ids = paneIDs(result.layout);
        const splitLayout = result.layout;
        const activeSessionId = state.activeSessionId === id ? (ids[0] || id) : state.activeSessionId;
        useUIStore.getState().setActiveView(ViewType.Terminal);
        return {
            splitLayout,
            splitSessionIds: splitLayout ? ids : null,
            splitWorkspaceActive: !!splitLayout,
            splitActiveSessionId: splitLayout ? activeSessionId : null,
            activeSessionId,
            topTabOrder: splitLayout
                ? state.topTabOrder
                : state.topTabOrder.filter((tabID) => tabID !== SPLIT_WORKSPACE_TAB_ID),
        };
    }),

    setSplitRatio: (path, ratio) => set((state) => ({
        splitLayout: updateSplitRatio(state.splitLayout, path, Math.max(0.15, Math.min(0.85, ratio))),
    })),

    setSplitWorkspaceActive: () => {
        const {splitLayout, splitActiveSessionId} = get();
        if (!splitLayout) return;
        const ids = paneIDs(splitLayout);
        const activeSessionId = ids.includes(splitActiveSessionId || "") ? splitActiveSessionId : (ids[0] || null);
        useUIStore.getState().setActiveView(ViewType.Terminal);
        set({splitWorkspaceActive: true, splitActiveSessionId: activeSessionId, activeSessionId});
    },

    closeSplitWorkspace: () => {
        const {splitSessionIds, splitActiveSessionId, activeSessionId} = get();
        const fallbackSessionId = splitSessionIds?.includes(activeSessionId || "")
            ? activeSessionId
            : splitActiveSessionId || splitSessionIds?.[0] || activeSessionId;
        set({
            splitLayout: null,
            splitSessionIds: null,
            splitWorkspaceActive: false,
            splitActiveSessionId: null,
            activeSessionId: fallbackSessionId || null,
            topTabOrder: get().topTabOrder.filter((tabID) => tabID !== SPLIT_WORKSPACE_TAB_ID),
        });
        if (fallbackSessionId) useUIStore.getState().setActiveView(ViewType.Terminal);
    },

    reorderTopTab: (draggedID, targetID) => set((state) => {
        if (draggedID === targetID) return state;
        const order = [...state.topTabOrder];
        const draggedIndex = order.indexOf(draggedID);
        const targetIndex = order.indexOf(targetID);
        if (draggedIndex < 0 || targetIndex < 0) return state;
        order.splice(draggedIndex, 1);
        order.splice(order.indexOf(targetID), 0, draggedID);
        return {topTabOrder: order};
    }),

    closeOtherSessions: (id) => {
        const {sessions} = get();
        const keep = sessions.find((session) => session.id === id);
        if (!keep) return;
        const toClose = sessions.filter((session) => session.id !== id);

        set({
            sessions: [keep], activeSessionId: id, splitLayout: null, splitSessionIds: null,
            splitWorkspaceActive: false, splitActiveSessionId: null,
            topTabOrder: [terminalSessionTabID(id)],
        });
        useUIStore.getState().setActiveView(ViewType.Terminal);
        toClose.forEach((session) => SshService.Disconnect(session.id).catch(console.error));
    },

    removeSession: (id) => set((state) => {
        const newSessions = state.sessions.filter((session) => session.id !== id);
        const removed = removePane(state.splitLayout, id);
        const remainingIDs = paneIDs(removed.layout);
        const splitLayout = removed.layout;
        let activeSessionId = state.activeSessionId;
        let splitActiveSessionId = state.splitActiveSessionId;

        if (activeSessionId === id) {
            const splitFallback = remainingIDs[0];
            if (splitFallback) {
                activeSessionId = splitFallback;
            } else if (newSessions.length > 0) {
                const closedIndex = state.sessions.findIndex((session) => session.id === id);
                activeSessionId = (newSessions[closedIndex - 1] || newSessions[0]).id;
            } else {
                activeSessionId = null;
                useUIStore.getState().setActiveView(ViewType.Hosts);
            }
        }
        if (splitActiveSessionId === id) splitActiveSessionId = remainingIDs[0] || null;

        return {
            sessions: newSessions,
            activeSessionId,
            splitLayout,
            splitSessionIds: splitLayout ? remainingIDs : null,
            splitWorkspaceActive: state.splitWorkspaceActive && !!splitLayout,
            splitActiveSessionId: splitLayout ? splitActiveSessionId : null,
            topTabOrder: state.topTabOrder.filter((tabID) =>
                tabID !== terminalSessionTabID(id) && (splitLayout || tabID !== SPLIT_WORKSPACE_TAB_ID)
            ),
        };
    }),

    setActiveSession: (id) => {
        useUIStore.getState().setActiveView(ViewType.Terminal);
        const isSplitSession = get().splitSessionIds?.includes(id) || false;
        set((state) => ({
            activeSessionId: id,
            splitWorkspaceActive: isSplitSession,
            splitActiveSessionId: isSplitSession ? id : state.splitActiveSessionId,
        }));
    },

    clearSessions: () => {
        const {sessions} = get();
        sessions.forEach((session) => SshService.Disconnect(session.id).catch(console.error));
        useUIStore.getState().setActiveView(ViewType.Hosts);
        set({
            sessions: [], activeSessionId: null, splitLayout: null, splitSessionIds: null,
            splitWorkspaceActive: false, splitActiveSessionId: null,
            topTabOrder: [],
        });
    },
}));
