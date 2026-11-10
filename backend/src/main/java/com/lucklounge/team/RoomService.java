package com.lucklounge.team;

import com.lucklounge.lobby.ChatFilter;
import com.lucklounge.player.DeviceTokens;
import com.lucklounge.web.BadRequestException;
import com.lucklounge.web.NotFoundException;
import com.lucklounge.web.TooManyRequestsException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 방(팀) 찾기·만들기. 고정 주소에서 방 코드를 입력하거나 새 방을 만든다 (M9).
 * - 잘못된 코드는 같은 IP에서 1분에 10번, 서버 전체 1분에 300번까지만 받는다 (코드 맞히기 방지)
 * - 방 만들기는 같은 기기에서 하루 3개, 같은 IP에서 하루 10개까지
 */
@Service
public class RoomService {

    public static final int NAME_MAX = 20;
    static final int CREATE_PER_DEVICE = 3;
    static final int CREATE_PER_IP = 10;
    static final int WRONG_CODE_PER_MINUTE = 10;
    /** IP는 X-Forwarded-For 로 꾸밀 수 있어 서버 전체에도 한도를 둔다 (분당 300번이면 코드 맞히기에 수천 년) */
    static final int WRONG_CODE_PER_MINUTE_ALL = 300;
    private static final String ALL = "*";

    private final TeamRepository teams;
    private final ChatFilter filter;
    private final Clock clock;
    private final RateLimiter wrongCodes;
    private final RateLimiter wrongCodesAll;
    private final RateLimiter createsByIp;

    RoomService(TeamRepository teams, ChatFilter filter, Clock clock) {
        this.teams = teams;
        this.filter = filter;
        this.clock = clock;
        this.wrongCodes = new RateLimiter(WRONG_CODE_PER_MINUTE, Duration.ofMinutes(1), clock);
        this.wrongCodesAll = new RateLimiter(WRONG_CODE_PER_MINUTE_ALL, Duration.ofMinutes(1), clock);
        this.createsByIp = new RateLimiter(CREATE_PER_IP, Duration.ofDays(1), clock);
    }

    public record Room(String slug, String code, String name) {
        static Room of(Team t) {
            return new Room(t.getSlug(), t.getCode(), t.getName());
        }
    }

    @Transactional(readOnly = true)
    public Room find(String rawCode, String ip) {
        if (wrongCodes.blocked(ip) || wrongCodesAll.blocked(ALL)) {
            throw new TooManyRequestsException("잘못된 코드를 너무 많이 넣었어요. 1분 뒤에 다시 해 주세요.");
        }
        return TeamSlugs.normalizeCode(rawCode).flatMap(teams::findByCode).map(Room::of).orElseThrow(() -> {
            wrongCodes.record(ip);
            wrongCodesAll.record(ALL);
            return new NotFoundException("없는 방 코드예요. 코드를 다시 확인해 주세요.");
        });
    }

    @Transactional
    public Room create(String rawName, String deviceKey, String ip) {
        String name = checkWords(normalizeName(rawName));
        if (deviceKey == null || deviceKey.length() < 16 || deviceKey.length() > 128) {
            throw new BadRequestException("이 브라우저에서는 방을 만들 수 없어요. 새로고침해 주세요.");
        }
        String creator = DeviceTokens.hash(deviceKey);
        Instant now = Instant.now(clock);
        if (createsByIp.blocked(ip) || teams.countByCreatedByAndCreatedAtAfter(creator, now.minus(Duration.ofDays(1))) >= CREATE_PER_DEVICE) {
            throw new TooManyRequestsException("방은 하루에 " + CREATE_PER_DEVICE + "개까지 만들 수 있어요. 내일 다시 만들어 주세요.");
        }
        String slug;
        do {
            slug = TeamSlugs.generate();
        } while (teams.existsBySlug(slug));
        String code;
        do {
            code = TeamSlugs.generateCode();
        } while (teams.existsByCode(code));
        Team team = teams.save(new Team(slug, code, name, creator, now));
        createsByIp.record(ip);
        return Room.of(team);
    }

    static String normalizeName(String raw) {
        String name = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (name.isEmpty()) {
            throw new BadRequestException("방 이름을 입력해 주세요.");
        }
        if (name.codePoints().anyMatch(Character::isISOControl)) {
            throw new BadRequestException("방 이름에 쓸 수 없는 문자가 있어요.");
        }
        if (name.codePointCount(0, name.length()) > NAME_MAX) {
            throw new BadRequestException("방 이름은 " + NAME_MAX + "글자까지 쓸 수 있어요.");
        }
        return name;
    }

    /** 금칙어가 들어간 이름은 받지 않는다 */
    String checkWords(String name) {
        if (!filter.clean(name).map(name::equals).orElse(false)) {
            throw new BadRequestException("방 이름에 쓸 수 없는 말이 있어요.");
        }
        return name;
    }
}
