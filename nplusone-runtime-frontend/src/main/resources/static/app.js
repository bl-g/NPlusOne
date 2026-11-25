import {installSourceLinks} from "./source-links.js?v=3225721666910883229";
import {createRowUpsertBuffer} from "./row-upsert-buffer.js?v=48697640598578990339980029898412325707";
import {requestText} from "./request-terminology.js?v=9195521797058750261190268690836445467";
import {createQuerySortingControl} from "./query-sorting.js?v=331865085574760660467463706444257593837";
import {createOperationActions} from "./operation-actions.js?v=2026630561593422880079378453098791590";
import {installProductTour} from "./product-tour.js?v=7154431140683941191";
import {createDashboardTour} from "./tour-demo.js?v=2677142467159368221";
import {createBarChart} from "./bar-chart.js?v=3217954903162854494";
import {installToolbarIcons, setButtonIcon} from "./toolbar-icons.js?v=17145807429823737765";
import {
    readStoredJson,
    readStoredValue,
    removeStoredValue,
    writeStoredJson,
    writeStoredValue
} from "./browser-storage.js?v=290084059958384501112687013092675042027";
import {
    formatSql,
    renderHighlightedSql
} from "./sql-formatting.js?v=107542635421253244738066243612958793875";
import {formatStackTrace, renderStackTrace} from "./stack-trace-formatting.js?v=15917135791185664092";
import {createFormattingCache} from "./formatting-cache.js?v=184586239211110810468916259075050871850";
import {createVirtualTable} from "./virtual-table.js?v=188564036130668086952254147403045028520";
import {createCallTreeView} from "./call-tree.js?v=7506377582797213436";
import {sameCallQueries, sourceQueryKey} from "./call-tree-model.js?v=80209571130848559522647497809978973720";
import {formatTableRequestSummary as formatRequestSummary, formatTableSqlSummary as formatSqlQuerySummary, renderTimingSummary} from "./request-summary.js?v=10676067850012756965";
import {summarizeVisibleQueries, sameQueryVisibility, appendFilterIndicator} from "./query-visibility.js?v=4201511681777436599";
import {createLiveRowHighlights} from "./live-row-highlights.js?v=35176247045154739923212879942153530965";
import {connectToTelemetryStream} from "./telemetry-stream.js?v=259228128537230349160352378558742048132";
import {enableColumnResizing} from "./column-resizing.js?v=38730878206859953153070508903709775062";
import {createExclusionFilters} from "./exclusion-filters.js?v=3498642694095001338";
import {
    sortByNewestTimestamp,
    formatDuration, formatDateTimestamp
} from "./time-formatting.js?v=182362643655531027511278026245356837010";

installToolbarIcons();

const tableBody = document.getElementById("rows");
const connectionStatus = document.getElementById("connection-status");
const showAllButton = document.getElementById("show-all");
const showServerOperationsButton = document.getElementById("show-server-operations");
const showNPlusOneOperationsButton = document.getElementById("show-n-plus-one-operations");
const allOperationCount = document.getElementById("all-operation-count");
const serverOperationCountElement = document.getElementById("server-operation-count");
const nPlusOneOperationCount = document.getElementById("n-plus-one-operation-count");
const clearRowsButton = document.getElementById("clear-rows");
const expandGroupsButton = document.getElementById("expand-groups");
const fullyExpandGroupsButton = document.getElementById("fully-expand-groups");
const collapseGroupsButton = document.getElementById("collapse-groups");
const toggleLiveUpdatesButton = document.getElementById("toggle-live-updates");
const pendingUpdateCount = document.getElementById("pending-update-count");
const queryTable = document.getElementById("query-table");
const tableScroll = queryTable.parentElement;

const ALL_OPERATIONS_FILTER = "all";
const SERVER_OPERATIONS_FILTER = "server-operations";
const N_PLUS_ONE_OPERATIONS_FILTER = "n-plus-one";
const OPERATION_FILTER_STORAGE_KEY = "nplusone.operation-filter";
const PAUSED_LIVE_UPDATES_STORAGE_KEY = "nplusone.paused-row-upserts.v4";
const GROUPS_DISPLAY_STORAGE_KEY = "nplusone.row-groups-display";
const EXPANDED_GROUPS_DISPLAY = "expanded";
const FULLY_EXPANDED_GROUPS_DISPLAY = "fully-expanded";
const COLLAPSED_GROUPS_DISPLAY = "collapsed";
const LIVE_UPDATE_INTERVAL_MS = 100;
const cachedFormatSql = createFormattingCache(formatSql);
const cachedFormatStackTrace = createFormattingCache(formatStackTrace);
const liveHighlights = createLiveRowHighlights();

const EMPTY_STATE_MESSAGES = Object.freeze([
    "Currently displaying zero reasons to blame the ORM.",
    "We haven't received any SQL queries yet. Are you sure your application uses a database?",
    "This may be a good moment to add 'no N+1 issues' to your CLAUDE.md.",
]);

let restoredLiveUpdatesSession = readPausedLiveUpdatesSession();
let serverRowsById = new Map(
        (restoredLiveUpdatesSession?.serverRows ?? [])
                .map(serverRow => [serverRow.id, serverRow]));
let unassociatedRowsById = new Map(
        (restoredLiveUpdatesSession?.unassociatedRows ?? [])
                .map(unassociatedRow => [unassociatedRow.id, unassociatedRow]));
const hiddenServerRowIds = new Set(restoredLiveUpdatesSession?.hiddenServerRowIds ?? []);
const hiddenUnassociatedRowIds = new Set(restoredLiveUpdatesSession?.hiddenUnassociatedRowIds ?? []);
const collapsedRowGroupKeys = new Set();
const knownRowGroupKeys = new Set();
const expandedCellStates = new Map();
const pendingRowUpserts = createRowUpsertBuffer(restoredLiveUpdatesSession?.pendingRowUpserts ?? []);
const projectedGroups = new Map();
const renderedGroups = new Map();
let nPlusOneViews = new WeakMap();
let longestQueryViews = new WeakMap();
const nPlusOneIssues = new WeakMap();
let filterRevision = 0;
let displayRevision = 0;
let liveRenderTimer = null;
let pausedControlTimer = null;
let pausedPersistenceTimer = null;
let markerLayoutFrame = null;
let markerTableSize = null;

