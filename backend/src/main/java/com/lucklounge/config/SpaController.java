package com.lucklounge.config;

import com.lucklounge.team.TeamRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * 팀 링크(/t/{slug})로 들어오면 프론트엔드 index.html을 돌려준다.
 * 단톡방 링크 미리보기를 위해 제목에 팀 이름을 넣고, 미리보기 그림 주소를 전체 주소로 바꾼다
 * (카카오톡 등은 og:image 가 전체 주소여야 그림을 보여 준다).
 * 어떤 팀인지는 프론트엔드가 주소를 읽어 API로 다시 확인한다.
 */
@Controller
class SpaController {

    private final TeamRepository teams;
    private volatile String template;

    SpaController(TeamRepository teams) {
        this.teams = teams;
    }

    @GetMapping({"/t/{slug}", "/t/{slug}/"})
    Object team(@PathVariable String slug, HttpServletRequest request) {
        String html = template();
        if (html == null) {
            return "forward:/index.html";
        }
        String origin = ServletUriComponentsBuilder.fromContextPath(request).replacePath(null).build().toUriString();
        String title = teams.findBySlug(slug).map(t -> t.getName() + " · 운빨 라운지").orElse("운빨 라운지");
        String page = html
                .replace("<title>운빨 라운지</title>", "<title>" + escape(title) + "</title>")
                .replace("<meta property=\"og:title\" content=\"운빨 라운지\" />",
                        "<meta property=\"og:title\" content=\"" + escape(title) + "\" />\n    <meta property=\"og:url\" content=\""
                                + escape(origin + "/t/" + slug) + "\" />")
                .replace("<meta property=\"og:image\" content=\"/og.png\" />",
                        "<meta property=\"og:image\" content=\"" + escape(origin + "/og.png") + "\" />");
        return ResponseEntity.ok().contentType(new MediaType("text", "html", StandardCharsets.UTF_8)).body(page);
    }

    /** 빌드된 index.html (jar 안 static). 없으면(프론트엔드 없이 빌드) null */
    private String template() {
        String t = template;
        if (t == null) {
            ClassPathResource res = new ClassPathResource("static/index.html");
            if (!res.exists()) {
                return null;
            }
            try (InputStream in = res.getInputStream()) {
                t = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                return null;
            }
            template = t;
        }
        return t;
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }
}
