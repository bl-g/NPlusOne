package com.goosb.nplusone.test;

import com.goosb.nplusone.test.attributes.SqlFilter;
import com.goosb.nplusone.test.attributes.StackFrameFilter;
import com.goosb.nplusone.test.attributes.SqlNormalizer;

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

import org.junit.jupiter.api.extension.AfterTestExecutionCallback;
import org.junit.jupiter.api.extension.BeforeTestExecutionCallback;
import org.junit.jupiter.api.extension.ExtensionConfigurationException;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.platform.commons.support.AnnotationSupport;
import org.junit.jupiter.api.Nested;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Method;
import java.util.List;

/**
 * Creates one OpenTelemetry trace around an annotated test method and evaluates all JDBC spans captured for that trace.
 * Register with {@code @ExtendWith(NPlusOneTestJupiterExtension.class)} on a test class or method.
 */
public final class NPlusOneTestJupiterExtension implements BeforeTestExecutionCallback, AfterTestExecutionCallback {

    private static final Logger logger = LoggerFactory.getLogger(NPlusOneTestJupiterExtension.class);

    private static final String ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME = AssertNoNPlusOneQueryPatterns.class.getSimpleName();
    private static final String INSTRUMENTATION_NAME = "com.goosb.nplusone.test";

    private static final ExtensionContext.Namespace NAMESPACE = ExtensionContext.Namespace.create(NPlusOneTestJupiterExtension.class);
    private static final String STATE_KEY = "state";

    @Override
    public void beforeTestExecution(
            ExtensionContext context) {
        if(shouldSkip()) {
            logger.debug(Debug.SKIPPING_DISABLED_TEST_CAPTURE_FOR_A.getMessage(), context.getUniqueId());
            return;
        }
        Class<?> testClass = context.getRequiredTestClass();
        Method testMethod = context.getRequiredTestMethod();
        AssertNoNPlusOneQueryPatterns nPlusOneAnnotation = findAnnotation(testClass, testMethod);
        if(nPlusOneAnnotation == null) {
            return;
        }
        throwIfAgentNotInstalled();
        int maxAllowedNPlusOneIssues = getMaxAllowedNPlusOneIssuesOrThrow(nPlusOneAnnotation);
        int nPlusOneQueryCount = getNPlusOneQueryCountOrThrow(nPlusOneAnnotation);
        SqlFilter includeSql;
        StackFrameFilter includeStackTraces;
        SqlNormalizer normalizeSql;
        try {
            includeSql = SqlIncludePredicateUtil.createOrThrow(nPlusOneAnnotation);
            includeStackTraces = StackTraceIncludePredicateUtil.createOrThrow(nPlusOneAnnotation);
            normalizeSql = SqlNormalizerFunctionUtil.createOrThrow(nPlusOneAnnotation);
        }
        catch(IllegalArgumentException exception) {
            throw new ExtensionConfigurationException(Error.INVALID_A_CONFIG.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME), exception);
        }

        String spanName = "%s#%s".formatted(testClass.getSimpleName(), testMethod.getName());
        Span testSpan = GlobalOpenTelemetry.getTracer(INSTRUMENTATION_NAME)
                .spanBuilder(spanName)
                .startSpan();

