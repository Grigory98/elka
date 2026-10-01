import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { User, Server, Lock, Trash2, Globe, AlertTriangle, FolderOpen, Download, Upload, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwitchServerModal } from "@/components/views/SwitchServerModal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SettingsCard } from "@/components/ui/settings-card";
import { useCurrentUser } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { useSessionStore } from "@/store/sessionStore";
import { AuthService } from "../../../bindings/terminator-desktop/backend/internal/services/auth";
import { AppSettings, SettingsService } from "../../../bindings/terminator-desktop/backend/internal/services/settings";
import { handleAppError } from "@/lib/error";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useSyncStore } from "@/store/syncStore.ts";
import { HostViewMode, useUIStore } from "@/store/uiStore";
import { saveHostViewPreference } from "@/lib/viewSettings";
import { APP_COLOR_PALETTES, AppearanceSettings, DEFAULT_APPEARANCE, FONT_FAMILIES } from "@/lib/appearance";
import { HostTransferService } from "../../../bindings/terminator-desktop/backend/internal/services/blob";
import { HOSTS_QUERY_KEY } from "@/hooks/useHosts";
import { GROUPS_QUERY_KEY } from "@/hooks/useGroups";

type HostTransferFormat = "tabby" | "mobaxterm" | "securecrt";

function AppearanceColorInput({label, value, onChange}: {label: string; value: string; onChange: (value: string) => void}) {
    return (
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <span className="text-sm text-foreground">{label}</span>
            <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{value.toUpperCase()}</span>
                <input
                    type="color"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="size-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
                    aria-label={label}
                />
            </span>
        </label>
    );
}

