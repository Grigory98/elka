import { create } from "zustand";

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
    updateVersionReady: string | null;
    showHostGroups: boolean;
    selectedHostGroup: string | null;
    hostViewMode: HostViewMode;
    groupViewMode: HostViewMode;
    setActiveView: (view: ViewType) => void;
    setShowHostGroups: (show: boolean) => void;
    setSelectedHostGroup: (group: string | null) => void;
    setHostViewMode: (mode: HostViewMode) => void;
    setGroupViewMode: (mode: HostViewMode) => void;
    toggleSidebar: () => void;
    setUpdateVersionReady: (version: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
    activeView: ViewType.Hosts,
    isSidebarVisible: true,
    updateVersionReady: null,
    showHostGroups: true,
    selectedHostGroup: null,
    hostViewMode: "cards",
    groupViewMode: "tree",
    setActiveView: (view) => set({activeView: view}),
    setShowHostGroups: (show) => set({showHostGroups: show}),
    setSelectedHostGroup: (group) => set({selectedHostGroup: group}),
    setHostViewMode: (mode) => set({hostViewMode: mode}),
    setGroupViewMode: (mode) => set({groupViewMode: mode}),
    toggleSidebar: () => set((state) => ({isSidebarVisible: !state.isSidebarVisible})),
    setUpdateVersionReady: (version) => set({ updateVersionReady: version }),
}));
