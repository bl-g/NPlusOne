const ROW_UPSERTS_EVENT_NAME = "rows-upserts";
const SERVER_ROW_TYPE = "SERVER";
const UNASSOCIATED_ROW_TYPE = "UNASSOCIATED";
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

export function connectToTelemetryStream({
    url,
    onStatusChanged,
    onRowUpserts,
    createEventSource = target => new EventSource(target),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    lifecycleTarget = globalThis.window
}) {
    let eventSource = null;
    let retryTimer = null;
    let retryDelay = INITIAL_RETRY_DELAY_MS;
    let disposed = false;
    let pageHidden = false;

    function closeConnection() {
        const previous = eventSource;
        eventSource = null;
        if (previous != null) {
            previous.onopen = previous.onerror = null;
            previous.close();
        }
        if (retryTimer != null) clearTimer(retryTimer);
        retryTimer = null;
    }

    function reconnect() {
        if (disposed || pageHidden || retryTimer != null) return;
        // Own all retries, including fatal HTTP failures where native EventSource
        // stops reconnecting. Close it first to avoid duplicate subscriptions.
        closeConnection();
        onStatusChanged("reconnecting");
        retryTimer = setTimer(() => {
            retryTimer = null;
            connect();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
    }

    function connect() {
        if (disposed || pageHidden) return;
        let source;
        try {
            source = createEventSource(url);
        } catch {
            reconnect();
            return;
        }
        eventSource = source;
        source.onopen = () => {
            if (eventSource !== source || disposed || pageHidden) return;
            retryDelay = INITIAL_RETRY_DELAY_MS;
            onStatusChanged("connected");
        };
        source.onerror = () => {
            if (eventSource === source) reconnect();
        };
        source.addEventListener(ROW_UPSERTS_EVENT_NAME, event => {
            if (eventSource === source && !disposed && !pageHidden) {
                onRowUpserts(splitRows(JSON.parse(event.data)));
            }
        });
    }

    function hidePage() {
        pageHidden = true;
        closeConnection();
    }
    function showPage() {
        if (disposed || !pageHidden) return;
        pageHidden = false;
        retryDelay = INITIAL_RETRY_DELAY_MS;
        onStatusChanged("connecting");
        connect();
    }

    lifecycleTarget?.addEventListener("pagehide", hidePage);
    lifecycleTarget?.addEventListener("pageshow", showPage);
    onStatusChanged("connecting");
    connect();

    return () => {
        disposed = true;
        closeConnection();
        lifecycleTarget?.removeEventListener("pagehide", hidePage);
        lifecycleTarget?.removeEventListener("pageshow", showPage);
    };
}

function splitRows(rowUpserts) {
    const rows = rowUpserts.rows ?? [];
    return {
        serverRowUpserts: rows.filter(row => row.rowType === SERVER_ROW_TYPE),
        unassociatedRowUpserts: rows.filter(row => row.rowType === UNASSOCIATED_ROW_TYPE)
    };
}