let activeOperationFilter = readOperationFilter();
let groupsDisplay = readGroupsDisplay();
let groupTableDisplays = new Map();
let liveUpdatesPaused = restoredLiveUpdatesSession != null;
restoredLiveUpdatesSession = null;
for (const id of hiddenServerRowIds) serverRowsById.delete(id);
for (const id of hiddenUnassociatedRowIds) unassociatedRowsById.delete(id);
let dashboardTour = null;
const tourPendingRowUpserts = createRowUpsertBuffer();
const emptyStateMessage = selectEmptyStateMessage();
let exclusionFilters = createExclusionFilters(document.getElementById("exclusion-filters"), () => {
    nPlusOneViews = new WeakMap();
    longestQueryViews = new WeakMap();
    filterRevision++;
    render();
});
const querySorting = createQuerySortingControl(() => {
    displayRevision++;
    render();
});
const treeView = createCallTreeView({table: queryTable,
    onBeforeViewChange: (previous, next) => {
        if (previous !== 'chart' && next !== 'chart') virtualTable.preserveVisibleQuery();
    }, onOperationClick: (anchor, name) => operationActions.open(anchor, name), formatSql: cachedFormatSql,
    renderSql: renderHighlightedSql, onChange: render, highlights: liveHighlights, showTimestamps: false});

const barChart = createBarChart({table: queryTable, treeView, getSearchAction: name => exclusionFilters.operationSearchAction(name), onSearchOperation: name => operationActions.search(name), onChange: render, live: true});

function requestGroupActions(target) {
    const key=target.closest('tr[data-row-group-key]')?.dataset.rowGroupKey;
    if (!key) return [];
    if (treeView.isActive()) return [['Expand full','fully-expanded'],['Expand to SQLs','sql-paths'],['Collapse','collapsed']]
        .map(([label,mode])=>({label,apply:()=>treeView.setGroupDisplay(key,mode)}));
    return [['Expand fully','fully-expanded'],['Expand','expanded'],['Collapse','collapsed']]
        .map(([label,mode])=>({label,apply:()=>setRequestGroupDisplay(key,mode)}));
}
function setRequestGroupDisplay(key, mode) {
    groupTableDisplays.set(key,mode);
    for(const cellKey of expandedCellStates.keys())if(cellKey.startsWith(key+':'))expandedCellStates.delete(cellKey);
    knownRowGroupKeys.add(key);
    if(mode==='collapsed')collapsedRowGroupKeys.add(key);else collapsedRowGroupKeys.delete(key);
    displayRevision++;
    render();
}
const operationActions = createOperationActions({
    getGroupActions: requestGroupActions,
    getSearchAction: name => exclusionFilters.operationSearchAction(name),
    onSearch(name) {
        const result = exclusionFilters.searchOperation(name);
        if (result.ok) { barChart.clearFocus(); setOperationFilter(ALL_OPERATIONS_FILTER); }
        return result;
    },
    onViewFilters: () => exclusionFilters.open()
});

const virtualTable = createVirtualTable({
    table: queryTable, scroller: tableScroll, body: tableBody,
    keyOf: group => group.groupKey,
    layoutOf: group => treeView.isActive() ? `tree:${treeView.version(group.groupKey)}:${group.queryRows.length}`
        : `table:${displayRevision}:${collapsedRowGroupKeys.has(group.groupKey)}:${group.queryRows.length}`,
    rowCountOf: group => treeView.isActive() || collapsedRowGroupKeys.has(group.groupKey) ? 1 : group.queryRows.length,
    weightOf: group => treeView.isActive() ? group.queryRows.length * 8
        : collapsedRowGroupKeys.has(group.groupKey) ? 1 : group.queryRows.length,
    estimateHeight: group => treeView.isActive() ? treeView.estimateHeight(group.groupKey, group.queryRows.length)
        : collapsedRowGroupKeys.has(group.groupKey) ? 70
        : group.queryRows.length * (groupsDisplay === FULLY_EXPANDED_GROUPS_DISPLAY ? 220 : 85),
    renderWindow: reconcileRowGroups,
    onLayout: scheduleNPlusOneMarkerLayout
});
enableColumnResizing(queryTable, () => {
    virtualTable.invalidate();
    scheduleNPlusOneMarkerLayout();
});
new ResizeObserver(() => {
    const size = queryTable.getBoundingClientRect();
    if (markerTableSize == null || size.width !== markerTableSize.width || size.height !== markerTableSize.height) {
        scheduleNPlusOneMarkerLayout();
    }
}).observe(queryTable);
window.addEventListener("pagehide", () => {
    if (liveUpdatesPaused) { persistPausedLiveUpdatesSession(); flushPausedControls(); }
});

showAllButton.addEventListener("click", () => setOperationFilter(ALL_OPERATIONS_FILTER));
showServerOperationsButton?.addEventListener("click", () => setOperationFilter(SERVER_OPERATIONS_FILTER));
showNPlusOneOperationsButton.addEventListener("click", () => setOperationFilter(N_PLUS_ONE_OPERATIONS_FILTER));

clearRowsButton.addEventListener("click", () => {
    barChart.clearFocus();
    const filtered = exclusionFilters.apply(visibleServerRows(), visibleUnassociatedRows());
    for (const id of filtered.serverRows.map(row => row.id)) {
        hiddenServerRowIds.add(id);
        serverRowsById.delete(id);
        pendingRowUpserts.deleteServer(id);
    }
    for (const id of filtered.unassociatedRows.map(row => row.id)) {
        hiddenUnassociatedRowIds.add(id);
        unassociatedRowsById.delete(id);
        pendingRowUpserts.deleteUnassociated(id);
    }

    collapsedRowGroupKeys.clear();
    knownRowGroupKeys.clear();
    expandedCellStates.clear();
    liveHighlights.clear();
    groupTableDisplays.clear();
    treeView.clear();
    persistPausedLiveUpdatesSession();
    updateLiveUpdatesControl();
    render();
});

expandGroupsButton.addEventListener("click", () => setGroupsDisplay(EXPANDED_GROUPS_DISPLAY));
fullyExpandGroupsButton.addEventListener("click", () => setGroupsDisplay(FULLY_EXPANDED_GROUPS_DISPLAY));
collapseGroupsButton.addEventListener("click", () => setGroupsDisplay(COLLAPSED_GROUPS_DISPLAY));

toggleLiveUpdatesButton.addEventListener("click", () => {
    if (liveUpdatesPaused) {
        resumeLiveUpdates();
    } else {
        pauseLiveUpdates();
    }
});

