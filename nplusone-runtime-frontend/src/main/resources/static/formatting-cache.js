// Bound both entry count and text size: a few very large statements should not
// turn a formatting optimisation into another unbounded copy of the history.
export function createFormattingCache(format, {maxEntries = 1000, maxCharacters = 2_000_000} = {}) {
    const entries = new Map();
    let characters = 0;
    return text => {
        const input = text ?? "";
        const cached = entries.get(input);
        if (cached != null) {
            entries.delete(input);
            entries.set(input, cached);
            return cached.value;
        }
        const value = format(input);
        const size = input.length + value.summary.length + value.full.length;
        if (size > maxCharacters || maxEntries <= 0) return value;
        while (entries.size >= maxEntries || characters + size > maxCharacters) {
            const oldest = entries.keys().next().value;
            characters -= entries.get(oldest).size;
            entries.delete(oldest);
        }
        entries.set(input, {value, size});
        characters += size;
        return value;
    };
}
