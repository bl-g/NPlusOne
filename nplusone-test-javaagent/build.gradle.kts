plugins {
    id("nplusone.javaagent-shadow-conventions")
    `maven-publish`
}

publishing {
    publications.create<MavenPublication>("maven") {
        artifact(tasks.named("shadowJar"))
    }
}

dependencies {
    bootstrapLibs(project(":nplusone-test-bootstrap"))

    javaagentLibs(
        project(
            path = ":nplusone-test-javaagent-extension",
            configuration = "javaagentExtensionElements",
        ),
    )

    upstreamAgent("io.opentelemetry.javaagent:opentelemetry-javaagent:2.30.0")
}
