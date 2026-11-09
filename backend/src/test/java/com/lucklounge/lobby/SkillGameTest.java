package com.lucklounge.lobby;

import static org.assertj.core.api.Assertions.assertThat;

import com.lucklounge.lobby.SkillGame.SubmitResult;
import java.time.Instant;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SkillGameTest {

    final UUID a = UUID.randomUUID();
    final UUID b = UUID.randomUUID();
    final UUID c = UUID.randomUUID();
    final Instant t0 = Instant.parse("2026-11-09T00:00:00Z");
    /** 카운트다운이 끝난 뒤 */
    final Instant play = t0.plusSeconds(4);

    static boolean always(UUID id) {
        return true;
    }

    SkillGame game(String type) {
        return SkillGame.start(type, List.of(a, b, c), t0, new Random(1));
    }

    @Test
    void 카운트다운_전이나_한_번_더_내면_받지_않는다() {
        SkillGame g = game("STOP");
        assertThat(g.submit(a, 120, null, t0.plusSeconds(1))).isEqualTo(SubmitResult.TOO_EARLY);
        assertThat(g.submit(a, 120, null, play)).isEqualTo(SubmitResult.OK);
        assertThat(g.submit(a, 50, null, play)).isEqualTo(SubmitResult.ALREADY);
        assertThat(g.submit(UUID.randomUUID(), 50, null, play)).isEqualTo(SubmitResult.NOT_PLAYER);
    }

    @Test
    void 말이_안_되는_점수는_받지_않는다() {
        SkillGame stop = game("STOP");
        assertThat(stop.submit(a, -1, null, play)).isEqualTo(SubmitResult.INVALID);
        assertThat(stop.submit(a, Double.NaN, null, play)).isEqualTo(SubmitResult.INVALID);
        SkillGame tower = game("TOWER");
        assertThat(tower.submit(a, 3.5, null, play)).isEqualTo(SubmitResult.INVALID);
        assertThat(tower.submit(a, 12, 1.5, play)).isEqualTo(SubmitResult.INVALID);
        assertThat(tower.submit(a, 12, 0.4, play)).isEqualTo(SubmitResult.OK);
    }

    @Test
    void 십초_멈추기는_차이가_작은_사람이_위_모두_내면_바로_끝난다() {
        SkillGame g = game("STOP");
        g.submit(a, 300, null, play);
        g.submit(b, 20, null, play);
        assertThat(List.<Object>copyOf(g.advanceTo(play, SkillGameTest::always))).containsExactly(new SkillGame.Progress(2, 3));
        assertThat(g.outcome()).isNull();
        g.submit(c, 900, null, play);
        List<? extends PartyGame.GameEvent> events = g.advanceTo(play, SkillGameTest::always);
        assertThat(events.getLast()).isInstanceOf(SkillGame.Result.class);
        assertThat(g.result().ranking()).extracting(SkillGame.Entry::player).containsExactly(b, a, c);
        assertThat(g.worstFirst()).containsExactly(c, a, b);
        assertThat(g.outcome().loser()).isEqualTo(c);
    }

    @Test
    void 탑_쌓기는_높은_층이_위_같은_층이면_넓은_블록이_위() {
        SkillGame g = game("TOWER");
        g.submit(a, 10, 0.3, play);
        g.submit(b, 10, 0.8, play);
        g.submit(c, 15, 0.1, play);
        g.advanceTo(play, SkillGameTest::always);
        assertThat(g.result().ranking()).extracting(SkillGame.Entry::player).containsExactly(c, b, a);
    }

    @Test
    void 시간_안에_못_낸_사람은_맨_아래() {
        SkillGame g = game("STOP");
        g.submit(a, 5000, null, play);
        assertThat(g.advanceTo(t0.plusSeconds(20), SkillGameTest::always)).noneMatch(e -> e instanceof SkillGame.Result);
        // 카운트다운 3초 + 25초 + 여유 2초
        g.advanceTo(t0.plusSeconds(30), SkillGameTest::always);
        assertThat(g.result()).isNotNull();
        assertThat(g.result().ranking().getFirst().player()).isEqualTo(a);
        assertThat(g.result().ranking().subList(1, 3)).allSatisfy(e -> assertThat(e.score()).isNull());
        assertThat(g.submit(b, 10, null, t0.plusSeconds(31))).isEqualTo(SubmitResult.LATE);
    }

    @Test
    void 나간_사람은_기다리지_않는다() {
        SkillGame g = game("STOP");
        g.submit(a, 100, null, play);
        g.submit(b, 200, null, play);
        g.advanceTo(play, id -> !id.equals(c));
        assertThat(g.outcome().loser()).isEqualTo(c);
    }

    @Test
    void 과녁_멈추기는_평균_거리가_작은_사람이_위() {
        SkillGame g = game("TARGET");
        assertThat(g.submit(a, 101, null, play)).isEqualTo(SubmitResult.INVALID);
        g.submit(a, 12.5, null, play);
        g.submit(b, 3.2, null, play);
        g.submit(c, 40, null, play);
        g.advanceTo(play, SkillGameTest::always);
        assertThat(g.result().ranking()).extracting(SkillGame.Entry::player).containsExactly(b, a, c);
    }
}
