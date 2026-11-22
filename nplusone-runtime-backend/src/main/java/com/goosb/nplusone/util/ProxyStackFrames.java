package com.goosb.nplusone.util;

import java.util.List;
import java.util.regex.Pattern;

/** Recognizes specific generated proxy names without changing captured traces. */
public final class ProxyStackFrames {

    private static final Pattern SPRING_CGLIB = Pattern.compile(".+\\$\\$SpringCGLIB\\$\\$[0-9]+");
    private static final Pattern JDK_PROXY = Pattern.compile("\\$Proxy[0-9]+");

    private ProxyStackFrames() {
    }

    public static List<String> find(
            String stackTrace) {
        if(stackTrace == null || stackTrace.isBlank()) {
            return List.of();
        }
        return stackTrace.lines()
                .map(String::trim)
                .map(frame -> frame.startsWith("at ") ? frame.substring(3).stripLeading() : frame)
                .filter(ProxyStackFrames::isProxyFrame)
                .distinct()
                .toList();
    }

    private static boolean isProxyFrame(
            String frame) {
        int location = frame.indexOf('(');
        if(location < 0) {
            return false;
        }
        String function = frame.substring(0, location);
        int method = function.lastIndexOf('.');
        if(method < 0) {
            return false;
        }
        String owner = function.substring(0, method);
        int separator = Math.max(owner.lastIndexOf('.'), owner.lastIndexOf('/'));
        String simpleName = owner.substring(separator + 1);
        return SPRING_CGLIB.matcher(simpleName).matches() || JDK_PROXY.matcher(simpleName).matches();
    }
}
