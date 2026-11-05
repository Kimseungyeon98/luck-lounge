package com.lucklounge.lobby;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StompAuthInterceptorTest {

    @Test
    void 자기_팀_주소와_개인_큐만_허용한다() {
        assertThat(StompAuthInterceptor.allowed("/topic/t/abcd2345/presence", "abcd2345")).isTrue();
        assertThat(StompAuthInterceptor.allowed("/app/t/abcd2345/presence/sync", "abcd2345")).isTrue();
        assertThat(StompAuthInterceptor.allowed("/user/queue/me", "abcd2345")).isTrue();

        assertThat(StompAuthInterceptor.allowed("/topic/t/other999/presence", "abcd2345")).isFalse();
        assertThat(StompAuthInterceptor.allowed("/topic/t/abcd23456/presence", "abcd2345")).isFalse();
        assertThat(StompAuthInterceptor.allowed("/topic/everything", "abcd2345")).isFalse();
    }
}
