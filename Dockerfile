# Railway 배포용 이미지 (docs/railway-setup.md). Railway 가 저장소 루트의 이 파일을 찾아 직접 빌드한다.
# Oracle VM 배포는 deploy/Dockerfile(미리 만든 jar 를 받는 방식)을 그대로 쓴다.

# ---------- 빌드: 프론트엔드(npm) + 백엔드(Gradle) → jar 하나 ----------
FROM node:22-bookworm-slim AS node

FROM eclipse-temurin:25-jdk AS build
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
WORKDIR /src
COPY . .
# 테스트는 GitHub Actions(CI)가 이미 돌리므로 여기서는 빌드만
RUN ./gradlew --no-daemon --console=plain :backend:bootJar -x test

# ---------- 실행 ----------
FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /src/backend/build/libs/luck-lounge.jar app.jar
# Railway 무료 요금제는 서비스당 메모리 0.5GB. 8명 규모라 힙 256MB면 충분하고,
# 쓴 메모리만큼 크레딧이 줄어들므로 작게 잡는다. C1 컴파일러만 써서 시작도 빠르게(잠에서 깰 때).
ENV JAVA_OPTS="-Xmx256m -Xss512k -XX:MaxMetaspaceSize=160m -XX:+UseSerialGC -XX:TieredStopAtLevel=1"
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
