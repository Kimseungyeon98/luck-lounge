package com.lucklounge.player;

import com.lucklounge.web.BadRequestException;

/** 고를 수 있는 캐릭터는 0~9번 10종. 그림은 프론트엔드에 있다. */
public final class Characters {

    public static final int COUNT = 10;

    private Characters() {
    }

    public static int validate(Integer index) {
        if (index == null || index < 0 || index >= COUNT) {
            throw new BadRequestException("캐릭터를 골라 주세요.");
        }
        return index;
    }
}