connectToTelemetryStream({
    url: window.nPlusOneDetectorStreamUrl,
    onStatusChanged: updateConnectionStatus,
    onRowUpserts: handleRowUpserts
});
updateLiveUpdatesControl();
render();
installProductTour({beginDemo: rows => {

    const saved = {serverRowsById, unassociatedRowsById, exclusionFilters, activeOperationFilter, groupsDisplay, groupTableDisplays,
        expanded: new Map(expandedCellStates), collapsed: new Set(collapsedRowGroupKeys), known: new Set(knownRowGroupKeys)};
    serverRowsById = new Map(); unassociatedRowsById = new Map();
    activeOperationFilter = ALL_OPERATIONS_FILTER; groupsDisplay = EXPANDED_GROUPS_DISPLAY; groupTableDisplays = new Map();
    const session = createDashboardTour({rows, table: queryTable, treeView, barChart, virtualTable, querySorting,
        createFilters: container => (exclusionFilters = createExclusionFilters(container, () => {
            nPlusOneViews = new WeakMap(); longestQueryViews = new WeakMap(); filterRevision++;
            render();
        }, {temporary: true})),
        setRows(nextRows) {
            serverRowsById.clear(); unassociatedRowsById.clear();
            applyRowUpserts({serverRowUpserts: nextRows, unassociatedRowUpserts: []}); projectedGroups.clear();
        },
        renderDashboard: render,
        setTableDisplay: setGroupsDisplay,
        restoreData() {
            ({serverRowsById, unassociatedRowsById, exclusionFilters, activeOperationFilter, groupsDisplay, groupTableDisplays} = saved);
            expandedCellStates.clear(); saved.expanded.forEach((value, key) => expandedCellStates.set(key, value));
            collapsedRowGroupKeys.clear(); saved.collapsed.forEach(key => collapsedRowGroupKeys.add(key));
            knownRowGroupKeys.clear(); saved.known.forEach(key => knownRowGroupKeys.add(key)); projectedGroups.clear(); nPlusOneViews = new WeakMap(); longestQueryViews = new WeakMap();
            renderedGroups.clear(); tableBody.replaceChildren(); displayRevision++;
        }
    });
    dashboardTour = session;
    return {...session, close() {
        session.restore(); dashboardTour = null;
        handleRowUpserts(tourPendingRowUpserts.drain());
        render(); session.restorePosition();
    }};
}});

function updateConnectionStatus(status) {
    const statusByState = {
        connecting: ["Connecting…", "status status-connecting"],
        connected: ["Connected", "status status-connected"],
        reconnecting: ["Reconnecting…", "status status-disconnected"]
    };
    const [text, className] = statusByState[status];
    connectionStatus.textContent = text;
    connectionStatus.className = className;
}

function handleRowUpserts(rowUpserts) {
    if (dashboardTour) { tourPendingRowUpserts.add(rowUpserts); return; }
    if (liveUpdatesPaused) {
        pendingRowUpserts.add({
            serverRowUpserts: (rowUpserts.serverRowUpserts ?? []).filter(row => !hiddenServerRowIds.has(row.id)),
            unassociatedRowUpserts: (rowUpserts.unassociatedRowUpserts ?? []).filter(row => !hiddenUnassociatedRowIds.has(row.id))
        });

        if (pausedPersistenceTimer == null) pausedPersistenceTimer = setTimeout(persistPausedLiveUpdatesSession, 1000);
        if (pausedControlTimer == null) pausedControlTimer = setTimeout(flushPausedControls, LIVE_UPDATE_INTERVAL_MS);
        return;
    }

    // Updating the maps immediately also coalesces repeated IDs before drawing.
    // Explicit actions such as Clear or Pause still see every received update.
    applyRowUpserts(rowUpserts);
    if (liveRenderTimer == null) liveRenderTimer = setTimeout(render, LIVE_UPDATE_INTERVAL_MS);
}

function flushPausedControls() {
    clearTimeout(pausedControlTimer);
    pausedControlTimer = null;
    updateLiveUpdatesControl();
}

function applyRowUpserts(rowUpserts) {
    for (const serverRow of rowUpserts.serverRowUpserts ?? []) {
        if (hiddenServerRowIds.has(serverRow.id)) continue;
        const previous = serverRowsById.get(serverRow.id);
        if (serverRow.sqlRows?.length > 0) {
            liveHighlights.observe(serverRowGroupKey(serverRow), previous?.sqlRows?.length > 0
                ? highlightQueries(previous) : null, highlightQueries(serverRow));
        }
        serverRowsById.set(serverRow.id, serverRow);
    }
    for (const unassociatedRow of rowUpserts.unassociatedRowUpserts ?? []) {
        if (hiddenUnassociatedRowIds.has(unassociatedRow.id)) continue;
        const previous = unassociatedRowsById.get(unassociatedRow.id);
        const queries = row => [{sqlText: row.query ?? "", stackTraceText: row.stackTrace ?? "", proxyFrames: row.proxyFrames}];
        liveHighlights.observe(unassociatedRowGroupKey(unassociatedRow), previous == null ? null : queries(previous), queries(unassociatedRow));
        unassociatedRowsById.set(unassociatedRow.id, unassociatedRow);
    }
}

function highlightQueries(serverRow) {
    return (serverRow.sqlRows ?? []).map(query => ({sqlText: query.query ?? "", stackTraceText: query.stackTrace ?? "", proxyFrames: query.proxyFrames}));
}

function pauseLiveUpdates() {
    if (liveRenderTimer != null) render();
    liveUpdatesPaused = true;
    persistPausedLiveUpdatesSession();
    updateLiveUpdatesControl();
}

function resumeLiveUpdates() {
    clearTimeout(pausedControlTimer);
    pausedControlTimer = null;
    liveUpdatesPaused = false;

    applyRowUpserts(pendingRowUpserts.drain());
    clearTimeout(pausedPersistenceTimer); pausedPersistenceTimer = null;
    removePausedLiveUpdatesSession();

    updateLiveUpdatesControl();
    render();
}

function updateLiveUpdatesControl() {
    const label = liveUpdatesPaused ? "Resume live updates" : "Pause live updates";
    setButtonIcon(toggleLiveUpdatesButton, liveUpdatesPaused ? 'play' : 'pause', {label, title: label});
    toggleLiveUpdatesButton.classList.toggle("live-updates-paused", liveUpdatesPaused);
    toggleLiveUpdatesButton.setAttribute("aria-pressed", String(liveUpdatesPaused));

    pendingUpdateCount.textContent = pendingRowUpserts.size === 1
            ? requestText("1 request pending")
            : requestText(`${pendingRowUpserts.size} requests pending`);
    pendingUpdateCount.hidden = !liveUpdatesPaused || pendingRowUpserts.size === 0;
}

