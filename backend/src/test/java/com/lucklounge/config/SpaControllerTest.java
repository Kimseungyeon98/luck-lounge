package com.lucklounge.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.lucklounge.TestDatabaseConfiguration;
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

    @Test
    void 고정_주소는_링크_미리보기에_전체_그림_주소를_넣는다() throws Exception {
        // 프론트엔드 없이 빌드한 경우(-PskipFrontend)에는 index.html 이 없어 확인할 수 없다
        assumeTrue(new ClassPathResource("static/index.html").exists());
        String html = mvc.perform(get("/").header("Host", "lounge.example.com").header("X-Forwarded-Proto", "https"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(html).contains("<title>운빨 라운지</title>");
        assertThat(html).contains("og:image\" content=\"https://lounge.example.com/og.png\"");
        assertThat(html).contains("og:url\" content=\"https://lounge.example.com/\"");
    }

    @Test
    void 예전_팀_링크는_첫_화면으로_보낸다() throws Exception {
        mvc.perform(get("/t/zzzzzzzz")).andExpect(status().is3xxRedirection()).andExpect(redirectedUrl("/"));
    }
}
