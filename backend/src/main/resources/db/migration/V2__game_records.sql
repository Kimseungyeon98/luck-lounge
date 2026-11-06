-- 하루 내기 한 번 (투표로 정한 게임, 당첨자 수, 연습판 여부)
create table game_session (
    id             bigserial    primary key,
    team_id        bigint       not null references team (id),
    play_date      date         not null,
    game_type      varchar(16)  not null,
    winners_target integer      not null,
    practice       boolean      not null,
    vote_bomb      integer      not null,
    vote_balloon   integer      not null,
    started_at     timestamptz  not null,
    ended_at       timestamptz
);

create index game_session_team_date_idx on game_session (team_id, play_date);

-- 연속 판의 한 판: 당첨자와 터질 때 들고 있던 시간
create table game_round (
    id         bigserial    primary key,
    session_id bigint       not null references game_session (id) on delete cascade,
    seq        integer      not null,
    loser_id   uuid         not null references player (id),
    held_ms    bigint       not null,
    ended_at   timestamptz  not null
);

create index game_round_session_idx on game_round (session_id);
create index game_round_loser_idx on game_round (loser_id);

-- 그 판에 참가한 사람
create table game_round_player (
    round_id  bigint not null references game_round (id) on delete cascade,
    player_id uuid   not null references player (id),
    primary key (round_id, player_id)
);
