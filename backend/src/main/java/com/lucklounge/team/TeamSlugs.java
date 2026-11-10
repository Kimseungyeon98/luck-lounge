package com.lucklounge.team;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.Optional;

/**
 * 팀의 무작위 문자열 두 가지.
 * - slug: 내부 열쇠(8자리 소문자). 기기 토큰·소켓 주소에 쓰고 화면에는 보이지 않는다.
 * - code: 사람이 입력하는 방 코드(6자리 대문자+숫자). 헷갈리는 글자(I·O·0·1)는 뺐다.
 */
final class TeamSlugs {

    static final int LENGTH = 8;
    static final int CODE_LENGTH = 6;
    private static final char[] ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789".toCharArray();
    static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private TeamSlugs() {
    }

    static String generate() {
        return random(ALPHABET, LENGTH);
    }

    static String generateCode() {
        return random(CODE_ALPHABET.toCharArray(), CODE_LENGTH);
    }

    /** 입력한 방 코드를 정리한다: 공백·하이픈 제거, 대문자로. 모양이 틀리면 빈 값 */
    static Optional<String> normalizeCode(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String c = raw.replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
        if (c.length() != CODE_LENGTH || c.chars().anyMatch(ch -> CODE_ALPHABET.indexOf(ch) < 0)) {
            return Optional.empty();
        }
        return Optional.of(c);
    }

    private static String random(char[] alphabet, int length) {
        char[] out = new char[length];
        for (int i = 0; i < length; i++) {
            out[i] = alphabet[RANDOM.nextInt(alphabet.length)];
        }
        return new String(out);
    }
}
