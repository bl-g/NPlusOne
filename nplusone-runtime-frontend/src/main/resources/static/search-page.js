import {configureDateRange} from "./date-range.js?v=70512685574943983513608468539075838973";
import {sourceQueryKey} from "./call-tree-model.js?v=80209571130848559522647497809978973720";
import {createQuerySortingControl} from "./query-sorting.js?v=331865085574760660467463706444257593837";
import {createOperationActions} from "./operation-actions.js?v=2026630561593422880079378453098791590";
import {installProductTour} from "./product-tour.js?v=639309646489438745";
import {createDashboardTour} from "./tour-demo.js?v=161640648605462232010686436423946570878";
import {createBarChart} from "./bar-chart.js?v=15771656724146708703514070823952310359";
import {installToolbarIcons, setButtonIcon} from "./toolbar-icons.js?v=7402158213721210528724430729032752313";
import {
    readStoredValue,
    writeStoredValue
} from "./browser-storage.js?v=290084059958384501112687013092675042027";
import {
    formatSql,
    renderHighlightedSql
} from "./sql-formatting.js?v=107542635421253244738066243612958793875";
import {formatStackTrace, renderStackTrace} from "./stack-trace-formatting.js?v=264878800354523343799797824770822757423";
import {createFormattingCache} from "./formatting-cache.js?v=184586239211110810468916259075050871850";
import {createVirtualTable} from "./virtual-table.js?v=188564036130668086952254147403045028520";
import {createCallTreeView} from "./call-tree.js?v=332338832162984972757566277031374814269";
import {formatTableRequestSummary as formatRequestSummary, formatTableSqlSummary as formatSqlQuerySummary} from "./request-summary.js?v=279709107265595431799678358316915282079";
import {summarizeVisibleQueries, sameQueryVisibility, appendFilterIndicator} from "./query-visibility.js?v=309269865418407453266603283734342634673";
import {enableColumnResizing} from "./column-resizing.js?v=38730878206859953153070508903709775062";
import {createExclusionFilters} from "./exclusion-filters.js?v=86251318403235265372531489495894345426";
import {
    sortByNewestTimestamp,
    formatDuration,
    formatDateTimestamp as formatTimestamp
} from "./time-formatting.js?v=182362643655531027511278026245356837010";

installToolbarIcons();

const PAGE_SIZE = 50;
const PREFETCH_REMAINING_ROWS = 25;
const PREFETCH_SCROLL_MARGIN_PIXELS = 300;
const ALL_OPERATIONS_FILTER = "all";
const SERVER_OPERATIONS_FILTER = "server-operations";
const N_PLUS_ONE_OPERATIONS_FILTER = "n-plus-one";
const SERVER_ROW_TYPE = "SERVER";
const UNASSOCIATED_ROW_TYPE = "UNASSOCIATED";
const GROUPS_DISPLAY_STORAGE_KEY = "nplusone.row-groups-display";
const EXPANDED_GROUPS_DISPLAY = "expanded";
const FULLY_EXPANDED_GROUPS_DISPLAY = "fully-expanded";
const COLLAPSED_GROUPS_DISPLAY = "collapsed";

const tableBody = document.getElementById("rows");
const tableScroll = document.getElementById("table-scroll");
const searchErrorNotice = document.createElement('div');
searchErrorNotice.className = 'search-error-notice';
searchErrorNotice.setAttribute('role', 'alert');
searchErrorNotice.hidden = true;
const searchErrorMessage = document.createElement('span');
const retrySearch = document.createElement('button');
retrySearch.type = 'button';
retrySearch.className = 'reload-button';
retrySearch.textContent = 'Retry';
retrySearch.addEventListener('click', () => {
    if (serverRowsById.size + unassociatedRowsById.size === 0) { search(); return; }
    searchError = null;
    render();
    preloadNextPage(searchGeneration);
});
searchErrorNotice.append(searchErrorMessage, retrySearch);
tableScroll.before(searchErrorNotice);
const startDateInput = document.getElementById("start-date");
const endDateInput = document.getElementById("end-date");
const validateDates = configureDateRange(startDateInput, endDateInput);
const searchButton = document.getElementById("search");
const loadAllButton = document.getElementById("load-all");
const searchStatus = document.getElementById("search-status");
const showAllButton = document.getElementById("show-all");
const showServerOperationsButton = document.getElementById("show-server-operations");
const showNPlusOneOperationsButton = document.getElementById("show-n-plus-one-operations");
const allOperationCount = document.getElementById("all-operation-count");
const serverOperationCount = document.getElementById("server-operation-count");
const nPlusOneOperationCount = document.getElementById("n-plus-one-operation-count");
const expandGroupsButton = document.getElementById("expand-groups");
const fullyExpandGroupsButton = document.getElementById("fully-expand-groups");
const collapseGroupsButton = document.getElementById("collapse-groups");
const queryTable = document.getElementById("query-table");

