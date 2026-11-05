package com.lucklounge.team;

import java.security.SecureRandom;

/** 팀 링크용 무작위 주소. 헷갈리는 글자(0/o, 1/l/i)는 뺐다. */
final class TeamSlugs {

    static final int LENGTH = 8;
    private static final char[] ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private TeamSlugs() {
    }

    static String generate() {
        char[] out = new char[LENGTH];
        for (int i = 0; i < LENGTH; i++) {
            out[i] = ALPHABET[RANDOM.nextInt(ALPHABET.length)];
        }
        return new String(out);
    }
}
