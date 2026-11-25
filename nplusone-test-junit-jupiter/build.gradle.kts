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
    api(libs.junit.jupiter.api)
    implementation(libs.junit.platform.commons)
    implementation(project(":nplusone-common"))
    implementation(libs.slf4j.api)
    implementation(platform(libs.opentelemetry.bom))
    implementation(libs.opentelemetry.api)
    compileOnly(project(":nplusone-test-bootstrap"))

}
