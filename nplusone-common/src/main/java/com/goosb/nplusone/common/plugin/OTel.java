package com.goosb.nplusone.common.plugin;

public enum OTel {
    TRACES_EXPORTER_PROPERTY("otel.traces.exporter"),
    METRICS_EXPORTER_PROPERTY("otel.metrics.exporter"),
    LOGS_EXPORTER_PROPERTY("otel.logs.exporter"),
    EXPORTER_VALUE("none"),
    ;

    private final String value;

    OTel(
            String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}

