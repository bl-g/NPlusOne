package com.goosb.nplusone.common.message;

public enum Info {
    ACCEPTING_OTEL_TRACES_ON_PORT_A("The NPlusOne is accepting OpenTelemetry traces on port {}"),
    RECEIVED_TRACE_EXPORT("Received trace export"),
    FINISHED_TRACE_EXPORT_RUN_TIME_A_WAIT_TIME_B("Finished processing trace export; run time: {} ms, wait time: {} ms"),
    REQUEST_RECEIVED("Request received"),
    REQUEST_FINISHED_STATUS_A_DURATION_B("Request finished: %s (%s ms)"),
    MAVEN_INSTRUMENTATION_DISABLED("NPlusOne instrumentation is disabled"),
    MAVEN_TEST_AGENT_CONFIGURED("NPlusOne agent configured for Maven test JVMs"),
    ADDED_SUBSCRIBER_A_NEW_TOTAL_B("SSE subscriber #{} added; active subscribers: {}"),
    REMOVED_SUBSCRIBER_A_AFTER_B_DUE_TO_C("SSE subscriber #{} removed after {} minutes. Reason: {}"),
    ;

    private final String message;

    Info(
            String message) {
        this.message = message;
    }

    public String getMessage() {
        return message;
    }
}
