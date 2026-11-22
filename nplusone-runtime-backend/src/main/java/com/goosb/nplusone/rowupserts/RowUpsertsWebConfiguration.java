package com.goosb.nplusone.rowupserts;

import com.goosb.nplusone.common.ConfigProperty;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class RowUpsertsWebConfiguration implements WebMvcConfigurer {

    private final String frontendOrigin;

    public RowUpsertsWebConfiguration(
            Environment environment) {
        this.frontendOrigin = environment.getProperty(ConfigProperty.FRONTEND_ORIGIN.getName(), "http://localhost:8082");
    }

    @Override
    public void addCorsMappings(
            CorsRegistry registry) {
        registry.addMapping("/api/rows/**")
                .allowedOrigins(frontendOrigin)
                .allowedMethods("GET");
    }
}