let serverRowsById = new Map();
let unassociatedRowsById = new Map();
const collapsedRowIds = new Set();
const renderedGroups = new Map();
const expandedCellStates = new Map();
const cachedFormatSql = createFormattingCache(formatSql);
const cachedFormatStackTrace = createFormattingCache(formatStackTrace);
let displayRevision = 0;
let markerLayoutFrame = null;
let markerTableSize = null;
let activeOperationFilter = ALL_OPERATIONS_FILTER;
let groupsDisplay = readGroupsDisplay();
let groupTableDisplays = new Map();
let nextCursor = null;
let bufferedPage = null;
let searchGeneration = 0;
let abortController = null;
let prefetchPromise = null;
let sentinelObserver = null;
let searchPerformed = false;
let searchLoading = false;
let searchError = null;
let chartPageLoading = false;
let loadingAll = false;
let loadAllRun = 0;
let searchDates = {start: "", end: ""};
let dashboardTour = null;
let exclusionFilters = createExclusionFilters(document.getElementById("exclusion-filters"), () => {
    render();
    revealBufferedPageIfNearBottom();
});
const querySorting = createQuerySortingControl(() => {
    displayRevision++;
    render();
});
const treeView = createCallTreeView({table: queryTable,
    onBeforeViewChange: (previous, next) => {
        if (previous !== 'chart' && next !== 'chart') virtualTable.preserveVisibleQuery();
    }, onOperationClick: (anchor, name) => operationActions.open(anchor, name), formatSql: cachedFormatSql,
    renderSql: renderHighlightedSql, onChange: () => { render(); revealBufferedPageIfNearBottom(); }});

const barChart = createBarChart({table: queryTable, treeView, getSearchAction: name => exclusionFilters.operationSearchAction(name), onSearchOperation: name => operationActions.search(name), onChange: render, live: false,
    onLoadMore: loadMoreChart, onLoadAll: loadAllChart, onStopLoading: stopLoadingAll});

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
    const id=key.slice(key.indexOf(':')+1);
    if(mode==='collapsed')collapsedRowIds.add(id);else collapsedRowIds.delete(id);
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
    table: queryTable, scroller: tableScroll, body: tableBody, keyOf: groupKey,
    layoutOf: item => treeView.isActive() ? `tree:${treeView.version(groupKey(item))}:${activeOperationFilter}:${item.type === "server" ? displayedSqlRows(item.row).length : 1}`
        : `table:${displayRevision}:${collapsedRowIds.has(item.row.id)}:${activeOperationFilter}:${item.type === "server" ? displayedSqlRows(item.row).length : 1}`,
    rowCountOf: item => treeView.isActive() || collapsedRowIds.has(item.row.id) ? 1 : item.type === "server" ? displayedSqlRows(item.row).length : 1,
    weightOf: item => treeView.isActive() ? (item.type === "server" ? displayedSqlRows(item.row).length : 1) * 8
        : collapsedRowIds.has(item.row.id) ? 1 : item.type === "server" ? displayedSqlRows(item.row).length : 1,
    estimateHeight: item => treeView.isActive() ? treeView.estimateHeight(groupKey(item), item.type === "server" ? displayedSqlRows(item.row).length : 1)
        : collapsedRowIds.has(item.row.id) ? 70
        : (item.type === "server" ? displayedSqlRows(item.row).length : 1)
            * (groupsDisplay === FULLY_EXPANDED_GROUPS_DISPLAY ? 220 : 85),
    renderWindow: reconcileGroups,
    onLayout: scheduleMarkerLayout,
    onRangeChange: () => queueMicrotask(revealBufferedPageIfNearBottom)
});
enableColumnResizing(queryTable, () => {
    virtualTable.invalidate();
    scheduleMarkerLayout();
});
new ResizeObserver(() => {
    const {width, height} = queryTable.getBoundingClientRect();
    if (markerTableSize == null || width !== markerTableSize.width || height !== markerTableSize.height) scheduleMarkerLayout();
}).observe(queryTable);

searchButton.addEventListener("click", search);
loadAllButton.addEventListener("click", async () => {
    if (loadingAll) { stopLoadingAll(); return; }
    if (!searchPerformed) await search();
    barChart.clearFocus();
    await loadAllChart();
});
showAllButton.addEventListener("click", () => setOperationFilter(ALL_OPERATIONS_FILTER));
showServerOperationsButton?.addEventListener("click", () => setOperationFilter(SERVER_OPERATIONS_FILTER));
showNPlusOneOperationsButton.addEventListener("click", () => setOperationFilter(N_PLUS_ONE_OPERATIONS_FILTER));
expandGroupsButton.addEventListener("click", () => setGroupsDisplay(EXPANDED_GROUPS_DISPLAY));
fullyExpandGroupsButton.addEventListener("click", () => setGroupsDisplay(FULLY_EXPANDED_GROUPS_DISPLAY));
collapseGroupsButton.addEventListener("click", () => setGroupsDisplay(COLLAPSED_GROUPS_DISPLAY));
tableScroll.addEventListener("scroll", revealBufferedPageIfNearBottom);

