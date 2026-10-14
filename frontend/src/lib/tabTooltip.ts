/**
 * One tooltip for the whole tab bar.
 *
 * A tab is a div with no title attribute, and the address it should show lives in the session config,
 * so hovering a tab has to be answered with a tooltip. The cheap one is not a component: Radix's
 * tooltip mounts a portal and a subtree of its own every time it opens, once per tab, which is work
 * for a hint that is almost never wanted — it appears only when the pointer stays put.
 *
 * So there is a single element for the entire bar, created on the first hover and reused afterwards.
 * Hovering a tab starts one timer shared by every tab, and if the pointer stays, two strings and four
 * numbers are written into that element. Nothing here touches React state, so no tab re-renders when
 * a hint appears or disappears, and nothing is allocated per tab.
 */

/** How long the pointer has to rest on a tab before the hint appears, in milliseconds. */
const SHOW_DELAY_MS = 1000;

/** Distance between the tab and the hint, in pixels. */
const GAP_PX = 6;

/** How far the hint keeps away from the window edges, in pixels. */
const MARGIN_PX = 8;

const TOOLTIP_ID = "tab-bar-address";

let node: HTMLDivElement | null = null;
let timer: number | null = null;
let anchor: HTMLElement | null = null;
let label = "";

function dropPendingShow() {
    if (timer === null) return;
    window.clearTimeout(timer);
    timer = null;
}

function forgetAnchor() {
    anchor?.removeAttribute("aria-describedby");
    anchor = null;
}

function ensureNode(): HTMLDivElement {
    if (node) return node;
    const element = document.createElement("div");
    element.id = TOOLTIP_ID;
    element.setAttribute("role", "tooltip");
    element.className =
        "pointer-events-none fixed z-100 hidden max-w-xs whitespace-pre-line rounded-md border " +
        "border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md";
    document.body.appendChild(element);
    node = element;

    // A tab bar that scrolls, or a window that moves, leaves a fixed hint pointing at nothing.
    window.addEventListener("resize", hideTabTooltip, {passive: true});
    window.addEventListener("scroll", hideTabTooltip, {passive: true, capture: true});
    // Pressing anywhere dismisses it: the tab is about to become the active one.
    window.addEventListener("pointerdown", hideTabTooltip, {passive: true, capture: true});
    return element;
}

function place(element: HTMLDivElement) {
    const rect = anchor!.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;

    // Centred on the tab, then pushed back inside the window rather than allowed to hang off it.
    const left = Math.min(
        Math.max(MARGIN_PX, rect.left + rect.width / 2 - width / 2),
        Math.max(MARGIN_PX, window.innerWidth - width - MARGIN_PX)
    );

    // The tab bar is at the top of the window, so the hint belongs underneath it; above is only used
    // when the bar somehow sits low enough for there to be room.
    const below = rect.bottom + GAP_PX;
    const top = below + height <= window.innerHeight - MARGIN_PX
        ? below
        : Math.max(MARGIN_PX, rect.top - GAP_PX - height);

    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
}

function show() {
    // The tab can be gone by now: tabs close, and the pointer that started the timer may be over
    // nothing at all.
    if (!anchor?.isConnected || !label) {
        hideTabTooltip();
        return;
    }
    const element = ensureNode();
    element.textContent = label;
    element.classList.remove("hidden");
    // Measured while it cannot be seen, so the hint never flashes at the wrong place first.
    element.style.visibility = "hidden";
    place(element);
    element.style.visibility = "";
    anchor.setAttribute("aria-describedby", TOOLTIP_ID);
}

/**
 * Shows the hint about this tab, unless the pointer moves away first.
 *
 * Called from every tab, and only ever started, never rendered: the tab bar does not know this exists.
 */
export function scheduleTabTooltip(target: HTMLElement, text: string) {
    dropPendingShow();
    forgetAnchor();
    if (!text) return;
    anchor = target;
    label = text;
    timer = window.setTimeout(() => {
        timer = null;
        show();
    }, SHOW_DELAY_MS);
}

/** Takes the hint away at once, whether it is on screen or still waiting its second and a half. */
export function hideTabTooltip() {
    dropPendingShow();
    forgetAnchor();
    node?.classList.add("hidden");
}

/**
 * The address of the server this session is connected to.
 *
 * Only the connection itself: jump hosts and port forwards are other things, reached through this one,
 * and a hint that listed them would answer a question nobody asked.
 */
export function sshAddressText(host: string | undefined | null, port: number | undefined | null): string {
    const address = (host || "").trim();
    if (!address) return "";
    return port ? `${address}:${port}` : address;
}

/**
 * What a tab that stands for several sessions shows.
 *
 * A split workspace or a group can hold a handful of servers, so the addresses go one under another.
 * Six is as many as a hint can carry before it stops being read, and the rest are counted rather than
 * dropped silently.
 */
export function sshAddressesText(addresses: (string | undefined)[], limit = 6): string {
    const shown = addresses.map((address) => (address || "").trim()).filter(Boolean);
    if (shown.length <= limit) return shown.join("\n");
    return [...shown.slice(0, limit), `+${shown.length - limit}`].join("\n");
}
