import {formatDuration} from "./time-formatting.js?v=182362643655531027511278026245356837010";

// Give counts and timing separate weight, with an optional presentation separator.
export function renderTimingSummary(element, summary, timingSeparator = " · ") {
    const timingStart = summary.search(/ · (?=\d+(?:\.\d+)? (?:ms|s|m|h)\b)/);
    const counts = document.createElement("span");
    counts.className = "summary-counts";
    counts.textContent = timingStart < 0 ? summary : summary.slice(0, timingStart);
    const issueLabel = counts.textContent.match(/^[1-9]\d* N\+1 problems?\b/)?.[0];
    if (issueLabel) {
        const issues = document.createElement("span");
        issues.className = "summary-issues";
        issues.textContent = issueLabel;
        const remainingCounts = counts.textContent.slice(issueLabel.length).replace(/^ · /, " ");
        counts.replaceChildren(issues, remainingCounts);
    }
    element.replaceChildren(counts);
    if (timingStart >= 0) {
        const timing = document.createElement("span");
        timing.className = "summary-timing";
        timing.textContent = timingSeparator + summary.slice(timingStart + 3);
        element.append(timing);
    }
}

export function formatRequestSummary(issues, queries, jdbcDurationMillis, serverDurationMillis,
    totalQueryDurationMillis = jdbcDurationMillis) {
    const counts = `${issues} N+1 ${issues === 1 ? "problem" : "problems"}`
        + ` · ${queries} SQL ${queries === 1 ? "query" : "queries"}`;
    return withTiming(counts, jdbcDurationMillis, serverDurationMillis, totalQueryDurationMillis, true);
}

export function formatQuerySummary(issues, queries, jdbcDurationMillis, serverDurationMillis, totalQueryDurationMillis) {
    return withTiming(`${issues} · ${queries}`, jdbcDurationMillis, serverDurationMillis, totalQueryDurationMillis, false);
}

export function formatSqlQuerySummary(queries, jdbcDurationMillis, totalQueryDurationMillis) {
    return withTiming(String(queries), jdbcDurationMillis, null, totalQueryDurationMillis, false);
}

export function formatSqlExecutionSummary(queries, jdbcDurationMillis, totalQueryDurationMillis) {
    return withTiming(String(queries), jdbcDurationMillis, null, totalQueryDurationMillis, false)
        .replace(" (", " total (");
}
export function formatTableRequestSummary(...args) {
    return formatRequestSummary(...args).replace(/, [^()]* of total query time(?=\))/g, "")
        .replace(/ \([^()]* of total query time\)/g, "");
}
export function formatTableSqlSummary(...args) {
    return args[1] == null ? "—" : formatSqlQuerySummary(...args).replace(/^[^·]*·\s*/, "");
}

function withTiming(counts, jdbcDurationMillis, serverDurationMillis, totalQueryDurationMillis, full) {
    // Older saved live sessions may not contain timing data.
    if (jdbcDurationMillis == null) return counts;
    const jdbc = Number(jdbcDurationMillis);
    if (!Number.isFinite(jdbc) || jdbc < 0) return counts;
    const server = percentage(jdbc, serverDurationMillis);
    const queries = percentage(jdbc, totalQueryDurationMillis);
    const percentages = full
        ? (serverDurationMillis == null ? "" : `${server} of ${globalThis.nplusoneCallRequestsTasks ? "task" : "request"} time, `) + `${queries} of total query time`
        : queries;
    return `${counts} · ${formatDuration(jdbc)} (${percentages})`;
}

function percentage(duration, total) {
    if (total == null || !Number.isFinite(Number(total)) || Number(total) < 0) return "—";
    if (Number(total) === 0) return duration === 0 ? "0%" : "—";
    return `${Number((100 * duration / Number(total)).toFixed(1))}%`;
}