function readPausedLiveUpdatesSession() {
    const parsedValue = readStoredJson(sessionStorage, PAUSED_LIVE_UPDATES_STORAGE_KEY);
    if (parsedValue == null) {
        return null;
    }

    return {
        serverRows: Array.isArray(parsedValue.serverRows) ? parsedValue.serverRows : [],
        unassociatedRows: Array.isArray(parsedValue.unassociatedRows) ? parsedValue.unassociatedRows : [],
        hiddenServerRowIds: Array.isArray(parsedValue.hiddenServerRowIds) ? parsedValue.hiddenServerRowIds : [],
        hiddenUnassociatedRowIds: Array.isArray(parsedValue.hiddenUnassociatedRowIds)
                ? parsedValue.hiddenUnassociatedRowIds
                : [],
        pendingRowUpserts: Array.isArray(parsedValue.pendingRowUpserts) ? parsedValue.pendingRowUpserts : []
    };
}

function persistPausedLiveUpdatesSession() {
    clearTimeout(pausedPersistenceTimer); pausedPersistenceTimer = null;
    if (!liveUpdatesPaused) {
        removePausedLiveUpdatesSession();
        return;
    }

    writeStoredJson(sessionStorage, PAUSED_LIVE_UPDATES_STORAGE_KEY, {
        serverRows: [...serverRowsById.values()],
        unassociatedRows: [...unassociatedRowsById.values()],
        hiddenServerRowIds: [...hiddenServerRowIds],
        hiddenUnassociatedRowIds: [...hiddenUnassociatedRowIds],
        pendingRowUpserts: [pendingRowUpserts.snapshot()]
    });
}

function removePausedLiveUpdatesSession() {
    removeStoredValue(sessionStorage, PAUSED_LIVE_UPDATES_STORAGE_KEY);
}

function visibleServerRows() {
    return [...serverRowsById.values()]
            .filter(row => !hiddenServerRowIds.has(row.id));
}

function visibleUnassociatedRows() {
    return [...unassociatedRowsById.values()]
            .filter(row => !hiddenUnassociatedRowIds.has(row.id));
}

function retainPresentKeys(keys, presentKeys) {
    for (const key of keys) {
        if (!presentKeys.has(key)) {
            keys.delete(key);
        }
    }
}

function serverRowGroupKey(serverRowOrId) {
    const id = typeof serverRowOrId === "string" ? serverRowOrId : serverRowOrId.id;
    return `server:${id}`;
}

function unassociatedRowGroupKey(unassociatedRowOrId) {
    const id = typeof unassociatedRowOrId === "string" ? unassociatedRowOrId : unassociatedRowOrId.id;
    return `unassociated:${id}`;
}

function render() {
    if (dashboardTour && !dashboardTour.rendering) { dashboardTour.render(); return; }
    clearTimeout(liveRenderTimer);
    liveRenderTimer = null;
    liveHighlights.beginRender();
    const {associatedRowGroups, unassociatedRowGroups, hiddenGroupCount, hiddenSqlRowCount} = projectRowGroups();
    exclusionFilters.updateSummary({hiddenGroupCount, hiddenSqlRowCount});
    const nPlusOneRowGroups = associatedRowGroups.filter(hasPotentialNPlusOneIssue);
    const allRowGroups = sortByNewestTimestamp([...associatedRowGroups, ...unassociatedRowGroups], group => group.groupStart ?? group.serverStart);
    const rowGroups = activeOperationFilter === SERVER_OPERATIONS_FILTER
            ? allRowGroups.filter(group => !group.unassociated).map(toLongestQueryRowGroup)
            : activeOperationFilter === N_PLUS_ONE_OPERATIONS_FILTER
                    ? allRowGroups.filter(group => !group.unassociated && hasPotentialNPlusOneIssue(group)).map(toNPlusOneRowGroup)
                    : allRowGroups.map(toLongestQueryRowGroup);

    updateToolbar(
            allRowGroups.length,
            associatedRowGroups.length,
            nPlusOneRowGroups.length,
            allRowGroups.length > 0);

    treeView.applyPresentation();
    virtualTable.setSuspended(barChart.isActive());
    barChart.update(rowGroups.map(group => ({key: group.groupKey, operation: group.serverOperation, unassociated: group.unassociated,
        start: group.serverStart ?? group.groupStart,
        sql: group.queryRows.reduce((sum, query) => sum + (query.sqlCount ?? 1), 0),
        issues: group.queryRows.filter(query => query.sqlCount > 1).length})),
        {renderEmpty: target => renderEmptyState(hiddenSqlRowCount > 0 || hiddenGroupCount > 0, target)});
    if (barChart.isActive()) return;
    const focused = barChart.filter(rowGroups.map(group => ({key: group.groupKey, group}))).map(item => item.group);
    virtualTable.update(focused);
    if (focused.length === 0) {
        renderEmptyState(hiddenSqlRowCount > 0 || hiddenGroupCount > 0);
    }
}

function projectRowGroups() {
    const servers = visibleServerRows();
    const unassociated = visibleUnassociatedRows();
    const needsProjection = (row, key) => {
        const entry = projectedGroups.get(key);
        return entry == null || entry.source !== row || entry.revision !== filterRevision;
    };
    const changedServers = servers.filter(row => needsProjection(row, serverRowGroupKey(row)));
    const changedUnassociated = unassociated.filter(row => needsProjection(row, unassociatedRowGroupKey(row)));
    if (changedServers.length || changedUnassociated.length) {
        // Compile and apply the current expression once for the whole changed batch.
        const filtered = exclusionFilters.apply(changedServers, changedUnassociated);
        const filteredServers = new Map(filtered.serverRows.map(row => [row.id, row]));
        const filteredUnassociated = new Map(filtered.unassociatedRows.map(row => [row.id, row]));
        const store = (source, key, row, unassociated) => {
            const candidate = row == null ? null : unassociated ? toUnassociatedRowGroup(row) : toServerRowGroup(row, source);
            const previous = projectedGroups.get(key)?.group;
            projectedGroups.set(key, {source, revision: filterRevision,
                group: sameRowGroup(previous, candidate) ? previous : candidate,
                hiddenGroupCount: row == null ? 1 : 0,
                hiddenSqlRowCount: unassociated ? row == null ? 1 : 0
                    : (source.sqlRows?.length ?? 0) - (row?.sqlRows?.length ?? 0)});
        };
        for (const row of changedServers) store(row, serverRowGroupKey(row), filteredServers.get(row.id), false);
        for (const row of changedUnassociated) store(row, unassociatedRowGroupKey(row), filteredUnassociated.get(row.id), true);
    }
    const presentKeys = new Set([...servers.map(serverRowGroupKey), ...unassociated.map(unassociatedRowGroupKey)]);
    for (const key of projectedGroups.keys()) if (!presentKeys.has(key)) projectedGroups.delete(key);
    const associatedRowGroups = [];
    const unassociatedRowGroups = [];
    let hiddenGroupCount = 0;
    let hiddenSqlRowCount = 0;
    for (const entry of projectedGroups.values()) {
        hiddenGroupCount += entry.hiddenGroupCount;
        hiddenSqlRowCount += entry.hiddenSqlRowCount;
        if (entry.group?.queryRows.length > 0) {
            (entry.group.unassociated ? unassociatedRowGroups : associatedRowGroups).push(entry.group);
        }
    }
    return {associatedRowGroups, unassociatedRowGroups, hiddenGroupCount, hiddenSqlRowCount};
}

