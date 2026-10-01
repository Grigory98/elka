import { CopyPlus, X } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { TerminalSession } from "@/store/sessionStore";
import { useTranslation } from "react-i18next";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";

const tabStyles = cva(
    "wails-no-drag group my-1 mt-2 flex h-8 min-w-30 max-w-50 cursor-pointer items-center " +
    "justify-between rounded-md border px-3 text-xs font-medium transition-colors",
    {
        variants: {
            state: {
                active: "border-border bg-card text-foreground",
                inactive: "border-border border-muted text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            },
        },
        defaultVariants: {
            state: "inactive",
        },
    }
);

const closeButtonStyles = cva(
    "ml-2 flex size-5 items-center justify-center rounded-sm transition-all hover:bg-muted",
    {
        variants: {
            state: {
                active: "opacity-100",
                inactive: "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            },
        },
        defaultVariants: {
            state: "inactive",
        },
    }
);

interface TerminalTabProps {
    session: TerminalSession;
    isActive: boolean;
    onClick: () => void;
    onClose: () => void;
    onDuplicate: () => void;
    onCloseOthers: () => void;
    canCloseOthers: boolean;
}

export function TerminalTab({session, isActive, onClick, onClose, onDuplicate, onCloseOthers, canCloseOthers}: TerminalTabProps) {
    const {t} = useTranslation("terminal");
    const state = isActive ? "active" : "inactive";

    return (
        <ContextMenuPrimitive.Root>
            <ContextMenuPrimitive.Trigger asChild>
                <div onClick={onClick}
                     tabIndex={0}
                     role="tab"
                     aria-selected={isActive}
                     onKeyDown={(e) => {
                         if (e.key === "Enter" || e.key === " ") {
                             e.preventDefault();
                             onClick();
                         }
                     }}
                     className={cn(tabStyles({state}))}>
                    <span className="truncate">{session.title}</span>
                    <button
                        type="button"
                        title={t("close_tab")}
                        aria-label={t("close_named_tab", {name: session.title})}
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        className={cn(closeButtonStyles({state}))}
                    >
                        <X className="size-3"/>
                    </button>
                </div>
            </ContextMenuPrimitive.Trigger>
            <ContextMenuPrimitive.Portal>
                <ContextMenuPrimitive.Content className="z-50 min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none">
                    <ContextMenuPrimitive.Item onSelect={onDuplicate} className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground">
                        <CopyPlus className="size-4"/>{t("duplicate_tab")}
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Item onSelect={onClose} className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground">
                        <X className="size-4"/>{t("close_tab")}
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Separator className="my-1 h-px bg-border"/>
                    <ContextMenuPrimitive.Item
                        disabled={!canCloseOthers}
                        onSelect={onCloseOthers}
                        className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                        <X className="size-4"/>{t("close_other_tabs")}
                    </ContextMenuPrimitive.Item>
                </ContextMenuPrimitive.Content>
            </ContextMenuPrimitive.Portal>
        </ContextMenuPrimitive.Root>
    );
}
