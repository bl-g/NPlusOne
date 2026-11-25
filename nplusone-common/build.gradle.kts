plugins {
    `java-library`
    `maven-publish`
}

publishing {
    publications.create<MavenPublication>("maven") {
        from(components["java"])
        artifactId = "nplusone-common"
    }
}

base {
    archivesName.set("nplusone-common")
}

dependencies {
    implementation(libs.slf4j.api)
}
