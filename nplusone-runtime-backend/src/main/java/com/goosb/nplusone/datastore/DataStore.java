package com.goosb.nplusone.datastore;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.data.RowCursor;
import com.goosb.nplusone.data.SpanId;
import com.goosb.nplusone.data.db.JdbcSpan;
import com.goosb.nplusone.data.db.ServerSpan;
import com.goosb.nplusone.data.dto.RowType;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.SQLDialect;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.sqlite.SQLiteConfig;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;

import static com.goosb.nplusone.common.StringsUtil.isBlank;
import static com.goosb.nplusone.datastore.DataStoreSchema.*;
import static org.jooq.impl.DSL.*;

public final class DataStore implements AutoCloseable {

    private static final String JDBC_SQLITE_URL_PREFIX = "jdbc:sqlite:";
    private static final int MAX_DATABASE_CONNECTION_POOL_SIZE = 3;
    private static final Duration CONNECTION_POOL_TIME_OUT_MS = Duration.ofSeconds(10);
    private static final Duration SQLITE_BUSY_TIMEOUT_MS = Duration.ofSeconds(5);

    private static final int MAX_IN_CLAUSE_SIZE = 1_000;

    private final HikariDataSource connectionPool;

    //region instantiate instance
    public DataStore(
            Path databasePath) {
        Path absolutePath = databasePath.toAbsolutePath();
        createMissingParentDirectories(absolutePath);
        connectionPool = createConnectionPool(absolutePath);
        createSchema();
    }

    private static void createMissingParentDirectories(
            Path databasePath) {
        try {
            Path parentFolder = databasePath.getParent();
            if(parentFolder != null) {
                Files.createDirectories(parentFolder);
            }
        }
        catch(IOException e) {
            throw new IllegalStateException(Error.CANNOT_CREATE_DIRECTORIES_A.format(databasePath), e);
        }
    }

    private HikariDataSource createConnectionPool(
            Path absoluteDatabasePath) {
        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setJdbcUrl(JDBC_SQLITE_URL_PREFIX + absoluteDatabasePath);
        hikariConfig.setMaximumPoolSize(MAX_DATABASE_CONNECTION_POOL_SIZE);
        hikariConfig.setConnectionTimeout(CONNECTION_POOL_TIME_OUT_MS.toMillis());
        createSqlLiteProperties().forEach((key, value) -> hikariConfig.addDataSourceProperty(String.valueOf(key), value));
        return new HikariDataSource(hikariConfig);
    }

    private static Properties createSqlLiteProperties() {
        SQLiteConfig sqliteConfig = new SQLiteConfig();
        sqliteConfig.enforceForeignKeys(true);
        sqliteConfig.setJournalMode(SQLiteConfig.JournalMode.WAL);
        sqliteConfig.setBusyTimeout((int) SQLITE_BUSY_TIMEOUT_MS.toMillis());
        return sqliteConfig.toProperties();
    }

    private void createSchema() {
        try(Connection connection = connectionPool.getConnection()) {
            connection.setAutoCommit(true);
            DataStoreSchema.create(connection);
        }
        catch(SQLException exception) {
            connectionPool.close();
            throw new IllegalStateException(Error.CANNOT_CREATE_SCHEMA.getMessage(), exception);
        }
    }
    //endregion

    //region withTransaction
    public <T> T doInTransaction(
            Function<Connection, T> persistentAction) {
        try(Connection connection = getTransactionalConnection()) {
            try {
                T result = persistentAction.apply(connection);
                connection.commit();
                return result;
            }
            catch(RuntimeException e) {
                rollback(connection, e);
                throw e;
            }
            catch(SQLException e) {
                rollback(connection, e);
                throw new IllegalStateException(Error.SQLITE_TRANSACTION_FAILED.getMessage(), e);
            }
        }
        catch(SQLException e) {
            throw new IllegalStateException(Error.CANNOT_CLOSE_DB_CONNECTION.getMessage(), e);
        }
    }

    private Connection getTransactionalConnection() {
        try {
            Connection connection = connectionPool.getConnection();
            connection.setAutoCommit(false);
            return connection;
        }
        catch(SQLException exception) {
            throw new IllegalStateException(Error.CANNOT_FETCH_DB_CONNECTION.getMessage(), exception);
        }
    }

    private void rollback(
            Connection connection,
            Throwable originalException) {
        try {
            connection.rollback();
        }
        catch(SQLException rollbackException) {
            originalException.addSuppressed(rollbackException);
        }
    }
    //endregion

