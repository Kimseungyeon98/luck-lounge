package com.lucklounge.player;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

/** 휴대폰(브라우저) 하나에 발급한 입장 토큰. 원문은 저장하지 않는다. */
@Entity
@Table(name = "player_device")
public class PlayerDevice {

    @Id
    @Column(name = "token_hash", length = 64)
    private String tokenHash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id", nullable = false)
    private Player player;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    protected PlayerDevice() {
    }

    PlayerDevice(String tokenHash, Player player, Instant now) {
        this.tokenHash = tokenHash;
        this.player = player;
        this.createdAt = now;
        this.lastSeenAt = now;
    }

    void touch(Instant now) {
        this.lastSeenAt = now;
    }

    public Player getPlayer() {
        return player;
    }
}
