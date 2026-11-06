package com.lucklounge.lobby;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.lucklounge.TestDatabaseConfiguration;
import com.lucklounge.player.JoinService;
import com.lucklounge.player.JoinService.JoinCommand;
import com.lucklounge.team.TeamRepository;
import java.lang.reflect.Type;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.MessageHeaders;
import org.springframework.messaging.converter.StringMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestDatabaseConfiguration.class)
class LobbyPresenceTest {

    @LocalServerPort
    int port;

    @Autowired
    JoinService joinService;

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
    void 두_사람이_들어오면_서로의_이름이_보이고_나가면_빠진다() throws Exception {
        String kim = joinService.join(slug, null, new JoinCommand("김대리", 0, null)).token();
        String park = joinService.join(slug, null, new JoinCommand("박과장", 1, null)).token();

        BlockingQueue<String> kimInbox = new LinkedBlockingQueue<>();
        StompSession kimSession = connect(kim);
        subscribePresence(kimSession, kimInbox);
        assertThat(kimInbox.poll(5, TimeUnit.SECONDS)).contains("김대리").doesNotContain("박과장");

        BlockingQueue<String> parkInbox = new LinkedBlockingQueue<>();
        StompSession parkSession = connect(park);
        subscribePresence(parkSession, parkInbox);
        assertThat(parkInbox.poll(5, TimeUnit.SECONDS)).contains("김대리").contains("박과장");
        assertThat(kimInbox.poll(5, TimeUnit.SECONDS)).contains("박과장");

        // 먼저 들어온 김대리가 방장
        String kimId = joinService.me(slug, kim).orElseThrow().playerId().toString();
        Thread.sleep(500);
        kimInbox.clear();

        parkSession.disconnect();
        String afterLeave = kimInbox.poll(5, TimeUnit.SECONDS);
        assertThat(afterLeave).contains("김대리").doesNotContain("박과장").contains("\"hostId\":\"" + kimId + "\"");
        kimSession.disconnect();
    }

    @Test
    void 말풍선은_금칙어를_가려서_모두에게_보낸다() throws Exception {
        String kim = joinService.join(slug, null, new JoinCommand("김대리", 0, null)).token();
        StompSession session = connect(kim);
        BlockingQueue<String> events = new LinkedBlockingQueue<>();
        session.subscribe("/topic/t/" + slug + "/events", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return String.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                events.add((String) payload);
            }
        });
        Thread.sleep(300);
        StompHeaders headers = new StompHeaders();
        headers.setDestination("/app/t/" + slug + "/chat");
        headers.setContentType(org.springframework.util.MimeTypeUtils.APPLICATION_JSON);
        session.send(headers, "{\"text\":\"오늘은 바보처럼 안 진다\"}");
        assertThat(events.poll(5, TimeUnit.SECONDS)).contains("\"type\":\"chat\"").contains("오늘은 **처럼 안 진다");
        session.disconnect();
    }

    @Test
    void 토큰이_틀리면_접속이_거절된다() {
        assertThatThrownBy(() -> connect("wrong-token")).isNotNull();
    }

    private StompSession connect(String token) throws Exception {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        // 서버는 application/json 으로 보내므로, 내용 형식과 상관없이 문자열로 받는다.
        client.setMessageConverter(new StringMessageConverter() {
            @Override
            protected boolean supportsMimeType(MessageHeaders headers) {
                return true;
            }
        });
        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("team", slug);
        connectHeaders.add("token", token);
        return client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(), connectHeaders,
                        new StompSessionHandlerAdapter() { })
                .get(5, TimeUnit.SECONDS);
    }

    private void subscribePresence(StompSession session, BlockingQueue<String> inbox) {
        session.subscribe("/topic/t/" + slug + "/presence", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return String.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                inbox.add((String) payload);
            }
        });
        session.send("/app/t/" + slug + "/presence/sync", "");
    }
}
