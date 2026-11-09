-- M8: 사다리 타기, 과녁 멈추기 부스 투표 수
alter table game_session add column vote_ladder integer not null default 0;
alter table game_session add column vote_target integer not null default 0;
