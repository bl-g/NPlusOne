package com.goosb.nplusone.test.attributes;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.test.AssertNoNPlusOneQueryPatterns;

public final class SqlNormalizerFunctionUtil {

    private static final String ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME = AssertNoNPlusOneQueryPatterns.class.getSimpleName();

    private SqlNormalizerFunctionUtil() {
        // util class
    }

    public static SqlNormalizer createOrThrow(
            AssertNoNPlusOneQueryPatterns annotation) {
        Class<? extends SqlNormalizer> normalizeSql = annotation.normalizeSql();
        if(normalizeSql == null) { // an annotation attribute cannot be null in Java, but just in case someone managed to bypass this restriction
            throw new IllegalArgumentException(Error.A_NORMALIZESQL_CANNOT_BE_NULL.format(ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME));
        }

        try {
            return normalizeSql.getDeclaredConstructor().newInstance();
        }
        catch(ReflectiveOperationException | SecurityException exception) {
            throw new IllegalArgumentException(Error.A_NORMALIZESQL_B_HAS_NO_PUBLIC_NO_ARG_CONSTRUCTOR.format(
                    ASSERT_NO_N_PLUS_ONE_QUERIES_ANNOTATION_NAME, normalizeSql.getName()), exception);
        }
    }
}
