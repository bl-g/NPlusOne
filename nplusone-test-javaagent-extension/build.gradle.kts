
plugins {
    java
    id("com.gradleup.shadow")
}

base {
    archivesName.set("nplusone-test-javaagent-extension")
}

dependencies {
    implementation(project(":nplusone-common"))
    implementation(project(":nplusone-javaagent-extension-common"))
    implementation("org.slf4j:slf4j-api:2.0.17")
    compileOnly(project(":nplusone-test-bootstrap"))

    compileOnly(platform("io.opentelemetry:opentelemetry-bom:1.64.0"))
    implementation("io.opentelemetry.semconv:opentelemetry-semconv:1.43.0")
    compileOnly("io.opentelemetry:opentelemetry-api")
    compileOnly("io.opentelemetry:opentelemetry-sdk-trace")
    compileOnly("io.opentelemetry:opentelemetry-sdk-extension-autoconfigure-spi")

}

tasks.jar {
    enabled = false // build a fat JAR instead, see below
}

tasks.shadowJar {
    archiveClassifier.set("") // prevents "-all" suffix in output JAR name

    // avoid potential classpath conflicts with instrumented application
    val relocateToPrefix = "com.goosb.nplusone.agent.shaded";
    relocate(pattern = "com.github.benmanes.caffeine", destination = "${relocateToPrefix}.caffeine")
    relocate(pattern = "io.opentelemetry.semconv", destination = "${relocateToPrefix}.semconv")

    mergeServiceFiles()
    // let the service transformer see every provider before merging.
    filesMatching("META-INF/services/**") {
        duplicatesStrategy = DuplicatesStrategy.INCLUDE
    }

    // dependency signatures are invalid after shading, so must be removed
    val metaInf = "META-INF/"
    exclude("${metaInf}/*.SF", "${metaInf}/*.DSA", "${metaInf}/*.RSA")
}

// expose this project's fat JAR, so that the nplusone-test-javaagent project can package it into its JAR
val javaagentExtensionElements = configurations.create("javaagentExtensionElements") {
    isCanBeConsumed = true
    isCanBeResolved = false
}

artifacts {
    add(javaagentExtensionElements.name, tasks.shadowJar)
}
