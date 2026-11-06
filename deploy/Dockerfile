# 서버(VM)에서 직접 빌드하는 실행용 이미지. jar는 GitHub Actions가 만들어 올려 준다.
# eclipse-temurin 이미지는 ARM(Oracle Ampere)과 x86을 모두 지원한다.
FROM eclipse-temurin:25-jre

WORKDIR /app
COPY luck-lounge.jar app.jar

# 힙 1GB를 시작할 때 미리 확보(AlwaysPreTouch)해서 VM 메모리 사용률을 20% 이상으로 유지한다.
# → Oracle Always Free 유휴 회수 기준(7일간 CPU·네트워크·메모리 모두 20% 미만)에 걸리지 않게 함.
ENV JAVA_OPTS="-Xms1g -Xmx1g -XX:+AlwaysPreTouch -XX:+UseSerialGC"

EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
