import {createTourArticle} from "./tour-articles.js?v=2608697119837843173360114979007065768";
import {readStoredValue, writeStoredValue} from "./browser-storage.js?v=290084059958384501112687013092675042027";
import {createTourRequests} from "./tour-demo.js?v=6694885022006920742";

const TOUR_KEY = "nplusone.product-tour.v1";

const HIDE_STARTUP_KEY = "nplusone.tour-hide-startup.v1";
const SKIP_LIVE_KEY = "nplusone.tour-skip-next-live.v1";
export function installProductTour({beginDemo}) {
    if (document.querySelector(".tour-help")) return;
    const header = document.querySelector("main > header");
    if (!header) return;
    header.classList.add("tour-header");
    const help = element("details", "tour-help");
    help.append(element("summary", "reload-button", "Help"));
    const start = button("Start tour", "tour-start", () => { help.open = false; launch(); });
    const faq = element("a", "tour-help-faq", "FAQ");
    faq.href = "https://github.com/bl-g/NPlusOne/tree/main/faq-and-example-projects";
    faq.target = "_blank";
    faq.rel = "noopener noreferrer";
    faq.addEventListener("click", () => { help.open = false; });
    const menu = element("div", "tour-help-menu");
    menu.append(start, faq);
    help.append(menu);
    const actions = element("div", "tour-header-actions");
    const status = document.getElementById("connection-status") ?? document.getElementById("search-status");
    status?.replaceWith(actions);
    if (!status) header.append(actions);
    actions.append(...(status ? [status] : []), help);
    document.addEventListener('click', event => {
        if (help.open && !help.contains(event.target)) help.open = false;
    }, true);
    let tour = null;
    function launch() {
        if (tour) return;
        tour = createTour({beginDemo, onClose: completed => {
            writeStoredValue(localStorage, TOUR_KEY, completed ? "finished" : "skipped");
            tour = null; help.querySelector("summary").focus({preventScroll: true});
        }});
    }
    const isLive = document.getElementById("toggle-live-updates") != null;
    if (!isLive) {
        document.querySelector(".mode-link")?.addEventListener("click", () => {
            try { sessionStorage.setItem(SKIP_LIVE_KEY, "true"); } catch {}
        });
    } else {
        const skip = readStoredValue(sessionStorage, SKIP_LIVE_KEY) === "true";
        try { sessionStorage.removeItem(SKIP_LIVE_KEY); } catch {}
        if (!skip && readStoredValue(localStorage, HIDE_STARTUP_KEY) !== "true") queueMicrotask(launch);
    }
}
function createTour({beginDemo, onClose}) {
    const session = beginDemo(createTourRequests().slice(0, 2));
    const controller = new AbortController();
    const dialog = element("section", "product-tour");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-labelledby", "tour-heading");
    const top = element("div", "tour-top");
    top.append(element("strong", "", "NPlusOne quick tour"), element("span", "tour-demo-badge", "Demo data"),
        button("×", "tour-close", () => close(false), "Close tour"));
    const layout = element("div", "tour-layout");
    const coach = element("section", "tour-coach");
    const counter = element("p", "tour-counter");
    const progress = element("progress", "tour-progress");
    progress.max = 4;
    progress.setAttribute("aria-label", "Tour progress");
    const body = element("div", "tour-coach-body");
    const heading = element("h2", "");
    heading.id = "tour-heading";
    const content = element("div", "tour-description");
    const announcements = element("p", "tour-announcement");
    announcements.setAttribute("role", "status");
    body.append(heading, content, announcements);
    const nav = element("div", "tour-navigation");
    const back = button("Back", "reload-button tour-back", () => showPage(index - 1));
    const skip = button("Skip", "reload-button tour-skip", skipRequiredAction);
    const next = button("Next", "live-updates-button tour-next", () => {
        if (failed) showPage(index);
        else if (index === pages.length - 1) close(true);
        else showPage(index + 1);
    });
    nav.append(back, skip, next);
    coach.append(counter, progress, body, nav);
    const spotlight = element("div", "tour-spotlight");
    const spotlights = [spotlight];
    const shade = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    shade.classList.add("tour-shade");
    shade.setAttribute("aria-hidden", "true");
    shade.hidden = true;
    shade.setAttribute("hidden", "");
    const backdrop = element("div", "tour-backdrop");
    backdrop.setAttribute("aria-hidden", "true");
    spotlight.setAttribute("aria-hidden", "true");
    spotlight.hidden = true;
    layout.append(coach);
    dialog.append(top, layout);
    document.body.append(backdrop, shade, dialog, spotlight);
    document.documentElement.classList.add("tour-active");
    const demo = document;
    const main = document.querySelector("main");
    const controlStates = new Map();
    let index = 0, skipping = false, closed = false, busy = false, failed = false, article = null;
    let observer = null, renderFrame = null, targetSelector = null, actionSelector = null;
    let articleMode = null;
    let chosenOperation = null;
    let fitStamp = null;
    let fitWidthLimit = Infinity;
    let drag = null, draggedPosition = null;
    top.title = 'Drag to move this dialog';
    dialog.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary || event.target.closest('button, a, input, select, textarea')
                || !event.target.closest('.tour-top, .tour-article h2')) return;
        const rect = dialog.getBoundingClientRect();
        drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top};
        draggedPosition = {left: rect.left, top: rect.top};
        dialog.classList.add('tour-dragged', 'tour-dragging');
        applyDraggedPosition();
        dialog.setPointerCapture(event.pointerId);
        event.preventDefault();
    }, {signal: controller.signal});
    dialog.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        draggedPosition = {left: drag.left + event.clientX - drag.x, top: drag.top + event.clientY - drag.y};
        applyDraggedPosition();
    }, {signal: controller.signal});
    const endDrag = event => {
        if (!drag || event.pointerId !== drag.id) return;
        drag = null;
        dialog.classList.remove('tour-dragging');
        if (dialog.hasPointerCapture(event.pointerId)) dialog.releasePointerCapture(event.pointerId);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
        dialog.addEventListener(type, endDrag, {signal: controller.signal});
    function applyDraggedPosition() {
        if (!draggedPosition) return;
        draggedPosition.left = Math.max(12, Math.min(draggedPosition.left, document.documentElement.clientWidth - dialog.offsetWidth - 12));
        draggedPosition.top = Math.max(12, Math.min(draggedPosition.top, window.innerHeight - dialog.offsetHeight - 12));
        dialog.style.setProperty('--tour-drag-left', draggedPosition.left + 'px');
        dialog.style.setProperty('--tour-drag-top', draggedPosition.top + 'px');
    }
    function resetDraggedPosition() {
        const pointerId = drag?.id;
        drag = null; draggedPosition = null;
        if (pointerId != null && dialog.hasPointerCapture(pointerId)) dialog.releasePointerCapture(pointerId);
        dialog.classList.remove('tour-dragged', 'tour-dragging');
    }
    const introduction = "NPlusOne makes it easy to spot N+1 query issues, see their impact on time performance and trace their origins. The UI is a dashboard that shows all requests received by the monitored application. Per request, it shows all SQL queries sent by the application and the code that triggered them. Monitor a live application while it's running or use the search to find previous requests.";
    const pages = [
        {title: "Welcome to NPlusOne", text: introduction, target: null},
        {title: "Dig into a stack trace", text: "You are currently looking at the tree view. Each row here belongs to one request received by the monitored application. Besides the HTTP method and URL of the request, it shows its duration and a summary of the SQL queries it triggered: the number of queries, their total duration and the count of underlying N+1 query issues.", target: ".call-tree-request-header"},
        {title: "Follow the stack trace", text: "Below each request, you can see the SQL queries triggered by it and the stack trace that ultimately led to these SQL queries.", target: ".call-tree-paths"},
        {title: "Understand the query summary", text: "In this demo example, there are four SQL queries. Two of them are sent just once, one is sent three times and one twelve times. Thus, it is summarized as: 2 N+1 problems, 17 SQL queries. These queries take up 65% of the request time.\n\nIn this example it is easy to spot the query that caused most of this delay. With a larger stack trace and more different SQL queries, this can be harder. In such cases, use the quick filter to easily spot which query is taking up most of this time. Click Next to locate this filter.", target: ".call-tree-query, .call-tree-request-header > .call-tree-issue"},
        {title: "Find the slowest query", text: "Click the stopwatch-and-lines icon beside Slowest to show only the SQL query that took the most time. It's possible to change this number, to see, for example, the five slowest queries, but let's, for this demo, focus on the single slowest one.", target: ".longest-query-control", action: ".longest-query-toggle"},
        {title: "Focus on the slowest query", text: "The other queries (and their stack traces) are now hidden.", target: ".call-tree-paths"},
        {title: "Inspect the SQL query", text: "The SQL query here is summarized: it shows the SQL keywords and the tables the data is loaded from (if there are JOINs, then the joined tables are shown here as well). Click on the SQL query to expand it.", target: ".call-tree-query", action: ".call-tree-sql"}
        ,{id: "7.1", step: 1, text: "Click a request's name to open its menu. 'Expand full' reveals every method and the full SQL. 'Expand to SQLs' reveals the query paths with compact SQL. 'Collapse' shows just the request header. These actions affect only that request; the toolbar controls all request groups. The Level picker expands the tree to the chosen branching level as soon as you change its value. Try the menu options.", target: ".call-tree-operation, .operation-menu-group-actions", action: ".call-tree-operation, .operation-menu-group-actions button"}
        ,{id: "8", step: 2, text: "The SQL query summary data always reflects only the visible queries. You can see this by toggling the quick filter or changing the slowest queries count. Try it out and see the summary numbers change.", target: ".call-tree-request-header, .longest-query-control", action: ".longest-query-toggle, .longest-query-count", wait: "quick"}
        ,{id: "8.1", step: 2, text: "It can be easy to forget about the applied filters and thus misinterpret the summary data shown here. To help you, the summary data shows a filter symbol if any of its child rows are hidden due to a filter. You can click the filter symbol to see which rows are filtered.", target: ".call-tree-request-header, .longest-query-control", action: ".row-filter-indicator, .hidden-query-popup button"}
        ,{id: "9", step: 2, text: "NPlusOne offers more ways to filter the visible data. Click the funnel with the right-pointing chevron at the top left to open Filters. The chevron points down while the panel is open. A green check means filters are applied; an amber pause symbol means they are paused.", target: ".exclusion-header", action: ".exclusion-summary", wait: "disclosure"}
        ,{id: "10", step: 2, text: "Click the document-with-plus icon (New) to create your first filter set. The neighboring icons duplicate or delete a set; the down and up arrows import and export sets. Hover over an icon to see its name.", target: ".ruleset-row", action: ".ruleset-new, #ruleset-name", wait: "new"}
        ,{id: "11", step: 2, text: "Here, you can create a filter. You can filter on request name, SQL query, stack trace or SQL count. Filter by exact match, by contains or by a regular expression. Filters hide data, so any matching row will no longer be visible.\n\nTry it out, and create a filter to hide all requests whose name contains \"owners\".", target: ".exclusion-form", action: ".exclusion-form input, .exclusion-form select, .exclusion-form button, #ruleset-name, .filter-definition button", wait: "owners"}
        ,{id: "12", step: 2, text: "As you can see, the \"owners\" request is now no longer visible.", target: ".call-tree-request"}
        ,{id: "13", step: 2, text: "The green check beside the Filters funnel means your filters are applied. Press the minus symbol to unapply it. The data shown in the dashboard is then adjusted accordingly. And the minus turns into a plus, which you can click to apply the filter again. You can also pause the whole filter set without removing its filters: click the green check beside the Filters funnel. It becomes an amber pause icon; click that icon to resume. Try either control.", target: ".filter-query-editor, .filter-definition:first-child, .exclusion-toggle", action: ".exclusion-apply, .exclusion-toggle", wait: "toggle"}
        ,{id: "14", step: 2, text: "Instead of using the plus and minus button, you can also write your own complex filter query here. Filters can be combined using AND, OR and parentheses. Negate a filter using NOT. Negating can be useful if you want to search for a specific request or query: by hiding all rows that do NOT match that filter, you are effectively searching for rows that do match the filter.", target: ".filter-query-editor", action: ".filter-query-input"}
        ,{id: "15", step: 2, text: "There is a shortcut for searching all requests with a given name. Left-click on the request's name, and then press \"Search all requests with this name\". Try it out.", target: ".call-tree-request-header", action: ".call-tree-operation, .operation-menu button", wait: "search-name"}
        ,{id: "16", step: 2, text: "As you can see, it automatically added a negated filter to find all requests with this name.", target: ".filter-query-editor, .filter-definition:last-child"}
        ,{id: "17", step: 3, wait: "table-view", action: "#view-table", text: "The tree view is useful to dig into a stack trace, but if you just want to see which SQL queries were triggered by a request, then the table view can be more convenient. Click the grid icon (Table) to try it out.", target: "#view-table"}
        ,{id: "18", step: 3, text: "The Request start column combines the timestamp with the request duration in parentheses, using the usual duration formatting. The next column, Request, shows its name. The single down-chevron in the bordered Expand group selects compact expansion: the individual SQLs and stack traces are shown, but in a summarized form. If you want to see the full SQL query or stack trace, then click on their text. Click again to go back into the summarized view.", target: "td.sql, td.stack-trace, #table-display-controls", action: "td.sql, td.stack-trace", wait: "cell"}
        ,{id: "19", step: 3, text: "In the Expand group, the double down-chevron expands all SQL and stack traces fully. The single down-chevron shows compact text, and the up-chevron collapses request groups. Try the double down-chevron; you can try Collapse too.", target: "#table-display-controls", action: "#fully-expand-groups, #collapse-groups, #expand-groups", wait: "expansion"}
        ,{id: "19.1", step: 3, text: "The bordered Sort SQLs group reorders SQL rows within each request. The database with a blue # sorts by SQL count (the default). The stopwatch sorts by total query duration, and the calendar by first execution time. The up-arrow sorts ascending; the down-arrow sorts descending. Request groups keep their order. Try the sort options.", target: "#query-sort-controls", action: "#query-sort-controls button"}
        ,{id: "19.2", step: 3, text: "The request menu also works in Table view. Click a request's name and choose 'Expand fully' to show its full SQL and stack traces, 'Expand' for compact text, or 'Collapse' for a single summary row. Only the selected request changes. Try it out; the toolbar controls still apply to all groups.", target: "#query-table .operation-name, .operation-menu-group-actions", action: "#query-table .operation-name, .operation-menu-group-actions button"}
        ,{id: "20", step: 3, wait: "chart-view", action: "#view-bar-chart", text: "If you are not looking for a specific request, but just want to know which requests trigger a lot of SQL queries or N+1 issues, then the Bar chart view is helpful. Click the three colored bars (Bar chart) to try it out.", target: "#view-bar-chart"}
        ,{id: "20.1", step: 3, title: "Average requests by name", text: "The blue x-bar (x\u0304) toggle has its own bordered group beside Sort by. Toggle it to combine loaded, filtered requests with the same name and show their average SQL and N+1 counts. For example, SQL counts of 2 and 4 become 3. Each row shows how many requests contribute to its average. Loading more requests updates the averages. Toggle it off to show individual requests again. Try the toggle before continuing.", target: ".chart-aggregate-group", action: ".chart-aggregate-group button"}
        ,{id: "21", step: 3, text: "In the chart's Sort by group, the database with a blue # sorts by SQL count, the orange N+1 badge by issue count, and the calendar by date. The up and down arrows choose the direction. By clicking on the request's name, you are presented the option to further investigate this request in the table or tree view. Try it out: click the database-and-# icon to sort by SQL count, then click the request with the most SQL queries and then pick 'View in tree' (or 'View all in tree' for averaged rows).", target: ".chart-controls, .chart-data-row:first-child", action: ".chart-controls button, .chart-operation, .chart-popup button", wait: "chart-tree"}
        ,{id: "22", step: 3, text: "The tree view now shows the selected request, or the contributing requests if you selected an averaged row. Click the 'Back to bar chart' button to return to the bar chart view.", target: ".call-tree-request, .chart-back", action: ".chart-back", wait: "chart-back"}
        ,{id: "23", step: 3, text: "Please be aware that any filter also applies to the table and the bar chart views.", target: null}
        ,{id: "24", step: 4, text: "So far, you have been looking at the live mode of NPlusOne. This mode can be used to monitor a running application. Any new request processed by the monitored application is automatically added to the dashboard.", target: null}
        ,{id: "25", step: 4, text: "Any request, and its SQL queries and stack traces, is stored in a database file (NPlusOne uses SQLite). To view these stored requests, click the blue magnifying glass with the separate right-arrow at the top right to enter Search mode. In Live mode, the pause icon pauses incoming updates and changes to a play icon to resume them.", target: "#tour-to-search", action: "#tour-to-search", wait: "mode"}
        ,{id: "26", step: 4, text: "The search mode has the same UI/UX as the live mode: the same table/tree/bar chart views and the same filtering options. The main difference is that no data is automatically loaded into this view.", target: null}
        ,{id: "27", step: 4, text: "To load data into this dashboard, perform a search. From, To, and the magnifying-glass Search button share a border on the right of the toolbar. Use each native date/time picker to choose a date and time. Its display format follows your browser settings. Both dates are optional. Leave both empty and click the magnifying-glass icon to search all requests. Note though, that any set (UI-)filters are still applied.", target: ".tour-search-controls", action: ".tour-search-controls input, .tour-search-controls button, .tour-search-controls select"}
        ,{id: "28", step: 4, text: "In the tree and table view, you can load more data through infinite scrolling. Alternatively, click the double down-arrow over a tray (Load all), outside the bordered From/To/Search group. While loading, it becomes a stop square. The left-arrow with green broadcast waves returns to Live mode.", target: null, action: "#tour-load-all", wait: "loaded"}
        ,{id: "29", step: 4, text: "And that's it! This tour covered the most important features of NPlusOne. You're now all set to try the tool out on your actual application. If anything is still unclear, about either this application or the required setup, then please check the [FAQ].\n\nIf you want to view this tour again, just go to Help at the top right and click 'Start tour'. You can select the checkbox below to avoid this tour popping up the next time you open NPlusOne in your browser.", target: null}    ];
    pages.forEach((page, i) => {
        if (i === 0 && globalThis.nplusoneCallRequestsTasks) page.text += ' All includes unassociated SQL queries. The briefcase icon (Tasks) shows only tasks and their associated SQL queries.';
        if (globalThis.nplusoneCallRequestsTasks) page.text = page.text?.replace(/\brequests\b/g, "tasks").replace(/\brequest\b/g, "task").replace(/\bRequest\b/g, "Task");
        page.id ??= String(i + 1); page.step ??= i === 0 ? 0 : 1;
        if (page.id === "5") { page.wait = "quick"; }
        if (page.id === "7") { page.wait = "query"; }
    });
    progress.max = pages.length - 1;
    const gates = new Set();
    let preparing = false;
    const manyRows = createTourRequests().slice(0, 40).map((row, i) => ({...row,
        start: new Date(Date.now() - ((i * 17) % 40) * 1000).toISOString(),
        sqlRows: row.sqlRows.map((sql, j) => j === 0 ? {...sql, count: 12 + (i * 13) % 97} : sql)}));
    function paragraph(text, label) {
        const p = element("p", "");
        if (label) p.append(element("strong", "", label + " "));
        p.append(document.createTextNode(text));
        return p;
    }
    function renderText() {
        fitStamp = null;
        content.replaceChildren();
        for (const text of pages[index].text.split("\n\n")) {
            const p = paragraph("");
            if (text.includes("[FAQ]")) {
                const [before, after] = text.split("[FAQ]");
                const link = element("a", "tour-faq", "FAQ");
                link.href = "https://github.com/bl-g/NPlusOne/tree/main/faq-and-example-projects";
                link.target = "_blank"; link.rel = "noopener noreferrer";
                p.append(document.createTextNode(before), link, document.createTextNode(after));
            } else {
                const phrase = index === 0 ? "N+1 query issues" : index === 1 ? "their total duration" : null;
                if (phrase && text.includes(phrase)) {
                    const [before, after] = text.split(phrase);
                    const link = button(phrase, index === 0 ? "tour-read-more tour-patterns-open" : "tour-read-more tour-query-time-open",
                        () => showArticle(index === 0 ? "patterns" : "query-time"));
                    p.append(document.createTextNode(before), link, document.createTextNode(after));
                } else p.textContent = text;
            }
            content.append(p);
        }
        if (index === 0) {
            content.append(paragraph("Use Next or Enter to move through the tour. When Next is disabled, Enter activates Skip. Hover over toolbar icons to see their names."));
        }
        if (index === 0 || pages[index].id === "29") {
            const label = element("label", "tour-startup-choice");
            const checkbox = element("input", "tour-hide-startup"); checkbox.type = "checkbox";
            checkbox.checked = readStoredValue(localStorage, HIDE_STARTUP_KEY) === "true";
            checkbox.addEventListener("change", () => {
                try { localStorage.setItem(HIDE_STARTUP_KEY, String(checkbox.checked)); } catch {}
            });
            label.append(checkbox, document.createTextNode("Don't show this tour at startup again")); content.append(label);
        }
        const waiting = !!pages[index].wait && !gates.has(pages[index].id);
        const wasDisabled = next.disabled;
        next.disabled = busy || waiting;
        skip.hidden = !waiting;
        skip.disabled = skipping || busy;
        if (next.disabled) next.classList.remove('tour-next-ready');
        else if (wasDisabled && pages[index].wait) next.classList.add('tour-next-ready');
        schedulePosition();
    }
    function isAllowed(node) {
        return node instanceof Element && (!!node.closest('.filter-draft-dialog, .ruleset-delete-confirm')
            || actionSelector != null && !!node.closest(actionSelector));
    }
    function evaluateGate(action = null, pageId = pages[index].id) {
        if (closed || busy || preparing || pageId !== pages[index].id || gates.has(pageId)) return;
        const step = pages[index], state = session.state();
        let passed = false;
        switch (step.wait) {
            case "quick": passed = !!action?.matches(".longest-query-toggle"); break;
            case "query": passed = demo.querySelector('.call-tree-sql')?.getAttribute('aria-expanded') === 'true'; break;
            case "disclosure": passed = !demo.getElementById('exclusion-body').hidden; break;
            case "new": passed = state.current.id != null; break;
            case "owners": passed = !state.current.paused && state.current.filters.some(filter =>
                filter.field === 'operation' && filter.match === 'contains' && filter.value.trim().toLowerCase() === 'owners')
                && demo.querySelectorAll('.call-tree-request').length === 1
                && demo.querySelector('.call-tree-operation')?.textContent === 'GET /api/orders'; break;
            case "toggle": passed = !!action?.matches('.exclusion-apply, .exclusion-toggle'); break;
            case "search-name": passed = !!action?.closest('.operation-menu') && chosenOperation != null
                && session.filters.operationSearchAction(chosenOperation).applied; break;
            case "cell": passed = !!action?.closest('td.sql, td.stack-trace'); break;
            case "expansion": passed = !!action?.matches('#fully-expand-groups, #collapse-groups'); break;
            case "table-view": passed = state.table; break;
            case "chart-view":
                passed = !state.tree && !state.table;
                if (passed && state.rows.length !== manyRows.length) session.configure({data: manyRows});
                break;
            case "chart-tree": {
                const count = row => row.sqlRows.reduce((sum,q)=>sum+q.count,0);
                const highest = Math.max(...state.rows.map(count));
                passed = state.tree && state.chart.sort === 'sql' && (state.chart.aggregate
                    ? state.chart.focusedKeys.length > 0
                    : state.rows.some(row => count(row) === highest && state.chart.focusedKey === 'server:' + row.id));
                break;
            }
            case "chart-back": passed = !!action?.matches('.chart-back') && !state.tree && !state.table; break;
            case "mode": passed = state.mode === 'search'; break;
            case "loaded": passed = state.total > 0 && state.loaded >= state.total; break;
        }
        if (!passed) return;
        gates.add(pageId); renderText();
        if (step.wait === 'chart-tree') next.click();

    }
    async function skipRequiredAction() {
        const step = pages[index], pageId = step.id;
        if (!step.wait || gates.has(pageId) || skipping) return;
        skipping = true; preparing = true; renderText();
        let action = null;
        const click = selector => {
            const node = demo.querySelector(selector);
            if (!node) throw new Error('The example control is unavailable.');
            if ('disabled' in node) node.disabled = false;
            node.click(); return node;
        };
        const set = (selector, value) => {
            const node = demo.querySelector(selector);
            node.value = value;
            node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
        };
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        try {
            switch (step.wait) {
                case 'quick': action = click('.longest-query-toggle'); break;
                case 'query':
                    action = demo.querySelector('.call-tree-sql');
                    if (action.getAttribute('aria-expanded') !== 'true') click('.call-tree-sql');
                    break;
                case 'disclosure':
                    if (demo.getElementById('exclusion-body').hidden) action = click('.exclusion-summary');
                    break;
                case 'new': if (!session.state().current.id) action = click('.ruleset-new'); break;
                case 'owners': {
                    click('.exclusion-cancel-edit');
                    set('#filter-query', '');
                    const existing = session.state().current.filters.find(filter => filter.field === 'operation'
                        && filter.match === 'contains' && filter.value.trim().toLowerCase() === 'owners');
                    if (existing) action = click(`[data-filter-id="${existing.id}"] .exclusion-apply`);
                    else {
                        const names = new Set(session.state().current.filters.map(filter => filter.name?.toLowerCase()));
                        let name = 'Owners', number = 2;
                        while (names.has(name.toLowerCase())) name = 'Owners ' + number++;
                        set('#filter-name', name); set('#exclusion-field', 'operation');
                        set('#exclusion-match', 'contains'); set('#exclusion-value', 'owners');
                        action = click('.exclusion-form .exclusion-primary');
                    }
                    break;
                }
                case 'toggle': action = click('.exclusion-apply'); break;
                case 'search-name':
                    chosenOperation = demo.querySelector('.call-tree-operation').textContent;
                    click('.call-tree-operation');
                    action = session.filters.operationSearchAction(chosenOperation).applied
                        ? demo.querySelector('.operation-menu button') : click('.operation-menu button');
                    break;
                case 'cell': action = click('td.sql'); break;
                case 'expansion': action = click('#fully-expand-groups'); break;
                case 'table-view': action = click('#view-table'); break;
                case 'chart-view': action = click('#view-bar-chart'); break;
                case 'chart-tree': {
                    if (session.state().tree || session.state().table) {
                        const backToChart = demo.querySelector('.chart-back');
                        click(backToChart && !backToChart.hidden ? '.chart-back' : '#view-bar-chart');
                    }
                    click('[data-sort="sql"]');
                    const descending = [...demo.querySelectorAll('.chart-controls button')].find(button => button.textContent === 'DESC');
                    descending.disabled = false; descending.click();
                    demo.querySelector('.table-scroll').scrollTop = 0;
                    await frame(); await frame();
                    if (closed || pages[index].id !== pageId) return;
                    click('.chart-operation'); action = click('.chart-popup [data-view="tree"]');
                    break;
                }
                case 'chart-back': action = click('.chart-back'); break;
                case 'mode': action = click('#tour-to-search'); break;
                case 'loaded': {
                    action = demo.querySelector('#tour-load-all');
                    if (action.textContent === 'Load all') click('#tour-load-all');
                    const deadline = performance.now() + 10000;
                    while (!closed && session.state().loaded < session.state().total) {
                        if (performance.now() > deadline) throw new Error('The example results took too long to load.');
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    break;
                }
            }
        } catch (error) {
            announcements.textContent = error.message;
        } finally {
            preparing = false; skipping = false;
            if (!closed && pages[index].id === pageId) {
                lockControls(); evaluateGate(action, pageId); renderText();
                if (pages[index].id === pageId && gates.has(pageId) && !announcements.textContent) next.click();
            }
        }
    }
    function loadDemo() {
        if (observer) return;
        demo.addEventListener("click", event => {
            if (main.contains(event.target) || event.target.closest('.chart-popup, .operation-toast, .hidden-query-popup')) handleDemoClick(event);
        }, {capture: true, signal: controller.signal});
        demo.addEventListener("submit", event => {
            if (main.contains(event.target) && !preparing) setTimeout(() => evaluateGate(event.target), 0);
        }, {capture: true, signal: controller.signal});
        demo.addEventListener("keydown", event => {
            if (event.key === "Tab") {
                const scope = article ?? main.querySelector('dialog[open]') ?? dialog;
                const controls = [...scope.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')];
                if (!article && actionSelector) controls.push(...demo.querySelectorAll(actionSelector));
                const visible = controls.filter(node => node && !node.disabled && node.getClientRects().length > 0);
                const current = visible.indexOf(demo.activeElement);
                const nextIndex = current < 0 ? (event.shiftKey ? visible.length-1 : 0)
                    : (current + (event.shiftKey ? -1 : 1) + visible.length) % visible.length;
                if (visible.length) { event.preventDefault(); visible[nextIndex].focus({preventScroll: !article}); }
                return;
            }
            if (event.key === 'Escape' && main.querySelector('dialog[open]')) return;
            if (event.key === 'Escape' || event.altKey) { keydown(event); return; }
            if (event.key === 'Enter' && !article && (!event.target.closest('input, textarea, select')
                    || event.target.classList.contains('tour-hide-startup'))) {
                keydown(event); return;
            }
            if (main.contains(event.target) && ['Enter',' '].includes(event.key) && !isAllowed(event.target)) {
                event.preventDefault(); event.stopImmediatePropagation();
            }
        }, {capture: true, signal: controller.signal});
        window.addEventListener("scroll", schedulePosition, {capture: true, signal: controller.signal});
        window.addEventListener("resize", schedulePosition, {signal: controller.signal});
        window.addEventListener("pagehide", () => close(false), {signal: controller.signal});
        observer = new MutationObserver(() => { lockControls(); schedulePosition(); evaluateGate(); });
        observer.observe(main, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']});
    }
    function lockControls() {
        for (const control of demo.querySelectorAll("main button, main input, main select, main textarea, main a, main summary, main [tabindex], .chart-popup button, .hidden-query-popup button, .operation-toast button")) {
            if (!controlStates.has(control)) controlStates.set(control, {
                disabled: "disabled" in control ? control.disabled : null,
                tabindex: control.getAttribute("tabindex")
            });
            const allowed = !!control.closest('.filter-draft-dialog, .ruleset-delete-confirm')
                || actionSelector != null && control.matches(actionSelector);
            if ("disabled" in control && control.disabled === allowed) control.disabled = !allowed;
            control.toggleAttribute("data-tour-locked", !allowed);
            if (!allowed) control.setAttribute("tabindex", "-1"); else control.removeAttribute("tabindex");
            control.classList.toggle("tour-action-glow", allowed && ["5", "7", "9", "10", "25"].includes(pages[index].id) && control.tagName === "BUTTON");
        }
    }
    function allow(selector, target = selector) {
        actionSelector = selector; targetSelector = target; lockControls(); position();
    }
    function handleDemoClick(event) {
        if (preparing) return;
        const action = event.target.closest('.filter-draft-dialog button, .ruleset-delete-confirm button')
            ?? (actionSelector && event.target.closest(actionSelector));
        if (!action) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        const pageId = pages[index].id;
        if (action.matches('.call-tree-operation')) chosenOperation = action.textContent;
        setTimeout(() => { if (!closed) { lockControls(); schedulePosition(); evaluateGate(action, pageId); } }, 0);
    }
    function preparePage(id) {
        if (Number(id) <= 7) session.reset({slowest: Number(id) >= 6});
        switch (id) {
            case '7.1': session.configure({view:'tree', display:'sql-paths', slowest:false}); break;
            case '8': session.configure({slowest: false}); break;
            case '9': session.configure({data: createTourRequests().slice(0,2), view:'tree', slowest:false, clearFilters:true, openFilters:false}); break;
            case '12': session.configure({openFilters:false}); break;
            case '13': case '14': case '16': session.configure({openFilters:true}); break;
            case '15': session.configure({openFilters:false}); break;
            case '17': session.configure({data:createTourRequests().slice(0,2), tableDisplay:'expanded', slowest:false, clearFilters:true, openFilters:false}); break;
            case '18': case '19':
                if (!session.state().table) session.configure({view:'table', data:createTourRequests().slice(0,2)});
                break;
            case '19.1': session.configure({view:'table', tableDisplay:'expanded', slowest:false}); break;
            case '19.2': session.configure({view:'table', tableDisplay:'expanded', slowest:false}); break;
            case '20': session.configure({slowest:false, clearFilters:true, openFilters:false}); break;
            case '24': session.configure({data:createTourRequests().slice(0,6), view:'tree', display:'collapsed', slowest:false, clearFilters:true, openFilters:false, searchMode:false}); session.startStream(); break;
            case '26': session.configure({view:'tree', display:'collapsed', searchMode:true}); break;
            case '28': session.search(); setTimeout(() => { if (!closed && pages[index].id === '28') session.infinite(); }, 600); break;
            case '29': session.stopStream(); break;
        }
    }
    function showPage(page) {
        if (busy || closed || page < 0 || page >= pages.length) return;
        resetDraggedPosition();
        index = page; busy = true; failed = false; next.classList.remove('tour-next-ready');
        const step = pages[page];
        dialog.dataset.page = step.id;
        dialog.dataset.pageIndex = String(page);
        const centered = !step.target;
        dialog.classList.toggle('tour-centered', centered);
        dialog.setAttribute('aria-modal', String(page === 0 || step.id === '29'));
        backdrop.hidden = page !== 0 && step.id !== '29';
        demo.documentElement.classList.toggle('tour-focused', page > 0);
        demo.documentElement.classList.toggle('tour-show-all', step.step >= 2);
        counter.textContent = 'Step ' + step.step + '/4'; progress.value = page;
        progress.setAttribute('aria-valuetext', 'Page ' + (page + 1) + ' of ' + pages.length + ', step ' + step.step + ' of 4');
        heading.textContent = page === 0 ? 'Welcome to NPlusOne' : step.id === '29' ? "You're ready" :
            ['','Tree view','Apply filters','Table & Bar chart view','Search mode'][step.step];
        next.textContent = page === pages.length-1 ? 'Finish' : 'Next';
        back.disabled = page === 0; announcements.textContent = '';
        renderText(); body.scrollTop = 0;
        preparing = true;
        try {
            loadDemo(); preparePage(step.id); allow(step.action ?? null, step.target);
        } catch (error) {
            failed = true; announcements.textContent = error.message + ' Choose Retry, Back or close the tour.';
        } finally {
            preparing = false; busy = false; renderText();
            if (failed) { next.disabled = false; next.textContent = 'Retry'; }
            position(); next.focus({preventScroll:true});
        }
    }
    function hideHighlights() {
        shade.hidden = true;
        shade.setAttribute("hidden", "");
        spotlights.forEach(node => { node.hidden = true; });
    }
    function position() {
        if (closed) return;
        fitCard();
        applyDraggedPosition();
        if (busy || article || !targetSelector) { hideHighlights(); return; }
        const request = demo.querySelector(".call-tree-request");
        const scope = ["2","3","4","6","7"].includes(pages[index].id) ? request : demo;
        const bounds = main.getBoundingClientRect();
        const scroller = demo.querySelector(".table-scroll");
        const clip = scroller.getBoundingClientRect();
        const rects = [...(scope?.querySelectorAll(targetSelector) ?? [])].filter(node => node.getClientRects().length).map(node => {
            const rect = node.getBoundingClientRect();
            let right = rect.right;
            // For the four-query comparison, highlight the text and count rather
            // than the empty remainder of each line, leaving room for the copy.
            if (pages[index].id === "4" && node.matches(".call-tree-query")) {
                const range = demo.createRange();
                range.selectNodeContents(node.querySelector(".call-tree-sql"));
                right = Math.min(right, range.getBoundingClientRect().right + 8);
            }
            return {left: Math.max(bounds.left, rect.left), right: Math.min(bounds.right, right),
                top: Math.max(bounds.top, rect.top, scroller.contains(node) ? clip.top : bounds.top),
                bottom: Math.min(bounds.bottom, rect.bottom, scroller.contains(node) ? clip.bottom : bounds.bottom)};
        }).filter(rect => rect.right > rect.left && rect.bottom > rect.top);
        if (!rects.length) { hideHighlights(); return; }
        while (spotlights.length < rects.length) {
            const border = element("div", "tour-spotlight");
            border.setAttribute("aria-hidden", "true");
            spotlights.push(border); document.body.append(border);
        }
        spotlights.forEach((border, i) => {
            border.hidden = i >= rects.length;
            if (border.hidden) return;
            const rect = rects[i];
            Object.assign(border.style, {left: `${rect.left}px`, top: `${rect.top}px`,
                width: `${rect.right - rect.left}px`, height: `${rect.bottom - rect.top}px`});
        });
        const width = document.documentElement.clientWidth, height = window.innerHeight;
        shade.setAttribute("viewBox", `0 0 ${width} ${height}`);
        shade.innerHTML = `<defs><mask id="tour-highlight-mask"><rect width="${width}" height="${height}" fill="white"/>`
            + rects.map(rect => `<rect x="${rect.left - 2}" y="${rect.top - 2}" width="${rect.right - rect.left + 4}" height="${rect.bottom - rect.top + 4}" rx="5" fill="black"/>`).join("")
            + `</mask></defs><rect width="${width}" height="${height}" fill="#172033" fill-opacity=".21" mask="url(#tour-highlight-mask)"/>`;
        shade.hidden = false;
        shade.removeAttribute("hidden");
        shade.dataset.count = String(rects.length);
        const important = [];
        for (const node of scope?.querySelectorAll(targetSelector) ?? []) important.push(...dataRects(node));
        if (actionSelector) {
            for (const node of demo.querySelectorAll(actionSelector)) {
                if (!node.disabled && node.getClientRects().length) important.push(...dataRects(node));
            }
        }
        const target = {left: Math.min(...rects.map(rect => rect.left)), right: Math.max(...rects.map(rect => rect.right)),
            top: Math.min(...rects.map(rect => rect.top)), bottom: Math.max(...rects.map(rect => rect.bottom))};
        placeCard(target, important);
    }
    function fitCard() {
        const viewportWidth = demo.documentElement.clientWidth, viewportHeight = window.innerHeight;
        const stamp = [index, articleMode, viewportWidth, viewportHeight, skip.hidden, announcements.textContent].join('|');
        if (fitStamp === stamp) return;
        fitStamp = stamp;
        dialog.style.maxHeight = 'none';
        let maxWidth = Math.max(1, viewportWidth - 24), maxHeight = Math.max(1, viewportHeight - 24);
        if (article) {
            dialog.style.width = Math.min(maxWidth, 960) + 'px';
            dialog.style.maxHeight = maxHeight + 'px';
            dialog.style.setProperty('--tour-copy-size', '14px');
            dialog.style.setProperty('--tour-spacing', '16px');
            return;
        }
        if (pages[index].id === '21') {
            const operation = demo.querySelector('.chart-operation')?.getBoundingClientRect();
            const controls = demo.querySelector('.chart-controls')?.getBoundingClientRect();
            if (operation) {
                const gutter = Math.max(operation.left - 28, viewportWidth - operation.right - 28);
                if (gutter >= 160) maxWidth = Math.min(maxWidth, gutter);
            }
            if (controls && viewportHeight - controls.bottom > 240)
                maxHeight = Math.min(maxHeight, viewportHeight - controls.bottom - 28);
        }
        fitWidthLimit = maxWidth;
        let width = Math.min(maxWidth, dialog.classList.contains('tour-centered') || article ? 640 : 440);
        let font = viewportWidth <= 850 ? 13 : 14;
        dialog.style.width = width + 'px';
        dialog.style.setProperty('--tour-copy-size', font + 'px');
        dialog.style.setProperty('--tour-spacing', '16px');
        while (dialog.offsetHeight > maxHeight && width < maxWidth) {
            width = Math.min(maxWidth, width + 80); dialog.style.width = width + 'px';
        }
        while (dialog.offsetHeight > maxHeight && font > 6) {
            font -= .5;
            dialog.style.setProperty('--tour-copy-size', font + 'px');
            dialog.style.setProperty('--tour-spacing', Math.max(4, font) + 'px');
        }
    }
    function dataRects(node) {
        const result = [], viewportWidth = demo.documentElement.clientWidth, viewportHeight = window.innerHeight;
        const clip = node.closest('.table-scroll')?.getBoundingClientRect();
        const add = rect => {
            const left = Math.max(0, rect.left), right = Math.min(viewportWidth, rect.right);
            const top = Math.max(0, rect.top, clip?.top ?? 0), bottom = Math.min(viewportHeight, rect.bottom, clip?.bottom ?? viewportHeight);
            if (right > left && bottom > top) result.push({left, right, top, bottom});
        };
        if (!node.getClientRects().length) return result;
        const walker = demo.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let text, count = 0;
        while ((text = walker.nextNode()) && count++ < 500) {
            if (!text.textContent.trim()) continue;
            const range = demo.createRange(); range.selectNodeContents(text);
            for (const rect of range.getClientRects()) add(rect);
        }
        // Small click targets and editable controls need their entire hit area clear.
        const controls = node.matches('button, input, select, textarea, a') ? [node] : [];
        controls.push(...node.querySelectorAll('button, input, select, textarea, a'));
        for (const control of controls) {
            if (!control.getClientRects().length) continue;
            const rect = control.getBoundingClientRect();
            if (rect.width <= 280 || control.matches('input, select, textarea')) add(rect);
        }
        return result;
    }
    function placeCard(target, important, attempt = 0) {
        if (draggedPosition) return;
        const margin = 12, gap = 16;
        const width = dialog.offsetWidth, height = dialog.offsetHeight;
        const viewportWidth = demo.documentElement.clientWidth, viewportHeight = window.innerHeight;
        const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
        const centerX = (target.left + target.right) / 2, centerY = (target.top + target.bottom) / 2;
        const candidates = [
            {side: 'below', x: centerX - width / 2, y: target.bottom + gap},
            {side: 'above', x: centerX - width / 2, y: target.top - height - gap},
            {side: 'right', x: target.right + gap, y: centerY - height / 2},
            {side: 'left', x: target.left - width - gap, y: centerY - height / 2}
        ];
        if (viewportWidth <= 850) candidates.unshift({side:'bottom',x:margin,y:viewportHeight-height-margin});
        for (const x of [margin, centerX - width / 2, viewportWidth - width - margin]) {
            for (const y of [target.top + gap, target.bottom + gap, centerY - height / 2, margin, viewportHeight - height - margin])
                candidates.push({side: 'overlay', x, y});
        }
        for (const candidate of candidates) {
            const x = clamp(candidate.x, margin, viewportWidth - width - margin);
            const y = clamp(candidate.y, margin, viewportHeight - height - margin);
            const area = rect => Math.max(0, Math.min(x + width, rect.right + 5) - Math.max(x, rect.left - 5))
                * Math.max(0, Math.min(y + height, rect.bottom + 5) - Math.max(y, rect.top - 5));
            const overlap = important.reduce((sum, rect) => sum + area(rect), 0);
            candidate.overlap = overlap;
            const inkDistance = Math.abs(x + width / 2 - centerX) + Math.abs(y + height / 2 - centerY);
            candidate.score = overlap * 10000 + Math.abs(x-candidate.x) + Math.abs(y-candidate.y)
                + (candidate.side === 'overlay' ? 50 : 0) + inkDistance * .01;
            candidate.x = x; candidate.y = y;
        }
        candidates.sort((a,b) => a.score-b.score);
        const chosen = candidates[0];
        if (chosen.overlap > 0 && width < fitWidthLimit && attempt < 12) {
            dialog.style.width = Math.min(fitWidthLimit, width + 80) + 'px';
            placeCard(target, important, attempt + 1);
            return;
        }
        dialog.dataset.placement = chosen.side;
        dialog.style.left = chosen.x + 'px'; dialog.style.top = chosen.y + 'px';
        dialog.style.setProperty('--tour-pointer-x', clamp(centerX-chosen.x,20,width-20) + 'px');
        dialog.style.setProperty('--tour-pointer-y', clamp(centerY-chosen.y,20,height-20) + 'px');
    }
    function schedulePosition() {
        if (renderFrame != null) return;
        renderFrame = requestAnimationFrame(() => { renderFrame = null; position(); });
    }
    function showArticle(mode = "query-time") {
        resetDraggedPosition();
        fitStamp = null;
        article?.remove();
        articleMode = mode;
        top.hidden = layout.hidden = true; hideHighlights();
        backdrop.hidden = false;
        dialog.setAttribute("aria-modal", "true");
        dialog.classList.add("tour-reading");
        article = createTourArticle(mode, hideArticle);
        dialog.append(article);
        dialog.removeAttribute('aria-label');
        dialog.setAttribute('aria-labelledby', 'tour-article-title');
        position();
        article.querySelector('h2').focus({preventScroll: true});
    }
    function hideArticle() {
        resetDraggedPosition();
        dialog.style.maxHeight = "";
        article?.remove(); article = null; articleMode = null; top.hidden = layout.hidden = false;
        dialog.classList.remove("tour-reading");
        dialog.setAttribute("aria-modal", String(index === 0));
        backdrop.hidden = index !== 0;
        dialog.removeAttribute("aria-label"); dialog.setAttribute("aria-labelledby", "tour-heading");
        position(); content.querySelector(index === 0 ? ".tour-patterns-open" : ".tour-query-time-open").focus({preventScroll: true});
    }
    function keydown(event) {
        if (event.key === "Enter" && !article) {
            event.preventDefault();
            if (next.disabled && !skip.hidden) skip.click();
            else next.click();
            return;
        }
        if (event.key === "Escape") { event.preventDefault(); if (article) hideArticle(); else close(false); }
        else if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); if (!article) next.click(); }
        else if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); if (article) hideArticle(); else back.click(); }
    }
    function close(completed) {
        if (closed) return;
        closed = true; controller.abort(); observer?.disconnect(); resize.disconnect();
        if (renderFrame != null) cancelAnimationFrame(renderFrame);
        for (const [control, saved] of controlStates) {
            if (saved.disabled != null) control.disabled = saved.disabled;
            if (saved.tabindex == null) control.removeAttribute("tabindex"); else control.setAttribute("tabindex", saved.tabindex);
            control.removeAttribute("data-tour-locked"); control.classList.remove("tour-action-glow");
        }
        demo.documentElement.classList.remove("tour-active", "tour-focused", "tour-show-all");
        dialog.remove(); spotlights.forEach(node => node.remove()); shade.remove(); backdrop.remove();
        session.close();
        if (completed) {
            demo.getElementById('view-tree').click();
            demo.getElementById('tree-show-sql-paths').click();
        }
        onClose(completed);
    }
    const resize = new ResizeObserver(schedulePosition);
    resize.observe(main);
    resize.observe(dialog);
    showPage(0);
    return {close};
}

function element(tag, className, text) {
    const result = document.createElement(tag); result.className = className;
    if (text != null) result.textContent = text;
    return result;
}
function button(text, className, action, label) {
    const result = element("button", className, text); result.type = "button";
    if (label) result.setAttribute("aria-label", label);
    result.addEventListener("click", action);
    return result;
}
