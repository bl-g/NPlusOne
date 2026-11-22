import com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar

plugins {
    java
    id("com.gradleup.shadow")
}

val bootstrapLibs = configurations.create("bootstrapLibs") {
    isCanBeResolved = true
    isCanBeConsumed = false
    isTransitive = false
}

val javaagentLibs = configurations.create("javaagentLibs") {
    isCanBeResolved = true
    isCanBeConsumed = false
}

val upstreamAgent = configurations.create("upstreamAgent") {
    isCanBeResolved = true
    isCanBeConsumed = false
}

fun isolateClasses(jars: Iterable<File>): CopySpec = copySpec {
    jars.forEach {
        from(zipTree(it)) {
            into("inst")
            rename("^(.*)\\.class$", "\$1.classdata")
            exclude(
                "LICENSE",
                "META-INF/INDEX.LIST",
                "META-INF/*.DSA",
                "META-INF/*.SF",
                "META-INF/*.RSA",
                "META-INF/maven/**",
                "META-INF/MANIFEST.MF",
                "**/module-info.class",
            )
        }
    }
}

tasks.jar {
    enabled = false
}

val relocateJavaagentLibs = tasks.register<ShadowJar>("relocateJavaagentLibs") {
    configurations = listOf(javaagentLibs)
    archiveFileName.set("javaagentLibs-relocated.jar")

    duplicatesStrategy = DuplicatesStrategy.FAIL
    mergeServiceFiles()
    filesMatching("META-INF/services/**") {
        duplicatesStrategy = DuplicatesStrategy.INCLUDE
    }

    exclude("**/module-info.class")
    relocatePackages(this)

    dependencies {
        exclude(dependency("io.opentelemetry:opentelemetry-api"))
        exclude(dependency("io.opentelemetry:opentelemetry-api-incubator"))
        exclude(dependency("io.opentelemetry:opentelemetry-common"))
        exclude(dependency("io.opentelemetry:opentelemetry-context"))
        exclude(dependency("io.opentelemetry.semconv:opentelemetry-semconv"))
        exclude(dependency("io.opentelemetry.semconv:opentelemetry-semconv-incubating"))
    }
}

val isolateJavaagentLibs = tasks.register<Copy>("isolateJavaagentLibs") {
    dependsOn(relocateJavaagentLibs)
    with(isolateClasses(relocateJavaagentLibs.get().outputs.files))
    into(layout.buildDirectory.dir("isolated/javaagentLibs"))
}

tasks.shadowJar {
    configurations = listOf(bootstrapLibs, upstreamAgent)
    from(isolateJavaagentLibs)

    archiveClassifier.set("")

    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
    mergeServiceFiles("inst/META-INF/services")
    filesMatching("inst/META-INF/services/**") {
        duplicatesStrategy = DuplicatesStrategy.INCLUDE
    }
    // shadow also merges Kotlin module metadata from the upstream agent.
    filesMatching("**/*.kotlin_module") {
        duplicatesStrategy = DuplicatesStrategy.INCLUDE
    }

    exclude("**/module-info.class")
    relocatePackages(this)

    manifest {
        attributes(
            "Main-Class" to "io.opentelemetry.javaagent.OpenTelemetryAgent",
            "Agent-Class" to "io.opentelemetry.javaagent.OpenTelemetryAgent",
            "Premain-Class" to "io.opentelemetry.javaagent.OpenTelemetryAgent",
            "Can-Redefine-Classes" to "true",
            "Can-Retransform-Classes" to "true",
            "Implementation-Vendor" to "NPlusOne",
            "Implementation-Version" to project.version,
        )
    }
}

val verifyAgentLayout = tasks.register("verifyAgentLayout") {
    dependsOn(tasks.shadowJar)

    doLast {
        val agentJar = tasks.shadowJar.get().archiveFile.get().asFile
        val contents = zipTree(agentJar)

        check(contents.matching {
            include(
                "org/slf4j/**",
                "com/github/benmanes/caffeine/**",
                "org/jspecify/**",
                "com/google/errorprone/**",
                "com/goosb/nplusone/common/**",
            )
        }.isEmpty) {
            "Bootstrap classpath must not expose common module classes or their dependencies"
        }

        check(contents.matching {
            include("com/goosb/nplusone/test/bootstrap/NPlusOneTestBridge.class")
        }.files.size == 1) {
            "NPlusOneTestBridge must be packaged as a bootstrap-loadable class"
        }

        check(contents.matching {
            include("inst/com/goosb/nplusone/test/agent/NPlusOneTestSpanProcessor.classdata")
        }.files.size == 1) {
            "NPlusOneTestSpanProcessor must be placed under inst as classdata"
        }

        check(contents.matching {
            include("inst/com/goosb/nplusone/agent/JdbcStackTraceSpanProcessor.classdata")
        }.files.size == 1) {
            "The shared JDBC processor must be placed under inst as classdata"
        }

        check(contents.matching {
            include("com/goosb/nplusone/test/agent/NPlusOneTestSpanProcessor.class")
        }.isEmpty) {
            "NPlusOneTestSpanProcessor must not be exposed on the bootstrap classpath"
        }

        val providers = contents.matching {
            include("inst/META-INF/services/io.opentelemetry.sdk.autoconfigure.spi.AutoConfigurationCustomizerProvider")
        }.singleFile.readText()

        check(!providers.contains("com.goosb.nplusone.agent.NPlusOneAgentExtension"))
        check(providers.contains("com.goosb.nplusone.test.agent.NPlusOneTestAgentExtension"))
    }
}

tasks.check {
    dependsOn(verifyAgentLayout)
}

tasks.assemble {
    dependsOn(tasks.shadowJar)
}

val testJavaagentElements = configurations.create("testJavaagentElements") {
    isCanBeConsumed = true
    isCanBeResolved = false
}

artifacts {
    add(testJavaagentElements.name, tasks.shadowJar)
}
