package com.lucklounge.player;

import com.lucklounge.team.Team;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "player")
public class Player {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Column(nullable = false, length = 12)
    private String nickname;

    @Column(name = "character_index", nullable = false)
    private int characterIndex;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    protected Player() {
    }

    public Player(Team team, String nickname, int characterIndex, Instant now) {
        this.id = UUID.randomUUID();
        this.team = team;
        this.nickname = nickname;
        this.characterIndex = characterIndex;
        this.createdAt = now;
        this.lastSeenAt = now;
    }

    void enter(String nickname, int characterIndex, Instant now) {
        this.nickname = nickname;
        this.characterIndex = characterIndex;
        this.lastSeenAt = now;
    }

    public UUID getId() {
        return id;
    }

    public Team getTeam() {
        return team;
    }

    public String getNickname() {
        return nickname;
    }

    public int getCharacterIndex() {
        return characterIndex;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }
}
