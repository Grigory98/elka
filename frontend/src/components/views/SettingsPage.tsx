import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { User, Lock, Trash2, Globe, FolderOpen, Download, Upload, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SettingsCard } from "@/components/ui/settings-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { useSessionStore } from "@/store/sessionStore";
import { AuthService } from "../../../bindings/elka-desktop/backend/internal/services/auth";
import { AppSettings, SettingsService } from "../../../bindings/elka-desktop/backend/internal/services/settings";
import { handleAppError } from "@/lib/error";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { HostViewMode, useUIStore } from "@/store/uiStore";
import { saveHostViewPreference } from "@/lib/viewSettings";
import { APP_COLOR_PALETTES, AppearanceSettings, DEFAULT_APPEARANCE, FONT_FAMILIES } from "@/lib/appearance";
import { HostTransferService } from "../../../bindings/elka-desktop/backend/internal/services/blob";
import { HOSTS_QUERY_KEY } from "@/hooks/useHosts";
import { GROUPS_QUERY_KEY } from "@/hooks/useGroups";
import { UpdateSettingsCard } from "@/components/views/UpdateSettingsCard";

type HostTransferFormat = "tabby" | "mobaxterm" | "securecrt";

// The derived colour is read from the CSS variable that applyAppAppearance already set, so the swatch
// always matches what is actually painted. Anything translucent is composited over the app background.
function resolveCSSColor(variable: string): string {
    const parse = (value: string) => {
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        const [red, green, blue] = parts;
        if ([red, green, blue].some((channel) => Number.isNaN(channel))) return null;

        const alpha = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1;
        return {red, green, blue, alpha};
    };

    const probe = document.createElement("span");
    probe.style.backgroundColor = `var(${variable})`;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();

    const top = parse(resolved);
    const bottom = parse(getComputedStyle(document.body).backgroundColor);
    if (!top) return "#000000";
    if (!bottom || top.alpha >= 1) return toHex(top.red, top.green, top.blue);

    return toHex(
        Math.round(top.red * top.alpha + bottom.red * (1 - top.alpha)),
        Math.round(top.green * top.alpha + bottom.green * (1 - top.alpha)),
        Math.round(top.blue * top.alpha + bottom.blue * (1 - top.alpha)),
    );
}

