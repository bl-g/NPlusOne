package com.goosb.nplusone.datastore;

import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.SQLDialect;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.jooq.impl.SQLDataType;

import java.sql.Connection;
import java.util.Arrays;

import static org.jooq.impl.DSL.*;
import static org.jooq.impl.DSL.check;
import static org.jooq.impl.DSL.foreignKey;
import static org.jooq.impl.DSL.primaryKey;

import com.goosb.nplusone.data.dto.RowType;

public final class DataStoreSchema {

    public static final Table<?> STACK_TRACE = table(name("stack_trace"));
    public static final Table<?> SQL_QUERY = table(name("sql_query"));
    public static final Table<?> SERVER_SPAN = table(name("server_span"));
    public static final Table<?> JDBC_SPAN = table(name("jdbc_span"));
    public static final Table<?> ROW_INDEX = table(name("row_index"));

    public static final Field<String> ID = field(name("id"), String.class);
    public static final Field<String> CONTENT = field(name("content"), String.class);
    public static final Field<String> TRACE_ID = field(name("trace_id"), String.class);
    public static final Field<String> PARENT_SPAN_ID = field(name("parent_span_id"), String.class);
    public static final Field<String> SQL_ID = field(name("sql_id"), String.class);
    public static final Field<String> STACK_TRACE_ID = field(name("stack_trace_id"), String.class);
    public static final Field<String> NAME = field(name("name"), String.class);
    public static final Field<Long> START_UNIX_NANO = field(name("start_unix_nano"), Long.class);
    public static final Field<Long> END_UNIX_NANO = field(name("end_unix_nano"), Long.class);
    public static final Field<String> ROW_TYPE = field(name("row_type"), String.class);
    public static final Field<String> SPAN_ID = field(name("span_id"), String.class);

    private static final String[] SUPPORTED_ROW_TYPES = Arrays.stream(RowType.values())
            .map(RowType::name)
            .toArray(String[]::new);

    private DataStoreSchema() {
        // util class
    }

    public static void create(
            Connection connection) {
        DSLContext context = DSL.using(connection, SQLDialect.SQLITE);

        // for the two tables below, the id is the hash of the content
        // the idea is similar to a content-addressable database: avoid storing the same stack_trace/sql_query twice
        context.createTableIfNotExists(STACK_TRACE)
                .column(ID, SQLDataType.VARCHAR.nullable(false))
                .column(CONTENT, SQLDataType.VARCHAR) // can be null if stack trace is received in later span
                .constraint(primaryKey(ID))
                .execute();

        context.createTableIfNotExists(SQL_QUERY)
                .column(ID, SQLDataType.VARCHAR.nullable(false))
                .column(CONTENT, SQLDataType.VARCHAR.nullable(false))
                .constraint(primaryKey(ID))
                .execute();

        // note: in SQLite an integer is 64-bits (signed)
        // so this won't overflow until the year 2262 (=2^63/10^9/60/60/24/365.25+1970)
        // in the very, very unlikely case that this project is still running in 2262,
        // I hereby apologize to whatever AI-model that is maintaining this codebase at that time
        context.createTableIfNotExists(SERVER_SPAN)
                .column(TRACE_ID, SQLDataType.VARCHAR.nullable(false))
                .column(ID, SQLDataType.VARCHAR.nullable(false))
                .column(NAME, SQLDataType.VARCHAR.nullable(false))
                .column(START_UNIX_NANO, SQLDataType.BIGINT.nullable(false))
                .column(END_UNIX_NANO, SQLDataType.BIGINT.nullable(false))
                .constraint(primaryKey(TRACE_ID, ID))
                .execute();

        context.createTableIfNotExists(JDBC_SPAN)
                .column(TRACE_ID, SQLDataType.VARCHAR.nullable(false))
                .column(ID, SQLDataType.VARCHAR.nullable(false))
                .column(PARENT_SPAN_ID, SQLDataType.VARCHAR.nullable(false))
                .column(SQL_ID, SQLDataType.VARCHAR.nullable(false))
                .column(STACK_TRACE_ID, SQLDataType.VARCHAR.nullable(false))
                .column(START_UNIX_NANO, SQLDataType.BIGINT.nullable(false))
                .column(END_UNIX_NANO, SQLDataType.BIGINT.nullable(false))
                .constraint(primaryKey(TRACE_ID, ID))
                .constraint(foreignKey(SQL_ID).references(SQL_QUERY, ID))
                .constraint(foreignKey(STACK_TRACE_ID).references(STACK_TRACE, ID))
                .execute();

        context.createTableIfNotExists(ROW_INDEX)
                .column(ROW_TYPE, SQLDataType.VARCHAR.nullable(false))
                .column(TRACE_ID, SQLDataType.VARCHAR.nullable(false))
                .column(SPAN_ID, SQLDataType.VARCHAR.nullable(false))
                .column(START_UNIX_NANO, SQLDataType.BIGINT.nullable(false))
                .constraint(check(ROW_TYPE.in(SUPPORTED_ROW_TYPES)))
                .constraint(primaryKey(TRACE_ID, SPAN_ID))
                .execute();

        // for DataStore#findJdbcSpansByParentIds
        context.createIndexIfNotExists("jdbc_span_parent_idx")
                .on(JDBC_SPAN, TRACE_ID, PARENT_SPAN_ID)
                .execute();

        // for DataStore#findJdbcSpansByStackTraceIds
        context.createIndexIfNotExists("jdbc_span_stack_trace_idx")
                .on(JDBC_SPAN, STACK_TRACE_ID)
                .execute();

        // for DataStore#findRowIndexes
        context.createIndexIfNotExists("row_index_pagination_idx")
                .on(ROW_INDEX, START_UNIX_NANO, ROW_TYPE, TRACE_ID, SPAN_ID)
                .execute();
    }
}
