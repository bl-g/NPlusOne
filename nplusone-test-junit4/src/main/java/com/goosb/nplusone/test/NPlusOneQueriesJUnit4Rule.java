package com.goosb.nplusone.test;

import com.goosb.nplusone.test.attributes.SqlFilter;
import com.goosb.nplusone.test.attributes.StackFrameFilter;
import com.goosb.nplusone.test.attributes.SqlNormalizer;

import java.lang.annotation.Annotation;
import java.util.List;
import java.util.Optional;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.common.message.Debug;
import com.goosb.nplusone.test.attributes.SqlIncludePredicateUtil;
import com.goosb.nplusone.test.attributes.SqlNormalizerFunctionUtil;
import com.goosb.nplusone.test.attributes.StackTraceIncludePredicateUtil;
import com.goosb.nplusone.test.bootstrap.JdbcSpanSnapshot;
import com.goosb.nplusone.test.bootstrap.NPlusOneTestBridge;
import com.goosb.nplusone.common.ConfigProperty;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.context.Scope;

import org.junit.rules.TestRule;
import org.junit.runner.Description;
import org.junit.runners.model.Statement;
import com.goosb.nplusone.test.attributes.AnnotationLookup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * JUnit 4 method rule for tests annotated with {@link AssertNoNPlusOneQueryPatterns}.
 * Captures the test and its before/after methods. Unannotated tests are unchanged.
 */
public final class NPlusOneQueriesJUnit4Rule implements TestRule {

    private static final Logger logger = LoggerFactory.getLogger(NPlusOneQueriesJUnit4Rule.class);

    private static final String ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME = AssertNoNPlusOneQueryPatterns.class.getSimpleName();

    @Override
    public Statement apply(
            Statement base,
            Description description) {
        AssertNoNPlusOneQueryPatterns noNPlusOneAnnotation = findNPlusOneQueriesAnnotation(description);
        if(noNPlusOneAnnotation == null) { // fine, not every test method has to be annotated
            logger.debug(Debug.SKIPPING_UNANNOTATED_TEST_CAPTURE_FOR_A.getMessage(), description.getDisplayName());
            return base;
        }

        if(shouldSkip()) {
            logger.debug(Debug.SKIPPING_DISABLED_TEST_CAPTURE_FOR_A.getMessage(), description.getDisplayName());
            return base;
        }
        throwIfAgentNotInstalled();

        return new Statement() {

            @Override
            public void evaluate() throws Throwable {
                int maximum = noNPlusOneAnnotation.maxNPlusOneIssues();
                if(maximum < 0) {
                    throw new IllegalArgumentException(Error.A_MAXNPLUSONEISSUES_MUST_BE_NON_NEGATIVE.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME));
                }

                int nPlusOneQueryCount = noNPlusOneAnnotation.nPlusOneQueryCount();
                if(nPlusOneQueryCount < 1) {
                    throw new IllegalArgumentException(Error.A_NPLUSONEQUERYCOUNT_MUST_BE_AT_LEAST_ONE.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME));
                }

                SqlFilter includeSql = SqlIncludePredicateUtil.createOrThrow(noNPlusOneAnnotation);
                StackFrameFilter includeStackTraces = StackTraceIncludePredicateUtil.createOrThrow(noNPlusOneAnnotation);
                SqlNormalizer normalizeSql = SqlNormalizerFunctionUtil.createOrThrow(noNPlusOneAnnotation);

                String spanName = "%s#%s".formatted(description.getClassName(), description.getMethodName());
                Span span = GlobalOpenTelemetry.getTracer("com.goosb.nplusone.test")
                        .spanBuilder(spanName)
                        .startSpan();

                String traceId = span.getSpanContext().getTraceId();
                boolean registeredTrace = false;
                try {
                    NPlusOneTestBridge.INSTANCE.registerTrace(traceId);
                    registeredTrace = true;
                    logger.debug(Debug.STARTED_TEST_CAPTURE_FOR_A_TRACE_B_MAX_ISSUES_C_QUERY_COUNT_D_SQL_FILTER_E_STACK_FILTER_F_NORMALIZER_G.getMessage(),
                            spanName, traceId, maximum, nPlusOneQueryCount, includeSql.getClass().getName(),
                            includeStackTraces.getClass().getName(), normalizeSql.getClass().getName());
                    try(Scope __ = span.makeCurrent()) { // closing the scope removes the span again as current span
                        /* A failing test throws here. The N+1 assertion could be added as a suppressed exception, but this is likely
                        confusing/distracting to the user. Note: the NPlusOneTestJupiterExtension does also not add a suppressed exception. */
                        try {
                            base.evaluate();
                        }
                        catch(Throwable failure) {
                            logger.debug(Debug.SKIPPING_FAILED_TEST_OR_LIFECYCLE_ASSERTION_FOR_A_TRACE_B.getMessage(), spanName, traceId);
                            throw failure;
                        }
                    }
                    List<JdbcSpanSnapshot> jdbcSpans = NPlusOneTestBridge.INSTANCE.completeTrace(traceId);
                    List<JdbcSpanSnapshot> stackTraceFilteredSpans = StackTraceIncludePredicateUtil.filter(jdbcSpans, includeStackTraces);
                    List<JdbcSpanSnapshot> fullyFilteredSpans = SqlIncludePredicateUtil.filter(stackTraceFilteredSpans, includeSql);
                    logger.debug(Debug.COMPLETED_TEST_CAPTURE_FOR_A_TRACE_B_CAPTURED_C_AFTER_STACK_FILTER_D_AFTER_SQL_FILTER_E.getMessage(),
                            spanName, traceId, jdbcSpans.size(), stackTraceFilteredSpans.size(), fullyFilteredSpans.size());
                    NPlusOneTest.INSTANCE.assertNoNPlusOneQueries(fullyFilteredSpans, maximum, nPlusOneQueryCount, normalizeSql);
                }
                finally {
                    span.end();
                    if(registeredTrace) {
                        NPlusOneTestBridge.INSTANCE.discardTrace(traceId);
                    }
                }
            }
        };
    }

    private static AssertNoNPlusOneQueryPatterns findNPlusOneQueriesAnnotation(
            Description description) {
        AssertNoNPlusOneQueryPatterns methodAnnotation = description.getAnnotation(AssertNoNPlusOneQueryPatterns.class);
        if(methodAnnotation != null) {
            return methodAnnotation;
        }

        for(Annotation annotation : description.getAnnotations()) {
            Optional<AssertNoNPlusOneQueryPatterns> composedAnnotation = AnnotationLookup.findAnnotation(annotation.annotationType(),
                    AssertNoNPlusOneQueryPatterns.class);
            if(composedAnnotation.isPresent()) {
                return composedAnnotation.get();
            }
        }

        Class<?> clazz = description.getTestClass();
        if(clazz == null) {
            return null;
        }

        return AnnotationLookup.findAnnotation(clazz, AssertNoNPlusOneQueryPatterns.class).orElse(null);
    }

    private static boolean shouldSkip() {
        return Boolean.parseBoolean(System.getProperty(ConfigProperty.TEST_AGENT_DISABLED.getName()));
    }

    private static void throwIfAgentNotInstalled() {
        try {
            if(!NPlusOneTestBridge.INSTANCE.isAgentInstalled()) {
                throw new IllegalStateException(Error.TEST_JAVA_AGENT_REQUIRED_FOR_A.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME));
            }
        }
        catch(NoClassDefFoundError error) {
            throw new IllegalStateException(Error.TEST_JAVA_AGENT_REQUIRED_FOR_A.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME),
                    error);
        }
    }
}
