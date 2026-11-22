# NPlusOne Test Java Agent
This module contains no application code.
It exists merely to build a custom OpenTelemetry (OTel) Java agent distribution for N+1 regression testing.

This distribution combines the OTel Java agent with two N+1 projects:
- `nplusone-test-bootstrap`, which provides the `NPlusOneTestBridge`.
- `nplusone-test-javaagent-extension`, containing `JdbcStackTraceSpanProcessor` and `NPlusOneTestSpanProcessor`.

The distribution uses a very specific packaging structure. Some context here:
- The OTel Java agent uses a custom classloader.
It reads its implementation classes and dependencies from the `inst/` directory.
OTel expects these classes to be stored as `.classdata` files.
This applies to `JdbcStackTraceSpanProcessor` and `NPlusOneTestSpanProcessor`,
since they are invoked by the agent when processing a span.
- The `NPlusOneTestBridge`, on the other hand, should be used by both the `NPlusOneTestSpanProcessor` _and_ the JUnit extension/rule.
For this to work, the test bridge should be loaded by the JVM's bootstrap classloader.
- At startup, OTel adds the agent JAR to the boostrap classloader's search path.
Thus, the bridge should be packaged as a normal `.class` file at its normal package path, not inside `inst/`.

To create this packaging structure,
this project's build uses `buildSrc/src/main/kotlin/nplusone.javaagent-shadow-conventions.gradle.kts`.
This convention is based on OTel's [javaagent-shadow-conventions.gradle.kts](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/main/examples/distro/buildSrc/src/main/kotlin/otel.javaagent-shadow-conventions.gradle.kts),
with some project-specific changes.

The resulting JAR is published as `nplusone-test-javaagent` and can be attached to the test JVM using `-javaagent`.
