package com.goosb.nplusone.rowupserts;

import com.goosb.nplusone.data.SpanId;
import com.goosb.nplusone.data.db.JdbcSpan;
import com.goosb.nplusone.data.db.ServerSpan;

import java.util.Map;
import java.util.Set;

public record SpansData(
        Set<JdbcSpan> jdbcSpans,
        Map<String, String> stackTraceById,
        Map<String, String> sqlQueryToId,
        Map<SpanId, ServerSpan> serverSpanById) {
}
