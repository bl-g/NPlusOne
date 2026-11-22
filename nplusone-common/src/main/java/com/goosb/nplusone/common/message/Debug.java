package com.goosb.nplusone.common.message;

public enum Debug {
    CLIENT_PROVIDED_INVALID_REQUEST_BODY("Client provided invalid request body"),
    CLIENT_DISCONNECTED("Client disconnected"),
    SSE_SUBSCRIBER_A_DISCONNECTED("SSE subscriber #{} disconnected"),
    RESOLVED_JDBC_SPANS_A_RECEIVED_SERVER_SPANS_B("Resolved {} JDBC spans and received {} server spans"),
    UPSERTS_ARRIVED_FOR_JDBC_SPANS_A("Upserts arrived for {} JDBC spans"),
    GATHERED_UPSERTS_FOR_ROWS_A("Gathered upserts for {} rows"),
    PARENT_SPAN_ARRIVED_FOR_JDBC_SPANS_A("Parent span arrived for {} JDBC spans"),
    STACK_TRACE_ARRIVED_FOR_JDBC_SPANS_A("Stack trace arrived for {} JDBC spans"),
    NEW_JDBC_SPANS_A_ARRIVED("{} new JDBC spans arrived"),
    GATHERED_PAGE_ROWS_A_HAS_MORE_B("Gathered page with {} rows and has more: {}"),
    STARTED_PROCESSING_TRACE_EXPORT("Started processing trace export"),

    INSTALLING_RUNTIME_AGENT_EXTENSION("Installing N+1 runtime agent extension"),
    CONFIGURED_JDBC_STACK_CAPTURE_PREFIXES_A_MAX_FRAMES_B("Configured JDBC stack capture: applicationPackagePrefixes={}, maxStackFrames={}"),
    SKIPPING_JDBC_STACK_CAPTURE_TRACE_A_SPAN_B("Skipping JDBC stack capture: no application frames matched, traceId={}, spanId={}"),
    ENRICHED_JDBC_SPAN_TRACE_A_SPAN_B_STACK_ID_C("Enriched JDBC span: traceId={}, spanId={}, stackTraceId={}"),
    PUBLISHING_RUNTIME_ROWS_A_SUBSCRIBERS_B("Publishing runtime rows: rows={}, activeSubscribers={}"),
    FAILED_SSE_DELIVERY_SUBSCRIBER_A("Failed SSE delivery: subscriber={}"),

    INSTALLING_TEST_AGENT_EXTENSION("Installing N+1 test agent extension"),
    SKIPPING_DISABLED_TEST_CAPTURE_FOR_A("Skipping N+1 capture for {}: nplusone.test.agent.disabled=true"),
    SKIPPING_UNANNOTATED_TEST_CAPTURE_FOR_A("Skipping N+1 capture for {}: no N+1 annotation"),
    STARTED_TEST_CAPTURE_FOR_A_TRACE_B_MAX_ISSUES_C_QUERY_COUNT_D_SQL_FILTER_E_STACK_FILTER_F_NORMALIZER_G("Started N+1 capture for {}:"
            + " traceId={}, maxNPlusOneIssues={}, nPlusOneQueryCount={}, includeSql={}, includeStackTrace={}, normalizeSql={}"),
    STARTED_TEST_CAPTURE_FOR_CLASS_A_METHOD_B_TRACE_C_MAX_ISSUES_D_QUERY_COUNT_E_SQL_FILTER_F_STACK_FILTER_G_NORMALIZER_H("Started N+1"
            + " capture for {}#{}: traceId={}, maxNPlusOneIssues={}, nPlusOneQueryCount={}, includeSql={}, includeStackTrace={},"
            + " normalizeSql={}"),
    SKIPPING_ASSERTION_WITHOUT_CAPTURE_FOR_A("Skipping N+1 assertion for {}: no capture state"),
    SKIPPING_FAILED_TEST_ASSERTION_FOR_A_TRACE_B("Skipping N+1 assertion for {}: test already failed, traceId={}"),
    SKIPPING_FAILED_TEST_OR_LIFECYCLE_ASSERTION_FOR_A_TRACE_B("Skipping N+1 assertion for {}: test or lifecycle method failed, traceId={}"),
    COMPLETED_TEST_CAPTURE_FOR_A_TRACE_B_CAPTURED_C_AFTER_STACK_FILTER_D_AFTER_SQL_FILTER_E("Completed N+1 capture for {}: traceId={},"
            + " capturedJdbcSpans={}, afterStackTraceFilter={}, afterSqlFilter={}"),
    TEST_EVALUATION_SPANS_A_MISSING_ATTRIBUTES_B_GROUPS_C_PATTERNS_D_MAX_ISSUES_E_QUERY_COUNT_F_RESULT_G("N+1 evaluation: inputJdbcSpans={},"
            + " missingSqlOrStackTraceId={}, queryGroups={}, detectedPatterns={}, maxNPlusOneIssues={}, nPlusOneQueryCount={}, result={}"),
    IGNORING_JDBC_SPAN_OUTSIDE_TEST_CAPTURE_TRACE_A_SPAN_B("Ignoring JDBC span outside an active N+1 test capture: traceId={}, spanId={}"),
    CAPTURED_TEST_JDBC_SPAN_TRACE_A_SPAN_B_HAS_SQL_C_HAS_STACK_ID_D_HAS_STACK_E("Captured JDBC span for N+1 test: traceId={}, spanId={},"
            + " hasSql={}, hasStackTraceId={}, hasStackTrace={}"),
    SHUTTING_DOWN("Shutting down"),
    ;

    private final String message;

    Debug(
            String message) {
        this.message = message;
    }

    public String getMessage() {
        return message;
    }
}
