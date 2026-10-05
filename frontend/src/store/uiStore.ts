import { create } from "zustand";
import { getInitialAppearance, resolveAppFontFamily } from "@/lib/appearance";
import type { AppearanceSettings } from "@/lib/appearance";
import { resolveTerminalFontFamily } from "@/lib/terminalFont";

export enum ViewType {
    Hosts = "hosts",
    Keys = "keys",
    Credentials = "credentials",
    Groups = "groups",
    Settings = "settings",
    Terminal = "terminal",
}

export type HostViewMode = "cards" | "list" | "tree";

interface UIState {
    activeView: ViewType;
    isSidebarVisible: boolean;
    showHostGroups: boolean;
    showSidebarToggle: boolean;
    serverMetrics: boolean;
    selectedHostGroup: string | null;
    hostViewMode: HostViewMode;
    groupViewMode: HostViewMode;
    appearance: AppearanceSettings;
    setActiveView: (view: ViewType) => void;
    setShowHostGroups: (show: boolean) => void;
    setShowSidebarToggle: (show: boolean) => void;
    setServerMetrics: (enabled: boolean) => void;
    setSelectedHostGroup: (group: string | null) => void;
    setHostViewMode: (mode: HostViewMode) => void;
    setGroupViewMode: (mode: HostViewMode) => void;
    setAppearance: (appearance: AppearanceSettings) => void;
    toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    activeView: ViewType.Hosts,
    isSidebarVisible: true,
    showHostGroups: true,
    showSidebarToggle: true,
    serverMetrics: true,
    selectedHostGroup: null,
    hostViewMode: "cards",
    groupViewMode: "tree",
    appearance: getInitialAppearance(),
    setActiveView: (view) => set({activeView: view}),
    setShowHostGroups: (show) => set({showHostGroups: show}),
    // Without the toggle button the sidebar has to stay visible, otherwise there is no way to bring it back.
    setServerMetrics: (enabled) => set({serverMetrics: enabled}),
    setShowSidebarToggle: (show) => set((state) => ({
        showSidebarToggle: show,
        isSidebarVisible: show ? state.isSidebarVisible : true,
    })),
    setSelectedHostGroup: (group) => set({selectedHostGroup: group}),
    setHostViewMode: (mode) => set({hostViewMode: mode}),
    setGroupViewMode: (mode) => set({groupViewMode: mode}),
    setAppearance: (appearance) => set({
        appearance: {
            ...appearance,
            // A font saved by an older build, or one that has since been dropped from the list, would
            // leave the settings dropdown blank. The terminal case matters twice over, because a grid
            // that cannot match its glyphs is unreadable.
            appFontFamily: resolveAppFontFamily(appearance.appFontFamily),
            terminalFontFamily: resolveTerminalFontFamily(appearance.terminalFontFamily),
        },
    }),
    toggleSidebar: () => set((state) => ({isSidebarVisible: !state.isSidebarVisible})),
}));
