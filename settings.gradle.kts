rootProject.name = "nplusone"

include(
    "nplusone-common",
    "nplusone-javaagent-extension-common",
    "nplusone-runtime-backend",
    "nplusone-runtime-frontend",
    "nplusone-javaagent-extension",
    "nplusone-test-bootstrap",
    "nplusone-test-javaagent-extension",
    "nplusone-test-javaagent",
    "nplusone-test",
    "nplusone-test-junit4",
    "nplusone-test-junit-jupiter",
    "nplusone-plugin-gradle",
    "nplusone-plugin-maven",
    "petclinic-nplusone-example",
)

project(":petclinic-nplusone-example").projectDir = file("faq-and-example-projects/petclinic-nplusone-example")
