import {indexQueryIdentities, hasQueryIdentity} from "./query-identity.js?v=67434243922027452159120926522550609888";
import {formatDuration} from "./time-formatting.js?v=182362643655531027511278026245356837010";
import {showHiddenQueryPopup} from "./hidden-query-popup.js?v=10287061348678024565";

export function summarizeVisibleQueries(allQueries, visibleQueries, totalQueryDurationMillis) {
    const visibleKeys = indexQueryIdentities(visibleQueries);
    const hidden = allQueries.filter(query => !hasQueryIdentity(visibleKeys, query));
    const total = totalQueryDurationMillis ?? sumDuration(allQueries);
    return {
        jdbcDurationMillis: sumDuration(visibleQueries) ?? (hidden.length === 0 ? total : null),
        totalQueryDurationMillis: total,
        hiddenQueryCount: hidden.reduce((sum, query) => sum + queryCount(query), 0),
        hiddenIssueCount: hidden.filter(query => queryCount(query) > 1).length,
        hiddenJdbcDurationMillis: sumDuration(hidden),
        hiddenQueries: hidden
    };
}

export function sameQueryVisibility(left, right) {
    return left === right || left != null && right != null
        && left.jdbcDurationMillis === right.jdbcDurationMillis
        && left.totalQueryDurationMillis === right.totalQueryDurationMillis
        && left.hiddenQueryCount === right.hiddenQueryCount
        && left.hiddenIssueCount === right.hiddenIssueCount
        && left.hiddenJdbcDurationMillis === right.hiddenJdbcDurationMillis;
}

export function appendFilterIndicator(target, visibility, onClick) {
    if (!(visibility?.hiddenQueryCount > 0)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `row-filter-indicator${visibility.hiddenIssueCount > 0 ? " row-filter-indicator-issues" : ""}`;
    const timing = visibility.hiddenJdbcDurationMillis == null ? "" : ` · ${formatDuration(visibility.hiddenJdbcDurationMillis)}`;
    const label = `${visibility.hiddenQueryCount} SQL ${visibility.hiddenQueryCount === 1 ? "query" : "queries"} hidden by filters`
        + ` · ${visibility.hiddenIssueCount} N+1 ${visibility.hiddenIssueCount === 1 ? "problem" : "problems"} hidden${timing}`;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", "M3 4h18l-7 8v7l-4 2v-9z");
    svg.append(path);
    button.append(svg);
    button.addEventListener("click", event => {
        event.stopPropagation();
        showHiddenQueryPopup(button, visibility, onClick);
    });
    target.prepend(button);
}

function queryCount(query) {
    return Number(query.count ?? query.sqlCount ?? 1);
}

function sumDuration(queries) {
    let sum = 0;
    for (const query of queries) {
        if (query.jdbcDurationMillis == null) return null;
        const duration = Number(query.jdbcDurationMillis);
        if (!Number.isFinite(duration) || duration < 0) return null;
        sum += duration;
    }
    return sum;
}
