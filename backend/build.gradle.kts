plugins {
    java
    id("org.springframework.boot") version "4.0.9"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.lucklounge"
version = "0.1.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
    useJUnitPlatform()
}

tasks.bootJar {
    archiveFileName = "luck-lounge.jar"
}

tasks.jar {
    enabled = false
}

// ---- 프론트엔드(Phaser + Vite) 빌드 결과를 jar의 static 리소스로 포함 ----
// -PskipFrontend 를 주면 백엔드만 빌드한다 (서버 코드만 고칠 때 빠르게).
val frontendDir = rootProject.layout.projectDirectory.dir("frontend")
val skipFrontend = providers.gradleProperty("skipFrontend").isPresent
val isWindows = System.getProperty("os.name").lowercase().contains("windows")
val npm = if (isWindows) "npm.cmd" else "npm"

val npmInstall by tasks.registering(Exec::class) {
    group = "frontend"
    description = "frontend 의존성 설치 (npm ci)"
    workingDir(frontendDir)
    commandLine(npm, "ci", "--no-audit", "--no-fund")
    inputs.file(frontendDir.file("package-lock.json"))
    outputs.dir(frontendDir.dir("node_modules"))
}

val npmBuild by tasks.registering(Exec::class) {
    group = "frontend"
    description = "frontend 빌드 (타입 검사 + vite build)"
    dependsOn(npmInstall)
    workingDir(frontendDir)
    commandLine(npm, "run", "build")
    inputs.dir(frontendDir.dir("src"))
    inputs.dir(frontendDir.dir("public"))
    inputs.files(
        frontendDir.file("index.html"),
        frontendDir.file("package.json"),
        frontendDir.file("tsconfig.json"),
        frontendDir.file("vite.config.ts"),
    )
    outputs.dir(frontendDir.dir("dist"))
}

tasks.processResources {
    if (!skipFrontend) {
        dependsOn(npmBuild)
        from(frontendDir.dir("dist")) {
            into("static")
        }
    }
}
