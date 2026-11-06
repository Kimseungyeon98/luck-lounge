package com.lucklounge;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * 테스트 DB. 기본은 Testcontainers로 PostgreSQL 컨테이너를 띄운다.
 * Docker를 쓸 수 없는 환경에서는 환경 변수로 이미 떠 있는 DB를 쓴다:
 * LUCKLOUNGE_TEST_EXTERNAL_DB=true SPRING_DATASOURCE_URL=... SPRING_DATASOURCE_USERNAME=... SPRING_DATASOURCE_PASSWORD=...
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestDatabaseConfiguration {

    @Bean
    @ServiceConnection
    @ConditionalOnProperty(name = "lucklounge.test.external-db", havingValue = "false", matchIfMissing = true)
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer("postgres:17-alpine");
    }
}
