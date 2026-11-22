plugins {
    java
    application
    id("org.springframework.boot") version "3.5.10"
}

dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:3.5.10"))
    implementation(platform("io.grpc:grpc-bom:1.82.0"))
    implementation(platform("io.opentelemetry:opentelemetry-bom:1.64.0"))

    implementation(project(":nplusone-common"))
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
    implementation("com.zaxxer:HikariCP")
    implementation("org.jooq:jooq")
    implementation("io.grpc:grpc-netty-shaded")
    implementation("io.grpc:grpc-protobuf")
    implementation("io.grpc:grpc-stub")
    implementation("io.opentelemetry.proto:opentelemetry-proto:1.10.0-alpha")
    implementation("io.opentelemetry.semconv:opentelemetry-semconv:1.43.0")
    implementation("io.opentelemetry:opentelemetry-api")
    implementation("com.github.ben-manes.caffeine:caffeine:3.2.3")
    implementation("org.xerial:sqlite-jdbc:3.53.2.1")
    implementation("org.springframework.boot:spring-boot-starter-web")

}

application {
    mainClass.set("com.goosb.nplusone.NPlusOneApplication")
}
