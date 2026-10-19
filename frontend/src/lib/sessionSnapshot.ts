import type { SessionState } from "@/store/sessionStore";

/**
 * Снимок открытых вкладок, из которого приложение поднимает их после перезапуска.
 *
 * В снимке нет ни адресов, ни логинов, ни паролей: только идентификаторы хостов из хранилища и
 * структура вкладок. Настройки подключения и креды берутся из хранилища заново при восстановлении, так
 * что правка хоста или смена пароля не оставляют в снимке устаревшую копию, а содержимое файла
 * хранилища остаётся единственным источником правды о том, к чему приложение подключается.
 *
 * Идентификаторы сессий сохраняются как есть: это случайные значения без связи с чем-либо, а менять их
 * пришлось бы во всех ссылках разметки — вкладках, группах и разделённых экранах.
 */
export interface SessionSnapshot {
    version: number;
    sessions: {id: string; hostID: string | null}[];
    topTabOrder: string[];
    tabGroups: SessionState["tabGroups"];
    workspaces: SessionState["workspaces"];
    activeSessionId: string | null;
    activeWorkspaceID: string | null;
}

const SNAPSHOT_KEY = "elka.sessionSnapshot";
const RESTORE_KEY = "elka.restoreSessions";
const SNAPSHOT_VERSION = 1;

/**
 * Перехват состояния для снимка.
 *
 * Настройки подключения и принятый пароль в снимок не попадают: первый кладёт рядом снимок с кредами
 * без нужды, второй живёт только внутри открытой вкладки и до перезапуска не доживает.
 */
export function snapshotOf(state: SessionState): SessionSnapshot {
    return {
        version: SNAPSHOT_VERSION,
        sessions: state.sessions.map((session) => ({id: session.id, hostID: session.hostID || null})),
        topTabOrder: state.topTabOrder,
        tabGroups: state.tabGroups,
        workspaces: state.workspaces,
        activeSessionId: state.activeSessionId,
        activeWorkspaceID: state.activeWorkspaceID,
    };
}

export function readSessionSnapshot(): SessionSnapshot | null {
    try {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as SessionSnapshot;
        if (parsed?.version !== SNAPSHOT_VERSION || !Array.isArray(parsed.sessions)) return null;
        return parsed;
    } catch (error) {
        // Снимок — необязательная вещь: повреждённый не должен мешать приложению работать.
        console.warn("could not read the saved session snapshot", error);
        return null;
    }
}

export function writeSessionSnapshot(snapshot: SessionSnapshot): void {
    try {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (error) {
        console.warn("could not save the session snapshot", error);
    }
}

export function clearSessionSnapshot(): void {
    try {
        localStorage.removeItem(SNAPSHOT_KEY);
    } catch (error) {
        console.warn("could not clear the session snapshot", error);
    }
}

/**
 * Восстанавливать вкладки по умолчанию выключено: приложение открывается чистым, а решение о том,
 * чтобы поднимать прошлые подключения — за пользователем.
 */
export function isSessionRestoreEnabled(): boolean {
    try {
        return localStorage.getItem(RESTORE_KEY) === "1";
    } catch (error) {
        console.warn("could not read the session restore setting", error);
        return false;
    }
}

export function setSessionRestoreEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(RESTORE_KEY, enabled ? "1" : "0");
    } catch (error) {
        console.warn("could not save the session restore setting", error);
    }
}