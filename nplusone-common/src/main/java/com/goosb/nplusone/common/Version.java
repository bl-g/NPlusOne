package com.goosb.nplusone.common;

public enum Version {
    ZERO_ONE_ZERO_BETA_ONE("0.1.0-beta.1"),
    ;

    public static final Version CURRENT = ZERO_ONE_ZERO_BETA_ONE;

    private final String value;

    Version(
            String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
