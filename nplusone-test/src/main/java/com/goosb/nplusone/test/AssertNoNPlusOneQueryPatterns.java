package com.goosb.nplusone.test;

import com.goosb.nplusone.test.attributes.SqlFilter;
import com.goosb.nplusone.test.attributes.StackFrameFilter;
import com.goosb.nplusone.test.attributes.SqlNormalizer;

import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import com.goosb.nplusone.test.attributes.DefaultSqlNormalizer;
import com.goosb.nplusone.test.attributes.IncludeAllSql;
import com.goosb.nplusone.test.attributes.IncludeAllStackTraces;

/**
 * Fails a test when the tested code triggers more N+1 query issues than the configured maximum.
 * <p>
 * The test JVM must run with the NPlusOne test Java agent. Register the JUnit 4
 * rule or the JUnit Jupiter extension from the corresponding integration library.
 * <p>
 * <b>Usage tips</b>
 * <p>
 * A typical test contains a set-up phase ('given'), a tested action ('when') and some assertions ('then'). The {@link #includeStackTrace()}
 * can be used to make sure that only SQL queries originating from the tested action are included when counting N+1 query patterns.
 * Thus, if the set-up or assertions trigger N+1 query patterns, they will not cause the test to fail. See below for an example.
 * <p>
 * Similarly, health check queries and other SQL noise can be excluded from the N+1 query pattern count by using the {@link #includeSql()}
 * attribute.
 * <pre>
 * {@code public class TestFoo {
 *
 *      public static class OnlyStackTracesFromTestFooBar implements StackFrameFilter {
 *
 *          @Override
 *              public boolean include(String stackFrame) {
 *              return stackFrame.contains("TestFoo.doBar");
 *          }
 *      }
 *
 *      @Test
 *      @AssertNoNPlusOneQueryPatterns(includeStackTrace = OnlyStackTracesFromTestFooBar.class)
 *      public void testBar() {
 *          // given
 *          ...
 *
 *          // when
 *          doBar(...);
 *
 *          // then
 *          ...
 *      }
 *
 *      public void doBar(...) { ... }
 * }
 * }
 * </pre>
 */
@Target({ ElementType.METHOD, ElementType.TYPE, ElementType.ANNOTATION_TYPE })
@Retention(RetentionPolicy.RUNTIME)
@Inherited
public @interface AssertNoNPlusOneQueryPatterns {

    /**
     * @return the maximum number of N+1 query patterns accepted by the test
     */
    int maxNPlusOneIssues() default 0;

    /**
     * @return the number of SQL queries sent from the same call-site that is considered an indication of an N+1 query pattern
     */
    int nPlusOneQueryCount() default 2;

    /**
     * Only SQL matching this filter is included when N+1 patterns are counted.
     * Note: the filter must have a public no-argument constructor.
     */
    Class<? extends SqlFilter> includeSql() default IncludeAllSql.class;

    /**
     * Only stack traces with at least one application frame that matches this filter are included when N+1 patterns are counted.
     * Note: each stack frame is formatted as: "at fully.qualified.ClassName.methodName(FileName.java:lineNumber)".
     * Note: the filter must have a public no-argument constructor.
     */
    Class<? extends StackFrameFilter> includeStackTrace() default IncludeAllStackTraces.class;

    /**
     * Transforms SQL before grouping queries into N+1 patterns. By default, {@link DefaultSqlNormalizer} returns SQL unchanged,
     * so queries are compared exactly. Supply a custom normalizer to opt into SQL normalization.
     * Note: the normalizer must have a public no-argument constructor.
     */
    Class<? extends SqlNormalizer> normalizeSql() default DefaultSqlNormalizer.class;
}
