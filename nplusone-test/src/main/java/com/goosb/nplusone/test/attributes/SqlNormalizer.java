package com.goosb.nplusone.test.attributes;

/**
 * Normalizes SQL queries, so that queries that differ in insignificant ways (for example whitespace or comments) are considered to be the
 * same for NPlusOne purposes.
 * <p>
 * <b>Note:</b> implementations must be public and have a public no-argument constructor.
 */
@FunctionalInterface
public interface SqlNormalizer {

    /**
     * @param sql a SQL-query
     * @return the normalized version of the given query
     */
    String normalize(
            String sql);
}
