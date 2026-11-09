-- M7 경쟁 존: 부스 4개 투표 수, 경쟁 게임 점수 (내기 + 혼자 연습)
alter table game_session add column vote_stop integer not null default 0;
alter table game_session add column vote_tower integer not null default 0;

create table skill_score (
    id          bigserial         primary key,
    team_id     bigint            not null references team (id),
    player_id   uuid              not null references player (id),
    game_type   varchar(16)       not null,
    -- 10초 멈추기: 10초와의 차이(ms, 작을수록 좋음) / 탑 쌓기: 층 수(클수록 좋음)
    score       double precision  not null,
    -- 탑 쌓기: 마지막 블록 폭(0~1). 같은 층이면 넓은 쪽이 위
    extra       double precision,
    -- 혼자 연습이면 true, 내기 중이면 false (session_id 있음)
    solo        boolean           not null,
    session_id  bigint            references game_session (id) on delete set null,
    played_at   timestamptz       not null
);

create index skill_score_team_game_idx on skill_score (team_id, game_type);
create index skill_score_player_game_idx on skill_score (player_id, game_type);
