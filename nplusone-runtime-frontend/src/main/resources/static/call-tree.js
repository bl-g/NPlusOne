import {requestText} from "./request-terminology.js?v=9195521797058750261190268690836445467";
import {readStoredValue, writeStoredValue} from "./browser-storage.js?v=290084059958384501112687013092675042027";
import {formatDateTimestamp as formatTimestamp, formatDuration} from "./time-formatting.js?v=182362643655531027511278026245356837010";
import {createCallTreeCache, sameCallQueries, hiddenQueriesByNode, sourceQueryKey} from "./call-tree-model.js?v=80209571130848559522647497809978973720";
import {projectCallTree} from "./call-tree-projection.js?v=217807320803597190502839157546091133361";
import {formatRequestSummary, formatQuerySummary, formatSqlQuerySummary} from "./request-summary.js?v=279709107265595431799678358316915282079";
import {summarizeVisibleQueries, sameQueryVisibility, appendFilterIndicator} from "./query-visibility.js?v=309269865418407453266603283734342634673";

const VIEW_KEY = "nplusone.results-view.v1";
const DISPLAY_KEY = "nplusone.call-tree-display.v1";
const LEVELS_KEY = "nplusone.call-tree-levels.v1";
const MODES = new Set(["expanded", "fully-expanded", "sql-paths", "collapsed"]);

