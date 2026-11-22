plugins {
    `java-library`
    `maven-publish`
}

publishing {
    publications.create<MavenPublication>("maven") {
        from(components["java"])
    }
}

dependencies {
    api(project(":nplusone-test"))
    api("org.junit.jupiter:junit-jupiter-api:5.13.4")
    implementation("org.junit.platform:junit-platform-commons:1.13.4")
    implementation(project(":nplusone-common"))
    implementation("org.slf4j:slf4j-api:2.0.17")
    implementation(platform("io.opentelemetry:opentelemetry-bom:1.64.0"))
    implementation("io.opentelemetry:opentelemetry-api")
    compileOnly(project(":nplusone-test-bootstrap"))

}
