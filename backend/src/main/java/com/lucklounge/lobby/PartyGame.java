package com.lucklounge.lobby;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Predicate;

/** 연속 판의 한 판 (시한폭탄, 풍선 불기). Match 가 판 사이 흐름을 맡고, 판 안의 규칙은 각 게임이 맡는다. */
interface PartyGame {

    /** 판 안에서 생긴 일. LobbyService 가 게임별 주소로 방송한다. */
    interface GameEvent {
    }

    /** 판 결과: 당첨자와 기록할 값 */
    record Outcome(UUID loser, long heldMs, Integer pumpCount, Integer pumpLimit, Instant at) {
    }

    String type();

    List<UUID> order();

    /** 판 시작 소식 (늦게 들어온 사람에게 다시 보낼 때도 사용) */
    GameEvent startedEvent(double centerX, double centerZ);

    List<? extends GameEvent> advanceTo(Instant now, Predicate<UUID> online);

    /** 끝났으면 결과, 아니면 null */
    Outcome outcome();
}
