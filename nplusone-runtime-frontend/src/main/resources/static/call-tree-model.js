import {indexQueryIdentities, hasQueryIdentity} from "./query-identity.js?v=67434243922027452159120926522550609888";
// The agent's StackWalker output is innermost first. Keep the entire captured
// frame identity, including package/module and source location, when merging.
export function parseCallFrames(stackTrace) {
    const frames = String(stackTrace ?? "").split(/\r\n?|\n/)
            .map(line => line.trim().replace(/^at\s+/, "")).filter(Boolean).reverse();
    if (frames.length === 0) return [{key: null, label: "Stack trace unavailable", location: "", full: "Stack trace unavailable"}];
    return frames.map(full => {
        const match = full.match(/^(.*?)\((.*)\)$/);
        const name = match?.[1] ?? full;
        const methodSeparator = name.lastIndexOf(".");
        const classSeparator = name.lastIndexOf(".", methodSeparator - 1);
        return {key: full, full, label: name.slice(classSeparator + 1), location: match?.[2] ?? ""};
    });
}

export function buildCallTree(queryRows, parseFrames = parseCallFrames) {
    const root = branch("root", null, null);
    const nodes = [root];
    for (const row of queryRows) {
        const value = Number(row.sqlCount ?? 1);
        const count = Number.isFinite(value) && value >= 0 ? value : 1;
        const duration = row.jdbcDurationMillis == null ? null : Number(row.jdbcDurationMillis);
        const jdbcDurationMillis = Number.isFinite(duration) && duration >= 0 ? duration : null;
        const path = [root];
        let parent = root;
        const hiddenFrames = globalThis.nplusoneHideProxyFrames !== false ? new Set(row.proxyFrames ?? []) : null;
        for (const frame of parseFrames(row.stackTraceText)) {
            if (hiddenFrames?.has(frame.key)) continue;
            let child = parent.frames.get(frame.key);
            if (child == null) {
                child = branch("frame", frame.key, parent);
                child.frame = frame;
                parent.frames.set(frame.key, child);
                parent.children.push(child);
                nodes.push(child);
            }
            parent = child;
            path.push(child);
        }
        const query = String(row.sqlText ?? "");
        let leaf = parent.queries.get(query);
        if (leaf == null) {
            leaf = {kind: "sql", key: query, query, parent, count: 0, issueCount: 0, hasIssue: false,
                jdbcDurationMillis: 0, queryRows: []};
            parent.queries.set(query, leaf);
            parent.children.push(leaf);
            nodes.push(leaf);
            for (const node of path) node.leafCount++;
        }
        leaf.count += count;
        leaf.queryRows.push(row);
        for (const node of [...path, leaf]) {
            node.jdbcDurationMillis = node.jdbcDurationMillis == null || jdbcDurationMillis == null
                ? null : node.jdbcDurationMillis + jdbcDurationMillis;
        }
        // Keep N+1 semantics identical to the source SQL groups/table, rather
        // than inferring an issue from unrelated single-execution records.
        if (count > 1) {
            leaf.hasIssue = true;
            leaf.issueCount++;
            for (const node of path) node.issueCount++;
        }
        for (const node of path) node.executionCount += count;
    }
    for (const node of nodes) {
        delete node.frames;
        delete node.queries;
    }
    root.nodeCount = nodes.length;
    return root;
}

function branch(kind, key, parent) {
    return {kind, key, parent, children: [], frames: new Map(), queries: new Map(),
        executionCount: 0, leafCount: 0, issueCount: 0, jdbcDurationMillis: 0};
}

export function sameCallQueries(left, right) {
    return left === right || left.length === right.length && left.every((row, index) => {
        const other = right[index];
        return row === other || row.sqlCount === other.sqlCount && row.sqlText === other.sqlText
                && row.jdbcDurationMillis === other.jdbcDurationMillis
                && row.stackTraceText === other.stackTraceText
                && sameProxyFrames(row.proxyFrames, other.proxyFrames);
    });
}

