plugins {
    java
    id("org.springframework.boot") version "3.5.0"
}

repositories {
    mavenLocal()
    mavenCentral()
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.release.set(17)
    options.encoding = "UTF-8"
    options.compilerArgs.add("-parameters")
}


dependencies {
    implementation("com.goosb.nplusone:nplusone-common:0.1.0-beta.1")
    implementation(platform("org.springframework.boot:spring-boot-dependencies:3.5.0"))
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-web")
    runtimeOnly("com.h2database:h2")

}
