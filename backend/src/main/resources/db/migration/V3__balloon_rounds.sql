-- 풍선 불기 판: 터질 때의 펌프질 횟수와 숨은 한계 (시한폭탄 판은 비어 있음)
alter table game_round add column pump_count integer;
alter table game_round add column pump_limit integer;
