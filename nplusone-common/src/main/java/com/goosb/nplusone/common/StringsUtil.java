package com.goosb.nplusone.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import com.goosb.nplusone.common.message.Error;

public final class StringsUtil {

    private static final String SHA_256 = "SHA-256";

    private StringsUtil() {
        // util class
    }

    /**
     * @return a SHA-256-based ID for the given stack trace, truncated to 96 bits (returned as 24 hexadecimal chars)
     */
    public static String hash(
            String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        byte[] hashBytes = createSha256Digest().digest(bytes);
        return HexFormat.of().formatHex(hashBytes, 0, 12);
    }

    private static MessageDigest createSha256Digest() {
        try {
            return MessageDigest.getInstance(SHA_256);
        }
        catch(NoSuchAlgorithmException e) {
            throw new IllegalStateException(Error.UNSUPPORTED_ALGO_A.format(SHA_256), e);
        }
    }

    public static boolean isBlank(
            String string) {
        return string == null || string.isBlank();
    }
}
