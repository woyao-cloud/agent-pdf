FROM eclipse-temurin:17-jdk-alpine
WORKDIR /app
COPY pom.xml pom.xml
COPY src src
RUN apk add --no-cache maven && mvn package -DskipTests -q
RUN cp target/*.jar app.jar && rm -rf src pom.xml target ~/.m2
EXPOSE 8085
CMD ["java", "-jar", "app.jar"]