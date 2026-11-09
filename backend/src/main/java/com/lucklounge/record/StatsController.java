package com.lucklounge.record;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class StatsController {

    private final StatsService stats;

    StatsController(StatsService stats) {
        this.stats = stats;
    }

    /** 통계 게시판. period: this(이번 달) | last(지난달) | all(전체) */
    @GetMapping("/api/teams/{slug}/stats")
    StatsService.Stats stats(@PathVariable String slug, @RequestParam(defaultValue = "this") String period) {
        return stats.stats(slug, period);
    }

    /** 경쟁 게임 최고 기록 (팀 1등, 내 기록). 연습과 내기 기록을 모두 본다 */
    @GetMapping("/api/teams/{slug}/bests")
    java.util.List<StatsService.GameBest> bests(@PathVariable String slug, @RequestParam(required = false) java.util.UUID player) {
        return stats.bests(slug, player);
    }
}
