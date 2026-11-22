import {createRequestSummaryFreezing} from "./request-summary-freezing.js?v=167615470249460499201001215593342851492";

// Virtualize whole groups so table row spans never cross a rendered boundary.
export function createVirtualTable({table, scroller, body, keyOf, layoutOf, rowCountOf, weightOf = rowCountOf,
    estimateHeight, renderWindow, onLayout, onRangeChange = () => {}}) {
    const heights = new Map();
    const summaryFreezing = createRequestSummaryFreezing(table, scroller);
    const topSpacer = spacer("top");
    const bottomSpacer = spacer("bottom");
    const anchorSpacer = document.createElement("div");
    anchorSpacer.setAttribute("aria-hidden", "true");
    let anchorSpace = 0;
    let items = [];
    let positions = [0];
    let rowPositions = [0];
    let indices = new Map();
    let visibleNodes = new Map();
    let virtualized = false;
    let frame = null;
    let measurementPending = false;
    let invalidationPending = false;
    let widthRevision = 0;
    let lastWidth = scroller.clientWidth;
    let lastTableSize = null;
    let suspended = false;
    let range = {start: 0, end: 0};
    let pendingViewAnchor = null;
    scroller.classList.add("virtual-table-scroll");
    scroller.addEventListener("scroll", () => schedule(false), {passive: true});
    new ResizeObserver(() => {
        if (scroller.clientWidth !== lastWidth) {
            lastWidth = scroller.clientWidth;
            invalidate();
        } else schedule(true);
    }).observe(scroller);
    new ResizeObserver(() => {
        const {width, height} = table.getBoundingClientRect();
        if (lastTableSize == null || width !== lastTableSize.width || height !== lastTableSize.height) schedule(true);
    }).observe(table);

    function spacer(position) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        row.className = "virtual-spacer";
        row.dataset.virtualSpacer = position;
        row.setAttribute("aria-hidden", "true");
        cell.colSpan = table.tHead.rows[0].cells.length;
        row.append(cell);
        return row;
    }

    function rebuildPositions() {
        positions = [0];
        rowPositions = [1]; // Header is the first accessible table row.
        let weight = 0;
        items.forEach((item, index) => {
            const key = keyOf(item);
            const layout = `${widthRevision}:${layoutOf(item)}`;
            let entry = heights.get(key);
            if (entry == null || entry.layout !== layout) {
                entry = {layout, height: Math.max(0, estimateHeight(item))};
                heights.set(key, entry);
            }
            positions.push(positions[index] + entry.height);
            rowPositions.push(rowPositions[index] + rowCountOf(item));
            weight += weightOf(item);
        });
        virtualized = items.length > 80 || weight > 200;
        table.setAttribute("aria-rowcount", String(rowPositions.at(-1)));
    }

    function indexAt(offset) {
        let low = 0;
        let high = items.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (positions[middle + 1] <= offset) low = middle + 1;
            else high = middle;
        }
        return Math.min(low, Math.max(0, items.length - 1));
    }

    function captureAnchor() {
        if (scroller.scrollTop <= 0 || items.length === 0) return {following: true};
        const index = indexAt(scroller.scrollTop);
        const anchor = {key: keyOf(items[index]), index, inside: scroller.scrollTop - positions[index]};
        const viewport = scroller.getBoundingClientRect();
        const top = viewport.top + scroller.clientTop + table.tHead.getBoundingClientRect().height;
        // Only the small rendered window is searched, including child rows of tall groups.
        for (const row of body.rows) {
            if (!row.dataset.rowGroupKey) continue;
            const box = row.getBoundingClientRect();
            if (box.bottom > top + 0.5 && box.top < viewport.bottom) {
                const key = row.dataset.rowGroupKey;
                const groupIndex = indices.get(key);
                const anchors = row.virtualAnchors ?? [];
                let low = 0;
                let high = anchors.length;
                while (low < high) {
                    const middle = (low + high) >>> 1;
                    if (anchors[middle].getBoundingClientRect().bottom <= top + 0.5) low = middle + 1;
                    else high = middle;
                }
                const candidate = anchors[low];
                const nested = candidate?.getBoundingClientRect().top < viewport.bottom ? candidate : null;
                return {key, index: groupIndex, inside: scroller.scrollTop - positions[groupIndex],
                    rowIndex: Number(row.dataset.groupRowIndex), nodeKey: nested?.dataset.virtualAnchor,
                    offset: (nested?.getBoundingClientRect().top ?? box.top) - viewport.top};
            }
        }
        return anchor;
    }

    function anchoredScroll(anchor) {
        if (anchor.following || items.length === 0) return 0;
        const index = indices.get(anchor.key);
        return index == null ? positions[Math.min(anchor.index, items.length - 1)]
            : Math.max(0, positions[index] + Math.min(anchor.inside, Math.max(0, positions[index + 1] - positions[index] - 1)));
    }

    function restoreAnchor(anchor) {
        if (anchor.following) { anchorSpace = 0; anchorSpacer.remove(); scroller.scrollTop = 0; return; }
        const nodes = visibleNodes.get(anchor.key);
        const row = nodes?.[Math.min(anchor.rowIndex ?? 0, nodes.length - 1)];
        if (row != null && anchor.crossView) {
            const match = anchor.queryKey == null ? null : nodes.map(node =>
                node.queryAnchorKey === anchor.queryKey ? node : node.queryAnchorsByKey?.get(anchor.queryKey)).find(Boolean);
            const element = match ?? nodes[0];
            const box = element.getBoundingClientRect();
            // Keep a partially visible query at the same offset, while ensuring
            // a shorter destination row still intersects the visible viewport.
            const offset = match || anchor.queryKey == null ? Math.max(anchor.contentOffset ?? 0, 1 - box.height) : 0;
            const target = Math.max(0, scroller.scrollTop + box.top - scroller.getBoundingClientRect().top
                - scroller.clientTop - table.tHead.getBoundingClientRect().height - offset);
            // A shorter destination view may need room below its last request
            // so the browser does not clamp the restored position to the bottom.
            const naturalLimit = scroller.scrollHeight - scroller.clientHeight - anchorSpace;
            anchorSpace = Math.max(0, Math.ceil(target - naturalLimit));
            if (anchorSpace > 0) {
                anchorSpacer.style.height = `${anchorSpace}px`;
                scroller.append(anchorSpacer);
            } else anchorSpacer.remove();
            scroller.scrollTop = target;
        } else if (row != null && anchor.offset != null) {
            const nested = anchor.nodeKey == null ? null : row.virtualAnchorsByKey?.get(anchor.nodeKey);
            scroller.scrollTop += (nested ?? row).getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset;
        } else scroller.scrollTop = anchoredScroll(anchor);
    }

    function windowFor(scrollTop) {
        if (!virtualized) return {start: 0, end: items.length};
        const buffer = Math.max(600, scroller.clientHeight);
        return {start: indexAt(Math.max(0, scrollTop - buffer)),
            end: Math.min(items.length, indexAt(scrollTop + scroller.clientHeight + buffer) + 1)};
    }

    function rangeCovers(scrollTop) {
        if (!virtualized) return range.start === 0 && range.end === items.length;
        if (range.end <= range.start || range.end > items.length) return false;
        // Retain the existing buffer until the viewport approaches its edge.
        // This avoids rebuilding trees on every small change of direction.
        const margin = Math.min(200, scroller.clientHeight / 3);
        return positions[range.start] <= Math.max(0, scrollTop - margin)
            && positions[range.end] >= Math.min(positions.at(-1), scrollTop + scroller.clientHeight + margin);
    }

    function setSpacers() {
        const top = `${positions[range.start]}px`;
        const bottom = `${positions.at(-1) - positions[range.end]}px`;
        if (topSpacer.firstChild.style.height !== top) topSpacer.firstChild.style.height = top;
        if (bottomSpacer.firstChild.style.height !== bottom) bottomSpacer.firstChild.style.height = bottom;
        if (virtualized) {
            if (topSpacer.parentElement !== body) body.prepend(topSpacer);
            if (bottomSpacer.parentElement !== body) body.append(bottomSpacer);
        } else {
            topSpacer.remove();
            bottomSpacer.remove();
        }
    }

    function paint(anchor = captureAnchor(), target = scroller.scrollTop) {
        if (suspended) return false;
        cancelAnimationFrame(frame);
        frame = null;
        measurementPending = false;
        const focused = document.activeElement;
        const focusedLine = focused?.closest("[data-virtual-anchor]");
        const focusedGroup = focusedLine?.closest("tr[data-row-group-key]")?.dataset.rowGroupKey;
        const focusedButton = focusedLine == null ? -1 : [...focusedLine.querySelectorAll("button")].indexOf(focused);
        // Explicit updates/expansion/resize must also shrink an oversized old
        // window. Only the scroll scheduler retains a still-useful buffer.
        range = windowFor(target);
        if (!virtualized) { topSpacer.remove(); bottomSpacer.remove(); }
        const changed = renderWindow(items.slice(range.start, range.end));
        setSpacers();
        if (scroller.scrollTop !== target) scroller.scrollTop = target;
        visibleNodes = new Map();
        for (const row of body.rows) {
            const key = row.dataset.rowGroupKey;
            if (!key) continue;
            if (!visibleNodes.has(key)) visibleNodes.set(key, []);
            const nodes = visibleNodes.get(key);
            const groupIndex = String(nodes.length);
            const rowIndex = String(rowPositions[indices.get(key)] + nodes.length + 1);
            if (row.dataset.groupRowIndex !== groupIndex) row.dataset.groupRowIndex = groupIndex;
            if (row.getAttribute("aria-rowindex") !== rowIndex) row.setAttribute("aria-rowindex", rowIndex);
            nodes.push(row);
        }
        // Measure all visible groups before changing any spacer heights.
        summaryFreezing.prepare(visibleNodes);
        let resized = false;
        for (const [key, nodes] of visibleNodes) {
            const height = nodes.at(-1).getBoundingClientRect().bottom - nodes[0].getBoundingClientRect().top;
            const entry = heights.get(key);
            if (Math.abs(entry.height - height) > 0.5) {
                entry.height = height;
                resized = true;
            }
        }
        if (resized) {
            rebuildPositions();
            setSpacers();
        }
        restoreAnchor(anchor);
        summaryFreezing.update();
        if (focusedLine != null && !focused.isConnected && focusedButton >= 0) {
            const row = visibleNodes.get(focusedGroup)?.[0];
            row?.virtualAnchorsByKey?.get(focusedLine.dataset.virtualAnchor)
                ?.querySelectorAll("button")[focusedButton]?.focus({preventScroll: true});
        }
        const size = table.getBoundingClientRect();
        lastTableSize = {width: size.width, height: size.height};
        if (changed || resized) onLayout();
        if (!rangeCovers(scroller.scrollTop)) schedule(false);
        onRangeChange();
        return changed;
    }

    function schedule(measure = false) {
        if (suspended) return;
        measurementPending ||= measure;
        if (frame == null) frame = requestAnimationFrame(() => {
            frame = null;
            if (!invalidationPending && !measurementPending && rangeCovers(scroller.scrollTop)) {
                summaryFreezing.update();
                onRangeChange();
                return;
            }
            const anchor = captureAnchor();
            if (invalidationPending) {
                invalidationPending = false;
                widthRevision++;
                rebuildPositions();
                paint(anchor, anchoredScroll(anchor));
                onLayout();
            } else paint(anchor);
        });
    }

    function invalidate() {
        invalidationPending = true;
        schedule(true);
    }

    return {
        preserveVisibleQuery() {
            const anchor = captureAnchor();
            const row = visibleNodes.get(anchor.key)?.[anchor.rowIndex ?? 0];
            const line = row?.virtualAnchorsByKey?.get(anchor.nodeKey);
            let queryKey = line?.queryAnchorKey ?? row?.queryAnchorKey;
            if (queryKey == null && line != null && anchor.nodeKey !== "[]") {
                const lines = row.virtualAnchors;
                const index = lines.indexOf(line);
                queryKey = (lines.slice(index).find(node => node.queryAnchorKey != null)
                    ?? lines.slice(0, index).reverse().find(node => node.queryAnchorKey != null))?.queryAnchorKey;
            }
            pendingViewAnchor = {...anchor, queryKey, inside: 0, rowIndex: 0, nodeKey: null, crossView: true,
                contentOffset: (anchor.nodeKey === "[]" ? row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
                    : anchor.offset ?? 0) - scroller.clientTop - table.tHead.getBoundingClientRect().height};
        },
        setSuspended(value) {
            suspended = value;
            if (suspended) {
                summaryFreezing.clear();
                cancelAnimationFrame(frame); frame = null;
                anchorSpace = 0; anchorSpacer.remove();
            }
        },
        update(nextItems) {
            const anchor = pendingViewAnchor ?? captureAnchor();
            pendingViewAnchor = null;
            if (invalidationPending) {
                invalidationPending = false;
                widthRevision++;
            }
            items = nextItems;
            indices = new Map(items.map((item, index) => [keyOf(item), index]));
            for (const key of heights.keys()) if (!indices.has(key)) heights.delete(key);
            rebuildPositions();
            return paint(anchor, anchoredScroll(anchor));
        },
        refresh: () => schedule(true),
        invalidate,
        isVirtualized: () => virtualized,
        isNearEnd: remaining => virtualized && items.length - (indexAt(scroller.scrollTop + scroller.clientHeight) + 1) <= remaining
    };
}
