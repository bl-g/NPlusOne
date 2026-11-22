package com.goosb.nplusone.exception;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.common.message.Debug;
import com.goosb.nplusone.logging.MDCKey;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.util.DisconnectedClientHelper;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

@RestControllerAdvice
public class RestExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(RestExceptionHandler.class);
    
    private static final String REQUEST_ID_KEY_NAME = MDCKey.REQUEST_ID.getKeyName();

    public record ErrorResponse(
            String message,
            List<String> errors,
            String requestId) {
    }

    @ExceptionHandler(RequestValidationException.class)
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    public ErrorResponse handleRequestValidationException(
            RequestValidationException e) {
        logger.debug(Debug.CLIENT_PROVIDED_INVALID_REQUEST_BODY.getMessage(), e);

        return new ErrorResponse("Invalid request body", e.validationErrors(), getRequestId());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleInvalidRequestParameter(
            MethodArgumentTypeMismatchException e) {
        return new ErrorResponse("Invalid request parameter",
                List.of("Invalid value for parameter " + e.getName()), getRequestId());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatusException(
            ResponseStatusException e,
            HttpServletRequest request,
            HttpServletResponse response) {
        if(response.isCommitted()) {
            return null;
        }

        if(isEventStream(request, response)) {
            return ResponseEntity
                    .status(e.getStatusCode())
                    .headers(e.getHeaders())
                    .build();
        }

        String reason = e.getReason();
        String message = isBlank(reason) ? e.getBody().getTitle() : reason;
        return ResponseEntity
                .status(e.getStatusCode())
                .headers(e.getHeaders())
                .body(new ErrorResponse(message, List.of(), getRequestId()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(
            Exception e,
            HttpServletRequest request,
            HttpServletResponse response) {
        boolean isEventStream = isEventStream(request, response);
        if(isClientDisconnect(e, isEventStream)) {
            logger.debug(Debug.CLIENT_DISCONNECTED.getMessage(), e);
            // Tomcat completes the failed async response; do not write or flush it again from the exception handler
            return null;
        }

        logger.error(Error.UNEXPECTED_ERROR.getMessage(), e);
        if(response.isCommitted()) {
            return null;
        }

        if(isEventStream) {
            return ResponseEntity
                    .internalServerError()
                    .build();
        }

        String message = e.getMessage();
        List<String> messages = isBlank(message) ? List.of() : List.of(message);
        return ResponseEntity
                .internalServerError()
                .body(new ErrorResponse(Error.UNEXPECTED_ERROR.getMessage(), messages, getRequestId()));
    }

    private static boolean isEventStream(
            HttpServletRequest request,
            HttpServletResponse response) {
        String contentType = response.getContentType();
        if(contentType != null && MediaType.TEXT_EVENT_STREAM_VALUE.equalsIgnoreCase(contentType.split(";", 2)[0].trim())) {
            return true;
        }

        Object types = request.getAttribute(HandlerMapping.PRODUCIBLE_MEDIA_TYPES_ATTRIBUTE);
        if(types instanceof Set<?> mediaTypes && mediaTypes.contains(MediaType.TEXT_EVENT_STREAM)) {
            return true;
        }

        try {
            return MediaType.parseMediaTypes(request.getHeader(HttpHeaders.ACCEPT))
                    .stream()
                    .anyMatch(type -> !type.isWildcardType()
                            && !type.isWildcardSubtype()
                            && type.getQualityValue() > 0
                            && type.isCompatibleWith(MediaType.TEXT_EVENT_STREAM));
        }
        catch(IllegalArgumentException __) { // happens if invalid Accept header
            return false;
        }
    }

    private static boolean isClientDisconnect(
            Exception e,
            boolean isEventStream) {
        if(DisconnectedClientHelper.isClientDisconnectedException(e)) {
            return true;
        }

        /* Spring's #isClientDisconnectedException recognizes the enclosing Tomcat/async exceptions,
        but a final async dispatch can trigger just this Windows socket IOE */
        if(isEventStream && e instanceof IOException && e.getMessage() != null) {
            String message = e.getMessage().toLowerCase(Locale.ROOT);
            return message.contains("connection was aborted by the software in your host machine")
                    || message.contains("connection was forcibly closed by the remote host");
        }

        return false;
    }

    private static String getRequestId() {
        return MDC.get(REQUEST_ID_KEY_NAME);
    }
}
