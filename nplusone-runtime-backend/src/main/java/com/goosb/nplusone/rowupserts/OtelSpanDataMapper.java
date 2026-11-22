package com.goosb.nplusone.rowupserts;

import com.google.protobuf.ByteString;
import com.goosb.nplusone.common.StringsUtil;
import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.common.TelemetryKey;
import com.goosb.nplusone.data.SpanId;
import com.goosb.nplusone.data.db.JdbcSpan;
import com.goosb.nplusone.data.db.ServerSpan;
import com.goosb.nplusone.rowupserts.ServerSpanResolver.SpanMetaData;

import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
import io.opentelemetry.proto.common.v1.KeyValue;
import io.opentelemetry.proto.trace.v1.ResourceSpans;
import io.opentelemetry.proto.trace.v1.ScopeSpans;
import io.opentelemetry.proto.trace.v1.Span;
import io.opentelemetry.semconv.CodeAttributes;
import io.opentelemetry.semconv.DbAttributes;
import io.opentelemetry.semconv.HttpAttributes;
import io.opentelemetry.semconv.UrlAttributes;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

import javax.annotation.Nullable;

@Component
public final class OtelSpanDataMapper implements AutoCloseable {

    private static final Logger logger = LoggerFactory.getLogger(OtelSpanDataMapper.class);

    private static final String JDBC_INSTRUMENTATION_SCOPE_NAME = TelemetryKey.JDBC_INSTRUMENTATION_SCOPE.getName();
    private static final String STACK_TRACE_ID_ATTRIBUTE_NAME = TelemetryKey.STACKTRACE_ID.getName();

    private static final String DB_STATEMENT_ATTRIBUTE = "db.statement";
    private static final String HTTP_METHOD_ATTRIBUTE = "http.method";
    private static final String HTTP_TARGET_ATTRIBUTE = "http.target";
    private static final String HTTP_REQUEST_METHOD_KEY = HttpAttributes.HTTP_REQUEST_METHOD.getKey();
    private static final String HTTP_ROUTE_KEY = HttpAttributes.HTTP_ROUTE.getKey();
    private static final String URL_PATH_KEY = UrlAttributes.URL_PATH.getKey();
    private static final String URL_FULL_KEY = UrlAttributes.URL_FULL.getKey();

    private static final String OPERATION_FALL_BACK_VALUE = "<unknown>";

    private final ServerSpanResolver serverSpanResolver;

    public OtelSpanDataMapper(
            ServerSpanResolver serverSpanResolver) {
        this.serverSpanResolver = serverSpanResolver;
    }

    public SpansData map(
            ExportTraceServiceRequest request) {
        Set<JdbcSpan> jdbcSpans = new HashSet<>();
        Map<String, String> stackTraceById = new HashMap<>();
        Map<String, String> sqlQueryToId = new HashMap<>();
        Map<SpanId, ServerSpan> serverSpanById = new HashMap<>();
        Map<SpanId, SpanMetaData> spanIdToMetaData = new HashMap<>();
        Map<String, Integer> invalidJdbcSpanReasonToCounter = new HashMap<>();
        Map<String, Integer> invalidServerSpanReasonToCounter = new HashMap<>();

        for(ResourceSpans resourceSpans : request.getResourceSpansList()) {
            for(ScopeSpans scopeSpans : resourceSpans.getScopeSpansList()) {
                boolean isJdbcSpan = JDBC_INSTRUMENTATION_SCOPE_NAME.equals(scopeSpans.getScope().getName());
                for(Span span : scopeSpans.getSpansList()) {
                    String traceId = toHex(span.getTraceId());
                    String spanId = toHex(span.getSpanId());
                    String parentSpanId = toHex(span.getParentSpanId());
                    boolean isServerSpan = span.getKind() == Span.SpanKind.SPAN_KIND_SERVER;
                    spanIdToMetaData.put(new SpanId(traceId, spanId), new SpanMetaData(parentSpanId, isServerSpan));

                    Instant start = toInstant(span.getStartTimeUnixNano());
                    Instant end = toInstant(span.getEndTimeUnixNano());
                    Map<String, String> attributes = getStringAttributes(span);

                    if(isJdbcSpan) {
                        //region process JDBC-span
                        String stackTraceId = attributes.get(STACK_TRACE_ID_ATTRIBUTE_NAME);
                        String sql = getSqlAttribute(attributes);
                        String sqlId = isBlank(sql) ? null : sqlQueryToId.computeIfAbsent(sql, StringsUtil::hash);
                        JdbcSpan jdbcSpan = new JdbcSpan(traceId, spanId, parentSpanId, stackTraceId, sqlId, start, end);

                        String invalidReason = jdbcSpan.validate();
                        if(invalidReason.isBlank()) {
                            jdbcSpans.add(jdbcSpan);
                        }
                        else {
                            invalidJdbcSpanReasonToCounter.merge(invalidReason, 1, Integer::sum);
                        }

                        String stackTrace = attributes.get(CodeAttributes.CODE_STACKTRACE.getKey());
                        if(!isBlank(stackTraceId)
                                // keep track of *all* stack-trace-ids, also the ones not yet matched with a stack-traces
                                && (!stackTraceById.containsKey(stackTraceId) || !isBlank(stackTrace))) {
                            stackTraceById.put(stackTraceId, stackTrace);
                        }
                        //endregion
                    }
                    else if(isServerSpan) {
                        //region process server-span
                        String operation = getOperationAttribute(span, attributes);
                        ServerSpan serverSpan = new ServerSpan(traceId, spanId, operation, start, end);
                        String invalidReason = serverSpan.validate();
                        if(invalidReason.isBlank()) {
                            serverSpanById.put(new SpanId(traceId, spanId), serverSpan);
                        }
                        else {
                            invalidServerSpanReasonToCounter.merge(invalidReason, 1, Integer::sum);
                        }
                        //endregion
                    }
                }
            }
        }

        String invalidSpansMessage = createInvalidSpansMessage(invalidJdbcSpanReasonToCounter, invalidServerSpanReasonToCounter);
        if(!isBlank(invalidSpansMessage)) {
            logger.error(invalidSpansMessage);
        }

        Set<JdbcSpan> resolvedJdbcSpans = serverSpanResolver.resolve(spanIdToMetaData, jdbcSpans);
        return new SpansData(resolvedJdbcSpans, stackTraceById, sqlQueryToId, serverSpanById);
    }

