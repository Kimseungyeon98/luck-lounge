package com.lucklounge.team;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.lucklounge.TestDatabaseConfiguration;
import org.junit.jupiter.api.AfterEach;
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
class RoomApiTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    TeamRepository teams;

    @Autowired
    JdbcTemplate jdbc;

    @AfterEach
    void cleanUp() {
        // 다른 테스트는 서버가 만든 기본 팀 하나만 있다고 본다
        jdbc.execute("truncate game_round_player, game_round, game_session, player_device, player cascade");
        jdbc.update("delete from skill_score where team_id in (select id from team where created_by is not null)");
        jdbc.update("delete from team where created_by is not null");
    }

    @Test
    void 기본_팀에도_방_코드가_있고_소문자로_넣어도_찾는다() throws Exception {
        Team team = teams.findAll().getFirst();
        assertThat(team.getCode()).matches("[A-HJ-NP-Z2-9]{6}");
        mvc.perform(get("/api/rooms/{code}", team.getCode().toLowerCase()).with(ip("10.0.0.1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(team.getSlug()))
                .andExpect(jsonPath("$.code").value(team.getCode()))
                .andExpect(jsonPath("$.name").value(team.getName()));
    }

    @Test
    void 방을_만들면_코드가_나오고_그_코드로_들어갈_수_있다() throws Exception {
        String body = create("기획팀", "device-key-aaaaaaaaaaaa", "10.0.0.2")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("기획팀"))
                .andReturn().getResponse().getContentAsString();
        String code = JsonPath.read(body, "$.code");
        String slug = JsonPath.read(body, "$.slug");
        assertThat(code).matches("[A-HJ-NP-Z2-9]{6}");
        mvc.perform(get("/api/rooms/{code}", code).with(ip("10.0.0.2"))).andExpect(jsonPath("$.slug").value(slug));
        mvc.perform(get("/api/teams/{slug}", slug)).andExpect(jsonPath("$.code").value(code));
    }

    @Test
    void 같은_기기는_하루_3개까지() throws Exception {
        for (int i = 0; i < 3; i++) {
            create("방" + i, "device-key-bbbbbbbbbbbb", "10.0.0.3").andExpect(status().isOk());
        }
        create("방4", "device-key-bbbbbbbbbbbb", "10.0.0.3").andExpect(status().isTooManyRequests());
        // 다른 기기는 만들 수 있다
        create("방5", "device-key-cccccccccccc", "10.0.0.3").andExpect(status().isOk());
    }

    @Test
    void 이름이_비었거나_길거나_기기_열쇠가_없으면_거절() throws Exception {
        create("  ", "device-key-dddddddddddd", "10.0.0.4").andExpect(status().isBadRequest());
        create("가".repeat(21), "device-key-dddddddddddd", "10.0.0.4").andExpect(status().isBadRequest());
        create("기획팀", null, "10.0.0.4").andExpect(status().isBadRequest());
    }

    @Test
    void 없는_코드는_404_이고_1분에_10번_넘게_틀리면_429() throws Exception {
        for (int i = 0; i < 10; i++) {
            mvc.perform(get("/api/rooms/{code}", "ZZZZZ" + i).with(ip("10.0.0.5"))).andExpect(status().isNotFound());
        }
        String code = teams.findAll().getFirst().getCode();
        mvc.perform(get("/api/rooms/{code}", code).with(ip("10.0.0.5"))).andExpect(status().isTooManyRequests());
        // 다른 곳에서는 그대로 들어간다
        mvc.perform(get("/api/rooms/{code}", code).with(ip("10.0.0.6"))).andExpect(status().isOk());
    }

    private ResultActions create(String name, String deviceKey, String ip) throws Exception {
        var req = post("/api/rooms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\"}").with(ip(ip));
        if (deviceKey != null) {
            req.header("X-Device-Key", deviceKey);
        }
        return mvc.perform(req);
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor ip(String ip) {
        return r -> {
            r.setRemoteAddr(ip);
            return r;
        };
    }
}
