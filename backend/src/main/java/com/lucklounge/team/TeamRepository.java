package com.lucklounge.team;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamRepository extends JpaRepository<Team, Long> {

    Optional<Team> findBySlug(String slug);

    Optional<Team> findByCode(String code);

    boolean existsBySlug(String slug);

    boolean existsByCode(String code);

    long countByCreatedByAndCreatedAtAfter(String createdBy, Instant after);
}