    private static String toHex(
            ByteString bytes) {
        return HexFormat.of().formatHex(bytes.toByteArray());
    }

    private static Instant toInstant(
            long unixTimeNanos) {
        if(unixTimeNanos == 0) {
            return null;
        }
        return Instant.ofEpochSecond(
                Math.floorDiv(unixTimeNanos, 1_000_000_000L),
                Math.floorMod(unixTimeNanos, 1_000_000_000L));
    }

    private static Map<String, String> getStringAttributes(
            Span span) {
        return span.getAttributesList().stream()
                .filter(keyValue -> keyValue.getValue().hasStringValue())
                .collect(Collectors.toMap(KeyValue::getKey, key -> key.getValue().getStringValue()));
    }

    private static String getSqlAttribute(
            Map<String, String> attributes) {
        String sql = attributes.get(DbAttributes.DB_QUERY_TEXT.getKey());
        return sql != null ? sql : attributes.get(DB_STATEMENT_ATTRIBUTE);
    }

    private static String getOperationAttribute(
            Span span,
            Map<String, String> attributes) {
        String method = getFirstNonBlankAttribute(attributes, HTTP_REQUEST_METHOD_KEY, HTTP_METHOD_ATTRIBUTE);
        String endpoint = getFirstNonBlankAttribute(attributes, HTTP_ROUTE_KEY, URL_PATH_KEY, HTTP_TARGET_ATTRIBUTE, URL_FULL_KEY);
        if(!isBlank(method) && !isBlank(endpoint)) {
            return method + " " + endpoint;
        }

        String spanName = span.getName();
        if(!spanName.isBlank()) {
            return spanName;
        }

        return OPERATION_FALL_BACK_VALUE;
    }

    private static String getFirstNonBlankAttribute(
            Map<String, String> attributes,
            String... keys) {
        for(String key : keys) {
            String value = attributes.get(key);
            if(!isBlank(value)) {
                return value;
            }
        }
        return null;
    }

    @Nullable
    private static String createInvalidSpansMessage(
            Map<String, Integer> invalidJdbcSpanReasonToCounter,
            Map<String, Integer> invalidServerSpanReasonToCounter) {
        if(invalidJdbcSpanReasonToCounter.isEmpty() && invalidServerSpanReasonToCounter.isEmpty()) {
            return null;
        }

        int invalidSpanCount = invalidJdbcSpanReasonToCounter.values().stream().mapToInt(Integer::intValue).sum()
                + invalidServerSpanReasonToCounter.values().stream().mapToInt(Integer::intValue).sum();
        String details = Stream.concat(
                        invalidJdbcSpanReasonToCounter.entrySet().stream()
                                .map(entry -> Error.INVALID_JDBC_SPANS_COUNT_A_REASON_B.format(entry.getValue(), entry.getKey())),
                        invalidServerSpanReasonToCounter.entrySet().stream()
                                .map(entry -> Error.INVALID_SERVER_SPANS_COUNT_A_REASON_B.format(entry.getValue(), entry.getKey())))
                .collect(Collectors.joining(System.lineSeparator()));

        return Error.INVALID_SPANS_COUNT_A_DETAILS_B.format(invalidSpanCount, details);
    }

    @Override
    public void close() {
        serverSpanResolver.close();
    }
}
