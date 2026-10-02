import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Events, Clipboard } from "@wailsio/runtime";
import { createTerminalOptions } from "@/lib/terminalTheme";
import { parseAppError } from "@/lib/error";
import { cn, decodeBase64ToUint8Array } from "@/lib/utils";
import "@xterm/xterm/css/xterm.css";
import { SSHConnectionConfig, SshService } from "../../../bindings/elka-desktop/backend/internal/services/ssh";
import { useTranslation } from "react-i18next";
import { AppEvent } from "@/lib/events.ts";
import { GripVertical, LoaderCircle, PanelTopClose, X } from "lucide-react";
import { SplitPlacement, TERMINAL_SESSION_DRAG_TYPE } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";

type ConnectionState = "connecting" | "ready" | "failed";

interface TerminalInstanceProps {
    sessionId: string;
    isActive: boolean;
    isVisible: boolean;
    isSplitPane?: boolean;
    workspaceID?: string;
    paneTitle?: string;
    layoutStyle?: CSSProperties;
    onFocus: () => void;
    onDetachPane?: () => void;
    onCloseSession?: () => void;
    onDropSession?: (draggedSessionID: string, targetSessionID: string, placement: SplitPlacement) => void;
    config: SSHConnectionConfig;
}

export function TerminalInstance({
    sessionId,
    isActive,
    isVisible,
    isSplitPane = false,
    workspaceID,
    paneTitle,
    layoutStyle,
    onFocus,
    onDetachPane,
    onCloseSession,
    onDropSession,
    config,
}: TerminalInstanceProps) {
    const {t} = useTranslation("terminal");
    const appearance = useUIStore((state) => state.appearance);

    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const hasConnectedRef = useRef(false);
    const isReadyRef = useRef(false);
    const hasFailedRef = useRef(false);
    const lastSizeRef = useRef({rows: 0, cols: 0});
    const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
    const [dropPlacement, setDropPlacement] = useState<SplitPlacement | null>(null);
    const isConnecting = connectionState === "connecting";
    const fitAndResizeRef = useRef<(forceResize?: boolean) => void>(() => {});
    const appearanceRef = useRef(appearance);
    appearanceRef.current = appearance;
    const onFocusRef = useRef(onFocus);
    onFocusRef.current = onFocus;

    fitAndResizeRef.current = (forceResize = false) => {
        // A failed session still has to be fitted, otherwise the error printed into it stays invisible.
        if (!isVisible || (!isReadyRef.current && !hasFailedRef.current)) return;

        window.requestAnimationFrame(() => {
            const container = containerRef.current;
            const terminal = terminalRef.current;
            const fitAddon = fitAddonRef.current;
            if (!container || !terminal || !fitAddon || container.clientWidth === 0 || container.clientHeight === 0) return;

            try {
                fitAddon.fit();
                terminal.refresh(0, terminal.rows - 1);
                if (isActive) terminal.focus();

                const sizeChanged = lastSizeRef.current.rows !== terminal.rows || lastSizeRef.current.cols !== terminal.cols;
                if (isReadyRef.current && (forceResize || sizeChanged)) {
                    lastSizeRef.current = {rows: terminal.rows, cols: terminal.cols};
                    SshService.Resize(sessionId, terminal.rows, terminal.cols).catch(printErrorToTerminal);
                }
            } catch (error) {
                console.warn("xterm fit failed:", error);
            }
        });
    };

    const printErrorToTerminal = (error: unknown) => {
        if (!terminalRef.current) return;
        const appError = parseAppError(error);

        // TODO think of something better
        // \x1b[0m = reset formatting
        // \x1b[31m = red
        console.log(appError)
        const translated = t("error_message", { message: appError.message, error: appError.detailsString })
        terminalRef.current.write(`\r\n\x1b[31m${translated}\x1b[0m\r\n`)
    };

    const getDropPlacement = (event: ReactDragEvent<HTMLDivElement>): SplitPlacement => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width;
        const y = (event.clientY - bounds.top) / bounds.height;
        const distances: [SplitPlacement, number][] = [
            ["left", x],
            ["right", 1 - x],
            ["above", y],
            ["below", 1 - y],
        ];
        return distances.reduce((closest, candidate) => candidate[1] < closest[1] ? candidate : closest)[0];
    };

    const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
        if (!isSplitPane || !event.dataTransfer.types.includes(TERMINAL_SESSION_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropPlacement(getDropPlacement(event));
    };

    const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
        if (!isSplitPane) return;
        const draggedSessionID = event.dataTransfer.getData(TERMINAL_SESSION_DRAG_TYPE);
        if (!draggedSessionID) return;
        event.preventDefault();
        const placement = getDropPlacement(event);
        setDropPlacement(null);
        if (draggedSessionID !== sessionId) onDropSession?.(draggedSessionID, sessionId, placement);
    };

    useEffect(() => {
        if (!containerRef.current || terminalRef.current) return;
        const container = containerRef.current;

        const term = new Terminal(createTerminalOptions(appearanceRef.current));
        const fitAddon = new FitAddon();

        term.loadAddon(fitAddon);
        term.open(containerRef.current);

        terminalRef.current = term;
        fitAddonRef.current = fitAddon;
        const handleFocus = () => onFocusRef.current();
        container.addEventListener("focusin", handleFocus);

        term.attachCustomKeyEventHandler((arg) => {
            if (arg.type === "keydown") {
                if (arg.ctrlKey && arg.shiftKey && arg.code === "KeyC") {
                    arg.preventDefault();
                    const selection = term.getSelection();
                    if (selection) {
                        Clipboard.SetText(selection).catch(console.error);
                    }
                    return false;
                }

                if (arg.ctrlKey && arg.shiftKey && arg.code === "KeyV") {
                    arg.preventDefault();
                    Clipboard.Text().then((text) => {
                        if (text && isReadyRef.current) {
                            term.paste(text);
                        }
                    }).catch(console.error);
                    return false;
                }
            }
            return true;
        });

        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();

            const selection = term.getSelection();
            if (selection) {
                Clipboard.SetText(selection).catch(console.error);
                term.clearSelection();
            } else {
                Clipboard.Text().then((text) => {
                    if (text && isReadyRef.current) {
                        SshService.Input(sessionId, text).catch(printErrorToTerminal);
                    }
                }).catch(console.error);
            }
        };
        containerRef.current.addEventListener("contextmenu", handleContextMenu);

        if (!hasConnectedRef.current) {
            hasConnectedRef.current = true;
            SshService.Connect(config)
                .then(() => {
                    isReadyRef.current = true;
                    setConnectionState("ready");
                })
                .catch((err) => {
                    // The error is printed into the terminal, so the overlay has to give way to it.
                    hasFailedRef.current = true;
                    setConnectionState("failed");
                    printErrorToTerminal(err);
                });
        }

        const onDataDisposable = term.onData((data) => {
            if (!isReadyRef.current) return;

            SshService.Input(sessionId, data).catch((err) => {
                printErrorToTerminal(err);
            });
        });

        return () => {
            container.removeEventListener("contextmenu", handleContextMenu);
            container.removeEventListener("focusin", handleFocus);
            onDataDisposable.dispose();
            term.dispose();
            terminalRef.current = null;
            fitAddonRef.current = null;
            SshService.Disconnect(sessionId).catch(() => {
            });
        };
    }, [sessionId, config]);

    useEffect(() => {
        const terminal = terminalRef.current;
        if (!terminal) return;
        const options = createTerminalOptions(appearance);
        terminal.options.fontFamily = options.fontFamily;
        terminal.options.fontSize = options.fontSize;
        terminal.options.theme = options.theme;
        terminal.refresh(0, terminal.rows - 1);
        fitAndResizeRef.current(true);
    }, [
        appearance.terminalBackgroundColor,
        appearance.terminalCursorColor,
        appearance.terminalFontFamily,
        appearance.terminalFontSize,
        appearance.terminalForegroundColor,
    ]);

    useEffect(() => {
        const unsubscribe = Events.On(AppEvent.SshData, (event) => {
            if (event.data.id === sessionId && terminalRef.current) {
                const rawBytes = decodeBase64ToUint8Array(event.data.data);

                terminalRef.current.write(rawBytes);
            }
        });
        return () => unsubscribe();
    }, [sessionId]);

    useEffect(() => {
        if (!isVisible || isConnecting) return;

        const frameIds: number[] = [];
        const firstFrame = window.requestAnimationFrame(() => {
            const secondFrame = window.requestAnimationFrame(() => fitAndResizeRef.current(true));
            frameIds.push(secondFrame);
        });
        frameIds.push(firstFrame);
        return () => frameIds.forEach((frame) => window.cancelAnimationFrame(frame));
    }, [isActive, isConnecting, isVisible, sessionId]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || !isVisible || isConnecting) return;

        const resizeObserver = new ResizeObserver(() => fitAndResizeRef.current());
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [isActive, isConnecting, isVisible, sessionId]);

    return (
        <div
            style={layoutStyle}
            data-split-pane-id={isSplitPane ? sessionId : undefined}
            data-workspace-id={isSplitPane ? workspaceID : undefined}
            onDragOver={handleDragOver}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPlacement(null);
            }}
            onDrop={handleDrop}
            className={cn(
                "group relative h-full w-full min-h-0 min-w-0 bg-background p-2",
                isSplitPane && "flex flex-col overflow-hidden rounded-lg border border-white/45",
                isVisible ? "block" : "hidden"
            )}
        >
            {isSplitPane && (
                <div className={cn(
                    "mb-1 flex h-8 shrink-0 items-center justify-between gap-1 border-b border-white/20 px-1",
                    isActive && "bg-white/[0.035]"
                )}>
                    <div className="flex min-w-0 items-center gap-2">
                    <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                            event.dataTransfer.setData(TERMINAL_SESSION_DRAG_TYPE, sessionId);
                            event.dataTransfer.effectAllowed = "move";
                        }}
                        title={t("drag_pane")}
                        aria-label={t("drag_pane")}
                        className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded hover:bg-muted active:cursor-grabbing"
                    >
                        <GripVertical className="size-4"/>
                    </button>
                    <span className="truncate text-xs font-medium text-foreground">{paneTitle || config.host}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        title={t("detach_pane")}
                        aria-label={t("detach_pane")}
                        onClick={onDetachPane}
                        className="flex size-7 items-center justify-center rounded hover:bg-muted"
                    >
                        <PanelTopClose className="size-4"/>
                    </button>
                    <button
                        type="button"
                        title={t("close_tab")}
                        aria-label={t("close_named_tab", {name: paneTitle || config.host})}
                        onClick={onCloseSession}
                        className="flex size-7 items-center justify-center rounded hover:bg-destructive/20 hover:text-destructive"
                    >
                        <X className="size-4"/>
                    </button>
                    </div>
                </div>
            )}
            {dropPlacement && (
                <div className={cn(
                    "pointer-events-none absolute z-10 rounded-md border-2 border-primary bg-primary/15",
                    dropPlacement === "left" && "inset-y-1 left-1 w-1/2",
                    dropPlacement === "right" && "inset-y-1 right-1 w-1/2",
                    dropPlacement === "above" && "inset-x-1 top-1 h-1/2",
                    dropPlacement === "below" && "inset-x-1 bottom-1 h-1/2",
                )}/>
            )}
            <div className={cn("relative bg-background", isSplitPane ? "min-h-0 flex-1" : "h-full")}>
                {/* Hidden until the session is live: an unfitted xterm paints the terminal background,
                    which reads as a black rectangle before the handshake finishes. */}
                <div ref={containerRef} className={cn("h-full w-full", isConnecting && "invisible")}/>
                {isConnecting && (
                    <div role="status"
                         className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                        <LoaderCircle className="size-5 animate-spin text-muted-foreground"/>
                        <div className="max-w-[80%] truncate text-xs text-muted-foreground">
                            {t("connecting_to_host", {host: config.host})}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
