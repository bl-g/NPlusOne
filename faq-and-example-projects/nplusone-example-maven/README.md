# Maven example

This Spring Boot application demonstrates requests that trigger repeated JDBC queries. The repository no longer includes a test suite or JUnit run configuration for this example.

Run it from this directory:

```shell
mvn spring-boot:run
```

To monitor it, start it with the OpenTelemetry agent and NPlusOne extension as described in the [runtime quick start](../README.md#quick-start-run-time-tool). For adding NPlusOne assertions to your own tests, see the [test-assertion setup](../README.md#quick-start-test-asserts).

Set `nplusone.stacktrace.application-package-prefixes=com.goosb.nplusone.examples` when monitoring this demo: its package shares the detector's otherwise excluded namespace.
