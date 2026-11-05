package com.lucklounge.team;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamRepository extends JpaRepository<Team, Long> {

    Optional<Team> findBySlug(String slug);

    boolean existsBySlug(String slug);
}
