package com.goosb.nplusone.agent;

import com.goosb.nplusone.common.message.Debug;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.opentelemetry.sdk.autoconfigure.spi.AutoConfigurationCustomizer;
import io.opentelemetry.sdk.autoconfigure.spi.AutoConfigurationCustomizerProvider;

import java.util.Map;

public final class NPlusOneAgentExtension implements AutoConfigurationCustomizerProvider {

    private static final Logger logger = LoggerFactory.getLogger(NPlusOneAgentExtension.class);
    private static final Map<String, String> DEFAULT_PROPERTIES = Map.of(
            "otel.exporter.otlp.protocol", "grpc",
            "otel.exporter.otlp.endpoint", "http://localhost:4317",
            "otel.metrics.exporter", "none",
            "otel.logs.exporter", "none");

    @Override
    public void customize(
            AutoConfigurationCustomizer customizer) {
        logger.debug(Debug.INSTALLING_RUNTIME_AGENT_EXTENSION.getMessage());
        customizer.addPropertiesSupplier(() -> DEFAULT_PROPERTIES) // can be overridden by client
                .addTracerProviderCustomizer((tracerProviderBuilder, config) -> {
                    JdbcStackTraceSpanProcessor jdbcStackTraceSpanProcessor = JdbcStackTraceSpanProcessor.fromConfig(config);
                    return tracerProviderBuilder.addSpanProcessor(jdbcStackTraceSpanProcessor);
                });
    }
}
