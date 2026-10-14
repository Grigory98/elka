import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Renders only the rows that are on screen out of a list that can be arbitrarily long.
 *
 * The hosts page is the one screen whose length is not bounded by the code: a vault with four
 * hundred hosts put four hundred cards in the document, and a card is not cheap — text, a badge
 * and a dropdown menu add up to roughly two hundred kilobytes of webview memory, so the page cost
 * about ninety megabytes before anything was scrolled. The cost is linear in the number of hosts and
 * it is paid on the screen that has no terminal on it at all.
 *
 * The list does not own a scroller. The page scrolls, as it always did, and this measures itself
 * against that same ancestor: a spacer of the full height keeps the scroll range honest while only
 * the visible slice, plus a small overscan for fast wheel and trackpad movement, is ever built.
 * Nesting a second scrollbar inside the page would have been simpler maths but it would have changed
 * how the page feels, and would have had to be re-thought for the tree, where every open group wants
 * its own slice of the same single scroll range.
 */
export interface VirtualizedListProps<T> {
    items: T[];
    /** Fixed height of one row, in CSS pixels. Rows must not wrap or the maths stops holding. */
    itemHeight: number;
    /** Rendered for one row. Only called for the visible slice. */
    renderItem: (item: T, index: number) => ReactNode;
    className?: string;
    /** `grid` for the card view, anything else for the plain column. */
    display?: "grid" | "column";
    /** How many rows to keep above and below the viewport, so a fast scroll does not show gaps. */
    overscan?: number;
    /** Shown instead of the list when there is nothing to render. */
    emptyState?: ReactNode;
    /** Reports the slice that is on screen, for the "1-40 of 400" line. */
    onRangeChange?: (from: number, to: number) => void;
}

/**
 * The ancestor that actually scrolls this list.
 *
 * The check is on the computed style rather than on whether the element is overflowing right now,
 * because that flips: filter four hundred hosts down to three and the page stops overflowing, and a
 * check that reads `scrollHeight > clientHeight` would then walk past the real scroller and start
 * listening to the window, which would quietly render the wrong rows.
 */
function findScrollParent(element: HTMLElement | null): HTMLElement | Window {
    let node = element?.parentElement ?? null;
    while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return node;
        node = node.parentElement;
    }
    return window;
}

export function VirtualizedList<T>({
    items,
    itemHeight,
    renderItem,
    className,
    display = "column",
    overscan = 6,
    emptyState,
    onRangeChange,
}: VirtualizedListProps<T>) {
    const listRef = useRef<HTMLDivElement | null>(null);
    const parentRef = useRef<HTMLElement | Window | null>(null);
    const [range, setRange] = useState<{from: number; to: number}>({from: 0, to: 0});

    const total = items.length;

    const measure = useCallback(() => {
        const element = listRef.current;
        const parent = parentRef.current;
        if (!element || !parent) return;

        // The window counts as the document scroller, which reports the same three numbers by
        // different names.
        const isWindow = parent === window;
        const scroller: HTMLElement = isWindow ? document.documentElement : (parent as HTMLElement);
        const viewportHeight = isWindow ? window.innerHeight : scroller.clientHeight;
        const scrollTop = isWindow ? window.scrollY : scroller.scrollTop;

        // Where the list starts inside the scrolled content, so that a list halfway down the page
        // does not believe it is already scrolled past its own first row.
        const listTop = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scrollTop;

        const scrolledPast = scrollTop - listTop;
        const first = Math.min(
            total,
            Math.max(0, Math.floor(scrolledPast / itemHeight) - overscan)
        );
        const visible = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
        const last = Math.min(total, first + visible);

        setRange((current) => (current.from === first && current.to === last ? current : {from: first, to: last}));
    }, [itemHeight, overscan, total]);

    useLayoutEffect(() => {
        const element = listRef.current;
        if (!element) return;

        const parent = findScrollParent(element);
        parentRef.current = parent;
        measure();

        // Capture and passive throughout: this is a scroll handler on the one screen that can hold
        // hundreds of rows, and it must never block the compositor or delay anything else.
        const onScroll = () => measure();
        if (parent === window) {
            window.addEventListener("scroll", onScroll, {passive: true, capture: true});
        } else {
            parent.addEventListener("scroll", onScroll, {passive: true, capture: true});
        }
        window.addEventListener("resize", onScroll, {passive: true});

        // The page can also change height without the window resizing — a group opening above, a
        // filter emptying the list — and the slice depends on how tall the scroller is.
        const observer = new ResizeObserver(onScroll);
        observer.observe(element);
        if (parent !== window) observer.observe(parent as HTMLElement);

        return () => {
            if (parent === window) {
                window.removeEventListener("scroll", onScroll, {capture: true});
            } else {
                parent.removeEventListener("scroll", onScroll, {capture: true});
            }
            window.removeEventListener("resize", onScroll);
            observer.disconnect();
        };
    }, [measure]);

    // Reported after the commit, so the page can label the slice it is showing without this having
    // to know what the label is for.
    useEffect(() => {
        onRangeChange?.(range.from, range.to);
    }, [range, onRangeChange]);

    if (total === 0) return <>{emptyState}</>;

    // The rows on screen are slots, not rows: the same handful of DOM nodes is reused for every host
    // that scrolls past. Keying by host instead would mount and unmount a subtree for each of the
    // four hundred rows a single sweep walks past, and a webview pays for a mounted subtree far more
    // than for a text update — that churn alone cost ninety megabytes on the way down and took a
    // second sweep to come back off.
    // The slice can still name rows past the end of the list for the one frame between a filter
    // narrowing the list and the next measure: rendering those would read past the end of the array
    // and take the whole page down with it, so the slice is clamped to what actually exists.
    const start = Math.min(range.from, total);
    const end = Math.min(range.to, total);
    const slots = Array.from({length: end - start}, (_, slot) => ({slot, absolute: start + slot}));

    return (
        <div ref={listRef} className={className}>
            {/* The spacer is what gives the scrollbar the full height of the list while the rows
                inside it only ever occupy the visible slice. */}
            <div style={{height: total * itemHeight, position: "relative"}}>
                <div
                    style={{
                        position: "absolute",
                        top: range.from * itemHeight,
                        left: 0,
                        right: 0,
                        display: display === "grid" ? "grid" : "flex",
                        gridTemplateColumns: display === "grid" ? "repeat(auto-fit, minmax(20rem, 1fr))" : undefined,
                        flexDirection: display === "grid" ? undefined : "column",
                        gap: display === "grid" ? "1rem" : 0,
                    }}
                >
                    {slots.map(({slot, absolute}) => (
                        <div key={slot} style={display === "grid" ? undefined : {height: itemHeight}}>
                            {renderItem(items[absolute], absolute)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
