export function requestText(text) {
    return globalThis.nplusoneCallRequestsTasks
        ? text.replace(/\bRequests\b/g, 'Tasks').replace(/\bRequest\b/g, 'Task')
            .replace(/\brequests\b/g, 'tasks').replace(/\brequest\b/g, 'task')
        : text;
}
