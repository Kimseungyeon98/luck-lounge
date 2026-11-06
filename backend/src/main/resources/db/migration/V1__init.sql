-- 팀: 링크 주소(slug)가 곧 입장 권한이라 추측하기 어려운 무작위 문자열을 쓴다.
create table team (
    id         bigserial    primary key,
    slug       varchar(16)  not null unique,
    name       varchar(40)  not null,
    created_at timestamptz  not null
);

-- 플레이어: 닉네임은 바뀔 수 있고, 기록은 id 기준으로 이어진다.
create table player (
    id              uuid         primary key,
    team_id         bigint       not null references team (id),
    nickname        varchar(12)  not null,
    character_index integer      not null,
    created_at      timestamptz  not null,
    last_seen_at    timestamptz  not null
);

-- 같은 팀 안에서 닉네임은 대소문자 구분 없이 하나만.
create unique index player_team_nickname_uq on player (team_id, lower(nickname));

-- 기기 토큰: 한 사람이 카톡 안 브라우저, Safari 등 여러 기기/브라우저를 쓸 수 있다.
-- 원문 토큰은 휴대폰에만 있고 DB에는 SHA-256 해시만 저장한다.
create table player_device (
    token_hash   varchar(64)  primary key,
    player_id    uuid         not null references player (id) on delete cascade,
    created_at   timestamptz  not null,
    last_seen_at timestamptz  not null
);

create index player_device_player_idx on player_device (player_id);