function sameRowGroup(left, right) {
    if (left == null || right == null) return left === right;
    if (left.serverStart !== right.serverStart || left.serverDurationMillis !== right.serverDurationMillis
            || left.jdbcDurationMillis !== right.jdbcDurationMillis
            || !sameQueryVisibility(left.visibility, right.visibility)
            || left.serverOperation !== right.serverOperation || left.groupStart !== right.groupStart
            || left.queryRows.length !== right.queryRows.length) return false;
    return left.queryRows.every((query, index) => query.start === right.queryRows[index].start)
        && sameCallQueries(left.queryRows, right.queryRows)
        && sameCallQueries(left.allQueryRows ?? left.queryRows, right.allQueryRows ?? right.queryRows);
}

function reconcileRowGroups(rowGroups) {
    treeView.applyPresentation();
    const wanted = new Map(rowGroups.map(group => [group.groupKey, group]));
    let changed = false;
    for (const [key, entry] of renderedGroups) {
        if (entry.group !== wanted.get(key) || entry.collapsed !== collapsedRowGroupKeys.has(key)
                || entry.displayRevision !== displayRevision || entry.tree !== treeView.isActive()
                || entry.tree && entry.treeVersion !== treeView.version(key)) {
            for (const row of entry.rows) row.remove();
            renderedGroups.delete(key);
            changed = true;
        }
    }
    if (rowGroups.length > 0) tableBody.querySelector(".empty-state")?.closest("tr")?.remove();
    let cursor = tableBody.firstChild;
    if (cursor?.dataset?.virtualSpacer === "top") cursor = cursor.nextSibling;
    for (const group of rowGroups) {
        let entry = renderedGroups.get(group.groupKey);
        if (entry == null) {
            const fragment = document.createDocumentFragment();
            renderRowGroup(group, fragment);
            const rows = [...fragment.children];
            rows.forEach((row, index) => {
                row.dataset.rowGroupKey = group.groupKey;
                row.dataset.groupRowIndex = String(index);
            });
            entry = {group, rows, collapsed: collapsedRowGroupKeys.has(group.groupKey), displayRevision,
                tree: treeView.isActive(), treeVersion: treeView.version(group.groupKey)};
            renderedGroups.set(group.groupKey, entry);
            changed = true;
        }
        if (entry.rows[0] === cursor) {
            cursor = entry.rows.at(-1).nextSibling;
        } else {
            const fragment = document.createDocumentFragment();
            for (const row of entry.rows) fragment.append(row);
            tableBody.insertBefore(fragment, cursor);
            changed = true;
        }
    }
    return changed;
}

function renderEmptyState(hasExcludedRows, target = tableBody) {
    const row = document.createElement("tr");
    const cell = document.createElement(target === tableBody ? "td" : "div");
    cell.colSpan = 5;
    cell.className = "empty-state";

    if (hasExcludedRows) {
        cell.textContent = "No rows to show with the current filters. ";
        const reviewButton = document.createElement("button");
        reviewButton.type = "button";
        reviewButton.className = "reload-button";
        reviewButton.textContent = "Review filter";
        reviewButton.addEventListener("click", () => exclusionFilters.open());
        cell.append(reviewButton);
    } else if (activeOperationFilter === N_PLUS_ONE_OPERATIONS_FILTER) {
        cell.textContent = requestText("No requests with potential N+1 issues.");
    } else if (activeOperationFilter === SERVER_OPERATIONS_FILTER) {
        cell.textContent = requestText("No requests received yet.");
    } else {
        appendEmptyStateContent(cell);
    }

    if (target === tableBody) { row.append(cell); target.replaceChildren(row); }
    else target.replaceChildren(cell);
}

function appendEmptyStateContent(cell) {
    cell.textContent = emptyStateMessage;
}

function selectEmptyStateMessage() {
    return EMPTY_STATE_MESSAGES[Math.floor(Math.random() * EMPTY_STATE_MESSAGES.length)];
}

function hasPotentialNPlusOneIssue(rowGroup) {
    if (!nPlusOneIssues.has(rowGroup)) nPlusOneIssues.set(rowGroup, rowGroup.queryRows.some(queryRow => queryRow.sqlCount > 1));
    return nPlusOneIssues.get(rowGroup);
}

function toNPlusOneRowGroup(rowGroup) {
    if (!nPlusOneViews.has(rowGroup)) {
        const queryRows = exclusionFilters.limitQueries(rowGroup.queryRows.filter(queryRow => queryRow.sqlCount > 1));
        nPlusOneViews.set(rowGroup, {...rowGroup, queryRows,
            visibility: summarizeVisibleQueries(rowGroup.allQueryRows, queryRows, rowGroup.jdbcDurationMillis)});
    }
    return nPlusOneViews.get(rowGroup);
}

function toLongestQueryRowGroup(rowGroup) {
    if (rowGroup.unassociated) return rowGroup;
    if (!longestQueryViews.has(rowGroup)) {
        const queryRows = exclusionFilters.limitQueries(rowGroup.queryRows);
        longestQueryViews.set(rowGroup, queryRows === rowGroup.queryRows ? rowGroup : {...rowGroup, queryRows,
            visibility: summarizeVisibleQueries(rowGroup.allQueryRows, queryRows, rowGroup.jdbcDurationMillis)});
    }
    return longestQueryViews.get(rowGroup);
}

