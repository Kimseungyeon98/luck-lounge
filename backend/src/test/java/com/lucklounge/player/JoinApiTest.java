package com.lucklounge.player;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.lucklounge.TestDatabaseConfiguration;
import com.lucklounge.team.TeamRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestDatabaseConfiguration.class)
class JoinApiTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    TeamRepository teams;

    @Autowired
    JdbcTemplate jdbc;

    String slug;

    @BeforeEach
    void setUp() {
        jdbc.execute("truncate game_round_player, game_round, game_session, player_device, player cascade");
        slug = teams.findAll().getFirst().getSlug();
    }

    @Test
    void 서버_첫_실행에_팀이_하나_만들어진다() throws Exception {
        assertThat(teams.count()).isEqualTo(1);
        assertThat(slug).hasSize(8);
        mvc.perform(get("/api/teams/{slug}", slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("우리 팀"));
    }

    @Test
    void 없는_팀_링크는_404() throws Exception {
        mvc.perform(get("/api/teams/{slug}", "nope1234")).andExpect(status().isNotFound());
        join("nope1234", null, "김대리", 0, null).andExpect(status().isNotFound());
    }

    @Test
    void 처음_입장하면_토큰을_받고_다음엔_지난_닉네임이_미리_채워진다() throws Exception {
        String body = join(slug, null, "김대리", 3, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("김대리"))
                .andExpect(jsonPath("$.characterIndex").value(3))
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(body, "$.token");
        String playerId = JsonPath.read(body, "$.playerId");

        mvc.perform(get("/api/teams/{slug}/me", slug).header("X-Device-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playerId").value(playerId))
                .andExpect(jsonPath("$.nickname").value("김대리"));

        mvc.perform(get("/api/teams/{slug}/me", slug)).andExpect(status().isNoContent());
    }

    @Test
    void 닉네임을_바꿔_들어가도_같은_사람으로_이어진다() throws Exception {
        String first = join(slug, null, "김대리", 0, null).andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(first, "$.token");
        String playerId = JsonPath.read(first, "$.playerId");

        join(slug, token, "  커피   요정  ", 5, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playerId").value(playerId))
                .andExpect(jsonPath("$.nickname").value("커피 요정"))
                .andExpect(jsonPath("$.characterIndex").value(5))
                .andExpect(jsonPath("$.token").value(token));
    }

    @Test
    void 다른_사람이_쓰는_닉네임은_409() throws Exception {
        join(slug, null, "박과장", 0, null).andExpect(status().isOk());
        join(slug, null, "박과장", 1, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void 이어하기로_다른_브라우저에서_같은_사람이_된다() throws Exception {
        String first = join(slug, null, "이팀장", 2, null).andReturn().getResponse().getContentAsString();
        String firstToken = JsonPath.read(first, "$.token");
        String playerId = JsonPath.read(first, "$.playerId");

        mvc.perform(get("/api/teams/{slug}/players", slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].nickname").value("이팀장"));

        String resumed = join(slug, null, "이팀장", 2, playerId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playerId").value(playerId))
                .andReturn().getResponse().getContentAsString();
        String secondToken = JsonPath.read(resumed, "$.token");
        assertThat(secondToken).isNotEqualTo(firstToken);

        // 두 기기 토큰 모두 유효하다
        mvc.perform(get("/api/teams/{slug}/me", slug).header("X-Device-Token", firstToken))
                .andExpect(jsonPath("$.playerId").value(playerId));
        mvc.perform(get("/api/teams/{slug}/me", slug).header("X-Device-Token", secondToken))
                .andExpect(jsonPath("$.playerId").value(playerId));
    }

    @Test
    void 잘못된_입력은_400() throws Exception {
        join(slug, null, "   ", 0, null).andExpect(status().isBadRequest());
        join(slug, null, "열세글자가넘는아주긴닉네임", 0, null).andExpect(status().isBadRequest());
        join(slug, null, "김대리", 10, null).andExpect(status().isBadRequest());
    }

    private ResultActions join(String team, String token, String nickname, int characterIndex, String resumePlayerId)
            throws Exception {
        String json = "{\"nickname\":%s,\"characterIndex\":%d,\"resumePlayerId\":%s}".formatted(
                "\"" + nickname + "\"", characterIndex, resumePlayerId == null ? "null" : "\"" + resumePlayerId + "\"");
        var request = post("/api/teams/{slug}/join", team).contentType(MediaType.APPLICATION_JSON).content(json);
        if (token != null) {
            request.header("X-Device-Token", token);
        }
        return mvc.perform(request);
    }
}
