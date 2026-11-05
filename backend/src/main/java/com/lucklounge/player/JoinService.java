package com.lucklounge.player;

import com.lucklounge.team.Team;
import com.lucklounge.team.TeamRepository;
import com.lucklounge.web.ConflictException;
import com.lucklounge.web.NotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 입장 처리.
 * <ol>
 *   <li>기기 토큰이 이 팀의 것이면 그 사람으로 입장 (닉네임·캐릭터는 바꿀 수 있음)</li>
 *   <li>토큰이 없고 "이어하기"로 기존 사람을 골랐으면 그 사람에게 이 기기 토큰을 새로 발급</li>
 *   <li>둘 다 아니면 새 사람으로 등록</li>
 * </ol>
 */
@Service
public class JoinService {

    private final TeamRepository teams;
    private final PlayerRepository players;
    private final PlayerDeviceRepository devices;
    private final Clock clock;

    JoinService(TeamRepository teams, PlayerRepository players, PlayerDeviceRepository devices, Clock clock) {
        this.teams = teams;
        this.players = players;
        this.devices = devices;
        this.clock = clock;
    }

    public record JoinCommand(String nickname, Integer characterIndex, UUID resumePlayerId) {
    }

    public record Joined(UUID playerId, String nickname, int characterIndex, String token) {
    }

    public record PlayerView(UUID playerId, String nickname, int characterIndex) {

        static PlayerView of(Player p) {
            return new PlayerView(p.getId(), p.getNickname(), p.getCharacterIndex());
        }
    }

    @Transactional
    public Joined join(String slug, String token, JoinCommand command) {
        Team team = team(slug);
        String nickname = NicknamePolicy.normalize(command.nickname());
        int characterIndex = Characters.validate(command.characterIndex());
        Instant now = Instant.now(clock);

        Optional<PlayerDevice> device = deviceOf(team, token);
        Player player;
        String resultToken;
        if (device.isPresent()) {
            player = device.get().getPlayer();
            device.get().touch(now);
            resultToken = token;
        } else if (command.resumePlayerId() != null) {
            player = players.findByIdAndTeam(command.resumePlayerId(), team)
                    .orElseThrow(() -> new NotFoundException("이어할 사람을 찾을 수 없어요."));
            resultToken = DeviceTokens.issue();
            devices.save(new PlayerDevice(DeviceTokens.hash(resultToken), player, now));
        } else {
            ensureNicknameFree(team, nickname, null);
            player = players.save(new Player(team, nickname, characterIndex, now));
            resultToken = DeviceTokens.issue();
            devices.save(new PlayerDevice(DeviceTokens.hash(resultToken), player, now));
        }

        ensureNicknameFree(team, nickname, player.getId());
        player.enter(nickname, characterIndex, now);
        try {
            players.flush();
        } catch (DataIntegrityViolationException e) {
            throw nicknameTaken();
        }
        return new Joined(player.getId(), player.getNickname(), player.getCharacterIndex(), resultToken);
    }

    /** 이 기기로 들어왔던 사람. 없으면 빈 값. */
    @Transactional(readOnly = true)
    public Optional<PlayerView> me(String slug, String token) {
        return deviceOf(team(slug), token).map(d -> PlayerView.of(d.getPlayer()));
    }

    /** "이어하기"용 팀원 목록 (최근 접속 순). */
    @Transactional(readOnly = true)
    public List<PlayerView> members(String slug) {
        return players.findByTeamOrderByLastSeenAtDesc(team(slug)).stream().map(PlayerView::of).toList();
    }

    /** WebSocket 접속 인증용. 토큰이 이 팀 사람의 것이면 그 사람. */
    @Transactional(readOnly = true)
    public Optional<PlayerView> authenticate(String slug, String token) {
        return teams.findBySlug(slug).flatMap(team -> deviceOf(team, token)).map(d -> PlayerView.of(d.getPlayer()));
    }

    private Optional<PlayerDevice> deviceOf(Team team, String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        return devices.findWithPlayer(DeviceTokens.hash(token))
                .filter(d -> d.getPlayer().getTeam().getId().equals(team.getId()));
    }

    private Team team(String slug) {
        return teams.findBySlug(slug).orElseThrow(() -> new NotFoundException("없는 팀 링크예요. 링크를 다시 확인해 주세요."));
    }

    private void ensureNicknameFree(Team team, String nickname, UUID exceptId) {
        if (players.nicknameTaken(team, nickname, exceptId)) {
            throw nicknameTaken();
        }
    }

    private static ConflictException nicknameTaken() {
        return new ConflictException("이미 다른 사람이 쓰는 닉네임이에요. 다른 이름을 골라 주세요.");
    }
}
