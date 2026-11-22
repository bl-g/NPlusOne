# syntax=docker/dockerfile:1
# Compile and test on the builder's native CPU; the JAR is shared by both runtime images.
FROM --platform=$BUILDPLATFORM eclipse-temurin:17-jdk-jammy AS java17

FROM --platform=$BUILDPLATFORM eclipse-temurin:25-jdk-jammy AS build
COPY --from=java17 /opt/java/openjdk /opt/java/java17
WORKDIR /workspace
COPY . .
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew \
    && ./gradlew --no-daemon -Porg.gradle.java.installations.paths=/opt/java/java17 \
       :nplusone-runtime-backend:test :nplusone-runtime-backend:bootJar \
    && cp nplusone-runtime-backend/build/libs/*.jar /tmp/app.jar

FROM eclipse-temurin:25-jre-jammy
RUN groupadd --gid 10001 nplusone \
    && useradd --uid 10001 --gid nplusone --no-create-home nplusone \
    && mkdir -p /app /data && chown nplusone:nplusone /app /data
WORKDIR /app
COPY --from=build --chown=nplusone:nplusone /tmp/app.jar app.jar
ENV NPLUSONE_DATABASE_PATH=/data/nplusone.db
USER nplusone
EXPOSE 8081 4317
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
