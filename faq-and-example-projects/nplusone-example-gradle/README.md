# Standalone Gradle example

This folder is an independent Gradle build, excluded from the repository's root build. It consumes versioned application dependencies from Maven repositories. The repository no longer includes a test suite for this example.

Publish the common library locally before running it:

```shell
./gradlew :nplusone-common:publishToMavenLocal
./gradlew -p faq-and-example-projects/nplusone-example-gradle bootRun
```

The explicit common-library dependency supplies the demo service's error messages; normal client applications do not need it.

To monitor the application, use the [runtime quick start](../README.md#quick-start-run-time-tool). To add NPlusOne assertions to your own tests, follow the [test-assertion setup](../README.md#quick-start-test-asserts). This example's package shares the detector's namespace, so configure `nplusone.stacktrace.application-package-prefixes=com.goosb.nplusone.examples` when monitoring it.
