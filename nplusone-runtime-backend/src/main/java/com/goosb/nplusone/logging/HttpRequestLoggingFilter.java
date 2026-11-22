package com.goosb.nplusone.logging;

import com.goosb.nplusone.common.message.Info;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.concurrent.ThreadLocalRandom;

@Component
public class HttpRequestLoggingFilter extends OncePerRequestFilter {

    private static final String REQUEST_ID_KEY_NAME = MDCKey.REQUEST_ID.getKeyName();
    private static final String CONTEXT_KEY_NAME = MDCKey.CONTEXT.getKeyName();

    private static final ThreadLocalRandom RANDOM = ThreadLocalRandom.current();

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        long startMillis = System.currentTimeMillis();
        try {
            String requestId = "%08x".formatted(RANDOM.nextInt());
            MDC.put(REQUEST_ID_KEY_NAME, requestId);
            MDC.put(CONTEXT_KEY_NAME, "[http-request] [%s] [%s %s]".formatted(
                    requestId, request.getMethod(), request.getRequestURI()));
            logger.info(Info.REQUEST_RECEIVED.getMessage());

            filterChain.doFilter(request, response);
        }
        finally {
            long durationMillis = System.currentTimeMillis() - startMillis;
            logger.info(Info.REQUEST_FINISHED_STATUS_A_DURATION_B.getMessage().formatted(response.getStatus(), durationMillis));
            MDC.clear();
        }
    }
}
