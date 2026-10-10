/**
 * Перетаскиваемый терминал должен быть виден под курсором, иначе перенос неотличим от обычного
 * движения мыши. Путей переноса два, и у них разные ограничения:
 *
 *  - Вкладка верхнего трея тянется собственными pointer-событиями: браузерный drag there не
 *    работает, поэтому картинку под курсором рисуем сами.
 *  - Шапка панели разделённого экрана тянется штатным HTML5 drag, и там картинку рисует браузер,
 *    но берёт её с элемента-источника: у шапки это узкая полоска в 24px, и перенос панели выглядит
 *    как случайное выделение. Поэтому картинка подменяется через setDragImage.
 *
 * Общий слой рисуется прямо в DOM, а не через React: указатель шлёт события чаще, чем кадров
 * отображается, и ререндер трея вкладок на каждом движении заметно бы тормозил перенос.
 */

const GHOST_CLASSES = [
    "pointer-events-none fixed left-0 top-0 z-999 flex max-w-64 select-none items-center gap-2 truncate",
    "rounded-md border border-border bg-popover px-3 py-1.5",
    "text-xs font-medium text-popover-foreground shadow-lg",
].join(" ");

/** Насколько призрак смещён относительно курсора, чтобы он не наезжал на подсветку вставки. */
const GHOST_OFFSET = {x: 12, y: 10};

let overlay: HTMLDivElement | null = null;

function buildGhost(label: string): HTMLDivElement {
    const ghost = document.createElement("div");
    ghost.className = GHOST_CLASSES;
    ghost.textContent = label;
    return ghost;
}

/**
 * Показывает картинку переноса под курсором. Вызывается один раз в начале перетаскивания,
 * дальше она только двигается вызовами moveSessionDragGhost.
 */
export function showSessionDragGhost(label: string): void {
    hideSessionDragGhost();

    overlay = buildGhost(label);
    // Первый кадр уводим за пределы окна: призрак должен появиться сразу под нужным размером,
    // иначе он дёргается из левого верхнего угла на первом же движении.
    overlay.style.transform = "translate3d(-9999px, -9999px, 0)";
    document.body.appendChild(overlay);
}

export function moveSessionDragGhost(clientX: number, clientY: number): void {
    if (!overlay) return;

    // Только transform: он не вызывает пересчёт раскладки, в отличие от left/top.
    overlay.style.transform = `translate3d(${clientX - GHOST_OFFSET.x}px, ${clientY - GHOST_OFFSET.y}px, 0)`;
}

export function hideSessionDragGhost(): void {
    overlay?.remove();
    overlay = null;
}

/**
 * Подменяет картинку штатного HTML5-перетаскивания на такую же плашку, как у pointer-переноса.
 *
 * Элемент должен быть отрисован в момент вызова: движок снимает его с картинки не сразу, а на
 * следующем кадре, поэтому узел остаётся в документе до конца перетаскивания и убирается по
 * dragend. Страховка по таймеру нужна на случай, если перетаскивание оборвалось не событием.
 */
export function attachSessionDragImage(event: {dataTransfer: DataTransfer}, label: string): void {
    const ghost = buildGhost(label);
    ghost.style.transform = "translate3d(-9999px, -9999px, 0)";
    document.body.appendChild(ghost);

    const remove = () => ghost.remove();
    event.dataTransfer.setDragImage(ghost, GHOST_OFFSET.x, GHOST_OFFSET.y);
    window.addEventListener("dragend", remove, {once: true});
    window.setTimeout(remove, 1000);
}