function updateToolbar(allCount, serverCount, nPlusOneCount, hasRows) {
    allOperationCount.textContent = allCount;
    if (serverOperationCountElement != null) serverOperationCountElement.textContent = serverCount;
    nPlusOneOperationCount.textContent = nPlusOneCount;
    clearRowsButton.disabled = !hasRows;
    updateRowGroupsDisplayControl();

    updateFilterButton(showAllButton, activeOperationFilter === ALL_OPERATIONS_FILTER);
    if (showServerOperationsButton != null) {
        updateFilterButton(showServerOperationsButton, activeOperationFilter === SERVER_OPERATIONS_FILTER);
    }
    updateFilterButton(showNPlusOneOperationsButton, activeOperationFilter === N_PLUS_ONE_OPERATIONS_FILTER);
}

function updateRowGroupsDisplayControl() {
    const rowGroupKeys = getCollapsibleRowGroupKeys();
    const presentRowGroupKeys = new Set(rowGroupKeys);
    retainPresentKeys(collapsedRowGroupKeys, presentRowGroupKeys);
    retainPresentKeys(knownRowGroupKeys, presentRowGroupKeys);

    for (const key of rowGroupKeys) {
        if (!knownRowGroupKeys.has(key)) {
            knownRowGroupKeys.add(key);
            if (groupsDisplay === COLLAPSED_GROUPS_DISPLAY) {
                collapsedRowGroupKeys.add(key);
            }
        }
    }

    updateFilterButton(expandGroupsButton, groupsDisplay === EXPANDED_GROUPS_DISPLAY);
    updateFilterButton(fullyExpandGroupsButton, groupsDisplay === FULLY_EXPANDED_GROUPS_DISPLAY);
    updateFilterButton(collapseGroupsButton, groupsDisplay === COLLAPSED_GROUPS_DISPLAY);
}

function setGroupsDisplay(display) {
    groupTableDisplays.clear();
    groupsDisplay = display;
    displayRevision++;
    expandedCellStates.clear();
    const collapsed = display === COLLAPSED_GROUPS_DISPLAY;

    for (const key of getCollapsibleRowGroupKeys()) {
        knownRowGroupKeys.add(key);
        if (collapsed) {
            collapsedRowGroupKeys.add(key);
        } else {
            collapsedRowGroupKeys.delete(key);
        }
    }

    writeStoredValue(sessionStorage, GROUPS_DISPLAY_STORAGE_KEY, display);
    render();
}

function readGroupsDisplay() {
    const storedDisplay = readStoredValue(sessionStorage, GROUPS_DISPLAY_STORAGE_KEY);
    return storedDisplay === COLLAPSED_GROUPS_DISPLAY || storedDisplay === FULLY_EXPANDED_GROUPS_DISPLAY
            ? storedDisplay
            : EXPANDED_GROUPS_DISPLAY;
}

function getCollapsibleRowGroupKeys() {
    const serverRowGroupKeys = visibleServerRows()
            .filter(serverRow => (serverRow.sqlRows ?? []).length > 0)
            .map(serverRowGroupKey);
    const unassociatedRowGroupKeys = visibleUnassociatedRows().map(unassociatedRowGroupKey);
    return [...serverRowGroupKeys, ...unassociatedRowGroupKeys];
}

function updateFilterButton(button, active) {
    button.classList.toggle("filter-button-active", active);
    button.setAttribute("aria-pressed", String(active));
}

function setOperationFilter(filter) {
    activeOperationFilter = filter;
    writeStoredValue(localStorage, OPERATION_FILTER_STORAGE_KEY, filter);
    render();
}

function readOperationFilter() {
    const storedFilter = readStoredValue(localStorage, OPERATION_FILTER_STORAGE_KEY);
    return (storedFilter === SERVER_OPERATIONS_FILTER && showServerOperationsButton != null && globalThis.nplusoneCallRequestsTasks === true)
            || storedFilter === N_PLUS_ONE_OPERATIONS_FILTER
            ? storedFilter
            : ALL_OPERATIONS_FILTER;
}

function toServerRowGroup(serverRow, source = serverRow) {
    const sqlRows = serverRow.sqlRows ?? [];
    return {
        serverStart: serverRow.start,
        serverDurationMillis: serverRow.durationMillis,
        jdbcDurationMillis: serverRow.jdbcDurationMillis,
        visibility: summarizeVisibleQueries(source.sqlRows ?? [], sqlRows, serverRow.jdbcDurationMillis),
        allQueryRows: (source.sqlRows ?? []).map(sqlRow => ({sqlCount: sqlRow.count,
            jdbcDurationMillis: sqlRow.jdbcDurationMillis, sqlText: sqlRow.query ?? "", stackTraceText: sqlRow.stackTrace ?? "", proxyFrames: sqlRow.proxyFrames})),
        serverOperation: serverRow.operation,
        serverRowId: serverRow.id,
        groupKey: serverRowGroupKey(serverRow),
        queryRows: sqlRows.map(sqlRow => ({
            start: sqlRow.start,
            sqlCount: sqlRow.count,
            jdbcDurationMillis: sqlRow.jdbcDurationMillis,
            sqlText: sqlRow.query ?? "",
            stackTraceText: sqlRow.stackTrace ?? "", proxyFrames: sqlRow.proxyFrames
        })),
        unassociated: false
    };
}

function toUnassociatedRowGroup(unassociatedRow) {
    return {
        serverStart: null,
        serverDurationMillis: null,
        jdbcDurationMillis: unassociatedRow.jdbcDurationMillis,
        serverOperation: "Unassociated",
        unassociatedRowId: unassociatedRow.id,
        groupKey: unassociatedRowGroupKey(unassociatedRow),
        groupStart: unassociatedRow.start,
        queryRows: [{
            sqlCount: 1,
            jdbcDurationMillis: unassociatedRow.jdbcDurationMillis,
            sqlText: unassociatedRow.query ?? "",
            stackTraceText: unassociatedRow.stackTrace ?? "", proxyFrames: unassociatedRow.proxyFrames
        }],
        unassociated: true
    };
}

