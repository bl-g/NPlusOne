export const CHART_ROW_HEIGHT = 38;
export function validAxis(min, max) {
    return Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max > min;
}
export function barGeometry(value, {min, max}) {
    return {percent: Math.max(0, Math.min(100, (value - min) / (max - min) * 100)),
        clipped: value > max ? "high" : value < min ? "low" : ""};
}
export function autoMaximum(highest) {
    if (highest <= 1) return 1;
    const step = 10 ** Math.floor(Math.log10(highest));
    const fraction = highest / step;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * step;
}
export function axisLayout({min, max}) { return {min, max}; }
export function axisTicks({min, max}) {
    const values = new Set([min, max]);
    const rawStep = (max-min)/4;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const fraction = rawStep/magnitude;
    const step = Math.max(1,(fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10)*magnitude);
    const first = Math.ceil(min / step);
    // Bound the loop: adding one can stop changing a very large floating-point value.
    for (let index = 0; index < 8; index++) {
        const value = (first + index) * step;
        if (value >= max) break;
        if (value > min) values.add(value);
    }
    return [...values].sort((a,b)=>a-b).map(value=>({value,percent:(value-min)/(max-min)*100}));
}
export function chartWindow(count, offset, height) {
    const start = Math.min(count, Math.max(0, Math.floor(offset / CHART_ROW_HEIGHT) - 6));
    return {start, end: Math.min(count, Math.max(start, Math.ceil((offset + height) / CHART_ROW_HEIGHT) + 6))};
}
export function sortChartItems(items, sort, direction = "desc") {
    const order = direction === "asc" ? 1 : -1;
    const timestamp = item => String(item.start ?? '').replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => '.' + fraction.padEnd(9, '0') + 'Z');
    const times = new Map(items.map(item => [item, timestamp(item)]));
    return [...items].sort((a, b) => order * ((sort === "date" ? 0 : a[sort] - b[sort])
        || times.get(a).localeCompare(times.get(b))) || a.key.localeCompare(b.key));
}
