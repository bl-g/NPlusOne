plugins {
    `java-library`
    `maven-publish`
}

publishing {
    publications.create<MavenPublication>("maven") {
        from(components["java"])
    }
}

base {
    archivesName.set("nplusone-test")
}

dependencies {

    implementation(project(":nplusone-common"))
    implementation("org.slf4j:slf4j-api:2.0.17")
    implementation(platform("io.opentelemetry:opentelemetry-bom:1.64.0"))
    implementation("io.opentelemetry:opentelemetry-api")

    compileOnly(project(":nplusone-test-bootstrap"))

}