function renderRowGroup(rowGroup, target) {
    if (treeView.isActive()) {
        treeView.render({key: rowGroup.groupKey, operation: rowGroup.serverOperation,
            start: rowGroup.serverStart, duration: rowGroup.serverDurationMillis,
            jdbcDurationMillis: rowGroup.jdbcDurationMillis,
            visibility: rowGroup.visibility, onFilterClick: () => exclusionFilters.open(),
            allQueryRows: rowGroup.allQueryRows,
            unassociated: rowGroup.unassociated, queryRows: rowGroup.queryRows,
            onDelete: () => hideRowGroup(rowGroup)}, target);
        return;
    }
    if (collapsedRowGroupKeys.has(rowGroup.groupKey)) {
        renderCollapsedRowGroup(rowGroup, target);
        return;
    }

    const rowCount = rowGroup.queryRows.length;
    const nPlusOneRows = [];
    let firstSummaryCell;
    querySorting.sort(rowGroup.queryRows).forEach((rowData, index) => {
        const row = document.createElement("tr");
        row.queryAnchorKey = sourceQueryKey(rowData);
        row.classList.add("request-row");
        if (index === 0) row.classList.add("request-group-start");
        if (index === rowCount - 1) row.classList.add("request-group-end");
        if (rowData.sqlCount > 1) row.classList.add("potential-n-plus-one");
        if (rowGroup.unassociated) row.classList.add("unassociated");

        if (index === 0) {
            appendSpanningCell(row, formatRequestStart(rowGroup.serverStart, rowGroup.serverDurationMillis), rowCount, "request-summary live-request-start");
            appendOperationCell(row, rowGroup, rowCount);
            firstSummaryCell = row.querySelector(".request-summary");
        }

        appendCell(row, rowData.sqlCount, "sql-count");
        appendSqlCell(row, cachedFormatSql(rowData.sqlText), rowGroup.groupKey,
            formatSqlQuerySummary(rowData.sqlCount, rowData.jdbcDurationMillis, rowGroup.jdbcDurationMillis));
        appendStackTraceCell(row, cachedFormatStackTrace(rowData.stackTraceText), rowGroup.groupKey);
        const startedAt = liveHighlights.queryStartedAt(rowGroup.groupKey, rowData.sqlText, rowData.stackTraceText);
        highlightTableRow(row, rowGroup, startedAt);
        target.append(row);
        if (rowData.sqlCount > 1) nPlusOneRows.push(row);
    });

    appendNPlusOneMarkers(firstSummaryCell, nPlusOneRows);
}

function highlightTableRow(row, rowGroup, queryStartedAt = null) {
    const groupStartedAt = liveHighlights.groupStartedAt(rowGroup.groupKey);
    if (groupStartedAt == null && queryStartedAt == null) return;
    for (const cell of row.cells) {
        liveHighlights.apply(cell, cell.classList.contains("request-summary")
            ? groupStartedAt : queryStartedAt ?? groupStartedAt);
    }
}

function appendNPlusOneMarkers(firstSummaryCell, nPlusOneRows) {
    for (const nPlusOneRow of nPlusOneRows) {
        const marker = document.createElement("span");
        marker.className = "n-plus-one-marker";
        marker.nPlusOneRow = nPlusOneRow;
        marker.groupStartRow = firstSummaryCell.parentElement;
        firstSummaryCell.append(marker);
    }
}

function scheduleNPlusOneMarkerLayout() {
    if (markerLayoutFrame != null) return;
    markerLayoutFrame = requestAnimationFrame(() => {
        markerLayoutFrame = null;
        layoutNPlusOneMarkers();
    });
}

function layoutNPlusOneMarkers() {
    const {width, height} = queryTable.getBoundingClientRect();
    markerTableSize = {width, height};
    const groupTops = new Map();
    const measurements = [...tableBody.querySelectorAll(".n-plus-one-marker")].map(marker => {
        if (!groupTops.has(marker.groupStartRow)) groupTops.set(marker.groupStartRow, marker.groupStartRow.offsetTop);
        return {marker, top: marker.nPlusOneRow.offsetTop - groupTops.get(marker.groupStartRow),
            height: marker.nPlusOneRow.offsetHeight};
    });
    // Read geometry for every marker before writing any styles.
    for (const {marker, top, height} of measurements) {
        const topValue = `${top}px`;
        const heightValue = `${height}px`;
        if (marker.style.top !== topValue) marker.style.top = topValue;
        if (marker.style.height !== heightValue) marker.style.height = heightValue;
    }
}

function renderCollapsedRowGroup(rowGroup, target) {
    const row = document.createElement("tr");
    const totalSqlCount = rowGroup.queryRows.reduce((total, queryRow) => total + queryRow.sqlCount, 0);
    const queryGroupCount = rowGroup.queryRows.length;

    row.classList.add("request-row", "request-group-start", "request-group-end", "collapsed-request-row");
    if (hasPotentialNPlusOneIssue(rowGroup)) row.classList.add("potential-n-plus-one");
    if (rowGroup.unassociated) row.classList.add("unassociated");

    appendSpanningCell(row, formatRequestStart(rowGroup.serverStart, rowGroup.serverDurationMillis), 1, "request-summary live-request-start");
    appendOperationCell(row, rowGroup, 1);
    appendCollapsedGroupExpansionCell(row, totalSqlCount, "sql-count", rowGroup);
    appendCollapsedGroupExpansionCell(
            row,
            `${queryGroupCount} SQL ${queryGroupCount === 1 ? "group" : "groups"} - expand to inspect`,
            "collapsed-query-summary",
            rowGroup);
    appendCollapsedGroupExpansionCell(row, "", "stack-trace", rowGroup);
    highlightTableRow(row, rowGroup);
    target.append(row);
    if (hasPotentialNPlusOneIssue(rowGroup)) {
        appendNPlusOneMarkers(row.querySelector(".request-summary"), [row]);
    }
}

function appendCollapsedGroupExpansionCell(row, value, className, rowGroup) {
    const cell = document.createElement("td");
    cell.textContent = value;
    cell.className = `${className} collapsed-group-expansion-cell`;
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", "Expand row group");
    cell.title = "Expand row group";

    const expand = () => {
        collapsedRowGroupKeys.delete(rowGroup.groupKey);
        render();
    };
    cell.addEventListener("click", expand);
    cell.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            expand();
        }
    });
    row.append(cell);
}

