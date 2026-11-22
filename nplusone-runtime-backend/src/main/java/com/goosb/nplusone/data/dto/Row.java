package com.goosb.nplusone.data.dto;

import com.goosb.nplusone.data.RowCursor;

import java.time.Instant;

/**
 * A row as consumed by the client (in the typical setup, that would be the front-end project).
 * <p>
 * 'Row' here does not mean a database row, but rather a row in a table displayed to a user.
 */
public interface Row {

    String id();
    RowCursor cursor();
    Instant start();
    RowType rowType();
}
