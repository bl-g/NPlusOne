package com.goosb.nplusone.test.attributes;

/** Default SQL normalizer: returns the input unchanged so queries are compared exactly. */
public final class DefaultSqlNormalizer implements SqlNormalizer {

    @Override
    public String normalize(
            String s) {
        return s;
    }
}
