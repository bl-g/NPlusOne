package com.goosb.nplusone.common;

/** Configuration property names shared by the detector, agent and test integration. */
public enum ConfigProperty {
    OTLP_PORT("nplusone.otlp-port"),
    FRONTEND_ORIGIN("nplusone.frontend-origin"),
    DATABASE_PATH("nplusone.database-path"),
    BACKEND_URL("nplusone.backend-url"),
    UI_HIDE_PROXY_FRAMES("nplusone.ui.hide-proxy-frames"),
    LIVE_UPDATES_QUEUE_CAPACITY("nplusone.live-updates.queue-capacity"),
    LIVE_UPDATES_MAX_SUBSCRIBERS("nplusone.live-updates.max-subscribers"),
    AGENT_EXTENSION_STACKTRACE_APP_PACKAGE_PREFIXES("nplusone.stacktrace.application-package-prefixes"),
    AGENT_EXTENSION_STACKTRACE_MAX_STACK_FRAMES("nplusone.stacktrace.max-stack-frames"),
    TEST_AGENT_DISABLED("nplusone.test.agent.disabled"),
    ;

    private final String name;

    ConfigProperty(
            String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }
}
