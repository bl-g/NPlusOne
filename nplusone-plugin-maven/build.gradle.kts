plugins {
    base
}

// Maven owns compilation, packaging, and plugin descriptor generation.
val wrapperCommand = if (System.getProperty("os.name").startsWith("Windows", ignoreCase = true)) {
    listOf("cmd", "/c", "mvnw.cmd")
} else {
    listOf("./mvnw")
}

// IntelliJ can launch Gradle with a JDK without setting JAVA_HOME for child processes.
tasks.withType<Exec>().configureEach {
    environment("JAVA_HOME", System.getProperty("java.home"))
}

val mavenClean = tasks.register<Exec>("mavenClean") {
    description = "Cleans the Maven plugin's target directory using the Maven wrapper."
    workingDir(projectDir)
    commandLine(wrapperCommand + listOf("--batch-mode", "--no-transfer-progress", "clean"))
}

val mavenPackage = tasks.register<Exec>("mavenPackage") {
    description = "Compiles and packages the Maven plugin."
    workingDir(projectDir)
    commandLine(wrapperCommand + listOf("--batch-mode", "--no-transfer-progress", "package"))
    dependsOn(":nplusone-common:publishToMavenLocal")
    mustRunAfter(tasks.named("clean"), mavenClean)
}

val mavenVerify = tasks.register<Exec>("mavenVerify") {
    description = "Builds and verifies the Maven plugin using the Maven wrapper."
    workingDir(projectDir)
    commandLine(wrapperCommand + listOf("--batch-mode", "--no-transfer-progress", "verify"))
    dependsOn(":nplusone-common:publishToMavenLocal")
    mustRunAfter(tasks.named("clean"), mavenClean, mavenPackage)
}

tasks.named("assemble") {
    dependsOn(mavenPackage)
}

tasks.named("check") {
    dependsOn(mavenVerify)
}

tasks.named("clean") {
    dependsOn(mavenClean)
}

tasks.register<Exec>("publishToMavenLocal") {
    group = "publishing"
    description = "Builds and installs the Maven plugin into Maven Local using the Maven wrapper."
    workingDir(projectDir)
    commandLine(wrapperCommand + listOf("--batch-mode", "--no-transfer-progress", "install"))
    dependsOn(":nplusone-common:publishToMavenLocal")
    mustRunAfter(tasks.named("clean"), mavenClean, mavenPackage, mavenVerify)
}
