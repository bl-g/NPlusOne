package com.goosb.nplusone.test.agent;

import com.goosb.nplusone.agent.JdbcStackTraceSpanProcessor;
import com.goosb.nplusone.common.message.Debug;
import com.goosb.nplusone.test.bootstrap.NPlusOneTestBridge;
import io.opentelemetry.sdk.autoconfigure.spi.AutoConfigurationCustomizer;
import io.opentelemetry.sdk.autoconfigure.spi.AutoConfigurationCustomizerProvider;
import io.opentelemetry.sdk.trace.SdkTracerProviderBuilder;
import io.opentelemetry.sdk.trace.samplers.Sampler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Adds synchronous JDBC-span capture to the custom N+1 test Java agent distribution.
 */
public final class NPlusOneTestAgentExtension implements AutoConfigurationCustomizerProvider {

    private static final Logger logger = LoggerFactory.getLogger(NPlusOneTestAgentExtension.class);

    @Override
    public void customize(
            AutoConfigurationCustomizer customizer) {
        logger.debug(Debug.INSTALLING_TEST_AGENT_EXTENSION.getMessage());
        customizer.addTracerProviderCustomizer((builder, config) -> {
            SdkTracerProviderBuilder configuredBuilder = builder
                    // if the test-environment supplies some (non-always) sampler, then OTel processes it first, and we can override it here
                    // to make sure *all* JDBC spans (which is required for the N+1 checks)
                    .setSampler(Sampler.alwaysOn())
                    .addSpanProcessor(JdbcStackTraceSpanProcessor.fromConfig(config))
                    .addSpanProcessor(new NPlusOneTestSpanProcessor());
            // mark as installed *after* configuring the builder, since in edge-cases this might fail with an exception
            // and then the agent should *not* be marked as installed
            NPlusOneTestBridge.INSTANCE.markAgentInstalled();
            return configuredBuilder;
        });
    }
}
