import { Sidebar } from "@/components/layout/Sidebar";
import { TitleBar } from "@/components/layout/TitleBar";
import { ContentView } from "@/components/layout/ContentView";
import { LockScreen } from "@/components/views/LockScreen";
import { Toaster } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/authStore";
import { Events } from "@wailsio/runtime";
import { useEffect } from "react";
import { SettingsService } from "../bindings/elka-desktop/backend/internal/services/settings";
import { useTranslation } from "react-i18next";
import { AppEvent } from "@/lib/events.ts";
import { useSessionStore } from "@/store/sessionStore.ts";
import { useConnectionStore } from "@/store/connectionStore";
import { useUIStore } from "@/store/uiStore.ts";
import { applyAppAppearance, DEFAULT_APPEARANCE } from "@/lib/appearance";
import { preloadTerminalFont } from "@/lib/terminalFont";
import { ensureFontFamilyLoaded } from "@/lib/fontLoader";
import { handleSshData } from "@/lib/terminalSessions";
import { decodeBase64ToUint8Array } from "@/lib/utils";
import { dismissSplash } from "@/lib/splash";

export default function App() {
    const {isUnlocked} = useAuthStore();
    const {removeSession} = useSessionStore();
    const {setShowHostGroups, setShowSidebarToggle, setServerMetrics, setHostViewMode, setGroupViewMode, setAppearance} = useUIStore();
    const appearance = useUIStore((state) => state.appearance);
    const {i18n} = useTranslation();

    useEffect(() => {
        SettingsService.GetSettings()
            .then((settings) => {
                if (settings.language && settings.language !== i18n.language) {
                    void i18n.changeLanguage(settings.language);
                }
                setShowHostGroups(settings.showHostGroups ?? true);
                setShowSidebarToggle(settings.showSidebarToggle ?? true);
                setServerMetrics(settings.serverMetrics ?? true);
                setHostViewMode(settings.hostViewMode === "list" || settings.hostViewMode === "tree" ? settings.hostViewMode : "cards");
                setGroupViewMode(settings.groupViewMode === "cards" || settings.groupViewMode === "list" ? settings.groupViewMode : "tree");
                setAppearance({
                    appBackgroundColor: settings.appBackgroundColor || DEFAULT_APPEARANCE.appBackgroundColor,
                    appForegroundColor: settings.appForegroundColor || DEFAULT_APPEARANCE.appForegroundColor,
                    appAccentColor: settings.appAccentColor || DEFAULT_APPEARANCE.appAccentColor,
                    appFontFamily: settings.appFontFamily || DEFAULT_APPEARANCE.appFontFamily,
                    terminalBackgroundColor: settings.terminalBackground || DEFAULT_APPEARANCE.terminalBackgroundColor,
                    terminalForegroundColor: settings.terminalForeground || DEFAULT_APPEARANCE.terminalForegroundColor,
                    terminalCursorColor: settings.terminalCursor || DEFAULT_APPEARANCE.terminalCursorColor,
                    terminalCursorStyle: settings.terminalCursorStyle === "underline" || settings.terminalCursorStyle === "bar"
                        ? settings.terminalCursorStyle
                        : DEFAULT_APPEARANCE.terminalCursorStyle,
                    terminalFontFamily: settings.terminalFontFamily || DEFAULT_APPEARANCE.terminalFontFamily,
                    terminalFontSize: settings.terminalFontSize || DEFAULT_APPEARANCE.terminalFontSize,
                    terminalScrollback: settings.terminalScrollback || DEFAULT_APPEARANCE.terminalScrollback,
                    splitPaneBorderColor: settings.splitPaneBorder || DEFAULT_APPEARANCE.splitPaneBorderColor,
                    splitPaneHeaderColor: settings.splitPaneHeaderColor || DEFAULT_APPEARANCE.splitPaneHeaderColor,
                    serverMetricsColor: settings.serverMetricsColor || DEFAULT_APPEARANCE.serverMetricsColor,
                    sidebarColor: settings.sidebarColor || DEFAULT_APPEARANCE.sidebarColor,
                    inputColor: settings.inputColor || DEFAULT_APPEARANCE.inputColor,
                    ringColor: settings.ringColor || DEFAULT_APPEARANCE.ringColor,
                });
                // Faces are fetched on demand now, and the splash screen is what the user watches until
                // this resolves: dismissing it before the fetch paints the whole interface in the
                // fallback face and repaints it a moment later.
                return ensureFontFamilyLoaded(settings.appFontFamily || DEFAULT_APPEARANCE.appFontFamily);
            })
            .catch(console.error)
            .finally(dismissSplash);
    }, [i18n, setAppearance, setGroupViewMode, setHostViewMode, setServerMetrics, setShowHostGroups, setShowSidebarToggle]);

    useEffect(() => {
        applyAppAppearance(appearance);
    }, [appearance]);

    useEffect(() => {
        // Warming the chosen face here, while the user is still on the hosts screen, keeps the first
        // terminal from having to wait for a download before xterm can measure its character cell.
        // Only that one face: the other families are fetched if and when they are picked.
        preloadTerminalFont(appearance.terminalFontFamily, appearance.terminalFontSize);
    }, [appearance.terminalFontFamily, appearance.terminalFontSize]);

    useEffect(() => {
        const unsubscribeData = Events.On(AppEvent.SshData, (event) => {
            handleSshData(event.data.id, decodeBase64ToUint8Array(event.data.data));
        });
        const unsubscribeClosed = Events.On(AppEvent.SshClosed, (event) => {
            // The backend has already closed this session, so it is only forgotten here: the tab it
            // belongs to goes away next, and closing it must not try to hang up on it again.
            useConnectionStore.getState().forget(event.data.id);
            // setTimeout(() => {
            //     removeSession(event.data.id);
            // }, 500);
            removeSession(event.data.id);
        });

        return () => {
            unsubscribeData();
            unsubscribeClosed();
        };
    }, [removeSession]);


    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
            <TitleBar/>
            {/* Зазор от нижней границы вкладок до содержимого задан здесь, а не на терминале:
                боковая панель и сам терминал лежат рядом в одной строке, поэтому уезжают вниз
                на равную величину и остаются одной высоты без отдельной подгонки. */}
            <div className="relative flex flex-1 overflow-hidden pt-[var(--content-top-gap)]">

                {!isUnlocked ? (
                    <LockScreen/>
                ) : (
                    <>
                        <Sidebar/>
                        <ContentView/>
                    </>
                )}

            </div>
            <Toaster position="bottom-right" theme="dark" richColors/>
        </div>
    );
}
