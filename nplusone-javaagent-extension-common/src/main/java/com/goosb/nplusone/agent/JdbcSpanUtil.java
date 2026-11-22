package com.goosb.nplusone.agent;

import com.goosb.nplusone.common.TelemetryKey;

import io.opentelemetry.sdk.trace.ReadableSpan;

public final class JdbcSpanUtil {

    public static final String JDBC_INSTRUMENTATION_SCOPE_NAME = TelemetryKey.JDBC_INSTRUMENTATION_SCOPE.getName();

    private JdbcSpanUtil() {
        // util class
    }

    public static boolean isNotEmittedByJdbcInstrumentation(
            ReadableSpan span) {
        return !JDBC_INSTRUMENTATION_SCOPE_NAME.equals(span.getInstrumentationScopeInfo().getName());
    }
}
