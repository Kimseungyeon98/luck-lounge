package com.lucklounge;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class LuckLoungeApplication {

    public static void main(String[] args) {
        SpringApplication.run(LuckLoungeApplication.class, args);
    }
}