render();
installProductTour({beginDemo: rows => {
    abortController?.abort(); abortController = new AbortController(); searchGeneration++;
    prefetchPromise = null; chartPageLoading = false; stopLoadingAll(); searchLoading = false;
    const saved = {serverRowsById, unassociatedRowsById, exclusionFilters, activeOperationFilter, groupsDisplay, groupTableDisplays,
        expanded: new Map(expandedCellStates), collapsed: new Set(collapsedRowIds)};
    serverRowsById = new Map(); unassociatedRowsById = new Map();
    activeOperationFilter = ALL_OPERATIONS_FILTER; groupsDisplay = EXPANDED_GROUPS_DISPLAY; groupTableDisplays = new Map();
    const session = createDashboardTour({rows, table: queryTable, treeView, barChart, virtualTable, querySorting,
        createFilters: container => (exclusionFilters = createExclusionFilters(container, () => {

            render();
        }, {temporary: true})),
        setRows(nextRows) {
            serverRowsById.clear(); unassociatedRowsById.clear();
            nextRows.forEach(row => serverRowsById.set(row.id, row));
        },
        renderDashboard: render,
        setTableDisplay: setGroupsDisplay,
        restoreData() {
            ({serverRowsById, unassociatedRowsById, exclusionFilters, activeOperationFilter, groupsDisplay, groupTableDisplays} = saved);
            expandedCellStates.clear(); saved.expanded.forEach((value, key) => expandedCellStates.set(key, value));
            collapsedRowIds.clear(); saved.collapsed.forEach(key => collapsedRowIds.add(key));

            renderedGroups.clear(); tableBody.replaceChildren(); displayRevision++;
        }
    });
    dashboardTour = session;
    return {...session, close() {
        session.restore(); dashboardTour = null;
        searchButton.disabled = searchLoading;
        render(); session.restorePosition();
        if (searchPerformed) preloadNextPage(searchGeneration);
    }};
}});

async function search() {
    if (!validateDates()) return;
    barChart.clearFocus();
    stopLoadingAll();
    chartPageLoading = false;
    searchDates = {start: startDateInput.value, end: endDateInput.value};
    const generation = ++searchGeneration;
    abortController?.abort();
    abortController = new AbortController();
    disconnectSentinelObserver();

    serverRowsById.clear();
    unassociatedRowsById.clear();
    collapsedRowIds.clear();
    groupTableDisplays.clear();
    expandedCellStates.clear();
    treeView.clear();
    nextCursor = null;
    bufferedPage = null;
    prefetchPromise = null;
    searchPerformed = true;
    searchLoading = true;
    searchError = null;
    searchButton.disabled = true;
    render();

    try {
        const page = await fetchUsefulPage(null, generation);
        if (generation !== searchGeneration) return;

        applyPage(page);
        render();
        preloadNextPage(generation);
    }
    catch (error) {
        if (error.name !== "AbortError" && generation === searchGeneration) {
            searchError = error.message;
            render();
        }
    }
    finally {
        if (generation === searchGeneration) {
            searchButton.disabled = false;
            searchLoading = false;
            render();
        }
    }
}

async function fetchUsefulPage(cursor, generation) {
    let currentCursor = cursor;

    while (true) {
        const page = await fetchPage(currentCursor);
        if (generation !== searchGeneration) throw new DOMException("Stale search", "AbortError");

        const rowCount = page.rowUpserts?.rows?.length ?? 0;
        if (rowCount > 0 || page.nextCursor == null) {
            return page;
        }
        currentCursor = page.nextCursor;
    }
}

async function fetchPage(cursor) {
    const parameters = new URLSearchParams({pageSize: String(PAGE_SIZE)});
    addInstantParameter(parameters, "startDate", searchDates.start);
    addInstantParameter(parameters, "endDate", searchDates.end);
    if (cursor != null) parameters.set("cursor", cursor);

    const response = await fetch(`${window.nPlusOneDetectorSearchPageUrl}?${parameters}`, {
        signal: abortController.signal
    });
    if (!response.ok) {
        throw new Error(await readError(response));
    }
    return response.json();
}

function addInstantParameter(parameters, name, localDateTime) {
    if (localDateTime !== "") {
        parameters.set(name, new Date(localDateTime).toISOString());
    }
}

async function readError(response) {
    try {
        const body = await response.json();
        if (Array.isArray(body.errors)) return body.errors.join("; ");
        return body.detail ?? body.message ?? `Search failed (${response.status})`;
    }
    catch {
        return `Search failed (${response.status})`;
    }
}

function applyPage(page) {
    for (const row of page.rowUpserts?.rows ?? []) {
        if (row.rowType === SERVER_ROW_TYPE) {
            serverRowsById.set(row.id, row);
        }
        else if (row.rowType === UNASSOCIATED_ROW_TYPE) {
            unassociatedRowsById.set(row.id, row);
        }
        if (groupsDisplay === COLLAPSED_GROUPS_DISPLAY) {
            collapsedRowIds.add(row.id);
        }
    }
    nextCursor = page.nextCursor ?? null;
    searchError = null;
}

function preloadNextPage(generation) {
    if (barChart.hasFocus() || nextCursor == null || prefetchPromise != null || bufferedPage != null || loadingAll || chartPageLoading) return;

    const cursorToLoad = nextCursor;
    prefetchPromise = fetchUsefulPage(cursorToLoad, generation)
            .then(page => {
                if (generation === searchGeneration) {
                    bufferedPage = page;
                    render();
                }
            })
            .catch(error => {
                if (error.name !== "AbortError" && generation === searchGeneration) {
                    searchError = `Could not preload more rows: ${error.message}`;
                }
            })
            .finally(() => {
                if (generation === searchGeneration) {
                    // Clear the in-flight marker before revealing: revealing may need the next page.
                    prefetchPromise = null;
                    render();
                    revealBufferedPageIfNearBottom();
                }
            });
    render();
}

