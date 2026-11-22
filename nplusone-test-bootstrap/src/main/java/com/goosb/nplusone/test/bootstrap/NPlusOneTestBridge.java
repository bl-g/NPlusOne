package com.goosb.nplusone.test.bootstrap;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public enum NPlusOneTestBridge {
    INSTANCE,
    ;

    private final ConcurrentMap<String, TraceData> traceIdToData = new ConcurrentHashMap<>();

    private boolean agentInstalled;

    public void registerTrace(
            String traceId) {
        requireTraceId(traceId);
        TraceData existingTraceData = traceIdToData.putIfAbsent(traceId, new TraceData());
        if(existingTraceData != null) {
            throw new IllegalStateException("Trace is already registered. Trace id: " + traceId);
        }
    }

    private static void requireTraceId(
            String traceId) {
        if(traceId == null || traceId.isBlank()) {
            throw new IllegalArgumentException("Trace id is missing");
        }
    }

    public boolean isTraceRegistered(
            String traceId) {
        requireTraceId(traceId);
        return traceIdToData.containsKey(traceId);
    }

    public void recordJdbcSpan(
            JdbcSpanSnapshot span) {
        String traceId = span.traceId();
        TraceData traceData = traceIdToData.get(traceId);
        if(traceData == null) {
            throw new IllegalArgumentException("Span belongs to trace that is not registered. Trace id: " + traceId);
        }
        traceData.add(span);
    }

    public List<JdbcSpanSnapshot> completeTrace(
            String traceId) {
        requireTraceId(traceId);
        TraceData traceData = traceIdToData.remove(traceId);
        return traceData == null ? List.of() : traceData.getSpans();
    }

    public void discardTrace(
            String traceId) {
        requireTraceId(traceId);
        traceIdToData.remove(traceId);
    }

    public int activeTraceCount() {
        return traceIdToData.size();
    }

    public void markAgentInstalled() {
        agentInstalled = true;
    }

    public boolean isAgentInstalled() {
        return agentInstalled;
    }

    private static final class TraceData {

        private final List<JdbcSpanSnapshot> spans = new ArrayList<>();

        private synchronized void add(
                JdbcSpanSnapshot span) {
            spans.add(span);
        }

        private synchronized List<JdbcSpanSnapshot> getSpans() {
            return List.copyOf(spans);
        }
    }
}