function toHex(red: number, green: number, blue: number) {
    const channel = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");

    return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

// One row layout for every appearance setting, so both columns keep the same height and the labels
// line up with the section headings. A truncated label reveals the full text on hover.
function SettingsRow({label, controlId, children}: {
    label: string;
    controlId?: string;
    children: ReactNode;
}) {
    const [isTruncated, setIsTruncated] = useState(false);
    const observerRef = useRef<ResizeObserver | null>(null);

    // A callback ref keeps measuring the live node: switching to the tooltip branch makes React
    // remount the label, and an observer bound to the detached node would report 0x0 forever.
    const measureLabel = (element: HTMLSpanElement | null) => {
        observerRef.current?.disconnect();
        if (!element) return;

        const update = () => setIsTruncated(element.scrollWidth > element.clientWidth);
        update();

        const observer = new ResizeObserver(update);
        observer.observe(element);
        observerRef.current = observer;
    };

    useEffect(() => () => observerRef.current?.disconnect(), []);

    const text = <span ref={measureLabel} className={cn("block truncate text-sm text-foreground", controlId && "cursor-pointer")}>{label}</span>;
    const labelNode = isTruncated ? (
        <Tooltip>
            <TooltipTrigger asChild>{controlId ? <label htmlFor={controlId}>{text}</label> : text}</TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
    ) : controlId ? <label htmlFor={controlId}>{text}</label> : text;

    return (
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <span className="min-w-0">{labelNode}</span>
            <span className="flex shrink-0 items-center gap-2">{children}</span>
        </div>
    );
}

function AppearanceColorInput({label, value, onChange}: {label: string; value: string; onChange: (value: string) => void}) {
    const controlID = useId();

    return (
        <SettingsRow label={label} controlId={controlID}>
            <span className="font-mono text-xs text-muted-foreground">{value.toUpperCase()}</span>
            <input
                id={controlID}
                type="color"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="size-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
                aria-label={label}
            />
        </SettingsRow>
    );
}

// Shows the colour derived from the palette until the user picks their own, then offers a way back.
function OptionalColorInput({label, variable, value, onChange}: {
    label: string;
    variable: string;
    value: string;
    onChange: (value: string) => void;
}) {
    const {t} = useTranslation("settings");
    const controlID = useId();

    return (
        <SettingsRow label={label} controlId={controlID}>
            <span className="font-mono text-xs text-muted-foreground">{(value || resolveCSSColor(variable)).toUpperCase()}</span>
            <input
                id={controlID}
                type="color"
                value={value || resolveCSSColor(variable)}
                onChange={(event) => onChange(event.target.value)}
                className="size-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
                aria-label={label}
            />
            {value && (
                <Button
                    variant="ghost"
                    size="icon-xs"
                    title={t("color_follow_theme")}
                    aria-label={t("color_follow_theme")}
                    onClick={() => onChange("")}
                >
                    <RotateCcw/>
                </Button>
            )}
        </SettingsRow>
    );
}

export function SettingsPage() {
    const {t, i18n} = useTranslation(["settings", "common", "errors"]);
    const {data: user} = useCurrentUser();
    const queryClient = useQueryClient();
    const {setUnlocked, setHasUser} = useAuthStore();
    const {clearSessions} = useSessionStore();
    const {
        showHostGroups,
        setShowHostGroups,
        showSidebarToggle,
        setShowSidebarToggle,
        serverMetrics,
        setServerMetrics,
        setSelectedHostGroup,
        hostViewMode,
        groupViewMode,
        setHostViewMode,
        setGroupViewMode,
        appearance,
        setAppearance,
    } = useUIStore();

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

    const changeServerMetrics = async (enabled: boolean) => {
        try {
            const current = await SettingsService.GetSettings();
            await SettingsService.SaveSettings(new AppSettings({...current, serverMetrics: enabled}));
            setServerMetrics(enabled);
        } catch (error) {
            handleAppError(error);
        }
    };

    const changeShowSidebarToggle = async (show: boolean) => {
        try {
            const current = await SettingsService.GetSettings();
            await SettingsService.SaveSettings(new AppSettings({...current, showSidebarToggle: show}));
            setShowSidebarToggle(show);
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
                splitPaneBorder: appearanceDraft.splitPaneBorderColor,
                splitPaneHeaderColor: appearanceDraft.splitPaneHeaderColor,
                sidebarColor: appearanceDraft.sidebarColor,
                inputColor: appearanceDraft.inputColor,
                ringColor: appearanceDraft.ringColor,
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
        <TooltipProvider delayDuration={200}>
        <div className="flex h-full w-full flex-col overflow-y-auto p-8">

            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("page_title")}</h1>

                <SettingsCard title={t("profile_title")} description={t("profile_desc")}>
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
                            <h3 className="px-3 text-sm font-semibold text-foreground">{t("app_appearance_title")}</h3>
                            <SettingsRow label={t("app_palette_label")}>
                                <Select value={selectedPalette} onValueChange={(value) => {
                                    if (value === "custom") {
                                        setIsCustomPalette(true);
                                        return;
                                    }
                                    const palette = APP_COLOR_PALETTES[value as keyof typeof APP_COLOR_PALETTES];
                                    setIsCustomPalette(false);
                                    updateAppearance(palette);
                                }}>
                                    <SelectTrigger className="w-36"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dark">{t("palette_dark")}</SelectItem>
                                        <SelectItem value="light">{t("palette_light")}</SelectItem>
                                        <SelectItem value="navy">{t("palette_navy")}</SelectItem>
                                        <SelectItem value="green">{t("palette_green")}</SelectItem>
                                        <SelectItem value="custom">{t("palette_custom")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </SettingsRow>
                            <AppearanceColorInput label={t("app_background_color")} value={appearanceDraft.appBackgroundColor} onChange={(appBackgroundColor) => updateAppearance({appBackgroundColor}, true)}/>
                            <AppearanceColorInput label={t("app_text_color")} value={appearanceDraft.appForegroundColor} onChange={(appForegroundColor) => updateAppearance({appForegroundColor}, true)}/>
                            <AppearanceColorInput label={t("app_accent_color")} value={appearanceDraft.appAccentColor} onChange={(appAccentColor) => updateAppearance({appAccentColor}, true)}/>
                            <OptionalColorInput label={t("sidebar_color")} variable="--sidebar" value={appearanceDraft.sidebarColor} onChange={(sidebarColor) => updateAppearance({sidebarColor})}/>
                            <OptionalColorInput label={t("server_metrics_color")} variable="--server-metrics" value={appearanceDraft.serverMetricsColor} onChange={(serverMetricsColor) => updateAppearance({serverMetricsColor})}/>
                            <OptionalColorInput label={t("search_highlight_color")} variable="--input" value={appearanceDraft.inputColor} onChange={(inputColor) => updateAppearance({inputColor})}/>
                            <OptionalColorInput label={t("input_accent_color")} variable="--ring" value={appearanceDraft.ringColor} onChange={(ringColor) => updateAppearance({ringColor})}/>
                            <SettingsRow label={t("app_font_label")}>
                                <Select value={appearanceDraft.appFontFamily} onValueChange={(appFontFamily) => updateAppearance({appFontFamily})}>
                                    <SelectTrigger className="w-36"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {FONT_FAMILIES.map((font) => <SelectItem key={font.family} value={font.family}>{font.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </SettingsRow>
                        </section>

                        <section className="flex flex-col gap-3">
                            <h3 className="px-3 text-sm font-semibold text-foreground">{t("terminal_appearance_title")}</h3>
                            <AppearanceColorInput label={t("terminal_background_color")} value={appearanceDraft.terminalBackgroundColor} onChange={(terminalBackgroundColor) => updateAppearance({terminalBackgroundColor})}/>
                            <AppearanceColorInput label={t("terminal_text_color")} value={appearanceDraft.terminalForegroundColor} onChange={(terminalForegroundColor) => updateAppearance({terminalForegroundColor})}/>
                            <AppearanceColorInput label={t("terminal_cursor_color")} value={appearanceDraft.terminalCursorColor} onChange={(terminalCursorColor) => updateAppearance({terminalCursorColor})}/>
                            <OptionalColorInput label={t("split_pane_header_color")} variable="--split-pane-header" value={appearanceDraft.splitPaneHeaderColor} onChange={(splitPaneHeaderColor) => updateAppearance({splitPaneHeaderColor})}/>
                            <OptionalColorInput label={t("split_pane_border_color")} variable="--split-pane-border" value={appearanceDraft.splitPaneBorderColor} onChange={(splitPaneBorderColor) => updateAppearance({splitPaneBorderColor})}/>
                            <SettingsRow label={t("terminal_cursor_style")}>
                                <Select value={appearanceDraft.terminalCursorStyle} onValueChange={(terminalCursorStyle) => updateAppearance({terminalCursorStyle: terminalCursorStyle as AppearanceSettings["terminalCursorStyle"]})}>
                                    <SelectTrigger className="w-36"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="block">{t("cursor_block")}</SelectItem>
                                        <SelectItem value="underline">{t("cursor_underline")}</SelectItem>
                                        <SelectItem value="bar">{t("cursor_bar")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </SettingsRow>
                            <SettingsRow label={t("terminal_font_label")}>
                                <Select value={appearanceDraft.terminalFontFamily} onValueChange={(terminalFontFamily) => updateAppearance({terminalFontFamily})}>
                                    <SelectTrigger className="w-36"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Cascadia Code">Cascadia Code (system)</SelectItem>
                                        {FONT_FAMILIES.map((font) => <SelectItem key={font.family} value={font.family}>{font.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </SettingsRow>
                            <SettingsRow label={t("terminal_font_size")}>
                                <span className="font-mono text-xs text-muted-foreground">{appearanceDraft.terminalFontSize}px</span>
                                <input
                                    aria-label={t("terminal_font_size")}
                                    type="range"
                                    min={10}
                                    max={24}
                                    value={appearanceDraft.terminalFontSize}
                                    onChange={(event) => updateAppearance({terminalFontSize: Number(event.target.value)})}
                                    className="h-8 w-32 accent-primary"
                                />
                            </SettingsRow>
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

                <UpdateSettingsCard/>

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

                    <label className="flex cursor-pointer items-center justify-between gap-4">
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">{t("server_metrics_title")}</span>
                            <span className="text-xs text-muted-foreground">{t("server_metrics_desc")}</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={serverMetrics}
                            onChange={(event) => void changeServerMetrics(event.target.checked)}
                            className="size-4 shrink-0 accent-primary"
                        />
                    </label>

                    <div className="my-2 h-px w-full bg-border"/>

                    <label className="flex cursor-pointer items-center justify-between gap-4">
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">{t("sidebar_toggle_title")}</span>
                            <span className="text-xs text-muted-foreground">{t("sidebar_toggle_desc")}</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={showSidebarToggle}
                            onChange={(event) => void changeShowSidebarToggle(event.target.checked)}
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
    </TooltipProvider>
    );
}
