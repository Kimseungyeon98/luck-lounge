package com.lucklounge.team;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "team")
public class Team {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 16)
    private String slug;

    /** 고정 주소에서 입력하는 방 코드 (6자리, 대문자+숫자) */
    @Column(nullable = false, unique = true, length = 6)
    private String code;

    @Column(nullable = false, length = 40)
    private String name;

    /** 만든 기기 열쇠의 해시 (하루 생성 제한용). 서버가 만든 기본 팀은 null */
    @Column(name = "created_by", length = 64)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Team() {
    }

    public Team(String slug, String code, String name, String createdBy, Instant createdAt) {
        this.slug = slug;
        this.code = code;
        this.name = name;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getSlug() {
        return slug;
    }

    public String getCode() {
        return code;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public String getName() {
        return name;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
