import { Server, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Host } from "../../../bindings/elka-desktop/backend/internal/services/blob";
import { useTranslation } from "react-i18next";
import { HostViewMode } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { memo, useEffect, useRef, useState } from "react";

/**
 * Heights of a host row, in CSS pixels.
 *
 * The hosts list is virtualised, and a virtualised list can only work if every row is exactly the
 * same height — it turns a scroll offset into a row number by dividing. These are therefore not free
 * parameters: they are what the rows below are pinned to, and the same numbers are applied as a
 * style, so content that measured taller than expected clips instead of painting over the next host.
 */
export const LIST_ROW_HEIGHT = 80;
export const CARD_HEIGHT = 104;

/**
 * How long the pointer has to rest on a row before that row's menu is built.
 *
 * Scrolling runs the pointer across a row every few hundred milliseconds, and a menu that is built
 * and torn down on the way past costs more than the menu itself: the whole list went up by sixty
 * megabytes during a scroll that passed over four hundred rows. The highlight is instant, the menu
 * waits for the pointer to mean it.
 */
const MENU_HOVER_INTENT_MS = 250;

/**
 * The three dots.
 *
 * There are two of these and they look identical: one is the Radix trigger, one is the plain button
 * that stands in for it while the row is not being pointed at, so that the menu itself is unmounted.
 */
function MenuButton({highlighted, onClick, ...props}: {highlighted: boolean; onClick?: () => void} & React.ComponentProps<typeof Button>) {
    return (
        // The rest of the props are the trigger's own — aria-haspopup, the pointer and keyboard
        // handlers that open the menu, its ref. They arrive from Radix onto this element and have to
        // be handed on to the real button, or the three dots are a button that does nothing.
        <Button
            {...props}
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            className={cn("transition-opacity hover:opacity-100 focus-visible:opacity-100", highlighted ? "opacity-100" : "opacity-60", props.className)}
        >
            <MoreHorizontal className="size-4 text-muted-foreground"/>
        </Button>
    );
}

interface HostCardProps {
    host: Host;
    showGroup?: boolean;
    viewMode?: HostViewMode;
    onConnect: (host: Host) => void;
    onEdit: (host: Host) => void;
    onDelete: (host: Host) => void;
}

/**
 * One host row.
 *
 * Memoised because the list re-renders on every scroll step: without it, each of the thirty rows on
 * screen would re-render whenever the pointer crossed a row, and the callbacks below are wrapped for
 * the same reason — a new function identity every render is a new prop, and defeats the comparison.
 */
export const HostCard = memo(function HostCard({host, showGroup = true, viewMode = "cards", onConnect, onEdit, onDelete}: HostCardProps) {
    const {t} = useTranslation("common");
    const isCard = viewMode === "cards";
    // Two separate pieces of state, because they answer different questions and must not be confused:
    // `hovering` is what the row looks like, and it is true the instant the pointer arrives, while
    // `menuArmed` is whether the menu has been built, and it waits for the pointer to settle.
    const [hovering, setHovering] = useState(false);
    const [menuArmed, setMenuArmed] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [rowHostId, setRowHostId] = useState(host.id);
    const hoverTimer = useRef<number | null>(null);

    const dropHoverTimer = () => {
        if (hoverTimer.current === null) return;
        window.clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
    };

    const onPointerEnter = () => {
        setHovering(true);
        dropHoverTimer();
        hoverTimer.current = window.setTimeout(() => {
            hoverTimer.current = null;
            setMenuArmed(true);
        }, MENU_HOVER_INTENT_MS);
    };

    const onPointerLeave = () => {
        dropHoverTimer();
        setHovering(false);
        setMenuArmed(false);
    };

    // A row that has been scrolled away from must not come back with a timer still running, or with
    // a menu left open over a different host. The list reuses one set of rows for every host that
    // scrolls past, so this component can find itself pointing at a different host than it was
    // rendered for.
    if (rowHostId !== host.id) {
        dropHoverTimer();
        setRowHostId(host.id);
        setHovering(false);
        setMenuArmed(false);
        setIsMenuOpen(false);
    }

    // The timer belongs to the window, not to the render: a row that unmounts while the pointer is
    // resting on it must not leave one behind to arm a menu for a host that is no longer there.
    useEffect(() => dropHoverTimer, []);
    return (
        <div
            tabIndex={0}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                    e.preventDefault();
                    onConnect(host);
                }
            }}
            style={isCard ? {height: CARD_HEIGHT} : {height: LIST_ROW_HEIGHT}}
            className={cn(
                "group flex flex-row items-center justify-between overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isCard
                    ? "h-26 rounded-xl border border-border bg-card shadow-sm hover:border-primary/40 hover:shadow-md"
                    : "h-20 rounded-md border-b border-border bg-transparent hover:bg-muted/40",
                hovering && (isCard ? "border-primary/40 shadow-md" : "bg-muted/40")
            )}
        >
            <div
                onDoubleClick={() => onConnect(host)}
                className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-3", isCard ? "p-5" : "px-3 py-2")}
            >
                <div className={cn(
                    "flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
                    isCard ? "size-10" : "size-8"
                )}>
                    <Server className={cn(isCard ? "size-5" : "size-4")} />
                </div>
                <div className="flex min-w-0 flex-col pr-4">
                    <h3 className="truncate font-semibold text-card-foreground">
                        {host.name || host.host}
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">
                        {host.username}
                    </p>
                    {showGroup && host.group && (
                        <span className="mt-1 w-fit rounded-full bg-secondary px-2 py-0.5 text-2xs text-secondary-foreground">
                            {host.group}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 items-center pr-4">
                {/*
                  The menu is only there for the row under the pointer or the one that is open.
                  A Radix dropdown is not a cheap thing to mount — it subscribes to the document,
                  builds its own context tree and holds a portal — and a vault with four hundred
                  hosts was paying for four hundred of them at once, then paying again for every one
                  of them as scrolling walked the list. One mounted menu serves the whole page.
                */}
                {menuArmed || isMenuOpen ? (
                    <DropdownMenu modal={false} open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                        <DropdownMenuTrigger asChild>
                            <MenuButton highlighted={true}/>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-40 z-50">
                            <DropdownMenuItem onClick={() => onEdit(host)}>
                                <Edit className="mr-2 size-4"/>
                                {t("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator/>
                            <DropdownMenuItem
                                onClick={() => onDelete(host)}
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            >
                                <Trash2 className="mr-2 size-4"/>
                                {t("delete")}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <MenuButton
                        highlighted={false}
                        onClick={() => {
                            // Someone who arrived by keyboard, or clicked without resting, still gets
                            // the menu — they just pay for building it here instead of on hover.
                            setMenuArmed(true);
                            setIsMenuOpen(true);
                        }}
                    />
                )}
            </div>

        </div>
    );
});
