package com.lucklounge.lobby;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * 말풍선 정리: 앞뒤 공백 제거, 40글자로 자르기, 금칙어는 그 부분만 ** 로 가림.
 * 금칙어 목록은 resources/chat/banned-words.txt.
 */
@Component
public class ChatFilter {

    public static final int MAX_LENGTH = 40;
    static final String MASK = "**";

    private final List<String> banned;

    public ChatFilter() {
        this(load());
    }

    ChatFilter(List<String> banned) {
        // 긴 단어부터 가려야 "개새끼"가 "새끼"보다 먼저 처리된다
        this.banned = banned.stream()
                .map(w -> w.toLowerCase(Locale.ROOT))
                .sorted(Comparator.comparingInt(String::length).reversed())
                .toList();
    }

    /** @return 보낼 문장. 비었거나 제어문자뿐이면 빈 값 */
    public Optional<String> clean(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String text = raw.replaceAll("\\p{Cntrl}", " ").strip().replaceAll("\\s+", " ");
        if (text.isEmpty()) {
            return Optional.empty();
        }
        if (text.codePointCount(0, text.length()) > MAX_LENGTH) {
            text = text.substring(0, text.offsetByCodePoints(0, MAX_LENGTH));
        }
        return Optional.of(mask(text));
    }

    String mask(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        StringBuilder out = new StringBuilder(text);
        boolean[] hidden = new boolean[text.length()];
        for (String word : banned) {
            int from = 0;
            int at;
            while ((at = lower.indexOf(word, from)) >= 0) {
                for (int i = at; i < at + word.length(); i++) {
                    hidden[i] = true;
                }
                from = at + word.length();
            }
        }
        // 가려진 구간 하나를 ** 하나로 바꾼다
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < out.length(); i++) {
            if (hidden[i]) {
                if (i == 0 || !hidden[i - 1]) {
                    result.append(MASK);
                }
            } else {
                result.append(out.charAt(i));
            }
        }
        return result.toString();
    }

    private static List<String> load() {
        try (InputStream in = new ClassPathResource("chat/banned-words.txt").getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).lines()
                    .map(String::strip)
                    .filter(l -> !l.isEmpty() && !l.startsWith("#"))
                    .toList();
        } catch (IOException e) {
            throw new IllegalStateException("금칙어 목록을 읽을 수 없습니다", e);
        }
    }
}
