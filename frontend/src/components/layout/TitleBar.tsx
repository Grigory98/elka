import { PanelLeftOpen, Plus } from "lucide-react";
import { SPLIT_WORKSPACE_TAB_ID, terminalSessionTabID, useSessionStore } from "@/store/sessionStore";
import { useUIStore, ViewType } from "@/store/uiStore";
import { WindowControls } from "@/components/layout/WindowControls";
import { TerminalTab } from "@/components/layout/TerminalTab";
import { SplitWorkspaceTab } from "@/components/layout/SplitWorkspaceTab";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore.ts";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";

export function TitleBar() {
    const {
        sessions,
        activeSessionId,
        splitSessionIds,
        splitLayout,
        splitWorkspaceActive,
        topTabOrder,
        setActiveSession,
        removeSession,
        duplicateSession,
        closeOtherSessions,
        addSessionToSplit,
        placeSessionBeside,
        setSplitWorkspaceActive,
        closeSplitWorkspace,
        reorderTopTab,
    } = useSessionStore();
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

    const visibleSessions = sessions.filter((session) => !splitSessionIds?.includes(session.id));
    const visibleTabIDs = [
        ...visibleSessions.map((session) => terminalSessionTabID(session.id)),
        ...(splitLayout ? [SPLIT_WORKSPACE_TAB_ID] : []),
    ];
    const orderedTabIDs = [
        ...topTabOrder.filter((tabID) => visibleTabIDs.includes(tabID)),
        ...visibleTabIDs.filter((tabID) => !topTabOrder.includes(tabID)),
    ];
    const sessionByTabID = new Map(visibleSessions.map((session) => [terminalSessionTabID(session.id), session]));

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
                {orderedTabIDs.map((tabID) => {
                    if (tabID === SPLIT_WORKSPACE_TAB_ID) {
                        return (
                            <SplitWorkspaceTab
                                key={tabID}
                                isActive={isTerminalView && splitWorkspaceActive}
                                onClick={setSplitWorkspaceActive}
                                onClose={closeSplitWorkspace}
                                onDropSession={addSessionToSplit}
                                onReorder={reorderTopTab}
                            />
                        );
                    }
                    const session = sessionByTabID.get(tabID);
                    if (!session) return null;
                    return (
                        <TerminalTab
                            key={session.id}
                            session={session}
                            isActive={isTerminalView && !splitWorkspaceActive && session.id === activeSessionId}
                            onClick={() => setActiveSession(session.id)}
                            onClose={() => removeSession(session.id)}
                            onDuplicate={() => duplicateSession(session.id)}
                            onCloseOthers={() => closeOtherSessions(session.id)}
                            canCloseOthers={sessions.length > 1}
                            isInSplit={false}
                            canAddToSplit={!splitSessionIds || splitSessionIds.length < 6}
                            canPlaceRelative={sessions.length > 1 && (!splitSessionIds || splitSessionIds.length < 6)}
                            onToggleSplit={() => addSessionToSplit(session.id)}
                            onPlaceRelative={(placement) => {
                                const referenceID = activeSessionId && activeSessionId !== session.id
                                    ? activeSessionId
                                    : sessions.find((item) => item.id !== session.id)?.id;
                                if (referenceID) placeSessionBeside(referenceID, session.id, placement);
                            }}
                            onReorder={reorderTopTab}
                        />
                    );
                })}
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
