import { useSessionStore } from "@/store/sessionStore";
import { useMetricsStore } from "@/store/metricsStore";
import { useUIStore } from "@/store/uiStore";

// Отрицательное значение приходит от бэкенда, когда источник на сервере недоступен: нет swap,
// нет df, обрезан /proc/net/dev. Ноль был бы правдоподобным, но неверным числом, поэтому в этом
// случае показывается прочерк.

function formatPercent(value: number): string {
    if (value < 0) return "—";
    return value >= 10 ? `${Math.round(value)}%` : `${value.toFixed(1)}%`;
}

/** Load average в том же виде, что и в top: 0.30, а не тридцать процентов. */
function formatLoad(value: number): string {
    if (value < 0) return "—";
    return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function formatRate(bytesPerSecond: number): string {
    if (bytesPerSecond < 0) return "—";
    if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)}Б`;
    if (bytesPerSecond < 1024 * 1024) return `${Math.round(bytesPerSecond / 1024)}К`;
    if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)}М`;
    return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)}Г`;
}

/** Время работы в двух значащих единицах: 42м, 3ч 12м, 12д 4ч. */
function formatUptime(seconds: number): string {
    if (seconds < 0) return "—";
    const total = Math.floor(seconds);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}д ${hours}ч`;
    if (hours > 0) return `${hours}ч ${minutes}м`;
    if (minutes > 0) return `${minutes}м`;
    return `${total}с`;
}

function formatProcesses(running: number, total: number): string {
    if (running < 0 || total < 0) return "—";
    return `${Math.round(running)}/${Math.round(total)}`;
}

interface MetricsRow {
    label: string;
    /** Обычная строка показывает одно значение, load average — три, как в top. */
    values: string[];
    muted?: boolean;
    title?: string;
}

/**
 * Показатели сервера для вкладки, которую смотрят сейчас. Значения приходят раз в секунду с
 * машины, которая подключена, поэтому панель ничего не опрашивает сама.
 */
export function ServerMetricsPanel() {
    const enabled = useUIStore((state) => state.serverMetrics);
    const activeWorkspaceID = useSessionStore((state) => state.activeWorkspaceID);
    const activeSessionId = useSessionStore((state) => state.activeSessionId);
    const sessionID = activeWorkspaceID ? null : activeSessionId;
    const metrics = useMetricsStore((state) => (sessionID ? state.metrics[sessionID] : undefined));

    if (!enabled || !sessionID || !metrics) {
        return null;
    }

    // Подписи не локализованы намеренно: это сокращения системной утилиты top, и переводить их в
    // интерфейсе не принято. Порядок — по тому, как о сервере судят в первую очередь.
    const rows: MetricsRow[] = [
        {
            label: "CPU",
            values: [formatPercent(metrics.cpu)],
            title: "CPU usage across all cores. Idle time and I/O wait (the IO row) are not counted as busy.",
        },
        {
            label: "LA",
            values: [formatLoad(metrics.load1), formatLoad(metrics.load5), formatLoad(metrics.load15)],
            title: "Load average: 1 min, 5 min, 15 min",
        },
        {
            label: "RAM",
            values: [formatPercent(metrics.memory)],
            title: "Memory in use: total minus available, so reclaimable page cache counts as used",
        },
        {label: "SWAP", values: [formatPercent(metrics.swap)]},
        {
            label: "DISK",
            values: [formatPercent(metrics.disk)],
            title: "Used space on the / filesystem",
        },
        {label: "IO", values: [formatPercent(metrics.ioWait)], title: "CPU time spent waiting for I/O"},
        {
            label: "NET",
            values: [`${formatRate(metrics.networkIn)} ${formatRate(metrics.networkOut)}`],
            muted: true,
            title: "Network receive and send per second",
        },
        {label: "PROC", values: [formatProcesses(metrics.processesRunning, metrics.processesTotal)], title: "Running and total processes"},
        {label: "UPTIME", values: [formatUptime(metrics.uptime)]},
    ];

    return (
        // Сайдбар узкий (56px), поэтому метка и значение стоят друг под другом, а не в строку.
        <div className="flex w-12 flex-col items-center gap-1.5">
            {rows.map((row) => (
                <div key={row.label} className="flex w-full min-w-0 flex-col items-center gap-0.5" title={row.title}>
                    {/* Цвета приходят из темы: тёмный фон требует светлого текста и наоборот.
                        min-w-0 снимает с элемента запрет ужиматься до содержимого: без него длинное
                        значение вроде "300д 10ч" или "12.3М 45.6К" вылезало за край сайдбара вместо
                        переноса. */}
                    <span className="w-full min-w-0 break-words text-center text-[9px] font-medium uppercase leading-tight tracking-tight"
                          style={{color: "var(--server-metrics-label)"}}>
                        {row.label}
                    </span>
                    {/* Моноширинный шрифт не даёт цифрам «прыгать» каждую секунду. */}
                    {/* Ключ — позиция, а не значение: у load average значения регулярно совпадают
                        между собой, и одинаковые ключи среди соседей заставляют React дублировать
                        элементы на каждом обновлении. */}
                    {row.values.map((value, index) => (
                        <span key={index} className="w-full min-w-0 break-words text-center font-mono text-[11px] leading-tight tabular-nums"
                              style={{color: row.muted ? "var(--server-metrics-label)" : "var(--server-metrics)"}}>
                            {value}
                        </span>
                    ))}
                </div>
            ))}
        </div>
    );
}