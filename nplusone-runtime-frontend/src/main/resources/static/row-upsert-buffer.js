// Row upserts contain cumulative snapshots. Keep only the latest snapshot per
// typed ID while a dashboard is paused or temporarily displaying tour data.
export function createRowUpsertBuffer(updates = []) {
    const servers = new Map();
    const unassociated = new Map();
    function add(update) {
        for (const row of update.serverRowUpserts ?? []) servers.set(row.id, row);
        for (const row of update.unassociatedRowUpserts ?? []) unassociated.set(row.id, row);
    }
    function snapshot() {
        return {serverRowUpserts: [...servers.values()], unassociatedRowUpserts: [...unassociated.values()]};
    }
    for (const update of updates) add(update);
    return {
        add, snapshot,
        get size() { return servers.size + unassociated.size; },
        deleteServer: id => servers.delete(id),
        deleteUnassociated: id => unassociated.delete(id),
        drain() {
            const update = snapshot();
            servers.clear(); unassociated.clear();
            return update;
        }
    };
}
