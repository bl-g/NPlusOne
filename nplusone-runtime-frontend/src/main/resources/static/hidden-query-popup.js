import {formatDuration} from "./time-formatting.js?v=182362643655531027511278026245356837010";
import {renderHighlightedSql} from "./sql-formatting.js?v=107542635421253244738066243612958793875";
import {renderStackTrace} from "./stack-trace-formatting.js?v=6866917973573102231";

let current = null;

export function showHiddenQueryPopup(anchor, visibility, onReviewFilters) {
    if (current?.anchor === anchor) { current.close(true); return; }
    current?.close();
    const popup = element("section", "hidden-query-popup");
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Hidden queries in this branch");
    const heading = element("div", "hidden-query-popup-heading");
    const closeButton = button("×", "hidden-query-popup-close", () => close(true));
    closeButton.setAttribute("aria-label", "Close hidden queries");
    heading.append(element("strong", "", "Hidden queries in this branch"), closeButton);
    const count = visibility.hiddenQueryCount;
    const issues = visibility.hiddenIssueCount;
    const duration = formatDuration(visibility.hiddenJdbcDurationMillis);
    const summary = `${count} SQL ${count === 1 ? "query" : "queries"} · ${issues} N+1 ${issues === 1 ? "problem" : "problems"}`
        + (duration ? ` · ${duration}` : "");
    const actions = element("div", "hidden-query-popup-actions");
    const details = element("div", "hidden-query-details");
    details.hidden = true;
    const entries = element("div", "hidden-query-entries");
    let rows = null, loaded = 0;
    const more = button("Show more query groups", "filter-button hidden-query-more", loadMore);
    more.hidden = true;
    details.append(entries, more);
    const view = button("View hidden queries", "filter-button hidden-query-view", () => {
        details.hidden = !details.hidden;
        view.textContent = details.hidden ? "View hidden queries" : "Hide query details";
        view.setAttribute("aria-expanded", String(!details.hidden));
        if (!details.hidden && rows == null) {
            rows = [...(visibility.getHiddenQueries?.() ?? visibility.hiddenQueries ?? [])]
                .sort((left, right) => Number(right.jdbcDurationMillis ?? -1) - Number(left.jdbcDurationMillis ?? -1));
            loadMore();
            if (rows.length === 0) entries.append(element("p", "", "Query details are unavailable for this snapshot."));
        }
        position();
    });
    view.setAttribute("aria-expanded", "false");
    const review = button("Adjust filters", "filter-button hidden-query-review", () => { close(); onReviewFilters?.(); });
    actions.append(view, review);
    popup.append(heading, element("p", "hidden-query-popup-summary", summary), actions, details);
    document.body.append(popup);
    anchor.setAttribute("aria-expanded", "true");
    const controller = new AbortController();
    const observer = new MutationObserver(() => { if (!anchor.isConnected) close(); else position(); });
    function close(restoreFocus = false) {
        controller.abort();
        observer.disconnect();
        anchor.setAttribute("aria-expanded", "false");
        popup.remove();
        if (current?.anchor === anchor) current = null;
        if (restoreFocus && anchor.isConnected) anchor.focus({preventScroll: true});
    }
    function position() {
        const rect = anchor.getBoundingClientRect();
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8));
        const top = rect.bottom + 6 + popup.offsetHeight <= window.innerHeight - 8
            ? rect.bottom + 6 : Math.max(8, rect.top - popup.offsetHeight - 6);
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    }
    function loadMore() {
        if (rows == null) return;
        const fragment = document.createDocumentFragment();
        const end = Math.min(rows.length, loaded + 50);
        for (; loaded < end; loaded++) {
            const query = rows[loaded];
            const executions = Number(query.count ?? query.sqlCount ?? 1);
            const card = element("article", `hidden-query-entry${executions > 1 ? " hidden-query-entry-repeated" : ""}`);
            const time = formatDuration(query.jdbcDurationMillis);
            card.append(element("div", "hidden-query-entry-summary", `${executions} ${executions === 1 ? "execution" : "executions"}`
                + (time ? ` · ${time}` : "")));
            const sql = element("pre", "hidden-query-sql");
            renderHighlightedSql(sql, query.query ?? query.sqlText ?? "");
            const trace = element("details", "hidden-query-stack");
            const stack = element("pre", "");
            trace.addEventListener("toggle", () => {
                if (trace.open && !stack.hasChildNodes()) renderStackTrace(stack, query.stackTrace ?? query.stackTraceText ?? "");
            });
            trace.append(element("summary", "", "Stack trace"), stack);
            card.append(sql, trace);
            fragment.append(card);
        }
        entries.append(fragment);
        more.hidden = loaded >= rows.length;
        position();
    }
    current = {anchor, close};
    observer.observe(document.body, {childList: true, subtree: true});
    document.addEventListener("pointerdown", event => {
        if (!popup.contains(event.target) && !anchor.contains(event.target)) close();
    }, {signal: controller.signal});
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === "Tab") {
            const controls = [...popup.querySelectorAll("button, summary")].filter(control => control.getClientRects().length > 0);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    }, {signal: controller.signal});
    window.addEventListener("resize", () => close(), {signal: controller.signal});
    window.addEventListener("scroll", event => { if (!popup.contains(event.target)) close(); }, {capture: true, signal: controller.signal});
    position();
    view.focus({preventScroll: true});
}

function element(tag, className, text) {
    const result = document.createElement(tag);
    result.className = className;
    if (text != null) result.textContent = text;
    return result;
}

function button(text, className, action) {
    const result = element("button", className, text);
    result.type = "button";
    result.addEventListener("click", action);
    return result;
}