function appendOperationCell(row, rowGroup, rowSpan) {
    const cell = document.createElement("td");
    const operationHeader = document.createElement("div");
    const operation = document.createElement("button");
    const deleteButton = document.createElement("button");
    const rowLabel = document.createElement("div");
    const collapsed = collapsedRowGroupKeys.has(rowGroup.groupKey);
    const arrow = document.createElement("span");
    const operationName = document.createElement("button");

    cell.rowSpan = rowSpan;
    cell.className = "server-operation request-summary";
    arrow.className = "operation-toggle-arrow";
    arrow.textContent = collapsed ? "▸" : "▾";
    arrow.setAttribute("aria-hidden", "true");
    operationName.textContent = rowGroup.serverOperation ?? "";

    operation.type = "button";
    operation.className = "operation-toggle";
    operation.append(arrow);
    operationName.type = "button";
    operationName.className = "operation-name";
    operationName.disabled = rowGroup.unassociated || !rowGroup.serverOperation;
    operationName.setAttribute("aria-haspopup", "dialog");
    operationName.setAttribute("aria-expanded", "false");
    operationName.addEventListener("click", () => operationActions.open(operationName, rowGroup.serverOperation));
    operation.title = collapsed ? "Expand row group" : "Collapse row group";
    operation.setAttribute("aria-expanded", String(!collapsed));
    operation.addEventListener("click", () => {
        if (collapsed) {
            collapsedRowGroupKeys.delete(rowGroup.groupKey);
        } else {
            collapsedRowGroupKeys.add(rowGroup.groupKey);
        }
        render();
    });

    deleteButton.type = "button";
    deleteButton.className = "delete-query-group-button";
    deleteButton.textContent = "×";
    deleteButton.title = "Delete this row group";
    deleteButton.setAttribute("aria-label", `Delete ${rowGroup.serverOperation ?? "row"} group`);
    deleteButton.addEventListener("click", () => hideRowGroup(rowGroup));

    operationHeader.className = "operation-header";
    operationHeader.append(operation, operationName, deleteButton);
    rowLabel.className = "request-label";
    if (rowGroup.unassociated) {
        rowLabel.classList.add("request-timing-summary");
        renderTimingSummary(rowLabel, formatRequestSummary(0, 1, rowGroup.jdbcDurationMillis));
    } else {
        const issueCount = rowGroup.queryRows.filter(queryRow => queryRow.sqlCount > 1).length;
        rowLabel.classList.add("request-timing-summary");
        const queryCount = rowGroup.queryRows.reduce((total, queryRow) => total + queryRow.sqlCount, 0);
        renderTimingSummary(rowLabel, formatRequestSummary(issueCount, queryCount,
            rowGroup.visibility.jdbcDurationMillis, rowGroup.serverDurationMillis, rowGroup.visibility.totalQueryDurationMillis));
        appendFilterIndicator(rowLabel, rowGroup.visibility, () => exclusionFilters.open());
        if (issueCount > 0) rowLabel.classList.add("request-label-alert");
    }

    cell.append(operationHeader, rowLabel);
    row.append(cell);
}

function hideRowGroup(rowGroup) {
    if (rowGroup.unassociated) {
        hiddenUnassociatedRowIds.add(rowGroup.unassociatedRowId);
        unassociatedRowsById.delete(rowGroup.unassociatedRowId);
        pendingRowUpserts.deleteUnassociated(rowGroup.unassociatedRowId);
    } else {
        hiddenServerRowIds.add(rowGroup.serverRowId);
        serverRowsById.delete(rowGroup.serverRowId);
        pendingRowUpserts.deleteServer(rowGroup.serverRowId);
    }

    collapsedRowGroupKeys.delete(rowGroup.groupKey);
    knownRowGroupKeys.delete(rowGroup.groupKey);
    removeExpandedCellStates(rowGroup.groupKey);
    liveHighlights.forget(rowGroup.groupKey);
    treeView.forget(rowGroup.groupKey);
    persistPausedLiveUpdatesSession();
    updateLiveUpdatesControl();
    render();
}

function removeExpandedCellStates(rowGroupKey) {
    groupTableDisplays.delete(rowGroupKey);
    const prefix = `${rowGroupKey}:`;
    for (const key of expandedCellStates.keys()) {
        if (key.startsWith(prefix)) {
            expandedCellStates.delete(key);
        }
    }
}

function appendSpanningCell(row, value, rowSpan, className) {
    const cell = document.createElement("td");
    cell.rowSpan = rowSpan;
    cell.textContent = value ?? "";
    cell.className = className;

    row.append(cell);
}

function appendSqlCell(row, sql, rowGroupKey, summary = "") {
    appendExpandableCell(
            row,
            sql,
            "sql",
            "Click to show the full SQL",
            "Click to show the shortened SQL",
            (cell, value) => {
                renderHighlightedSql(cell, value);
                if (summary) {
                    const label = document.createElement("div");
                    label.className = "sql-timing-summary";
                    label.textContent = summary;
                    cell.append(label);
                }
            },
            expandedCellKey(rowGroupKey, "sql", sql), rowGroupKey);
}

function appendStackTraceCell(row, stackTrace, rowGroupKey) {
    appendExpandableCell(
            row,
            stackTrace,
            "stack-trace",
            "Click to show the full stack trace",
            "Click to show the shortened stack trace",
            renderStackTrace,
            expandedCellKey(rowGroupKey, "stack-trace", stackTrace), rowGroupKey);
}

function expandedCellKey(rowGroupKey, type, value) {
    return `${rowGroupKey}:${type}:${value.full}`;
}

function appendExpandableCell(
        row,
        value,
        className,
        expandTitle,
        collapseTitle,
        renderValue = renderPlainText,
        cellKey = null, rowGroupKey = null) {
    const cell = document.createElement("td");
    const canExpand = value.summary !== value.full;
    let expanded = cellKey != null && expandedCellStates.has(cellKey)
            ? expandedCellStates.get(cellKey)
            : (groupTableDisplays.get(rowGroupKey) ?? groupsDisplay) === FULLY_EXPANDED_GROUPS_DISPLAY;

    cell.className = className;
    renderValue(cell, expanded ? value.full : value.summary);

    if (canExpand) {
        cell.classList.add("expandable-cell");
        cell.tabIndex = 0;
        cell.setAttribute("role", "button");
        cell.setAttribute("aria-expanded", String(expanded));
        cell.title = expanded ? collapseTitle : expandTitle;

        const toggle = () => {
            expanded = !expanded;
            expandedCellStates.set(cellKey, expanded);
            renderValue(cell, expanded ? value.full : value.summary);
            cell.setAttribute("aria-expanded", String(expanded));
            cell.title = expanded ? collapseTitle : expandTitle;
            virtualTable.refresh();
            scheduleNPlusOneMarkerLayout();
        };
        cell.addEventListener("click", toggle);
        cell.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle();
            }
        });
    }

    row.append(cell);
}

function renderPlainText(element, value) {
    element.textContent = value;
}

function appendCell(row, value, className) {
    const cell = document.createElement("td");
    cell.textContent = value ?? "";
    if (className) cell.className = className;
    row.append(cell);
}

function formatRequestStart(start, duration) {
    const timestamp = formatDateTimestamp(start);
    const elapsed = formatDuration(duration);
    return timestamp + (elapsed ? ` (${elapsed})` : "");
}

installSourceLinks({onChange: () => { displayRevision++; virtualTable.invalidate(); render(); }});
