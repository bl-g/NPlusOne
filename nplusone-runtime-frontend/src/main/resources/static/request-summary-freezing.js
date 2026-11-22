export function createRequestSummaryFreezing(table, scroller) {
    let groups = new Map();
    let frozen = null;

    function clear() {
        frozen?.classList.remove("request-summary-frozen");
        frozen = null;
    }

    return {
        clear,
        prepare(nextGroups) {
            groups = nextGroups;
            for (const nodes of groups.values()) {
                const first = nodes[0];
                if (first.classList.contains("call-tree-request") || first.classList.contains("collapsed-request-row")) continue;
                for (const cell of first.querySelectorAll(":scope > .request-summary")) {
                    if (cell.querySelector(":scope > .request-summary-content")) continue;
                    const content = document.createElement("div");
                    content.className = "request-summary-content";
                    content.append(...[...cell.childNodes].filter(node => !node.classList?.contains("n-plus-one-marker")));
                    cell.prepend(content);
                }
            }
        },
        update() {
            const viewport = scroller.getBoundingClientRect();
            const headingHeight = table.tHead.getBoundingClientRect().height;
            const top = viewport.top + scroller.clientTop + headingHeight;
            const bottom = viewport.top + scroller.clientTop + scroller.clientHeight;
            let candidate = null;
            if (!table.hidden) for (const nodes of groups.values()) {
                if (nodes.at(-1).getBoundingClientRect().bottom <= top + 0.5
                        || nodes[0].getBoundingClientRect().top >= bottom - 0.5) continue;
                if (candidate != null) { candidate = null; break; }
                candidate = nodes[0];
            }
            if (candidate?.classList.contains("collapsed-request-row") || candidate?.classList.contains("unassociated")
                    || candidate?.querySelector(".call-tree-request-toggle")?.getAttribute("aria-expanded") === "false") candidate = null;
            if (candidate !== frozen) {
                clear();
                frozen = candidate;
                frozen?.classList.add("request-summary-frozen");
            }
            table.style.setProperty("--request-summary-sticky-top", `${headingHeight}px`);
        }
    };
}