function revealBufferedPageIfNearBottom() {
    if (dashboardTour) return;
    if (bufferedPage == null || loadingAll || chartPageLoading || barChart.hasFocus()) {
        return;
    }

    const remainingScrollPixels = tableScroll.scrollHeight
            - tableScroll.scrollTop
            - tableScroll.clientHeight;
    if (remainingScrollPixels <= PREFETCH_SCROLL_MARGIN_PIXELS || !barChart.isActive() && virtualTable.isNearEnd(PREFETCH_REMAINING_ROWS)) {
        revealBufferedPage();
    }
}

function revealBufferedPage() {
    // Viewport callbacks may run between the fetch's then() and finally().
    // Wait until finally clears the in-flight flag so revealing can preload again.
    if (barChart.hasFocus() || bufferedPage == null || prefetchPromise != null) return;

    const page = bufferedPage;
    bufferedPage = null;
    applyPage(page);
    render();
    preloadNextPage(searchGeneration);
}

async function loadNextChartPage(generation) {
    if (barChart.hasFocus()) return false;
    chartPageLoading = true;
    searchError = null;
    render();
    try {
        if (prefetchPromise != null) await prefetchPromise;
        if (generation !== searchGeneration || barChart.hasFocus()) return false;
        let page = bufferedPage;
        if (page == null && nextCursor != null) page = await fetchUsefulPage(nextCursor, generation);
        if (generation !== searchGeneration || barChart.hasFocus() || page == null) return false;
        bufferedPage = null;
        applyPage(page);
        render();
        return true;
    } catch (error) {
        if (generation === searchGeneration && error.name !== "AbortError") searchError = error.message;
        return false;
    } finally {
        if (generation === searchGeneration) { chartPageLoading = false; render(); }
    }
}

async function loadMoreChart() {
    if (chartPageLoading || loadingAll || searchLoading) return;
    const generation = searchGeneration;
    await loadNextChartPage(generation);
    if (generation === searchGeneration) preloadNextPage(generation);
}

async function loadAllChart() {
    if (chartPageLoading || loadingAll || searchLoading) return;
    const run = ++loadAllRun;
    const generation = searchGeneration;
    loadingAll = true;
    render();
    try {
        while (loadingAll && run === loadAllRun && generation === searchGeneration
                && (bufferedPage != null || nextCursor != null)) {
            if (!await loadNextChartPage(generation)) break;
        }
    } finally {
        if (run === loadAllRun && generation === searchGeneration) { loadingAll = false; render(); }
    }
}

function stopLoadingAll() {
    loadingAll = false;
    loadAllRun++;
    // An in-flight page finishes; no subsequent page is started.
    if (typeof barChart !== "undefined") render();
}

function setOperationFilter(filter) {
    activeOperationFilter = filter;
    render();
    revealBufferedPageIfNearBottom();
}

function setGroupsDisplay(display) {
    groupTableDisplays.clear();
    groupsDisplay = display;
    displayRevision++;
    expandedCellStates.clear();
    collapsedRowIds.clear();
    if (display === COLLAPSED_GROUPS_DISPLAY) {
        logicalRows().forEach(item => collapsedRowIds.add(item.row.id));
    }
    writeStoredValue(sessionStorage, GROUPS_DISPLAY_STORAGE_KEY, display);
    render();
    revealBufferedPageIfNearBottom();
}

function readGroupsDisplay() {
    const storedDisplay = readStoredValue(sessionStorage, GROUPS_DISPLAY_STORAGE_KEY);
    return storedDisplay === COLLAPSED_GROUPS_DISPLAY || storedDisplay === FULLY_EXPANDED_GROUPS_DISPLAY
            ? storedDisplay
            : EXPANDED_GROUPS_DISPLAY;
}

function logicalRows(filtered = exclusionFilters.apply(
        [...serverRowsById.values()], [...unassociatedRowsById.values()])) {
    const serverRows = filtered.serverRows.map(row => ({type: "server", row,
        allSqlRows: serverRowsById.get(row.id)?.sqlRows ?? row.sqlRows ?? [],
        visibility: summarizeVisibleQueries(serverRowsById.get(row.id)?.sqlRows ?? row.sqlRows ?? [],
            displayedSqlRows(row), row.jdbcDurationMillis)}));
    const unassociatedRows = filtered.unassociatedRows.map(row => ({type: "unassociated", row}));
    return sortByNewestTimestamp([...serverRows, ...unassociatedRows], item => item.row.start);
}

function filteredLogicalRows(rows = logicalRows()) {
    if (activeOperationFilter === SERVER_OPERATIONS_FILTER) {
        return rows.filter(item => item.type === "server");
    }
    if (activeOperationFilter === N_PLUS_ONE_OPERATIONS_FILTER) {
        return rows.filter(item => item.type === "server" && hasPotentialNPlusOneIssue(item.row));
    }
    return rows;
}

function hasPotentialNPlusOneIssue(serverRow) {
    return (serverRow.sqlRows ?? []).some(sqlRow => sqlRow.count > 1);
}

function displayedSqlRows(serverRow) {
    const sqlRows = serverRow.sqlRows ?? [];
    return exclusionFilters.limitQueries(activeOperationFilter === N_PLUS_ONE_OPERATIONS_FILTER
            ? sqlRows.filter(sqlRow => sqlRow.count > 1)
            : sqlRows);
}

