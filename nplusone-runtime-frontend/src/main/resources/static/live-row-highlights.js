// Keep arrival state separate from DOM lifetime: virtual remounts and redraws
// continue the original two-second interval rather than starting another flash.
export function createLiveRowHighlights({now = () => performance.now(), duration = 2000,
    maxEntries = 5000, maxCharacters = 2_000_000,
    setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
    const groups = new Map();
    const entries = new Map();
    const pending = new Set();
    let characters = 0;
    let timer = null;
    let timerAt = null;

    function groupFor(key) {
        if (!groups.has(key)) groups.set(key, {birth: null, queries: new Map()});
        return groups.get(key);
    }
    function forgetEntry(entry) {
        if (!entries.delete(entry)) return;
        pending.delete(entry);
        characters -= entry.size;
        const group = groups.get(entry.groupKey);
        if (entry.sql == null) group.birth = null;
        else {
            const traces = group.queries.get(entry.sql);
            traces.delete(entry.trace);
            if (traces.size === 0) group.queries.delete(entry.sql);

        }
        if (group.birth == null && group.queries.size === 0) groups.delete(entry.groupKey);
    }
    function prune(time) {
        for (const entry of entries.keys()) {
            if (entry.startedAt != null && time - entry.startedAt >= duration) forgetEntry(entry);
        }
    }
    function scheduleCleanup() {
        let next = null;
        for (const entry of entries.keys()) {
            if (entry.startedAt != null) next = Math.min(next ?? Infinity, entry.startedAt + duration);
        }
        if (timerAt === next) return;
        if (timer != null) clearTimer(timer);
        timer = null;
        timerAt = next;
        if (next == null) return;
        timer = setTimer(() => {
            timer = timerAt = null;
            prune(now());
            scheduleCleanup();
        }, Math.max(0, next - now()));
        // Browser timer IDs are numbers; Node tests need not stay alive merely
        // because a presentation interval has not yet elapsed.
        timer?.unref?.();
    }
    function add(groupKey, sql = null, trace = null) {
        const existing = groups.get(groupKey);
        const previous = sql == null ? existing?.birth : existing?.queries.get(sql)?.get(trace);
        if (previous?.startedAt == null && previous != null) return;
        // Skip oversized text before creating a second, normalized path string.
        if (maxEntries <= 0 || groupKey.length + (sql?.length ?? 0) + (trace?.length ?? 0) > maxCharacters) return;

        const size = groupKey.length + (sql?.length ?? 0) + (trace?.length ?? 0);
        if (size > maxCharacters) return;
        if (previous != null) forgetEntry(previous);
        while (entries.size > 0 && (entries.size >= maxEntries || characters + size > maxCharacters)) {
            forgetEntry(entries.keys().next().value);
        }
        const entry = {groupKey, sql, trace, size, startedAt: null};
        const group = groupFor(groupKey);
        if (sql == null) group.birth = entry;
        else {
            if (!group.queries.has(sql)) group.queries.set(sql, new Map());
            group.queries.get(sql).set(trace, entry);

        }
        entries.set(entry, true);
        pending.add(entry);
        characters += size;
    }
    function liveStart(entry) {
        return entry?.startedAt != null && now() - entry.startedAt < duration ? entry.startedAt : null;
    }

    return {
        observe(groupKey, previousQueries, nextQueries) {
            if (previousQueries == null) {
                add(groupKey);
                return;
            }
            if (groups.get(groupKey)?.birth?.startedAt === null) return;
            if (previousQueries.length === nextQueries.length && nextQueries.every((query, index) =>
                query.sqlText === previousQueries[index].sqlText
                && query.stackTraceText === previousQueries[index].stackTraceText)) return;
            const previous = new Map();
            for (const query of previousQueries) {
                const sql = String(query.sqlText ?? "");
                if (!previous.has(sql)) previous.set(sql, new Set());
                previous.get(sql).add(String(query.stackTraceText ?? ""));
            }
            for (const query of nextQueries) {
                const sql = String(query.sqlText ?? "");
                const trace = String(query.stackTraceText ?? "");
                if (!previous.get(sql)?.has(trace)) add(groupKey, sql, trace);
            }
        },
        beginRender() {
            const time = now();
            prune(time);
            for (const entry of pending) entry.startedAt = time;
            pending.clear();
            scheduleCleanup();
        },
        groupStartedAt: key => liveStart(groups.get(key)?.birth),
        queryStartedAt: (key, sql, trace) => liveStart(groups.get(key)?.queries
            .get(String(sql ?? ""))?.get(String(trace ?? ""))),
        treeQueryStartedAt(key, node) {
            const traces = groups.get(key)?.queries.get(String(node.query ?? ""));
            if (traces == null) return null;
            let startedAt = null;
            for (const query of node.queryRows ?? []) {
                const time = liveStart(traces.get(String(query.stackTraceText ?? "")));
                if (time != null) startedAt = Math.max(startedAt ?? -Infinity, time);
            }
            return startedAt;
        },
        apply(element, startedAt) {
            const elapsed = startedAt == null ? duration : Math.max(0, now() - startedAt);
            if (elapsed >= duration) {
                if (element.classList.contains("live-row-highlight")) {
                    element.classList.remove("live-row-highlight");
                    element.style.removeProperty("--live-highlight-delay");
                    element.style.removeProperty("--live-highlight-duration");
                    delete element.dataset.liveHighlightStart;
                }
                return false;
            }
            element.classList.add("live-row-highlight");
            element.style.setProperty("--live-highlight-delay", `${-elapsed}ms`);
            element.style.setProperty("--live-highlight-duration", `${duration}ms`);
            element.dataset.liveHighlightStart = String(startedAt);
            return true;
        },
        forget(key) {
            const group = groups.get(key);
            if (group == null) return;
            if (group.birth != null) forgetEntry(group.birth);
            for (const traces of group.queries.values()) {
                for (const entry of traces.values()) forgetEntry(entry);
            }
            scheduleCleanup();
        },
        clear() {
            groups.clear();
            entries.clear();
            pending.clear();
            characters = 0;
            if (timer != null) clearTimer(timer);
            timer = timerAt = null;
        }
    };
}