    //region saveServerSpans
    public void saveServerSpans(
            Connection connection,
            Collection<ServerSpan> serverSpans) {
        for(ServerSpan serverSpan : serverSpans) {
            saveServerSpan(connection, serverSpan);
            saveRowIndex(connection, RowType.SERVER, serverSpan.traceId(), serverSpan.id(), serverSpan.start());
        }
    }

    private void saveServerSpan(
            Connection connection,
            ServerSpan serverSpan) {
        context(connection)
                .insertInto(SERVER_SPAN, TRACE_ID, ID, NAME, START_UNIX_NANO, END_UNIX_NANO)
                .values(serverSpan.traceId(), serverSpan.id(), serverSpan.operation(), toUnixNanos(serverSpan.start()),
                        toUnixNanos(serverSpan.end()))
                .execute();
    }
    //endregion

    //region saveStackTraces

    /**
     * @return the ids of the updated stack traces, where a stack trace is updated if a stack trace with the given id was already stored,
     * but had no content yet and the given map contains content for that stack trace id
     */
    public Set<String> saveStackTraces(
            Connection connection,
            Map<String, String> stackTraceById) {
        Set<String> idsOfUpdatedStackTraces = new HashSet<>();

        stackTraceById.forEach((id, content) -> {
            if(saveStackTrace(connection, id, content)) {
                idsOfUpdatedStackTraces.add(id);
            }
        });

        return idsOfUpdatedStackTraces;
    }

    private boolean saveStackTrace(
            Connection connection,
            String id,
            String content) {
        StackTraceRow previousStackTraceRow = findStackTrace(connection, id);
        String normalizedContent = isBlank(content) ? null : content;

        context(connection)
                .insertInto(STACK_TRACE, ID, CONTENT)
                .values(id, normalizedContent)
                .onConflict(ID).doUpdate()
                .set(CONTENT, coalesce(CONTENT, excluded(CONTENT)))
                .execute();

        return previousStackTraceRow.exists()
                && !previousStackTraceRow.hasContent()
                && normalizedContent != null;
    }

    private StackTraceRow findStackTrace(
            Connection connection,
            String id) {
        Record result = context(connection)
                .select(CONTENT)
                .from(STACK_TRACE)
                .where(ID.eq(id))
                .fetchOne();

        return result != null
                ? new StackTraceRow(true, !isBlank(result.get(CONTENT)))
                : new StackTraceRow(false, false);
    }
    //endregion

    //region saveSqlQueries
    public void saveSqlQueries(
            Connection connection,
            Map<String, String> sqlQueryToId) {
        for(Map.Entry<String, String> entry : sqlQueryToId.entrySet()) {
            saveSqlQuery(connection, entry.getValue(), entry.getKey());
        }
    }

    private void saveSqlQuery(
            Connection connection,
            String id,
            String content) {
        context(connection)
                .insertInto(SQL_QUERY, ID, CONTENT)
                .values(id, content)
                .onConflict(ID).doNothing()
                .execute();
    }
    //endregion

    //region saveJdbcSpans
    public void saveJdbcSpans(
            Connection connection,
            Set<JdbcSpan> jdbcSpans) {
        for(JdbcSpan jdbcSpan : jdbcSpans) {
            saveJdbcSpan(connection, jdbcSpan);
            if(isBlank(jdbcSpan.parentId())) {
                saveRowIndex(connection, RowType.UNASSOCIATED, jdbcSpan.traceId(), jdbcSpan.id(), jdbcSpan.start());
            }
        }
    }

    private void saveJdbcSpan(
            Connection connection,
            JdbcSpan jdbcSpan) {
        context(connection)
                .insertInto(JDBC_SPAN, TRACE_ID, ID, PARENT_SPAN_ID, SQL_ID, STACK_TRACE_ID, START_UNIX_NANO, END_UNIX_NANO)
                .values(jdbcSpan.traceId(), jdbcSpan.id(), jdbcSpan.parentId(), jdbcSpan.sqlId(), jdbcSpan.stackTraceId(),
                        toUnixNanos(jdbcSpan.start()), toUnixNanos(jdbcSpan.end()))
                .onConflict(TRACE_ID, ID).doNothing()
                .execute();
    }
    //endregion

