package com.goosb.nplusone.common;

public enum TelemetryKey {
    /**
     * The name of the instrumentation scope that emits JDBC telemetry.
     * <b>Note:</b> should <i>always</i> match the name used by OpenTelemetry's Java agent.
     */
    JDBC_INSTRUMENTATION_SCOPE("io.opentelemetry.jdbc"),
    STACKTRACE_ID("nplusone.stacktrace.id"),
    ;

    private final String name;

    TelemetryKey(
            String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }
}
