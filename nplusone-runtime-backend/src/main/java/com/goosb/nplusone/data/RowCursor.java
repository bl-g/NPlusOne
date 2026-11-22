package com.goosb.nplusone.data;

import com.goosb.nplusone.data.dto.RowType;

import java.time.Instant;

public record RowCursor(
        Instant start,
        RowType rowType,
        String traceId,
        String spanId) implements Comparable<RowCursor> {

    @Override
    public int compareTo(
            RowCursor other) {
        int result = other.start.compareTo(start);
        if(result != 0) {
            return result;
        }

        result = other.rowType.compareTo(rowType);
        if(result != 0) {
            return result;
        }

        result = other.traceId.compareTo(traceId);
        if(result != 0) {
            return result;
        }

        return other.spanId.compareTo(spanId);
    }
}