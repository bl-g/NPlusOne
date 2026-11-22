import {formatDateTimestamp} from "./time-formatting.js?v=182362643655531027511278026245356837010";
import {requestText} from "./request-terminology.js?v=9195521797058750261190268690836445467";
import {CHART_ROW_HEIGHT, validAxis, axisLayout, axisTicks, barGeometry, autoMaximum, chartWindow, sortChartItems} from "./bar-chart-model.js?v=110773999397227617541774901621528611862";
import {setButtonIcon} from "./toolbar-icons.js?v=7402158213721210528724430729032752313";

const countFormatter = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2});

export function createBarChart({table, treeView, onChange, live = false, onLoadMore, onLoadAll, onStopLoading, onSearchOperation, getSearchAction}) {
    const scroller = table.parentElement;
    const host = element("section", "operation-chart");
    host.hidden = true;
    host.setAttribute("aria-label", "SQL and N+1 counts per operation instance");
    table.before(host);
    const controls = element("div", "chart-controls filter-control");
    const sortGroup = element('div', 'segmented-control chart-sort-group');
    sortGroup.append(element("span", "filter-label control-group-label", "Sort by"));
    const sortControls = element("div", "segmented-control");
    sortControls.setAttribute("role", "group");
    sortControls.setAttribute("aria-label", "Sort chart by");
    const sortButtons = new Map();
    let sort = "date";
    for (const [value, label] of [["date", "Date"], ["sql", "SQL count"], ["issues", "N+1 count"]]) {
        const button = action(label, () => { sort = value; closePopup(); onChange(); });
        button.dataset.sort = value;
        setButtonIcon(button, {date: 'date', sql: 'sqlCount', issues: 'nPlusOneCount'}[value], {
            title: {date: 'Sort by first execution date', sql: 'Sort by SQL execution count', issues: 'Sort by N+1 issue count'}[value]
        });
        sortButtons.set(value, button);
        sortControls.append(button);
    }
    sortGroup.append(sortControls);
    const directionControls = element("div", "segmented-control");
    directionControls.setAttribute("role", "group");
    directionControls.setAttribute("aria-label", "Sort direction");
    const directionButtons = new Map();
    let direction = "desc";
    for (const value of ["asc", "desc"]) {
        const button = action(value.toUpperCase(), () => { direction = value; closePopup(); onChange(); });
        setButtonIcon(button, value, {title: value === 'asc' ? 'Lowest or earliest first' : 'Highest or latest first'});
        directionButtons.set(value, button);
        directionControls.append(button);
    }
    sortGroup.append(directionControls);
    controls.append(sortGroup);
    let aggregate = false;
    const aggregateButton = action('Average by name', () => { aggregate = !aggregate; closePopup(); onChange(); });
    setButtonIcon(aggregateButton, 'average', {title: requestText('Average SQL and N+1 counts across loaded requests with the same name. Toggle to show individual requests.')});
    aggregateButton.setAttribute('aria-pressed', 'false');
    const aggregateGroup = element('div', 'segmented-control chart-aggregate-group');
    aggregateGroup.setAttribute('role', 'group');
    aggregateGroup.setAttribute('aria-label', requestText('Average requests by name'));
    aggregateGroup.append(aggregateButton);
    controls.append(aggregateGroup);
    const axes = {sql: {min: 0, max: null}, issues: {min: 0, max: null}};
    const axisInputs = {};
    for (const [key, text] of [["sql", "SQL axis"], ["issues", "N+1 axis"]]) {
        const form = element("form", "segmented-control chart-axis");
        form.setAttribute("aria-label", text);
        form.append(element("span", "filter-label", text));
        const box = element("div", "segmented-control chart-axis-box");
        box.setAttribute("role", "group");
        box.setAttribute("aria-label", `${text} range`);
        form.append(box);
        const fields = {};
        function validate() {
            fields.max.setCustomValidity("");
            if (!validAxis(fields.min.valueAsNumber, fields.max.valueAsNumber)) {
                fields.max.setCustomValidity("Use nonnegative counts and a maximum greater than the minimum.");
            }
            return form.checkValidity();
        }
        let edited = false;
        function commit(report = false) {
            if (!validate()) { if (report) form.reportValidity(); return; }
            const min = fields.min.valueAsNumber, max = fields.max.valueAsNumber;
            const current = effectiveAxes[key];
            // Blurring an unchanged auto-scaled field must not freeze its automatic range.
            if (current?.min === min && current?.max === max && !edited) return;
            edited = false;
            axes[key] = {min, max};
            onChange();
        }
        for (const bound of ["min", "max"]) {
            const label = element("label", "filter-label", bound === "min" ? "Min" : "Max");
            const input = element("input");
            input.type = "number";
            input.min = "0";
            input.step = "any";
            input.required = true;
            input.value = bound === "min" ? "0" : "1";
            input.setAttribute("aria-label", `${text} ${bound}`);
            input.addEventListener("input", () => { edited = true; validate(); });
            input.addEventListener("change", () => commit());
            input.addEventListener("blur", () => commit());
            input.addEventListener("keydown", event => {
                if (event.key === "Enter") { event.preventDefault(); commit(true); }
            });
            fields[bound] = input;
            label.append(input);
            box.append(label);
        }
        const auto = action("Auto", () => {
            edited = false;
            axes[key] = {min: 0, max: null};
            fields.min.setCustomValidity("");
            fields.max.setCustomValidity("");
            fields.min.value = "0";
            onChange();
        });
        box.append(auto);
        form.addEventListener("submit", event => {
            event.preventDefault();
            commit(true);
        });
        axisInputs[key] = fields;
        controls.append(form);
    }
    const loading = element("div", "chart-loading segmented-control");
    loading.setAttribute("role", "group");
    loading.setAttribute("aria-label", "Load search results");
    const more = action("Load more", onLoadMore ?? (() => {}));
    const all = action("Load all", onLoadAll ?? (() => {}));
    const stop = action("Stop loading", onStopLoading ?? (() => {}));
    loading.append(more, all, stop);
    controls.append(loading);
    loading.hidden = true;
    const heading = element("div", "chart-row chart-heading");
    const sqlHeading = element("div");
    const issueHeading = element("div");
    heading.append(sqlHeading, element("span", "", `${globalThis.nplusoneCallRequestsTasks ? "Task" : requestText("Request")} (and date/time)`), issueHeading);
    const rows = element("div", "chart-rows");
    rows.style.setProperty("--chart-row-height", `${CHART_ROW_HEIGHT}px`);
    rows.setAttribute("role", "list");
    const empty = element("div", "chart-empty");
    host.append(controls, heading, rows, empty);

    const popup = element("div", "chart-popup");
    popup.hidden = true;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "View operation");
    document.body.append(popup);
    let popupAnchor = null, popupItem = null;
    let focusedKeys = null;
    let focusedKey = null, savedPosition = null, returnPending = false;
    let sorted = [], indices = new Map(), entries = new Map(), effectiveAxes = {};
    let active = false, frame = null;
    const arrivals = new Map();
    const back = action("Back to bar chart", () => {
        focusedKey = null;
        returnPending = true;
        treeView.select("chart");
    });
    back.classList.add("chart-back");
    back.hidden = true;
    const chartButton = document.getElementById("view-bar-chart");
    chartButton.before(back);
    chartButton.addEventListener("click", () => { focusedKey = null; });

    for (const mode of ["table", "tree"]) {
        const viewAction = action(`View in ${mode}`, () => {
            savedPosition = {...capturePosition(), key: popupItem.key,
                inside: scroller.scrollTop - rowsTop() - indices.get(popupItem.key) * CHART_ROW_HEIGHT};
            focusedKey = popupItem.key;
            focusedKeys = new Set(popupItem.memberKeys ?? [popupItem.key]);
            closePopup();
            treeView.select(mode);
            scroller.scrollTop = 0;
        });
        viewAction.dataset.view = mode;
        popup.append(viewAction);
    }
    const searchOperation = action(requestText("Search all requests with this name"), () => {
        const operation = popupItem?.operation;
        closePopup();
        onSearchOperation?.(operation);
    });
    popup.append(searchOperation);
    function closePopup(restoreFocus = false) {
        popup.hidden = true;
        popupAnchor?.setAttribute("aria-expanded", "false");
        if (restoreFocus) popupAnchor?.focus({preventScroll: true});
        popupAnchor = null;
        popupItem = null;
    }
    document.addEventListener("pointerdown", event => {
        if (!popup.hidden && !popup.contains(event.target) && !popupAnchor?.contains(event.target)) closePopup();
    });
    document.addEventListener("keydown", event => {
        if (popup.hidden) return;
        if (event.key === "Escape") { event.preventDefault(); closePopup(true); }
        if (event.key === "Tab") {
            const buttons = [...popup.querySelectorAll("button")].filter(button => !button.hidden && !button.disabled);
            if (!buttons.length) { closePopup(true); return; }
            const index = buttons.indexOf(document.activeElement);
            const next = event.shiftKey ? index - 1 : index + 1;
            event.preventDefault();
            buttons[(next + buttons.length) % buttons.length].focus();
        }
    });
    function rowsTop() { return rows.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop; }
    function capturePosition() {
        const offset = scroller.scrollTop - rowsTop();
        const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(offset / CHART_ROW_HEIGHT)));
        return {key: sorted[index]?.key, inside: offset - index * CHART_ROW_HEIGHT, scroll: scroller.scrollTop};
    }
    function restorePosition(position) {
        if (!position) return;
        const index = indices.get(position.key);
        scroller.scrollTop = index == null ? position.scroll : Math.max(0, rowsTop() + index * CHART_ROW_HEIGHT + position.inside);
    }
    function paintBar(bar, value, range, label) {
        const geometry = barGeometry(value, range);
        bar.style.width = `${geometry.percent}%`;
        bar.textContent = countFormatter.format(value);
        bar.classList.toggle("chart-clipped-high", geometry.clipped === "high");
        bar.classList.toggle("chart-clipped-low", geometry.clipped === "low");
        bar.title = `${value} ${label}; axis ${range.min} to ${range.max}`
            + (geometry.clipped === "high" ? "; above configured maximum"
                : geometry.clipped === "low" ? "; below configured minimum" : "");
        bar.setAttribute("aria-label", bar.title);
    }
    function paintAxis(target, range, text, reversed = false) {
        const title = element("div", "chart-axis-title", text);
        const scale = element("div", `chart-scale${reversed ? " chart-scale-sql" : ""}`);
        scale.setAttribute("aria-label", `${text}: ${range.min} to ${range.max}`);
        for (const {value, percent} of axisTicks(range)) {
            const tick = element("span", "chart-tick");
            tick.style[reversed ? "right" : "left"] = `${percent}%`;
            tick.dataset.edge = percent === 0 ? "start" : percent === 100 ? "end" : "";
            tick.append(element("span", "", value));
            scale.append(tick);
        }
        target.replaceChildren(title, scale);
    }
    function makeEntry(item) {
        const row = element("div", "chart-row chart-data-row");
        row.setAttribute("role", "listitem");
        const left = element("div", "chart-track chart-track-sql");
        const sql = element("span", "chart-bar chart-bar-sql");
        left.append(sql);
        const center = element("div", "chart-center");
        const operation = action(item.operation || "Unassociated", () => {
            if (popupAnchor === operation) { closePopup(); return; }
            closePopup();
            popupItem = entries.get(item.key)?.item ?? item;
            for (const button of popup.querySelectorAll('[data-view]')) {
                button.textContent = `View ${popupItem.sampleCount ? 'all in' : 'in'} ${button.dataset.view}`;
            }
            searchOperation.hidden = item.unassociated || !item.operation;
            if (!searchOperation.hidden) {
                const state = getSearchAction(item.operation);
                searchOperation.textContent = state.label;
                searchOperation.disabled = state.disabled;
            }
            popupAnchor = operation;
            operation.setAttribute("aria-expanded", "true");
            popup.hidden = false;
            const rect = operation.getBoundingClientRect();
            popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`;
            popup.style.top = `${Math.max(8, Math.min(rect.top - popup.offsetHeight - 6, window.innerHeight - popup.offsetHeight - 8))}px`;
            popup.firstElementChild.focus({preventScroll: true});
        });
        operation.className = "chart-operation";
        operation.setAttribute("aria-haspopup", "dialog");
        operation.setAttribute("aria-expanded", "false");
        operation.title = item.operation || "Unassociated";
        if (item.sampleCount) operation.title += requestText(' - average of ' + item.sampleCount + ' requests');
        const timestamp = element("div", "chart-timestamp", formatDateTimestamp(item.start));
        center.append(operation);
        if (item.sampleCount) { timestamp.textContent = requestText(`${item.sampleCount} requests averaged`); center.append(timestamp); }
        else if (!live) center.append(timestamp);
        const right = element("div", "chart-track");
        const issues = element("span", "chart-bar chart-bar-issues");
        right.append(issues);
        row.append(left, center, right);
        const age = Date.now() - (arrivals.get(item.key) ?? 0);
        if (live && age < 2500) {
            row.classList.add("chart-new");
            row.style.setProperty("--chart-glow-delay", `-${age}ms`);
        }
        return {row, sql, issues, item, timestamp};
    }
    function paint() {
        frame = null;
        if (!active) return;
        const range = chartWindow(sorted.length, scroller.scrollTop - rowsTop(), scroller.clientHeight);
        const wanted = new Set();
        let cursor = rows.firstChild;
        for (let index = range.start; index < range.end; index++) {
            const item = sorted[index];
            wanted.add(item.key);
            let entry = entries.get(item.key);
            if (!entry || entry.item.operation !== item.operation || entry.item.start !== item.start) {
                if (entry?.row === cursor) cursor = cursor.nextSibling;
                entry?.row.remove();
                entry = makeEntry(item);
                entries.set(item.key, entry);
            }
            entry.item = item;
            if (item.sampleCount) entry.timestamp.textContent = requestText(item.sampleCount + ' requests averaged');
            if (entry.row !== cursor) rows.insertBefore(entry.row, cursor);
            cursor = entry.row.nextSibling;
            entry.row.style.top = `${index * CHART_ROW_HEIGHT}px`;
            entry.row.setAttribute("aria-posinset", String(index + 1));
            entry.row.setAttribute("aria-setsize", String(sorted.length));
            paintBar(entry.sql, item.sql, effectiveAxes.sql, "SQL executions");
            paintBar(entry.issues, item.issues, effectiveAxes.issues, "N+1 groups");
        }
        for (const [key, entry] of entries) if (!wanted.has(key)) {
            if (popupAnchor && entry.row.contains(popupAnchor)) closePopup();
            entry.row.remove(); entries.delete(key);
        }
    }
    scroller.addEventListener("scroll", () => {
        closePopup();
        if (active && frame == null) frame = requestAnimationFrame(paint);
    }, {passive: true});
    new ResizeObserver(() => { closePopup(); if (active) paint(); }).observe(scroller);

    return {
        tourState: () => ({sort, direction, aggregate, focusedKey, focusedKeys: [...(focusedKeys ?? [])]}),
        beginTour() {
            const saved = {aggregate, focusedKeys, sort, direction, axes: structuredClone(axes), focusedKey, savedPosition, returnPending,
                entries, sorted, indices, arrivals: new Map(arrivals), drafts: Object.values(axisInputs).flatMap(fields => Object.values(fields).map(input => [input, input.value]))};
            entries = new Map(); rows.replaceChildren(); focusedKey = null; savedPosition = null; returnPending = false;
            aggregate = false; sort = "date"; direction = "desc"; axes.sql = {min: 0, max: null}; axes.issues = {min: 0, max: null};
            closePopup(); arrivals.clear();
            return {restore() {
                ({aggregate, focusedKeys, sort, direction, focusedKey, savedPosition, returnPending, entries, sorted, indices} = saved);
                Object.assign(axes, saved.axes); arrivals.clear(); saved.arrivals.forEach((value, key) => arrivals.set(key, value));
                for (const [input, value] of saved.drafts) input.value = value;
                rows.replaceChildren(); closePopup();
            }};
        },
        isActive: () => treeView.isChart(),
        hasFocus: () => focusedKey != null,
        filter: items => focusedKey == null ? items : items.filter(item => focusedKeys?.has(item.key) ?? item.key === focusedKey),
        clearFocus() { focusedKey = null; savedPosition = null; returnPending = false; closePopup(); },
        update(items, {renderEmpty, hasMore = false, busy = false, loadingAll = false} = {}) {
            const wasActive = active;
            const anchor = wasActive ? capturePosition() : null;
            active = treeView.isChart();
            host.hidden = !active;
            table.hidden = active;
            back.hidden = active || savedPosition == null || focusedKey == null;
            chartButton.hidden = !back.hidden;
            loading.hidden = !active || !onLoadMore;
            const now = Date.now();
            const present = new Set(items.map(item => item.key));
            for (const item of items) if (!arrivals.has(item.key)) arrivals.set(item.key, now);
            for (const key of arrivals.keys()) if (!present.has(key)) arrivals.delete(key);
            if (!active) {
                closePopup();
                rows.replaceChildren(); entries.clear(); sorted = []; indices.clear();
                return;
            }
            focusedKey = null;
            if (aggregate) items = averageChartItems(items);
            aggregateButton.classList.toggle('filter-button-active', aggregate);
            aggregateButton.setAttribute('aria-pressed', String(aggregate));
            sorted = sortChartItems(items, sort, direction);
            indices = new Map(sorted.map((item, index) => [item.key, index]));
            for (const [value, button] of sortButtons) {
                button.classList.toggle("filter-button-active", sort === value);
                button.setAttribute("aria-pressed", String(sort === value));
            }
            for (const [value, button] of directionButtons) {
                button.classList.toggle("filter-button-active", direction === value);
                button.setAttribute("aria-pressed", String(direction === value));
            }
            for (const key of ["sql", "issues"]) {
                const highest = items.reduce((max, item) => Math.max(max, item[key]), 1);
                effectiveAxes[key] = axisLayout({min: axes[key].min, max: axes[key].max ?? autoMaximum(highest)}, highest);
                const input = axisInputs[key].max;
                if (axes[key].max == null && document.activeElement !== input) input.value = String(effectiveAxes[key].max);
            }
            paintAxis(sqlHeading, effectiveAxes.sql, aggregate ? "Average SQL count" : "SQL count", true);
            paintAxis(issueHeading, effectiveAxes.issues, aggregate ? "Average N+1 count" : "N+1 count");
            for (const [key, heading] of [['sql',sqlHeading],['issues',issueHeading]]) {
                const range=effectiveAxes[key], above=items.filter(item=>item[key]>range.max).length,
                    below=items.filter(item=>item[key]<range.min).length;
                const summary=element('div','chart-overflow-summary',[
                    above ? `${above} above range` : '', below ? `${below} below range` : ''
                ].filter(Boolean).join(' · '));
                heading.append(summary);
            }

            more.disabled = busy || loadingAll || !hasMore;
            all.disabled = busy || loadingAll || !hasMore;
            stop.hidden = !loadingAll;
            rows.style.height = `${sorted.length * CHART_ROW_HEIGHT}px`;
            empty.hidden = sorted.length > 0;
            if (!sorted.length) renderEmpty?.(empty);
            if (returnPending) { restorePosition(savedPosition); returnPending = false; }
            else if (wasActive && anchor?.scroll > 0) restorePosition(anchor);
            paint();
        }
    };
}

function element(tag, className = "", text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
}
function action(text, callback) {
    const button = element("button", "filter-button", text);
    button.type = "button";
    button.addEventListener("click", callback);
    return button;
}

export function averageChartItems(items) {
    const groups = new Map();
    for (const item of items) {
        const key = JSON.stringify([Boolean(item.unassociated), item.operation ?? '']);
        let group = groups.get(key);
        if (!group) { group = {...item, key: 'average:' + key, sql: 0, issues: 0, sampleCount: 0, memberKeys: []}; groups.set(key, group); }
        group.sql += item.sql;
        group.issues += item.issues;
        group.sampleCount++;
        group.memberKeys.push(item.key);
        if (item.start > group.start) group.start = item.start;
    }
    return [...groups.values()].map(group => ({...group, sql: group.sql / group.sampleCount, issues: group.issues / group.sampleCount}));
}