export function SettingsPage() {
    const {t, i18n} = useTranslation(["settings", "common", "errors"]);
    const {data: user, refetch} = useCurrentUser();
    const queryClient = useQueryClient();
    const {setUnlocked, setHasUser} = useAuthStore();
    const {clearSessions} = useSessionStore();
    const {lastError} = useSyncStore();
    const {
        showHostGroups,
        setShowHostGroups,
        setSelectedHostGroup,
        hostViewMode,
        groupViewMode,
        setHostViewMode,
        setGroupViewMode,
        appearance,
        setAppearance,
    } = useUIStore();

    const [isServerModalOpen, setIsServerModalOpen] = useState(false);
    const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
    const [vaultDirectory, setVaultDirectory] = useState("");
    const [importFormat, setImportFormat] = useState<HostTransferFormat>("tabby");
    const [exportFormat, setExportFormat] = useState<HostTransferFormat>("tabby");
    const [transferAction, setTransferAction] = useState<"import" | "export" | null>(null);
    const [transferStatus, setTransferStatus] = useState<string | null>(null);
    const [appearanceDraft, setAppearanceDraft] = useState<AppearanceSettings>(appearance);
    const [appearanceStatus, setAppearanceStatus] = useState<string | null>(null);
    const [isCustomPalette, setIsCustomPalette] = useState(false);

    useEffect(() => setAppearanceDraft(appearance), [appearance]);

    useEffect(() => {
        SettingsService.GetSettings()
            .then((settings) => setVaultDirectory(settings.vaultDirectory || ""))
            .catch(handleAppError);
    }, []);

    const chooseVaultDirectory = async (action: "switch" | "move") => {
        try {
            const directory = await SettingsService.SelectVaultDirectory();
            if (!directory) return;
            if (action === "switch") {
                await SettingsService.SwitchVaultDirectory(directory);
            } else {
                await SettingsService.MoveVaultToDirectory(directory);
            }
            setVaultDirectory(directory);
        } catch (error) {
            handleAppError(error);
        }
    };

    const handleLockVault = async () => {
        try {
            clearSessions();
            await AuthService.LockVault();
            setUnlocked(false);
        } catch (error) {
            handleAppError(error);
        }
    };

    const handleWipeData = async () => {
        try {
            clearSessions();
            await AuthService.WipeData();
            setUnlocked(false);
            setHasUser(false);
        } catch (error) {
            handleAppError(error);
        }
    };

    const changeLanguage = async (lng: string) => {
        try {
            const current = await SettingsService.GetSettings();

            const updated = new AppSettings({
                ...current,
                language: lng,
            });

            await SettingsService.SaveSettings(updated);
            void i18n.changeLanguage(lng);
        } catch (error) {
            handleAppError(error);
        }
    };

    const changeShowHostGroups = async (show: boolean) => {
        try {
            const current = await SettingsService.GetSettings();
            await SettingsService.SaveSettings(new AppSettings({...current, showHostGroups: show}));
            setShowHostGroups(show);
            if (!show) setSelectedHostGroup(null);
        } catch (error) {
            handleAppError(error);
        }
    };

    const saveViewMode = async (field: "hostViewMode" | "groupViewMode", mode: HostViewMode) => {
        try {
            await saveHostViewPreference(field, mode);
            if (field === "hostViewMode") setHostViewMode(mode);
            else setGroupViewMode(mode);
        } catch (error) {
            handleAppError(error);
        }
    };

    const transferHosts = async (action: "import" | "export") => {
        setTransferAction(action);
        setTransferStatus(null);
        try {
            const result = action === "import"
                ? await HostTransferService.Import(importFormat)
                : await HostTransferService.Export(exportFormat);
            if (result.cancelled) return;
            if (action === "import") {
                await queryClient.invalidateQueries({queryKey: HOSTS_QUERY_KEY});
                await queryClient.invalidateQueries({queryKey: GROUPS_QUERY_KEY});
                setTransferStatus(t("host_transfer_import_result", {
                    hosts: result.hosts,
                    groups: result.groups,
                    skipped: result.skipped,
                }));
            } else {
                setTransferStatus(t("host_transfer_export_result", {
                    hosts: result.hosts,
                    groups: result.groups,
                }));
            }
        } catch (error) {
            handleAppError(error);
        } finally {
            setTransferAction(null);
        }
    };

    const updateAppearance = (update: Partial<AppearanceSettings>, customColors = false) => {
        const next = {...appearanceDraft, ...update};
        setAppearanceDraft(next);
        setAppearance(next);
        if (customColors) setIsCustomPalette(true);
        setAppearanceStatus(null);
    };

    const saveAppearance = async () => {
        try {
            const current = await SettingsService.GetSettings();
            await SettingsService.SaveSettings(new AppSettings({
                ...current,
                appBackgroundColor: appearanceDraft.appBackgroundColor,
                appForegroundColor: appearanceDraft.appForegroundColor,
                appAccentColor: appearanceDraft.appAccentColor,
                appFontFamily: appearanceDraft.appFontFamily,
                terminalBackground: appearanceDraft.terminalBackgroundColor,
                terminalForeground: appearanceDraft.terminalForegroundColor,
                terminalCursor: appearanceDraft.terminalCursorColor,
                terminalCursorStyle: appearanceDraft.terminalCursorStyle,
                terminalFontFamily: appearanceDraft.terminalFontFamily,
                terminalFontSize: appearanceDraft.terminalFontSize,
            }));
            setAppearanceStatus(t("appearance_saved"));
        } catch (error) {
            handleAppError(error);
        }
    };

    const selectedPalette = isCustomPalette ? "custom" : Object.entries(APP_COLOR_PALETTES).find(([, palette]) =>
        palette.appBackgroundColor === appearanceDraft.appBackgroundColor &&
        palette.appForegroundColor === appearanceDraft.appForegroundColor &&
        palette.appAccentColor === appearanceDraft.appAccentColor
    )?.[0] || "custom";

    return (
        <div className="flex h-full w-full flex-col overflow-y-auto p-8">

            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("page_title")}</h1>

                <SettingsCard title={t("profile_sync_title")} description={t("profile_sync_desc")}>
                    <div className="flex items-center gap-4">
                        <div
                            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <User className="size-6"/>
                        </div>
                        <div className="flex flex-col">
                            <span
                                className="text-sm font-medium text-muted-foreground">{t("username", {ns: "common"})}</span>
                            <span className="text-lg font-semibold text-foreground">
                                {user?.username || t("loading", {ns: "common"})}
                            </span>
                        </div>
                    </div>

                    <div
                        className="flex items-center justify-between
                                   rounded-lg border border-border bg-background p-4">
                        <div className="flex items-center gap-4">
                            <div
                                className="flex size-10 shrink-0 items-center justify-center
                                           rounded-lg bg-info/10 text-info">
                                <Server className="size-5"/>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-foreground">
                                    {t("cloud_server_label")}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {user?.serverUrl ? user.serverUrl : t("local_vault_only")}
                                </span>
                            </div>
                        </div>
                        <Button variant="secondary" onClick={() => setIsServerModalOpen(true)}>
                            {user?.serverUrl ? t("switch_server_btn") : t("connect_btn")}
                        </Button>
                    </div>

                    {lastError && (
                        <div className="p-4 flex items-start gap-3 text-destructive
                                        border border-destructive/20 bg-destructive/10 rounded-lg">
                            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">{t("sync_offline")}</span>
                                <span className="text-xs opacity-90">
                                    {t(`errors:${lastError.code}`, { defaultValue: lastError.message })}
                                </span>
                                {lastError.detailsString && (
                                    <span className="mt-1 text-2xs font-mono opacity-75">
                                        {lastError.detailsString}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </SettingsCard>

                <SettingsCard title={t("vault_location_title")} description={t("vault_location_desc")}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                            <span className="block truncate text-sm text-muted-foreground" title={vaultDirectory}>
                                {vaultDirectory || t("vault_default_location")}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" className="shrink-0" onClick={() => void chooseVaultDirectory("switch")}>
                                <FolderOpen className="mr-2 size-4"/>{t("switch_vault_location")}
                            </Button>
                            <Button variant="secondary" className="shrink-0" onClick={() => void chooseVaultDirectory("move")}>
                                <FolderOpen className="mr-2 size-4"/>{t("move_vault_location")}
                            </Button>
                        </div>
                    </div>
                </SettingsCard>

                <SettingsCard title={t("host_transfer_title")} description={t("host_transfer_desc")}>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="grid min-w-52 flex-1 gap-2">
                            <label className="text-sm font-medium text-foreground" htmlFor="host-import-format">{t("host_import_format")}</label>
                            <Select value={importFormat} onValueChange={(value) => setImportFormat(value as HostTransferFormat)}>
                                <SelectTrigger id="host-import-format"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="tabby">{t("host_format_tabby")}</SelectItem>
                                    <SelectItem value="mobaxterm">{t("host_format_mobaxterm")}</SelectItem>
                                    <SelectItem value="securecrt">{t("host_format_securecrt")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button variant="outline" disabled={!!transferAction} onClick={() => void transferHosts("import")}>
                            {transferAction === "import" ? <LoaderCircle className="size-4 animate-spin"/> : <Upload className="size-4"/>}
                            {t("host_import_button")}
                        </Button>
                    </div>

                    <div className="my-2 h-px w-full bg-border"/>

                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="grid min-w-52 flex-1 gap-2">
                            <label className="text-sm font-medium text-foreground" htmlFor="host-export-format">{t("host_export_format")}</label>
                            <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as HostTransferFormat)}>
                                <SelectTrigger id="host-export-format"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="tabby">{t("host_format_tabby")}</SelectItem>
                                    <SelectItem value="mobaxterm">{t("host_format_mobaxterm")}</SelectItem>
                                    <SelectItem value="securecrt">{t("host_format_securecrt")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button disabled={!!transferAction} onClick={() => void transferHosts("export")}>
                            {transferAction === "export" ? <LoaderCircle className="size-4 animate-spin"/> : <Download className="size-4"/>}
                            {t("host_export_button")}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("host_transfer_secrets_note")}</p>
                    {transferStatus && <p role="status" className="text-sm text-success">{transferStatus}</p>}
                </SettingsCard>

                <SettingsCard title={t("appearance_title")} description={t("appearance_desc")}>
                    <div className="grid gap-6 lg:grid-cols-2">
                        <section className="flex flex-col gap-3">
                            <h3 className="text-sm font-semibold text-foreground">{t("app_appearance_title")}</h3>
                            <label className="grid gap-2">
                                <span className="text-sm text-foreground">{t("app_palette_label")}</span>
                                <Select value={selectedPalette} onValueChange={(value) => {
                                    if (value === "custom") {
                                        setIsCustomPalette(true);
                                        return;
                                    }
                                    const palette = APP_COLOR_PALETTES[value as keyof typeof APP_COLOR_PALETTES];
                                    setIsCustomPalette(false);
                                    updateAppearance(palette);
                                }}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dark">{t("palette_dark")}</SelectItem>
                                        <SelectItem value="light">{t("palette_light")}</SelectItem>
                                        <SelectItem value="navy">{t("palette_navy")}</SelectItem>
                                        <SelectItem value="green">{t("palette_green")}</SelectItem>
                                        <SelectItem value="custom">{t("palette_custom")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>
                            <AppearanceColorInput label={t("app_background_color")} value={appearanceDraft.appBackgroundColor} onChange={(appBackgroundColor) => updateAppearance({appBackgroundColor}, true)}/>
                            <AppearanceColorInput label={t("app_text_color")} value={appearanceDraft.appForegroundColor} onChange={(appForegroundColor) => updateAppearance({appForegroundColor}, true)}/>
                            <AppearanceColorInput label={t("app_accent_color")} value={appearanceDraft.appAccentColor} onChange={(appAccentColor) => updateAppearance({appAccentColor}, true)}/>
                            <label className="grid gap-2">
                                <span className="text-sm text-foreground">{t("app_font_label")}</span>
                                <Select value={appearanceDraft.appFontFamily} onValueChange={(appFontFamily) => updateAppearance({appFontFamily})}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {FONT_FAMILIES.map((font) => <SelectItem key={font.family} value={font.family}>{font.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </label>
                        </section>

                        <section className="flex flex-col gap-3">
                            <h3 className="text-sm font-semibold text-foreground">{t("terminal_appearance_title")}</h3>
                            <AppearanceColorInput label={t("terminal_background_color")} value={appearanceDraft.terminalBackgroundColor} onChange={(terminalBackgroundColor) => updateAppearance({terminalBackgroundColor})}/>
                            <AppearanceColorInput label={t("terminal_text_color")} value={appearanceDraft.terminalForegroundColor} onChange={(terminalForegroundColor) => updateAppearance({terminalForegroundColor})}/>
                            <AppearanceColorInput label={t("terminal_cursor_color")} value={appearanceDraft.terminalCursorColor} onChange={(terminalCursorColor) => updateAppearance({terminalCursorColor})}/>
                            <label className="grid gap-2">
                                <span className="text-sm text-foreground">{t("terminal_cursor_style")}</span>
                                <Select value={appearanceDraft.terminalCursorStyle} onValueChange={(terminalCursorStyle) => updateAppearance({terminalCursorStyle: terminalCursorStyle as AppearanceSettings["terminalCursorStyle"]})}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="block">{t("cursor_block")}</SelectItem>
                                        <SelectItem value="underline">{t("cursor_underline")}</SelectItem>
                                        <SelectItem value="bar">{t("cursor_bar")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>
                            <label className="grid gap-2">
                                <span className="text-sm text-foreground">{t("terminal_font_label")}</span>
                                <Select value={appearanceDraft.terminalFontFamily} onValueChange={(terminalFontFamily) => updateAppearance({terminalFontFamily})}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Cascadia Code">Cascadia Code (system)</SelectItem>
                                        {FONT_FAMILIES.map((font) => <SelectItem key={font.family} value={font.family}>{font.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </label>
                            <label className="grid gap-2">
                                <span className="flex justify-between text-sm text-foreground">
                                    {t("terminal_font_size")}
                                    <span className="text-muted-foreground">{appearanceDraft.terminalFontSize}px</span>
                                </span>
                                <input
                                    type="range"
                                    min={10}
                                    max={24}
                                    value={appearanceDraft.terminalFontSize}
                                    onChange={(event) => updateAppearance({terminalFontSize: Number(event.target.value)})}
                                    className="w-full accent-primary"
                                />
                            </label>
                        </section>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                        <span aria-live="polite" className="text-sm text-success">{appearanceStatus}</span>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => {
                                setIsCustomPalette(false);
                                updateAppearance(DEFAULT_APPEARANCE);
                            }}>{t("appearance_reset")}</Button>
                            <Button onClick={() => void saveAppearance()}>{t("appearance_save")}</Button>
                        </div>
                    </div>
                </SettingsCard>

                <SettingsCard title={t("preferences_title")}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div
                                className="flex size-10 shrink-0 items-center justify-center
                                           rounded-lg bg-primary/10 text-primary">
                                <Globe className="size-5"/>
                            </div>
                            <span className="text-sm font-medium text-foreground">
                                {t("language_label")}
                            </span>
                        </div>
                        <Select value={i18n.resolvedLanguage} onValueChange={changeLanguage}>
                            <SelectTrigger className="w-45">
                                <SelectValue placeholder={t("select_language")}/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="ru">Русский</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="my-2 h-px w-full bg-border"/>

                    <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-medium text-foreground">{t("host_view_mode_label")}</span>
                        <Select value={hostViewMode} onValueChange={(value) => void saveViewMode("hostViewMode", value as HostViewMode)}>
                            <SelectTrigger className="w-45"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cards">{t("view_cards")}</SelectItem>
                                <SelectItem value="list">{t("view_list")}</SelectItem>
                                <SelectItem value="tree">{t("view_tree")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-medium text-foreground">{t("group_view_mode_label")}</span>
                        <Select value={groupViewMode} onValueChange={(value) => void saveViewMode("groupViewMode", value as HostViewMode)}>
                            <SelectTrigger className="w-45"><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="tree">{t("view_tree")}</SelectItem>
                                <SelectItem value="list">{t("view_list")}</SelectItem>
                                <SelectItem value="cards">{t("view_cards")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="my-2 h-px w-full bg-border"/>

                    <label className="flex cursor-pointer items-center justify-between gap-4">
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">{t("show_host_groups_title")}</span>
                            <span className="text-xs text-muted-foreground">{t("show_host_groups_desc")}</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={showHostGroups}
                            onChange={(event) => void changeShowHostGroups(event.target.checked)}
                            className="size-4 shrink-0 accent-primary"
                        />
                    </label>
                </SettingsCard>

                <SettingsCard title={t("security_title")} description={t("security_desc")}>
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="font-medium text-foreground">{t("lock_vault_title")}</span>
                            <span className="text-xs text-muted-foreground">{t("lock_vault_desc")}</span>
                        </div>
                        <Button variant="outline" onClick={handleLockVault}>
                            <Lock className="mr-2 size-4"/>
                            {t("lock_btn")}
                        </Button>
                    </div>

                    <div className="my-2 h-px w-full bg-border"/>

                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="font-medium text-destructive">{t("wipe_data_title")}</span>
                            <span className="text-xs text-muted-foreground">{t("wipe_data_desc")}</span>
                        </div>
                        <Button variant="destructive" onClick={() => setIsWipeModalOpen(true)}>
                            <Trash2 className="mr-2 size-4"/>
                            {t("wipe_btn")}
                        </Button>
                    </div>
                </SettingsCard>

            </div>

            <SwitchServerModal
                isOpen={isServerModalOpen}
                onClose={() => setIsServerModalOpen(false)}
                currentUrl={user?.serverUrl || ""}
                onSuccess={() => refetch()}
            />

            <ConfirmModal
                isOpen={isWipeModalOpen}
                onClose={() => setIsWipeModalOpen(false)}
                onConfirm={handleWipeData}
                title={t("wipe_confirm_title")}
                description={t("wipe_confirm_desc")}
                confirmText={t("nuke_it")}
                isDestructive={true}
            />

        </div>
    );
}
