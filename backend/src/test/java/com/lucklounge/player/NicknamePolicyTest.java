package com.lucklounge.player;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.lucklounge.web.BadRequestException;
import org.junit.jupiter.api.Test;

class NicknamePolicyTest {

    @Test
    void 공백을_정리한다() {
        assertThat(NicknamePolicy.normalize("  김  대리 ")).isEqualTo("김 대리");
    }

    @Test
    void 열두_글자까지_허용한다() {
        assertThat(NicknamePolicy.normalize("가나다라마바사아자차카타")).hasSize(12);
        assertThatThrownBy(() -> NicknamePolicy.normalize("가나다라마바사아자차카타파"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void 이모지는_한_글자로_센다() {
        assertThat(NicknamePolicy.normalize("☕🔥😂")).isEqualTo("☕🔥😂");
    }

    @Test
    void 빈_값과_제어문자는_거절한다() {
        assertThatThrownBy(() -> NicknamePolicy.normalize(null)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> NicknamePolicy.normalize("\t")).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> NicknamePolicy.normalize("a\u0007b")).isInstanceOf(BadRequestException.class);
    }
}
