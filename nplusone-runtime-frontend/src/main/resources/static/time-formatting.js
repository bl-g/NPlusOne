const dateFormatter = new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
function formatDate(value, formatter) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Invalid Date' : formatter.format(date);
}

export function formatDateTimestamp(timestamp) { return formatDate(timestamp, dateFormatter); }

export function formatDuration(durationMillis) {
    if (durationMillis == null) {
        return "";
    }

    const duration = Number(durationMillis);
    if (!Number.isFinite(duration)) return "";
    const positive = Math.max(0, duration);
    if (positive === 0) return "0 ms";
    const rounded = Number(positive.toFixed(positive < 1 ? 2 : 1));
    if (rounded < 1) return `${rounded.toFixed(2)} ms`;
    if (rounded < 10) return `${rounded.toFixed(1)} ms`;
    let remaining = Math.max(0, Math.round(duration));
    if (remaining === 0) return "0 ms";
    const parts = [];
    for (const [size, unit] of [[3_600_000, "h"], [60_000, "m"], [1_000, "s"]]) {
        const value = Math.floor(remaining / size);
        if (value > 0) parts.push(`${value} ${unit}`);
        remaining %= size;
    }
    if (remaining > 0) parts.push(`${remaining} ms`);
    return parts.join(" ");
}

export function sortByNewestTimestamp(items, timestampOf) {
    // Normalize once per row, rather than in each O(n log n) comparison.
    return items.map(item => {
        const time = timestampOf(item);
        const key = time == null ? null : String(time).replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => '.' + fraction.padEnd(9, '0') + 'Z');
        return {item, key};
    }).sort((a, b) => a.key == null ? b.key == null ? 0 : 1 : b.key == null ? -1 : a.key > b.key ? -1 : a.key < b.key ? 1 : 0)
        .map(entry => entry.item);
}
