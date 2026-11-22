package com.goosb.nplusone.util;

import com.goosb.nplusone.common.message.Error;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

public final class EncodingUtil {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    private EncodingUtil() {
        // util class
    }

    public static String toBase64(
            Object object) {
        try {
            String json = OBJECT_MAPPER.writeValueAsString(object);
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(json.getBytes(StandardCharsets.UTF_8));
        }
        catch(Exception exception) {
            throw new IllegalArgumentException(Error.CANNOT_BASE64_ENCODE_A.format(object), exception);
        }
    }

    @SafeVarargs
    public static <T> T fromBase64(
            String base64,
            T... dontUse) {
        try {
            String json = new String(Base64.getUrlDecoder().decode(base64), StandardCharsets.UTF_8);
            @SuppressWarnings("unchecked")
            Class<T> expectedType = (Class<T>) dontUse.getClass().getComponentType();
            return OBJECT_MAPPER.readValue(json, expectedType);
        }
        catch(Exception exception) {
            throw new IllegalArgumentException(Error.CANNOT_BASE64_DECODE_A.format(base64), exception);
        }
    }
}
