package com.lucklounge.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param baseUrl         팀 링크를 안내할 때 쓰는 서비스 주소 (예: https://lucklounge.duckdns.org)
 * @param defaultTeamName 서버 첫 실행 때 자동 생성할 팀 이름
 */
@ConfigurationProperties("lucklounge")
public record LuckLoungeProperties(String baseUrl, String defaultTeamName) {

    public String teamLink(String slug) {
        String base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        return base + "/t/" + slug;
    }
}