    private void saveRowIndex(
            Connection connection,
            RowType rowType,
            String traceId,
            String spanId,
            Instant start) {
        context(connection)
                .insertInto(ROW_INDEX, ROW_TYPE, TRACE_ID, SPAN_ID, START_UNIX_NANO)
                .values(rowType.name(), traceId, spanId, toUnixNanos(start))
                .onConflict(TRACE_ID, SPAN_ID).doNothing()
                .execute();
    }

    //region find*ByIds
    public Set<JdbcSpan> findJdbcSpansByStackTraceIds(
            Connection connection,
            Set<String> idsOfUpdatedStackTraces) {
        if(idsOfUpdatedStackTraces.isEmpty()) {
            return Set.of();
        }

        Set<JdbcSpan> jdbcSpans = new HashSet<>();
        for(List<String> batch : createBatches(idsOfUpdatedStackTraces)) {
            jdbcSpans.addAll(context(connection)
                    .select(TRACE_ID, ID, PARENT_SPAN_ID, STACK_TRACE_ID, SQL_ID, START_UNIX_NANO, END_UNIX_NANO)
                    .from(JDBC_SPAN)
                    .where(STACK_TRACE_ID.in(batch))
                    .fetch()
                    .map(this::readJdbcSpan));
        }
        return jdbcSpans;
    }

    public Map<String, String> findStackTracesByIds(
            Connection connection,
            Set<String> ids) {
        return findContentByIds(connection, STACK_TRACE, ids);
    }

    public Map<String, String> findSqlQueriesByIds(
            Connection connection,
            Set<String> ids) {
        return findContentByIds(connection, SQL_QUERY, ids);
    }

    private Map<String, String> findContentByIds(
            Connection connection,
            Table<?> table,
            Set<String> ids) {
        if(ids.isEmpty()) {
            return Map.of();
        }

        Map<String, String> contentById = new HashMap<>();
        for(List<String> batch : createBatches(ids)) {
            context(connection)
                    .select(ID, CONTENT)
                    .from(table)
                    .where(ID.in(batch).and(CONTENT.isNotNull()))
                    .fetch()
                    .forEach(record -> contentById.put(record.get(ID), record.get(CONTENT)));
        }
        return contentById;
    }

    public Map<SpanId, ServerSpan> findServerSpansByIds(
            Connection connection,
            Set<SpanId> ids) {
        if(ids.isEmpty()) {
            return Map.of();
        }

        Map<SpanId, ServerSpan> serverSpanById = new HashMap<>(ids.size());
        for(List<SpanId> batch : createBatches(ids)) {
            Condition condition = row(TRACE_ID, ID).in(batch.stream()
                    .map(id -> row(id.traceId(), id.spanId()))
                    .toList());

            context(connection)
                    .select(TRACE_ID, ID, NAME, START_UNIX_NANO, END_UNIX_NANO)
                    .from(SERVER_SPAN)
                    .where(condition)
                    .fetch()
                    .map(this::readServerSpan)
                    .forEach(serverSpan -> serverSpanById.put(
                            new SpanId(serverSpan.traceId(), serverSpan.id()), serverSpan));
        }
        return serverSpanById;
    }

    public Map<SpanId, Set<JdbcSpan>> findJdbcSpansByParentIds(
            Connection connection,
            Set<SpanId> parentIds) {
        if(parentIds.isEmpty()) {
            return Map.of();
        }

        Map<SpanId, Set<JdbcSpan>> jdbcSpanById = new HashMap<>(parentIds.size());
        for(SpanId parentId : parentIds) {
            jdbcSpanById.put(parentId, new LinkedHashSet<>());
        }

        for(List<SpanId> batch : createBatches(parentIds)) {
            Condition condition = row(TRACE_ID, PARENT_SPAN_ID).in(batch.stream()
                    .map(parentId -> row(parentId.traceId(), parentId.spanId()))
                    .toList());

            context(connection)
                    .select(TRACE_ID, ID, PARENT_SPAN_ID, STACK_TRACE_ID, SQL_ID, START_UNIX_NANO, END_UNIX_NANO)
                    .from(JDBC_SPAN)
                    .where(condition)
                    .fetch()
                    .map(this::readJdbcSpan)
                    .forEach(jdbcSpan -> jdbcSpanById
                            .get(new SpanId(jdbcSpan.traceId(), jdbcSpan.parentId()))
                            .add(jdbcSpan));
        }

        jdbcSpanById.replaceAll((__, spans) -> Set.copyOf(spans));
        return jdbcSpanById;
    }

