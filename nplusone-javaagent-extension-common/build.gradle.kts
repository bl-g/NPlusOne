plugins {
    `java-library`
}

dependencies {
    implementation(libs.slf4j.api)
    implementation(project(":nplusone-common"))

    compileOnly(platform(libs.opentelemetry.bom))
    compileOnly(libs.opentelemetry.api)
    compileOnly(libs.opentelemetry.sdk.trace)
    compileOnly(libs.opentelemetry.sdk.autoconfigure.spi)

    implementation(libs.opentelemetry.semconv)
    implementation(libs.caffeine)

}
