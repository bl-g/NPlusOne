let temporarySessions = 0;
export function beginTemporaryPreferences() {
    temporarySessions++;
    let ended = false;
    return () => { if (!ended) { ended = true; temporarySessions--; } };
}

export function readStoredJson(storage, key) {
    try {
        const storedValue = storage.getItem(key);
        return storedValue == null ? null : JSON.parse(storedValue);
    } catch {
        removeStoredValue(storage, key);
        return null;
    }
}

export function writeStoredJson(storage, key, value) {
    if (temporarySessions) return;
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // The feature still works until the current page is refreshed.
    }
}

export function readStoredValue(storage, key) {
    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
}

export function writeStoredValue(storage, key, value) {
    if (temporarySessions) return;
    try {
        storage.setItem(key, value);
    } catch {
        // The preference still works until the current page is refreshed.
    }
}

export function removeStoredValue(storage, key) {
    if (temporarySessions) return;
    try {
        storage.removeItem(key);
    } catch {
        // Browser storage is optional.
    }
}
