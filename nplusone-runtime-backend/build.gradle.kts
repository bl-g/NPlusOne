plugins {
    java
    application
    alias(libs.plugins.spring.boot)
}

dependencies {
    implementation(platform(libs.spring.boot.bom))
    implementation(platform(libs.grpc.bom))
    implementation(platform(libs.opentelemetry.bom))

    implementation(project(":nplusone-common"))
    implementation(libs.jackson.jsr310)
    implementation(libs.hikari)
    implementation(libs.jooq)
    implementation(libs.grpc.netty.shaded)
    implementation(libs.grpc.protobuf)
    implementation(libs.grpc.stub)
    implementation(libs.opentelemetry.proto)
    implementation(libs.opentelemetry.semconv)
    implementation(libs.opentelemetry.api)
    implementation(libs.caffeine)
    implementation(libs.sqlite.jdbc)
    implementation(libs.spring.boot.starter.web)

}

application {
    mainClass.set("com.goosb.nplusone.NPlusOneApplication")
}
