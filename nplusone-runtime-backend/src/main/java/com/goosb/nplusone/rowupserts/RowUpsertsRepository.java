package com.goosb.nplusone.rowupserts;

import com.goosb.nplusone.common.message.Debug;
import com.goosb.nplusone.data.RowCursor;
import com.goosb.nplusone.data.db.JdbcSpan;
import com.goosb.nplusone.data.db.ServerSpan;
import com.goosb.nplusone.data.SpanId;
import com.goosb.nplusone.data.dto.*;
import com.goosb.nplusone.datastore.DataStore;
import com.goosb.nplusone.util.EncodingUtil;

import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
import jakarta.annotation.PreDestroy;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import com.goosb.nplusone.common.ConfigProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Repository;

import java.nio.file.Path;
import java.sql.Connection;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

@Repository
public final class RowUpsertsRepository implements AutoCloseable {

    private static final Logger logger = LoggerFactory.getLogger(RowUpsertsRepository.class);

    private final DataStore dataStore;
    private final OtelSpanDataMapper otelSpanMapper;

    //region create instance
    @Autowired
    public RowUpsertsRepository(
            OtelSpanDataMapper otelSpanDataMapper,
            Environment environment) {
        this(otelSpanDataMapper, Path.of(environment.getProperty(ConfigProperty.DATABASE_PATH.getName(), "nplusone.db")));
    }

    public RowUpsertsRepository(
            OtelSpanDataMapper otelSpanMapper,
            Path databasePath) {
        this.dataStore = new DataStore(databasePath);
        this.otelSpanMapper = otelSpanMapper;
    }
    //endregion

    //region saveSpans
    public RowUpserts saveSpans(
            ExportTraceServiceRequest request) {
        SpansData spansData = otelSpanMapper.map(request);
        logger.debug(Debug.RESOLVED_JDBC_SPANS_A_RECEIVED_SERVER_SPANS_B.getMessage(), spansData.jdbcSpans().size(),
                spansData.serverSpanById().size());

        return dataStore.doInTransaction(connection -> {
            Set<JdbcSpan> upsertedJdbcSpans = saveSpansData(connection, spansData);
            logger.debug(Debug.UPSERTS_ARRIVED_FOR_JDBC_SPANS_A.getMessage(), upsertedJdbcSpans.size());

            RowUpserts rowsUpserts = createRowUpserts(connection, upsertedJdbcSpans);
            logger.debug(Debug.GATHERED_UPSERTS_FOR_ROWS_A.getMessage(), rowsUpserts.rowCount());

            return rowsUpserts;
        });
    }

    private Set<JdbcSpan> saveSpansData(
            Connection connection,
            SpansData spansData) {
        Set<JdbcSpan> upsertedJdbcSpans = new HashSet<>();

        Map<SpanId, ServerSpan> serverSpanById = spansData.serverSpanById();
        dataStore.saveServerSpans(connection, serverSpanById.values());
        // OTel does not guarantee any order for spans, so child and parent spans can arrive in different batches.
        // This set contains JDBC spans from earlier batches whose parent/server span arrived in the current batch.
        Set<JdbcSpan> foundParentSpans = dataStore.findJdbcSpansByParentIds(connection, serverSpanById.keySet())
                .values().stream()
                .flatMap(Set::stream)
                .collect(Collectors.toSet());
        logger.debug(Debug.PARENT_SPAN_ARRIVED_FOR_JDBC_SPANS_A.getMessage(), foundParentSpans.size());
        upsertedJdbcSpans.addAll(foundParentSpans);

        dataStore.saveSqlQueries(connection, spansData.sqlQueryToId());

        Set<String> idsOfUpdatedStackTraces = dataStore.saveStackTraces(connection, spansData.stackTraceById());
        // The N+1 Java-agent extension includes the stack trace in the first JDBC span of a OTel trace,
        // but since OTel does not guarantee any order for spans, the span containing the stack-trace might arrive later than other spans.
        // This set contains JDBC spans from earlier batches whose stack trace arrived in the current batch.
        Set<JdbcSpan> updatedSpans = new HashSet<>(dataStore.findJdbcSpansByStackTraceIds(connection, idsOfUpdatedStackTraces));
        logger.debug(Debug.STACK_TRACE_ARRIVED_FOR_JDBC_SPANS_A.getMessage(), updatedSpans.size());
        upsertedJdbcSpans.addAll(updatedSpans);

        // Note: deliberately saving the new spans at the end, to avoid them from being fetched/considered by the above queries
        Set<JdbcSpan> newSpans = spansData.jdbcSpans();
        dataStore.saveJdbcSpans(connection, newSpans);
        logger.debug(Debug.NEW_JDBC_SPANS_A_ARRIVED.getMessage(), newSpans.size());
        upsertedJdbcSpans.addAll(newSpans);

        return upsertedJdbcSpans;
    }

