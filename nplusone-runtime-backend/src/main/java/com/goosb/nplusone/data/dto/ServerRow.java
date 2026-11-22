package com.goosb.nplusone.data.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.goosb.nplusone.data.RowCursor;

import java.time.Instant;
import java.util.List;

/**
 * A row representing a server span and its associated SQL rows.
 */
public record ServerRow(
        String id,
        @JsonIgnore
        RowCursor cursor,
        Instant start,
        double durationMillis,
        double jdbcDurationMillis,
        String operation,
        List<SqlRow> sqlRows) implements Row {

    public ServerRow {
        sqlRows = List.copyOf(sqlRows);
    }

    @Override
    @JsonProperty
    public RowType rowType() {
        return RowType.SERVER;
    }
}
