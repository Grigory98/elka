import { Server, Key, KeyRound, FolderTree, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore, ViewType } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ServerMetricsPanel } from "@/components/layout/ServerMetricsPanel";
import type { ReactNode } from "react";
import { useState } from "react";

interface SidebarItemProps {
    title: string;
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    indicatorClassName?: string;
}

function SidebarItem({title, active, onClick, children, indicatorClassName}: SidebarItemProps) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="sidebar-tooltip-parent group relative"
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onFocusCapture={() => setIsHovered(true)}
            onBlurCapture={() => setIsHovered(false)}
        >
            <Button
                variant={active ? "secondary" : "ghost"}
                size="icon"
                onClick={onClick}
                className="wails-no-drag"
                title={title}
                aria-label={title}
            >
                {children}
                {indicatorClassName && (
                    <span className={cn("absolute right-1 top-1 size-2 rounded-full border border-sidebar", indicatorClassName)}/>
                )}
            </Button>
            <span
                role="tooltip"
                className="sidebar-tooltip pointer-events-none absolute left-full top-1/2 z-[100] ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity"
                style={{opacity: isHovered ? 1 : 0}}
            >
                {title}
            </span>
        </div>
    );
}

export function Sidebar() {
    const {t} = useTranslation(["hosts", "keys", "credentials", "groups", "settings"]);
    const {activeView, setActiveView, isSidebarVisible, setSelectedHostGroup} = useUIStore();

    return (
        <aside
            className={cn(
                "wails-no-drag relative z-30 flex shrink-0 flex-col items-center justify-between pb-4 pt-2",
                isSidebarVisible ? "w-14" : "w-0 overflow-hidden border-r-0"
            )}
        >
            <div className="pointer-events-none absolute inset-0 rounded-t-xl bg-sidebar" aria-hidden="true"/>

            <nav className="relative z-10 flex flex-col gap-2">
                <SidebarItem
                    title={t("page_title", {ns: "hosts"})}
                    active={activeView === ViewType.Hosts}
                    onClick={() => {
                        setSelectedHostGroup(null);
                        setActiveView(ViewType.Hosts);
                    }}
                >
                    <Server className="size-5"/>
                </SidebarItem>

                <SidebarItem
                    title={t("page_title", {ns: "groups"})}
                    active={activeView === ViewType.Groups}
                    onClick={() => setActiveView(ViewType.Groups)}
                >
                    <FolderTree className="size-5"/>
                </SidebarItem>

                <SidebarItem
                    title={t("page_title", {ns: "keys"})}
                    active={activeView === ViewType.Keys}
                    onClick={() => setActiveView(ViewType.Keys)}
                >
                    <Key className="size-5"/>
                </SidebarItem>

                <SidebarItem
                    title={t("page_title", {ns: "credentials"})}
                    active={activeView === ViewType.Credentials}
                    onClick={() => setActiveView(ViewType.Credentials)}
                >
                    <KeyRound className="size-5"/>
                </SidebarItem>

            </nav>

            <ServerMetricsPanel/>

            <nav className="relative z-10 flex flex-col gap-2">

                <SidebarItem
                    title={t("page_title", {ns: "settings"})}
                    active={activeView === ViewType.Settings}
                    onClick={() => setActiveView(ViewType.Settings)}
                >
                    <Settings className="size-5"/>
                </SidebarItem>
            </nav>
        </aside>
    );
}