    private RowUpserts createRowUpserts(
            Connection connection,
            Set<JdbcSpan> upsertedJdbcSpans) {
        Map<Boolean, List<JdbcSpan>> spanByIsUnassociated = upsertedJdbcSpans.stream()
                .collect(Collectors.partitioningBy(span -> isBlank(span.parentId())));
        List<JdbcSpan> unassociatedSpans = spanByIsUnassociated.getOrDefault(true, List.of());
        List<JdbcSpan> parentedSpans = spanByIsUnassociated.getOrDefault(false, List.of());
        return createRowUpserts(connection, unassociatedSpans, parentedSpans);
    }

    private RowUpserts createRowUpserts(
            Connection connection,
            Collection<JdbcSpan> unassociatedSpans,
            Collection<JdbcSpan> parentedSpans) {
        List<JdbcSpan> allSpans = new ArrayList<>(unassociatedSpans);
        allSpans.addAll(parentedSpans);

        Map<String, String> stackTraceById = dataStore.findStackTracesByIds(connection, allSpans.stream()
                .map(JdbcSpan::stackTraceId)
                .collect(Collectors.toSet()));
        Map<String, String> sqlQueryById = dataStore.findSqlQueriesByIds(connection, allSpans.stream()
                .map(JdbcSpan::sqlId)
                .collect(Collectors.toSet()));
        List<UnassociatedRow> unassociatedRowUpserts = createUnassociatedRows(unassociatedSpans, stackTraceById, sqlQueryById);

        Map<SpanId, ServerSpan> serverSpanById = dataStore.findServerSpansByIds(connection, parentedSpans.stream()
                .map(span -> new SpanId(span.traceId(), span.parentId()))
                .collect(Collectors.toSet()));
        Set<SpanId> updatedServerSpanIds = parentedSpans.stream()
                .filter(span -> serverSpanById.containsKey(new SpanId(span.traceId(), span.parentId())))
                .map(span -> new SpanId(span.traceId(), span.parentId()))
                .collect(Collectors.toSet());
        List<ServerRow> serverRowUpserts = createServerRows(connection, updatedServerSpanIds, serverSpanById);

        List<Row> rows = mergeRows(serverRowUpserts, unassociatedRowUpserts);
        return new RowUpserts(rows);
    }

    private List<ServerRow> createServerRows(
            Connection connection,
            Set<SpanId> updatedServerSpanIds,
            Map<SpanId, ServerSpan> serverSpanById) {
        // Note: the current batch might contain JDBC spans whose parent span arrived in an earlier batch together with other JDBC spans.
        // These other JDBC spans are not part of this batch's upserted JDBC spans, thus fetching all JDBC spans of a parent here,
        // to make sure that these earlier JDBC spans are also included in the row upserts.
        Map<SpanId, Set<JdbcSpan>> jdbcSpansByUpdatedServerSpanId = dataStore.findJdbcSpansByParentIds(connection, updatedServerSpanIds);
        Set<JdbcSpan> allJdbcSpans = jdbcSpansByUpdatedServerSpanId.values().stream()
                .flatMap(Collection::stream)
                .collect(Collectors.toSet());
        Map<String, String> stackTraceById = dataStore.findStackTracesByIds(connection, allJdbcSpans.stream()
                .map(JdbcSpan::stackTraceId)
                .collect(Collectors.toSet()));
        Map<String, String> sqlQueryById = dataStore.findSqlQueriesByIds(connection, allJdbcSpans.stream()
                .map(JdbcSpan::sqlId)
                .collect(Collectors.toSet()));
        return doCreateServerRows(updatedServerSpanIds, serverSpanById, jdbcSpansByUpdatedServerSpanId, stackTraceById, sqlQueryById);
    }
    //endregion

