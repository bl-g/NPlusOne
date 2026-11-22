package com.goosb.nplusone.test.attributes;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.test.AssertNoNPlusOneQueryPatterns;
import com.goosb.nplusone.test.bootstrap.JdbcSpanSnapshot;

import java.util.List;

public final class SqlIncludePredicateUtil {

    private static final String ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME = AssertNoNPlusOneQueryPatterns.class.getSimpleName();

    private SqlIncludePredicateUtil() {
        // util class
    }

    public static SqlFilter createOrThrow(
            AssertNoNPlusOneQueryPatterns annotation) {
        Class<? extends SqlFilter> includeSql = annotation.includeSql();
        if(includeSql == null) { // an annotation attribute cannot be null in Java, but just in case someone managed to bypass this restriction
            throw new IllegalArgumentException(Error.A_INCLUDESQL_CANNOT_BE_NULL.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME));
        }

        try {
            return includeSql.getDeclaredConstructor().newInstance();
        }
        catch(ReflectiveOperationException | SecurityException exception) {
            throw new IllegalArgumentException(Error.A_INCLUDESQL_B_HAS_NO_PUBLIC_NO_ARG_CONSTRUCTOR.format(
                    ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME, includeSql.getName()), exception);
        }
    }

    public static List<JdbcSpanSnapshot> filter(
            List<JdbcSpanSnapshot> jdbcSpans,
            SqlFilter includeSql) {
        if(includeSql.getClass() == IncludeAllSql.class) {
            return jdbcSpans;
        }

        return jdbcSpans.stream()
                .filter(jdbcSpan -> includeSql.include(jdbcSpan.sql()))
                .toList();
    }
}