function render() {
    if (dashboardTour && !dashboardTour.rendering) { dashboardTour.render(); return; }
    searchErrorNotice.hidden = searchError == null;
    searchErrorMessage.textContent = searchError ?? '';
    retrySearch.disabled = searchLoading || chartPageLoading || prefetchPromise != null;
    const label = loadingAll ? "Stop loading" : "Load all";
    setButtonIcon(loadAllButton, loadingAll ? 'stop' : 'loadAll', {label, title: label});
    loadAllButton.disabled = !loadingAll && (searchLoading || chartPageLoading || (searchPerformed && bufferedPage == null && nextCursor == null));
    disconnectSentinelObserver();
    document.getElementById("page-sentinel")?.remove();

    const filtered = exclusionFilters.apply([...serverRowsById.values()], [...unassociatedRowsById.values()]);
    exclusionFilters.updateSummary(filtered);
    const allRows = logicalRows(filtered);
    const serverRows = allRows.filter(item => item.type === "server");
    const nPlusOneRows = serverRows.filter(item => hasPotentialNPlusOneIssue(item.row));
    let rows = filteredLogicalRows(allRows);
    updateSearchStatus(rows.length);

    allOperationCount.textContent = allRows.length;
    if (serverOperationCount != null) serverOperationCount.textContent = serverRows.length;
    nPlusOneOperationCount.textContent = nPlusOneRows.length;
    updateFilterButton(showAllButton, activeOperationFilter === ALL_OPERATIONS_FILTER);
    if (showServerOperationsButton != null) {
        updateFilterButton(showServerOperationsButton, activeOperationFilter === SERVER_OPERATIONS_FILTER);
    }
    updateFilterButton(showNPlusOneOperationsButton, activeOperationFilter === N_PLUS_ONE_OPERATIONS_FILTER);
    updateFilterButton(expandGroupsButton, groupsDisplay === EXPANDED_GROUPS_DISPLAY);
    updateFilterButton(fullyExpandGroupsButton, groupsDisplay === FULLY_EXPANDED_GROUPS_DISPLAY);
    updateFilterButton(collapseGroupsButton, groupsDisplay === COLLAPSED_GROUPS_DISPLAY);

    treeView.applyPresentation();
    virtualTable.setSuspended(barChart.isActive());
    barChart.update(rows.map(item => ({key: groupKey(item), operation: item.row.operation, unassociated: item.type !== "server",
        start: item.row.start,
        sql: item.type === "server" ? displayedSqlRows(item.row).reduce((sum, query) => sum + (query.count ?? 1), 0) : 1,
        issues: item.type === "server" ? displayedSqlRows(item.row).filter(query => query.count > 1).length : 0})), {
        renderEmpty: target => renderEmptyState(filtered.hiddenSqlRowCount > 0 || filtered.hiddenGroupCount > 0, target),
        hasMore: bufferedPage != null || nextCursor != null,
        busy: searchLoading || chartPageLoading,
        loadingAll
    });
    if (barChart.isActive()) {
        queueMicrotask(revealBufferedPageIfNearBottom);
        return;
    }
    rows = barChart.filter(rows.map(item => ({key: groupKey(item), item}))).map(entry => entry.item);
    if (rows.length === 0) {
        virtualTable.update([]);
        tableBody.replaceChildren();
        renderEmptyState(filtered.hiddenSqlRowCount > 0 || filtered.hiddenGroupCount > 0);
        scheduleMarkerLayout();
        return;
    }

    const sentinelIndex = bufferedPage == null || barChart.hasFocus()
            ? -1
            : Math.max(0, rows.length - PREFETCH_REMAINING_ROWS);
    virtualTable.update(rows);
    if (sentinelIndex >= 0 && !virtualTable.isVirtualized()) {
        const sentinel = appendSentinel();
        const entry = renderedGroups.get(groupKey(rows[sentinelIndex]));
        tableBody.insertBefore(sentinel, entry.nodes[0]);
    }

    observeSentinel();
}

function groupKey(item) {
    return `${item.type}:${item.row.id}`;
}

function reconcileGroups(items) {
    treeView.applyPresentation();
    const wanted = new Set(items.map(groupKey));
    let changed = false;
    for (const [key, entry] of renderedGroups) {
        if (!wanted.has(key)) {
            entry.nodes.forEach(node => node.remove());
            renderedGroups.delete(key);
            changed = true;
        }
    }
    if (items.length > 0) tableBody.querySelector(".empty-state")?.closest("tr")?.remove();
    let cursor = tableBody.firstChild;
    if (cursor?.dataset?.virtualSpacer === "top") cursor = cursor.nextSibling;
    for (const item of items) {
        const key = groupKey(item);
        const sqlRows = item.type === "server" ? displayedSqlRows(item.row) : [];
        const collapsed = collapsedRowIds.has(item.row.id);
        let entry = renderedGroups.get(key);
        if (entry == null || !sameDisplayedGroup(entry, item, sqlRows)
                || entry.collapsed !== collapsed || entry.displayRevision !== displayRevision
                || entry.tree !== treeView.isActive() || entry.tree && entry.treeVersion !== treeView.version(key)) {
            if (entry != null) {
                if (entry.nodes.includes(cursor)) cursor = entry.nodes.at(-1).nextSibling;
                entry.nodes.forEach(node => node.remove());
            }
            const fragment = document.createDocumentFragment();
            renderLogicalRow(item, fragment);
            entry = {item, sqlRows, collapsed, displayRevision, nodes: [...fragment.children],
                tree: treeView.isActive(), treeVersion: treeView.version(key)};
            entry.nodes.forEach(node => { node.dataset.rowGroupKey = key; });
            renderedGroups.set(key, entry);
            changed = true;
        }
        if (entry.nodes[0] === cursor) {
            cursor = entry.nodes.at(-1).nextSibling;
        } else {
            const fragment = document.createDocumentFragment();
            entry.nodes.forEach(node => fragment.append(node));
            tableBody.insertBefore(fragment, cursor);
            changed = true;
        }
    }
    return changed;
}