    //region create*Rows
    private static List<UnassociatedRow> createUnassociatedRows(
            Collection<JdbcSpan> unassociatedSpans,
            Map<String, String> stackTraceById,
            Map<String, String> sqlQueryById) {
        return unassociatedSpans.stream()
                .map(span -> createUnassociatedRow(stackTraceById, sqlQueryById, span))
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(UnassociatedRow::start))
                .toList();
    }

    @Nullable
    private static UnassociatedRow createUnassociatedRow(
            Map<String, String> stackTraceById,
            Map<String, String> sqlQueryById,
            JdbcSpan span) {
        String stackTrace = stackTraceById.get(span.stackTraceId());
        String sqlQuery = sqlQueryById.get(span.sqlId());
        if(isBlank(stackTrace) || isBlank(sqlQuery)) {
            return null;
        }
        String rowId = createRowId(span.traceId(), span.id());
        Instant start = span.start();
        RowCursor cursor = new RowCursor(start, RowType.UNASSOCIATED, span.traceId(), span.id());
        return new UnassociatedRow(rowId, cursor, start, durationMillis(start, span.end()), stackTrace, sqlQuery);
    }

    private List<ServerRow> doCreateServerRows(
            Set<SpanId> serverSpanIds,
            Map<SpanId, ServerSpan> serverSpanById,
            Map<SpanId, Set<JdbcSpan>> jdbcSpansByParentId,
            Map<String, String> stackTraceById,
            Map<String, String> sqlQueryById) {
        return serverSpanIds.stream()
                .map(serverSpanId -> doCreateServerRow(serverSpanById, jdbcSpansByParentId, stackTraceById, sqlQueryById, serverSpanId))
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(ServerRow::start))
                .toList();
    }

    @Nullable
    private ServerRow doCreateServerRow(
            Map<SpanId, ServerSpan> serverSpanById,
            Map<SpanId, Set<JdbcSpan>> jdbcSpansByParentId,
            Map<String, String> stackTraceById,
            Map<String, String> sqlQueryById,
            SpanId serverSpanId) {
        Set<JdbcSpan> jdbcSpans = jdbcSpansByParentId.getOrDefault(serverSpanId, Set.of());
        List<SqlRow> sqlRows = createSqlRows(stackTraceById, sqlQueryById, jdbcSpans);
        if(sqlRows.isEmpty()) {
            return null;
        }

        ServerSpan serverSpan = serverSpanById.get(serverSpanId);
        String traceId = serverSpanId.traceId();
        String spanId = serverSpanId.spanId();
        String serverRowId = createRowId(traceId, spanId);
        Instant start = serverSpan.start();
        RowCursor rowCursor = new RowCursor(start, RowType.SERVER, traceId, spanId);
        double durationMs = durationMillis(start, serverSpan.end());
        // Include all associated executions, even while query/stack-trace metadata is still arriving.
        // Overlapping spans are deliberately summed: this measures cumulative JDBC execution time.
        double jdbcDurationMs = jdbcSpans.stream()
                .mapToDouble(span -> durationMillis(span.start(), span.end()))
                .sum();
        String operationName = serverSpan.operation();
        return new ServerRow(serverRowId, rowCursor, start, durationMs, jdbcDurationMs, operationName, sqlRows);
    }

    private List<SqlRow> createSqlRows(
            Map<String, String> stackTraceById,
            Map<String, String> sqlQueryById,
            Set<JdbcSpan> jdbcSpans) {
        return jdbcSpans.stream()
                .filter(span -> {
                    String stackTrace = stackTraceById.get(span.stackTraceId());
                    String sqlQuery = sqlQueryById.get(span.sqlId());
                    return !isBlank(stackTrace) && !isBlank(sqlQuery);
                })
                .collect(Collectors.groupingBy(span -> new SqlGroupKey(
                        span.stackTraceId(), sqlQueryById.get(span.sqlId()))))
                .values().stream()
                .map(spans -> {
                    // Select the earliest span consistently across exports and reloads.
                    JdbcSpan span = spans.stream()
                            .min(Comparator.comparing(JdbcSpan::start).thenComparing(JdbcSpan::id))
                            .orElseThrow();
                    Instant firstStart = spans.stream()
                            .map(JdbcSpan::start)
                            .min(Comparator.naturalOrder())
                            .orElseThrow();
                    int count = spans.size();
                    double jdbcDurationMs = spans.stream()
                            .mapToDouble(jdbcSpan -> durationMillis(jdbcSpan.start(), jdbcSpan.end()))
                            .sum();
                    String stackTrace = stackTraceById.get(span.stackTraceId());
                    String sqlQuery = sqlQueryById.get(span.sqlId());
                    return new SqlRow(firstStart, count, jdbcDurationMs, stackTrace, sqlQuery);
                })
                .sorted(Comparator.comparing(SqlRow::start))
                .toList();
    }
    //endregion

    private record SqlGroupKey(
            String stackTraceId,
            String sql) {
    }

    //region findRowUpsertsPaginated
    public RowUpsertsPage findRowUpsertsPaginated(
            Instant startDate,
            Instant endDate,
            RowCursor cursor,
            int pageSize) {
        return dataStore.doInTransaction(connection -> {
            RowUpsertsPage page = doFindRowUpsertsPaginated(connection, startDate, endDate, cursor, pageSize);

            /* The code fetches #pageSize rows and might (in edge cases) exclude some of them because they are not (yet)
             * complete, for example because a reference stack trace has not (yet) arrived. In these cases the page does
             * not have the requested size. Thus, fetch more rows until the requested size is achieved or no rows are left. */
            while(page.rowUpserts().rowCount() < pageSize && !page.isLastPage()) {
                RowCursor nextCursor = EncodingUtil.fromBase64(page.nextCursor());
                RowUpsertsPage nextPage = doFindRowUpsertsPaginated(connection, startDate, endDate, nextCursor, pageSize);
                page = page.merge(nextPage, pageSize);
            }

            logger.debug(Debug.GATHERED_PAGE_ROWS_A_HAS_MORE_B.getMessage(), page.rowUpserts().rowCount(), !page.isLastPage());
            return page;
        });
    }

    private RowUpsertsPage doFindRowUpsertsPaginated(
            Connection connection,
            Instant startDate,
            Instant endDate,
            RowCursor cursor,
            int pageSize) {
        List<RowCursor> rowIndexes = dataStore.findRowIndexes(connection, startDate, endDate, cursor, pageSize + 1);
        if(rowIndexes.isEmpty()) {
            return new RowUpsertsPage(new RowUpserts(List.of()), null);
        }

        boolean hasMore = rowIndexes.size() > pageSize;
        List<RowCursor> pageRowIndexes = hasMore ? rowIndexes.subList(0, pageSize) : rowIndexes;
        RowCursor nextCursor = hasMore ? pageRowIndexes.get(pageRowIndexes.size() - 1) : null;

        Set<SpanId> serverSpanIds = pageRowIndexes.stream()
                .filter(row -> row.rowType() == RowType.SERVER)
                .map(row -> new SpanId(row.traceId(), row.spanId()))
                .collect(Collectors.toSet());
        Set<SpanId> unassociatedJdbcSpanIds = pageRowIndexes.stream()
                .filter(row -> row.rowType() == RowType.UNASSOCIATED)
                .map(row -> new SpanId(row.traceId(), row.spanId()))
                .collect(Collectors.toSet());

        Map<SpanId, ServerSpan> serverSpanById = dataStore.findServerSpansByIds(connection, serverSpanIds);
        Map<SpanId, Set<JdbcSpan>> jdbcSpansByParentId = dataStore.findJdbcSpansByParentIds(connection, serverSpanIds);
        Set<JdbcSpan> unassociatedJdbcSpans = dataStore.findJdbcSpansByIds(connection, unassociatedJdbcSpanIds);

        Set<JdbcSpan> allJdbcSpans = new HashSet<>(unassociatedJdbcSpans);
        jdbcSpansByParentId.values().forEach(allJdbcSpans::addAll);

        Map<String, String> stackTraceById = dataStore.findStackTracesByIds(connection, allJdbcSpans.stream()
                .map(JdbcSpan::stackTraceId)
                .collect(Collectors.toSet()));
        Map<String, String> sqlQueryById = dataStore.findSqlQueriesByIds(connection, allJdbcSpans.stream()
                .map(JdbcSpan::sqlId)
                .collect(Collectors.toSet()));

        List<ServerRow> serverRows = doCreateServerRows(serverSpanIds, serverSpanById, jdbcSpansByParentId,
                stackTraceById, sqlQueryById);
        List<UnassociatedRow> unassociatedRows = createUnassociatedRows(unassociatedJdbcSpans, stackTraceById,
                sqlQueryById);

        String nextCursorEncoded = nextCursor == null ? null : EncodingUtil.toBase64(nextCursor);
        RowUpserts rowUpserts = new RowUpserts(mergeRows(serverRows, unassociatedRows));
        return new RowUpsertsPage(rowUpserts, nextCursorEncoded);
    }
    //endregion

    //region helper methods
    private static List<Row> mergeRows(
            List<ServerRow> serverRowUpserts,
            List<UnassociatedRow> unassociatedRowUpserts) {
        return Stream.<Row>concat(serverRowUpserts.stream(), unassociatedRowUpserts.stream())
                .sorted(Comparator.comparing(Row::cursor))
                .toList();
    }

    private static String createRowId(
            String traceId,
            String spanId) {
        return traceId + ":" + spanId;
    }

    private static double durationMillis(
            Instant start,
            Instant end) {
        return Math.max(0, Duration.between(start, end).toNanos() / 1_000_000.0);
    }
    //endregion

    //region clean-up
    @Override
    @PreDestroy
    public synchronized void close() {
        otelSpanMapper.close();
        dataStore.close();
    }
    //endregion
}
