package com.lucklounge.player;

import com.lucklounge.web.BadRequestException;

/** 닉네임 규칙: 앞뒤 공백 제거, 연속 공백은 하나로, 1~12글자, 제어문자 금지. */
public final class NicknamePolicy {

    public static final int MAX_LENGTH = 12;

    private NicknamePolicy() {
    }

    public static String normalize(String raw) {
        if (raw == null) {
            throw new BadRequestException("닉네임을 입력해 주세요.");
        }
        String nickname = raw.strip().replaceAll("\\s+", " ");
        if (nickname.isEmpty()) {
            throw new BadRequestException("닉네임을 입력해 주세요.");
        }
        if (nickname.codePoints().anyMatch(Character::isISOControl)) {
            throw new BadRequestException("닉네임에 쓸 수 없는 문자가 있어요.");
        }
        if (nickname.codePointCount(0, nickname.length()) > MAX_LENGTH) {
            throw new BadRequestException("닉네임은 " + MAX_LENGTH + "글자까지 쓸 수 있어요.");
        }
        return nickname;
    }
}