        String traceId = testSpan.getSpanContext().getTraceId();
        Scope scope = null;
        boolean registeredTrace = false;
        try {
            NPlusOneTestBridge.INSTANCE.registerTrace(traceId);
            registeredTrace = true;
            scope = testSpan.makeCurrent();
            TestState testState = new TestState(testSpan, scope, traceId, maxAllowedNPlusOneIssues, nPlusOneQueryCount, includeSql,
                    includeStackTraces, normalizeSql);
            context.getStore(NAMESPACE)
                    .put(STATE_KEY, testState);
            logger.debug(Debug.STARTED_TEST_CAPTURE_FOR_CLASS_A_METHOD_B_TRACE_C_MAX_ISSUES_D_QUERY_COUNT_E_SQL_FILTER_F_STACK_FILTER_G_NORMALIZER_H.getMessage(),
                    testClass.getName(), testMethod.getName(), traceId, maxAllowedNPlusOneIssues, nPlusOneQueryCount,
                    includeSql.getClass().getName(), includeStackTraces.getClass().getName(), normalizeSql.getClass().getName());
        }
        catch(Throwable e) {
            if(scope != null) {
                scope.close(); // removes the span as current span
            }
            testSpan.end();
            if(registeredTrace) {
                NPlusOneTestBridge.INSTANCE.discardTrace(traceId);
            }
            throw e;
        }
    }

    @Override
    public void afterTestExecution(
            ExtensionContext context) {
        if(shouldSkip()) {
            return;
        }
        TestState state = context.getStore(NAMESPACE)
                .remove(STATE_KEY, TestState.class);
        if(state == null) { // unannotated test, or capture did not start successfully
            logger.debug(Debug.SKIPPING_ASSERTION_WITHOUT_CAPTURE_FOR_A.getMessage(), context.getUniqueId());
            return;
        }

        state.scope().close(); // removes the span as current span
        state.span().end();

        boolean testFailed = context.getExecutionException().isPresent();
        if(testFailed) {
            logger.debug(Debug.SKIPPING_FAILED_TEST_ASSERTION_FOR_A_TRACE_B.getMessage(), context.getUniqueId(), state.traceId());
            /* If a test fails, then JUnit adds an assertion-error from an extension as a suppressed exception to the test failure.
            Most test runners show these suppressed exceptions in the test output, which can be confusing/distracting to the user.
            Hence, avoid any N+1 assertion if the test itself already failed. */
            NPlusOneTestBridge.INSTANCE.discardTrace(state.traceId());
            return;
        }

        List<JdbcSpanSnapshot> jdbcSpans = NPlusOneTestBridge.INSTANCE.completeTrace(state.traceId());
        List<JdbcSpanSnapshot> stackTraceFilteredSpans = StackTraceIncludePredicateUtil.filter(jdbcSpans, state.includeStackTraces());
        List<JdbcSpanSnapshot> fullyFilteredSpans = SqlIncludePredicateUtil.filter(stackTraceFilteredSpans, state.includeSql());
        logger.debug(Debug.COMPLETED_TEST_CAPTURE_FOR_A_TRACE_B_CAPTURED_C_AFTER_STACK_FILTER_D_AFTER_SQL_FILTER_E.getMessage(),
                context.getUniqueId(), state.traceId(), jdbcSpans.size(), stackTraceFilteredSpans.size(), fullyFilteredSpans.size());
        NPlusOneTest.INSTANCE.assertNoNPlusOneQueries(fullyFilteredSpans, state.maxAllowedNPlusOneIssues(),
                state.nPlusOneQueryCount(), state.normalizeSql());
    }

    private static boolean shouldSkip() {
        return Boolean.parseBoolean(System.getProperty(ConfigProperty.TEST_AGENT_DISABLED.getName()));
    }

    private static void throwIfAgentNotInstalled() {
        try {
            if(!NPlusOneTestBridge.INSTANCE.isAgentInstalled()) {
                throw new ExtensionConfigurationException(
                        Error.TEST_JAVA_AGENT_REQUIRED_FOR_A.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME));
            }
        }
        catch(NoClassDefFoundError error) {
            throw new ExtensionConfigurationException(
                    Error.TEST_JAVA_AGENT_REQUIRED_FOR_A.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME), error);
        }
    }

    private static AssertNoNPlusOneQueryPatterns findAnnotation(
            Class<?> testClass,
            Method testMethod) {
        AssertNoNPlusOneQueryPatterns methodAnnotation = AnnotationSupport.findAnnotation(testMethod, AssertNoNPlusOneQueryPatterns.class).orElse(null);
        if(methodAnnotation != null) {
            return methodAnnotation;
        }

        Class<?> currentClass = testClass;
        while(currentClass != null) {
            AssertNoNPlusOneQueryPatterns classAnnotation = AnnotationSupport.findAnnotation(currentClass, AssertNoNPlusOneQueryPatterns.class)
                    .orElse(null);
            if(classAnnotation != null) {
                return classAnnotation;
            }
            // search enclosing classes only for @Nested tests, matching JUnit's extension (@ExtendWith) inheritance
            currentClass = AnnotationSupport.isAnnotated(currentClass, Nested.class) ? currentClass.getEnclosingClass() : null;
        }

        return null;
    }

    private static int getMaxAllowedNPlusOneIssuesOrThrow(
            AssertNoNPlusOneQueryPatterns annotation) {
        int maxNPlusOneIssues = annotation.maxNPlusOneIssues();
        if(maxNPlusOneIssues < 0) {
            throw new ExtensionConfigurationException(Error.A_MAXNPLUSONEISSUES_MUST_BE_NON_NEGATIVE.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME));
        }

        return maxNPlusOneIssues;
    }

    private static int getNPlusOneQueryCountOrThrow(
            AssertNoNPlusOneQueryPatterns annotation) {
        int nPlusOneQueryCount = annotation.nPlusOneQueryCount();
        if(nPlusOneQueryCount < 1) {
            throw new ExtensionConfigurationException(Error.A_NPLUSONEQUERYCOUNT_MUST_BE_AT_LEAST_ONE.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME));
        }
        return nPlusOneQueryCount;
    }

    private record TestState(
            Span span,
            Scope scope,
            String traceId,
            int maxAllowedNPlusOneIssues,
            int nPlusOneQueryCount,
            SqlFilter includeSql,
            StackFrameFilter includeStackTraces,
            SqlNormalizer normalizeSql) {

    }
}
