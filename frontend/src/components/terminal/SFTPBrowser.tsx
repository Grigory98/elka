import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { ArrowUp, Download, File, Folder, LoaderCircle, RefreshCw, Upload, X } from "lucide-react";
import { Events } from "@wailsio/runtime";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { AppEvent } from "@/lib/events.ts";
import { cn } from "@/lib/utils";
import { SshService } from "../../../bindings/elka-desktop/backend/internal/services/ssh";
import type { TerminalSession } from "@/store/sessionStore";

interface SFTPBrowserProps {
    open: boolean;
    session: TerminalSession | null;
    onClose: () => void;
}

function parentDirectory(directory: string) {
    const normalized = directory.replace(/\/+$/, "");
    if (!normalized || normalized === "/" || normalized === ".") return "/";
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex <= 0 ? "/" : normalized.slice(0, slashIndex);
}

function childPath(directory: string, filename: string) {
    return `${directory.endsWith("/") ? directory : `${directory}/`}${filename}`;
}

function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function errorText(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

type TransferDirection = "upload" | "download";

interface TransferState {
    sessionID: string;
    direction: TransferDirection;
    name: string;
    transferred: number;
    total: number;
}

async function encodeFileBase64(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

export function SFTPBrowser({open, session, onClose}: SFTPBrowserProps) {
    const {t} = useTranslation(["terminal", "common"]);
    const [directory, setDirectory] = useState("");
    const [pathInput, setPathInput] = useState("");
    const [entries, setEntries] = useState<Array<{
        name: string;
        path: string;
        isDir: boolean;
        size: number;
        modTime: number;
        mode: string;
    }>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [transfer, setTransfer] = useState<TransferState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hoveredEntryPath, setHoveredEntryPath] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const requestNumberRef = useRef(0);
    const transferCancelRef = useRef<(() => void) | null>(null);
    const cancelRequestedRef = useRef(false);
    const transferKeyRef = useRef<string | null>(null);
    const sessionID = session?.id;
    const activeTransfer = transfer?.sessionID === sessionID ? transfer : null;
    const transferName = activeTransfer?.name ?? null;
    const transferPercent = activeTransfer && activeTransfer.total > 0
        ? Math.min(100, (activeTransfer.transferred / activeTransfer.total) * 100)
        : 0;
    const transferLabel = !activeTransfer
        ? ""
        : activeTransfer.total > 0
            ? `${formatFileSize(activeTransfer.transferred)} / ${formatFileSize(activeTransfer.total)} · ${Math.round(transferPercent)}%`
            : formatFileSize(activeTransfer.transferred);

    const loadDirectory = useCallback(async (targetDirectory: string) => {
        if (!session) return;
        const requestNumber = ++requestNumberRef.current;
        setIsLoading(true);
        setError(null);
        try {
            const result = await SshService.ListSFTPDirectory(session.id, targetDirectory);
            if (requestNumber !== requestNumberRef.current) return;
            const sortedEntries = [...result.entries].sort((left, right) => {
                if (left.isDir !== right.isDir) return left.isDir ? -1 : 1;
                return left.name.localeCompare(right.name, undefined, {numeric: true, sensitivity: "base"});
            });
            setDirectory(result.path);
            setPathInput(result.path);
            setEntries(sortedEntries);
        } catch (cause) {
            if (requestNumber === requestNumberRef.current) setError(errorText(cause));
        } finally {
            if (requestNumber === requestNumberRef.current) setIsLoading(false);
        }
    }, [session]);

    useEffect(() => {
        if (open && session) void loadDirectory("");
        return () => {
            requestNumberRef.current++;
        };
    }, [open, session?.id, loadDirectory]);

    useEffect(() => {
        if (!sessionID) return;
        const unsubscribe = Events.On(AppEvent.SftpProgress, (event) => {
            const payload = event.data;
            if (payload.id !== sessionID) return;
            // A transfer that has already been settled here must not be revived by a trailing
            // event, otherwise the progress bar and the row spinner stay on screen for good.
            if (transferKeyRef.current !== `${payload.direction}:${payload.name}`) return;
            setTransfer({
                sessionID,
                direction: payload.direction,
                name: payload.name,
                transferred: payload.transferred,
                total: payload.total,
            });
        });
        return () => unsubscribe();
    }, [sessionID]);

    const cancelTransfer = () => {
        cancelRequestedRef.current = true;
        transferCancelRef.current?.();
    };

    const handleDownload = async (entry: (typeof entries)[number]) => {
        if (!session || entry.isDir) return;
        cancelRequestedRef.current = false;
        transferKeyRef.current = `download:${entry.name}`;
        setTransfer({sessionID: session.id, direction: "download", name: entry.name, transferred: 0, total: entry.size});
        setError(null);
        const request = SshService.DownloadSFTPFile(session.id, entry.path, entry.name, t("sftp_save_dialog_title"));
        transferCancelRef.current = () => {
            void request.cancel();
        };
        try {
            await request;
        } catch (cause) {
            if (!cancelRequestedRef.current) setError(errorText(cause));
        } finally {
            transferCancelRef.current = null;
            transferKeyRef.current = null;
            setTransfer(null);
        }
    };

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!session || !directory || files.length === 0) return;
        cancelRequestedRef.current = false;
        setError(null);
        try {
            for (const file of files) {
                transferKeyRef.current = `upload:${file.name}`;
                setTransfer({sessionID: session.id, direction: "upload", name: file.name, transferred: 0, total: file.size});
                const bytes = await encodeFileBase64(file);
                const request = SshService.UploadSFTPFile(session.id, childPath(directory, file.name), bytes);
                transferCancelRef.current = () => {
                    void request.cancel();
                };
                // A cancel that landed while the file was still being encoded has nothing to stop yet.
                if (cancelRequestedRef.current) transferCancelRef.current();
                await request;
            }
            if (cancelRequestedRef.current) return;
            await loadDirectory(directory);
        } catch (cause) {
            if (!cancelRequestedRef.current) setError(errorText(cause));
        } finally {
            transferCancelRef.current = null;
            transferKeyRef.current = null;
            setTransfer(null);
            event.target.value = "";
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="grid h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-4 sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle>{t("sftp_title", {host: session?.title || session?.config.host || ""})}</DialogTitle>
                </DialogHeader>

                {!session ? (
                    <div className="text-sm text-muted-foreground">{t("sftp_session_closed")}</div>
                ) : (
                    <div className="flex min-h-0 flex-col gap-3">
                        <form
                            className="flex shrink-0 items-center gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void loadDirectory(pathInput);
                            }}
                        >
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                title={t("sftp_parent_directory")}
                                aria-label={t("sftp_parent_directory")}
                                disabled={isLoading || !directory || directory === "/" || directory === "."}
                                onClick={() => void loadDirectory(parentDirectory(directory))}
                            >
                                <ArrowUp className="size-4"/>
                            </Button>
                            <Input
                                value={pathInput}
                                onChange={(event) => setPathInput(event.target.value)}
                                aria-label={t("sftp_path")}
                                placeholder={t("sftp_path")}
                            />
                            <Button type="submit" variant="outline" size="icon-sm" title={t("sftp_go")} aria-label={t("sftp_go")} disabled={isLoading}>
                                {isLoading ? <LoaderCircle className="size-4 animate-spin"/> : <Folder className="size-4"/>}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                title={t("sftp_refresh")}
                                aria-label={t("sftp_refresh")}
                                disabled={isLoading}
                                onClick={() => void loadDirectory(directory)}
                            >
                                <RefreshCw className="size-4"/>
                            </Button>
                            <Button type="button" variant="default" onClick={() => fileInputRef.current?.click()} disabled={!!transferName || !directory}>
                                {transferName ? <LoaderCircle className="size-4 animate-spin"/> : <Upload className="size-4"/>}
                                {t("sftp_upload")}
                            </Button>
                            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload}/>
                        </form>

                        {activeTransfer && (
                            <div className="flex shrink-0 flex-col gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            className="-ml-1.5 shrink-0 text-muted-foreground hover:text-destructive"
                                            title={t("sftp_cancel_transfer")}
                                            aria-label={t("sftp_cancel_transfer")}
                                            onClick={cancelTransfer}
                                        >
                                            <X className="size-3.5"/>
                                        </Button>
                                        {activeTransfer.direction === "upload"
                                            ? <Upload className="size-3.5 shrink-0"/>
                                            : <Download className="size-3.5 shrink-0"/>}
                                        <span className="truncate">
                                            {t(activeTransfer.direction === "upload" ? "sftp_uploading" : "sftp_downloading", {name: activeTransfer.name})}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-muted-foreground">{transferLabel}</span>
                                </div>
                                <Progress value={transferPercent}/>
                            </div>
                        )}

                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
                            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_7rem_12rem_5rem] items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                                <span>{t("sftp_name")}</span>
                                <span className="text-right">{t("sftp_size")}</span>
                                <span>{t("sftp_modified")}</span>
                                <span/>
                            </div>
                            <div className="app-scrollbar min-h-0 flex-1 overflow-auto">
                                {error && <div role="alert" className="m-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                                {isLoading && entries.length === 0 && (
                                    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                                        <LoaderCircle className="size-4 animate-spin"/>{t("sftp_loading")}
                                    </div>
                                )}
                                {!isLoading && !error && entries.length === 0 && (
                                    <div className="p-8 text-center text-sm text-muted-foreground">{t("sftp_empty_directory")}</div>
                                )}
                                {entries.map((entry) => (
                                    <div
                                        key={entry.path}
                                        onPointerEnter={() => setHoveredEntryPath(entry.path)}
                                        onPointerLeave={() => setHoveredEntryPath((current) => current === entry.path ? null : current)}
                                        className={cn(
                                            "grid grid-cols-[minmax(0,1fr)_7rem_12rem_5rem] items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40",
                                            hoveredEntryPath === entry.path && "bg-muted/40"
                                        )}
                                    >
                                        <button
                                            type="button"
                                            className="flex min-w-0 items-center gap-2 text-left"
                                            disabled={!entry.isDir || isLoading}
                                            onClick={() => entry.isDir && void loadDirectory(entry.path)}
                                        >
                                            {entry.isDir ? <Folder className="size-4 shrink-0 text-primary"/> : <File className="size-4 shrink-0 text-muted-foreground"/>}
                                            <span className="truncate">{entry.name}</span>
                                        </button>
                                        <span className="text-right text-xs text-muted-foreground">{entry.isDir ? "—" : formatFileSize(entry.size)}</span>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {entry.modTime ? new Date(entry.modTime * 1000).toLocaleString() : "—"}
                                        </span>
                                        {entry.isDir ? <span/> : (
                                            <div className="flex items-center justify-end gap-0.5">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    title={t("sftp_download")}
                                                    aria-label={t("sftp_download_named", {name: entry.name})}
                                                    disabled={!!transferName}
                                                    onClick={() => void handleDownload(entry)}
                                                >
                                                    {transferName === entry.name ? <LoaderCircle className="size-4 animate-spin"/> : <Download className="size-4"/>}
                                                </Button>
                                                {transferName === entry.name && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        className="text-muted-foreground hover:text-destructive"
                                                        title={t("sftp_cancel_transfer")}
                                                        aria-label={t("sftp_cancel_transfer")}
                                                        onClick={cancelTransfer}
                                                    >
                                                        <X className="size-4"/>
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
