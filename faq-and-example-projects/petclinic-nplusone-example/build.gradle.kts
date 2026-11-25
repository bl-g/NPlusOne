
plugins {
    java
    alias(libs.plugins.spring.boot.example)
}

dependencies {
    implementation(platform(libs.spring.boot.example.bom))
    implementation(libs.spring.boot.starter.data.jpa)
    implementation(libs.spring.boot.starter.web)
    runtimeOnly(libs.h2)

}
