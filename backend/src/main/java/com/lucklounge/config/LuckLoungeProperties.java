package com.lucklounge.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param baseUrl         로그에 방 코드와 함께 남기는 서비스 주소 (예: https://lucklounge.duckdns.org)
 * @param defaultTeamName 서버 첫 실행 때 자동 생성할 팀 이름
 */
@ConfigurationProperties("lucklounge")
public record LuckLoungeProperties(String baseUrl, String defaultTeamName) {
}
