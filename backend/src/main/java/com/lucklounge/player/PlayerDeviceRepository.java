package com.lucklounge.player;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PlayerDeviceRepository extends JpaRepository<PlayerDevice, String> {

    @Query("select d from PlayerDevice d join fetch d.player p join fetch p.team where d.tokenHash = :tokenHash")
    Optional<PlayerDevice> findWithPlayer(String tokenHash);
}
