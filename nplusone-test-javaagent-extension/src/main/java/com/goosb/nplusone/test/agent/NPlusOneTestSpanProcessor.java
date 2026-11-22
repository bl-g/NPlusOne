package com.goosb.nplusone.test.agent;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

import com.goosb.nplusone.agent.JdbcSpanUtil;
import com.goosb.nplusone.agent.JdbcStackTraceSpanProcessor;
import com.goosb.nplusone.common.TelemetryKey;
import com.goosb.nplusone.common.message.Debug;
import com.goosb.nplusone.test.bootstrap.JdbcSpanSnapshot;
import com.goosb.nplusone.test.bootstrap.NPlusOneTestBridge;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.trace.ReadWriteSpan;
import io.opentelemetry.sdk.trace.ReadableSpan;
import io.opentelemetry.sdk.trace.SpanProcessor;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.semconv.CodeAttributes;
import io.opentelemetry.semconv.DbAttributes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A {@link SpanProcessor} that uses attributes set by {@link JdbcStackTraceSpanProcessor}
 * to record {@link JdbcSpanSnapshot} at the {@link NPlusOneTestBridge}.
 */
public final class NPlusOneTestSpanProcessor implements SpanProcessor {

    private static final Logger logger = LoggerFactory.getLogger(NPlusOneTestSpanProcessor.class);

    private static final AttributeKey<String> STACK_TRACE_ID_KEY = AttributeKey.stringKey(TelemetryKey.STACKTRACE_ID.getName());
    private static final AttributeKey<String> DB_QUERY_TEXT_KEY = DbAttributes.DB_QUERY_TEXT;
    private static final AttributeKey<String> LEGACY_DB_QUERY_TEX_KEY = AttributeKey.stringKey("db.statement");
    private static final AttributeKey<String> CODE_STACKTRACE_KEY = CodeAttributes.CODE_STACKTRACE;

    @Override
    public void onStart(
            Context parentContext,
            ReadWriteSpan span) {
        // nothing
    }

    @Override
    public void onEnd(
            ReadableSpan span) {
        if(JdbcSpanUtil.isNotEmittedByJdbcInstrumentation(span)) {
            return;
        }

        SpanData spanData = span.toSpanData();
        String traceId = spanData.getTraceId();
        if(!NPlusOneTestBridge.INSTANCE.isTraceRegistered(traceId)) {
            logger.debug(Debug.IGNORING_JDBC_SPAN_OUTSIDE_TEST_CAPTURE_TRACE_A_SPAN_B.getMessage(), traceId, spanData.getSpanId());
            return;
        }

        Attributes attributes = spanData.getAttributes();
        String sql = findSqlAttribute(attributes);
        String stackTraceId = attributes.get(STACK_TRACE_ID_KEY);
        String stackTrace = attributes.get(CODE_STACKTRACE_KEY);
        JdbcSpanSnapshot spanSnapshotData = new JdbcSpanSnapshot(traceId, spanData.getSpanId(), spanData.getParentSpanId(), stackTraceId,
                sql, stackTrace);
        NPlusOneTestBridge.INSTANCE.recordJdbcSpan(spanSnapshotData);
        logger.debug(Debug.CAPTURED_TEST_JDBC_SPAN_TRACE_A_SPAN_B_HAS_SQL_C_HAS_STACK_ID_D_HAS_STACK_E.getMessage(),
                traceId, spanData.getSpanId(), !isBlank(sql), !isBlank(stackTraceId), !isBlank(stackTrace));
    }

    private static String findSqlAttribute(
            Attributes attributes) {
        String sql = attributes.get(DB_QUERY_TEXT_KEY);
        if(!isBlank(sql)) {
            return sql;
        }
        return attributes.get(LEGACY_DB_QUERY_TEX_KEY);
    }

    @Override
    public boolean isStartRequired() {
        return false;
    }

    @Override
    public boolean isEndRequired() {
        return true;
    }
}
