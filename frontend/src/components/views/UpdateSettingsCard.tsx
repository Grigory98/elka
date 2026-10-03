import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownToLine, RefreshCw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SettingsCard } from "@/components/ui/settings-card";
import { AppEvent } from "@/lib/events";
import { handleAppError } from "@/lib/error";
import { Events } from "@wailsio/runtime";
import { UpdaterService, UpdateInfo } from "../../../bindings/elka-desktop/backend/internal/services/updater";

type Stage = "idle" | "checking" | "upToDate" | "available" | "downloading" | "ready" | "installing";

// The backend reports plain messages, and the generic toast would hide them, so they are shown inline.
function describeError(error: unknown): string {
    if (typeof error === "string") return error;
    const message = (error as {message?: string} | null)?.message;
    return message || String(error);
}

function formatBytes(bytes: number): string {
    if (bytes <= 0) return "";
    const megabytes = bytes / (1024 * 1024);
    return megabytes >= 1024
        ? `${(megabytes / 1024).toFixed(2)} GB`
        : `${megabytes.toFixed(1)} MB`;
}

export function UpdateSettingsCard() {
    const {t} = useTranslation(["update", "common"]);
    const [info, setInfo] = useState<UpdateInfo | null>(null);
    const [stage, setStage] = useState<Stage>("idle");
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState({downloaded: 0, total: 0, percent: 0});

    const check = useCallback(async () => {
        setStage("checking");
        setError(null);
        try {
            const latest = await UpdaterService.CheckForUpdates();
            setInfo(latest);
            setProgress({downloaded: 0, total: 0, percent: 0});
            setStage(latest?.isAvailable ? "available" : "upToDate");
        } catch (checkError) {
            setStage("idle");
            setError(describeError(checkError));
            handleAppError(checkError);
        }
    }, []);

    // Checking on open keeps the numbers current without bothering the user while they work.
    useEffect(() => {
        void check();
    }, [check]);

    useEffect(() => {
        const unsubscribe = Events.On(AppEvent.UpdaterProgress, (event) => {
            setProgress(event.data);
        });
        return () => unsubscribe();
    }, []);

    const download = async () => {
        setStage("downloading");
        setError(null);
        try {
            await UpdaterService.DownloadUpdate();
            setStage("ready");
        } catch (downloadError) {
            setStage("available");
            setError(describeError(downloadError));
            handleAppError(downloadError);
        }
    };

    // The installation runs while the application is still open, so a failure comes back as an error
    // instead of leaving a closed application behind.
    const install = async () => {
        setStage("installing");
        setError(null);
        try {
            await UpdaterService.ApplyAndRestart();
        } catch (installError) {
            setStage("ready");
            setError(describeError(installError));
            handleAppError(installError);
        }
    };

    const busy = stage === "checking" || stage === "downloading" || stage === "installing";
    const downloaded = stage === "ready";
    const progressLabel = stage === "installing"
        ? t("update:installing")
        : downloaded
            ? t("update:downloaded")
            : t("update:downloading_progress", {percent: Math.round(progress.percent)});

    return (
        <SettingsCard title={t("update:updates_title")} description={t("update:updates_desc")}>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">{t("update:current_version")}</span>
                    <span className="font-medium text-foreground">{info?.currentVersion || "—"}</span>
                </div>
                <Button variant="outline" className="shrink-0" disabled={busy || downloaded} onClick={() => void check()}>
                    <RefreshCw className={`mr-2 size-4${stage === "checking" ? " animate-spin" : ""}`}/>
                    {stage === "checking" ? t("update:checking") : t("update:check")}
                </Button>
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            {stage === "upToDate" && info && (
                <p role="status" className="text-sm text-success">{t("update:up_to_date")}</p>
            )}

            {info?.isAvailable && (
                <>
                    <div className="my-2 h-px w-full bg-border"/>

                    <div className="flex flex-col gap-1">
                        <span className="text-sm text-muted-foreground">{t("update:available_version", {version: info.latestVersion})}</span>
                        {info.assetName ? (
                            <span className="text-xs text-muted-foreground">
                                {info.assetName}
                                {info.assetSize > 0 ? ` · ${formatBytes(info.assetSize)}` : ""}
                            </span>
                        ) : (
                            <span className="text-xs text-destructive">{t("update:no_asset")}</span>
                        )}
                    </div>

                    {info.notes && (
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3">
                            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{info.notes}</p>
                        </div>
                    )}

                    {info.releaseUrl && (
                        <a
                            href={info.releaseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                            {t("update:release_notes_link")}
                        </a>
                    )}

                    {(stage === "downloading" || downloaded || stage === "installing") && (
                        <div className="flex flex-col gap-2">
                            <Progress value={downloaded ? 100 : progress.percent}/>
                            <span className="text-xs text-muted-foreground">{progressLabel}</span>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {!downloaded && (
                            <Button disabled={busy || !info.assetUrl} onClick={() => void download()}>
                                <ArrowDownToLine className="mr-2 size-4"/>
                                {stage === "downloading" ? t("update:downloading") : t("update:download")}
                            </Button>
                        )}
                        {downloaded && (
                            <Button onClick={() => void install()}>
                                <RotateCw className="mr-2 size-4"/>
                                {t("update:install")}
                            </Button>
                        )}
                    </div>
                </>
            )}
        </SettingsCard>
    );
}
