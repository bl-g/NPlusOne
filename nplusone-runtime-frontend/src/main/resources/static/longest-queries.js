import {requestText} from "./request-terminology.js?v=9195521797058750261190268690836445467";
import {readStoredJson, writeStoredJson} from "./browser-storage.js?v=290084059958384501112687013092675042027";
import {setButtonIcon} from "./toolbar-icons.js?v=748948478179589905";

const STORAGE_KEY = "nplusone.longest-queries.v1";

export function selectLongestQueries(queries, limit) {
    if (limit == null || queries.length <= limit) return queries;
    // Keep original call-path order after selecting the slowest groups. Equal times retain source order.
    const selected = new Set(queries.map((query, index) => ({index,
        duration: query.jdbcDurationMillis == null || !Number.isFinite(Number(query.jdbcDurationMillis))
            ? -Infinity : Number(query.jdbcDurationMillis)}))
        .sort((left, right) => right.duration - left.duration || left.index - right.index)
        .slice(0, limit).map(query => query.index));
    return queries.filter((_, index) => selected.has(index));
}

export function createLongestQueriesControl(onChange, {temporary: transient = false} = {}) {
    const stored = transient ? {count: 1} : readStoredJson(sessionStorage, STORAGE_KEY);
    let count = validCount(stored?.count) ? stored.count : 3;
    let active = stored?.active === true;
    let temporary = transient;
    const element = document.createElement("div");
    element.className = "longest-query-control";
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", requestText("Slowest queries per request"));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "longest-query-toggle";
    const picker = document.createElement("input");
    picker.type = "number";
    picker.min = "1";
    picker.step = "1";
    picker.value = String(count);
    picker.className = "longest-query-count";
    picker.setAttribute("aria-label", requestText("Number of slowest queries per request"));
    const suffix = document.createElement("span");
    suffix.textContent = globalThis.nplusoneCallRequestsTasks ? "SQLs per task" : requestText("SQLs per request");
    element.append(toggle, picker, suffix);
    function update() {
        element.classList.toggle("longest-query-active", active);
        setButtonIcon(toggle, 'slowest', {label: 'Slowest', showLabel: true,
            title: active ? 'Show all queries' : requestText('Show only the slowest SQLs per request')});
        element.title = active ? "Click to show all queries."
            : requestText("Show the query groups with the highest total JDBC execution time per request.");
        toggle.setAttribute("aria-pressed", String(active));
        toggle.setAttribute("aria-label", requestText(`${active ? "Showing slowest" : "Show only slowest"} ${count} SQLs per request`));
        if (!temporary) writeStoredJson(sessionStorage, STORAGE_KEY, {active, count});
    }
    function commitCount() {
        const next = picker.valueAsNumber;
        if (!validCount(next)) {
            picker.value = String(count);
            return false;
        }
        const changed = next !== count;
        count = next;
        update();
        return changed;
    }
    element.addEventListener("click", event => {
        if (event.target === picker) return;
        commitCount();
        active = !active;
        update();
        onChange();
    });
    picker.addEventListener("change", () => { if (commitCount() && active) onChange(); });
    picker.addEventListener("blur", commitCount);
    picker.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            const changed = commitCount();
            if (changed && active) onChange();
            else if (!active) toggle.click();
        }
    });
    update();
    return {element, select: queries => selectLongestQueries(queries, active ? count : null),
        beginTour() {
            const saved = {count, active, draft: picker.value};
            temporary = true;
            const reset = (selected = false, notify = true) => { count = 1; active = selected; picker.value = "1"; update(); if (notify) onChange(); };
            reset(false, false);
            return {reset, restore() {
                ({count, active} = saved);
                // Restoring must not persist or normalize the user's unfinished picker draft.
                update(); temporary = false;
                picker.value = saved.draft;
            }};
        },
        isActive: () => active, focus: () => picker.focus({preventScroll: true})};
}

function validCount(value) {
    return Number.isSafeInteger(value) && value > 0;
}
