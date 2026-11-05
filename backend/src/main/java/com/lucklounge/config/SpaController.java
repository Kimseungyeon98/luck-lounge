package com.lucklounge.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 팀 링크(/t/{slug})로 들어오면 프론트엔드 index.html을 그대로 돌려준다.
 * 어떤 팀인지는 프론트엔드가 주소를 읽어 API로 확인한다.
 */
@Controller
class SpaController {

    @GetMapping({"/t/{slug}", "/t/{slug}/"})
    String team() {
        return "forward:/index.html";
    }
}
