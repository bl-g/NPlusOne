package com.goosb.nplusone.data.dto;

import java.util.List;

public record RowUpserts(
        List<Row> rows) {

    public RowUpserts {
        rows = List.copyOf(rows);
    }

    public boolean isEmpty() {
        return rows.isEmpty();
    }

    public int rowCount() {
        return rows.size();
    }
}
