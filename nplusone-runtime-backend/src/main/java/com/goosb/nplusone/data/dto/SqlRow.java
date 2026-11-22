package com.goosb.nplusone.data.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.goosb.nplusone.util.ProxyStackFrames;

import java.time.Instant;
import java.util.List;

/**
 * A combination of a call-site (stack trace) and a SQL query that was executed at least once from this site.
 */
public record SqlRow(
        Instant start,
        int count,
        double jdbcDurationMillis,
        String stackTrace,
        String query) {

    @JsonProperty
    public List<String> proxyFrames() {
        return ProxyStackFrames.find(stackTrace);
    }
}
