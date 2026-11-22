plugins {
    java
    id("org.springframework.boot") version "3.5.10"
}

dependencies {
    implementation(project(":nplusone-common"))
    implementation(platform("org.springframework.boot:spring-boot-dependencies:3.5.10"))
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-thymeleaf")
}