export function createCallTreeView({table, formatSql, renderSql, onChange, onBeforeViewChange = () => {}, highlights = null, onOperationClick, showTimestamps = true}) {
    const cache = createCallTreeCache();
    let states = new Map();
    let temporary = false;
    const recentRows = new Map();
    const liveHighlightTargets = new WeakMap();
    let recentElements = 0;
    let recentCharacters = 0;
    const tableButton = document.getElementById("view-table");
    const treeButton = document.getElementById("view-tree");
    const chartButton = document.getElementById("view-bar-chart");
    const tableControls = document.getElementById("table-display-controls");
    const treeControls = document.getElementById("tree-display-controls");
    const expandFullButton = document.getElementById("tree-expand-full");
    const sqlPathsButton = document.getElementById("tree-show-sql-paths");
    const collapseButton = document.getElementById("tree-collapse");
    const levelControl = document.getElementById("tree-level-control");
    const levelInput = document.getElementById("tree-branch-levels");
    const headers = [...table.tHead.rows[0].cells];
    const headingText = headers[0].firstChild;
    const originalHeading = headingText.textContent;
    const storedView = readStoredValue(localStorage, VIEW_KEY);
    let view = ["table", "tree", "chart"].includes(storedView) ? storedView : "tree";
    const storedDisplay = readStoredValue(sessionStorage, DISPLAY_KEY);
    let display = MODES.has(storedDisplay) ? storedDisplay : "sql-paths";
    const storedLevels = Number(readStoredValue(sessionStorage, LEVELS_KEY));
    let levels = Number.isSafeInteger(storedLevels) && storedLevels > 0 ? storedLevels : 1;
    let revision = 0;
    let appliedView = null;
    let levelDraftChanged = false;
    let levelDraftValue = String(levels);

    tableButton.addEventListener("click", () => select("table"));
    treeButton.addEventListener("click", () => select("tree"));
    chartButton.addEventListener("click", () => select("chart"));
    expandFullButton.addEventListener("click", () => setPreset("fully-expanded"));
    sqlPathsButton.addEventListener("click", () => setPreset("sql-paths"));
    collapseButton.addEventListener("click", () => setPreset("collapsed"));
    levelInput.value = levelDraftValue;
    document.getElementById("tree-apply-level").addEventListener("click", () => commitLevels(true));
    levelInput.addEventListener("beforeinput", event => {
        if (event.data != null && /[^0-9]/.test(event.data)) event.preventDefault();
    });
    levelInput.addEventListener("paste", event => {
        if (/[^0-9]/.test(event.clipboardData?.getData("text") ?? "")) event.preventDefault();
    });
    levelInput.addEventListener("input", event => {
        const value = levelInput.value;
        // Validate the resulting value too: paste/drop and non-cancelable
        // insertions can bypass beforeinput. An empty draft permits replacing
        // the number; leaving it empty restores the last applied depth.
        if (event.data != null && /[^0-9]/.test(event.data)
                || value !== "" && !validLevelValue(value) || levelInput.validity.badInput) {
            levelInput.value = levelDraftValue;
            return;
        }
        levelDraftValue = value;
        levelDraftChanged = true;
        if (value !== "") commitLevels(true);
    });
    // Apply valid input immediately; restore an empty draft when leaving the field.
    levelInput.addEventListener("change", () => commitLevels());
    levelInput.addEventListener("blur", () => commitLevels());
    levelInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            commitLevels(true);
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            if (event.key === "ArrowUp") levelInput.stepUp();
            else levelInput.stepDown();
            commitLevels(true);
        } else if (event.key === "Escape") {
            levelInput.value = String(levels);
            levelDraftValue = levelInput.value;
            levelDraftChanged = false;
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
                && !/^[0-9]$/.test(event.key)) {
            event.preventDefault();
        }
    });
    function validLevelValue(value) {
        return /^[0-9]+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
    }
    function commitLevels(force = false) {
        if (!force && !levelDraftChanged && levelInput.value === String(levels)) return;
        if (!validLevelValue(levelInput.value)) {
            levelInput.value = String(levels);
            levelDraftValue = levelInput.value;
            levelDraftChanged = false;
            return;
        }
        setPreset("expanded", Number(levelInput.value));
    }
    function setPreset(next, nextLevels = levels) {
        display = next;
        levels = nextLevels;
        levelInput.value = String(levels);
        levelDraftValue = levelInput.value;
        levelDraftChanged = false;
        // Each toolbar action is an exact preset. Local exploration can resume
        // afterward, without overriding a newly selected depth or SQL mode.
        states.clear();
        clearRows();
        revision++;
        if (!temporary) {
            writeStoredValue(sessionStorage, DISPLAY_KEY, display);
            writeStoredValue(sessionStorage, LEVELS_KEY, String(levels));
        }
        onChange();
    }
    function updateControls() {
        for (const [button, mode] of [[expandFullButton, "fully-expanded"],
            [sqlPathsButton, "sql-paths"], [collapseButton, "collapsed"]]) {
            const selected = display === mode;
            button.classList.toggle("filter-button-active", selected);
            button.setAttribute("aria-pressed", String(selected));
        }
        levelControl.classList.toggle("filter-button-active", display === "expanded");
    }
    function select(next) {
        if (next === view) return;
        onBeforeViewChange(view, next);
        view = next;
        if (!temporary) writeStoredValue(localStorage, VIEW_KEY, view);
        onChange();
    }
    function stateFor(key) {
        if (!states.has(key)) states.set(key, {version: 0, collapsed: null, children: new Map(), sql: new Map()});
        return states.get(key);
    }
    function displayFor(key) { return states.get(key)?.display ?? display; }
    function collapsed(key) {
        return states.get(key)?.collapsed ?? (displayFor(key) === "collapsed");
    }
    function pathFor(node) {
        const path = [];
        for (let current = node; current.parent != null; current = current.parent) path.push([current.kind, current.key]);
        return path.reverse();
    }
    function stateAt(state, node) {
        for (const [, key] of pathFor(node)) {
            if (!state.children.has(key)) state.children.set(key, {children: new Map(), sql: new Map()});
            state = state.children.get(key);
        }
        return state;
    }
    function changed(key, path) {
        stateFor(key).version++;
        onChange();
        // Reconciliation may replace this group. Restore keyboard focus without scrolling.
        for (const row of table.tBodies[0].rows) {
            if (row.dataset.rowGroupKey !== key) continue;
            row.virtualAnchorsByKey?.get(path)?.querySelector("button")?.focus({preventScroll: true});
            return;
        }
    }
    function lineFor(node, className = "") {
        const line = element("div", `call-tree-line ${className}`);
        line.queryNode = node;
        line.dataset.virtualAnchor = JSON.stringify(pathFor(node));
        return line;
    }
    function counterBadge(issues, queries, {full = false, queryOnly = false, className = "", jdbcDurationMillis, serverDurationMillis,
        totalQueryDurationMillis = jdbcDurationMillis, visibility, onFilterClick} = {}) {
        const description = queryOnly ? formatSqlQuerySummary(queries, jdbcDurationMillis, totalQueryDurationMillis)
            : formatRequestSummary(issues, queries, jdbcDurationMillis, full ? serverDurationMillis : null, totalQueryDurationMillis);
        const badge = element("span", `call-tree-issue${issues === 0 ? " call-tree-issue-neutral" : ""}${className}`,
            full || queryOnly ? description : formatQuerySummary(issues, queries, jdbcDurationMillis, serverDurationMillis, totalQueryDurationMillis));
        badge.title = description;
        badge.setAttribute("aria-label", description);
        badge.dataset.nPlusOneCount = String(issues);
        badge.dataset.sqlQueryCount = String(queries);
        appendFilterIndicator(badge, visibility, onFilterClick);
        return badge;
    }
    function nodeCounterBadge(node, group, visibility) {
        return counterBadge(node.issueCount, node.kind === "sql" ? node.count : node.executionCount, {
            queryOnly: node.kind === "sql",
            className: node.kind === "sql" ? " call-tree-count" : "",
            jdbcDurationMillis: node.jdbcDurationMillis, serverDurationMillis: group.duration,
            totalQueryDurationMillis: group.jdbcDurationMillis, visibility, onFilterClick: group.onFilterClick
        });
    }
    function rowVersion(key) {
        return `${revision}:${states.get(key)?.version ?? 0}`;
    }
    function forgetRow(key) {
        const entry = recentRows.get(key);
        if (entry == null) return;
        recentElements -= entry.elements;
        recentCharacters -= entry.characters;
        recentRows.delete(key);
    }
    function reuseRow(group) {
        const entry = recentRows.get(group.key);
        if (entry == null) return null;
        const previous = entry.group;
        if (entry.row.isConnected || entry.version !== rowVersion(group.key)
                || previous.operation !== group.operation || previous.start !== group.start
                || previous.duration !== group.duration || previous.unassociated !== group.unassociated
                || previous.jdbcDurationMillis !== group.jdbcDurationMillis
                || !sameQueryVisibility(previous.visibility, group.visibility)
                || Boolean(previous.onDelete) !== Boolean(group.onDelete)
                || !sameCallQueries(previous.queryRows, group.queryRows)
                || !sameCallQueries(previous.allQueryRows ?? previous.queryRows, group.allQueryRows ?? group.queryRows)) {
            forgetRow(group.key);
            return null;
        }
        recentRows.delete(group.key);
        recentRows.set(group.key, entry);
        return entry.row;
    }
    function rememberRow(group, row) {
        // A few recently mounted trees may be reused after detachment. This is
        // independent of the data/model cache and has strict DOM/text budgets.
        const inputSize = (group.allQueryRows ?? group.queryRows).reduce((sum, query) => sum
            + String(query.sqlText ?? "").length + String(query.stackTraceText ?? "").length, 0);
        if (inputSize > 200_000) return;
        const elements = row.querySelectorAll("*").length;
        if (elements > 4000) return;
        const characters = row.virtualAnchors.reduce((sum, line) => sum
            + line.dataset.virtualAnchor.length + line.textContent.length, inputSize);
        if (characters > 1_000_000) return;
        while (recentRows.size > 0 && (recentRows.size >= 4 || recentElements + elements > 4000
                || recentCharacters + characters > 1_000_000)) forgetRow(recentRows.keys().next().value);
        recentRows.set(group.key, {group, row, elements, characters, version: rowVersion(group.key)});
        recentElements += elements;
        recentCharacters += characters;
    }
    function clearRows() {
        recentRows.clear();
        recentElements = recentCharacters = 0;
    }
    function refreshHighlights(key, row) {
        if (highlights == null) return;
        for (const {element, node} of liveHighlightTargets.get(row) ?? []) {
            const startedAt = node == null ? highlights.groupStartedAt(key)
                : highlights.treeQueryStartedAt(key, node);
            highlights.apply(element, startedAt);
        }
    }
    function render(group, target) {
        const reused = reuseRow(group);
        if (reused != null) {
            // CSS animations restart after detachment. Resume from the actual
            // arrival age when a pooled row is mounted again.
            refreshHighlights(group.key, reused);
            target.append(reused);
            return;
        }
        const operation = group.operation || (group.unassociated ? "Unassociated" : requestText("Request"));
        const row = element("tr", "request-row request-group-start request-group-end call-tree-request");
        const highlightTargets = highlights == null ? undefined : [];
        if (highlightTargets != null) liveHighlightTargets.set(row, highlightTargets);
        if (group.unassociated) row.classList.add("unassociated");
        const cell = element("td", "call-tree-cell");
        cell.colSpan = 5;
        row.append(cell);
        const rootLine = element("div", "call-tree-line call-tree-request-header");
        if (highlightTargets != null) highlightTargets.push({element: rootLine});
        rootLine.dataset.virtualAnchor = "[]";
        const rootButton = element("button", "call-tree-toggle call-tree-request-toggle");
        rootButton.type = "button";
        const isCollapsed = collapsed(group.key);
        rootButton.setAttribute("aria-expanded", String(!isCollapsed));
        rootButton.setAttribute("aria-label", `${isCollapsed ? "Expand" : "Collapse"} ${operation}`);
        rootButton.append(arrow(!isCollapsed));
        rootButton.addEventListener("click", () => {
            stateFor(group.key).collapsed = !isCollapsed;
            changed(group.key, "[]");
        });
        rootLine.append(rootButton);
        const operationName = element("button", "operation-name call-tree-operation", operation);
        operationName.type = "button";
        operationName.disabled = group.unassociated || !group.operation;
        operationName.setAttribute("aria-haspopup", "dialog");
        operationName.setAttribute("aria-expanded", "false");
        operationName.addEventListener("click", () => onOperationClick?.(operationName, group.operation));
        rootLine.append(operationName);
        makeRowClickable(rootLine, rootButton);
        let queryCount = 0;
        let issues = 0;
        for (const query of group.queryRows) {
            const count = normalizedQueryCount(query.sqlCount);
            queryCount += count;
            if (count > 1) issues++;
        }
        const metadata = [showTimestamps && !temporary && group.showTimestamp !== false ? formatTimestamp(group.start) : null,
            formatDuration(group.duration)].filter(Boolean);
        if (group.unassociated) metadata.unshift("Unassociated");
        rootLine.append(element("span", "call-tree-meta", metadata.join(" · ")));
        const visibility = group.visibility ?? summarizeVisibleQueries(group.queryRows, group.queryRows, group.jdbcDurationMillis);
        const summary = counterBadge(issues, queryCount, {full: true,
            jdbcDurationMillis: visibility.jdbcDurationMillis, serverDurationMillis: group.duration,
            totalQueryDurationMillis: visibility.totalQueryDurationMillis, visibility, onFilterClick: group.onFilterClick});
        rootLine.append(summary);
        if (group.onDelete) {
            const remove = element("button", "delete-query-group-button", "×");
            remove.type = "button";
            remove.title = "Delete this request group";
            remove.setAttribute("aria-label", `Delete ${operation} group`);
            remove.addEventListener("click", group.onDelete);
            rootLine.append(remove);
        }
        cell.append(rootLine);
        let queryTree;
        if (!isCollapsed) {
            const tree = cache.get(group.key, group.queryRows);
            queryTree = tree;
            const hiddenByNode = visibility.hiddenQueryCount > 0
                ? hiddenQueriesByNode(tree, cache.get(`full:${group.key}`, group.allQueryRows ?? group.queryRows)) : new Map();
            const list = element("ul", "call-tree-paths");
            list.setAttribute("aria-label", `Call paths for ${operation}`);
            cell.append(list);
            // Look up sparse overrides through real model parents, not the
            // projected parents which can skip several compressed methods.
            const nodeStates = new Map([[tree, states.get(group.key)]]);
            const stateOf = node => {
                const pending = [];
                let current = node;
                while (!nodeStates.has(current)) { pending.push(current); current = current.parent; }
                while (pending.length > 0) {
                    const child = pending.pop();
                    nodeStates.set(child, nodeStates.get(child.parent)?.children.get(child.key));
                }
                return nodeStates.get(node);
            };
            const descriptors = projectCallTree(tree, {levels: displayFor(group.key) === "sql-paths" ? Infinity : levels,
                revealAll: displayFor(group.key) === "fully-expanded",
                isCollapsed: node => stateOf(node)?.collapsed === true,
                isExpanded: node => {
                    const state = stateOf(node);
                    return state?.collapsed === false ? 1 + Math.max(0, levels - (state.openedAtLevel ?? levels)) : 0;
                },
                isChainExpanded: node => stateOf(node)?.chainExpanded === true,
                isChainHidden: node => stateOf(node)?.chainExpanded === false});
            const containers = new Map([[null, list]]);
            for (const descriptor of descriptors) {
                const {node} = descriptor;
                const item = element("li", "call-tree-node");
                containers.get(descriptor.parent).append(item);
                if (descriptor.kind === "gap") {
                    const line = lineFor(node, "call-tree-gap-line");
                    line.dataset.virtualAnchor = `chain:${line.dataset.virtualAnchor}`;
                    if (descriptor.expanded) item.classList.add("call-tree-chain-open");
                    const count = descriptor.hidden.length;
                    const button = element("button", "call-tree-toggle call-tree-gap",
                        descriptor.expanded ? `▴ Hide ${count} ${count === 1 ? "call" : "calls"}` : "…");
                    button.type = "button";
                    button.setAttribute("aria-expanded", String(descriptor.expanded));
                    button.setAttribute("aria-label", `${descriptor.expanded ? "Hide" : "Show all"} ${count} intermediate method ${count === 1 ? "call" : "calls"}`);
                    button.title = `${descriptor.expanded ? "Hide" : "Show"} intermediate calls:\n`
                        + descriptor.hidden.map(hidden => hidden.frame.full).join("\n");
                    button.addEventListener("click", () => {
                        let state = stateAt(stateFor(group.key), descriptor.hidden[0]);
                        descriptor.hidden.forEach((hidden, index) => {
                            if (index > 0) {
                                if (!state.children.has(hidden.key)) state.children.set(hidden.key, {children: new Map(), sql: new Map()});
                                state = state.children.get(hidden.key);
                            }
                            state.chainExpanded = !descriptor.expanded;
                        });
                        changed(group.key, line.dataset.virtualAnchor);
                    });
                    line.append(button);
                    makeRowClickable(line, button);
                    item.append(line);
                } else if (node.kind === "sql") {
                    renderQuery(group, node, stateOf(node.parent), item, highlightTargets, hiddenByNode.get(node));
                    continue;
                } else {
                    const open = !descriptor.collapsed && !descriptor.frontier;
                    const line = lineFor(node);
                    const button = element("button", "call-tree-toggle call-tree-frame");
                    button.type = "button";
                    button.title = node.frame.full;
                    button.setAttribute("aria-expanded", String(open));
                    button.append(arrow(open), element("span", "call-tree-method", node.frame.label));
                    if (node.frame.location) button.append(element("span", "call-tree-source", node.frame.location));
                    button.addEventListener("click", () => {
                        const state = stateAt(stateFor(group.key), node);
                        state.collapsed = open;
                        if (!open) state.openedAtLevel = levels;
                        changed(group.key, line.dataset.virtualAnchor);
                    });
                    line.append(button);
                    line.append(nodeCounterBadge(node, group, hiddenByNode.get(node)));
                    makeRowClickable(line, button);
                    item.append(line);
                }
                const children = element("ul", "call-tree-children");
                item.append(children);
                containers.set(descriptor, children);
            }
        }
        // These references live only on mounted rows, never in the model cache.
        // The virtualizer can find a visible call path without scanning SQL DOM.
        row.virtualAnchors = [...row.querySelectorAll("[data-virtual-anchor]")];
        row.virtualAnchorsByKey = new Map(row.virtualAnchors.map(line => [line.dataset.virtualAnchor, line]));
        row.queryAnchorsByKey = new Map();
        const lines = new Map(row.virtualAnchors.map(line => [line.queryNode, line]));
        const pending = queryTree == null ? [] : [[queryTree, rootLine]];
        while (pending.length > 0) {
            const [node, ancestor] = pending.pop();
            const line = lines.get(node) ?? ancestor;
            if (node.kind === "sql") {
                for (const query of node.queryRows) row.queryAnchorsByKey.set(sourceQueryKey(query), line);
            } else {
                for (const child of node.children) pending.push([child, line]);
            }
        }
        refreshHighlights(group.key, row);
        rememberRow(group, row);
        target.append(row);
    }
    function renderQuery(group, node, state, target, highlightTargets, visibility) {
        const key = group.key;
        const line = lineFor(node, `call-tree-query${node.hasIssue ? " call-tree-query-repeated" : ""}`);
        line.queryAnchorKey = sourceQueryKey(node.queryRows[0]);
        if (highlights != null) highlightTargets.push({element: line, node});
        const count = nodeCounterBadge(node, group, visibility);
        line.append(count);
        const value = formatSql(node.query);
        const expandable = value.summary !== value.full;
        const expanded = state?.sql.get(node.query) ?? (displayFor(group.key) === "fully-expanded");
        const sql = element(expandable ? "button" : "code", "call-tree-sql");
        renderSql(sql, (expanded ? value.full : value.summary) || "(empty SQL)");
        if (expandable) {
            sql.type = "button";
            sql.setAttribute("aria-expanded", String(expanded));
            sql.title = expanded ? "Show shortened SQL" : "Show full SQL";
            sql.addEventListener("click", () => {
                stateAt(stateFor(key), node.parent).sql.set(node.query, !expanded);
                changed(key, line.dataset.virtualAnchor);
            });
        }
        line.append(sql);
        if (expandable) makeRowClickable(line, sql);
        target.append(line);
    }

    return {
        beginTour() {
            const saved = {states, view, display, levels, levelDraftChanged, levelDraftValue, input: levelInput.value};
            temporary = true;
            states = new Map();
            const reset = ({view: nextView = "tree", display: nextDisplay = "sql-paths"} = {}) => {
                states.clear();
                view = nextView;
                display = nextDisplay;
                revision++;
                clearRows();
                appliedView = null;
            };
            reset();
            return {reset, restore() {
                temporary = false;
                ({states, view, display, levels, levelDraftChanged, levelDraftValue} = saved);
                levelInput.value = saved.input;
                revision++;
                clearRows();
                appliedView = null;
            }};
        },
        setGroupDisplay(key, mode) {
            if (!MODES.has(mode)) return;
            const version=(states.get(key)?.version ?? 0)+1;
            states.set(key,{version,display:mode,collapsed:mode==='collapsed',children:new Map(),sql:new Map()});
            forgetRow(key);
            onChange();
        },
        isActive: () => view === "tree",
        isChart: () => view === "chart",
        select,
        version: rowVersion,
        estimateHeight: (key, queryCount) => collapsed(key) ? 70 : 90 + queryCount * (displayFor(key) === "fully-expanded" ? 280 : 180),
        render,
        applyPresentation() {
            updateControls();
            if (view === appliedView) return;
            appliedView = view;
            const active = view === "tree";
            table.classList.toggle("tree-view", active);
            table.setAttribute("aria-label", active ? "SQL call paths by request" : "SQL queries by request");
            headingText.textContent = active ? requestText("Request / stack trace / SQL") : originalHeading;
            headers[0].colSpan = active ? 5 : 1;
            headers[0].hidden = false;
            table.querySelector("colgroup col").hidden = false;
            headers.slice(1).forEach(header => { header.hidden = active; });
            table.dispatchEvent(new Event("column-visibility-change"));
            tableControls.hidden = view !== "table";
            document.getElementById("query-sort-controls").hidden = view !== "table";
            treeControls.hidden = !active;
            for (const [button, selected] of [[tableButton, view === "table"], [treeButton, active], [chartButton, view === "chart"]]) {
                button.classList.toggle("filter-button-active", selected);
                button.setAttribute("aria-pressed", String(selected));
            }
        },
        clear() {
            states.clear();
            clearRows();
            cache.clear();
            revision++;
        },
        forget(key) { states.delete(key); forgetRow(key); }
    };
}

function makeRowClickable(line, button) {
    line.classList.add("call-tree-clickable");
    line.addEventListener("click", event => {
        if (event.target.closest("button, a, input, select, textarea") || window.getSelection()?.toString()) return;
        button.click();
    });
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function normalizedQueryCount(value) {
    const count = Number(value ?? 1);
    return Number.isFinite(count) && count >= 0 ? count : 1;
}

function arrow(open) {
    const node = element("span", "call-tree-arrow", open ? "▾" : "▸");
    node.setAttribute("aria-hidden", "true");
    return node;
}
