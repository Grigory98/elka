import { useEffect } from "react";
import { useMetricsStore } from "@/store/metricsStore";
import { SshService } from "../../bindings/elka-desktop/backend/internal/services/ssh";

interface UseServerMetricsOptions {
    // Включается только для одиночной вкладки, которую смотрят прямо сейчас: канал на сервере
    // заводится при фокусе и закрывается, как только вкладка перестала быть активной.
    sessionID: string | null;
    enabled: boolean;
    active: boolean;
    // Переподключение пересоздаёт SSH-клиент на бэкенде, поэтому сбор надо начать заново.
    reconnectCount: number;
}

/** Запускает и останавливает сбор метрик сервера вместе с фокусом вкладки. */
export function useServerMetrics({sessionID, enabled, active, reconnectCount}: UseServerMetricsOptions) {
    useEffect(() => {
        if (!enabled || !active || !sessionID) {
            return;
        }

        // Сервер может не отдать метрики: нет /proc, закрыт exec или оборвалась связь. Панель просто
        // останется пустой, показывать пользователю тут нечего.
        void SshService.StartMetrics(sessionID).catch((error) => console.debug("метрики сервера не запустились", error));

        return () => {
            useMetricsStore.getState().clearMetrics(sessionID);
            void SshService.StopMetrics(sessionID).catch(() => {});
        };
    }, [sessionID, enabled, active, reconnectCount]);
}
