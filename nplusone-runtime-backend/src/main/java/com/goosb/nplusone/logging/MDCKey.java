package com.goosb.nplusone.logging;

public enum MDCKey {
    REQUEST_ID("requestId"),
    CONTEXT("context"),
    ;

    private final String keyName;

    MDCKey(
            String keyName) {
        this.keyName = keyName;
    }

    public String getKeyName() {
        return keyName;
    }
}
