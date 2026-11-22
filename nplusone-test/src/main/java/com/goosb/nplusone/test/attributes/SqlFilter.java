package com.goosb.nplusone.test.attributes;

/**
 * Selects the SQL queries included when counting N+1 patterns.
 * <p>
 * <b>Note:</b> implementations must be public and have a public no-argument constructor.
 */
@FunctionalInterface
public interface SqlFilter {

    /**
     * @param sql the captured SQL text, before normalization; may be {@code null}
     * @return {@code true} if the given query should be considered by NPlusOne, otherwise {@code false}
     */
    boolean include(
            String sql);
}