function sameDisplayedGroup(entry, item, sqlRows) {
    const previous = entry.item.row;
    const row = item.row;
    if (previous.start !== row.start || previous.durationMillis !== row.durationMillis
            || !sameQueryVisibility(entry.item.visibility, item.visibility)
            || previous.jdbcDurationMillis !== row.jdbcDurationMillis
            || previous.operation !== row.operation) return false;
    if (item.type === "unassociated") return previous.query === row.query && previous.stackTrace === row.stackTrace;
    return sameSqlRows(entry.sqlRows, sqlRows) && sameSqlRows(entry.item.allSqlRows ?? [], item.allSqlRows ?? []);
}

function sameSqlRows(left, right) {
    return left === right || left.length === right.length && left.every((sql, index) => {
        const other = right[index];
        return sql === other || sql.count === other.count && sql.query === other.query && sql.stackTrace === other.stackTrace
            && sql.jdbcDurationMillis === other.jdbcDurationMillis && sql.start === other.start;
    });
}

function renderLogicalRow(item, target) {
    const sqlRows = item.type === "server" ? displayedSqlRows(item.row) : [];
    if (treeView.isActive()) {
        treeView.render({key: groupKey(item), operation: item.type === "server" ? item.row.operation : "Unassociated",
            start: item.row.start, duration: item.row.durationMillis, unassociated: item.type !== "server",
            jdbcDurationMillis: item.row.jdbcDurationMillis,
            visibility: item.visibility, onFilterClick: () => exclusionFilters.open(),
            allQueryRows: item.type === "server" ? item.allSqlRows.map(sql => ({sqlText: sql.query,
                stackTraceText: sql.stackTrace, proxyFrames: sql.proxyFrames, sqlCount: sql.count, jdbcDurationMillis: sql.jdbcDurationMillis})) : undefined,
            queryRows: item.type === "server" ? sqlRows.map(sql => ({sqlText: sql.query, stackTraceText: sql.stackTrace, proxyFrames: sql.proxyFrames,
                sqlCount: sql.count, jdbcDurationMillis: sql.jdbcDurationMillis}))
                : [{sqlText: item.row.query, stackTraceText: item.row.stackTrace, proxyFrames: item.row.proxyFrames, sqlCount: 1,
                    jdbcDurationMillis: item.row.jdbcDurationMillis}]}, target);
        return;
    }
    if (collapsedRowIds.has(item.row.id)) {
        renderCollapsedRow(item, sqlRows, target);
    }
    else if (item.type === "server") {
        renderServerRow(item.row, querySorting.sort(sqlRows), target, item.visibility);
    }
    else {
        renderUnassociatedRow(item.row, target);
    }
}

function updateSearchStatus(visibleCount) {
    if (!searchPerformed) return;
    if (searchError != null) {
        searchStatus.textContent = searchError;
    } else if (searchLoading) {
        searchStatus.textContent = "Searching…";
    } else if (visibleCount === 0 && (prefetchPromise != null || nextCursor != null)) {
        searchStatus.textContent = "Looking for visible rows…";
    } else if (visibleCount === 0) {
        searchStatus.textContent = "No matching rows.";
    } else {
        const allLoaded = nextCursor == null && prefetchPromise == null;
        searchStatus.textContent = `Showing ${allLoaded ? "all " : ""}${visibleCount} ${visibleCount === 1 ? "row" : "rows"}.`
                + (prefetchPromise != null ? " Loading more…" : bufferedPage != null ? " More rows are ready." : "");
    }
}

function renderEmptyState(hasExcludedRows, target = tableBody) {
    const row = document.createElement("tr");
    const cell = document.createElement(target === tableBody ? "td" : "div");
    cell.colSpan = 5;
    cell.className = "empty-state";
    if (searchPerformed && hasExcludedRows) {
        cell.textContent = "No rows to show with the current filters. ";
        const reviewButton = document.createElement("button");
        reviewButton.type = "button";
        reviewButton.className = "reload-button";
        reviewButton.textContent = "Review filter";
        reviewButton.addEventListener("click", () => exclusionFilters.open());
        cell.append(reviewButton);
    } else {
        cell.textContent = searchPerformed ? "No matching rows." : "No search performed yet.";
    }
    if (target === tableBody) { row.append(cell); target.append(row); }
    else target.replaceChildren(cell);
}

