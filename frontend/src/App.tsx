import { Sidebar } from "@/components/layout/Sidebar";
import { TitleBar } from "@/components/layout/TitleBar";
import { ContentView } from "@/components/layout/ContentView";
import { LockScreen } from "@/components/views/LockScreen";
import { Toaster } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/authStore";
import { Events } from "@wailsio/runtime";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HOSTS_QUERY_KEY } from "@/hooks/useHosts.ts";
import { KEYS_QUERY_KEY } from "@/hooks/useKeys.ts";
import { CREDENTIALS_QUERY_KEY } from "@/hooks/useCredentials.ts";
import { GROUPS_QUERY_KEY } from "@/hooks/useGroups.ts";
import { SettingsService } from "../bindings/terminator-desktop/backend/internal/services/settings";
import { useTranslation } from "react-i18next";
import { AppEvent } from "@/lib/events.ts";
import { useSessionStore } from "@/store/sessionStore.ts";
import { useUIStore } from "@/store/uiStore.ts";
import { UpdaterService } from "../bindings/terminator-desktop/backend/internal/services/updater";
import { applyAppAppearance, DEFAULT_APPEARANCE } from "@/lib/appearance";

export default function App() {
    const {isUnlocked} = useAuthStore();
    const {removeSession} = useSessionStore();
    const {setUpdateVersionReady, setShowHostGroups, setHostViewMode, setGroupViewMode, setAppearance} = useUIStore();
    const appearance = useUIStore((state) => state.appearance);
    const queryClient = useQueryClient();
    const {i18n} = useTranslation();

    useEffect(() => {
        SettingsService.GetSettings()
            .then((settings) => {
                if (settings.language && settings.language !== i18n.language) {
                    void i18n.changeLanguage(settings.language);
                }
                setShowHostGroups(settings.showHostGroups ?? true);
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
                    terminalFontFamily: settings.terminalFontFamily || DEFAULT_APPEARANCE.terminalFontFamily,
                    terminalFontSize: settings.terminalFontSize || DEFAULT_APPEARANCE.terminalFontSize,
                });
            })
            .catch(console.error);
    }, [i18n, setAppearance, setGroupViewMode, setHostViewMode, setShowHostGroups]);

    useEffect(() => {
        applyAppAppearance(appearance);
    }, [appearance]);

    useEffect(() => {
        const unsubscribe = Events.On(AppEvent.SshClosed, (event) => {
            // setTimeout(() => {
            //     removeSession(event.data.id);
            // }, 500);
            removeSession(event.data.id);
        });

        return () => unsubscribe();
    }, [removeSession]);

    useEffect(() => {
        if (!isUnlocked) return;

        const unsubscribe = Events.On(AppEvent.SyncUpdatesAvailable, () => {
            console.debug(`${AppEvent.SyncUpdatesAvailable}: invalidating queries`);

            void queryClient.invalidateQueries({queryKey: HOSTS_QUERY_KEY});
            void queryClient.invalidateQueries({queryKey: KEYS_QUERY_KEY});
            void queryClient.invalidateQueries({queryKey: CREDENTIALS_QUERY_KEY});
            void queryClient.invalidateQueries({queryKey: GROUPS_QUERY_KEY});
        });

        return () => unsubscribe();
    }, [isUnlocked, queryClient]);

    useEffect(() => {
        if (!isUnlocked) return;

        const checkUpdates = () => {
            UpdaterService.CheckForUpdates()
                .then((info) => {
                    if (info?.isAvailable) {
                        UpdaterService.DownloadUpdate()
                            .then(() => setUpdateVersionReady(info.version))
                            .catch(console.error);
                    }
                })
                .catch(console.error);
        };

        checkUpdates();

        const interval = 5 * 60 * 1000; // 5 mins
        const intervalId = setInterval(checkUpdates, interval);

        return () => clearInterval(intervalId);
    }, [isUnlocked, setUpdateVersionReady]);

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
            <TitleBar/>
            <div className="flex flex-1 overflow-hidden relative">

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
