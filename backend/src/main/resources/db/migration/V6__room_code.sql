-- 방 코드: 고정 주소에서 입력해 들어오는 6자리(대문자+숫자, 헷갈리는 I·O·0·1 제외).
-- 내부 열쇠(slug)는 그대로 두어 기기 토큰·기록이 바뀌지 않는다. 화면과 입장에는 code 만 쓴다.
alter table team add column code varchar(6);
-- 누가 만든 방인지(같은 기기 하루 3개 제한용). 기기 열쇠의 SHA-256 해시만 저장한다. 기존 팀은 비어 있음
alter table team add column created_by varchar(64);

do $$
declare
    t record;
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    c text;
    r bytea;
begin
    for t in select id from team where code is null loop
        loop
            -- gen_random_uuid 는 암호학적 난수. 버전 비트가 없는 앞 6바이트만 쓴다 (256 % 32 = 0 이라 치우침 없음)
            r := uuid_send(gen_random_uuid());
            c := '';
            for i in 0..5 loop
                c := c || substr(alphabet, 1 + get_byte(r, i) % 32, 1);
            end loop;
            exit when not exists (select 1 from team where code = c);
        end loop;
        update team set code = c where id = t.id;
    end loop;
end $$;

alter table team alter column code set not null;
create unique index team_code_uq on team (code);
create index team_created_by_idx on team (created_by, created_at);
