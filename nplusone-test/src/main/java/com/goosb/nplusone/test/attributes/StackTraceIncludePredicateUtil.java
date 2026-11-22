package com.goosb.nplusone.test.attributes;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.test.AssertNoNPlusOneQueryPatterns;
import com.goosb.nplusone.test.bootstrap.JdbcSpanSnapshot;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public final class StackTraceIncludePredicateUtil {

    private static final String ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME = AssertNoNPlusOneQueryPatterns.class.getSimpleName();

    private StackTraceIncludePredicateUtil() {
        // util class
    }

    public static StackFrameFilter createOrThrow(
            AssertNoNPlusOneQueryPatterns annotation) {
        Class<? extends StackFrameFilter> includeStackTraces = annotation.includeStackTrace();
        if(includeStackTraces == null) { // an annotation attribute cannot be null in Java, but just in case someone managed to bypass this restriction
            throw new IllegalArgumentException(Error.A_INCLUDESTACKTRACE_CANNOT_BE_NULL.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME));
        }

        try {
            return includeStackTraces.getDeclaredConstructor().newInstance();
        }
        catch(ReflectiveOperationException | SecurityException exception) {
            throw new IllegalArgumentException(Error.A_INCLUDESTACKTRACE_B_HAS_NO_PUBLIC_NO_ARG_CONSTRUCTOR.format(
                    ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME, includeStackTraces.getName()), exception);
        }
    }

    public static List<JdbcSpanSnapshot> filter(
            List<JdbcSpanSnapshot> jdbcSpans,
            StackFrameFilter includeStackTraces) {
        if(includeStackTraces.getClass() == IncludeAllStackTraces.class) {
            return jdbcSpans;
        }

        /* Only one span per trace has a stack trace, but all spans have a stack trace id.
        Thus, first find the included ids and then filter the snapshots by those ids. */
        Set<String> includedStackTraceIds = jdbcSpans.stream()
                .filter(span -> !isBlank(span.stackTrace()))
                .filter(span -> span.stackTrace().lines().anyMatch(includeStackTraces::include))
                .map(JdbcSpanSnapshot::stackTraceId)
                .collect(Collectors.toSet());

        return jdbcSpans.stream()
                .filter(span -> includedStackTraceIds.contains(span.stackTraceId()))
                .toList();
    }
}
