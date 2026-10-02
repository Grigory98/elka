const SPLASH_ELEMENT_ID = "app-splash";
const MIN_VISIBLE_MS = 500;
const EXIT_MS = 300;

let dismissScheduled = false;

// Measured from module evaluation, which happens right before React mounts.
const bundleStartedAt = Date.now();

/**
 * Fades out the splash screen rendered by index.html. Safe to call more than once:
 * only the first call schedules the exit animation.
 */
export function dismissSplash() {
    if (dismissScheduled) return;
    dismissScheduled = true;

    const splash = document.getElementById(SPLASH_ELEMENT_ID);
    if (!splash) return;

    // Keep it on screen long enough not to flash on a fast launch.
    const visibleMs = Date.now() - bundleStartedAt;
    window.setTimeout(() => {
        splash.setAttribute("data-state", "leaving");
        window.setTimeout(() => splash.remove(), EXIT_MS);
    }, Math.max(0, MIN_VISIBLE_MS - visibleMs));
}
