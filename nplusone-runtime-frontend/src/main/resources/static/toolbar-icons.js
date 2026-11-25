const shapes = {
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>',
    average: '<path d="M5 5h14M7 10l10 10m0-10L7 20" stroke="currentColor" stroke-width="2"/>',
    all: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    tasks: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3M3 12h18m-11 0v3h2v-3"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 9v11"/>',
    tree: '<g stroke="currentColor"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="15" y="10" width="5" height="5" rx="1"/><rect x="15" y="18" width="5" height="5" rx="1"/><path d="M5.5 8v12.5H15M5.5 12.5H15"/></g>',
    chart: '<rect x="3" y="3" width="18" height="4" rx="1" fill="currentColor" stroke="none"/><rect x="3" y="10" width="11" height="4" rx="1" fill="currentColor" stroke="none"/><rect x="3" y="17" width="15" height="4" rx="1" fill="currentColor" stroke="none"/>',
    expandFull: '<path d="m6 5 6 6 6-6M6 13l6 6 6-6"/>',
    expand: '<path d="m6 9 6 6 6-6"/>',
    collapse: '<path d="m6 15 6-6 6 6"/>',
    sqlPaths: '<path d="M5 4v13h6M5 9h6"/><ellipse cx="16" cy="8" rx="5" ry="2.5"/><path d="M11 8v9c0 3.3 10 3.3 10 0V8M11 12.5c0 3.3 10 3.3 10 0"/>',
    asc: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
    desc: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    play: '<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none"/>',
    searchMode: '<g stroke="currentColor"><circle cx="7" cy="8" r="4.5"/><path d="m10.5 11.5 3 3"/></g><path d="M16 19h6m-3-3 3 3-3 3"/>',
    search: '<circle cx="10" cy="10" r="6.5" stroke="currentColor"/><path d="m15 15 6 6"/>',
    liveMode: '<path d="M8 12H2m3-3-3 3 3 3"/><g stroke="currentColor"><circle cx="17" cy="12" r="2" fill="currentColor"/><path d="M13 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8"/></g>',
    loadAll: '<path d="m7 3 5 5 5-5M7 9l5 5 5-5M3 16v5h18v-5"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>',
    applied: '<path d="m5 12 4 4L19 6" stroke-width="2.5"/>',
    new: '<path d="M14 3H5v18h14V8Z"/><path d="M14 3v5h5M8 14h8m-4-4v8"/>',
    duplicate: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    delete: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    import: '<path d="M12 3v12m-5-5 5 5 5-5M3 15v6h18v-6"/>',
    export: '<path d="M12 15V3m-5 5 5-5 5 5M3 15v6h18v-6"/>',
    clear: '<path d="m14 3 7 7-10 10H6l-4-4L14 3Zm-7 8 7 7M11 20h11"/>',
    filters: '<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',
    duration: '<circle cx="12" cy="14" r="7.5"/><path d="M9 2h6m-3 0v4m6 2 2-2m-8 4v5l3 2"/>',
    slowest: '<circle cx="8" cy="14" r="6"/><path d="M6 5h4M8 5v3m0 3v4l2 1M17 9h5m-5 5h3m-3 5h1"/>',
    sqlCount: '<g stroke="currentColor"><ellipse cx="9" cy="5" rx="6.5" ry="2.5"/><path d="M2.5 5v12c0 3.3 13 3.3 13 0V5M2.5 10c0 3.3 13 3.3 13 0M2.5 15c0 3.3 13 3.3 13 0"/></g><rect x="10" y="10" width="14" height="14" rx="3" fill="var(--color-surface)" stroke="none"/><path d="m15 12-1 10m7-10-1 10m-8-7h11m-12 5h11" stroke="currentColor" stroke-width="2"/>',
    date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 14h2m4 0h2m-8 4h2m4 0h2"/>',
    nPlusOne: '<g stroke="currentColor"><rect x="1" y="3" width="22" height="18" rx="4"/><path d="M4 16V8l5 8V8m2 4h6m-3-3v6m5-7h1v8" stroke-width="1.6"/></g>'
};

export function createToolbarIcon(name) {
    if (name === 'nPlusOneCount') {
        const icon = createToolbarIcon('nPlusOne');
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        badge.setAttribute('transform', 'translate(12 0)');
        badge.innerHTML = shapes.sqlCount.slice(shapes.sqlCount.indexOf('<rect x="10"'));
        icon.append(badge);
        icon.setAttribute('viewBox', '-2 0 40 24');
        icon.style.width = '34px';
        icon.style.height = '20px';
        return icon;
    }
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.classList.add('toolbar-icon');
    icon.innerHTML = shapes[name];
    if (name === 'nPlusOne') {
        icon.setAttribute('viewBox', '-2 0 28 24');
        icon.querySelector('rect').setAttribute('x', '-1');
        icon.querySelector('rect').setAttribute('width', '26');
        icon.style.width = '24px';
    }
    return icon;
}

export function setButtonIcon(button, name, {label = button.textContent.trim(), showLabel = false,
    title = button.title || label} = {}) {
    const icon = createToolbarIcon(name);
    const text = document.createElement('span');
    text.className = showLabel ? 'toolbar-visible-label' : 'toolbar-icon-label';
    text.textContent = label;
    button.replaceChildren(icon, text);
    button.classList.toggle('toolbar-icon-button', !showLabel);
    if (name === 'nPlusOneCount') button.style.width = '52px';
    button.classList.toggle('toolbar-labeled-button', showLabel);
    button.setAttribute('aria-label', label);
    button.title = title;
}

export function installToolbarIcons() {
    const tasks = globalThis.nplusoneCallRequestsTasks === true;
    const taskButton = document.getElementById("show-server-operations");
    if (taskButton) taskButton.hidden = !tasks;
    if (tasks) for (const node of document.querySelectorAll("th")) node.textContent = node.textContent.replace(/Request/g, "Task");
    for (const [id, icon, label] of [['show-all', 'all', 'All'], ['show-server-operations', 'tasks', 'Tasks'], ['show-n-plus-one-operations', 'nPlusOne', 'N+1']]) {
        const button = document.getElementById(id);
        if (!button) continue;
        const count = button.querySelector('.filter-count');
        setButtonIcon(button, icon, {label});
        button.classList.remove('toolbar-icon-button');
        button.classList.add('scope-icon-button');
        if (count) button.append(count);
    }
    for (const [id, name] of [
        ['view-table', 'table'], ['view-tree', 'tree'], ['view-bar-chart', 'chart'],
        ['fully-expand-groups', 'expandFull'], ['expand-groups', 'expand'], ['collapse-groups', 'collapse'],
        ['tree-expand-full', 'expandFull'], ['tree-show-sql-paths', 'sqlPaths'], ['tree-collapse', 'collapse'],
        ['clear-rows', 'clear'], ['reload-all-rows', 'searchMode'], ['search', 'search'], ['load-all', 'loadAll']
    ]) {
        const button = document.getElementById(id);
        if (button) setButtonIcon(button, name, id === 'reload-all-rows' ? {label: 'To search mode'} : {});
    }
    const liveLink = document.querySelector('.mode-link');
    if (liveLink) setButtonIcon(liveLink, 'liveMode', {label: 'To live mode'});
    for (const button of document.querySelectorAll('[data-query-sort-direction]')) {
        setButtonIcon(button, button.dataset.querySortDirection);
    }
    for (const button of document.querySelectorAll('[data-query-sort]')) {
        setButtonIcon(button, {count: 'sqlCount', duration: 'duration', time: 'date'}[button.dataset.querySort]);
    }
}