function appendSentinel() {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    row.id = "page-sentinel";
    row.className = "page-sentinel";
    cell.colSpan = 5;
    row.append(cell);
    tableBody.append(row);
    return row;
}

function observeSentinel() {
    const sentinel = document.getElementById("page-sentinel");
    if (sentinel == null) return;

    sentinelObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) revealBufferedPage();
    }, {root: tableScroll, rootMargin: `${PREFETCH_SCROLL_MARGIN_PIXELS}px 0px`});
    sentinelObserver.observe(sentinel);
}

function disconnectSentinelObserver() {
    sentinelObserver?.disconnect();
    sentinelObserver = null;
}

function updateFilterButton(button, active) {
    button.classList.toggle("filter-button-active", active);
    button.setAttribute("aria-pressed", String(active));
}

function renderServerRow(serverRow, sqlRows, target, visibility) {
    const markers = [];
    let firstSummary;
    sqlRows.forEach((sqlRow, index) => {
        const row = document.createElement("tr");
        row.queryAnchorKey = sourceQueryKey({sqlText: sqlRow.query, stackTraceText: sqlRow.stackTrace, proxyFrames: sqlRow.proxyFrames});
        row.classList.add("request-row");
        if (index === 0) row.classList.add("request-group-start");
        if (index === sqlRows.length - 1) row.classList.add("request-group-end");
        if (sqlRow.count > 1) row.classList.add("potential-n-plus-one");

        if (index === 0) {
            appendSpanningCell(row, formatRequestStart(serverRow.start, serverRow.durationMillis), sqlRows.length, "request-summary");
            appendOperationCell(row, serverRow.id, serverRow.operation, sqlRows.length, serverRow, sqlRows, visibility);
        }
        appendCell(row, sqlRow.count, "sql-count");
        appendSqlCell(row, cachedFormatSql(sqlRow.query), `server:${serverRow.id}`,
            formatSqlQuerySummary(sqlRow.count, sqlRow.jdbcDurationMillis, serverRow.jdbcDurationMillis));
        appendExpandableCell(row, cachedFormatStackTrace(sqlRow.stackTrace ?? ""), "stack-trace", renderStackTrace, `server:${serverRow.id}`);
        target.append(row);
        if (index === 0) firstSummary = row.querySelector('.request-summary');
        if (sqlRow.count > 1) markers.push(row);
    });
    for (const row of markers) appendMarker(firstSummary, row);
}

function renderUnassociatedRow(unassociatedRow, target) {
    const row = document.createElement("tr");
    row.classList.add("request-row", "request-group-start", "request-group-end", "unassociated");
    appendCell(row, "", "request-summary");

    appendOperationCell(row, unassociatedRow.id, "Unassociated", 1, unassociatedRow, []);
    appendCell(row, 1, "sql-count");
    appendSqlCell(row, cachedFormatSql(unassociatedRow.query), `unassociated:${unassociatedRow.id}`,
        formatSqlQuerySummary(1, unassociatedRow.jdbcDurationMillis, unassociatedRow.jdbcDurationMillis));
    appendExpandableCell(row, cachedFormatStackTrace(unassociatedRow.stackTrace ?? ""), "stack-trace", renderStackTrace, `unassociated:${unassociatedRow.id}`);
    target.append(row);
}

function renderCollapsedRow(item, displayedServerSqlRows, target) {
    const row = document.createElement("tr");
    const serverRow = item.type === "server" ? item.row : null;
    const sqlRows = serverRow == null ? [] : displayedServerSqlRows;
    const totalSqlCount = serverRow == null
            ? 1
            : sqlRows.reduce((total, sqlRow) => total + sqlRow.count, 0);
    const queryGroupCount = serverRow == null ? 1 : sqlRows.length;

    row.classList.add("request-row", "request-group-start", "request-group-end", "collapsed-request-row");
    if (serverRow != null && hasPotentialNPlusOneIssue(serverRow)) row.classList.add("potential-n-plus-one");
    if (item.type === "unassociated") row.classList.add("unassociated");

    appendCell(row, formatRequestStart(serverRow?.start, serverRow?.durationMillis), "request-summary");
    appendOperationCell(row, item.row.id, serverRow?.operation ?? "Unassociated", 1, item.row, sqlRows, item.visibility);
    appendCollapsedExpansionCell(row, totalSqlCount, "sql-count", item.row.id);
    appendCollapsedExpansionCell(
            row,
            `${queryGroupCount} SQL ${queryGroupCount === 1 ? "group" : "groups"} — expand to inspect`,
            "collapsed-query-summary",
            item.row.id);
    appendCollapsedExpansionCell(row, "", "stack-trace", item.row.id);
    target.append(row);
    if (serverRow != null && sqlRows.some(sql => sql.count > 1)) appendMarker(row.querySelector('.request-summary'), row);
}

