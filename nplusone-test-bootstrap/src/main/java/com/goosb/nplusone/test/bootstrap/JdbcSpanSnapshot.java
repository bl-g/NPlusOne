package com.goosb.nplusone.test.bootstrap;

public record JdbcSpanSnapshot(
        String traceId,
        String spanId,
        String parentSpanId,
        String stackTraceId,
        String sql,
        String stackTrace) {
}
