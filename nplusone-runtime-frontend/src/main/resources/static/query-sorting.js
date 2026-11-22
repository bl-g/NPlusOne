const defaultDirection = order => order === "time" ? "asc" : "desc";

export function sortQueries(queries, order, direction = defaultDirection(order)) {
    const value = query => order === "time" ? query.start?.replace(/(?:\.(\d+))?Z$/, (_, fraction = "") => `.${fraction.padEnd(9, "0")}Z`)
        : order === "duration" ? query.jdbcDurationMillis : query.sqlCount ?? query.count;
    const timestamps = order === "time" ? new Map(queries.map(query => [query, value(query)])) : null;
    return [...queries].sort((left, right) => {
        const a = timestamps ? timestamps.get(left) : value(left), b = timestamps ? timestamps.get(right) : value(right);
        if (a == null) return b == null ? 0 : 1;
        if (b == null) return -1;
        const comparison = order === "time" ? (a < b ? -1 : a > b ? 1 : 0) : a - b;
        return direction === "asc" ? comparison : -comparison;
    });
}

export function createQuerySortingControl(onChange) {
    const control = document.getElementById("query-sort-controls");
    let order = "count";
    let directions = new Map();
    const direction = () => directions.get(order) ?? defaultDirection(order);
    const buttons = [...control.querySelectorAll("button[data-query-sort]")];
    const directionButtons = [...control.querySelectorAll("button[data-query-sort-direction]")];
    const update = () => {
        buttons.forEach(button => {
            const selected = button.dataset.querySort === order;
            button.classList.toggle("filter-button-active", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
        directionButtons.forEach(button => {
            const selected = button.dataset.querySortDirection === direction();
            button.classList.toggle("filter-button-active", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
    };
    buttons.forEach(button => button.addEventListener("click", () => {
        if (order === button.dataset.querySort) return;
        order = button.dataset.querySort;
        update();
        onChange();
    }));
    directionButtons.forEach(button => button.addEventListener("click", () => {
        const next = button.dataset.querySortDirection;
        if (next === direction()) return;
        directions.set(order, next);
        update();
        onChange();
    }));
    update();
    return {sort: queries => sortQueries(queries, order, direction()),
        beginTour() {
            const saved = {order, directions};
            order = "count";
            directions = new Map();
            update();
            return {restore() { ({order, directions} = saved); update(); }};
        }};
}
