# syntax=docker/dockerfile:1
# Compile and test on the builder's native CPU; the JAR is shared by both runtime images.
FROM --platform=$BUILDPLATFORM eclipse-temurin:17-jdk-jammy AS java17

FROM --platform=$BUILDPLATFORM eclipse-temurin:25-jdk-jammy AS build
COPY --from=java17 /opt/java/openjdk /opt/java/java17
WORKDIR /workspace
COPY . .
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew \
    && ./gradlew --no-daemon -Porg.gradle.java.installations.paths=/opt/java/java17 \
       :nplusone-runtime-frontend:test :nplusone-runtime-frontend:bootJar \
    && cp nplusone-runtime-frontend/build/libs/*.jar /tmp/app.jar

FROM eclipse-temurin:25-jre-jammy
RUN groupadd --gid 10001 nplusone \
    && useradd --uid 10001 --gid nplusone --no-create-home nplusone
WORKDIR /app
COPY --from=build --chown=nplusone:nplusone /tmp/app.jar app.jar
USER nplusone
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
