import {configureDateRange} from "./date-range.js?v=70512685574943983513608468539075838973";
import {beginTemporaryPreferences} from "./browser-storage.js?v=290084059958384501112687013092675042027";
import {setButtonIcon} from "./toolbar-icons.js?v=7402158213721210528724430729032752313";

export function createTourRequests(now = Date.now()) {
    const path = "at example.OwnerRepository.findPets(OwnerRepository.java:42)\n"
        + "at example.OwnerMapper.attachPets(OwnerMapper.java:14)\n"
        + "at example.OwnerAssembler.buildOwner(OwnerAssembler.java:27)\n"
        + "at example.OwnerService.loadPets(OwnerService.java:31)\n"
        + "at example.OwnerService.load(OwnerService.java:20)\n"
        + "at example.OwnerController.list(OwnerController.java:18)";
    return Array.from({length: 60}, (_, index) => {
        const sqlRows = [
            {count: 12 + index % 5, jdbcDurationMillis: 180 + index, query: "SELECT * FROM pet WHERE owner_id = ?", stackTrace: path},
            {count: 1, jdbcDurationMillis: 30, query: "SELECT * FROM owner ORDER BY name", stackTrace: "at example.OwnerRepository.findAll(OwnerRepository.java:15)\nat example.OwnerController.list(OwnerController.java:18)"},
            {count: 3, jdbcDurationMillis: 40, query: "SELECT * FROM permission WHERE owner_id = ?", stackTrace: "at example.PermissionRepository.find(PermissionRepository.java:22)\nat example.OwnerService.load(OwnerService.java:20)\nat example.OwnerController.list(OwnerController.java:18)"},
            {count: 1, jdbcDurationMillis: 10, query: "INSERT INTO audit (operation) VALUES (?)", stackTrace: "at example.AuditRepository.record(AuditRepository.java:12)\nat example.OwnerController.list(OwnerController.java:18)"}
        ];
        if (index % 3 === 1) {
            const orderPath = "at example.OrderService.findRecent(OrderService.java:56)\nat example.OrderController.list(OrderController.java:24)";
            sqlRows.splice(0, sqlRows.length,
                {count: 1, jdbcDurationMillis: 38, query: "SELECT o.ID, o.STATUS, c.NAME FROM purchase_order o JOIN customer c ON o.customer_id = c.ID WHERE o.created_at > ?",
                    stackTrace: "at example.OrderRepository.findRecent(OrderRepository.java:73)\n" + orderPath},
                {count: 4 + index % 4, jdbcDurationMillis: 90 + index, query: "SELECT product_id, quantity, unit_price FROM order_line WHERE order_id = ? ORDER BY position",
                    stackTrace: "at example.OrderLineRepository.findByOrder(OrderLineRepository.java:37)\nat example.OrderService.attachLines(OrderService.java:89)\n" + orderPath},
                {count: 2, jdbcDurationMillis: 25, query: "SELECT tracking_number, carrier FROM shipment WHERE order_id = ?",
                    stackTrace: "at example.ShipmentRepository.find(ShipmentRepository.java:18)\nat example.FulfilmentService.loadTracking(FulfilmentService.java:61)\n" + orderPath});
        }
        return {id: `tour-request-${index}`, rowType: "SERVER", operation: index % 3 === 1 ? "GET /api/orders" : "GET /api/owners",
            start: new Date(now - 60_000 - index * 10_000).toISOString(), durationMillis: 400 + index * 3,
            jdbcDurationMillis: sqlRows.reduce((sum, row) => sum + row.jdbcDurationMillis, 0),
            sqlRows: sqlRows.map((row, queryIndex) => ({...row,
                start: new Date(now - 60_000 - index * 10_000 + queryIndex * 10).toISOString()}))};
    });
}

