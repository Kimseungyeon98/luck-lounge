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
}
