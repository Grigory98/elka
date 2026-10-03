import { create } from "zustand";
import { Events } from "@wailsio/runtime";
import { AppEvent } from "@/lib/events";

export interface ServerMetrics {
    cpu: number;
    ioWait: number;
    /** Load average over 1, 5 and 15 minutes. */
    load1: number;
    load5: number;
    load15: number;
    memory: number;
    swap: number;
    disk: number;
    /** Bytes per second. */
    networkIn: number;
    networkOut: number;
    /** Uptime in seconds. */
    uptime: number;
    processesRunning: number;
    processesTotal: number;
}

// Отдельный стор от сторов сессий: метрики приходят раз в секунду, и обновлять из-за них дерево
// терминалов было бы незачем.
interface MetricsState {
    metrics: Record<string, ServerMetrics>;
    clearMetrics: (sessionID: string) => void;
}

export const useMetricsStore = create<MetricsState>((set) => ({
    metrics: {},
    clearMetrics: (sessionID) => set((state) => {
        if (!(sessionID in state.metrics)) return state;
        const metrics = {...state.metrics};
        delete metrics[sessionID];
        return {metrics};
    }),
}));

// Слушатель один на всё приложение: событие приходит от бэкенда, а не от хука, который следит за
// активной вкладкой.
Events.On(AppEvent.SSHMetrics, (event) => {
    const {id, cpu, ioWait, load1, load5, load15, memory, swap, disk, networkIn, networkOut, uptime, processesRunning, processesTotal} = event.data;
    useMetricsStore.setState((state) => ({
        metrics: {
            ...state.metrics,
            [id]: {cpu, ioWait, load1, load5, load15, memory, swap, disk, networkIn, networkOut, uptime, processesRunning, processesTotal},
        },
    }));
});
