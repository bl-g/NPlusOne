package com.goosb.nplusone.exception;

import java.util.List;

public class RequestValidationException extends RuntimeException {

    private final List<String> errors;

    public RequestValidationException(
            List<String> errors) {
        super(String.join(", ", errors));
        this.errors = List.copyOf(errors);
    }

    public List<String> validationErrors() {
        return errors;
    }
}