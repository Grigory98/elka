import { useRef } from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import type React from "react";
import { cn } from "@/lib/utils";

type ContextMenuActionProps = React.ComponentProps<typeof ContextMenuPrimitive.Item>;

export function ContextMenuAction({className, ...props}: ContextMenuActionProps) {
    return <ContextMenuPrimitive.Item {...props} className={cn("cursor-default outline-none", className)}/>;
}

type ContextMenuPanelProps = React.ComponentProps<typeof ContextMenuPrimitive.Content>;

export function ContextMenuPanel({className, onPointerMove, onPointerLeave, ...props}: ContextMenuPanelProps) {
    const activeItemRef = useRef<HTMLElement | null>(null);

    const clearActiveItem = () => {
        activeItemRef.current?.removeAttribute("data-app-menu-hovered");
        activeItemRef.current = null;
    };

    return (
        <ContextMenuPrimitive.Content
            {...props}
            onPointerMove={(event) => {
                const target = (event.target as HTMLElement).closest<HTMLElement>('[role="menuitem"]');
                if (target && target !== activeItemRef.current) {
                    clearActiveItem();
                    target.setAttribute("data-app-menu-hovered", "true");
                    activeItemRef.current = target;
                } else if (!target) {
                    clearActiveItem();
                }
                onPointerMove?.(event);
            }}
            onPointerLeave={(event) => {
                clearActiveItem();
                onPointerLeave?.(event);
            }}
            className={cn(className)}
        />
    );
}
