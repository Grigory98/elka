import { useMemo, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/store/sessionStore";
import type { TerminalSplitLayout } from "@/store/sessionStore";
import { TerminalInstance } from "@/components/terminal/TerminalInstance";
import { cn } from "@/lib/utils";

interface TerminalStackProps {
    isVisible: boolean;
}

interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface PositionedPane {
    sessionId: string;
    rect: Rect;
}

interface SplitDivider {
    path: string;
    axis: "columns" | "rows";
    position: number;
    crossStart: number;
    crossSize: number;
    regionSize: number;
    ratio: number;
}

interface ResizeDrag {
    pointerId: number;
    path: string;
    axis: "columns" | "rows";
    startCoordinate: number;
    startRatio: number;
    regionPixels: number;
}

function layoutPanes(
    layout: TerminalSplitLayout | null,
    rect: Rect = {left: 0, top: 0, width: 1, height: 1},
    path = "",
    panes: PositionedPane[] = [],
    dividers: SplitDivider[] = [],
) {
    if (!layout) return {panes, dividers};
    if (layout.type === "pane") {
        panes.push({sessionId: layout.sessionId, rect});
        return {panes, dividers};
    }

    if (layout.direction === "horizontal") {
        const firstWidth = rect.width * layout.ratio;
        dividers.push({
            path,
            axis: "columns",
            position: rect.left + firstWidth,
            crossStart: rect.top,
            crossSize: rect.height,
            regionSize: rect.width,
            ratio: layout.ratio,
        });
        layoutPanes(layout.first, {...rect, width: firstWidth}, `${path}L`, panes, dividers);
        layoutPanes(layout.second, {
            ...rect,
            left: rect.left + firstWidth,
            width: rect.width - firstWidth,
        }, `${path}R`, panes, dividers);
    } else {
        const firstHeight = rect.height * layout.ratio;
        dividers.push({
            path,
            axis: "rows",
            position: rect.top + firstHeight,
            crossStart: rect.left,
            crossSize: rect.width,
            regionSize: rect.height,
            ratio: layout.ratio,
        });
        layoutPanes(layout.first, {...rect, height: firstHeight}, `${path}L`, panes, dividers);
        layoutPanes(layout.second, {
            ...rect,
            top: rect.top + firstHeight,
            height: rect.height - firstHeight,
        }, `${path}R`, panes, dividers);
    }

    return {panes, dividers};
}

export function TerminalStack({isVisible}: TerminalStackProps) {
    const {t} = useTranslation("terminal");
    const {
        sessions,
        activeSessionId,
        workspaces,
        activeWorkspaceID,
        setActiveSession,
        setSplitRatio,
        placeSessionBeside,
        removeSessionFromSplit,
        removeSession,
    } = useSessionStore();
    const dragRef = useRef<ResizeDrag | null>(null);
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceID);
    const layout = activeWorkspaceID
        ? activeWorkspace?.layout || null
        : activeSessionId ? {type: "pane" as const, sessionId: activeSessionId} : null;
    const splitWorkspaceActive = !!activeWorkspaceID;
    const {panes, dividers} = useMemo(() => layoutPanes(layout), [layout]);
    const paneBySession = useMemo(() => new Map(panes.map((pane) => [pane.sessionId, pane])), [panes]);

    const startResize = (divider: SplitDivider, event: ReactPointerEvent<HTMLDivElement>) => {
        const parent = event.currentTarget.parentElement;
        const bounds = parent?.getBoundingClientRect();
        if (!bounds || divider.regionSize === 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            path: divider.path,
            axis: divider.axis,
            startCoordinate: divider.axis === "columns" ? event.clientX : event.clientY,
            startRatio: divider.ratio,
            regionPixels: (divider.axis === "columns" ? bounds.width : bounds.height) * divider.regionSize,
        };
        document.body.style.cursor = divider.axis === "columns" ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
    };

    const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || drag.regionPixels <= 0) return;
        const coordinate = drag.axis === "columns" ? event.clientX : event.clientY;
        if (activeWorkspaceID) {
            setSplitRatio(activeWorkspaceID, drag.path, drag.startRatio + (coordinate - drag.startCoordinate) / drag.regionPixels);
        }
    };

    const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    };

    return (
        <div className={cn("absolute inset-0 overflow-hidden bg-background", isVisible ? "block" : "hidden")}>
            {splitWorkspaceActive && !activeWorkspace?.layout && isVisible && (
                <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-muted-foreground">
                    {t("empty_split_workspace")}
                </div>
            )}
            {sessions.map((session) => {
                const pane = paneBySession.get(session.id);
                // Only a pane that actually has a divider on its right needs to shrink. A lone terminal
                // reaches the window edge, otherwise it leaves a gap next to the window border.
                const hasRightDivider = !!pane && pane.rect.left > 0 && Math.abs(pane.rect.left + pane.rect.width - 1) < 0.001;
                const layoutStyle: CSSProperties | undefined = pane ? {
                    position: "absolute",
                    left: `${pane.rect.left * 100}%`,
                    top: `${pane.rect.top * 100}%`,
                    width: hasRightDivider ? `calc(${pane.rect.width * 100}% - 10px)` : `${pane.rect.width * 100}%`,
                    height: `${pane.rect.height * 100}%`,
                } : undefined;

                return (
                    <TerminalInstance
                        key={session.id}
                        sessionId={session.id}
                        config={session.config}
                        isActive={session.id === activeSessionId}
                        isVisible={isVisible && !!pane}
                        isSplitPane={splitWorkspaceActive && !!pane}
                        workspaceID={splitWorkspaceActive ? activeWorkspaceID || undefined : undefined}
                        paneTitle={session.title}
                        layoutStyle={layoutStyle}
                        onFocus={() => setActiveSession(session.id)}
                        onDetachPane={() => activeWorkspaceID && removeSessionFromSplit(activeWorkspaceID, session.id)}
                        onCloseSession={() => removeSession(session.id)}
                        onDropSession={(draggedID, targetID, placement) => {
                            if (activeWorkspaceID) placeSessionBeside(activeWorkspaceID, targetID, draggedID, placement);
                        }}
                    />
                );
            })}
            {splitWorkspaceActive && activeWorkspace?.layout && dividers.map((divider) => (
                <div
                    key={divider.path || "root"}
                    role="separator"
                    aria-orientation={divider.axis === "columns" ? "vertical" : "horizontal"}
                    aria-label={t("resize_split_pane")}
                    onPointerDown={(event) => startResize(divider, event)}
                    onPointerMove={moveResize}
                    onPointerUp={endResize}
                    onPointerCancel={endResize}
                    className={divider.axis === "columns"
                        ? "absolute z-30 w-2 -translate-x-1/2 cursor-col-resize touch-none bg-background/80 hover:bg-primary/40 active:bg-primary/60"
                        : "absolute z-30 h-2 -translate-y-1/2 cursor-row-resize touch-none bg-background/80 hover:bg-primary/40 active:bg-primary/60"}
                    style={divider.axis === "columns"
                        ? {left: `${divider.position * 100}%`, top: `${divider.crossStart * 100}%`, height: `${divider.crossSize * 100}%`}
                        : {top: `${divider.position * 100}%`, left: `${divider.crossStart * 100}%`, width: `${divider.crossSize * 100}%`}}
                />
            ))}
        </div>
    );
}