function sameProxyFrames(left = [], right = []) {
    return left === right || left.length === right.length && left.every((frame, index) => frame === right[index]);
}

// Compare matching paths, so only ancestors of hidden queries receive an indicator.
export function hiddenQueriesByNode(visibleTree, fullTree) {
    const result = new Map();
    const visibleKeys = indexQueryIdentities(collectQueryRows(visibleTree));
    const pending = [[visibleTree, fullTree]];
    while (pending.length > 0) {
        const [visible, full] = pending.pop();
        const count = node => node.kind === "sql" ? node.count : node.executionCount;
        const hiddenQueryCount = Math.max(0, count(full) - count(visible));
        if (hiddenQueryCount > 0) result.set(visible, {
            hiddenQueryCount,
            hiddenIssueCount: Math.max(0, full.issueCount - visible.issueCount),
            hiddenJdbcDurationMillis: full.jdbcDurationMillis == null || visible.jdbcDurationMillis == null
                ? null : Math.max(0, full.jdbcDurationMillis - visible.jdbcDurationMillis),
            getHiddenQueries: () => collectQueryRows(full).filter(query => !hasQueryIdentity(visibleKeys, query))
        });
        const children = new Map((full.children ?? []).map(child => [JSON.stringify([child.kind, child.key]), child]));
        for (const child of visible.children ?? []) {
            const match = children.get(JSON.stringify([child.kind, child.key]));
            if (match != null) pending.push([child, match]);
        }
    }
    return result;
}

function collectQueryRows(root) {
    const rows = [];
    const pending = [root];
    while (pending.length > 0) {
        const node = pending.pop();
        if (node.kind === "sql") rows.push(...node.queryRows);
        else pending.push(...node.children);
    }
    return rows;
}

export function sourceQueryKey(query) {
    return JSON.stringify([query.sqlText ?? "", query.stackTraceText ?? ""]);
}

// No DOM is cached. Bound both models and parsed frames so scrolling through a
// large history does not retain a second unbounded representation of it.
export function createCallTreeCache({maxGroups = 100, maxNodes = 20_000, maxCharacters = 2_000_000} = {}) {
    const models = new Map();
    const frames = new Map();
    let nodes = 0;
    let characters = 0;
    let frameCharacters = 0;
    function parse(text) {
        const input = String(text ?? "");
        const cached = frames.get(input);
        if (cached != null) {
            frames.delete(input);
            frames.set(input, cached);
            return cached;
        }
        const result = parseCallFrames(input);
        if (input.length <= maxCharacters) {
            while (frames.size > 0 && (frames.size >= 1000 || frameCharacters + input.length > maxCharacters)) {
                const oldest = frames.keys().next().value;
                frameCharacters -= oldest.length;
                frames.delete(oldest);
            }
            frames.set(input, result);
            frameCharacters += input.length;
        }
        return result;
    }
    function remove(key) {
        const entry = models.get(key);
        nodes -= entry.tree.nodeCount;
        characters -= entry.size;
        models.delete(key);
    }
    return {
        get(key, queryRows) {
            const previous = models.get(key);
            if (previous != null && sameCallQueries(previous.rows, queryRows)) {
                models.delete(key);
                models.set(key, previous);
                return previous.tree;
            }
            if (previous != null) remove(key);
            const tree = buildCallTree(queryRows, parse);
            const size = queryRows.reduce((total, row) => total
                    + String(row.sqlText ?? "").length + String(row.stackTraceText ?? "").length, 0);
            if (tree.nodeCount <= maxNodes && size <= maxCharacters && maxGroups > 0) {
                while (models.size > 0 && (models.size >= maxGroups || nodes + tree.nodeCount > maxNodes
                        || characters + size > maxCharacters)) remove(models.keys().next().value);
                models.set(key, {rows: queryRows, tree, size});
                nodes += tree.nodeCount;
                characters += size;
            }
            return tree;
        },
        clear() {
            models.clear();
            frames.clear();
            nodes = characters = frameCharacters = 0;
        }
    };
}