// Example requests are rendered by the same dashboard views as ordinary data.
// The owning page holds its real maps aside until restore() is called.
export function createDashboardTour({rows, table, treeView, barChart, virtualTable, createFilters,
    setRows, renderDashboard, restoreData, setTableDisplay, querySorting}) {
    const endPreferences = beginTemporaryPreferences();
    const scroller = table.parentElement;
    const scroll = {top: scroller.scrollTop, left: scroller.scrollLeft};
    const filterHost = document.getElementById("exclusion-filters");
    const originalFilters = document.createDocumentFragment();
    originalFilters.append(...filterHost.childNodes);
    const filters = createFilters(filterHost);
    const quick = filters.beginTour();
    const tree = treeView.beginTour();
    const chart = barChart.beginTour();
    const sorting = querySorting.beginTour();
    const originals = [...document.querySelectorAll(".search-controls, #load-all, #reload-all-rows, .mode-link")];
    originals.forEach(node => node.classList.add("tour-native-control"));
    const toolbar = document.querySelector(".table-toolbar");
    const actions = toolbar.querySelector('.toolbar-actions');
    const searchControls = document.createElement("div");
    searchControls.className = "tour-search-controls";
    const searchFields = document.createElement('div');
    searchFields.className = 'search-controls';
    searchFields.setAttribute('role', 'group');
    searchFields.setAttribute('aria-label', 'Search requests');
    const from = document.createElement("input"), to = document.createElement("input");
    from.type = to.type = "datetime-local"; from.id = "tour-from"; to.id = "tour-to";
    const validateDates = configureDateRange(from, to);
    for (const [name, input] of [["From", from], ["To", to]]) {
        const field = document.createElement("div"); field.className = "search-field";
        const label = document.createElement("label"); label.htmlFor = input.id; label.textContent = name;
        field.append(label, input); searchFields.append(field);
    }
    const makeButton = (text, id) => { const button = document.createElement("button"); button.type = "button";
        button.className = "live-updates-button"; button.id = id; button.textContent = text; return button; };
    const search = makeButton("Search", "tour-search"), loadAll = makeButton("Load all", "tour-load-all");
    setButtonIcon(search, 'search');
    searchFields.append(search);
    searchControls.append(searchFields, loadAll); actions.append(searchControls);
    const switchMode = makeButton("To search mode", "tour-to-search");
    setButtonIcon(switchMode, 'searchMode');
    actions.append(switchMode);
    const allRows = createTourRequests();
    let currentRows = rows, source = rows, mode = "live", restored = false;
    let streamTimer = null, pagingTimer = null, loadingAll = false, loaded = 0, matching = [];
    const arrivals = new Map();
    const timers = new Set();
    const delay = (fn, ms) => { const timer = setTimeout(() => { timers.delete(timer); if (!restored) fn(); }, ms); timers.add(timer); };
    function show(next) {
        const previous = new Set(currentRows.map(row => row.id));
        next.forEach(row => { if (!previous.has(row.id)) arrivals.set(row.id, performance.now()); });
        currentRows = next; setRows(next); api.render();
    }
    function updateLoading() {
        const label = loadingAll ? "Stop loading" : "Load all";
        setButtonIcon(loadAll, loadingAll ? 'stop' : 'loadAll', {label, title: label});
        loadAll.disabled = !loadingAll && loaded >= matching.length;
    }
    function stopPaging() { clearInterval(pagingTimer); pagingTimer = null; loadingAll = false; updateLoading(); }
    function page(batchSize = 6) {
        loaded = Math.min(matching.length, loaded + batchSize);
        show(matching.slice(0, loaded)); updateLoading();
        if (loaded >= matching.length) stopPaging();
    }
    function searchExamples() {
        if (!validateDates()) return;
        stopPaging(); loaded = 0;
        matching = allRows.filter(row => (!from.value || new Date(row.start) >= new Date(from.value))
            && (!to.value || new Date(row.start) <= new Date(to.value)));
        show([]); updateLoading(); delay(page, 250);
    }
    function scrollPages(interval = 400, all = false) {
        if (pagingTimer) return;
        loadingAll = all;
        pagingTimer = setInterval(() => {
            scroller.scrollTop = scroller.scrollHeight;
            page(all ? 6 : 4);
        }, interval); updateLoading();
    }
    search.addEventListener("click", searchExamples);
    loadAll.addEventListener("click", () => {
        if (loadingAll) stopPaging();
        else { stopPaging(); scrollPages(100, true); }
    });
    switchMode.addEventListener("click", () => api.mode("search"));
    const api = {
        filters, rendering: false,
        render() {
            if (restored || api.rendering) return;
            api.rendering = true;
            try {
                renderDashboard();
                for (const row of table.querySelectorAll(".call-tree-request")) {
                    const id = row.dataset.rowGroupKey?.replace(/^server:/, "");
                    const age = performance.now() - (arrivals.get(id) ?? -Infinity);
                    if (age < 2000 && streamTimer) {
                        if (!row.classList.contains("tour-arrival")) row.style.setProperty("--tour-arrival-age", `-${age}ms`);
                        row.classList.add("tour-arrival");
                    } else row.classList.remove("tour-arrival");
                }
            } finally { api.rendering = false; }
        },
        reset({slowest = false} = {}) {
            filters.resetDemo(); quick.reset(slowest); tree.reset(); barChart.clearFocus();
            source = rows; show(rows); scroller.scrollTop = 0;
        },
        configure({data, view, display, tableDisplay, slowest, clearFilters = false, openFilters, searchMode} = {}) {
            if (clearFilters) filters.resetDemo();
            if (slowest != null) quick.reset(slowest);
            if (view || display) tree.reset({view: view ?? "tree", display: display ?? "sql-paths"});
            if (tableDisplay) setTableDisplay(tableDisplay);
            if (data) { source = data; show(data); }
            if (searchMode != null) api.mode(searchMode ? "search" : "live");
            if (openFilters != null) {
                document.getElementById("exclusion-body").hidden = !openFilters;
                document.querySelector(".exclusion-summary").setAttribute("aria-expanded", String(openFilters));
            }
            api.render();
        },
        mode(next) {
            mode = next;
            searchControls.hidden = mode !== "search"; switchMode.hidden = mode === "search";
            document.documentElement.classList.toggle("tour-search-mode", mode === "search");
            if (mode === "search") { api.stopStream(); stopPaging(); show([]); }
        },
        search: searchExamples,
        infinite: () => scrollPages(),
        startStream() {
            api.stopStream(); let sequence = 60;
            streamTimer = setInterval(() => {
                const row = structuredClone(allRows[sequence % allRows.length]);
                row.id = `tour-stream-${sequence++}`; row.start = new Date().toISOString();
                show([row, ...currentRows].slice(0, 80));
            }, 3000);
        },
        stopStream() { clearInterval(streamTimer); streamTimer = null; },
        state: () => ({...filters.snapshot(), rows: currentRows, source, mode, loaded, total: matching.length,
            chart: barChart.tourState(), tree: treeView.isActive(), table: !treeView.isActive() && !treeView.isChart()}),
        restore() {
            if (restored) return;
            restored = true; api.stopStream(); stopPaging(); timers.forEach(clearTimeout); timers.clear();
            filters.dispose(); filterHost.replaceChildren(originalFilters);
            searchControls.remove(); switchMode.remove(); originals.forEach(node => node.classList.remove("tour-native-control"));
            document.documentElement.classList.remove("tour-search-mode");
            tree.restore(); chart.restore(); sorting.restore(); restoreData(); endPreferences();
            virtualTable.setSuspended(false);
        },
        restorePosition() { scroller.scrollTop = scroll.top; scroller.scrollLeft = scroll.left; }
    };
    setRows(rows); api.mode("live");
    return api;
}
