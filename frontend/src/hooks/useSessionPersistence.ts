import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { useHosts } from "@/hooks/useHosts";
import { useKeys } from "@/hooks/useKeys";
import { useCredentials } from "@/hooks/useCredentials";
import { useGroups } from "@/hooks/useGroups";
import {
    clearSessionSnapshot,
    readSessionSnapshot,
    snapshotOf,
    writeSessionSnapshot,
} from "@/lib/sessionSnapshot";

/**
 * Сохраняет открытые вкладки и поднимает их после перезапуска.
 *
 * Снимок пишется на каждое изменение состояния, поэтому отдельного сохранения при выходе не нужно и
 * ничего не теряется, если приложение закрыть крестиком. Подъём происходит один раз за запуск и
 * только после разблокировки хранилища: до неё данных о хостах нет.
 */
export function useSessionPersistence() {
    const {t} = useTranslation("common");
    const isUnlocked = useAuthStore((state) => state.isUnlocked);
    const restoreEnabled = useUIStore((state) => state.restoreSessions);
    const restoredRef = useRef(false);
    const savingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const {data: hosts} = useHosts();
    const {data: keys} = useKeys();
    const {data: credentials} = useCredentials();
    const {data: groups} = useGroups();

    // Запись отложена: перетаскивание вкладки меняет состояние на каждое движение указателя, а
    // localStorage пишется синхронно.
    useEffect(() => {
        // Пока хранилище заперто, снимок не трогаем: вкладки в этот момент всё равно сняты, и запись
        // пустого состояния стёрла бы то, что пользователь рассчитывал увидеть после разблокировки.
        if (!restoreEnabled || !isUnlocked) return;

        const write = () => {
            if (savingRef.current) clearTimeout(savingRef.current);
            savingRef.current = null;
            writeSessionSnapshot(snapshotOf(useSessionStore.getState()));
        };

        const unsubscribe = useSessionStore.subscribe((state, previous) => {
            if (state.sessions === previous.sessions
                && state.topTabOrder === previous.topTabOrder
                && state.tabGroups === previous.tabGroups
                && state.workspaces === previous.workspaces) {
                return;
            }

            if (savingRef.current) clearTimeout(savingRef.current);
            savingRef.current = setTimeout(write, 400);
        });

        // Смена зависимостей — это в том числе блокировка хранилища: отложенную запись надо снять,
        // иначе она допишет снимок уже после того, как вкладки сняли.
        return () => {
            unsubscribe();
            if (savingRef.current) {
                clearTimeout(savingRef.current);
                savingRef.current = null;
            }
        };
    }, [restoreEnabled, isUnlocked]);

    // При выходе из приложения снимок пишется целиком: вкладка, открытая за полсекунды до закрытия
    // окна, в отложенную запись уже не попала бы. Эффект объявлен отдельно и без зависимостей,
    // чтобы этот допис случался только на настоящем размонтировании, а не при блокировке.
    useEffect(() => () => {
        writeSessionSnapshot(snapshotOf(useSessionStore.getState()));
    }, []);

    useEffect(() => {
        if (!isUnlocked || !restoreEnabled || restoredRef.current) return;
        if (!hosts || !keys || !credentials || !groups) return;

        restoredRef.current = true;
        const snapshot = readSessionSnapshot();
        if (!snapshot || snapshot.sessions.length === 0) {
            // Пустой снимок после прошлого запуска — это «вкладок не было», и незачем хранить его дальше.
            clearSessionSnapshot();
            return;
        }

        const restored = useSessionStore.getState().restoreSessions(snapshot, {hosts, keys, credentials, groups});
        if (restored === 0) {
            clearSessionSnapshot();
            return;
        }

        // Вид не переключивается: приложение открывается на списке хостов, а вкладки ждут в трэе, и
        // поднимаются по клику. Сообщение потому, что часть из них подняться уже не может — их хост
        // удалён, — и без него непонятно, куда он делся.
        toast.info(t("sessions_restored", {count: restored}));
        console.info(`Restored ${restored} session(s)`);
    }, [isUnlocked, restoreEnabled, hosts, keys, credentials, groups, t]);

    // Блокировка хранилища снимает вкладки, и после разблокировки они поднимаются заново: снимок
    // запертого состояния не переписывается, а флаг «уже поднимали» сбрасывается.
    useEffect(() => {
        if (!isUnlocked) restoredRef.current = false;
    }, [isUnlocked]);

    // Выключенная функция должна убирать и снимок: он больше ничем не поддерживается.
    useEffect(() => {
        if (!restoreEnabled) clearSessionSnapshot();
    }, [restoreEnabled]);
}