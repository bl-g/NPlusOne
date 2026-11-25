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
    implementation(libs.slf4j.api)
    implementation(platform(libs.opentelemetry.bom))
    implementation(libs.opentelemetry.api)

    compileOnly(project(":nplusone-test-bootstrap"))

}
