package com.lucklounge.player;

import com.lucklounge.team.Team;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PlayerRepository extends JpaRepository<Player, UUID> {

    Optional<Player> findByIdAndTeam(UUID id, Team team);

    List<Player> findByTeamOrderByLastSeenAtDesc(Team team);

    @Query("""
            select count(p) > 0 from Player p
            where p.team = :team and lower(p.nickname) = lower(:nickname)
              and (:exceptId is null or p.id <> :exceptId)
            """)
    boolean nicknameTaken(Team team, String nickname, UUID exceptId);
}
