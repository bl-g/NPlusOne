package com.goosb.nplusone.common.message;

import org.slf4j.helpers.MessageFormatter;

public enum Error {
    INVALID_SPANS_COUNT_A_DETAILS_B("""
            Received {} spans without all of the expected attributes.
            Make sure that the instrumented application uses both OpenTelemetry's Java agent and the N+1 extension.
            Additionally, make sure that not all stack frames are filtered out by the configured application package prefixes.
            Details:
            {}
            """),
    INVALID_JDBC_SPANS_COUNT_A_REASON_B("- JDBC spans: {} × {}"),
    INVALID_SERVER_SPANS_COUNT_A_REASON_B("- Server spans: {} × {}"),
    FAILED_TO_PROCESS_TRACE_EXPORT("Failed to process trace export"),
    UNEXPECTED_ERROR("An unexpected error occurred"),
    //region common utilities
    UNSUPPORTED_ALGO_A("Every Java runtime must support the {} algorithm"),
    //endregion

    //region span processors
    MAX_STACK_FRAMES_MUST_BE_POSITIVE("Maximum stack frames must be greater than 0"),
    INVALID_APPLICATION_PACKAGE_PREFIXES_A("Invalid nplusone.stacktrace.application-package-prefixes: '{}'. Expected comma-separated package prefixes, a single \"*\", or no value."),
    //endregion

    //region test bootstrap
    TRACE_A_ALREADY_REGISTERED("Trace is already registered. Trace id: {}"),
    TRACE_ID_MISSING("Trace id is missing"),
    SPANS_TRACE_ID_A_NOT_REGISTERED("Span belongs to trace that is not registered. Trace id: {}"),
    //endregion

    //region test annotation
    A_MAXNPLUSONEISSUES_MUST_BE_NON_NEGATIVE("@{}.maxNPlusOneIssues must be 0 or greater"),
    A_NPLUSONEQUERYCOUNT_MUST_BE_AT_LEAST_ONE("@{}.nPlusOneQueryCount must be 1 or greater"),
    TEST_JAVA_AGENT_REQUIRED_FOR_A("Usage of @{} requires running the test with the NPlusOne test Java agent"),
    INVALID_A_CONFIG("Invalid @{} configuration"),
    USE_A_THROUGH_B_AT_C_OR_D("Do not use {} directly. Instead, use @{} at this class or method: {}#{}"),
    A_INCLUDESQL_CANNOT_BE_NULL("@{}.includeSql cannot be null since it is ambiguous (could mean either include all or exclude all). Note that include all is the default."),
    A_INCLUDESQL_B_HAS_NO_PUBLIC_NO_ARG_CONSTRUCTOR("Cannot instantiate @{}.includeSql: {}. Provide a public filter implementation with a public no-argument constructor."),
    A_INCLUDESTACKTRACE_CANNOT_BE_NULL("@{}.includeStackTrace cannot be null since it is ambiguous (could mean either include all or exclude all). Note that include all is the default."),
    A_INCLUDESTACKTRACE_B_HAS_NO_PUBLIC_NO_ARG_CONSTRUCTOR("Cannot instantiate @{}.includeStackTrace: {}. Provide a public filter implementation with a public no-argument constructor."),
    A_NORMALIZESQL_CANNOT_BE_NULL("@{}.normalizeSql cannot be null. If you want no normalization, then provide a no-op normalizer that returns the input SQL unchanged."),
    A_NORMALIZESQL_B_HAS_NO_PUBLIC_NO_ARG_CONSTRUCTOR("Cannot instantiate @{}.normalizeSql: {}. Provide a public normalizer implementation with a public no-argument constructor."),
    //endregion

    //region test detector
    DETECTED_A_N_PLUS_1_QUERY_PATTERNS_B_MAX_ALLOWED_C_DETAILS_D("Detected {} N+1 query pattern{} (maximum allowed: {}):" + System.lineSeparator() + "{}"),
    //endregion

    //region data store
    CANNOT_CREATE_DIRECTORIES_A("Could not create missing directories: {}"),
    CANNOT_CREATE_SCHEMA("Could not create database schema"),
    SQLITE_TRANSACTION_FAILED("SQLite transaction failed"),
    CANNOT_CLOSE_DB_CONNECTION("Could not close SQLite connection"),
    CANNOT_FETCH_DB_CONNECTION("Failed to fetch a connection from the pool"),
    //endregion

    //region encoding utilities
    CANNOT_BASE64_ENCODE_A("Could not encode to Base64: {}"),
    CANNOT_BASE64_DECODE_A("Could not decode from Base64: {}"),
    //endregion

    //region row upserts service
    START_DATE_MUST_NOT_BE_AFTER_END_DATE("startDate must not be after endDate"),
    PAGE_SIZE_MUST_BE_AT_LEAST_ONE("pageSize must be at least 1"),
    PAGE_SIZE_MUST_NOT_EXCEED_A("pageSize must not exceed {}"),
    CURSOR_IS_INVALID("cursor is invalid"),
    //endregion

    //region row upserts publish events service
    EXECUTOR_A_REJECTED_PUBLISH_EVENT_TASK("Publish event task rejected by executor: subscriber={}"),
    FAILED_COMPLETE_EMITTER_A("Failed completing the emitter: subscriber={}"),
    CANNOT_SUBSCRIBE_SERVICE_SHUTTING_DOWN("Service is shutting down, thus new subscribers are not allowed"),
    CANNOT_SUBSCRIBE_MAX_A_REACHED("Cannot subscribe, maximum number of subscribers ({}) is already reached"),
    //endregion

    //region examples
    USER_ORDERS_LOADING_INTERRUPTED("Interrupted while loading user orders"),
    USER_ORDERS_LOADING_TIMED_OUT("Timed out while loading user orders"),
    USER_ORDERS_LOADING_FAILED("Failed to load user orders"),
    //endregion
    ;

    private final String message;

    Error(
            String message) {
        this.message = message;
    }

    public String getMessage() {
        return message;
    }

    public String format(
            Object... arguments) {
        return MessageFormatter.arrayFormat(message, arguments, null).getMessage();
    }
}
