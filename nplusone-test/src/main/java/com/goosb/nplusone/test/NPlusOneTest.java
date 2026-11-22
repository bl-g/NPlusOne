package com.goosb.nplusone.test;

import com.goosb.nplusone.test.attributes.SqlNormalizer;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.common.message.Debug;
import com.goosb.nplusone.test.bootstrap.JdbcSpanSnapshot;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public enum NPlusOneTest {
    INSTANCE,
    ;

    private static final Logger logger = LoggerFactory.getLogger(NPlusOneTest.class);

    public void assertNoNPlusOneQueries(
            List<JdbcSpanSnapshot> jdbcSpans,
            int maxAllowedNPlusOneIssues,
            int nPlusOneQueryCount,
            SqlNormalizer normalizeSql) {
        Map<String, String> stackTraceById = jdbcSpans.stream()
                .filter(span -> !isBlank(span.stackTraceId()) && !isBlank(span.stackTrace()))
                .collect(Collectors.toMap(JdbcSpanSnapshot::stackTraceId, JdbcSpanSnapshot::stackTrace, (first, second) -> first));

        Map<StackTraceIdSqlTuple, List<JdbcSpanSnapshot>> spanByStackTraceIdSqlTuple = jdbcSpans.stream()
                .filter(NPlusOneTest::hasRequiredAttributes)
                .collect(Collectors.groupingBy(span -> new StackTraceIdSqlTuple(span.stackTraceId(), normalizeSql.normalize(span.sql()))));

        List<NPlusOnePattern> nPlusOnePatterns = spanByStackTraceIdSqlTuple.entrySet().stream()
                .map(entry -> {
                    List<JdbcSpanSnapshot> spans = entry.getValue();
                    if(spans.size() < nPlusOneQueryCount) {
                        return null;
                    }
                    StackTraceIdSqlTuple stackTraceIdSqlTuple = entry.getKey();
                    String stackTrace = stackTraceById.get(stackTraceIdSqlTuple.stackTraceId());
                    return new NPlusOnePattern(stackTraceIdSqlTuple, spans.size(), stackTrace, spans.get(0).sql());
                })
                .filter(Objects::nonNull)
                .sorted((first, second) -> Integer.compare(second.count(), first.count()))
                .toList();

        if(logger.isDebugEnabled()) {
            logger.debug(Debug.TEST_EVALUATION_SPANS_A_MISSING_ATTRIBUTES_B_GROUPS_C_PATTERNS_D_MAX_ISSUES_E_QUERY_COUNT_F_RESULT_G.getMessage(),
                    jdbcSpans.size(), jdbcSpans.stream().filter(span -> !hasRequiredAttributes(span)).count(),
                    spanByStackTraceIdSqlTuple.size(), nPlusOnePatterns.size(), maxAllowedNPlusOneIssues, nPlusOneQueryCount,
                    nPlusOnePatterns.size() > maxAllowedNPlusOneIssues ? "FAIL" : "PASS");
        }

        if(nPlusOnePatterns.size() > maxAllowedNPlusOneIssues) {
            throw new AssertionError(createFailureMessage(nPlusOnePatterns, maxAllowedNPlusOneIssues));
        }
    }

    private static boolean hasRequiredAttributes(
            JdbcSpanSnapshot span) {
        return !isBlank(span.stackTraceId())
                && !isBlank(span.sql());
    }

    private static String createFailureMessage(
            List<NPlusOnePattern> patterns,
            int maxAllowedNPlusOneIssues) {
        String summary = patterns.stream()
                .map(pattern -> "- %d x %s".formatted(pattern.count(), SqlSummarizer.summarize(pattern.exampleSql())))
                .collect(Collectors.joining(System.lineSeparator()));
        String details = patterns.stream()
                .map(NPlusOneTest::formatPattern)
                .collect(Collectors.joining(System.lineSeparator() + System.lineSeparator()));

        return Error.DETECTED_A_N_PLUS_1_QUERY_PATTERNS_B_MAX_ALLOWED_C_DETAILS_D.format(
                patterns.size(), patterns.size() == 1 ? "" : "s", maxAllowedNPlusOneIssues,
                summary + System.lineSeparator() + System.lineSeparator() + "Details:" + System.lineSeparator() + details);
    }

    private static String formatPattern(
            NPlusOnePattern pattern) {
        String sql = pattern.exampleSql();
        String sqlInfo = "%d x %s".formatted(pattern.count(), sql);

        String stackTrace = pattern.stackTrace();
        if(isBlank(stackTrace)) {
            return sqlInfo;
        }

        return sqlInfo + System.lineSeparator() + stackTrace;
    }

    private record StackTraceIdSqlTuple(
            String stackTraceId,
            String sql) {

    }

    private record NPlusOnePattern(
            StackTraceIdSqlTuple stackTraceIdSqlTuple,
            int count,
            String stackTrace,
            String exampleSql) {

    }
}


