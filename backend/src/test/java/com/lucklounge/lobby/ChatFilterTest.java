package com.lucklounge.lobby;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class ChatFilterTest {

    final ChatFilter filter = new ChatFilter(List.of("바보", "개새끼", "새끼", "shit"));

    @Test
    void 금칙어만_가린다() {
        assertThat(filter.clean("오늘은 바보처럼 안 진다")).contains("오늘은 **처럼 안 진다");
    }

    @Test
    void 긴_금칙어를_먼저_가리고_붙은_구간은_하나로() {
        assertThat(filter.clean("이 개새끼야")).contains("이 **야");
        assertThat(filter.clean("바보바보")).contains("**");
    }

    @Test
    void 영문은_대소문자_구분_없이() {
        assertThat(filter.clean("Oh SHIT")).contains("Oh **");
    }

    @Test
    void 사십_글자로_자르고_공백을_정리한다() {
        String longText = "가".repeat(50);
        assertThat(filter.clean(longText).orElseThrow()).hasSize(40);
        assertThat(filter.clean("  안녕   하세요\n")).contains("안녕 하세요");
        assertThat(filter.clean("   ")).isEmpty();
    }

    @Test
    void 기본_목록을_읽는다() {
        assertThat(new ChatFilter().clean("바보야")).contains("**야");
    }
}