function appendOperationCell(row, rowId, operationName, rowSpan, serverRow, sqlRows, visibility) {
    const cell = document.createElement("td");
    const button = document.createElement("button");
    const arrow = document.createElement("span");
    const name = document.createElement("button");
    const collapsed = collapsedRowIds.has(rowId);

    cell.rowSpan = rowSpan;
    cell.className = "server-operation request-summary";
    arrow.className = "operation-toggle-arrow";
    arrow.textContent = collapsed ? "▸" : "▾";
    arrow.setAttribute("aria-hidden", "true");
    name.textContent = operationName ?? "";

    button.type = "button";
    button.className = "operation-toggle";
    button.append(arrow);
    name.type = "button";
    name.className = "operation-name";
    name.disabled = !operationName || !serverRowsById.has(rowId);
    name.setAttribute("aria-haspopup", "dialog");
    name.setAttribute("aria-expanded", "false");
    name.addEventListener("click", () => operationActions.open(name, operationName));
    button.title = collapsed ? "Expand row group" : "Collapse row group";
    button.setAttribute("aria-expanded", String(!collapsed));
    button.addEventListener("click", () => toggleRowGroup(rowId));

    const operationHeader = document.createElement("div");
    operationHeader.className = "operation-header";
    operationHeader.append(button, name);
    cell.append(operationHeader);
    if (serverRow != null) {
        const label = document.createElement("div");
        const issueCount = sqlRows.filter(sql => sql.count > 1).length;
        const queryCount = serverRow.rowType === UNASSOCIATED_ROW_TYPE ? 1 : sqlRows.reduce((total, sql) => total + sql.count, 0);
        label.className = `request-label request-timing-summary${issueCount > 0 ? " request-label-alert" : ""}`;
        label.textContent = formatRequestSummary(issueCount, queryCount,
            visibility == null ? serverRow.jdbcDurationMillis : visibility.jdbcDurationMillis, serverRow.durationMillis,
            visibility?.totalQueryDurationMillis ?? serverRow.jdbcDurationMillis);
        appendFilterIndicator(label, visibility, () => exclusionFilters.open());
        cell.append(label);
    }
    row.append(cell);
}

function appendCollapsedExpansionCell(row, value, className, rowId) {
    const cell = document.createElement("td");
    cell.textContent = value;
    cell.className = `${className} collapsed-group-expansion-cell`;
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", "Expand row group");
    cell.title = "Expand row group";
    cell.addEventListener("click", () => toggleRowGroup(rowId));
    cell.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleRowGroup(rowId);
        }
    });
    row.append(cell);
}

function toggleRowGroup(rowId) {
    if (collapsedRowIds.has(rowId)) {
        collapsedRowIds.delete(rowId);
    }
    else {
        collapsedRowIds.add(rowId);
    }
    render();
    revealBufferedPageIfNearBottom();
}

function appendSpanningCell(row, value, rowSpan, className) {
    const cell = document.createElement("td");
    cell.rowSpan = Math.max(1, rowSpan);
    cell.textContent = value ?? "";
    cell.className = className;
    row.append(cell);
}

function appendCell(row, value, className) {
    const cell = document.createElement("td");
    cell.textContent = value ?? "";
    cell.className = className;
    row.append(cell);
}

function appendSqlCell(row, sql, groupKey, summary = "") {
    appendExpandableCell(row, sql, "sql", (cell, value) => {
        renderHighlightedSql(cell, value);
        if (summary) {
            const label = document.createElement("div");
            label.className = "sql-timing-summary";
            label.textContent = summary;
            cell.append(label);
        }
    }, groupKey);
}

function appendExpandableCell(row, value, className, renderer = renderPlainText, groupKey) {
    const cell = document.createElement("td");
    const key = `${groupKey}:${className}:${value.full}`;
    let expanded = expandedCellStates.get(key) ?? ((groupTableDisplays.get(groupKey) ?? groupsDisplay) === FULLY_EXPANDED_GROUPS_DISPLAY);
    const canExpand = value.summary !== value.full;
    cell.className = className;
    renderer(cell, expanded ? value.full : value.summary);

    if (canExpand) {
        cell.classList.add("expandable-cell");
        cell.tabIndex = 0;
        cell.setAttribute("role", "button");
        cell.setAttribute("aria-expanded", String(expanded));
        const toggle = () => {
            expanded = !expanded;
            expandedCellStates.set(key, expanded);
            renderer(cell, expanded ? value.full : value.summary);
            cell.setAttribute("aria-expanded", String(expanded));
            virtualTable.refresh();
            scheduleMarkerLayout();
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

function appendMarker(summary, row) {
    const marker = document.createElement('span');
    marker.className = 'n-plus-one-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.nPlusOneRow = row;
    marker.groupStartRow = summary.parentElement;
    summary.append(marker);
}

function scheduleMarkerLayout() {
    if (markerLayoutFrame != null) return;
    markerLayoutFrame = requestAnimationFrame(() => {
        markerLayoutFrame = null;
        const {width, height} = queryTable.getBoundingClientRect();
        markerTableSize = {width, height};
        const measurements = [...tableBody.querySelectorAll('.n-plus-one-marker')].map(marker => ({
            marker, top: marker.nPlusOneRow.offsetTop - marker.groupStartRow.offsetTop,
            height: marker.nPlusOneRow.offsetHeight
        }));
        for (const {marker, top, height} of measurements) {
            if (marker.style.top !== `${top}px`) marker.style.top = `${top}px`;
            if (marker.style.height !== `${height}px`) marker.style.height = `${height}px`;
        }
    });
}

function formatRequestStart(start, duration) {
    const timestamp = formatTimestamp(start);
    const elapsed = formatDuration(duration);
    return timestamp + (elapsed ? ` (${elapsed})` : "");
}
