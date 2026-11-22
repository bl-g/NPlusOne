const COLUMN_WIDTHS_STORAGE_KEY = "nplusone.column-widths.v1";

export function enableColumnResizing(table, onResize) {
    const columns = [...table.querySelectorAll("colgroup col")];
    const headers = [...table.querySelectorAll("thead th")];
    if (columns.length !== headers.length) return;

    const minimumWidths = headers.map(measureMinimumWidth);
    const currentTableWidth = Math.round(table.getBoundingClientRect().width);
    const storedWidths = readStoredWidths();
    const widths = normalizeWidths(
            storedWidths?.length === columns.length
                    ? storedWidths
                    : headers.map(header => Math.round(header.getBoundingClientRect().width)),
            currentTableWidth, minimumWidths);

    applyWidths(table, columns, widths);
    table.addEventListener("column-visibility-change", () => applyWidths(table, columns, widths));
    headers.slice(0, -1).forEach((header, index) => appendResizeHandle(header, index, table, columns, widths, minimumWidths, onResize));
}

function measureMinimumWidth(header) {
    const label = document.createElement("span");
    label.textContent = header.textContent.trim();
    header.append(label);
    const style = getComputedStyle(header);
    const width = Math.ceil(label.getBoundingClientRect().width
            + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
            + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth));
    label.remove();
    return width;
}

function appendResizeHandle(header, index, table, columns, widths, minimumWidths, onResize) {
    const handle = document.createElement("span");
    handle.className = "column-resize-handle";
    handle.title = `Resize ${header.textContent.trim()} column`;
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("pointerdown", event => {
        event.preventDefault();
        // The viewport may have changed since initialization or the previous drag.
        const actualWidths = [...table.querySelectorAll("thead th")]
                .map(cell => cell.getBoundingClientRect().width);
        const visibleTotal = widths.reduce((sum, width, i) => sum + (columns[i].hidden ? 0 : width), 0);
        const scale = actualWidths.reduce((sum, width, i) => sum + (columns[i].hidden ? 0 : width), 0) / visibleTotal;
        widths.splice(0, widths.length, ...actualWidths.map((width, i) => columns[i].hidden ? widths[i] * scale : width));
        const startX = event.clientX;
        const startWidth = widths[index];
        const adjacentIndex = index + 1;
        const adjacentStartWidth = widths[adjacentIndex];

        handle.setPointerCapture(event.pointerId);
        const resize = moveEvent => {
            const requestedChange = Math.round(moveEvent.clientX - startX);
            const minimumChange = minimumWidths[index] - startWidth;
            const maximumChange = adjacentStartWidth - minimumWidths[adjacentIndex];
            const change = Math.max(minimumChange, Math.min(maximumChange, requestedChange));
            widths[index] = startWidth + change;
            widths[adjacentIndex] = adjacentStartWidth - change;
            applyWidths(table, columns, widths);
            onResize?.();
        };
        const finish = () => {
            handle.removeEventListener("pointermove", resize);
            handle.removeEventListener("pointerup", finish);
            handle.removeEventListener("pointercancel", finish);
            writeStoredWidths(widths);
        };

        handle.addEventListener("pointermove", resize);
        handle.addEventListener("pointerup", finish);
        handle.addEventListener("pointercancel", finish);
    });
    header.append(handle);
}

function applyWidths(table, columns, widths) {
    const totalWidth = widths.reduce((total, width, index) => total + (columns[index].hidden ? 0 : width), 0);
    columns.forEach((column, index) => {
        column.style.width = column.hidden ? "0%" : `${widths[index] / totalWidth * 100}%`;
    });
    table.style.width = "100%";
    // Columns must always fit the viewport, including when it gets narrower.
    table.style.minWidth = "0";
}

function normalizeWidths(widths, targetWidth, minimumWidths) {
    const sourceWidth = widths.reduce((total, width) => total + width, 0);
    if (sourceWidth === 0 || targetWidth === 0) return widths;
    const scale = targetWidth / sourceWidth;
    const scaled = widths.map((width, index) => Math.max(minimumWidths[index], width * scale));
    const spare = scaled.map((width, index) => width - minimumWidths[index]);
    const totalSpare = spare.reduce((total, width) => total + width, 0);
    const available = Math.max(0, targetWidth - minimumWidths.reduce((total, width) => total + width, 0));
    return scaled.map((width, index) => minimumWidths[index]
            + (totalSpare > 0 ? spare[index] * available / totalSpare : 0));
}

function readStoredWidths() {
    try {
        const parsed = JSON.parse(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY));
        return Array.isArray(parsed) && parsed.every(width => Number.isFinite(width) && width > 0)
                ? parsed
                : null;
    }
    catch {
        return null;
    }
}

function writeStoredWidths(widths) {
    localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
}
