plugins {
    java
    alias(libs.plugins.spring.boot.example)
    alias(libs.plugins.nplusone)
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
    implementation(platform(libs.spring.boot.example.bom))
    implementation(libs.spring.boot.starter.jdbc)
    implementation(libs.spring.boot.starter.web)
    runtimeOnly(libs.h2)
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.spring.boot.starter.test)
    testImplementation(libs.nplusone.test.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

nplusone {
    applicationPackagePrefixes.set("com.goosb.nplusone.examples")
}

tasks.test {
    useJUnitPlatform()
}
