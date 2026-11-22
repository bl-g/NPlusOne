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
    implementation("org.slf4j:slf4j-api:2.0.17")
}
