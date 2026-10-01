import { PanelLeftOpen, Plus } from "lucide-react";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore, ViewType } from "@/store/uiStore";
import { WindowControls } from "@/components/layout/WindowControls";
import { TerminalTab } from "@/components/layout/TerminalTab";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore.ts";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";

export function TitleBar() {
    const {sessions, activeSessionId, setActiveSession, removeSession, duplicateSession, closeOtherSessions} = useSessionStore();
    const {activeView, isSidebarVisible, toggleSidebar, setActiveView, setSelectedHostGroup} = useUIStore();

    const isTerminalView = activeView === ViewType.Terminal;
    const showSidebarStyling = isTerminalView ? isSidebarVisible : true;
    const isMacOS = typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);

    const {isUnlocked} = useAuthStore();
    const {t} = useTranslation(["hosts", "common"]);

    const scrollRef = useRef<HTMLDivElement>(null);

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (scrollRef.current && e.deltaY !== 0) {
            const scrollAmount = e.deltaY;
            scrollRef.current.scrollLeft += scrollAmount;
        }
    };

    return (
        <header className="wails-drag flex h-14 shrink-0 items-end justify-between bg-background pr-0">

            {isMacOS ? (
                <>
                    <div className="h-full w-18 shrink-0 bg-background" aria-hidden="true"/>
                    {isUnlocked && isTerminalView && !isSidebarVisible && (
                        <div className="flex h-full w-9 shrink-0 items-center justify-center bg-background">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleSidebar}
                                className="wails-no-drag text-muted-foreground hover:text-foreground"
                                aria-label={t("show_sidebar", {ns: "common"})}
                                title={t("show_sidebar", {ns: "common"})}
                            >
                                <PanelLeftOpen className="size-5"/>
                            </Button>
                        </div>
                    )}
                </>
            ) : isUnlocked && (
                <div
                    className={cn(
                        "relative flex h-full w-14 shrink-0 items-center justify-center",
                        showSidebarStyling ? "border-r bg-sidebar" : "bg-transparent"
                    )}
                >
                    {isTerminalView && !isSidebarVisible && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleSidebar}
                            className="wails-no-drag text-muted-foreground hover:text-foreground"
                            aria-label={t("show_sidebar", {ns: "common"})}
                            title={t("show_sidebar", {ns: "common"})}
                        >
                            <PanelLeftOpen className="size-5"/>
                        </Button>
                    )}
                    {showSidebarStyling && <div className="absolute bottom-0 h-px w-8 bg-border"/>}
                </div>
            )}

            <div ref={scrollRef}
                 onWheel={handleWheel}
                 className="flex h-full flex-1 items-center gap-1 pl-2
                            overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
            >
                {sessions.map((session) => (
                    <TerminalTab
                        key={session.id}
                        session={session}
                        isActive={isTerminalView && session.id === activeSessionId}
                        onClick={() => setActiveSession(session.id)}
                        onClose={() => removeSession(session.id)}
                        onDuplicate={() => duplicateSession(session.id)}
                        onCloseOthers={() => closeOtherSessions(session.id)}
                        canCloseOthers={sessions.length > 1}
                    />
                ))}
                {isUnlocked && sessions.length > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="wails-no-drag my-1 mt-2 shrink-0"
                        title={t("new_tab")}
                        aria-label={t("new_tab")}
                        onClick={() => {
                            setSelectedHostGroup(null);
                            setActiveView(ViewType.Hosts);
                        }}
                    >
                        <Plus className="size-4"/>
                    </Button>
                )}
            </div>

            <WindowControls className="ml-12"/>

        </header>
    );
}
