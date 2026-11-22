// Use the captured strings themselves as keys rather than serializing long
// stack traces into a second string for every visibility calculation.
export function indexQueryIdentities(queries) {
    const index = new Map();
    for (const query of queries) {
        const sql = query.query ?? query.sqlText ?? '';
        let traces = index.get(sql);
        if (!traces) { traces = new Set(); index.set(sql, traces); }
        traces.add(query.stackTrace ?? query.stackTraceText ?? '');
    }
    return index;
}

export function hasQueryIdentity(index, query) {
    return index.get(query.query ?? query.sqlText ?? '')
        ?.has(query.stackTrace ?? query.stackTraceText ?? '') === true;
}
