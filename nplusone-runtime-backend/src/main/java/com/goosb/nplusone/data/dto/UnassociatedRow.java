package com.goosb.nplusone.data.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.goosb.nplusone.data.RowCursor;
import com.goosb.nplusone.util.ProxyStackFrames;

import java.time.Instant;
import java.util.List;

/**
 * A row that holds (the data of) a JDBC span that is not associated with a server span.
 * <p>
 * Context: in the typical setup, no row of this type would exist, since OTel's Java-agent creates a (root) span per HTTP-request, with the
 * JDBC spans as children of this root span. However, a client could use an atypical setup, where either the Java-agent is configured to not
 * create a span per HTTP-request, or where JDBC spans are created outside the context of an HTTP-request. An example of the latter, is when
 * using the NPlusOne in a JUnit test. However, in the typical test approach, a root span is created per test method, so then there
 * still would be no unassociated row. To support any more exotic setup, this row type nevertheless exists.
 */
public record UnassociatedRow(
        String id,
        @JsonIgnore
        RowCursor cursor,
        Instant start,
        double jdbcDurationMillis,
        String stackTrace,
        String query) implements Row {

    @JsonProperty
    public List<String> proxyFrames() {
        return ProxyStackFrames.find(stackTrace);
    }

    @Override
    @JsonProperty
    public RowType rowType() {
        return RowType.UNASSOCIATED;
    }
}
