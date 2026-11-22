package com.goosb.nplusone;

import com.goosb.nplusone.common.message.Info;
import io.grpc.Grpc;
import io.grpc.InsecureServerCredentials;
import io.grpc.Server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.goosb.nplusone.common.ConfigProperty;
import org.springframework.core.env.Environment;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.io.IOException;

@SpringBootApplication
public class NPlusOneApplication {

    private static final Logger logger = LoggerFactory.getLogger(NPlusOneApplication.class);

    public static void main(
            String[] args) {
        SpringApplication.run(NPlusOneApplication.class, args);
    }

    @Bean(destroyMethod = "shutdown")
    public Server otlpGrpcServer(
            NPlusOneTraceService traceService,
            Environment environment) throws IOException {
        int port = environment.getProperty(ConfigProperty.OTLP_PORT.getName(), Integer.class, 4317);
        // plaintext gRPC since v0.1.0-beta.1 is intended for local deployment
        Server server = Grpc.newServerBuilderForPort(port, InsecureServerCredentials.create())
                .addService(traceService)
                .build();
        server.start();
        logger.info(Info.ACCEPTING_OTEL_TRACES_ON_PORT_A.getMessage(), server.getPort());
        return server;
    }
}
