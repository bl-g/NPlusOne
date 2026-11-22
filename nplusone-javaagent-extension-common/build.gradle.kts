plugins {
    `java-library`
}

dependencies {
    implementation("org.slf4j:slf4j-api:2.0.17")
    implementation(project(":nplusone-common"))

    compileOnly(platform("io.opentelemetry:opentelemetry-bom:1.64.0"))
    compileOnly("io.opentelemetry:opentelemetry-api")
    compileOnly("io.opentelemetry:opentelemetry-sdk-trace")
    compileOnly("io.opentelemetry:opentelemetry-sdk-extension-autoconfigure-spi")

    implementation("io.opentelemetry.semconv:opentelemetry-semconv:1.43.0")
    implementation("com.github.ben-manes.caffeine:caffeine:3.2.3")

}
