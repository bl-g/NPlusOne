plugins {
    `java-gradle-plugin`
    `maven-publish`
}

gradlePlugin {
    plugins {
        create("nplusone") {
            id = "com.goosb.nplusone"
            implementationClass = "com.goosb.nplusone.gradle.NPlusOneGradlePlugin"
            displayName = "NPlusOne"
            description = "Configure the NPlusOne test Java agent for Gradle Test tasks."
        }
    }
}

dependencies {
    implementation(project(":nplusone-common"))
}
