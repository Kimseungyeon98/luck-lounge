package com.lucklounge.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.lucklounge.TestDatabaseConfiguration;
import com.lucklounge.team.Team;
import com.lucklounge.team.TeamRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestDatabaseConfiguration.class)
class SpaControllerTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    TeamRepository teams;

    @Test
    void 팀_링크는_링크_미리보기에_팀_이름과_전체_그림_주소를_넣는다() throws Exception {
        // 프론트엔드 없이 빌드한 경우(-PskipFrontend)에는 index.html 이 없어 확인할 수 없다
        assumeTrue(new ClassPathResource("static/index.html").exists());
        Team team = teams.findAll().getFirst();
        String html = mvc.perform(get("/t/" + team.getSlug()).header("Host", "lounge.example.com").header("X-Forwarded-Proto", "https"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(html).contains("<title>" + team.getName() + " · 운빨 라운지</title>");
        assertThat(html).contains("<meta property=\"og:title\" content=\"" + team.getName() + " · 운빨 라운지\" />");
        assertThat(html).containsPattern("og:image\" content=\"https?://[^\"]+/og.png\"");
        assertThat(html).contains("og:url");
    }

    @Test
    void 없는_팀이어도_화면은_열린다() throws Exception {
        assumeTrue(new ClassPathResource("static/index.html").exists());
        String html = mvc.perform(get("/t/zzzzzzzz")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(html).contains("<title>운빨 라운지</title>");
    }
}
