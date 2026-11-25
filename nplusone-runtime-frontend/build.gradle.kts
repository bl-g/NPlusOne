plugins {
    java
    alias(libs.plugins.spring.boot)
}

dependencies {
    implementation(project(":nplusone-common"))
    implementation(platform(libs.spring.boot.bom))
    implementation(libs.spring.boot.starter.web)
    implementation(libs.spring.boot.starter.thymeleaf)
}
