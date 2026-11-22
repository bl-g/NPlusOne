package com.goosb.nplusone.rowupserts;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.goosb.nplusone.data.SpanId;
import com.goosb.nplusone.data.db.JdbcSpan;

import java.time.Duration;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

import org.springframework.stereotype.Component;

import io.opentelemetry.proto.trace.v1.Span.SpanKind;

/**
 * Resolves each JDBC span to its server span (grand) parent.
 * <p>
 * Open Telemetry's API guarantees no order for receiving spans, so span hierarchies may arrive in any order and in separate batches.
 * Therefore, unresolved spans are retained until their parent chain is available.
 * <p>
 * This code relies on the instrumented application adhering to OpenTelemetry's API, specifically the correct usage of {@link SpanKind}s:
 * <ul>
 *     <li>Each HTTP-request (or other remote call) received by the application starts with a {@link SpanKind#SPAN_KIND_SERVER} span
 *     <li>No other span in the application's scope should be of type {@link SpanKind#SPAN_KIND_SERVER}.
 * </ul>
 * When using OpenTelemetry's Java agent, a server span is automatically created for each incoming HTTP request, and the agent never creates
 * server spans for any other operation.
 */
@Component
public final class ServerSpanResolver implements AutoCloseable {

    public record SpanMetaData(
            String parentId,
            boolean isServerSpan
    ) {

    }

    private static final int MAX_CACHED_SPANS = 100_000;
    private static final Duration CACHE_EXPIRY = Duration.ofMinutes(10);

    private final Cache<SpanId, SpanMetaData> spanIdToMetaData = Caffeine.newBuilder()
            .maximumSize(MAX_CACHED_SPANS)
            .expireAfterAccess(CACHE_EXPIRY)
            .build();

    private final Cache<SpanId, JdbcSpan> pendingJdbcSpans = Caffeine.newBuilder()
            .maximumSize(MAX_CACHED_SPANS)
            .expireAfterAccess(CACHE_EXPIRY)
            .build();

    public Set<JdbcSpan> resolve(
            Map<SpanId, SpanMetaData> spanIdToMetaData,
            Set<JdbcSpan> jdbcSpans) {
        this.spanIdToMetaData.putAll(spanIdToMetaData);

        Set<JdbcSpan> resolvedSpans = new HashSet<>();
        for(JdbcSpan jdbcSpan : jdbcSpans) {
            if(isBlank(jdbcSpan.parentId())) {
                resolvedSpans.add(jdbcSpan);
            }
            else {
                pendingJdbcSpans.put(new SpanId(jdbcSpan.traceId(), jdbcSpan.id()), jdbcSpan);
            }
        }

        pendingJdbcSpans.asMap().forEach((spanId, jdbcSpan) -> {
            String serverSpanId = findServerSpanId(jdbcSpan.traceId(), jdbcSpan.parentId());
            if(serverSpanId == null) {
                return;
            }
            resolvedSpans.add(new JdbcSpan(jdbcSpan.traceId(), jdbcSpan.id(), serverSpanId, jdbcSpan.stackTraceId(), jdbcSpan.sqlId(),
                    jdbcSpan.start(), jdbcSpan.end()));
            pendingJdbcSpans.invalidate(spanId);
        });

        return Set.copyOf(resolvedSpans);
    }

    private String findServerSpanId(
            String traceId,
            String directParentSpanId) {
        Set<SpanId> visited = new HashSet<>();
        SpanId parentSpanId = new SpanId(traceId, directParentSpanId);
        while(visited.add(parentSpanId)) {
            SpanMetaData parentSpanMetaData = spanIdToMetaData.getIfPresent(parentSpanId);
            if(parentSpanMetaData == null) { // null means that the parent span is not yet processed
                return null;
            }
            if(parentSpanMetaData.isServerSpan()) {
                return parentSpanId.spanId();
            }
            parentSpanId = new SpanId(traceId, parentSpanMetaData.parentId());
        }
        return null;
    }

    @Override
    public void close() {
        spanIdToMetaData.invalidateAll();
        pendingJdbcSpans.invalidateAll();
    }
}
