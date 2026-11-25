plugins {
    java
    id("com.gradleup.shadow")
}

dependencies {
    implementation(project(":nplusone-common"))
    implementation(libs.slf4j.api)
    implementation(project(":nplusone-javaagent-extension-common"))

    compileOnly(platform(libs.opentelemetry.bom))
    compileOnly(libs.opentelemetry.api)
    compileOnly(libs.opentelemetry.sdk.trace)
    compileOnly(libs.opentelemetry.sdk.autoconfigure.spi)

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
