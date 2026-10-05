import { PanelsTopLeft, X } from "lucide-react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { NameDialog } from "@/components/layout/NameDialog";
import { ContextMenuAction, ContextMenuPanel } from "@/components/layout/ContextMenuAction";
import {
    SplitWorkspace,
    TERMINAL_SESSION_DRAG_TYPE,
    splitWorkspaceTabID,
} from "@/store/sessionStore";
import { useState } from "react";

interface SplitWorkspaceTabProps {
    workspace: SplitWorkspace;
    isActive: boolean;
    onClick: () => void;
    onClose: () => void;
    onCreate: (title: string) => void;
    onRename: (title: string) => void;
    onDropSession: (sessionID: string, workspaceID: string) => void;
    nextWorkspaceNumber: number;
    dropEdge: "before" | "after" | null;
    isDropTarget: boolean;
}

export function SplitWorkspaceTab({
    workspace,
    isActive,
    onClick,
    onClose,
    onCreate,
    onRename,
    onDropSession,
    nextWorkspaceNumber,
    dropEdge,
    isDropTarget,
}: SplitWorkspaceTabProps) {
    const {t} = useTranslation("terminal");
    const [isSessionDropTarget, setIsSessionDropTarget] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const tabID = splitWorkspaceTabID(workspace.id);

    return (
        <>
            <ContextMenuPrimitive.Root>
                <ContextMenuPrimitive.Trigger asChild>
                <div
                    role="tab"
                    tabIndex={0}
                    aria-selected={isActive}
                    data-top-tab-id={tabID}
                    data-workspace-id={workspace.id}
                    onClick={onClick}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onClick();
                        }
                    }}
                    onDragOver={(event) => {
                        if (event.dataTransfer.types.includes(TERMINAL_SESSION_DRAG_TYPE)) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setIsSessionDropTarget(true);
                        }
                    }}
                    onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsSessionDropTarget(false);
                    }}
                    onDrop={(event) => {
                        const sessionID = event.dataTransfer.getData(TERMINAL_SESSION_DRAG_TYPE);
                        if (sessionID) {
                            event.preventDefault();
                            onDropSession(sessionID, workspace.id);
                        }
                        setIsSessionDropTarget(false);
                    }}
                    className={cn(
                        "wails-no-drag group relative my-[var(--tab-margin)] flex h-[var(--tab-height)] min-w-36 max-w-56 cursor-pointer items-center justify-between rounded-md border px-3 text-xs font-medium transition-colors",
                        isActive ? "border-primary/60 bg-card text-foreground" : "border-muted text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        (isDropTarget || isSessionDropTarget) && "ring-2 ring-primary"
                    )}
                >
                    {dropEdge === "before" && <span className="pointer-events-none absolute -left-1 top-0 z-20 h-full w-0.5 rounded-full bg-primary"/>}
                    {dropEdge === "after" && <span className="pointer-events-none absolute -right-1 top-0 z-20 h-full w-0.5 rounded-full bg-primary"/>}
                    <span className="flex min-w-0 items-center gap-2 truncate">
                        <PanelsTopLeft className="size-4 shrink-0"/>
                        <span className="truncate">{workspace.title}</span>
                    </span>
                    <button
                        type="button"
                        title={t("close_split_workspace")}
                        aria-label={t("close_named_workspace", {name: workspace.title})}
                        onClick={(event) => {
                            event.stopPropagation();
                            onClose();
                        }}
                        data-no-tab-drag
                        className="ml-1 flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100"
                    >
                        <X className="size-3"/>
                    </button>
                </div>
                </ContextMenuPrimitive.Trigger>
                <ContextMenuPrimitive.Portal>
                <ContextMenuPanel className="z-50 min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none">
                    <ContextMenuAction
                        onSelect={() => onCreate(t("split_workspace_default_title", {number: nextWorkspaceNumber}))}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                        {t("new_split_workspace")}
                    </ContextMenuAction>
                    <ContextMenuAction
                        onSelect={() => setIsRenameOpen(true)}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                        {t("rename_split_workspace")}
                    </ContextMenuAction>
                    <ContextMenuPrimitive.Separator className="my-1 h-px bg-border"/>
                    <ContextMenuAction
                        onSelect={onClose}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                        {t("close_split_workspace")}
                    </ContextMenuAction>
                </ContextMenuPanel>
                </ContextMenuPrimitive.Portal>
            </ContextMenuPrimitive.Root>
            <NameDialog
                open={isRenameOpen}
                title={t("rename_split_workspace")}
                initialName={workspace.title}
                onCancel={() => setIsRenameOpen(false)}
                onSubmit={(title) => {
                    onRename(title);
                    setIsRenameOpen(false);
                }}
            />
        </>
    );
}
