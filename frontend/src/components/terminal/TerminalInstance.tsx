import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Events, Clipboard } from "@wailsio/runtime";
import { TERMINAL_THEME } from "@/lib/terminalTheme";
import { parseAppError } from "@/lib/error";
import { cn, decodeBase64ToUint8Array } from "@/lib/utils";
import "@xterm/xterm/css/xterm.css";
import { SSHConnectionConfig, SshService } from "../../../bindings/terminator-desktop/backend/internal/services/ssh";
import { useTranslation } from "react-i18next";
import { AppEvent } from "@/lib/events.ts";

interface TerminalInstanceProps {
    sessionId: string;
    isActive: boolean;
    isVisible: boolean;
    config: SSHConnectionConfig;
}

export function TerminalInstance({sessionId, isActive, isVisible, config}: TerminalInstanceProps) {
    const {t} = useTranslation("terminal");

    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const hasConnectedRef = useRef(false);
    const isReadyRef = useRef(false);
    const lastSizeRef = useRef({rows: 0, cols: 0});
    const [isConnected, setIsConnected] = useState(false);
    const fitAndResizeRef = useRef<(forceResize?: boolean) => void>(() => {});

    fitAndResizeRef.current = (forceResize = false) => {
        if (!isActive || !isVisible || !isReadyRef.current) return;

        window.requestAnimationFrame(() => {
            const container = containerRef.current;
            const terminal = terminalRef.current;
            const fitAddon = fitAddonRef.current;
            if (!container || !terminal || !fitAddon || container.clientWidth === 0 || container.clientHeight === 0) return;

            try {
                fitAddon.fit();
                terminal.refresh(0, terminal.rows - 1);
                terminal.focus();

                const sizeChanged = lastSizeRef.current.rows !== terminal.rows || lastSizeRef.current.cols !== terminal.cols;
                if (forceResize || sizeChanged) {
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

    useEffect(() => {
        if (!containerRef.current || terminalRef.current) return;
        const container = containerRef.current;

        const term = new Terminal(TERMINAL_THEME);
        const fitAddon = new FitAddon();

        term.loadAddon(fitAddon);
        term.open(containerRef.current);

        terminalRef.current = term;
        fitAddonRef.current = fitAddon;

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
                    setIsConnected(true);
                })
                .catch((err) => {
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
            onDataDisposable.dispose();
            term.dispose();
            terminalRef.current = null;
            fitAddonRef.current = null;
            SshService.Disconnect(sessionId).catch(() => {
            });
        };
    }, [sessionId, config]);

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
        if (!isActive || !isVisible || !isConnected) return;

        const frameIds: number[] = [];
        const firstFrame = window.requestAnimationFrame(() => {
            const secondFrame = window.requestAnimationFrame(() => fitAndResizeRef.current(true));
            frameIds.push(secondFrame);
        });
        frameIds.push(firstFrame);
        return () => frameIds.forEach((frame) => window.cancelAnimationFrame(frame));
    }, [isActive, isConnected, isVisible, sessionId]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || !isActive || !isVisible || !isConnected) return;

        const resizeObserver = new ResizeObserver(() => fitAndResizeRef.current());
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [isActive, isConnected, isVisible, sessionId]);

    return (
        <div className={cn("h-full w-full bg-background p-2", isActive ? "block" : "hidden")}>
            <div ref={containerRef} className="h-full w-full"/>
        </div>
    );
}
