package com.goosb.nplusone.common.plugin;

public enum BuildId {
    GROUP("com.goosb.nplusone"),
    TEST_ARTIFACT("nplusone-test"),
    TEST_JUNIT4_ARTIFACT("nplusone-test-junit4"),
    TEST_JUNIT_JUPITER_ARTIFACT("nplusone-test-junit-jupiter"),
    TEST_JAVAAGENT_ARTIFACT("nplusone-test-javaagent"),
    ;

    private final String value;

    BuildId(
            String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
