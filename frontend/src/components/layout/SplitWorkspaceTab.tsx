import { PanelsTopLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    SPLIT_WORKSPACE_TAB_ID,
    TERMINAL_SESSION_DRAG_TYPE,
    TERMINAL_TAB_ORDER_DRAG_TYPE,
} from "@/store/sessionStore";
import { useState } from "react";

interface SplitWorkspaceTabProps {
    isActive: boolean;
    onClick: () => void;
    onClose: () => void;
    onDropSession: (sessionID: string) => void;
    onReorder: (draggedTabID: string, targetTabID: string) => void;
}

export function SplitWorkspaceTab({isActive, onClick, onClose, onDropSession, onReorder}: SplitWorkspaceTabProps) {
    const {t} = useTranslation("terminal");
    const [isDropTarget, setIsDropTarget] = useState(false);

    return (
        <div
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            draggable
            onDragStart={(event) => {
                event.dataTransfer.setData(TERMINAL_TAB_ORDER_DRAG_TYPE, SPLIT_WORKSPACE_TAB_ID);
                event.dataTransfer.effectAllowed = "move";
            }}
            onClick={onClick}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onClick();
                }
            }}
            onDragOver={(event) => {
                if (event.dataTransfer.types.includes(TERMINAL_SESSION_DRAG_TYPE) || event.dataTransfer.types.includes(TERMINAL_TAB_ORDER_DRAG_TYPE)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setIsDropTarget(true);
                }
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDropTarget(false);
            }}
            onDrop={(event) => {
                const sessionID = event.dataTransfer.getData(TERMINAL_SESSION_DRAG_TYPE);
                const draggedTabID = event.dataTransfer.getData(TERMINAL_TAB_ORDER_DRAG_TYPE);
                if (sessionID) {
                    event.preventDefault();
                    onDropSession(sessionID);
                } else if (draggedTabID) {
                    event.preventDefault();
                    onReorder(draggedTabID, SPLIT_WORKSPACE_TAB_ID);
                }
                setIsDropTarget(false);
            }}
            className={cn(
                "wails-no-drag group my-1 mt-2 flex h-8 min-w-36 max-w-52 cursor-pointer items-center justify-between rounded-md border px-3 text-xs font-medium transition-colors",
                isActive ? "border-primary/50 bg-card text-foreground" : "border-muted text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                isDropTarget && "ring-2 ring-primary"
            )}
        >
            <span className="flex min-w-0 items-center gap-2 truncate">
                <PanelsTopLeft className="size-4 shrink-0"/>
                <span className="truncate">{t("split_workspace_title")}</span>
            </span>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={t("close_split_workspace")}
                aria-label={t("close_split_workspace")}
                onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                }}
                className="ml-1 size-5 shrink-0"
            >
                <X className="size-3"/>
            </Button>
        </div>
    );
}
