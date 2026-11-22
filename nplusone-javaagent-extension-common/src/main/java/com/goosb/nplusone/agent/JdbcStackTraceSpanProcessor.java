package com.goosb.nplusone.agent;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.goosb.nplusone.agent.ApplicationStackTraceCapturer.ApplicationStackTrace;
import com.goosb.nplusone.common.TelemetryKey;
import com.goosb.nplusone.common.ConfigProperty;
import com.goosb.nplusone.common.message.Debug;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.autoconfigure.spi.ConfigProperties;
import io.opentelemetry.sdk.trace.ReadWriteSpan;
import io.opentelemetry.sdk.trace.ReadableSpan;
import io.opentelemetry.sdk.trace.SpanProcessor;

import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicInteger;

import static io.opentelemetry.semconv.CodeAttributes.*;

/**
 * Enriches spans emitted by OpenTelemetry's JDBC instrumentation with the stack trace that triggered the database query.
 * <p>
 * To limit the amount of data that has to be gathered and exported, this processor:
 * <ul>
 *     <li>Only captures a limited number of stack frames, configurable by the client. By default, the first 100 frames are captured.
 *     <li>Only captures application frames. A client can configure application package prefixes. If none are configured,
 *     then a default set of non-application package prefixes is used to filter out non-application frames.
 *     <li>Includes each stack trace only once per trace. Each other span holds only an id/hash of the stack trace.
 * </ul>
 */
public final class JdbcStackTraceSpanProcessor implements SpanProcessor {

    private static final Logger logger = LoggerFactory.getLogger(JdbcStackTraceSpanProcessor.class);

    //region constants
    public static final AttributeKey<String> STACK_TRACE_ID_ATTRIBUTE_KEY = AttributeKey.stringKey(TelemetryKey.STACKTRACE_ID.getName());

    private static final String APP_PACKAGE_PREFIXES_PROPERTY = ConfigProperty.AGENT_EXTENSION_STACKTRACE_APP_PACKAGE_PREFIXES.getName();
    private static final String MAX_STACK_FRAMES_PROPERTY = ConfigProperty.AGENT_EXTENSION_STACKTRACE_MAX_STACK_FRAMES.getName();
    private static final int MAX_STACK_FRAMES_DEFAULT = 100;
    //endregion

    //region applied config
    private final ApplicationStackTraceCapturer stackTraceCapturer;
    //endregion

    //region cache
    // Caffeine initializes System.Logger when first used, which initializes the application's JUL
    // configuration. Agent installation runs before main (and before Surefire captures stdout).
    // Defer cache creation until a span actually needs tracking.
    private volatile Cache<String, TraceState> traceIdToState;
    //endregion

    //region create instance
    public static JdbcStackTraceSpanProcessor fromConfig(
            ConfigProperties config) {
        return new JdbcStackTraceSpanProcessor(
                config.getList(APP_PACKAGE_PREFIXES_PROPERTY),
                config.getInt(MAX_STACK_FRAMES_PROPERTY, MAX_STACK_FRAMES_DEFAULT));
    }

    public JdbcStackTraceSpanProcessor(
            @Nullable List<String> applicationPackagePrefixes,
            int maxStackFrames) {
        logger.debug(Debug.CONFIGURED_JDBC_STACK_CAPTURE_PREFIXES_A_MAX_FRAMES_B.getMessage(),
                applicationPackagePrefixes == null ? null : String.join(",", applicationPackagePrefixes), maxStackFrames);
        this.stackTraceCapturer = new ApplicationStackTraceCapturer(applicationPackagePrefixes, maxStackFrames);
    }

    //endregion

    //region onStart
    @Override
    public void onStart(
            Context parentContext,
            ReadWriteSpan span) {
        TraceState traceState = getTraceStatesMap().compute(getTraceId(span), (__, currentState) -> {
            if(currentState == null) {
                currentState = new TraceState();
            }
            currentState.activeSpanCount.incrementAndGet();
            return currentState;
        });

        /* Note: tracking non-JDBC spans in the trace-states-map is intentional: the root span (e.g., an HTTP request span) keeps the state
        alive between sequential JDBC calls until the request ends. Tracking only JDBC spans would remove the state whenever the last active
        JDBC span ends, causing later queries to export the same stack trace again, while the goal is to export each distinct stack trace
        only once per OTel trace. */
        if(JdbcSpanUtil.isNotEmittedByJdbcInstrumentation(span)) {
            return;
        }

        ApplicationStackTrace applicationStackTrace = stackTraceCapturer.captureCurrentStacktrace();
        if(applicationStackTrace.id().isEmpty()) {
            logger.debug(Debug.SKIPPING_JDBC_STACK_CAPTURE_TRACE_A_SPAN_B.getMessage(), getTraceId(span), span.getSpanContext().getSpanId());
            return;
        }

        setSpanAttributes(span, applicationStackTrace, traceState);
        logger.debug(Debug.ENRICHED_JDBC_SPAN_TRACE_A_SPAN_B_STACK_ID_C.getMessage(),
                getTraceId(span), span.getSpanContext().getSpanId(), applicationStackTrace.id());
    }

    private void setSpanAttributes(
            ReadWriteSpan span,
            ApplicationStackTrace applicationStackTrace,
            TraceState traceState) {
        String stackTraceId = applicationStackTrace.id();
        span.setAttribute(STACK_TRACE_ID_ATTRIBUTE_KEY, stackTraceId);

        boolean firstStackTraceEncounter = traceState.seenStackTraceIds.add(stackTraceId);
        if(firstStackTraceEncounter) {
            span.setAttribute(CODE_STACKTRACE, applicationStackTrace.stackTrace());
        }
    }
    //endregion

    //region onEnd
    @Override
    public void onEnd(
            ReadableSpan span) {
        getTraceStatesMap().computeIfPresent(getTraceId(span), (__, state) ->
                state.activeSpanCount.decrementAndGet() == 0 ? null : state);
    }
    //endregion

    //region is*Required
    @Override
    public boolean isStartRequired() {
        return true;
    }

    @Override
    public boolean isEndRequired() {
        return true;
    }
    //endregion

    //region getters
    private static String getTraceId(
            ReadableSpan span) {
        return span.getSpanContext().getTraceId();
    }

    private ConcurrentMap<String, TraceState> getTraceStatesMap() {
        Cache<String, TraceState> cache = traceIdToState;
        if(cache == null) {
            synchronized(this) {
                cache = traceIdToState;
                if(cache == null) {
                    /* onEnd normally removes a trace when its final span ends. Bound and expire
                    the cache as a safeguard for spans that never end. Evicting an active entry
                    is safe: it only causes stack traces to be included redundantly. */
                    cache = Caffeine.newBuilder()
                            .maximumSize(10_000)
                            .expireAfterAccess(Duration.ofMinutes(10))
                            .build();
                    traceIdToState = cache;
                }
            }
        }
        return cache.asMap();
    }
    //endregion

    //region TraceState
    private static final class TraceState {

        private final AtomicInteger activeSpanCount = new AtomicInteger();
        private final Set<String> seenStackTraceIds = ConcurrentHashMap.newKeySet();
    }
    //endregion
}