    public Set<JdbcSpan> findJdbcSpansByIds(
            Connection connection,
            Set<SpanId> ids) {
        if(ids.isEmpty()) {
            return Set.of();
        }

        Set<JdbcSpan> jdbcSpans = new HashSet<>(ids.size());
        for(List<SpanId> batch : createBatches(ids)) {
            Condition condition = row(TRACE_ID, ID).in(batch.stream()
                    .map(id -> row(id.traceId(), id.spanId()))
                    .toList());

            context(connection)
                    .select(TRACE_ID, ID, PARENT_SPAN_ID, STACK_TRACE_ID, SQL_ID, START_UNIX_NANO, END_UNIX_NANO)
                    .from(JDBC_SPAN)
                    .where(condition)
                    .fetch()
                    .map(this::readJdbcSpan)
                    .forEach(jdbcSpans::add);
        }
        return Set.copyOf(jdbcSpans);
    }
    //endregion

    public List<RowCursor> findRowIndexes(
            Connection connection,
            Instant startDate,
            Instant endDate,
            RowCursor cursor,
            int limit) {
        Condition condition = noCondition();
        if(startDate != null) {
            condition = condition.and(START_UNIX_NANO.ge(toUnixNanos(startDate)));
        }
        if(endDate != null) {
            condition = condition.and(START_UNIX_NANO.lt(toUnixNanos(endDate)));
        }
        if(cursor != null) {
            condition = condition.and(row(START_UNIX_NANO, ROW_TYPE, TRACE_ID, SPAN_ID).lt(
                    row(toUnixNanos(cursor.start()), cursor.rowType().name(), cursor.traceId(), cursor.spanId())));
        }

        return context(connection)
                .select(START_UNIX_NANO, ROW_TYPE, TRACE_ID, SPAN_ID)
                .from(ROW_INDEX)
                .where(condition)
                .orderBy(START_UNIX_NANO.desc(), ROW_TYPE.desc(), TRACE_ID.desc(), SPAN_ID.desc())
                .limit(limit)
                .fetch(record -> new RowCursor(
                        readInstant(record.get(START_UNIX_NANO)),
                        RowType.valueOf(record.get(ROW_TYPE)),
                        record.get(TRACE_ID),
                        record.get(SPAN_ID)));
    }

    //region read-methods
    private ServerSpan readServerSpan(
            Record record) {
        return new ServerSpan(
                record.get(TRACE_ID),
                record.get(ID),
                record.get(NAME),
                readInstant(record.get(START_UNIX_NANO)),
                readInstant(record.get(END_UNIX_NANO)));
    }

    private JdbcSpan readJdbcSpan(
            Record record) {
        return new JdbcSpan(
                record.get(TRACE_ID),
                record.get(ID),
                record.get(PARENT_SPAN_ID),
                record.get(STACK_TRACE_ID),
                record.get(SQL_ID),
                readInstant(record.get(START_UNIX_NANO)),
                readInstant(record.get(END_UNIX_NANO)));
    }
    //endregion

    //region instant
    private static Instant readInstant(
            long value) {
        long seconds = Math.floorDiv(value, 1_000_000_000L);
        long nanos = Math.floorMod(value, 1_000_000_000L);
        return Instant.ofEpochSecond(seconds, nanos);
    }

    private static long toUnixNanos(
            Instant instant) {
        return Math.addExact(Math.multiplyExact(instant.getEpochSecond(), 1_000_000_000L), instant.getNano());
    }
    //endregion

    //region batching
    private static <T> List<List<T>> createBatches(
            Collection<T> values) {
        List<T> valuesList = new ArrayList<>(values);
        List<List<T>> batches = new ArrayList<>();

        for(int fromIndex = 0; fromIndex < valuesList.size(); fromIndex += MAX_IN_CLAUSE_SIZE) {
            int toIndex = Math.min(fromIndex + MAX_IN_CLAUSE_SIZE, valuesList.size());
            batches.add(valuesList.subList(fromIndex, toIndex));
        }

        return batches;
    }
    //endregion

    private static DSLContext context(
            Connection connection) {
        return DSL.using(connection, SQLDialect.SQLITE);
    }

    @Override
    public void close() {
        connectionPool.close();
    }

    private record StackTraceRow(
            boolean exists,
            boolean hasContent) {

    }
}
